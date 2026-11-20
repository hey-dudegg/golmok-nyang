-- 10_box.sql  (실행 순서 10, 설계 상자_놓기_설계.md 1장, D-112·113·119·122)
-- 목적: 지역(시/도 16곳)마다 선물 상자 1칸. 표 box_state·box_log, 함수 box_list·box_place·box_clear(+내부 방송 도우미 gn_box_send).
--       reports 에 kind='box' 추가, report·mod_list·mod_restore 에 box 분기를 더한다(05 를 create or replace 로 교체).
-- 선행: 01_base·05_moderation·08_realtime(gn:site 정책). 07 daily_cleanup 은 box_log 가 있으면 정리. 다시 실행해도 안전하다.
-- 표는 RLS 켬·정책 없음: 함수로만 읽고 쓴다. 판정은 서버 시각 now(). 방송 실패는 삼키고 놓기는 성공(Q5).

create table if not exists public.box_state (
  code text primary key,
  holder uuid references auth.users on delete set null,
  placed_at timestamptz not null, until timestamptz not null,
  seed int not null,
  id uuid not null, name text not null, name_hidden boolean not null default false);
alter table public.box_state enable row level security;
revoke all on public.box_state from anon, authenticated;

create table if not exists public.box_log (
  id bigint generated always as identity primary key,
  uid uuid not null references auth.users on delete cascade,
  code text not null, created_at timestamptz not null default now());
create index if not exists box_log_uid_created on public.box_log (uid, created_at);
create index if not exists box_log_created on public.box_log (created_at);
alter table public.box_log enable row level security;
revoke all on public.box_log from anon, authenticated;

-- 한도 초깃값(이미 있는 키가 이긴다). 어드민이 app_config 에서 값만 바꾼다.
update public.app_config set value = value || '{"box":{"hold_s":3600,"per1d":6}}'::jsonb
 where key = 'limits' and not (value ? 'box');
update public.app_config set value = value || '{"box":3}'::jsonb
 where key = 'report_hide' and not (value ? 'box');

-- 신고 종류에 box 추가(인라인 check 의 기본 이름 reports_kind_check 교체)
alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check check (kind in ('post', 'comment', 'name', 'box'));

-- 내부 방송 도우미(밖에서 못 부름). 실패해도 호출한 쪽을 되돌리지 않는다. 반환: 보냈으면 true
create or replace function public.gn_box_send(p_code text, p_id uuid, p_placed timestamptz, p_until timestamptz, p_seed int, p_name text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('code', p_code, 'id', p_id,
    'placed', (extract(epoch from p_placed) * 1000)::bigint, 'until', (extract(epoch from p_until) * 1000)::bigint,
    'seed', p_seed, 'name', p_name, 'at', (extract(epoch from clock_timestamp()) * 1000)::bigint), 'box', 'gn:site', true);
  return true;
exception when others then return false;
end $$;
revoke all on function public.gn_box_send(text, uuid, timestamptz, timestamptz, int, text) from public, anon, authenticated;

-- 지금 있는 상자 목록. holder 는 내보내지 않고 내 상자면 mine:true
create or replace function public.box_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'code', 'auth'); end if;
  return jsonb_build_object('now', (extract(epoch from now()) * 1000)::bigint, 'boxes', coalesce((
    select jsonb_agg(jsonb_build_object('code', b.code, 'id', b.id,
      'placed', (extract(epoch from b.placed_at) * 1000)::bigint, 'until', (extract(epoch from b.until) * 1000)::bigint,
      'seed', b.seed, 'name', case when b.name_hidden then null else b.name end, 'mine', b.holder is not distinct from auth.uid()) order by b.code)
    from public.box_state b where b.until > now()), '[]'::jsonb));
end $$;
revoke all on function public.box_list() from public, anon;
grant execute on function public.box_list() to authenticated;

-- 상자 놓기. 결과 {ok:true, now, box, sent} | {ok:false, code:'auth'|'bad_code'|'bad_name'|<필터 코드>|'mine_active'|'rate_limit'|'busy', until?}
create or replace function public.box_place(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); lim jsonb; hold_s int; per1d int; admin boolean; nm text; st public.box_state; sent boolean;
  codes text[] := array['11','12','26','27','28','30','31','36','41','43','44','47','48','50','51','52'];   -- 시/도 16곳(core/regions.js 와 같게)
