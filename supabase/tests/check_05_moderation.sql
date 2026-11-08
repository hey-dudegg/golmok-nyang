-- check_05_moderation.sql: [05] 신고·어드민 확인·복구·신고 한도(05_moderation.sql)
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
  -- 회원 mem1 과 그의 글 1개(신고 시험용): 글쓰기는 잠겨 있으므로 잠깐 켰다가 잠근다
  perform gn_test.as_user('mem1', false);
  perform gn_test.allowed('00 시험 준비: 회원 가입', format($$insert into public.members (uid, nick, age_ok, terms_ver) values (%L, 'm', true, '2026-10')$$, gn_test.uid('mem1')));
  perform gn_test.back();
  update public.app_config set value = '{"login":false,"board_write":true,"names_anon":true}' where key = 'features';
  perform gn_test.as_user('mem1', false);
  perform gn_test.allowed('00 시험 준비: 회원 글 1개', format($$insert into public.posts (uid, body) values (%L, 'back')$$, gn_test.uid('mem1')));
  perform gn_test.back();
  update public.app_config set value = '{"login":false,"board_write":false,"names_anon":true}' where key = 'features';

  insert into gn_test.ids values ('rp1', gen_random_uuid()), ('rp2', gen_random_uuid()), ('rp3', gen_random_uuid());   -- 신고 시험용 익명 3명(who 가 anon 으로 시작하지 않게)
  insert into auth.users (id, aud, role, is_anonymous) select uid, 'authenticated', 'authenticated', true from gn_test.ids where who like 'rp%';
  delete from public.filter_words;
  insert into public.filter_words (word) values ('테스트금칙');

  perform gn_test.as_user('anon1', true);
  perform gn_test.allowed('05 신고 시험용 이름 제안', format($$insert into public.names2 (region, name, uid) values ('27', '신고냥', %L)$$, gn_test.uid('anon1')));
  perform gn_test.allowed('05 내 이름 신고는 조용히 무시', $$select public.report('name', id) from public.names2 where name = '신고냥'$$);
  perform gn_test.denied('05 reports 직접 쓰기 거부', format($$insert into public.reports (kind, target, uid) select 'name', id, %L from public.names2 where name = '신고냥'$$, gn_test.uid('anon1')));
  perform gn_test.raises('05 없는 이름 신고 not_found', $$select public.report('name', gen_random_uuid())$$, 'not_found');
  perform gn_test.raises('05 익명의 게시판 글 신고 거부', $$select public.report('post', id) from public.posts limit 1$$, 'need_member');
  perform gn_test.raises('05 익명의 댓글 신고 거부', $$select public.report('comment', gen_random_uuid())$$, 'need_member');
  perform gn_test.raises('05 익명 mod_list 거부', 'select public.mod_list()', 'need_admin');
  perform gn_test.raises('05 익명 mod_restore 거부', $$select public.mod_restore('name', gen_random_uuid())$$, 'need_admin');
  perform gn_test.raises('05 익명 mod_remove 거부', $$select public.mod_remove('name', gen_random_uuid())$$, 'need_admin');
  perform gn_test.back();
  perform gn_test.as_user('mem1', false);
  perform gn_test.allowed('05 회원이 자기 글 신고는 조용히 무시', $$select public.report('post', id) from public.posts where uid = gn_test.uid('mem1') limit 1$$);
  perform gn_test.back();
  -- 익명 3명이 이름 신고 -> 3번째에 숨김. 중복은 무시
  perform gn_test.as_user('rp1', true);
  perform gn_test.allowed('05 익명 이름 신고 허용(D-84)', $$select public.report('name', id) from public.names2 where name = '신고냥'$$);
  perform gn_test.allowed('05 같은 사람 중복 신고는 조용히 무시', $$select public.report('name', id) from public.names2 where name = '신고냥'$$);
  perform gn_test.eq('05 방문자는 신고 목록이 안 보임', 'select count(*)::text from public.reports', '0');
  perform gn_test.back();
  perform gn_test.eq('05 중복은 1건으로 센다', $$select count(*)::text from public.reports where kind = 'name'$$, '1');
  perform gn_test.as_user('rp2', true);
  perform gn_test.allowed('05 신고 2번째', $$select public.report('name', id) from public.names2 where name = '신고냥'$$);
  perform gn_test.eq('05 2건까지는 보임', $$select count(*)::text from public.names2 where name = '신고냥'$$, '1');
  perform gn_test.back();
  perform gn_test.as_user('rp3', true);
  perform gn_test.allowed('05 신고 3번째', $$select public.report('name', id) from public.names2 where name = '신고냥'$$);
  perform gn_test.eq('05 3건이면 남에게 안 보임', $$select count(*)::text from public.names2 where name = '신고냥'$$, '0');
  perform gn_test.back();
  perform gn_test.eq('05 숨김 상태·시각', $$select status || '/' || (hidden_at is not null)::text from public.names2 where name = '신고냥'$$, 'hidden/true');
  perform gn_test.as_user('anon1', true);
  perform gn_test.eq('05 제안자에게는 보임', $$select status from public.names2 where name = '신고냥'$$, 'hidden');
  perform gn_test.back();
  -- 어드민 확인·복구
  perform gn_test.as_user('adm1', false);
  perform gn_test.eq('05 어드민 신고 목록 3건', $$select count(*)::text from public.reports where kind = 'name'$$, '3');
  perform gn_test.eq('05 mod_list 에 이름·신고 수 3', $$select (x ->> 'text') || '/' || (x ->> 'reports') from jsonb_array_elements(public.mod_list()) x where x ->> 'kind' = 'name' and x ->> 'text' = '신고냥'$$, '신고냥/3');
  perform gn_test.allowed('05 mod_restore 허용', $$select public.mod_restore('name', id) from public.names2 where name = '신고냥'$$);
  perform gn_test.eq('05 복구 뒤 다시 보임', $$select status || '/' || (hidden_at is null)::text from public.names2 where name = '신고냥'$$, 'ok/true');
  perform gn_test.eq('05 복구하면 신고가 지워진 것(cleared)으로', $$select count(*)::text from public.reports where kind = 'name' and not cleared$$, '0');
  perform gn_test.raises('05 숨김 아닌 것 복구는 not_found', $$select public.mod_restore('name', id) from public.names2 where name = '신고냥'$$, 'not_found');
  perform gn_test.back();
  -- 복구 뒤 같은 3명이 다시 신고해도 숨겨지지 않는다(새 신고 3개 필요)
  perform gn_test.as_user('rp1', true); perform public.report('name', (select id from public.names2 where name = '신고냥'));
  perform gn_test.back();
  perform gn_test.as_user('rp2', true); perform public.report('name', (select id from public.names2 where name = '신고냥'));
  perform gn_test.back();
  perform gn_test.as_user('rp3', true); perform public.report('name', (select id from public.names2 where name = '신고냥'));
  perform gn_test.back();
  perform gn_test.eq('05 복구 뒤 같은 사람이 다시 신고해도 그대로', $$select status from public.names2 where name = '신고냥'$$, 'ok');
  perform gn_test.as_user('anon2', true); perform public.report('name', (select id from public.names2 where name = '신고냥'));
  perform gn_test.back();
  perform gn_test.as_user('mem1', false); perform public.report('name', (select id from public.names2 where name = '신고냥'));
  perform gn_test.back();
  perform gn_test.eq('05 새 신고 2개는 아직 보임', $$select status from public.names2 where name = '신고냥'$$, 'ok');
  perform gn_test.as_user('adm1', false); perform public.report('name', (select id from public.names2 where name = '신고냥'));
  perform gn_test.eq('05 새 신고 3개면 다시 숨김', $$select status from public.names2 where name = '신고냥'$$, 'hidden');
  perform gn_test.eq('05 mod_remove 이름은 그림 경로 없음(null)', $$select coalesce(public.mod_remove('name', id), '-') from public.names2 where name = '신고냥'$$, '-');
  perform gn_test.eq('05 지운 이름 상태', $$select status from public.names2 where name = '신고냥'$$, 'removed');
  perform gn_test.raises('05 이미 지운 것 mod_remove not_found', $$select public.mod_remove('name', id) from public.names2 where name = '신고냥'$$, 'not_found');
  perform gn_test.back();
  perform gn_test.as_user('anon2', true);
  perform gn_test.eq('05 지운 이름은 남에게 안 보임', $$select count(*)::text from public.names2 where name = '신고냥'$$, '0');
  perform gn_test.back();
  -- 07 정리: 대상이 지워진 신고(고아)도 지운다
  delete from public.names2 where name = '신고냥';
  perform public.daily_cleanup();
  perform gn_test.eq('05 정리 뒤 대상 없는 신고 0건', $$select count(*)::text from public.reports r where r.kind = 'name' and not exists (select 1 from public.names2 n where n.id = r.target)$$, '0');
  -- 신고 한도 값은 app_config.report_hide 로 조정(코드 변경 없음)
  -- D-106 시간당 신고·투표 한도(per1h=0 이면 바로 거부)와 복원
  update public.app_config set value = jsonb_set(jsonb_set(value, '{report,per1h}', '0'), '{vote,per1h}', '0') where key = 'limits';
  perform gn_test.as_user('rp1', true);
  perform gn_test.raises('05 시간당 신고 한도 초과', $$select public.report('name', id) from public.names2 limit 1$$, 'rate_limit');
  perform gn_test.raises('04 시간당 투표 한도 초과', $$select public.name_vote(id, 'up') from public.names2 limit 1$$, 'rate_limit');
  perform gn_test.back();
  update public.app_config set value = jsonb_set(jsonb_set(value, '{report,per1h}', '10'), '{vote,per1h}', '30') where key = 'limits';
  update public.app_config set value = '{"post":3,"comment":3,"name":1}' where key = 'report_hide';
  perform gn_test.as_user('anon1', true);
  perform gn_test.allowed('05 한도 1: 시험용 두 번째 이름', format($$insert into public.names2 (region, name, uid) values ('27', '한도냥', %L)$$, gn_test.uid('anon1')));
  perform gn_test.back();
  perform gn_test.as_user('rp1', true);
  perform gn_test.allowed('05 한도 1: 신고 1번에 숨김', $$select public.report('name', id) from public.names2 where name = '한도냥'$$);
  perform gn_test.back();
  perform gn_test.eq('05 report_hide.name=1 이면 1건에 숨김', $$select status from public.names2 where name = '한도냥'$$, 'hidden');
  update public.app_config set value = '{"post":3,"comment":3,"name":3}' where key = 'report_hide';

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
