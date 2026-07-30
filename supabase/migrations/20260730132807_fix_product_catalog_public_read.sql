-- Public visitors only need enabled products. Keeping the administrator lookup in
-- the same policy made PostgreSQL require anon access to public.user_roles.
drop policy if exists "Viesas skaito produktu kataloga"
  on public.product_catalog;
drop policy if exists "Viesas skaito prieinamus produktus"
  on public.product_catalog;
drop policy if exists "Administratorius skaito visus produktus"
  on public.product_catalog;

create policy "Viesas skaito prieinamus produktus"
  on public.product_catalog
  for select
  to anon, authenticated
  using (enabled = true);

create policy "Administratorius skaito visus produktus"
  on public.product_catalog
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles as role
      where role.user_id = (select auth.uid())
        and role.role = 'admin'
    )
  );
