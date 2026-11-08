-- check_05_filter.sql: [05] 공통 벡터·이름 필터(05_moderation.sql). 벡터는 tests/filter_cases.json 에서 만든 것(tests/unit/filter.test.mjs 가 일치를 확인)
-- 단독 실행: SQL Editor 에 이 파일 하나만 통째로 붙여 넣는다(공통 준비·결과 출력 포함, 다른 check 파일과 독립).
-- 전제: 01_base·02_members·04_names·05_moderation 를 실행한 뒤. gn_test 스키마·가짜 계정을 만들고 시험한 뒤 일부러 오류를 내 모두 되돌리므로 아무것도 남지 않는다.
-- 결과: 마지막 표의 result 열이 전부 PASS 이면 통과. FAIL·"중단:" 줄은 그 줄(name)을 그대로 알려 준다.
-- 공통 준비(헬퍼·가짜 계정·결과 출력)는 check_*.sql 이 같은 내용으로 갖는다. 고치면 모든 파일에 같이 고친다(D-108).
-- [미확인] auth.users 에 가짜 행을 넣을 때 필수 열이 더 있으면 "가짜 계정" 부분만 고친다(실제 uid·주소는 쓰지 않는다).
do $main$
declare r text; c text;
begin
  begin
  create schema gn_test;
  create table gn_test.res (n serial, name text, result text);
  create table gn_test.ids (who text primary key, uid uuid);

  -- 도우미: 결과 기록·uid 찾기는 소유자 권한(security definer)으로 돌아 역할을 바꿔도 표 권한·RLS 와 무관하다
  create function gn_test.rec(p_name text, p_ok boolean) returns void language sql security definer set search_path = '' as
  $$ insert into gn_test.res (name, result) values (p_name, case when p_ok then 'PASS' else 'FAIL' end) $$;
  create function gn_test.uid(p_who text) returns uuid language sql stable security definer set search_path = '' as
  $$ select uid from gn_test.ids where who = p_who $$;
  -- 로그인 흉내 / 되돌리기 (호출자 권한)
  create function gn_test.as_user(p_who text, p_anon boolean) returns void language plpgsql as $$
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', gn_test.uid(p_who), 'role', 'authenticated', 'is_anonymous', p_anon)::text, true);
    execute 'set local role authenticated';
  end $$;
  create function gn_test.back() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
  -- sql 을 실행해서 예외가 나야 PASS (호출자 권한으로 실행)
  create function gn_test.denied(p_name text, p_sql text) returns void language plpgsql as $$
  begin
    begin execute p_sql; perform gn_test.rec(p_name, false);
    exception when others then perform gn_test.rec(p_name, true); end;
  end $$;
  -- sql 이 예외 없이 끝나야 PASS
  create function gn_test.allowed(p_name text, p_sql text) returns void language plpgsql as $$
  begin
    begin execute p_sql; perform gn_test.rec(p_name, true);
    exception when others then perform gn_test.rec(p_name || ' (' || sqlerrm || ')', false); end;
  end $$;
  -- sql 을 실행해서 지정한 오류 메시지(raise exception 의 코드)가 나야 PASS
  create function gn_test.raises(p_name text, p_sql text, p_msg text) returns void language plpgsql as $$
  begin
    begin execute p_sql; perform gn_test.rec(p_name, false);
    exception when others then perform gn_test.rec(p_name || ' (' || sqlerrm || ')', sqlerrm = p_msg); end;
  end $$;
  -- 한 값을 돌려주는 sql 이 기대한 문자열과 같아야 PASS (예외도 FAIL)
  create function gn_test.eq(p_name text, p_sql text, p_want text) returns void language plpgsql as $$
  declare v text;
  begin
    begin execute p_sql into v; perform gn_test.rec(p_name, v is not distinct from p_want);
    exception when others then perform gn_test.rec(p_name || ' (' || sqlerrm || ')', false); end;
  end $$;
  grant usage on schema gn_test to public;
  grant execute on all functions in schema gn_test to public;

  -- 가짜 계정: 익명 2, 회원 1, 어드민 1 (uid 는 무작위로 만들어 이 블록에서만 쓴다)
  insert into gn_test.ids values ('anon1', gen_random_uuid()), ('anon2', gen_random_uuid()), ('mem1', gen_random_uuid()), ('adm1', gen_random_uuid());
  insert into auth.users (id, aud, role, is_anonymous)
    select uid, 'authenticated', 'authenticated', who like 'anon%' from gn_test.ids;
  insert into public.admins (uid) select uid from gn_test.ids where who = 'adm1';

  update public.app_config set value = '{"login":false,"board_write":false,"names_anon":true}' where key = 'features';
  update public.app_config set value = '"2026-10"' where key = 'terms_ver';
  update public.app_config set value = '{"post":3,"comment":3,"name":3}' where key = 'report_hide';
  -- 도배 한도는 일부러 풀어 둔다(시험이 한 트랜잭션 안에서 연달아 쓰므로). 도배는 check_05_limits.sql 이 기본값으로 따로 시험한다.
  update public.app_config set value = '{"post":{"gap_s":0,"per10m":1000,"per1h":1000,"dup_h":0},"comment":{"gap_s":0,"per10m":1000,"per1h":1000,"dup_h":0},"name":{"gap_s":0,"per10m":1000,"per1h":1000},"nick":{"per1h":1000}}' where key = 'limits';
  delete from public.filter_words;
  insert into public.filter_words (word) values ('테스트금칙');
  create function gn_test.vec(p_name text, p_kind text, p_txt text, p_code text) returns void language plpgsql as $$
  begin
    begin perform public.gn_text_check(p_kind, p_txt); perform gn_test.rec(p_name, p_code is null);
    exception when others then perform gn_test.rec(p_name || ' (' || sqlerrm || ')', sqlerrm = p_code); end;
  end $$;

  -- 공통 벡터: tests/filter_cases.json 에서 만든 것(앱 core/text_filter.js 와 같은 결과여야 한다)
  perform gn_test.vec('05 벡터 막기 ' || n, kind, txt, code) from (values
    (1, 'post', $v$http://example.invalid$v$, 'filter_url'),
    (2, 'post', $v$https://a.b/c 로 오세요$v$, 'filter_url'),
    (3, 'post', $v$www.example 에서 봐요$v$, 'filter_url'),
    (4, 'post', $v$놀러 오세요 abc.com$v$, 'filter_url'),
    (5, 'post', $v$spam-shop.net 에서 팔아요$v$, 'filter_url'),
    (6, 'post', $v$bit.ly 로 들어와요$v$, 'filter_url'),
    (7, 'post', $v$여기 z.kr$v$, 'filter_url'),
    (8, 'post', $v$여기 x.co$v$, 'filter_url'),
    (9, 'post', $v$점컴으로 와요$v$, 'filter_url'),
    (10, 'post', $v$주소는 닷컴$v$, 'filter_url'),
    (11, 'post', $v$open.kakao.com/o/abc$v$, 'filter_url'),
    (12, 'post', $v$Ｈｔｔｐ://ａ.ｃｏｍ$v$, 'filter_url'),
    (13, 'post', $v$구경 A.COM$v$, 'filter_url'),
    (14, 'post', $v$my-site.xyz$v$, 'filter_url'),
    (15, 'post', $v$ex​ample.com$v$, 'filter_url'),
    (16, 'comment', $v$get.app 받아요$v$, 'filter_url'),
    (17, 'post', $v$010-1234-5678$v$, 'filter_contact'),
    (18, 'post', $v$010 1234 5678 로 연락$v$, 'filter_contact'),
    (19, 'post', $v$공일공 일이삼사 오육칠팔$v$, 'filter_contact'),
    (20, 'post', $v$01012345678$v$, 'filter_contact'),
    (21, 'post', $v$02-123-4567$v$, 'filter_contact'),
    (22, 'post', $v$010​1234​5678$v$, 'filter_contact'),
    (23, 'post', $v$test@example.invalid$v$, 'filter_contact'),
    (24, 'post', $v$내 메일은 골뱅이 지메일$v$, 'filter_contact'),
    (25, 'post', $v$카톡 abcd1234$v$, 'filter_contact'),
    (26, 'post', $v$카톡 아이디: hong_gil$v$, 'filter_contact'),
    (27, 'post', $v$카카오톡 id abc_def$v$, 'filter_contact'),
    (28, 'post', $v$ㅋㅌ abcd$v$, 'filter_contact'),
    (29, 'post', $v$오픈채팅 gol1234$v$, 'filter_contact'),
    (30, 'post', $v$텔레 tele_1234$v$, 'filter_contact'),
    (31, 'post', $v$텔레그램 @golmok$v$, 'filter_contact'),
    (32, 'post', $v$인스타 golmok_nyang$v$, 'filter_contact'),
    (33, 'comment', $v$dm me_please$v$, 'filter_contact'),
    (34, 'post', $v$line cat1234$v$, 'filter_contact'),
    (35, 'post', $v$@golmok_cat$v$, 'filter_contact'),
    (36, 'name', $v$냥!!$v$, 'filter_chars'),
    (37, 'name', $v$냥<b>$v$, 'filter_chars'),
    (38, 'name', $v$고양이_1$v$, 'filter_chars'),
    (39, 'name', $v$ㅋㅋ$v$, 'filter_chars'),
    (40, 'name', $v$이름​$v$, 'filter_chars'),
    (41, 'name', $v$a.com$v$, 'filter_chars'),
    (42, 'nick', $v$닉네임*$v$, 'filter_chars')
  ) as t(n, kind, txt, code);
  perform gn_test.vec('05 벡터 통과 ' || n, kind, txt, null) from (values
    (1, 'post', $v$오늘도 골목 고양이를 만났어요$v$),
    (2, 'post', $v$3마리 있었어요$v$),
    (3, 'post', $v$2024년 11월 8일에 찍었어요$v$),
    (4, 'post', $v$가격은 5000원이래요$v$),
    (5, 'post', $v$치즈냥이 귀여워요$v$),
    (6, 'post', $v$저녁 7시 30분쯤 나와요$v$),
    (7, 'post', $v$1234 번지 앞 골목$v$),
    (8, 'post', $v$비가 와요 ㅠㅠ$v$),
    (9, 'post', $v$ㅋㅋㅋ 너무 웃겨요$v$),
    (10, 'post', $v$냥냥!$v$),
    (11, 'post', $v$사진 잘 찍으셨네요~$v$),
    (12, 'post', $v$이 길은 3.5km 정도예요$v$),
    (13, 'post', $v$버스 273번 타고 왔어요$v$),
    (14, 'post', $v$airline tickets 이야기가 아니에요$v$),
    (15, 'post', $v$online shopping 말고 산책$v$),
    (16, 'post', $v$카톡 해요$v$),
    (17, 'post', $v$카톡으로 이야기해요$v$),
    (18, 'post', $v$dm 보냈어요$v$),
    (19, 'post', $v$line은 좋아요$v$),
    (20, 'post', $v$e-mail 말고 직접 말해요$v$),
    (21, 'post', $v$A.B 코스로 걸었어요$v$),
    (22, 'post', $v$공부 열심히 해요$v$),
    (23, 'post', $v$공일 이삼 사$v$),
    (24, 'post', $v$이름은 mr.kim 이래요$v$),
    (25, 'post', $v$아침 6시 15분 12초$v$),
    (26, 'post', $v$5.5.5 번 출구 앞$v$),
    (27, 'post', $v$햇살이 좋아서 낮잠 자요$v$),
    (28, 'post', $v$간식을 줬더니 좋아해요$v$),
    (29, 'post', $v$Hello cats, nice to meet you$v$),
    (30, 'post', $v$우리 동네 시장 골목에 3마리, 공원에 2마리$v$),
    (31, 'comment', $v$귀여워요!$v$),
    (32, 'comment', $v$저도 봤어요 ㅎㅎ$v$),
    (33, 'name', $v$치즈$v$),
    (34, 'name', $v$Cheese$v$),
    (35, 'name', $v$골목 냥이$v$),
    (36, 'name', $v$냥1호$v$),
    (37, 'nick', $v$Mimi 2$v$)
  ) as t(n, kind, txt);
  perform gn_test.vec('05 금칙어(공백·기호로 띄워도)', 'post', '이건 테스트 금칙 이에요', 'filter_word');
  perform gn_test.vec('05 금칙어(기호로 붙임)', 'comment', '이건 테스트-금칙', 'filter_word');
  perform gn_test.as_user('anon1', true);
  perform gn_test.denied('05 익명 금칙어 목록 읽기 거부', 'select * from public.filter_words');
  perform gn_test.denied('05 익명 gn_text_check 직접 호출 거부', $$select public.gn_text_check('post', 'x')$$);
  -- 이름 제안 필터(트리거)
  perform gn_test.raises('05 이름에 금칙어 거부', format($$insert into public.names2 (region, name, uid) values ('27', '테스트금칙', %L)$$, gn_test.uid('anon1')), 'filter_word');
  perform gn_test.raises('05 이름에 기호 거부', format($$insert into public.names2 (region, name, uid) values ('27', 'a.com', %L)$$, gn_test.uid('anon1')), 'filter_chars');
  perform gn_test.raises('05 이름에 연락처 숫자말 거부', format($$insert into public.names2 (region, name, uid) values ('27', '공일공냥', %L)$$, gn_test.uid('anon1')), 'filter_contact');
  perform gn_test.back();

  -- 결과를 변수로 옮긴 뒤 일부러 오류를 내 위의 모든 변경을 되돌린다
  select string_agg(name || chr(31) || result, chr(30) order by n)
         || chr(30) || '== 합계: PASS ' || count(*) filter (where result = 'PASS') || ' / FAIL ' || count(*) filter (where result = 'FAIL') || chr(31)
    into r from gn_test.res;
  raise exception 'gn_undo';
  exception when others then
    if sqlerrm <> 'gn_undo' then
      get stacked diagnostics c = pg_exception_context;
      r := '중단: ' || sqlerrm || ' @ ' || left(replace(c, chr(10), ' / '), 300) || chr(31) || 'FAIL';
    end if;
  end;
  perform set_config('gn.check', coalesce(r, '중단: 결과 없음' || chr(31) || 'FAIL'), false);
end $main$;

-- ===== 결과 (SQL Editor 는 마지막 표만 보여 주므로 한 표로 낸다) =====
select split_part(x, chr(31), 1) as name, split_part(x, chr(31), 2) as result
from unnest(string_to_array(current_setting('gn.check'), chr(30))) with ordinality as t(x, n) order by n;
