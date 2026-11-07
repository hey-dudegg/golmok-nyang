-- 06_storage.sql  (실행 순서 6/8, 설계 2차_연결_표.md 2-4)
-- 목적: 캡쳐 저장소 버킷 captures(공개 읽기, 128KB, webp·jpeg)와 경로·개수 정책, post_attach().
--       게시판 잠금 중(D-83)에는 can_post() 가 거짓이라 업로드도 거부된다. 화면은 아직 부르지 않는다.
-- 선행: 03_board. 다시 실행해도 안전하다. 버킷·파일은 SQL 로 지우지 않는다(저장소가 직접 삭제를 막음).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('captures', 'captures', true, 131072, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 131072, allowed_mime_types = array['image/webp', 'image/jpeg'];

-- 올리기: 내 폴더, 갓 쓴(10분) 내 글 중 그림이 아직 없는 글의 파일 이름만 = 글 1개에 그림 1장
drop policy if exists captures_insert on storage.objects;
create policy captures_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'captures' and public.can_post()
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.posts p
                where p.uid = auth.uid() and p.img is null and p.created_at > now() - interval '10 minutes'
                  and storage.filename(name) in (p.id::text || '.webp', p.id::text || '.jpg')));
-- 덮어쓰기(update) 정책은 없다. 지우기·찾기는 폴더 주인 또는 어드민(지우려면 먼저 찾을 수 있어야 한다). 읽기는 공개 버킷 주소로.
drop policy if exists captures_select on storage.objects;
create policy captures_select on storage.objects for select to authenticated
  using (bucket_id = 'captures' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists captures_delete on storage.objects;
create policy captures_delete on storage.objects for delete to authenticated
  using (bucket_id = 'captures' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- 그림 올린 뒤 호출: 그 경로의 파일이 실제로 있으면 posts.img 를 채운다(내 글·그림 없는 글만)
create or replace function public.post_attach(p_post_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  if not public.gn_feature('board_write') then raise exception 'feature_off' using errcode = 'P0001'; end if;
  if not public.can_post() then raise exception 'need_member' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.posts where id = p_post_id and uid = auth.uid() and img is null) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select o.name into v_path from storage.objects o
   where o.bucket_id = 'captures'
     and o.name in (auth.uid()::text || '/' || p_post_id::text || '.webp', auth.uid()::text || '/' || p_post_id::text || '.jpg')
   limit 1;
  if v_path is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.posts set img = v_path where id = p_post_id;
  return v_path;
end $$;
revoke all on function public.post_attach(uuid) from public, anon;
grant execute on function public.post_attach(uuid) to authenticated;
