-- Vieninga savininko ir administratoriaus profilio atnaujinimo politika.
drop policy if exists "Admin valdo profilius" on public.profiliai;
drop policy if exists "Savininkas keicia profilio viesuma" on public.profiliai;
create policy "Savininkas ir admin atnaujina profili" on public.profiliai
for update to authenticated
using (
  owner_id = (select auth.uid())
  or exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin')
)
with check (
  owner_id = (select auth.uid())
  or exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin')
);
