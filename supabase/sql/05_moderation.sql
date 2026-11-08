-- 05_moderation.sql  (실행 순서 5/8, 설계 2차_연결_필터.md 3-1~3-5, M2-6b)
-- 목적: 금칙어 표 filter_words, 글 검사 gn_text_check, 도배 검사 gn_rate_check, 신고 reports·report(), 어드민 검토 mod_list·mod_restore·mod_remove.
--       이름 제안·글·댓글 insert 앞 트리거를 교체(create or replace)해 필터·도배 검사를 더한다(권한 -> 필터 -> 도배 -> 서버 열 덮어쓰기 순서).
-- 선행: 01_base·02_members·03_board·04_names. 다시 실행해도 안전하다. 금칙어 목록은 저장소에 없다(supabase/private/seed_words.sql, 따로 전달).
-- 오류는 코드만 던진다(3-6): filter_word·filter_url·filter_contact·filter_chars·rate_limit·dup·need_member·need_admin·not_found.

-- 3-1 금칙어. RLS 켜고 정책 없음 = 방문자는 못 읽고, security definer 함수만 읽는다. 단어는 정규화(gn_n2) 뒤 모양으로 저장한다.
create table if not exists public.filter_words (word text primary key, added_at timestamptz not null default now());
alter table public.filter_words enable row level security;
revoke all on public.filter_words from anon, authenticated;

