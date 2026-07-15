alter table public.profiliai enable row level security;

update public.profiliai
set aktyvus = true
where aktyvus is null;

alter table public.profiliai
  alter column aktyvus set default true;

grant usage on schema public to anon, authenticated;
grant select, insert on table public.profiliai to anon, authenticated;

drop policy if exists "Viesas skaitymas profiliu" on public.profiliai;
create policy "Viesas skaitymas profiliu"
  on public.profiliai
  for select
  to anon, authenticated
  using (aktyvus = true);

drop policy if exists "Viesas kurimas profiliu" on public.profiliai;
create policy "Viesas kurimas profiliu"
  on public.profiliai
  for insert
  to anon, authenticated
  with check (aktyvus = true);

grant select on table public.medijos to anon, authenticated;

drop policy if exists "Viesas skaitymas medijos" on public.medijos;
create policy "Viesas skaitymas medijos"
  on public.medijos
  for select
  to anon, authenticated
  using (true);
