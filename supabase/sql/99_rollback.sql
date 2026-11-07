-- 99_rollback.sql  (되돌리기. 평소에는 실행하지 않는다. 테스트 프로젝트를 처음 상태로 돌릴 때만)
-- 목적: 01~07 이 만든 것을 역순으로 지운다. 08 이 추가되면 이 파일 앞쪽에 그 삭제를 더한다.
-- 주의: members·bonds·posts·names2·app_config·admins 등의 데이터가 모두 사라진다. 익명·회원 계정(auth.users)은 지우지 않는다.
--       버킷 captures 와 그 파일은 SQL 로 지울 수 없다(저장소가 막음). 필요하면 대시보드 Storage 에서 지운다.

drop function if exists public.daily_cleanup();
drop function if exists public.member_leave();
drop function if exists public.post_attach(uuid);
drop policy if exists captures_delete on storage.objects;
drop policy if exists captures_select on storage.objects;
drop policy if exists captures_insert on storage.objects;
drop table if exists public.admin_kv;
drop function if exists public.name_remove(uuid);
drop function if exists public.name_vote(uuid, text);
drop table if exists public.name_votes;
drop table if exists public.names2;
drop function if exists public.names2_after_insert();
drop function if exists public.names2_before_insert();
drop table if exists public.post_likes;
drop table if exists public.post_comments;
drop table if exists public.posts;
drop function if exists public.comments_before_insert();
drop function if exists public.posts_before_insert();
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
