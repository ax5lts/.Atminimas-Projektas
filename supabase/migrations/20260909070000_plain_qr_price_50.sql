begin;
alter table public.product_catalog add column plain_price_cents integer
  check (plain_price_cents is null or plain_price_cents > 0);
grant update (plain_price_cents) on public.product_catalog to authenticated;
-- Product amounts are snapshots. Later catalogue edits must not reprice past orders.
drop trigger automation_refresh_product_orders on public.product_catalog;
update public.product_catalog set plain_price_cents=5000,price_cents=6000,updated_at=now() where id='metal';
create or replace function private.automation_prepare_order()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare catalog public.product_catalog%rowtype;
declare shipping public.shipping_catalog%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into catalog
    from public.product_catalog
    where id = new.product_type
      and enabled = true
      and price_cents is not null;

    if catalog.id is null then
      raise exception 'Product is not currently available'
        using errcode = 'check_violation';
    end if;

    new.subtotal_cents := case when new.product_type = 'metal' and new.product_pattern = 'plain'
      then catalog.plain_price_cents else catalog.price_cents end;
    if new.subtotal_cents is null or new.subtotal_cents <= 0 then
      raise exception 'Product price unavailable';
    end if;
    new.currency := catalog.currency;
  end if;

  if tg_op = 'INSERT' and new.carrier is not null and new.shipping_cents is null then
    select * into shipping from public.shipping_catalog where carrier = new.carrier and enabled = true;
    if shipping.carrier is not null then new.shipping_cents := shipping.price_cents; end if;
  elsif tg_op = 'UPDATE' and old.carrier is distinct from new.carrier and new.carrier is not null then
    select * into shipping from public.shipping_catalog where carrier = new.carrier and enabled = true;
    new.shipping_cents := case when shipping.carrier is not null then shipping.price_cents else null end;
  end if;

  new.total_cents := case
    when new.subtotal_cents is not null and new.shipping_cents is not null
      then new.subtotal_cents + new.shipping_cents
    else null
  end;

  if new.apmoketa then
    new.payment_status := 'paid';
    new.paid_at := coalesce(new.paid_at, now());
    if new.fulfillment_status = 'awaiting_payment' then
      new.fulfillment_status := 'awaiting_customer_approval';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.customer_approved_at is null
     and new.customer_approved_at is not null then
    new.fulfillment_status := 'ready_for_production';
  end if;

  if tg_op = 'UPDATE' and old.shipping_status is distinct from new.shipping_status then
    if new.shipping_status = 'išsiųsta' then new.fulfillment_status := 'shipped'; end if;
    if new.shipping_status = 'pristatyta' then new.fulfillment_status := 'delivered'; end if;
    if new.shipping_status = 'atšaukta' then new.fulfillment_status := 'cancelled'; end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.automation_prepare_order() from public,anon,authenticated;
create or replace function public.create_designed_product_order(
  p_profile_id text, p_actor_id uuid, p_product_type text, p_page_url text, p_qr_url text,
  p_product_color text, p_product_pattern text
) returns public.uzsakymai language plpgsql security invoker set search_path=public as $$
declare ord public.uzsakymai%rowtype;
declare expected_price integer;
begin
  if p_actor_id is null or p_product_type is distinct from 'metal'
    or p_product_color is null or p_product_color not in ('gold','silver','black')
    or p_product_pattern is null or p_product_pattern not in ('tree','heart','wings','plain')
    then raise exception 'Invalid product design'; end if;
  perform 1 from public.profiliai where id=p_profile_id and owner_id=p_actor_id and deleted_at is null for update;
  if not found then raise exception 'Profile not found'; end if;
  select case when p_product_pattern='plain' then plain_price_cents else price_cents end into expected_price
    from public.product_catalog where id=p_product_type and enabled and price_cents>0 for share;
  if not found or expected_price is null or expected_price<=0 then raise exception 'Product unavailable'; end if;
  select * into ord from public.uzsakymai where profilis_id=p_profile_id and product_type=p_product_type
    and product_color=p_product_color and product_pattern=p_product_pattern
    and subtotal_cents=expected_price and currency='EUR'
    and not apmoketa and fulfillment_status<>'cancelled' order by created_at desc limit 1;
  if ord.id is not null then return ord; end if;
  insert into public.uzsakymai(profilis_id,product_type,puslapio_url,qr_kodas_url,product_color,product_pattern)
    values(p_profile_id,p_product_type,p_page_url,p_qr_url,p_product_color,p_product_pattern) returning * into ord;
  return ord;
end; $$;
revoke all on function public.create_designed_product_order(text,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_designed_product_order(text,uuid,text,text,text,text,text) to service_role;

commit;