-- 정규화. n1 = NFKC·소문자·0폭 문자 제거, n2 = n1 에서 공백·구분 기호 제거 (앱 core/text_filter.js normText 와 같다)
create or replace function public.gn_n1(t text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(lower(normalize(coalesce(t, ''), NFKC)), '[​-‏⁠﻿]', '', 'g');
$$;
create or replace function public.gn_n2(t text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(public.gn_n1(t), '[[:space:].,·*~!/|_-]', '', 'g');
$$;

-- 3-2 글 검사. kind: post·comment·name·nick. 걸리면 raise exception '<코드>'. 어떤 단어가 걸렸는지는 알리지 않는다.
-- 정규식은 tests/filter_cases.json 벡터와 앱이 같은 결과를 내야 한다. ㅋㅌ 는 NFKC 로 ᄏᄐ 이 되므로 그 모양으로 쓴다.
create or replace function public.gn_text_check(p_kind text, p_txt text) returns void
language plpgsql security definer set search_path = '' as $$
declare n1 text := public.gn_n1(p_txt); n2 text := public.gn_n2(p_txt);
begin
  if p_kind in ('name', 'nick') and btrim(coalesce(p_txt, '')) !~* '^[가-힣a-z0-9 ]+$' then
    raise exception 'filter_chars' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.filter_words w where w.word <> '' and position(w.word in n2) > 0) then
    raise exception 'filter_word' using errcode = 'P0001';
  end if;
  if n1 ~* '(https?://|www\.)'
     or n1 ~* '[a-z0-9-]+\.(com|net|org|kr|co|io|me|ly|gg|xyz|site|shop|link|app|to)(?![a-z0-9])'
     or n1 ~* '(닷컴|닷넷|점컴|open\.kakao)' then
    raise exception 'filter_url' using errcode = 'P0001';
  end if;
  if n2 ~* '[0-9]{9,}' or n2 ~* '01[016789][0-9]{7,8}' or n2 ~* '공일공'
     or n1 ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' or n1 ~* '골뱅이'
     or n1 ~* '(카톡|카카오톡|ᄏᄐ|오픈채팅|오픈톡|텔레그램|텔레|디엠|인스타|\m(katalk|kakao|telegram|line|dm|insta))\s*(아이디|id)?\s*[:：]?\s*[a-z0-9._-]{4,}'
     or n1 ~* '@[a-z0-9_.]{4,}' then
    raise exception 'filter_contact' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.gn_text_check(text, text) from public, anon, authenticated;

-- 3-3 도배 검사. 한도는 app_config.limits(어드민이 값만 조정). 셈은 해당 표에서 uid·created_at 으로 바로 센다.
-- p_txt 를 주면(글·댓글) 같은 본문 반복도 거부한다(dup_h 시간 안, 같은 사람, 정규화 n2 기준). 이름의 dup 은 names2 고유 인덱스가 맡는다(23505 -> 화면 dup).
-- 'nick'(닉네임 변경 1시간당 3회)은 변경 기록 표가 없어 아직 검사하지 않는다(로그인 재개 때, D-82).
create index if not exists names2_uid_created_idx on public.names2 (uid, created_at);
create index if not exists posts_uid_created_idx on public.posts (uid, created_at);
create index if not exists post_comments_uid_created_idx on public.post_comments (uid, created_at);

create or replace function public.gn_rate_check(p_kind text, p_txt text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare lim jsonb; tbl text; v_last timestamptz; v_n10 int; v_n60 int; g int; a int; b int; d int;
begin
  select value -> p_kind into lim from public.app_config where key = 'limits';
  tbl := case p_kind when 'post' then 'posts' when 'comment' then 'post_comments' when 'name' then 'names2' else null end;
  if lim is null or tbl is null or auth.uid() is null then return; end if;
  g := coalesce((lim ->> 'gap_s')::int, 0); a := coalesce((lim ->> 'per10m')::int, 2147483647);
  b := coalesce((lim ->> 'per1h')::int, 2147483647); d := coalesce((lim ->> 'dup_h')::int, 0);
  execute format($f$select max(created_at),
      count(*) filter (where created_at > now() - interval '10 minutes'), count(*)
    from public.%I where uid = $1 and created_at > now() - interval '1 hour'$f$, tbl)
    into v_last, v_n10, v_n60 using auth.uid();
  if (g > 0 and v_last is not null and v_last > now() - make_interval(secs => g)) or v_n10 >= a or v_n60 >= b then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  if p_txt is not null and d > 0 then
    if exists (select 1 from (
         select body, created_at from public.posts where p_kind = 'post' and uid = auth.uid()
         union all select body, created_at from public.post_comments where p_kind = 'comment' and uid = auth.uid()) t
       where t.created_at > now() - make_interval(hours => d) and public.gn_n2(t.body) = public.gn_n2(p_txt)) then
      raise exception 'dup' using errcode = 'P0001';
    end if;
  end if;
end $$;
revoke all on function public.gn_rate_check(text, text) from public, anon, authenticated;

-- insert 앞 트리거 교체. 앞 단계(스위치·회원 확인)는 03·04 와 같고, 그 뒤에 필터·도배를 더했다.
create or replace function public.names2_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_name() then raise exception 'need_member' using errcode = 'P0001'; end if;
  new.name := btrim(new.name);
  perform public.gn_text_check('name', new.name);
  perform public.gn_rate_check('name');
  select nick into new.nick from public.members where uid = auth.uid();   -- 익명이면 null(화면은 작성자 표시를 생략)
  new.legacy_author := null; new.up := 1; new.down := 0; new.status := 'ok';   -- 제안자는 좋아요 1로 시작(D-31)
  new.hidden_at := null; new.created_at := now();
  if (select count(*) from public.names2 where uid = new.uid and region = new.region and status = 'ok') >= 5 then
    raise exception 'name_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- 글·댓글 쓰기는 board_write 가 꺼져 있어 지금은 도달하지 않는다(D-83). 켜질 때를 위해 같은 검사를 미리 붙여 둔다.
create or replace function public.posts_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_nick text;
begin
  if not public.gn_feature('board_write') then raise exception 'feature_off' using errcode = 'P0001'; end if;
  select nick into v_nick from public.members where uid = auth.uid();
  if auth.uid() is null or public.is_anon() or v_nick is null then raise exception 'need_member' using errcode = 'P0001'; end if;
  perform public.gn_text_check('post', new.body);
  perform public.gn_rate_check('post', new.body);
  new.nick := v_nick; new.legacy_author := null; new.status := 'ok'; new.img := null;
  new.hidden_at := null; new.created_at := now();
  return new;
end $$;

create or replace function public.comments_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_nick text;
begin
  if not public.gn_feature('board_write') then raise exception 'feature_off' using errcode = 'P0001'; end if;
  select nick into v_nick from public.members where uid = auth.uid();
  if auth.uid() is null or public.is_anon() or v_nick is null then raise exception 'need_member' using errcode = 'P0001'; end if;
  perform public.gn_text_check('comment', new.body);
  perform public.gn_rate_check('comment', new.body);
  new.nick := v_nick; new.legacy_author := null; new.status := 'ok';
  new.hidden_at := null; new.created_at := now();
  return new;
end $$;

-- 3-4 신고. 한 사람이 같은 대상 한 번만(기본키). select 는 어드민만, 쓰기는 report() 로만.
create table if not exists public.reports (
  kind text check (kind in ('post', 'comment', 'name')), target uuid,
  uid uuid references auth.users on delete cascade,
  cleared boolean not null default false, created_at timestamptz not null default now(),
  primary key (kind, target, uid));
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
drop policy if exists reports_admin_read on public.reports;
create policy reports_admin_read on public.reports for select to authenticated using (public.is_admin());

-- report(kind, target): 이름은 can_name()(익명 허용 D-84), 글·댓글은 회원만(익명 uid 는 브라우저마다 새로 생겨 3회 숨김을 혼자 만들 수 있음).
-- 자기 것·이미 숨겨진 것·중복 신고는 조용히 무시(횟수는 알리지 않음 D-31). 지우지 않은 신고가 report_hide[kind] 이상이면 숨김.
-- 복구 뒤 같은 사람의 옛 신고 행은 남아 있어(cleared=true) 다시 세지 않는다: 다시 숨기려면 새 사람의 신고가 필요하다.
create or replace function public.report(p_kind text, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_status text; v_th int; v_n int;
begin
  if auth.uid() is null or p_kind is null or p_kind not in ('post', 'comment', 'name') then raise exception 'need_member' using errcode = 'P0001'; end if;
  if p_kind = 'name' then
    if not public.can_name() then raise exception 'need_member' using errcode = 'P0001'; end if;
    select uid, status into v_owner, v_status from public.names2 where id = p_target for update;
  else
    if not public.is_member() then raise exception 'need_member' using errcode = 'P0001'; end if;
    if p_kind = 'post' then select uid, status into v_owner, v_status from public.posts where id = p_target for update;
    else select uid, status into v_owner, v_status from public.post_comments where id = p_target for update; end if;
  end if;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_status <> 'ok' or v_owner = auth.uid() then return; end if;
  insert into public.reports (kind, target, uid) values (p_kind, p_target, auth.uid()) on conflict do nothing;
  select count(*) into v_n from public.reports where kind = p_kind and target = p_target and not cleared;
  select coalesce((value ->> p_kind)::int, 3) into v_th from public.app_config where key = 'report_hide';
  if v_n >= coalesce(v_th, 3) then
    if p_kind = 'name' then update public.names2 set status = 'hidden', hidden_at = now() where id = p_target;
    elsif p_kind = 'post' then update public.posts set status = 'hidden', hidden_at = now() where id = p_target;
    else update public.post_comments set status = 'hidden', hidden_at = now() where id = p_target; end if;
  end if;
end $$;
revoke all on function public.report(text, uuid) from public, anon;
grant execute on function public.report(text, uuid) to authenticated;

-- 3-5 어드민 확인·복구 (is_admin() 검사, 아니면 need_admin)
-- mod_list(): 숨김 상태의 글·댓글·이름과 신고 수·숨긴 시각(최근 순 50개). 항목 {kind,target,text,reports,hidden_at}
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
        from public.post_comments c where c.status = 'hidden') a
    order by hidden_at desc limit 50) u), '[]'::jsonb);
