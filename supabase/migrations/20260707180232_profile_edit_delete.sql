-- Atminimo puslapių redagavimas ir saugus pašalinimas.
-- Savininko failai tvarkomi tame pačiame profilio gyvavimo cikle.
alter table public.profiliai
  add column if not exists deleted_at timestamptz;

create index if not exists profiliai_owner_active_created_idx
  on public.profiliai (owner_id, created_at desc)
  where deleted_at is null;

revoke delete on table public.profiliai from anon, authenticated;

drop policy if exists "Viesas skaitymas profiliu" on public.profiliai;
create policy "Viesas skaitymas profiliu"
  on public.profiliai for select
  to anon
  using (aktyvus = true and deleted_at is null);

drop policy if exists "Savininkas skaito savo profilius" on public.profiliai;
create policy "Savininkas skaito savo profilius"
  on public.profiliai for select
  to authenticated
  using (
    (
      deleted_at is null
      and (aktyvus = true or owner_id = (select auth.uid()))
    )
    or exists (
      select 1 from public.user_roles r
      where r.user_id = (select auth.uid()) and r.role = 'admin'
    )
  );

-- Naršyklė tiesiogiai gali tik įkelti / pakeisti savo aplanko failus.
-- Profilio laukus keičia JWT tikrinanti Edge Function.
drop policy if exists "Savininkas atnaujina atminimo failus" on storage.objects;
create policy "Savininkas atnaujina atminimo failus"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'atminimas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner_id = (select auth.uid())::text
  )
  with check (
    bucket_id = 'atminimas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner_id = (select auth.uid())::text
  );

drop policy if exists "Savininkas salina atminimo failus" on storage.objects;
create policy "Savininkas salina atminimo failus"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'atminimas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner_id = (select auth.uid())::text
  );

create or replace function private.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare is_admin boolean;
begin
  if coalesce(auth.jwt()->>'role', '') = 'service_role' then return new; end if;
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = 'admin'
  ) into is_admin;
  if is_admin then return new; end if;
  if (to_jsonb(new) - 'aktyvus') is distinct from (to_jsonb(old) - 'aktyvus') then
    raise exception 'Profile owner may only change visibility';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_profile_update() from public, anon, authenticated;
