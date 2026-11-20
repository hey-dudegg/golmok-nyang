-- check_box.sql: [10] 상자 놓기(10_box.sql 이 없으면 항목 0건)
-- 단독 실행: SQL Editor 에 이 파일 하나만 통째로 붙여 넣는다(공통 준비·결과 출력 포함, 다른 check 파일과 독립).
-- 전제: 01_base·02_members·05_moderation·08_realtime·10_box 를 실행한 뒤. gn_test 스키마·가짜 계정을 만들고 시험한 뒤 일부러 오류를 내 모두 되돌리므로 아무것도 남지 않는다.
-- 결과: 마지막 표의 result 열이 전부 PASS 이면 통과. FAIL·"중단:" 줄은 그 줄(name)을 그대로 알려 준다.
-- 한 트랜잭션이라 now() 가 고정이다: 만료는 box_clear(until=now())로 만든다. 방송(realtime.send)은 실패해도 놓기가 성공해야 하므로 sent 값은 보지 않는다.
-- 공통 준비(헬퍼·가짜 계정·결과 출력)는 check_*.sql 이 같은 내용으로 갖는다. 고치면 모든 파일에 같이 고친다(D-108).
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


  -- 가짜 계정: 익명 5, 어드민 1 (uid 는 무작위로 만들어 이 블록에서만 쓴다)
  insert into gn_test.ids values ('anon1', gen_random_uuid()), ('anon2', gen_random_uuid()), ('anon3', gen_random_uuid()), ('anon4', gen_random_uuid()), ('anon5', gen_random_uuid()), ('adm1', gen_random_uuid());
  insert into auth.users (id, aud, role, is_anonymous)
    select uid, 'authenticated', 'authenticated', who like 'anon%' from gn_test.ids;
  insert into public.admins (uid) select uid from gn_test.ids where who = 'adm1';

  update public.app_config set value = '{"login":false,"board_write":false,"names_anon":true}' where key = 'features';
  update public.app_config set value = '"2026-10"' where key = 'terms_ver';
  update public.app_config set value = '{"post":3,"comment":3,"name":3,"box":3}' where key = 'report_hide';
  -- limits 를 box 키 없이 덮어 기본값(hold_s 3600·per1d 6) 대체 경로도 함께 시험한다. 신고 시간당 한도는 기본 10(이 시험은 최대 3건).
  update public.app_config set value = '{"post":{"gap_s":0,"per10m":1000,"per1h":1000,"dup_h":0},"comment":{"gap_s":0,"per10m":1000,"per1h":1000,"dup_h":0},"name":{"gap_s":0,"per10m":1000,"per1h":1000},"nick":{"per1h":1000}}' where key = 'limits';
  delete from public.filter_words;
  insert into public.filter_words (word) values ('테스트금칙');
  -- 시험 도우미(소유자 권한): 상자 id·유지 시간·기록 수
  create function gn_test.bid(p_code text) returns uuid language sql security definer set search_path = '' as $$ select id from public.box_state where code = p_code $$;
  create function gn_test.dur(p_code text) returns text language sql security definer set search_path = '' as $$ select (until - placed_at)::text from public.box_state where code = p_code $$;
  create function gn_test.logn(p_who text) returns text language sql security definer set search_path = '' as $$ select count(*)::text from public.box_log where uid = gn_test.uid(p_who) $$;

  -- ===== [10] 상자 놓기 (10_box.sql 이 있을 때만) =====
  if to_regprocedure('public.box_place(text,text)') is not null then
    perform gn_test.as_user('anon1', true);
    perform gn_test.eq('10 첫 놓기 ok', $$select public.box_place('11', '냥이')->>'ok'$$, 'true');
    perform gn_test.back();
    perform gn_test.eq('10 유지 1시간(기본 hold_s)', $$select gn_test.dur('11')$$, '01:00:00');
    perform gn_test.as_user('anon2', true);
    perform gn_test.eq('10 다른 uid 같은 지역 busy', $$select public.box_place('11', '다른냥')->>'code'$$, 'busy');
    perform gn_test.eq('10 busy 에 until 포함', $$select (public.box_place('11', '다른냥')->>'until' is not null)::text$$, 'true');
    perform gn_test.back();
    perform gn_test.as_user('anon1', true);
    perform gn_test.eq('10 같은 uid 다른 지역 mine_active', $$select public.box_place('26', '냥이')->>'code'$$, 'mine_active');
    perform gn_test.allowed('10 자기 상자 신고(조용히 무시)', format($$select public.report('box', %L)$$, gn_test.bid('11')));
    perform gn_test.denied('10 표 직접 select 거부(box_state)', $$select * from public.box_state$$);
    perform gn_test.denied('10 표 직접 insert 거부(box_state)', format($$insert into public.box_state (code, holder, placed_at, until, seed, id, name) values ('26', %L, now(), now(), 1, gen_random_uuid(), 'x')$$, gn_test.uid('anon1')));
    perform gn_test.denied('10 표 직접 select 거부(box_log)', $$select * from public.box_log$$);
    perform gn_test.denied('10 표 직접 insert 거부(box_log)', format($$insert into public.box_log (uid, code) values (%L, '26')$$, gn_test.uid('anon1')));
    perform gn_test.eq('10 일반 사용자 box_clear 거부', $$select public.box_clear('11')->>'code'$$, 'forbidden');
    perform gn_test.back();
    perform gn_test.eq('10 자기 상자 신고는 세지 않음', $$select count(*)::text from public.reports where kind = 'box'$$, '0');
    perform gn_test.as_user('anon2', true);
    perform gn_test.eq('10 다른 지역은 다른 uid 가 놓기 ok', $$select public.box_place('26', '둘째냥')->>'ok'$$, 'true');
    perform gn_test.allowed('10 신고 1번째(anon2)', format($$select public.report('box', %L)$$, gn_test.bid('11')));
    perform gn_test.back();
    perform gn_test.as_user('anon3', true);
    perform gn_test.allowed('10 신고 2번째(anon3)', format($$select public.report('box', %L)$$, gn_test.bid('11')));
    perform gn_test.eq('10 2건까지는 이름 보임', $$select b->>'name' from jsonb_array_elements(public.box_list()->'boxes') b where b->>'code' = '11'$$, '냥이');
    perform gn_test.back();
    perform gn_test.as_user('anon4', true);
    perform gn_test.allowed('10 신고 3번째(anon4)', format($$select public.report('box', %L)$$, gn_test.bid('11')));
    perform gn_test.eq('10 3건이면 이름 null', $$select coalesce(b->>'name', 'NULL') from jsonb_array_elements(public.box_list()->'boxes') b where b->>'code' = '11'$$, 'NULL');
    perform gn_test.eq('10 숨겨도 상자는 유지', $$select count(*)::text from jsonb_array_elements(public.box_list()->'boxes') b where b->>'code' = '11'$$, '1');
    perform gn_test.back();
    perform gn_test.as_user('adm1', false);
    perform gn_test.eq('10 mod_list 에 숨긴 상자', $$select count(*)::text from jsonb_array_elements(public.mod_list()) x where x->>'kind' = 'box'$$, '1');
    perform gn_test.allowed('10 mod_restore 로 복구', format($$select public.mod_restore('box', %L)$$, gn_test.bid('11')));
    perform gn_test.eq('10 복구 뒤 이름 보임', $$select b->>'name' from jsonb_array_elements(public.box_list()->'boxes') b where b->>'code' = '11'$$, '냥이');
    perform gn_test.back();
    perform gn_test.as_user('anon2', true);
    perform gn_test.eq('10 box_list 에 내 상자 mine', $$select (b->>'mine') from jsonb_array_elements(public.box_list()->'boxes') b where b->>'code' = '26'$$, 'true');
    perform gn_test.eq('10 box_list 에 holder·uid 없음', format($$select (public.box_list()::text like '%%holder%%' or public.box_list()::text like %L)::text$$, '%' || gn_test.uid('anon1')::text || '%'), 'false');
    perform gn_test.back();
    -- 어드민이 until 을 당겨 만료시킨 뒤: 목록에서 빠지고 새로 놓을 수 있다
    perform gn_test.as_user('adm1', false);
    perform gn_test.eq('10 어드민 box_clear', $$select public.box_clear('11')->>'cleared'$$, 'true');
    perform gn_test.eq('10 box_clear 한 상자는 box_list 에서 빠짐(만료 제외)', $$select count(*)::text from jsonb_array_elements(public.box_list()->'boxes') b where b->>'code' = '11'$$, '0');
    perform gn_test.back();
    perform gn_test.as_user('anon3', true);
    perform gn_test.eq('10 만료 뒤 다른 uid 놓기 ok', $$select public.box_place('11', '새냥')->>'ok'$$, 'true');
    perform gn_test.back();
    -- 거부 사례(한도에 안 셈): anon5
    perform gn_test.as_user('anon5', true);
    perform gn_test.eq('10 16곳 밖 bad_code', $$select public.box_place('99', '냥')->>'code'$$, 'bad_code');
    perform gn_test.eq('10 11자 이름 bad_name', $$select public.box_place('27', '가나다라마바사아자차카')->>'code'$$, 'bad_name');
    perform gn_test.eq('10 금칙어 거부', $$select public.box_place('27', '테스트금칙')->>'code'$$, 'filter_word');
    perform gn_test.eq('10 URL 거부', $$select public.box_place('27', 'www.test.com')->>'ok'$$, 'false');
    perform gn_test.eq('10 연락처 거부', $$select public.box_place('27', '01012345678')->>'code'$$, 'filter_contact');
    perform gn_test.back();
    perform gn_test.eq('10 거부는 하루 한도에 안 셈(기록 0)', $$select gn_test.logn('anon5')$$, '0');
    insert into public.box_log (uid, code) select gn_test.uid('anon5'), '27' from generate_series(1, 6);
    perform gn_test.as_user('anon5', true);
    perform gn_test.eq('10 하루 6회 초과 rate_limit', $$select public.box_place('27', '냥')->>'code'$$, 'rate_limit');
    perform gn_test.back();
    -- 정리: 2일 지난 놓기 기록 삭제(07)
    insert into public.box_log (uid, code, created_at) values (gn_test.uid('anon5'), '27', now() - interval '3 days');
    perform gn_test.as_user('adm1', false);
    perform gn_test.allowed('10 daily_cleanup 실행', 'select public.daily_cleanup()');
    perform gn_test.back();
    perform gn_test.eq('10 2일 지난 box_log 삭제', $$select count(*)::text from public.box_log where created_at < now() - interval '2 days'$$, '0');
  end if;


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
