-- 03_board.sql  (실행 순서 3/8, 설계 2차_연결_표.md 2-3)
-- 목적: 게시판 표 posts·post_comments·post_likes. 읽기는 누구나, 좋아요는 익명 포함, 글·댓글 쓰기는 can_post() + 스위치(D-83).
--       insert 앞 트리거가 board_write 가 꺼져 있으면 'feature_off' 를 먼저 던진다(정책 거부보다 분명한 코드).
-- 선행: 01_base·02_members. 다시 실행해도 안전하다(표는 없을 때만 만들고, 함수·정책·권한은 덮어쓴다).
-- 05_moderation 이 posts_before_insert·comments_before_insert 를 create or replace 로 교체해 필터·도배 검사를 더한다.

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  uid uuid references auth.users on delete cascade,        -- null = 이전 데이터(D-51)
  legacy_author text, nick text not null,
  body text not null check (char_length(body) between 1 and 500),
  img text,                                                -- 저장소 경로 '<uid>/<id>.webp|jpg', 서버(post_attach)만 채움
  status text not null default 'ok' check (status in ('ok','hidden','removed')),
  hidden_at timestamptz, created_at timestamptz not null default now());
create index if not exists posts_created_idx on public.posts (created_at desc);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts on delete cascade,
  uid uuid references auth.users on delete cascade, legacy_author text, nick text not null,
  body text not null check (char_length(body) between 1 and 200),
  status text not null default 'ok' check (status in ('ok','hidden','removed')),
  hidden_at timestamptz, created_at timestamptz not null default now());
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

create table if not exists public.post_likes (
  post_id uuid references public.posts on delete cascade,
  uid uuid references auth.users on delete cascade, primary key (post_id, uid));

alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_likes enable row level security;

-- 표 권한: 모두 거두고 필요한 것만. 서버가 정하는 열(nick·img·status·시각)은 클라이언트가 넣을 수 없다.
revoke all on public.posts, public.post_comments, public.post_likes from anon, authenticated;
grant select on public.posts, public.post_comments, public.post_likes to anon, authenticated;
grant insert (uid, body) on public.posts to authenticated;
grant insert (post_id, uid, body) on public.post_comments to authenticated;
grant insert (post_id, uid) on public.post_likes to authenticated;
grant delete on public.posts, public.post_comments, public.post_likes to authenticated;

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to anon, authenticated
  using (status = 'ok' or uid = auth.uid() or public.is_admin());
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (uid = auth.uid() and public.can_post());
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated
  using (uid = auth.uid() or public.is_admin());

drop policy if exists comments_read on public.post_comments;
create policy comments_read on public.post_comments for select to anon, authenticated
  using ((status = 'ok' or uid = auth.uid() or public.is_admin())
         and exists (select 1 from public.posts p where p.id = post_id));   -- 부모 글이 보이는 경우만(posts 정책 적용)
drop policy if exists comments_insert on public.post_comments;
create policy comments_insert on public.post_comments for insert to authenticated
  with check (uid = auth.uid() and public.can_post());
drop policy if exists comments_delete on public.post_comments;
create policy comments_delete on public.post_comments for delete to authenticated
  using (uid = auth.uid() or public.is_admin());

drop policy if exists likes_read on public.post_likes;
create policy likes_read on public.post_likes for select to anon, authenticated using (true);
drop policy if exists likes_insert on public.post_likes;
create policy likes_insert on public.post_likes for insert to authenticated   -- 익명 포함(D-67), 보이는 글에만
  with check (uid = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists likes_delete on public.post_likes;
create policy likes_delete on public.post_likes for delete to authenticated using (uid = auth.uid());

-- 글 insert 앞 트리거: ① 스위치 ② 회원 확인 ③ 서버 열 덮어쓰기. (필터·도배는 05 에서 더한다)
create or replace function public.posts_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_nick text;
begin
  if not public.gn_feature('board_write') then raise exception 'feature_off' using errcode = 'P0001'; end if;
  select nick into v_nick from public.members where uid = auth.uid();
  if auth.uid() is null or public.is_anon() or v_nick is null then raise exception 'need_member' using errcode = 'P0001'; end if;
  new.nick := v_nick; new.legacy_author := null; new.status := 'ok'; new.img := null;
  new.hidden_at := null; new.created_at := now();
  return new;
end $$;
revoke all on function public.posts_before_insert() from public, anon, authenticated;
drop trigger if exists posts_before_insert on public.posts;
create trigger posts_before_insert before insert on public.posts for each row execute function public.posts_before_insert();

create or replace function public.comments_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_nick text;
begin
  if not public.gn_feature('board_write') then raise exception 'feature_off' using errcode = 'P0001'; end if;
  select nick into v_nick from public.members where uid = auth.uid();
  if auth.uid() is null or public.is_anon() or v_nick is null then raise exception 'need_member' using errcode = 'P0001'; end if;
  new.nick := v_nick; new.legacy_author := null; new.status := 'ok';
  new.hidden_at := null; new.created_at := now();
  return new;
end $$;
revoke all on function public.comments_before_insert() from public, anon, authenticated;
drop trigger if exists comments_before_insert on public.post_comments;
create trigger comments_before_insert before insert on public.post_comments for each row execute function public.comments_before_insert();
