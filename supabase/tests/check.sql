-- check.sql: DB 규칙 시험 (설계 2차_연결_설계.md 5-4). 테스트 프로젝트 SQL Editor 에서 통째로 실행한다.
-- 전제: 01_base·02_members·07_misc 를 실행한 뒤. 한 트랜잭션 안에서 가짜 계정을 만들고 마지막에 rollback 하므로 아무것도 남지 않는다.
-- 결과: 마지막 표의 result 열이 전부 PASS 이면 통과. FAIL 이 있으면 그 줄(name)을 그대로 알려 준다.
-- 지금 들어 있는 절: [01] 스위치·권한 함수, [02] 회원·교감, [07] 탈퇴·정리. 03~06·08 절은 해당 SQL 이 추가될 때 이어서 더한다.
-- [미확인] auth.users 에 가짜 행을 넣을 때 필수 열이 더 있으면 아래 "가짜 계정" 부분만 고친다(실제 uid·주소는 쓰지 않는다).
begin;

create temp table res (n serial, name text, result text);
grant all on res to public; grant all on res_n_seq to public;
create temp table ids (who text primary key, uid uuid);
grant all on ids to public;

-- 도우미: 결과 기록 / 로그인 흉내 / 예외 기대
create function pg_temp.rec(p_name text, p_ok boolean) returns void language sql as
$$ insert into res (name, result) values (p_name, case when p_ok then 'PASS' else 'FAIL' end) $$;
create function pg_temp.as_user(p_who text, p_anon boolean) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select uid from ids where who = p_who), 'role', 'authenticated', 'is_anonymous', p_anon)::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.back() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
-- sql 을 실행해서 예외가 나야 PASS
create function pg_temp.denied(p_name text, p_sql text) returns void language plpgsql as $$
begin
  begin execute p_sql; perform pg_temp.rec(p_name, false);
  exception when others then perform pg_temp.rec(p_name, true); end;
end $$;
-- sql 이 예외 없이 끝나야 PASS
create function pg_temp.allowed(p_name text, p_sql text) returns void language plpgsql as $$
begin
  begin execute p_sql; perform pg_temp.rec(p_name, true);
  exception when others then perform pg_temp.rec(p_name || ' (' || sqlerrm || ')', false); end;
end $$;
-- 한 값을 돌려주는 sql 이 기대한 문자열과 같아야 PASS (예외도 FAIL)
create function pg_temp.eq(p_name text, p_sql text, p_want text) returns void language plpgsql as $$
declare v text;
begin
  begin execute p_sql into v; perform pg_temp.rec(p_name, v is not distinct from p_want);
  exception when others then perform pg_temp.rec(p_name || ' (' || sqlerrm || ')', false); end;
end $$;

-- 가짜 계정: 익명 2, 회원 1, 어드민 1 (uid 는 무작위로 만들어 이 트랜잭션에서만 쓴다)
insert into ids values ('anon1', gen_random_uuid()), ('anon2', gen_random_uuid()), ('mem1', gen_random_uuid()), ('adm1', gen_random_uuid());
insert into auth.users (id, aud, role, is_anonymous)
  select uid, 'authenticated', 'authenticated', who like 'anon%' from ids;
insert into public.admins (uid) select uid from ids where who = 'adm1';

-- 시험 전에 features 를 기본값으로 맞춘다(운영값이 바뀌어 있어도 시험은 기본값에서 시작)
update public.app_config set value = '{"login":false,"board_write":false,"names_anon":true}' where key = 'features';
update public.app_config set value = '"2026-10"' where key = 'terms_ver';

