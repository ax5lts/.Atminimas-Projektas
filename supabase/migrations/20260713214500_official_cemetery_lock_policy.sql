create policy "Service role valdo importo uzrakta"
  on public.cemetery_import_lock for all to service_role
  using (true) with check (true);
