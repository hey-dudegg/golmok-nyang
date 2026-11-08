-- check_08_realtime.sql: [08] 실시간 홍보 잠금(08_realtime.sql 이 없으면 항목 0건)
-- 단독 실행: SQL Editor 에 이 파일 하나만 통째로 붙여 넣는다(공통 준비·결과 출력 포함, 다른 check 파일과 독립).
-- 전제: 01_base·02_members·08_realtime 를 실행한 뒤. gn_test 스키마·가짜 계정을 만들고 시험한 뒤 일부러 오류를 내 모두 되돌리므로 아무것도 남지 않는다.
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
  -- 도배 한도는 일부러 풀어 둔다(시험이 한 트랜잭션 안에서 연달아 쓰므로). 도배는 check_05_limits.sql 이 기본값으로 따로 시험한다.
  update public.app_config set value = '{"post":{"gap_s":0,"per10m":1000,"per1h":1000,"dup_h":0},"comment":{"gap_s":0,"per10m":1000,"per1h":1000,"dup_h":0},"name":{"gap_s":0,"per10m":1000,"per1h":1000},"nick":{"per1h":1000}}' where key = 'limits';

  -- ===== [08] 실시간 홍보 잠금 (08_realtime.sql 이 있을 때만: 없으면 이 절은 건너뜀) =====
  if to_regprocedure('public.promo_claim(text,text)') is not null then
    perform gn_test.as_user('adm1', false);
    perform gn_test.allowed('08 어드민 promo_clear 허용', 'select public.promo_clear()');
    perform gn_test.back();
    perform gn_test.as_user('anon1', true);
    perform gn_test.eq('08 첫 홍보(익명) ok', $$select public.promo_claim('11', '냥이')->>'ok'$$, 'true');
    perform gn_test.back();
    perform gn_test.eq('08 메시지 내보냄(realtime.send 동작)', $$select (select count(*) from public.promo_log where ok)::text || '/' || (select until > now() from public.promo_state where id = 1)::text$$, '1/true');
    perform gn_test.as_user('anon2', true);
    perform gn_test.eq('08 다른 uid 10초 안 busy', $$select public.promo_claim('11', '다른냥')->>'code'$$, 'busy');
    perform gn_test.eq('08 이름 21자 bad_text', $$select public.promo_claim('11', repeat('가', 21))->>'code'$$, 'bad_text');
    perform gn_test.eq('08 코드 모양 틀리면 bad_text', $$select public.promo_claim('11 ; x', '냥')->>'code'$$, 'bad_text');
    perform gn_test.back();
    perform gn_test.as_user('anon1', true);
    perform gn_test.eq('08 같은 uid 60초 안 rate_limit', $$select public.promo_claim('11', '냥이')->>'code'$$, 'rate_limit');
    perform gn_test.denied('08 표 직접 insert 거부(promo_log)', format($$insert into public.promo_log (uid, ok) values (%L, true)$$, gn_test.uid('anon1')));
    perform gn_test.denied('08 표 직접 update 거부(promo_state)', $$update public.promo_state set until = 'epoch'$$);
    perform gn_test.denied('08 표 직접 select 거부(promo_state)', $$select * from public.promo_state$$);
    perform gn_test.denied('08 표 직접 insert 거부(promo_block)', format($$insert into public.promo_block (uid, until) values (%L, now())$$, gn_test.uid('anon1')));
    perform gn_test.denied('08 일반 사용자 promo_clear 거부', 'select public.promo_clear()');
    perform gn_test.back();
    perform gn_test.as_user('anon2', true);
    perform gn_test.allowed('08 anon2 시도 35번', $$select count(*) from (select public.promo_claim('11', '냥') from generate_series(1, 35)) t$$);
    perform gn_test.eq('08 시도가 30회를 넘으면 blocked', $$select public.promo_claim('11', '냥')->>'code'$$, 'blocked');
    perform gn_test.back();
    perform gn_test.eq('08 anon 역할 promo_claim 실행 불가', $$select has_function_privilege('anon', 'public.promo_claim(text,text)', 'execute')::text$$, 'false');
    perform gn_test.eq('08 authenticated 는 promo_claim 실행 가능', $$select has_function_privilege('authenticated', 'public.promo_claim(text,text)', 'execute')::text$$, 'true');
    perform gn_test.eq('08 promo 표 정책 0개', $$select count(*)::text from pg_policies where schemaname = 'public' and tablename like 'promo\_%'$$, '0');
    perform gn_test.eq('08 채널 정책은 읽기·Presence 2개(broadcast 송신 정책 없음)', $$select string_agg(cmd, ',' order by cmd) from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname like 'gn\_site\_%'$$, 'INSERT,SELECT');
    perform gn_test.as_user('adm1', false);
    perform gn_test.allowed('08 어드민 promo_clear 허용(다시)', 'select public.promo_clear()');
    perform gn_test.eq('08 어드민 홍보 ok', $$select public.promo_claim('11', '관리냥')->>'ok'$$, 'true');
    perform gn_test.back();
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
