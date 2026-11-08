-- 01_base.sql  (실행 순서 1/8, 설계 2차_연결_표.md 2-1)
-- 목적: 어드민 표, 공통 권한 함수(is_admin·is_anon·is_member), 설정 표 app_config(+기능 스위치 features),
--       권한 함수 gn_feature·can_post·can_name. 다시 실행해도 안전하다(이미 있으면 덮어쓰거나 건너뜀).
-- 실행: Supabase SQL Editor에 통째로 붙여 넣고 Run. 테스트 프로젝트 먼저. 값(uid·주소)은 이 파일에 없다.

create table if not exists public.admins (uid uuid primary key references auth.users on delete cascade);
alter table public.admins enable row level security;          -- 정책 없음 = 클라이언트 접근 전부 거부
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where uid = auth.uid());
$$;

create or replace function public.is_anon() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true);   -- 클레임이 없으면 익명 취급(안전 쪽)
$$;

-- is_member 는 02_members 의 표를 읽으므로 plpgsql(실행할 때 표를 확인)로 둔다
create or replace function public.is_member() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return not public.is_anon() and exists (select 1 from public.members where uid = auth.uid());
end $$;

create table if not exists public.app_config (key text primary key, value jsonb not null);
alter table public.app_config enable row level security;
drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config for select to anon, authenticated using (true);
drop policy if exists app_config_admin_write on public.app_config;
create policy app_config_admin_write on public.app_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete on public.app_config from anon;

-- 초깃값(이미 있으면 건드리지 않는다). features 는 D-82~84 스위치.
insert into public.app_config (key, value) values
  ('features',    '{"login":false,"board_write":false,"names_anon":true}'),
  ('report_hide', '{"post":5,"comment":5,"name":5}'),
  ('terms_ver',   '"2026-10"'),
  ('limits',      '{"post":{"gap_s":30,"per10m":3,"per1h":6,"dup_h":24},"comment":{"gap_s":10,"per10m":10,"per1h":30,"dup_h":1},"name":{"gap_s":5,"per10m":10,"per1h":20},"nick":{"per1h":3},"report":{"per1h":10},"vote":{"per1h":30}}')
on conflict (key) do nothing;

-- 기능 스위치 판정. 값이 없으면 꺼짐.
create or replace function public.gn_feature(f text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value ->> f)::boolean from public.app_config where key = 'features'), false);
$$;

-- 권한은 이 두 함수에만 모은다. 정책·트리거·RPC 는 이 둘만 부른다.
create or replace function public.can_post() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.gn_feature('board_write') and public.is_member();
$$;

create or replace function public.can_name() returns boolean
language sql stable security definer set search_path = '' as $$
  select case when public.gn_feature('names_anon') then auth.uid() is not null
              else public.is_member() end;
$$;
