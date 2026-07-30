-- Keep one permissive SELECT policy per role. Authenticated users may read enabled
-- products, while administrators may additionally read disabled catalog rows.
drop policy if exists "Viesas skaito prieinamus produktus"
  on public.product_catalog;
drop policy if exists "Administratorius skaito visus produktus"
  on public.product_catalog;
drop policy if exists "Prisijunges skaito produktu kataloga"
  on public.product_catalog;

create policy "Viesas skaito prieinamus produktus"
  on public.product_catalog
  for select
  to anon
  using (enabled = true);

create policy "Prisijunges skaito produktu kataloga"
  on public.product_catalog
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
