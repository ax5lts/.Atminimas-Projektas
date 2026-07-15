begin;

-- Pašalinamas nebenaudojamas lipduko produkto variantas.

update public.product_catalog
set name = 'Graviruota QR atminimo lentelė',
    currency = 'EUR',
    updated_at = now()
where id = 'metal';

update public.product_catalog
set enabled = false,
    updated_at = now()
where id <> 'metal'
  and enabled = true;

delete from public.product_catalog
where id = 'asa';

alter table public.uzsakymai
  drop constraint if exists uzsakymai_product_type_check;

alter table public.uzsakymai
  add constraint uzsakymai_product_type_check
  check (product_type = 'metal');

commit;
