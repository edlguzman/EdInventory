-- Private bucket for item photos. Path: {user_id}/{item_id}/{uuid}.jpg
-- Photos are compressed on the client to JPEG (long side 1600px, ~80%), so 5 MB is a generous cap.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 5 * 1024 * 1024, array['image/jpeg'])
on conflict (id) do nothing;

-- Access only inside the folder named after the user's own id.
create policy item_photos_storage_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy item_photos_storage_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy item_photos_storage_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy item_photos_storage_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
