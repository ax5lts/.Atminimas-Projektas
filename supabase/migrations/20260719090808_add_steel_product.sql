begin;

-- Pridedamas graviruotos plieno QR atminimo lentelės produkto variantas.

alter table public.product_catalog
  drop constraint if exists product_catalog_id_check;

alter table public.product_catalog
  add constraint product_catalog_id_check
  check (id in ('metal', 'steel', 'asa'));

insert into public.product_catalog (
  id, name, price_cents, currency, vat_rate, enabled, updated_at
)
values (
  'steel', 'Graviruota plieno QR atminimo lentelė', null, 'EUR', null, true, now()
)
on conflict (id) do update
set name = excluded.name,
    currency = excluded.currency,
    enabled = true,
    updated_at = now();

alter table public.uzsakymai
  drop constraint if exists uzsakymai_product_type_check;

alter table public.uzsakymai
  add constraint uzsakymai_product_type_check
  check (product_type in ('metal', 'steel', 'asa'));

commit;
