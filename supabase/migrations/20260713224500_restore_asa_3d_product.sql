begin;

insert into public.product_catalog (
  id, name, price_cents, currency, vat_rate, enabled, updated_at
)
values (
  'asa', 'ASA 3D spausdinta QR atminimo lentelė', null, 'EUR', null, true, now()
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
  check (product_type in ('metal', 'asa'));

commit;
