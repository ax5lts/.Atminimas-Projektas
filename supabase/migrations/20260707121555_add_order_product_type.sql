-- Užsakyme išsaugomas pasirinktas produkto tipas.
alter table public.uzsakymai
  add column if not exists product_type text not null default 'metal';

alter table public.uzsakymai
  drop constraint if exists uzsakymai_product_type_check;

alter table public.uzsakymai
  add constraint uzsakymai_product_type_check
  check (product_type in ('metal', 'asa'));
