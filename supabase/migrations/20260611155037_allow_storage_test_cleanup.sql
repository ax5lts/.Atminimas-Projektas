drop policy if exists "Leisti trinti storage testus" on storage.objects;
create policy "Leisti trinti storage testus"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'atminimas' and name like 'storage-test-%');
