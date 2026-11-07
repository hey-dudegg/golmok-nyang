-- 02_members.sql  (실행 순서 2/8, 설계 2차_연결_표.md 2-2)
-- 목적: 회원 표 members, 교감 기록 표 bonds. 로그인 보류(D-82) 동안은 만들어만 두고 비어 있다(익명은 insert 불가).
-- 선행: 01_base. 다시 실행해도 안전하다.

create table if not exists public.members (
  uid uuid primary key references auth.users on delete cascade,
  nick text not null check (char_length(nick) between 1 and 12),
  home text check (char_length(home) <= 40),
  age_ok boolean not null check (age_ok),                  -- 만 14세 이상 확인(D-52)
  terms_ver text not null,
  agreed_at timestamptz not null default now(),
  joined_at timestamptz not null default now());
alter table public.members enable row level security;
drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated using (uid = auth.uid() or public.is_admin());
drop policy if exists members_insert on public.members;
create policy members_insert on public.members for insert to authenticated with check (uid = auth.uid() and not public.is_anon());
drop policy if exists members_update on public.members;
create policy members_update on public.members for update to authenticated using (uid = auth.uid()) with check (uid = auth.uid());
revoke all on public.members from anon;
revoke update on public.members from authenticated;
grant update (nick, home) on public.members to authenticated;   -- 그 밖의 열은 바꿀 수 없다

-- 약관 버전이 app_config.terms_ver 와 다르면 가입 거부. (닉네임 필터는 05_moderation 에서 이 함수를 교체해 더한다)
create or replace function public.members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if tg_op = 'INSERT' then
    select value #>> '{}' into v from public.app_config where key = 'terms_ver';
    if v is null or new.terms_ver is distinct from v then raise exception 'terms_ver' using errcode = 'P0001'; end if;
    new.agreed_at := now(); new.joined_at := now();
  else
    new.uid := old.uid; new.age_ok := old.age_ok; new.terms_ver := old.terms_ver;
    new.agreed_at := old.agreed_at; new.joined_at := old.joined_at;
  end if;
  return new;
end $$;
drop trigger if exists members_guard on public.members;
create trigger members_guard before insert or update on public.members for each row execute function public.members_guard();

-- 교감 기록(회원만 본인 것). 익명 방문자의 교감 기록은 브라우저 localStorage 에 둔다.
create table if not exists public.bonds (
  uid uuid primary key references auth.users on delete cascade,
  data jsonb not null check (pg_column_size(data) <= 16384),
  updated_at timestamptz not null default now());
alter table public.bonds enable row level security;
drop policy if exists bonds_own on public.bonds;
create policy bonds_own on public.bonds for all to authenticated
  using (uid = auth.uid() and public.is_member()) with check (uid = auth.uid() and public.is_member());
revoke all on public.bonds from anon;
