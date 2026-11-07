-- 99_rollback.sql  (되돌리기. 평소에는 실행하지 않는다. 테스트 프로젝트를 처음 상태로 돌릴 때만)
-- 목적: 01·02·07 이 만든 것을 역순으로 지운다. 03~08 이 추가되면 이 파일 앞쪽에 그 삭제를 더한다.
-- 주의: members·bonds·app_config·admins 의 데이터가 모두 사라진다. 익명·회원 계정(auth.users)은 지우지 않는다.

drop function if exists public.daily_cleanup();
drop function if exists public.member_leave();
drop table if exists public.bonds;
drop table if exists public.members;
drop function if exists public.members_guard();
drop function if exists public.can_name();
drop function if exists public.can_post();
drop function if exists public.gn_feature(text);
drop table if exists public.app_config;
drop function if exists public.is_member();
drop function if exists public.is_anon();
drop function if exists public.is_admin();
drop table if exists public.admins;
