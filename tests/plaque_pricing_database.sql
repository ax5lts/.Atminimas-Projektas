-- Run after the plain_qr_price_50 migration. No payment calls or emails; all writes roll back.
begin;
set local statement_timeout = '20s';
do $test$
declare actor uuid;
declare profile text := 'plaque-price-test-' || gen_random_uuid();
declare c text; p text; expected integer;
declare ord public.uzsakymai%rowtype; again public.uzsakymai%rowtype;
declare old_plain uuid; info jsonb; denied boolean;
begin
  select id into actor from auth.users limit 1;
  assert actor is not null, 'a user is required for the rollback test';
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role','sub',actor)::text,true);
  insert into public.profiliai(id,owner_id,vardas) values(profile,actor,'Rollback price test');
  -- Simulate a previously created plain order at the old 60 EUR price.
  ord := public.create_designed_product_order(profile,actor,'metal','https://example.invalid/page','https://example.invalid/qr','gold','plain');
  old_plain := ord.id;
  update public.uzsakymai set subtotal_cents=6000 where id=old_plain;
  foreach c in array array['gold','silver','black'] loop
    foreach p in array array['plain','tree','heart','wings'] loop
      expected := case when p='plain' then 5000 else 6000 end;
      ord := public.create_designed_product_order(profile,actor,'metal','https://example.invalid/page','https://example.invalid/qr',c,p);
      assert ord.subtotal_cents=expected and ord.product_color=c and ord.product_pattern=p, 'design price mismatch';
      assert ord.id<>old_plain, 'old-price order must not be reused';
      again := public.create_designed_product_order(profile,actor,'metal','https://example.invalid/page','https://example.invalid/qr',c,p);
      assert again.id=ord.id, 'retry created a duplicate';
      perform public.set_my_order_delivery(ord.id,'Omniva','Vilnius','Test locker','Test payer','+37060000000','test@example.invalid');
      select * into ord from public.uzsakymai where id=ord.id;
      assert ord.shipping_cents=300 and ord.total_cents=expected+300, 'delivery total mismatch';
      info := public.begin_product_paysera_payment(ord.id,actor,gen_random_uuid());
      assert (info->'attempt'->>'amount_cents')::integer=expected+300, 'Paysera amount mismatch';
      denied := false;
      begin update public.uzsakymai set subtotal_cents=1 where id=ord.id;
      exception when others then denied:=true; end;
      assert denied, 'payment amount must be locked';
    end loop;
  end loop;
  -- Catalogue edits cannot change an existing unpaid or in-flight purchase.
  update public.product_catalog set price_cents=6100,plain_price_cents=5100 where id='metal';
  assert (select subtotal_cents from public.uzsakymai where id=old_plain)=6000, 'historical order was repriced';
  assert (select subtotal_cents from public.uzsakymai where id=ord.id)=6000, 'in-flight order was repriced';
  assert not has_function_privilege('anon','public.create_designed_product_order(text,uuid,text,text,text,text,text)','EXECUTE'), 'anonymous RPC access';
  assert not has_function_privilege('authenticated','public.create_designed_product_order(text,uuid,text,text,text,text,text)','EXECUTE'), 'customer RPC access';
end $test$;
rollback;
select 'PASS: 12 design prices, delivery totals, Paysera amounts, retry, old-order snapshots and payment locks; all writes rolled back' as result;
