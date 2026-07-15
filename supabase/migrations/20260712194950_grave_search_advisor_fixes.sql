-- Saugumo patarėjo pataisos kapaviečių lentelei.
create index if not exists kapavietes_created_by_idx on public.kapavietes(created_by);

drop policy if exists "Viesai rodomos tik paskelbtos kapavietes" on public.kapavietes;
drop policy if exists "Admin skaito visas kapavietes" on public.kapavietes;

create policy "Paskelbtas kapavietes skaito visi, visas skaito admin"
  on public.kapavietes for select to anon, authenticated
  using (
    statusas = 'paskelbtas'
    or exists (
      select 1 from public.user_roles r
      where r.user_id = (select auth.uid()) and r.role = 'admin'
    )
  );
