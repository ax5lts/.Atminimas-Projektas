-- Anonymous checkout visitors only need enabled shipping methods. Keeping the
-- administrator lookup in the same policy makes PostgreSQL require anon access
-- to public.user_roles and causes the REST request to fail with 401.
drop policy if exists "Viesas skaito pristatymo kataloga"
  on public.shipping_catalog;
drop policy if exists "Viesas skaito aktyvius pristatymo budus"
  on public.shipping_catalog;
drop policy if exists "Prisijunges skaito pristatymo kataloga"
  on public.shipping_catalog;

create policy "Viesas skaito aktyvius pristatymo budus"
  on public.shipping_catalog
  for select
  to anon
  using (enabled = true);

create policy "Prisijunges skaito pristatymo kataloga"
  on public.shipping_catalog
  for select
  to authenticated
  using (
    enabled = true
    or exists (
      select 1
      from public.user_roles as role
      where role.user_id = (select auth.uid())
        and role.role = 'admin'
    )
  );
