-- 11_log.sql  (실행 순서 11, 설계 로그_설계.md 3~7장, D-44·D-50·D-87·D-111)
-- 목적: 표 log_all·log_err, 쓰기 RPC log_write(p jsonb), 일별 교체 rotate_logs(), 서버 마스킹 도우미 gn_log_mask().
-- 선행: 01_base(is_admin 등)·07_misc(daily_cleanup 이 rotate_logs 를 부른다)·09_cron. 다시 실행해도 안전하다.
-- 표는 RLS 켬·정책 없음·권한 회수: 직접 select/insert 는 모두 거부, RPC 로만 쓴다. 읽기는 대시보드 SQL(L-5 에서 어드민 RPC 추가).
-- 마스킹 규칙은 prototype/src/core/log_rules.js 와 같은 순서(서버가 강제, 클라이언트 불신).
-- uh = 사용자 번호·날짜·소금의 md5 앞 8자(pgcrypto 안 씀). 소금은 이 DB 안 표 log_salt 한 줄(첫 실행 때 DB 가 무작위로 만든다, 저장소에 값 없음).
--   app_config 는 anon 이 읽을 수 있어 소금을 두지 않고, RLS 만 켠 별도 표에 둔다.
-- 보관: 교체한 일일 표는 30일(D-50)이 지나면 drop. 하루 상한은 설계 5장(log_all info 5000·warn/error 포함 10000, log_err 2000, 분당 전체 120·사용자 10).

-- 소금 표(정책 없음 = log_write 같은 보안 함수만 읽는다)
create table if not exists public.log_salt (id int primary key check (id = 1), salt text not null);
alter table public.log_salt enable row level security;
revoke all on public.log_salt from public, anon, authenticated;
insert into public.log_salt (id, salt) values (1, md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text)) on conflict (id) do nothing;