end $$;
revoke all on function public.mod_list() from public, anon;
grant execute on function public.mod_list() to authenticated;

-- mod_restore: 다시 보이게 하고 그 대상의 신고를 지운 것(cleared)으로 표시. 이름은 같은 지역에 같은 이름이 이미 있으면 고유 인덱스 위반(화면 dup).
create or replace function public.mod_restore(p_kind text, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'need_admin' using errcode = 'P0001'; end if;
  if p_kind = 'name' then update public.names2 set status = 'ok', hidden_at = null where id = p_target and status = 'hidden';
  elsif p_kind = 'post' then update public.posts set status = 'ok', hidden_at = null where id = p_target and status = 'hidden';
  elsif p_kind = 'comment' then update public.post_comments set status = 'ok', hidden_at = null where id = p_target and status = 'hidden';
  else raise exception 'not_found' using errcode = 'P0001'; end if;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.reports set cleared = true where kind = p_kind and target = p_target;
end $$;
revoke all on function public.mod_restore(text, uuid) from public, anon;
grant execute on function public.mod_restore(text, uuid) to authenticated;

-- mod_remove: 화면 어디에도 안 보이게(status='removed', 정리는 daily_cleanup). 글이면 그림 경로를 돌려줘 화면이 파일도 지운다. 숨기지 않은 이전 데이터 글도 처리한다.
create or replace function public.mod_remove(p_kind text, p_target uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_img text;
begin
  if not public.is_admin() then raise exception 'need_admin' using errcode = 'P0001'; end if;
  if p_kind = 'name' then update public.names2 set status = 'removed' where id = p_target and status <> 'removed';
  elsif p_kind = 'post' then update public.posts set status = 'removed' where id = p_target and status <> 'removed' returning img into v_img;
  elsif p_kind = 'comment' then update public.post_comments set status = 'removed' where id = p_target and status <> 'removed';
  else raise exception 'not_found' using errcode = 'P0001'; end if;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  return v_img;
end $$;
revoke all on function public.mod_remove(text, uuid) from public, anon;
grant execute on function public.mod_remove(text, uuid) to authenticated;