begin
  if me is null or not public.can_name() then return jsonb_build_object('ok', false, 'code', 'auth'); end if;
  if p_code is null or not (p_code = any (codes)) then return jsonb_build_object('ok', false, 'code', 'bad_code'); end if;
  nm := btrim(coalesce(p_name, ''));
  if char_length(nm) not between 1 and 10 then return jsonb_build_object('ok', false, 'code', 'bad_name'); end if;
  begin
    perform public.gn_text_check('name', nm);   -- D-122 금칙어·URL·연락처·글자(한도에 세지 않음)
  exception when others then
    if sqlerrm like 'filter\_%' then return jsonb_build_object('ok', false, 'code', sqlerrm); end if;
    raise;   -- 필터 코드가 아닌 예상 밖 오류는 숨기지 않는다
  end;
  select coalesce(value -> 'box', '{}'::jsonb) into lim from public.app_config where key = 'limits';
  lim := coalesce(lim, '{}'::jsonb);
  hold_s := least(coalesce((lim ->> 'hold_s')::int, 3600), 7200);   -- 클라 core/box.js BOX_MAX_MS(2시간)와 맞춤
  per1d := coalesce((lim ->> 'per1d')::int, 6);
  admin := public.is_admin();
  perform pg_advisory_xact_lock(hashtext(me::text));   -- 같은 사람의 동시 요청을 줄 세운다(mine_active·rate_limit 검사 보호)
  if not admin then
    if exists (select 1 from public.box_state where holder = me and until > now()) then
      return jsonb_build_object('ok', false, 'code', 'mine_active');
    end if;
    if (select count(*) from public.box_log where uid = me and created_at > now() - interval '24 hours') >= per1d then
      return jsonb_build_object('ok', false, 'code', 'rate_limit');
    end if;
  end if;
  -- 한 문장으로 잡기: 비었거나 만료된 칸만 덮어쓴다(동시에 눌러도 한 명)
  insert into public.box_state as b (code, holder, placed_at, until, seed, id, name, name_hidden)
    values (p_code, me, now(), now() + make_interval(secs => hold_s), (random() * 2147483646)::int, gen_random_uuid(), nm, false)
  on conflict (code) do update set holder = excluded.holder, placed_at = excluded.placed_at, until = excluded.until,
    seed = excluded.seed, id = excluded.id, name = excluded.name, name_hidden = false
    where b.until <= now()
  returning * into st;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'busy',
      'until', (select (extract(epoch from until) * 1000)::bigint from public.box_state where code = p_code));
  end if;
  insert into public.box_log (uid, code) values (me, p_code);
  sent := public.gn_box_send(st.code, st.id, st.placed_at, st.until, st.seed, st.name);
  return jsonb_build_object('ok', true, 'sent', sent, 'now', (extract(epoch from now()) * 1000)::bigint,
    'box', jsonb_build_object('code', st.code, 'id', st.id, 'placed', (extract(epoch from st.placed_at) * 1000)::bigint,
      'until', (extract(epoch from st.until) * 1000)::bigint, 'seed', st.seed, 'name', st.name, 'mine', true));
end $$;
revoke all on function public.box_place(text, text) from public, anon;
grant execute on function public.box_place(text, text) to authenticated;