-- 두 표 만들기(없을 때만). rotate_logs 가 이름을 바꾼 뒤에도 같은 정의로 다시 만든다.
create or replace function public.gn_log_make_tables() returns void
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  foreach t in array array['log_all', 'log_err'] loop
    execute format($f$create table if not exists public.%1$I (
      id bigint generated always as identity primary key,
      ts timestamptz not null default now(),
      lvl text not null, part text not null, code text not null,
      msg text not null, ctx jsonb not null default '{}'::jsonb, uh text, ver text)$f$, t);
    execute format('create index if not exists %I on public.%I (ts)', t || '_ts_idx', t);
    execute format('create index if not exists %I on public.%I (part)', t || '_part_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
revoke all on function public.gn_log_make_tables() from public, anon, authenticated;
select public.gn_log_make_tables();

-- 마스킹(log_rules.js maskText 와 같은 순서): URL -> 파일 경로 -> 이메일 -> JWT -> IPv6 -> IPv4 -> 전화 -> 긴 토큰 -> ?# 절단
create or replace function public.gn_log_mask(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := coalesce(p, '');
begin
  t := regexp_replace(t, 'https?://\S*', '[x]', 'gi');
  t := regexp_replace(t, '[A-Za-z]:\\\S*', '[x]', 'g');
  t := regexp_replace(t, 'file:\S*', '[x]', 'gi');
  t := regexp_replace(t, '/(Users|home)/\S*', '[x]', 'g');
  t := regexp_replace(t, '\S*@\S*', '[x]', 'g');
  t := regexp_replace(t, 'eyJ\S*', '[x]', 'g');
  t := regexp_replace(t, '(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{1,4}', '[x]', 'gi');
  t := regexp_replace(t, '\y\d{1,3}(?:\.\d{1,3}){3}\y', '[x]', 'g');
  t := regexp_replace(t, '(?<!\w)\+?\d{2,4}[-. ]?\d{3,4}[-. ]?\d{4}(?!\w)', '[x]', 'g');
  t := regexp_replace(t, '[A-Za-z0-9_-]{20,}', '[x]', 'g');
  t := regexp_replace(t, '[?#]\S+', '', 'g');
  return t;
end $$;
revoke all on function public.gn_log_mask(text) from public, anon, authenticated;

-- 쓰기 RPC. 항상 jsonb 를 돌려주고 실패·상한 초과는 조용히 버린다(ok=false). ts 는 서버 now(), uh 는 일별 해시.
-- p = {lvl, part, code, msg, ctx, ver}. ctx 허용 키: region ev n ms status ua_class file (그 밖은 버림), 300바이트·msg 120자·ver 40자 상한.
-- info 는 log_all 에만, warn·error 는 log_all 과 log_err 두 표에 기록한다.
create or replace function public.log_write(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_lvl text; v_part text; v_code text; v_msg text; v_ver text; v_uh text; v_salt text;
  v_ctx jsonb := '{}'::jsonb; v_all int; v_in jsonb; v_v jsonb; v_k text; v_s text; v_n int;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return jsonb_build_object('ok', false, 'why', 'bad'); end if;
  if pg_column_size(p) > 4096 then return jsonb_build_object('ok', false, 'why', 'bad'); end if;
  v_part := case when p ->> 'part' in ('server', 'auth', 'privacy', 'client', 'content', 'admin') then p ->> 'part' else 'client' end;
  v_lvl := case when p ->> 'lvl' in ('info', 'warn', 'error') then p ->> 'lvl' else 'info' end;
  v_code := case
    when v_part = 'server' and p ->> 'code' in ('rpc_fail', 'rt_over_limit', 'db_timeout', 'daily_job_fail') then p ->> 'code'
    when v_part = 'auth' and p ->> 'code' in ('login_fail', 'token_refresh_fail', 'provider_error') then p ->> 'code'
    when v_part = 'privacy' and p ->> 'code' in ('pii_blocked', 'rls_denied', 'delete_req') then p ->> 'code'
    when v_part = 'client' and p ->> 'code' in ('js_error', 'module_load_fail', 'webgl_fail') then p ->> 'code'
    when v_part = 'content' and p ->> 'code' in ('post_reject', 'feedback_reject', 'name_reject') then p ->> 'code'
    when v_part = 'admin' and p ->> 'code' = 'admin_action' then p ->> 'code'
    else 'other' end;
  v_msg := left(public.gn_log_mask(left(p ->> 'msg', 500)), 120);
  v_ver := left(public.gn_log_mask(left(p ->> 'ver', 500)), 40);
  v_in := p -> 'ctx';
  if v_in is not null and jsonb_typeof(v_in) = 'object' then
    foreach v_k in array array['region', 'ev', 'n', 'ms', 'status', 'ua_class', 'file'] loop
      v_v := v_in -> v_k;
      if v_v is null then continue; end if;
      if jsonb_typeof(v_v) = 'number' then
        v_ctx := v_ctx || jsonb_build_object(v_k, v_v);
      elsif jsonb_typeof(v_v) = 'string' then
        v_s := v_v #>> '{}';
        if v_k = 'ua_class' then
          if v_s in ('mobile', 'desktop') then v_ctx := v_ctx || jsonb_build_object(v_k, v_s); end if;
        else
          v_ctx := v_ctx || jsonb_build_object(v_k, left(public.gn_log_mask(left(v_s, 500)), 60));
        end if;
      end if;
      if octet_length(v_ctx::text) > 300 then v_ctx := v_ctx - v_k; exit; end if;
    end loop;
  end if;
  -- 남용 방지: uh 는 서버가 계산(클라이언트 값 불신). 사용자별 분당 10건, 전체 분당 120건(info·warn 은 100 넘으면 버려 error 자리를 남김)
  if auth.uid() is not null then
    select salt into v_salt from public.log_salt where id = 1;
    v_uh := left(md5(auth.uid()::text || to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD') || coalesce(v_salt, '')), 8);
    select count(*) into v_n from public.log_all where uh = v_uh and ts > now() - interval '1 minute';
    if v_n >= 10 then return jsonb_build_object('ok', false, 'why', 'rate'); end if;
  end if;
  select count(*) into v_n from public.log_all where ts > now() - interval '1 minute';
  if v_n >= 120 or (v_n >= 100 and v_lvl <> 'error') then return jsonb_build_object('ok', false, 'why', 'rate'); end if;
  -- 하루 상한: info 는 log_all 5000 넘으면 버림, warn·error 는 log_all 10000 넘으면 log_err 에만 남김
  select count(*) into v_all from public.log_all;
  if v_all >= 5000 and v_lvl = 'info' then return jsonb_build_object('ok', false, 'why', 'cap'); end if;
  if v_all < 10000 then
    insert into public.log_all (lvl, part, code, msg, ctx, uh, ver) values (v_lvl, v_part, v_code, v_msg, v_ctx, v_uh, v_ver);
  end if;
  if v_lvl in ('warn', 'error') then
    select count(*) into v_n from public.log_err;
    if v_n < 2000 then
      insert into public.log_err (lvl, part, code, msg, ctx, uh, ver) values (v_lvl, v_part, v_code, v_msg, v_ctx, v_uh, v_ver);
    elsif v_all >= 10000 then return jsonb_build_object('ok', false, 'why', 'cap');
    end if;
  end if;
  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'why', 'err');   -- 로그가 서비스를 막지 않는다
end $$;
revoke all on function public.log_write(jsonb) from public;
grant execute on function public.log_write(jsonb) to anon, authenticated;

-- 일별 교체. 어제(한국 시간) 표 이름 log_all_yymmdd 가 이미 있으면 건너뛴다(재실행 안전).
-- 교체한 표의 인덱스 이름도 바꿔 새 표가 같은 이름을 쓰게 한다. 30일 지난 일일 표는 drop. 결과는 새 log_all 에 info 1줄.
-- 호출은 daily_cleanup()(pg_cron)에서만: anon·authenticated 실행 권한 없음(D-111).
create or replace function public.rotate_logs() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ymd text := to_char((now() at time zone 'Asia/Seoul')::date - 1, 'YYMMDD');
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_rot boolean := false; v_drop int := 0; v_rows bigint := 0; r record; t text;
begin
  if to_regclass('public.log_all_' || v_ymd) is null and to_regclass('public.log_err_' || v_ymd) is null then
    select (select count(*) from public.log_all) + (select count(*) from public.log_err) into v_rows;
    foreach t in array array['log_all', 'log_err'] loop
      execute format('alter index public.%I rename to %I', t || '_ts_idx', t || '_ts_' || v_ymd);
      execute format('alter index public.%I rename to %I', t || '_part_idx', t || '_part_' || v_ymd);
      execute format('alter table public.%I rename to %I', t, t || '_' || v_ymd);
    end loop;
    perform public.gn_log_make_tables();
    v_rot := true;
  end if;
  for r in select tablename from pg_catalog.pg_tables
            where schemaname = 'public' and tablename ~ '^log_(all|err)_[0-9]{6}$' loop
    if to_date(right(r.tablename, 6), 'YYMMDD') < v_today - 30 then
      execute format('drop table public.%I', r.tablename);
      v_drop := v_drop + 1;
    end if;
  end loop;
  insert into public.log_all (lvl, part, code, msg, ctx)
    values ('info', 'server', 'other', 'rotate_logs rotated=' || v_rot || ' dropped=' || v_drop || ' rows=' || v_rows, '{}'::jsonb);
  return jsonb_build_object('rotated', v_rot, 'dropped', v_drop, 'rows', v_rows);
exception when others then
  begin
    insert into public.log_err (lvl, part, code, msg, ctx) values ('error', 'server', 'daily_job_fail', 'rotate_logs failed', '{}'::jsonb);
  exception when others then null;
  end;
  return jsonb_build_object('rotated', false, 'dropped', 0, 'rows', 0, 'failed', true);
end $$;
revoke all on function public.rotate_logs() from public, anon, authenticated;
