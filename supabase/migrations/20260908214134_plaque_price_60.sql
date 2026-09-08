begin;
-- The new price applies to new purchases; preserve existing order amounts.
alter table public.product_catalog disable trigger automation_refresh_product_orders;
update public.product_catalog set price_cents = 6000, updated_at = now() where id = 'metal';
alter table public.product_catalog enable trigger automation_refresh_product_orders;
commit;