-- ===== [01] 스위치·권한 함수 =====
select pg_temp.as_user('anon1', true);
select pg_temp.eq('01 익명 is_anon', 'select public.is_anon()::text', 'true');
select pg_temp.eq('01 익명 is_member 아님', 'select public.is_member()::text', 'false');
select pg_temp.eq('01 기본값 board_write 꺼짐', $$select public.gn_feature('board_write')::text$$, 'false');
select pg_temp.eq('01 기본값 names_anon 켜짐', $$select public.gn_feature('names_anon')::text$$, 'true');
select pg_temp.eq('01 없는 스위치는 꺼짐', $$select public.gn_feature('nothing')::text$$, 'false');
select pg_temp.eq('01 익명 can_post 거부', 'select public.can_post()::text', 'false');
select pg_temp.eq('01 익명 can_name 허용(D-84)', 'select public.can_name()::text', 'true');
select pg_temp.eq('01 익명이 설정 읽기', $$select (value ->> 'names_anon') from public.app_config where key = 'features'$$, 'true');
select pg_temp.eq('01 익명 is_admin 아님', 'select public.is_admin()::text', 'false');
-- 익명이 설정을 바꾸려 하면 행이 0개(정책 없음)이거나 오류
select pg_temp.denied('01 익명 설정 수정 거부', $$do $d$ declare n int; begin
  update public.app_config set value = '{"board_write":true}' where key = 'features'; get diagnostics n = row_count;
  if n > 0 then return; end if; raise exception 'no rows'; end $d$$$);
select pg_temp.denied('01 익명 설정 추가 거부', $$insert into public.app_config values ('x', '1')$$);
select pg_temp.denied('01 admins 표 읽기 거부', 'select * from public.admins');
select pg_temp.denied('01 admins 표 쓰기 거부', $$insert into public.admins values (gen_random_uuid())$$);
select pg_temp.back();
select pg_temp.eq('01 익명 설정 수정이 반영되지 않음', $$select (value ->> 'board_write') from public.app_config where key = 'features'$$, 'false');

select pg_temp.as_user('adm1', false);
select pg_temp.eq('01 어드민 is_admin', 'select public.is_admin()::text', 'true');
select pg_temp.allowed('01 어드민 설정 수정 허용', $$update public.app_config set value = '{"login":false,"board_write":false,"names_anon":true}' where key = 'features'$$);
select pg_temp.back();

-- ===== [02] 회원·교감 =====
select pg_temp.as_user('anon1', true);
select pg_temp.denied('02 익명 회원 가입 거부', format($$insert into public.members (uid, nick, age_ok, terms_ver) values (%L, 'a', true, '2026-10')$$, (select uid from ids where who='anon1')));
select pg_temp.denied('02 익명 교감 기록 거부', format($$insert into public.bonds (uid, data) values (%L, '{}')$$, (select uid from ids where who='anon1')));
select pg_temp.back();

select pg_temp.as_user('mem1', false);
select pg_temp.denied('02 약관 버전이 다르면 가입 거부', format($$insert into public.members (uid, nick, age_ok, terms_ver) values (%L, 'm', true, 'old')$$, (select uid from ids where who='mem1')));
select pg_temp.denied('02 14세 미만(age_ok=false) 가입 거부', format($$insert into public.members (uid, nick, age_ok, terms_ver) values (%L, 'm', false, '2026-10')$$, (select uid from ids where who='mem1')));
select pg_temp.denied('02 남의 uid 로 가입 거부', format($$insert into public.members (uid, nick, age_ok, terms_ver) values (%L, 'm', true, '2026-10')$$, (select uid from ids where who='anon2')));
select pg_temp.allowed('02 회원 가입 허용', format($$insert into public.members (uid, nick, age_ok, terms_ver) values (%L, 'm', true, '2026-10')$$, (select uid from ids where who='mem1')));
select pg_temp.eq('02 가입 뒤 is_member', 'select public.is_member()::text', 'true');
select pg_temp.denied('02 닉네임 13자 거부', $$update public.members set nick = '1234567890123' where uid = (select uid from ids where who='mem1')$$);
select pg_temp.denied('02 age_ok 직접 변경 거부', $$update public.members set age_ok = false where true$$);
select pg_temp.denied('02 terms_ver 직접 변경 거부', $$update public.members set terms_ver = 'x' where true$$);
select pg_temp.allowed('02 닉네임 변경 허용', $$update public.members set nick = 'new'$$);
select pg_temp.allowed('02 회원 교감 기록 저장', format($$insert into public.bonds (uid, data) values (%L, '{"a":1}')$$, (select uid from ids where who='mem1')));
select pg_temp.denied('02 교감 기록 16KB 초과 거부', $$update public.bonds set data = jsonb_build_object('x', repeat('z', 17000))$$);
select pg_temp.back();

