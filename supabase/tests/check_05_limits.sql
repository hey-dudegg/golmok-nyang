-- check_05_limits.sql: [05] 도배 한도·글·댓글 필터(05_moderation.sql, board_write 를 켠 상태)
-- 단독 실행: SQL Editor 에 이 파일 하나만 통째로 붙여 넣는다(공통 준비·결과 출력 포함, 다른 check 파일과 독립).
-- 전제: 01_base·02_members·03_board·04_names·05_moderation 를 실행한 뒤. gn_test 스키마·가짜 계정을 만들고 시험한 뒤 일부러 오류를 내 모두 되돌리므로 아무것도 남지 않는다.
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
  insert into gn_test.ids values ('rp1', gen_random_uuid()), ('rp2', gen_random_uuid()), ('rp3', gen_random_uuid());   -- 신고 시험용 익명 3명(who 가 anon 으로 시작하지 않게)
  insert into auth.users (id, aud, role, is_anonymous) select uid, 'authenticated', 'authenticated', true from gn_test.ids where who like 'rp%';
  -- 준비: 회원 mem1 (02 절의 가입·닉네임 변경 결과와 같은 상태, 결과 항목 아님)
  perform gn_test.as_user('mem1', false);
  insert into public.members (uid, nick, age_ok, terms_ver) values (gn_test.uid('mem1'), 'new', true, '2026-10');
  perform gn_test.back();
  -- 준비: mem1 의 글 'hello' (03 절과 같은 상태, 결과 항목 아님)
  update public.app_config set value = '{"login":false,"board_write":true,"names_anon":true}' where key = 'features';
  perform gn_test.as_user('mem1', false);
  insert into public.posts (uid, body) values (gn_test.uid('mem1'), 'hello');
  perform gn_test.back();
  update public.app_config set value = '{"login":false,"board_write":false,"names_anon":true}' where key = 'features';

  -- 도배(기본 한도로 되돌려 시험: 같은 시각에 쓴 행이 간격·횟수에 걸린다)
  update public.app_config set value = '{"post":{"gap_s":30,"per10m":3,"per1h":6,"dup_h":24},"comment":{"gap_s":10,"per10m":10,"per1h":30,"dup_h":1},"name":{"gap_s":5,"per10m":10,"per1h":20},"nick":{"per1h":3}}' where key = 'limits';
  perform gn_test.as_user('rp1', true);
  perform gn_test.allowed('05 도배: 첫 제안 허용', $$insert into public.names2 (region, name, uid) values ('28', 'R1', gn_test.uid('rp1'))$$);
  perform gn_test.raises('05 도배: 5초 안 연속 제안 거부', $$insert into public.names2 (region, name, uid) values ('28', 'R2', gn_test.uid('rp1'))$$, 'rate_limit');
  perform gn_test.back();
  perform gn_test.as_user('rp2', true);
  perform gn_test.denied('05 같은 지역 같은 이름(고유 인덱스, 화면 dup)', $$insert into public.names2 (region, name, uid) values ('28', 'r1', gn_test.uid('rp2'))$$);
  perform gn_test.back();
  update public.app_config set value = '{"name":{"gap_s":0,"per10m":1,"per1h":20}}' where key = 'limits';
  perform gn_test.as_user('rp1', true);
  perform gn_test.raises('05 도배: 10분당 한도', $$insert into public.names2 (region, name, uid) values ('28', 'R3', gn_test.uid('rp1'))$$, 'rate_limit');
  perform gn_test.back();
  update public.app_config set value = '{"name":{"gap_s":0,"per10m":10,"per1h":1}}' where key = 'limits';
  perform gn_test.as_user('rp1', true);
  perform gn_test.raises('05 도배: 1시간당 한도', $$insert into public.names2 (region, name, uid) values ('28', 'R4', gn_test.uid('rp1'))$$, 'rate_limit');
  perform gn_test.back();
  update public.app_config set value = '{"post":{"gap_s":0,"per10m":1000,"per1h":1000,"dup_h":0},"comment":{"gap_s":0,"per10m":1000,"per1h":1000,"dup_h":0},"name":{"gap_s":0,"per10m":1000,"per1h":1000},"nick":{"per1h":1000}}' where key = 'limits';
  delete from public.filter_words;

  -- ===== [05b] 글·댓글 필터·도배 (board_write 를 켠 상태). 기본 한도로 되돌려 시험하고 다시 풀어 둔다 =====
  update public.app_config set value = '{"login":false,"board_write":true,"names_anon":true}' where key = 'features';
  update public.app_config set value = '{"post":{"gap_s":30,"per10m":3,"per1h":6,"dup_h":24},"comment":{"gap_s":10,"per10m":10,"per1h":30,"dup_h":1},"name":{"gap_s":5,"per10m":10,"per1h":20},"nick":{"per1h":3}}' where key = 'limits';
  perform gn_test.as_user('mem1', false);
  perform gn_test.raises('05 재개: 글에 링크 거부', format($$insert into public.posts (uid, body) values (%L, 'http://x.invalid')$$, gn_test.uid('mem1')), 'filter_url');
  perform gn_test.raises('05 재개: 댓글에 연락처 거부', $$insert into public.post_comments (post_id, uid, body) select id, uid, '010-1234-5678' from public.posts where uid = gn_test.uid('mem1') limit 1$$, 'filter_contact');
  perform gn_test.raises('05 재개: 글 간격 거부(30초)', format($$insert into public.posts (uid, body) values (%L, 'next')$$, gn_test.uid('mem1')), 'rate_limit');
  perform gn_test.back();
  update public.app_config set value = '{"post":{"gap_s":0,"per10m":1000,"per1h":1000,"dup_h":24},"comment":{"gap_s":0,"per10m":1000,"per1h":1000,"dup_h":1}}' where key = 'limits';
  perform gn_test.as_user('mem1', false);
  perform gn_test.raises('05 재개: 같은 본문 반복 거부(dup)', format($$insert into public.posts (uid, body) values (%L, ' B A C K ')$$, gn_test.uid('mem1')), 'dup');
  perform gn_test.back();
  update public.app_config set value = '{"post":{"gap_s":0,"per10m":1000,"per1h":1000,"dup_h":0},"comment":{"gap_s":0,"per10m":1000,"per1h":1000,"dup_h":0},"name":{"gap_s":0,"per10m":1000,"per1h":1000},"nick":{"per1h":1000}}' where key = 'limits';
  update public.app_config set value = '{"login":false,"board_write":false,"names_anon":true}' where key = 'features';


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
