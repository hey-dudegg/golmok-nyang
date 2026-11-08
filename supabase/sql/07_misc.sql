-- 07_misc.sql  (실행 순서 7/8, 설계 2차_연결_표.md 2-7)
-- 목적: 탈퇴 member_leave(), 정리 daily_cleanup(). 정리는 익명 계정을 지우지 않는다(익명 uid를 지우면 그 사람의 이름·투표가 사라짐).
-- 선행: 01·02 (03~06 표가 아직 없어도 동작: 있는 표만 정리한다). 다시 실행해도 안전하다.

-- 탈퇴: 내 계정 삭제. cascade 로 회원·교감·글·댓글·좋아요·이름·투표·신고가 지워진다(그림 파일은 화면이 먼저 지움).
create or replace function public.member_leave() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_anon() then raise exception 'auth' using errcode = 'P0001'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.member_leave() from public, anon;
grant execute on function public.member_leave() to authenticated;

-- 하루 1회 정리(D-09). 호출 주체: 어드민 또는 데이터베이스 관리 역할(스케줄러). 일반 방문자는 거부.
create or replace function public.daily_cleanup() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_users int := 0; n_posts int := 0; n_names int := 0; n_reports int := 0; n_orphans int := 0;
begin
  -- session_user 는 set role 뒤에도 바뀌지 않으므로(관리 세션이 authenticated 로 바꿔 불러도 통과), 바꾼 역할(role 설정)도 본다.
  -- security definer 안에서 current_user 는 소유자라 쓸 수 없다. role 설정은 API(anon·authenticated)면 그 이름, 스케줄러면 'none'.
  if not (public.is_admin()
          or (session_user in ('postgres', 'supabase_admin')
              and coalesce(current_setting('role', true), 'none') not in ('anon', 'authenticated'))) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  -- 가입 안 끝난 소셜 계정(회원 행 없음, 익명 아님) 7일 뒤 삭제. 익명 계정은 제외.
  delete from auth.users u
   where coalesce(u.is_anonymous, false) = false
     and u.created_at < now() - interval '7 days'
     and not exists (select 1 from public.members m where m.uid = u.id)
     and not exists (select 1 from public.admins a where a.uid = u.id);
  get diagnostics n_users = row_count;
  if to_regclass('public.posts') is not null then
    execute $q$delete from public.posts where status = 'removed' and created_at < now() - interval '30 days'$q$;
    get diagnostics n_posts = row_count;
  end if;
  if to_regclass('public.names2') is not null then
    execute $q$delete from public.names2 where status = 'removed' and created_at < now() - interval '30 days'$q$;
    get diagnostics n_names = row_count;
  end if;
  if to_regclass('public.reports') is not null then
    execute $q$delete from public.reports where created_at < now() - interval '30 days'$q$;
    get diagnostics n_reports = row_count;
    -- 대상(이름·글·댓글)이 이미 지워진 신고(고아)도 지운다. 대상 표가 없으면 그 종류는 건너뜀.
    if to_regclass('public.names2') is not null then
      execute $q$delete from public.reports r where r.kind = 'name' and not exists (select 1 from public.names2 n where n.id = r.target)$q$;
      get diagnostics n_orphans = row_count; n_reports := n_reports + n_orphans;
    end if;
    if to_regclass('public.posts') is not null then
      execute $q$delete from public.reports r where r.kind = 'post' and not exists (select 1 from public.posts p where p.id = r.target)$q$;
      get diagnostics n_orphans = row_count; n_reports := n_reports + n_orphans;
    end if;
    if to_regclass('public.post_comments') is not null then
      execute $q$delete from public.reports r where r.kind = 'comment' and not exists (select 1 from public.post_comments c where c.id = r.target)$q$;
      get diagnostics n_orphans = row_count; n_reports := n_reports + n_orphans;
    end if;
  end if;
  return jsonb_build_object('users', n_users, 'posts', n_posts, 'names', n_names, 'reports', n_reports);
end $$;
revoke all on function public.daily_cleanup() from public, anon;
grant execute on function public.daily_cleanup() to authenticated;   -- 안에서 어드민·관리 역할만 통과