select pg_temp.as_user('anon2', true);
select pg_temp.eq('02 남의 회원 행은 보이지 않음', 'select count(*)::text from public.members', '0');
select pg_temp.eq('02 남의 교감 기록은 보이지 않음', 'select count(*)::text from public.bonds', '0');
select pg_temp.back();
select pg_temp.as_user('adm1', false);
select pg_temp.eq('02 어드민은 회원 행을 봄', 'select count(*)::text from public.members', '1');
select pg_temp.back();

-- ===== [01] 로그인 재개 값으로 바꾸면 (같은 트랜잭션) =====
update public.app_config set value = '{"login":true,"board_write":true,"names_anon":false}' where key = 'features';
select pg_temp.as_user('mem1', false);
select pg_temp.eq('01 재개: 회원 can_post 허용', 'select public.can_post()::text', 'true');
select pg_temp.eq('01 재개: 회원 can_name 허용', 'select public.can_name()::text', 'true');
select pg_temp.back();
select pg_temp.as_user('anon1', true);
select pg_temp.eq('01 재개: 익명 can_post 거부', 'select public.can_post()::text', 'false');
select pg_temp.eq('01 재개: 익명 can_name 거부(D-49 복귀)', 'select public.can_name()::text', 'false');
select pg_temp.back();
update public.app_config set value = '{"login":false,"board_write":false,"names_anon":true}' where key = 'features';

-- ===== [07] 탈퇴·정리 =====
select pg_temp.as_user('anon1', true);
select pg_temp.denied('07 익명 member_leave 거부', 'select public.member_leave()');
select pg_temp.denied('07 일반 방문자 daily_cleanup 거부', 'select public.daily_cleanup()');
select pg_temp.back();
select pg_temp.as_user('adm1', false);
select pg_temp.allowed('07 어드민 daily_cleanup 허용', 'select public.daily_cleanup()');
select pg_temp.back();
-- 정리는 익명 계정을 지우지 않는다: 8일 전에 만든 것처럼 바꿔도 남아 있어야 한다
update auth.users set created_at = now() - interval '8 days' where id in (select uid from ids where who like 'anon%');
select pg_temp.as_user('adm1', false);
select pg_temp.allowed('07 정리 실행(오래된 익명 계정 포함)', 'select public.daily_cleanup()');
select pg_temp.back();
select pg_temp.eq('07 익명 계정은 정리에서 제외', $$select count(*)::text from auth.users where id in (select uid from ids where who like 'anon%')$$, '2');
select pg_temp.as_user('mem1', false);
select pg_temp.allowed('07 회원 탈퇴 허용', 'select public.member_leave()');
select pg_temp.back();
select pg_temp.eq('07 탈퇴하면 계정 삭제', $$select count(*)::text from auth.users where id = (select uid from ids where who='mem1')$$, '0');
select pg_temp.eq('07 탈퇴하면 회원 행·교감 기록 삭제', $$select (select count(*) from public.members)::text || '/' || (select count(*) from public.bonds)::text$$, '0/0');

-- ===== 결과 (SQL Editor 는 마지막 표만 보여 주므로 한 표로 낸다) =====
select name, result from (
  select n, name, result from res
  union all
  select 9999, '== 합계: PASS ' || count(*) filter (where result = 'PASS') || ' / FAIL ' || count(*) filter (where result = 'FAIL'), '' from res
) r order by n;
rollback;
