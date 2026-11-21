-- check_log.sql: [11] 로그 log_write·rotate_logs (11_log.sql 이 없으면 항목 0건)
-- 단독 실행: SQL Editor 에 이 파일 하나만 통째로 붙여 넣는다(공통 준비·결과 출력 포함, 다른 check 파일과 독립).
-- 전제: 01_base·02_members·07_misc·11_log 를 실행한 뒤. 일부러 오류를 내 모두 되돌리므로 아무것도 남지 않는다(지우고 바꾼 일일 표도 되돌아온다).
-- 결과: 마지막 표의 result 열이 전부 PASS 이면 통과. FAIL·"중단:" 줄은 그 줄(name)을 그대로 알려 준다.
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

  if to_regprocedure('public.log_write(jsonb)') is not null then
    -- 시험 도우미(소유자 권한): 마지막 기록 읽기·표 합계·일일 표 수
    create function gn_test.lmsg() returns text language sql security definer set search_path = '' as $$ select msg from public.log_all order by id desc limit 1 $$;
    create function gn_test.lcol(p_col text) returns text language plpgsql security definer set search_path = '' as $$
    declare v text; begin execute format('select %I::text from public.log_all order by id desc limit 1', p_col) into v; return v; end $$;
    create function gn_test.ltot() returns text language plpgsql security definer set search_path = '' as $$
    declare v bigint; x bigint; r record;
    begin
      select (select count(*) from public.log_all) + (select count(*) from public.log_err) into v;
      for r in select tablename from pg_catalog.pg_tables where schemaname = 'public' and tablename ~ '^log_(all|err)_[0-9]{6}$' loop
        execute format('select count(*) from public.%I', r.tablename) into x; v := v + x;
      end loop;
      return v::text;
    end $$;
    create function gn_test.ntab() returns text language sql security definer set search_path = '' as $$
      select count(*)::text from pg_catalog.pg_tables where schemaname = 'public' and tablename ~ '^log_(all|err)_[0-9]{6}$' $$;
    -- 사용자별 분당 한도 때문에 시험 중간에 기록 시각을 2분 앞으로 당긴다, clr = 두 표 비우기
    create function gn_test.age() returns void language sql security definer set search_path = '' as $$ update public.log_all set ts = ts - interval '2 minutes' $$;
    create function gn_test.clr() returns void language plpgsql security definer set search_path = '' as $$ begin delete from public.log_all; delete from public.log_err; end $$;
    -- 이미 있는 일일 표는 시험 안에서만 지운다(전체가 되돌아옴). 어제 표가 있으면 교체가 건너뛰어지기 때문
    create function gn_test.dropold() returns void language plpgsql security definer set search_path = '' as $$
    declare t record;
    begin
      for t in select tablename from pg_catalog.pg_tables where schemaname = 'public' and tablename ~ '^log_(all|err)_[0-9]{6}$' loop
        execute format('drop table public.%I', t.tablename);
      end loop;
    end $$;
    perform gn_test.dropold();

    -- 마스킹: 서버가 규칙 순서대로 [x] 로 바꾼다
    perform gn_test.as_user('anon1', true);
    perform public.log_write('{"lvl":"info","part":"client","code":"js_error","msg":"mail a@b.co x"}');
    perform gn_test.eq('11 이메일 [x]', 'select gn_test.lmsg()', 'mail [x] x');
    perform public.log_write('{"msg":"see https://x.io/p?code=1 ok"}');
    perform gn_test.eq('11 URL(쿼리 포함) [x]', 'select gn_test.lmsg()', 'see [x] ok');
    perform public.log_write('{"msg":"tok eyJabc.def.ghi z"}');
    perform gn_test.eq('11 eyJ 토큰 [x]', 'select gn_test.lmsg()', 'tok [x] z');
    perform public.log_write('{"msg":"ip 192.168.0.1 end"}');
    perform gn_test.eq('11 IPv4 [x]', 'select gn_test.lmsg()', 'ip [x] end');
    perform public.log_write('{"msg":"v6 2001:db8::1 e"}');
    perform gn_test.eq('11 IPv6 [x]', 'select gn_test.lmsg()', 'v6 [x] e');
    perform public.log_write('{"msg":"call 010-1234-5678 ok"}');
    perform gn_test.age();
    perform gn_test.eq('11 전화 [x]', 'select gn_test.lmsg()', 'call [x] ok');
    perform public.log_write('{"msg":"t abcdefghij0123456789ABCD z"}');
    perform gn_test.eq('11 20자 이상 토큰 [x]', 'select gn_test.lmsg()', 't [x] z');
    perform public.log_write('{"msg":"go page?x=1#h t"}');
    perform gn_test.eq('11 ?# 이하 절단', 'select gn_test.lmsg()', 'go page t');
    perform public.log_write(jsonb_build_object('msg', repeat('가', 200), 'ver', repeat('v', 100)));
    perform gn_test.age();
    perform gn_test.eq('11 msg 120자 상한', 'select char_length(gn_test.lmsg())::text', '120');
    perform gn_test.eq('11 ver 40자 상한', $$select char_length(gn_test.lcol('ver'))::text$$, '40');
    perform public.log_write('{"msg":"m","ver":"a@b.co"}');
    perform gn_test.eq('11 ver 도 마스킹', $$select gn_test.lcol('ver')$$, '[x]');

    -- 허용 키만 남김, 문자열 값 마스킹, ua_class 값 제한, 300바이트
    perform public.log_write('{"msg":"c","ctx":{"region":"11","pw":"secret","email":"a@b.co","n":3,"ev":"a@b.co","ua_class":"tablet","ms":12}}');
    perform gn_test.age();
    perform gn_test.eq('11 허용 밖 키 버림·값 마스킹', $$select gn_test.lcol('ctx')$$, '{"n": 3, "ev": "[x]", "ms": 12, "region": "11"}');
    perform public.log_write('{"msg":"c","ctx":{"ua_class":"mobile","file":"src/a.js:12"}}');
    perform gn_test.eq('11 ua_class·file 허용', $$select gn_test.lcol('ctx')$$, '{"file": "src/a.js:12", "ua_class": "mobile"}');
    perform public.log_write(jsonb_build_object('msg', 'c', 'ctx', jsonb_build_object('region', repeat('가', 60), 'ev', repeat('나', 60), 'file', repeat('다', 60), 'ms', 5, 'status', 200)));
    perform gn_test.eq('11 ctx 300바이트 이내', $$select (octet_length(gn_test.lcol('ctx')) <= 300)::text$$, 'true');

    -- 파트·코드·레벨 정정, 두 표 기록, uh
    perform public.log_write('{"lvl":"zzz","part":"nope","code":"rpc_fail","msg":"x"}');
    perform gn_test.eq('11 모르는 part → client', $$select gn_test.lcol('part')$$, 'client');
    perform gn_test.eq('11 part 다른 code → other', $$select gn_test.lcol('code')$$, 'other');
    perform gn_test.eq('11 모르는 lvl → info', $$select gn_test.lcol('lvl')$$, 'info');
    perform public.log_write('{"lvl":"error","part":"server","code":"rpc_fail","msg":"x"}');
    perform gn_test.eq('11 사전 code 유지', $$select gn_test.lcol('code')$$, 'rpc_fail');
    perform gn_test.eq('11 error 는 log_err 에도 기록', $$select (select count(*) from public.log_err where msg = 'x' and code = 'rpc_fail')::text$$, '1');
    perform gn_test.eq('11 uh 8자', $$select char_length(gn_test.lcol('uh'))::text$$, '8');
    perform gn_test.eq('11 잘못된 입력은 ok=false', $$select (public.log_write('[1]'::jsonb) ->> 'ok')$$, 'false');
    perform gn_test.back();
    perform gn_test.eq('11 info 는 log_err 에 안 감', $$select (select count(*) from public.log_err where msg like 'mail%')::text$$, '0');

    -- 표 직접 접근 거부(로그인·anon 역할 모두)
    perform gn_test.as_user('anon1', true);
    perform gn_test.denied('11 log_all 직접 select 거부', 'select * from public.log_all');
    perform gn_test.denied('11 log_all 직접 insert 거부', $$insert into public.log_all (lvl, part, code, msg) values ('info', 'client', 'other', 'x')$$);
    perform gn_test.denied('11 log_err 직접 select 거부', 'select * from public.log_err');
    perform gn_test.denied('11 log_err 직접 insert 거부', $$insert into public.log_err (lvl, part, code, msg) values ('error', 'client', 'other', 'x')$$);
    perform gn_test.denied('11 소금 표 직접 select 거부', 'select * from public.log_salt');
    perform gn_test.denied('11 익명 rotate_logs 거부', 'select public.rotate_logs()');
    perform gn_test.back();
    perform gn_test.denied('11 anon 역할 log_all select 거부', 'set local role anon; select * from public.log_all');
    perform gn_test.back();
    perform gn_test.denied('11 anon 역할 rotate_logs 거부', 'set local role anon; select public.rotate_logs()');
    perform gn_test.back();
    perform gn_test.allowed('11 anon 역할 log_write 허용', $$set local role anon; select public.log_write('{"msg":"anon"}'::jsonb)$$);
    perform gn_test.back();
    perform gn_test.as_user('adm1', false);
    perform gn_test.denied('11 어드민 계정도 rotate_logs 직접 호출 거부', 'select public.rotate_logs()');
    perform gn_test.back();

    -- rotate_logs 두 번 연속. 2020년 표는 보관 30일 초과라 지워지고, 먼 미래 표는 남는다
    create table public.log_all_200101 (id bigint);
    create table public.log_err_200101 (id bigint);
    create table public.log_all_991231 (id bigint);
    create temp table gn_test_tot as select gn_test.ltot() as v;
    grant select on gn_test_tot to public;
    perform gn_test.eq('11 첫 교체 rotated=true', $$select (public.rotate_logs() ->> 'rotated')$$, 'true');
    perform gn_test.eq('11 오래된 표(2020) drop', $$select coalesce(to_regclass('public.log_all_200101')::text, 'none') || coalesce(to_regclass('public.log_err_200101')::text, 'none')$$, 'nonenone');
    perform gn_test.eq('11 먼 미래 표는 보관', $$select (to_regclass('public.log_all_991231') is not null)::text$$, 'true');
    perform gn_test.eq('11 교체 뒤 새 log_all 에 info 1줄', $$select (select count(*) from public.log_all)::text$$, '1');
    perform gn_test.eq('11 교체 뒤 행 손실 0(교체 기록 1줄만 추가)', $$select (gn_test.ltot()::bigint - (select v::bigint from gn_test_tot))::text$$, '1');
    perform gn_test.eq('11 교체 뒤 표 수(어제 2 + 미래 1)', $$select gn_test.ntab()$$, '3');
    perform gn_test.eq('11 두 번째 rotated=false', $$select (public.rotate_logs() ->> 'rotated')$$, 'false');
    perform gn_test.eq('11 두 번째 표 수 불변', $$select gn_test.ntab()$$, '3');
    perform gn_test.eq('11 두 번째 행 손실 0(기록 1줄만 더)', $$select (gn_test.ltot()::bigint - (select v::bigint from gn_test_tot))::text$$, '2');
    perform gn_test.allowed('11 교체 뒤 새 표에 log_write 가능', $$select public.log_write('{"msg":"after"}'::jsonb)$$);
    perform gn_test.denied('11 새 표도 직접 insert 거부', $$set local role authenticated; insert into public.log_all (lvl, part, code, msg) values ('info', 'client', 'other', 'x')$$);
    perform gn_test.back();

    -- daily_cleanup 이 rotate_logs 를 부름(교체 없이 안전)
    perform gn_test.as_user('adm1', false);
    perform gn_test.allowed('11 daily_cleanup 안에서 rotate_logs 실행', 'select public.daily_cleanup()');
    perform gn_test.back();
    perform gn_test.eq('11 daily_cleanup 뒤 표 수 불변', $$select gn_test.ntab()$$, '3');
    perform gn_test.eq('11 daily_cleanup 이 교체 기록을 남김', $$select (select count(*) from public.log_all where msg like 'rotate_logs rotated=false%')::text$$, '2');

    -- M10-7: 파일 경로 마스킹(URL 규칙 다음, 서버가 강제)
    perform gn_test.clr();
    perform gn_test.as_user('anon4', true);
    perform public.log_write('{"msg":"at C:\\Users\\k\\a.js y"}');
    perform gn_test.eq('11 윈도 경로 [x]', 'select gn_test.lmsg()', 'at [x] y');
    perform public.log_write('{"msg":"f file:///a/b.js y"}');
    perform gn_test.eq('11 file: 경로 [x]', 'select gn_test.lmsg()', 'f [x] y');
    perform public.log_write('{"msg":"p /Users/k/a.js y"}');
    perform gn_test.eq('11 /Users 경로 [x]', 'select gn_test.lmsg()', 'p [x] y');
    perform public.log_write('{"msg":"p /home/k/a.js y"}');
    perform gn_test.eq('11 /home 경로 [x]', 'select gn_test.lmsg()', 'p [x] y');
    -- 마스킹 전 길이 절단(500자) 뒤 120자, 4096바이트 넘는 p 는 bad
    perform public.log_write(jsonb_build_object('msg', repeat('가 ', 300)));
    perform gn_test.eq('11 긴 msg 는 120자로', 'select char_length(gn_test.lmsg())::text', '120');
    perform gn_test.eq('11 4096바이트 넘는 p 는 bad', $$select (public.log_write(jsonb_build_object('msg', repeat('a', 5000))) ->> 'why')$$, 'bad');
    perform gn_test.back();
    -- 사용자별 분당 10건: 11번째는 버리고 다른 사용자는 허용
    perform gn_test.clr();
    perform gn_test.as_user('anon5', true);
    for i in 1..10 loop perform public.log_write(jsonb_build_object('msg', 'u' || i)); end loop;
    perform gn_test.eq('11 사용자 11번째 분당 한도 초과 버림', $$select (public.log_write('{"msg":"u11"}'::jsonb) ->> 'ok')$$, 'false');
    perform gn_test.back();
    perform gn_test.as_user('anon2', true);
    perform gn_test.eq('11 다른 사용자는 허용', $$select (public.log_write('{"msg":"other"}'::jsonb) ->> 'ok')$$, 'true');
    perform gn_test.back();
    -- 전역 분당: info·warn 은 100 에서 버리고 error 는 120 까지
    perform gn_test.clr();
    insert into public.log_all (lvl, part, code, msg) select 'info', 'client', 'other', 'fill' from generate_series(1, 100);
    perform gn_test.as_user('anon3', true);
    perform gn_test.eq('11 전역 100 넘으면 info 버림', $$select (public.log_write('{"msg":"g1"}'::jsonb) ->> 'ok')$$, 'false');
    perform gn_test.eq('11 전역 100 넘으면 warn 버림', $$select (public.log_write('{"lvl":"warn","msg":"g2"}'::jsonb) ->> 'ok')$$, 'false');
    perform gn_test.eq('11 전역 100 넘어도 error 는 허용', $$select (public.log_write('{"lvl":"error","msg":"g3"}'::jsonb) ->> 'ok')$$, 'true');
    perform gn_test.back();
    -- 하루 상한: log_all 5000 넘으면 info 버림, 10000 넘으면 warn·error 는 log_err 에만
    perform gn_test.clr();
    insert into public.log_all (ts, lvl, part, code, msg) select now() - interval '1 hour', 'info', 'client', 'other', 'old' from generate_series(1, 5000);
    perform gn_test.as_user('anon4', true);
    perform gn_test.eq('11 5000 넘으면 info 버림', $$select (public.log_write('{"msg":"c1"}'::jsonb) ->> 'ok')$$, 'false');
    perform gn_test.eq('11 5000 넘어도 error 허용', $$select (public.log_write('{"lvl":"error","msg":"c2"}'::jsonb) ->> 'ok')$$, 'true');
    perform gn_test.back();
    insert into public.log_all (ts, lvl, part, code, msg) select now() - interval '1 hour', 'info', 'client', 'other', 'old' from generate_series(1, 5000);
    perform gn_test.as_user('anon4', true);
    perform gn_test.eq('11 10000 넘은 warn 도 ok(log_err 에만)', $$select (public.log_write('{"lvl":"warn","msg":"c3"}'::jsonb) ->> 'ok')$$, 'true');
    perform gn_test.back();
    perform gn_test.eq('11 10000 넘으면 log_all 에는 안 남김', $$select (select count(*) from public.log_all where msg = 'c3')::text$$, '0');
    perform gn_test.eq('11 10000 넘으면 log_err 에는 남김', $$select (select count(*) from public.log_err where msg = 'c3')::text$$, '1');
    perform gn_test.clr();

    -- 분당 120건 상한: 채운 뒤 log_write 는 조용히 버린다
    insert into public.log_all (lvl, part, code, msg) select 'info', 'client', 'other', 'fill' from generate_series(1, 120);
    perform gn_test.as_user('anon3', true);
    perform gn_test.eq('11 분당 상한 초과는 버림', $$select (public.log_write('{"msg":"over"}'::jsonb) ->> 'ok')$$, 'false');
    perform gn_test.back();
    perform gn_test.eq('11 버린 줄은 기록 안 됨', $$select (select count(*) from public.log_all where msg = 'over')::text$$, '0');
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
