-- 08_realtime.sql  (실행 순서: 01~07 뒤, 설계 2차_연결_실시간.md 8-4)
-- 목적: 홍보 잠금·도배 방지 함수 promo_claim·promo_clear, 표 3개, 비공개 채널 gn:site 의 인가 정책.
--       사람 수는 Presence(클라이언트 track), 홍보는 이 함수가 realtime.send 로 내보낸다. 다시 실행해도 안전하다.
-- 전제: 01(is_admin·app_config). 05 의 gn_text_check 가 있으면 이름 검사에 쓰고, 없으면 길이·모양 검사만 한다(05 를 나중에 실행해도 됨).
-- [미확인] realtime.send(payload, event, topic, private)·realtime.topic() 시그니처: 테스트 프로젝트에서 check_08_realtime.sql 의 '메시지 내보냄' 줄로 확인.
-- 값(uid·주소)은 이 파일에 없다.

create table if not exists public.promo_state (id int primary key check (id = 1), holder uuid, until timestamptz not null default 'epoch');
insert into public.promo_state values (1, null, 'epoch') on conflict (id) do nothing;
alter table public.promo_state enable row level security;     -- 정책 없음 = 함수(security definer)만 쓴다
revoke all on public.promo_state from anon, authenticated;

create table if not exists public.promo_log (
  id bigint generated always as identity primary key,
  uid uuid not null references auth.users on delete cascade,
  ok boolean not null, created_at timestamptz not null default now());
create index if not exists promo_log_uid_created on public.promo_log (uid, created_at);
create index if not exists promo_log_created on public.promo_log (created_at);
alter table public.promo_log enable row level security;
revoke all on public.promo_log from anon, authenticated;

create table if not exists public.promo_block (uid uuid primary key references auth.users on delete cascade, until timestamptz not null);
alter table public.promo_block enable row level security;
revoke all on public.promo_block from anon, authenticated;

-- 한도 초깃값(이미 있으면 건드리지 않는다). 어드민이 app_config 에서 바꾸면 코드 변경 없이 반영된다.
update public.app_config
   set value = value || '{"promo":{"lock_s":10,"gap_s":60,"per10m":5,"per1h":15,"site1h":60,"abuse10m":30,"block_h":24}}'::jsonb
 where key = 'limits' and not (value ? 'promo');