-- 어드민 전용: 상자를 바로 사라지게(until = now()) 하고 방송
create or replace function public.box_clear(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare st public.box_state;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  update public.box_state set until = now() where code = p_code and until > now() returning * into st;
  if not found then return jsonb_build_object('ok', true, 'cleared', false); end if;
  perform public.gn_box_send(st.code, st.id, st.placed_at, st.until, st.seed, case when st.name_hidden then null else st.name end);
  return jsonb_build_object('ok', true, 'cleared', true);
end $$;
revoke all on function public.box_clear(text) from public, anon;
grant execute on function public.box_clear(text) to authenticated;

-- 05 의 신고·검토·복구에 box 분기 추가(숨김 = 이름만 name_hidden, 상자·시간은 유지)
create or replace function public.report(p_kind text, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_status text; v_th int; v_n int; bx public.box_state;
begin
  if auth.uid() is null or p_kind is null or p_kind not in ('post', 'comment', 'name', 'box') then raise exception 'need_member' using errcode = 'P0001'; end if;
  perform public.gn_rate_check('report');   -- D-106 계정당 시간당 신고 횟수
  if p_kind in ('name', 'box') then
    if not public.can_name() then raise exception 'need_member' using errcode = 'P0001'; end if;
    if p_kind = 'name' then select uid, status into v_owner, v_status from public.names2 where id = p_target for update;
    else select holder, case when name_hidden or until <= now() then 'hidden' else 'ok' end into v_owner, v_status from public.box_state where id = p_target for update; end if;
  else
    if not public.is_member() then raise exception 'need_member' using errcode = 'P0001'; end if;
    if p_kind = 'post' then select uid, status into v_owner, v_status from public.posts where id = p_target for update;
    else select uid, status into v_owner, v_status from public.post_comments where id = p_target for update; end if;
  end if;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_status <> 'ok' or v_owner = auth.uid() then return; end if;
  insert into public.reports (kind, target, uid) values (p_kind, p_target, auth.uid()) on conflict do nothing;
  select count(*) into v_n from public.reports where kind = p_kind and target = p_target and not cleared;
  select coalesce((value ->> p_kind)::int, case p_kind when 'box' then 3 else 5 end) into v_th from public.app_config where key = 'report_hide';
  if v_n >= coalesce(v_th, case p_kind when 'box' then 3 else 5 end) then
    if p_kind = 'name' then update public.names2 set status = 'hidden', hidden_at = now() where id = p_target;
    elsif p_kind = 'box' then
      update public.box_state set name_hidden = true where id = p_target returning * into bx;
      perform public.gn_box_send(bx.code, bx.id, bx.placed_at, bx.until, bx.seed, null);
    elsif p_kind = 'post' then update public.posts set status = 'hidden', hidden_at = now() where id = p_target;
    else update public.post_comments set status = 'hidden', hidden_at = now() where id = p_target; end if;
  end if;
end $$;
revoke all on function public.report(text, uuid) from public, anon;
grant execute on function public.report(text, uuid) to authenticated;

create or replace function public.mod_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'need_admin' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(to_jsonb(u) order by u.hidden_at desc) from (
    select * from (
      select 'name'::text as kind, n.id as target, n.name as text, n.hidden_at,
             (select count(*) from public.reports r where r.kind = 'name' and r.target = n.id and not r.cleared) as reports
        from public.names2 n where n.status = 'hidden'
      union all
      select 'post', p.id, left(p.body, 60), p.hidden_at,
             (select count(*) from public.reports r where r.kind = 'post' and r.target = p.id and not r.cleared)
        from public.posts p where p.status = 'hidden'
      union all
      select 'comment', c.id, left(c.body, 60), c.hidden_at,
             (select count(*) from public.reports r where r.kind = 'comment' and r.target = c.id and not r.cleared)
        from public.post_comments c where c.status = 'hidden'
      union all
      select 'box', b.id, b.name, b.placed_at,   -- 상자는 숨긴 시각 열이 없어 놓은 시각으로 대신
             (select count(*) from public.reports r where r.kind = 'box' and r.target = b.id and not r.cleared)
        from public.box_state b where b.name_hidden) a
    order by hidden_at desc limit 50) u), '[]'::jsonb);
end $$;
revoke all on function public.mod_list() from public, anon;
grant execute on function public.mod_list() to authenticated;

create or replace function public.mod_restore(p_kind text, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare bx public.box_state;
begin
  if not public.is_admin() then raise exception 'need_admin' using errcode = 'P0001'; end if;
  if p_kind = 'name' then update public.names2 set status = 'ok', hidden_at = null where id = p_target and status = 'hidden';
  elsif p_kind = 'post' then update public.posts set status = 'ok', hidden_at = null where id = p_target and status = 'hidden';
  elsif p_kind = 'comment' then update public.post_comments set status = 'ok', hidden_at = null where id = p_target and status = 'hidden';
  elsif p_kind = 'box' then update public.box_state set name_hidden = false where id = p_target and name_hidden returning * into bx;
  else raise exception 'not_found' using errcode = 'P0001'; end if;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_kind = 'box' and bx.until > now() then perform public.gn_box_send(bx.code, bx.id, bx.placed_at, bx.until, bx.seed, bx.name); end if;
  update public.reports set cleared = true where kind = p_kind and target = p_target;
end $$;
revoke all on function public.mod_restore(text, uuid) from public, anon;
grant execute on function public.mod_restore(text, uuid) to authenticated;
