-- check_03_board.sql: [03] 게시판 잠금
-- 단독 실행: SQL Editor 에 이 파일 하나만 통째로 붙여 넣는다(공통 준비·결과 출력 포함, 다른 check 파일과 독립).
-- 전제: 01_base·02_members·03_board 를 실행한 뒤. gn_test 스키마·가짜 계정을 만들고 시험한 뒤 일부러 오류를 내 모두 되돌리므로 아무것도 남지 않는다.
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
  -- 준비: 회원 mem1 (02 절의 가입·닉네임 변경 결과와 같은 상태, 결과 항목 아님)
  perform gn_test.as_user('mem1', false);
  insert into public.members (uid, nick, age_ok, terms_ver) values (gn_test.uid('mem1'), 'new', true, '2026-10');
  perform gn_test.back();

  -- ===== [03] 게시판 잠금(board_write 꺼짐) =====
  perform gn_test.as_user('mem1', false);
  perform gn_test.raises('03 잠금: 회원 글쓰기도 feature_off', format($$insert into public.posts (uid, body) values (%L, 'x')$$, gn_test.uid('mem1')), 'feature_off');
  perform gn_test.raises('03 잠금: 댓글도 feature_off', format($$insert into public.post_comments (post_id, uid, body) values (gen_random_uuid(), %L, 'x')$$, gn_test.uid('mem1')), 'feature_off');
  perform gn_test.back();
  perform gn_test.as_user('anon1', true);
  perform gn_test.raises('03 잠금: 익명 글쓰기 feature_off', format($$insert into public.posts (uid, body) values (%L, 'x')$$, gn_test.uid('anon1')), 'feature_off');
  perform gn_test.back();
  -- 글이 있는 상태를 만들려고 같은 트랜잭션에서 잠깐 켠다
  update public.app_config set value = '{"login":false,"board_write":true,"names_anon":true}' where key = 'features';
  perform gn_test.as_user('anon1', true);
  perform gn_test.raises('03 켬: 익명은 회원이 아니라 need_member', format($$insert into public.posts (uid, body) values (%L, 'x')$$, gn_test.uid('anon1')), 'need_member');
  perform gn_test.back();
  perform gn_test.as_user('mem1', false);
  perform gn_test.allowed('03 켬: 회원 글쓰기 허용', format($$insert into public.posts (uid, body) values (%L, 'hello')$$, gn_test.uid('mem1')));
  perform gn_test.eq('03 서버가 정한 열(nick·status·img)', $$select nick || '/' || status || '/' || coalesce(img, '-') from public.posts where uid = gn_test.uid('mem1')$$, 'new/ok/-');
  perform gn_test.denied('03 남의 uid 로 글쓰기 거부', format($$insert into public.posts (uid, body) values (%L, 'x')$$, gn_test.uid('anon1')));
  perform gn_test.denied('03 status 직접 지정 거부', format($$insert into public.posts (uid, body, status) values (%L, 'x', 'ok')$$, gn_test.uid('mem1')));
  perform gn_test.denied('03 img 직접 지정 거부', format($$insert into public.posts (uid, body, img) values (%L, 'x', 'a/b.webp')$$, gn_test.uid('mem1')));
  perform gn_test.denied('03 본문 501자 거부', format($$insert into public.posts (uid, body) values (%L, repeat('a', 501))$$, gn_test.uid('mem1')));
  perform gn_test.allowed('03 켬: 회원 댓글 허용', format($$insert into public.post_comments (post_id, uid, body) select id, uid, 'c1' from public.posts where uid = %L limit 1$$, gn_test.uid('mem1')));
  perform gn_test.eq('03 댓글 nick 은 서버가', $$select nick from public.post_comments limit 1$$, 'new');
  perform gn_test.back();
  update public.app_config set value = '{"login":false,"board_write":false,"names_anon":true}' where key = 'features';

  -- 잠금 상태에서도 읽기·좋아요는 된다
  perform gn_test.as_user('anon1', true);
  perform gn_test.eq('03 익명이 글 읽기', 'select count(*)::text from public.posts', '1');
  perform gn_test.eq('03 익명이 댓글 읽기', 'select count(*)::text from public.post_comments', '1');
  perform gn_test.allowed('03 익명 좋아요 허용(D-67)', format($$insert into public.post_likes (post_id, uid) select id, %L from public.posts limit 1$$, gn_test.uid('anon1')));
  perform gn_test.denied('03 같은 글 좋아요 중복 거부', format($$insert into public.post_likes (post_id, uid) select id, %L from public.posts limit 1$$, gn_test.uid('anon1')));
  perform gn_test.denied('03 남의 uid 로 좋아요 거부', format($$insert into public.post_likes (post_id, uid) select id, %L from public.posts limit 1$$, gn_test.uid('anon2')));
  perform gn_test.denied('03 익명이 남의 글 삭제 거부', $q$do $d$ declare n int; begin
    delete from public.posts where true; get diagnostics n = row_count;
    if n > 0 then return; end if; raise exception 'no rows'; end $d$ $q$);
  perform gn_test.denied('03 익명이 남의 댓글 삭제 거부', $q$do $d$ declare n int; begin
    delete from public.post_comments where true; get diagnostics n = row_count;
    if n > 0 then return; end if; raise exception 'no rows'; end $d$ $q$);
  perform gn_test.denied('03 글 직접 수정 거부', $$update public.posts set body = 'hack' where true$$);
  perform gn_test.allowed('03 좋아요 취소 허용', $$delete from public.post_likes where uid = gn_test.uid('anon1')$$);
  perform gn_test.back();
  -- 숨김 글은 작성자·어드민에게만 보인다
  update public.posts set status = 'hidden';
  perform gn_test.as_user('anon2', true);
  perform gn_test.eq('03 숨김 글은 남에게 안 보임', 'select count(*)::text from public.posts', '0');
  perform gn_test.eq('03 숨긴 글의 댓글도 안 보임', 'select count(*)::text from public.post_comments', '0');
  perform gn_test.back();
  perform gn_test.as_user('mem1', false);
  perform gn_test.eq('03 숨김 글은 작성자에게 보임', 'select count(*)::text from public.posts', '1');
  perform gn_test.back();
  perform gn_test.as_user('adm1', false);
  perform gn_test.eq('03 숨김 글은 어드민에게 보임', 'select count(*)::text from public.posts', '1');
  perform gn_test.back();
  update public.posts set status = 'ok';


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