-- 홍보 시도. 거부는 raise 가 아니라 jsonb 로 돌려준다(예외면 트랜잭션이 되돌려져 promo_log 가 안 남아 도배 셈이 안 된다).
-- 결과: {ok:true} | {ok:false, code:'auth'|'blocked'|'bad_text'|'rate_limit'|'busy'}
create or replace function public.promo_claim(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  lim jsonb;
  lock_s int; gap_s int; per10m int; per1h int; site1h int; abuse10m int; block_h int;
  admin boolean; st public.promo_state; sent boolean := true;
begin
  if me is null then return jsonb_build_object('ok', false, 'code', 'auth'); end if;
  select coalesce(value -> 'promo', '{}'::jsonb) into lim from public.app_config where key = 'limits';
  lim := coalesce(lim, '{}'::jsonb);
  lock_s := coalesce((lim ->> 'lock_s')::int, 10);   gap_s := coalesce((lim ->> 'gap_s')::int, 60);
  per10m := coalesce((lim ->> 'per10m')::int, 5);    per1h := coalesce((lim ->> 'per1h')::int, 15);
  site1h := coalesce((lim ->> 'site1h')::int, 60);   abuse10m := coalesce((lim ->> 'abuse10m')::int, 30);
  block_h := coalesce((lim ->> 'block_h')::int, 24);
  admin := public.is_admin();

  -- 2 차단 중
  if exists (select 1 from public.promo_block where uid = me and until > now()) then
    insert into public.promo_log (uid, ok) values (me, false);
    return jsonb_build_object('ok', false, 'code', 'blocked');
  end if;
  -- 1% 확률로 지난 기록 정리(별도 cron 없음)
  if random() < 0.01 then
    delete from public.promo_log where created_at < now() - interval '2 days';
    delete from public.promo_block where until < now();
  end if;
  -- 3 시도(성공 여부 무관) 10분에 abuse10m 초과 → 차단
  if not admin and (select count(*) from public.promo_log where uid = me and created_at > now() - interval '10 minutes') >= abuse10m then
    insert into public.promo_block (uid, until) values (me, now() + make_interval(hours => block_h))
      on conflict (uid) do update set until = excluded.until;
    insert into public.promo_log (uid, ok) values (me, false);
    return jsonb_build_object('ok', false, 'code', 'blocked');
  end if;
  -- 4 코드 형식·이름 길이·금칙어
  begin
    if p_code is null or p_code !~ '^[0-9A-Za-z_-]{1,24}$' then raise exception 'bad_text'; end if;
    if p_name is null or char_length(btrim(p_name)) not between 1 and 20 then raise exception 'bad_text'; end if;
    if to_regprocedure('public.gn_text_check(text,text)') is not null then execute 'select public.gn_text_check(''name'', $1)' using p_name; end if;
  exception when others then
    insert into public.promo_log (uid, ok) values (me, false);
    return jsonb_build_object('ok', false, 'code', 'bad_text');
  end;
  -- 5 개인 한도(어드민은 건너뜀)
  if not admin and (
       exists (select 1 from public.promo_log where uid = me and ok and created_at > now() - make_interval(secs => gap_s))
    or (select count(*) from public.promo_log where uid = me and ok and created_at > now() - interval '10 minutes') >= per10m
    or (select count(*) from public.promo_log where uid = me and ok and created_at > now() - interval '1 hour') >= per1h) then
    insert into public.promo_log (uid, ok) values (me, false);
    return jsonb_build_object('ok', false, 'code', 'rate_limit');
  end if;
  -- 6 사이트 전체 1시간 상한
  if (select count(*) from public.promo_log where ok and created_at > now() - interval '1 hour') >= site1h then
    insert into public.promo_log (uid, ok) values (me, false);
    return jsonb_build_object('ok', false, 'code', 'busy');
  end if;
  -- 7 잠금(한 행 for update: 동시에 눌러도 한 명)
  select * into st from public.promo_state where id = 1 for update;
  if st.until > now() then
    insert into public.promo_log (uid, ok) values (me, false);
    return jsonb_build_object('ok', false, 'code', 'busy');
  end if;
  -- 8 잡기 + 내보내기
  update public.promo_state set holder = me, until = now() + make_interval(secs => lock_s) where id = 1;
  insert into public.promo_log (uid, ok) values (me, true);
  begin
    perform realtime.send(jsonb_build_object('code', p_code, 'name', btrim(p_name), 'at', (extract(epoch from clock_timestamp()) * 1000)::bigint), 'promo', 'gn:site', true);
  exception when others then sent := false;   -- 채널 쪽 문제로 잠금·기록까지 되돌리지 않는다
  end;
  return jsonb_build_object('ok', true, 'sent', sent);
end $$;

-- 어드민 전용: 잠금을 풀고 내 홍보 기록을 지운다(홍보 시험용)
create or replace function public.promo_clear() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.promo_state set until = 'epoch', holder = null where id = 1;
  delete from public.promo_log where uid = auth.uid();
  delete from public.promo_block where uid = auth.uid();
end $$;

revoke all on function public.promo_claim(text, text) from public, anon;
revoke all on function public.promo_clear() from public, anon;
grant execute on function public.promo_claim(text, text) to authenticated;
grant execute on function public.promo_clear() to authenticated;

-- 비공개 채널 gn:site 인가: 읽기(수신)와 Presence 만 허용. broadcast insert 정책이 없으므로 클라이언트 송신은 거부된다.
drop policy if exists gn_site_read on realtime.messages;
create policy gn_site_read on realtime.messages for select to authenticated using (realtime.topic() = 'gn:site');
drop policy if exists gn_site_presence on realtime.messages;
create policy gn_site_presence on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'gn:site' and extension = 'presence');
