begin;

-- `metal` lieka stabilus istorinis SKU, tačiau nuo šiol klientui tai yra
-- vienintelis graviruotos plieno lentelės variantas.
update public.product_catalog
set name = 'Graviruota plieno QR atminimo lentelė',
    updated_at = now()
where id = 'metal';

-- Atskirai sukurtas `steel` SKU paliekamas tik senų užsakymų suderinamumui.
-- Katalogo atnaujinimo trigeris laikinai išjungiamas, kad nepakeistų jau
-- pradėtų neapmokėtų istorinių užsakymų kainų.
alter table public.product_catalog
  disable trigger automation_refresh_product_orders;

update public.product_catalog
set enabled = false,
    updated_at = now()
where id = 'steel';

-- ASA kortelė rodoma informaciniams tikslams ir įjungiama administravime,
-- kai yra patvirtintas prieinamumas bei įrašyta kaina.
update public.product_catalog
set enabled = false,
    updated_at = now()
where id = 'asa';

alter table public.product_catalog
  enable trigger automation_refresh_product_orders;

-- Naujo užsakymo produkto tipą ir kainą visada patvirtina aktyvus katalogas.
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

    new.subtotal_cents := catalog.price_cents;
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

revoke all on function private.automation_prepare_order() from public, anon, authenticated;

commit;
