-- 04_names.sql  (실행 순서 4/8, 설계 2차_연결_표.md 2-5·2-6)
-- 목적: 이름 짓기 names2·name_votes, 투표 name_vote(), 본인 이름 지우기 name_remove(), 어드민 키값 admin_kv(레시피).
--       이름은 can_name() 이면 제안·투표(지금은 익명 허용 D-84). 투표는 RPC 로만, 개수는 서버가 다시 센다.
-- 선행: 01_base·02_members. 다시 실행해도 안전하다. 05_moderation 이 names2_before_insert 를 교체해 필터·도배 검사를 더한다.

create table if not exists public.names2 (
  id uuid primary key default gen_random_uuid(),
  region text not null check (char_length(region) between 1 and 40),   -- 화면 경로 names2/{code}/list 의 code
  name text not null check (char_length(name) between 1 and 8),        -- NAME_RULE.MAXLEN 과 맞춤
  uid uuid references auth.users on delete cascade, legacy_author text, nick text,
  up int not null default 0, down int not null default 0,
  status text not null default 'ok' check (status in ('ok','hidden','removed')),
  hidden_at timestamptz, created_at timestamptz not null default now());
create index if not exists names2_region_idx on public.names2 (region, created_at);
-- 같은 지역에서 보이는 이름은 공백·대소문자를 무시하고 하나만(화면의 중복 판정과 같음). 어기면 unique 오류 -> 어댑터가 'dup'
create unique index if not exists names2_region_norm_uq on public.names2 (region, lower(regexp_replace(name, '\s', '', 'g'))) where status = 'ok';

create table if not exists public.name_votes (
  name_id uuid references public.names2 on delete cascade,
  uid uuid references auth.users on delete cascade,
  vote text not null check (vote in ('up','down')), primary key (name_id, uid));

-- D-106 투표 횟수 제한용 기록(취소하면 name_votes 행이 지워져 셀 수 없으므로 따로). 본인 1시간 지난 행은 name_vote 가 지운다.
create table if not exists public.name_vote_log (uid uuid references auth.users on delete cascade, created_at timestamptz not null default now());
create index if not exists name_vote_log_uid_idx on public.name_vote_log (uid, created_at);
alter table public.name_vote_log enable row level security;
revoke all on public.name_vote_log from anon, authenticated;

alter table public.names2 enable row level security;
alter table public.name_votes enable row level security;
revoke all on public.names2, public.name_votes from anon, authenticated;
grant select on public.names2 to anon, authenticated;
grant insert (region, name, uid) on public.names2 to authenticated;
grant select on public.name_votes to authenticated;      -- 본인 표만 보인다(정책). 쓰기는 RPC 로만

drop policy if exists names2_read on public.names2;
create policy names2_read on public.names2 for select to anon, authenticated
  using (status = 'ok' or uid = auth.uid() or public.is_admin());
drop policy if exists names2_insert on public.names2;
create policy names2_insert on public.names2 for insert to authenticated
  with check (uid = auth.uid() and public.can_name());
drop policy if exists name_votes_read on public.name_votes;
create policy name_votes_read on public.name_votes for select to authenticated
  using (uid = auth.uid() or public.is_admin());

-- 제안 insert 앞: 권한 -> 서버 열 덮어쓰기 -> (uid, 지역)당 5개(D-31). 필터·도배는 05 에서 더한다.
create or replace function public.names2_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_name() then raise exception 'need_member' using errcode = 'P0001'; end if;
  new.name := btrim(new.name);
  select nick into new.nick from public.members where uid = auth.uid();   -- 익명이면 null(화면은 작성자 표시를 생략)
  new.legacy_author := null; new.up := 1; new.down := 0; new.status := 'ok';   -- 제안자는 좋아요 1로 시작(D-31)
  new.hidden_at := null; new.created_at := now();
  if (select count(*) from public.names2 where uid = new.uid and region = new.region and status = 'ok') >= 5 then
    raise exception 'name_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.names2_before_insert() from public, anon, authenticated;
drop trigger if exists names2_before_insert on public.names2;
create trigger names2_before_insert before insert on public.names2 for each row execute function public.names2_before_insert();

-- 제안 insert 뒤: 제안자의 좋아요 표 1행
create or replace function public.names2_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.uid is not null then insert into public.name_votes (name_id, uid, vote) values (new.id, new.uid, 'up') on conflict do nothing; end if;
  return new;
end $$;
revoke all on function public.names2_after_insert() from public, anon, authenticated;
drop trigger if exists names2_after_insert on public.names2;
create trigger names2_after_insert after insert on public.names2 for each row execute function public.names2_after_insert();

-- 좋아요·싫어요. 같은 표를 다시 누르면 취소, 반대 표면 바꿈. up·down 을 다시 세고 down > up 이면 내린다(D-31).
create or replace function public.name_vote(p_name_id uuid, p_vote text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_status text; v_cur text; v_up int; v_down int;
begin
  if auth.uid() is null or not public.can_name() then raise exception 'need_member' using errcode = 'P0001'; end if;
  if p_vote is null or p_vote not in ('up','down') then raise exception 'bad_vote' using errcode = 'P0001'; end if;
  if to_regprocedure('public.gn_rate_check(text,text)') is not null then perform public.gn_rate_check('vote'); end if;   -- 05 적용 뒤: 시간당 횟수(D-106)
  select status into v_status from public.names2 where id = p_name_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_status <> 'ok' then return jsonb_build_object('status', v_status, 'gone', true); end if;
  delete from public.name_vote_log where uid = auth.uid() and created_at <= now() - interval '1 hour';
  insert into public.name_vote_log (uid) values (auth.uid());
  select vote into v_cur from public.name_votes where name_id = p_name_id and uid = auth.uid();
  if v_cur is null then insert into public.name_votes (name_id, uid, vote) values (p_name_id, auth.uid(), p_vote);
  elsif v_cur = p_vote then delete from public.name_votes where name_id = p_name_id and uid = auth.uid();
  else update public.name_votes set vote = p_vote where name_id = p_name_id and uid = auth.uid();
  end if;
  select count(*) filter (where vote = 'up'), count(*) filter (where vote = 'down') into v_up, v_down
    from public.name_votes where name_id = p_name_id;
  update public.names2 set up = v_up, down = v_down, status = case when v_down > v_up then 'removed' else status end
   where id = p_name_id returning status into v_status;
  return jsonb_build_object('up', v_up, 'down', v_down, 'status', v_status, 'gone', v_status <> 'ok');
end $$;
revoke all on function public.name_vote(uuid, text) from public, anon;
grant execute on function public.name_vote(uuid, text) to authenticated;

-- 내가 지은 이름 지우기(어드민은 아무거나). 지울 것이 없으면 not_found.
create or replace function public.name_remove(p_name_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'need_member' using errcode = 'P0001'; end if;
  delete from public.names2 where id = p_name_id and (uid = auth.uid() or public.is_admin());
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.name_remove(uuid) from public, anon;
grant execute on function public.name_remove(uuid) to authenticated;

-- 어드민 키값(레시피 등). 화면 경로 admin/recipes. 읽기·쓰기 모두 어드민만.
create table if not exists public.admin_kv (key text primary key, value jsonb not null);
alter table public.admin_kv enable row level security;
revoke all on public.admin_kv from anon, authenticated;
grant select, insert, update, delete on public.admin_kv to authenticated;
drop policy if exists admin_kv_all on public.admin_kv;
create policy admin_kv_all on public.admin_kv for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
