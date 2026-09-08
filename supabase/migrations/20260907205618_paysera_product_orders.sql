alter table public.uzsakymai add column if not exists payment_test boolean not null default false;

create table public.product_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.uzsakymai(id) on delete restrict,
  project_id uuid not null,
  amount_cents integer not null check(amount_cents > 0 and amount_cents <= 100000000),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  status text not null default 'creating' check(status in ('creating','processing','paid','test_paid','failed')),
  claim_token uuid,
  provider_order_id uuid unique,
  link_id uuid,
  checkout_url text,
  expires_at timestamptz not null default now()+interval '1 hour',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create unique index product_payment_one_active on public.product_payment_attempts(order_id)
  where status in ('creating','processing');
create index product_payment_order_history on public.product_payment_attempts(order_id,created_at desc);
alter table public.product_payment_attempts enable row level security;
revoke all on public.product_payment_attempts from public,anon,authenticated;
grant select,insert,update on public.product_payment_attempts to service_role;

create or replace function public.create_paid_product_order(p_profile_id text,p_actor_id uuid,p_product_type text,p_page_url text,p_qr_url text)
returns public.uzsakymai language plpgsql security invoker set search_path=public as $$
declare ord public.uzsakymai%rowtype;
begin
  if p_actor_id is null or p_product_type not in ('metal','asa') then raise exception 'Invalid product'; end if;
  perform 1 from public.profiliai where id=p_profile_id and owner_id=p_actor_id and deleted_at is null for update;
  if not found then raise exception 'Profile not found'; end if;
  perform 1 from public.product_catalog where id=p_product_type and enabled and price_cents>0;
  if not found then raise exception 'Product unavailable'; end if;
  select * into ord from public.uzsakymai where profilis_id=p_profile_id and product_type=p_product_type
    and not apmoketa and fulfillment_status<>'cancelled' order by created_at desc limit 1;
  if ord.id is not null then return ord; end if;
  insert into public.uzsakymai(profilis_id,product_type,puslapio_url,qr_kodas_url)
    values(p_profile_id,p_product_type,p_page_url,p_qr_url) returning * into ord;
  return ord;
end; $$;
revoke all on function public.create_paid_product_order(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.create_paid_product_order(text,uuid,text,text,text) to service_role;

create or replace function private.lock_paysera_order_details()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if old.payment_provider='paysera_modern' and old.payment_status in ('processing','paid') then
    if row(old.product_type,old.currency,old.subtotal_cents,old.shipping_cents,old.total_cents)
      is distinct from row(new.product_type,new.currency,new.subtotal_cents,new.shipping_cents,new.total_cents) then
      raise exception 'Payment amount is locked';
    end if;
    if old.payment_status='processing' and row(old.carrier,old.city,old.parcel_terminal,old.recipient_name,old.recipient_phone,old.recipient_email)
      is distinct from row(new.carrier,new.city,new.parcel_terminal,new.recipient_name,new.recipient_phone,new.recipient_email) then
      raise exception 'Payment delivery details are locked';
    end if;
  end if;
  return new;
end; $$;
revoke all on function private.lock_paysera_order_details() from public,anon,authenticated;
create trigger zz_lock_paysera_order_details before update on public.uzsakymai
  for each row execute function private.lock_paysera_order_details();

create or replace function public.begin_product_paysera_payment(p_order_id uuid,p_actor_id uuid,p_project_id uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare ord public.uzsakymai%rowtype;
declare attempt public.product_payment_attempts%rowtype;
declare claim uuid;
begin
  select * into ord from public.uzsakymai where id=p_order_id for update;
  if ord.id is null or p_actor_id is null or not exists(select 1 from public.profiliai
    where id=ord.profilis_id and owner_id=p_actor_id and deleted_at is null) then raise exception 'Order not found'; end if;
  if ord.apmoketa or ord.payment_status='paid' or ord.fulfillment_status='cancelled' then raise exception 'Order is closed'; end if;
  if ord.shipping_status<>'paruošti' or ord.total_cents is null or ord.total_cents<=0
    or nullif(trim(ord.recipient_name),'') is null or nullif(trim(ord.recipient_phone),'') is null
    or nullif(trim(ord.recipient_email),'') is null or nullif(trim(ord.city),'') is null
    or nullif(trim(ord.parcel_terminal),'') is null then raise exception 'Delivery required'; end if;
  if not exists(select 1 from public.shipping_catalog where carrier=ord.carrier and enabled
    and price_cents=ord.shipping_cents and currency=ord.currency) then raise exception 'Shipping price changed'; end if;
  if ord.payment_status='processing' and ord.payment_provider is distinct from 'paysera_modern' then
    raise exception 'Another payment is pending'; end if;
  select * into attempt from public.product_payment_attempts where order_id=ord.id and status in ('creating','processing') for update;
  if attempt.id is not null then
    if attempt.project_id<>p_project_id or attempt.amount_cents<>ord.total_cents or attempt.currency<>ord.currency then
      raise exception 'Payment mismatch'; end if;
    if attempt.expires_at<=now()+interval '30 seconds' then raise exception 'Payment expired; reconciliation required'; end if;
    if attempt.checkout_url is null and attempt.claim_token is null then
      claim:=gen_random_uuid();
      update public.product_payment_attempts set claim_token=claim where id=attempt.id returning * into attempt;
    end if;
    return jsonb_build_object('attempt',to_jsonb(attempt)-'claim_token','claim_token',claim);
  end if;
  claim:=gen_random_uuid();
  insert into public.product_payment_attempts(order_id,project_id,amount_cents,currency,claim_token)
    values(ord.id,p_project_id,ord.total_cents,ord.currency,claim) returning * into attempt;
  update public.uzsakymai set payment_provider='paysera_modern',payment_status='processing',payment_test=false where id=ord.id;
  return jsonb_build_object('attempt',to_jsonb(attempt)-'claim_token','claim_token',claim);
end; $$;

create or replace function public.attach_product_paysera_order(p_attempt_id uuid,p_claim_token uuid,p_provider_order_id uuid,p_amount integer,p_currency text,p_project_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
begin
  update public.product_payment_attempts set provider_order_id=p_provider_order_id
    where id=p_attempt_id and claim_token=p_claim_token and status='creating'
      and (provider_order_id is null or provider_order_id=p_provider_order_id)
      and amount_cents=p_amount and currency=p_currency and project_id=p_project_id;
  if not found then raise exception 'Payment claim mismatch'; end if;
end; $$;

create or replace function public.attach_product_paysera_link(p_attempt_id uuid,p_claim_token uuid,p_provider_order_id uuid,p_link_id uuid,p_url text,p_expires_at timestamptz)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if p_url is null or p_url !~ '^https://api[.]paysera[.]com/checkout-payment-link/payment-collection/v1/payment-links/[A-Za-z0-9_-]+$'
    or length(p_url)>2048 or p_link_id is null or p_expires_at is null or p_expires_at<=now() then raise exception 'Invalid checkout URL'; end if;
  update public.product_payment_attempts set link_id=p_link_id,checkout_url=p_url,status='processing',claim_token=null,
    expires_at=least(expires_at,p_expires_at)
    where id=p_attempt_id and claim_token=p_claim_token and provider_order_id=p_provider_order_id and status='creating';
  if not found then raise exception 'Payment claim mismatch'; end if;
end; $$;

create or replace function public.fail_product_paysera_creation(p_attempt_id uuid,p_claim_token uuid,p_http_status integer)
returns void language plpgsql security invoker set search_path=public as $$
declare ord_id uuid;
declare attempt public.product_payment_attempts%rowtype;
begin
  if p_http_status is null or p_http_status not in (400,401,403,404,422) then raise exception 'Ambiguous payment response'; end if;
  select order_id into ord_id from public.product_payment_attempts where id=p_attempt_id;
  perform 1 from public.uzsakymai where id=ord_id for update;
  select * into attempt from public.product_payment_attempts where id=p_attempt_id and claim_token=p_claim_token and status='creating' for update;
  if attempt.id is null then raise exception 'Payment claim mismatch'; end if;
  update public.product_payment_attempts set claim_token=null,status=case when provider_order_id is null then 'failed' else 'creating' end where id=attempt.id;
  if attempt.provider_order_id is null then update public.uzsakymai set payment_status='failed' where id=ord_id and not apmoketa; end if;
end; $$;

create or replace function public.process_product_paysera_payment(p_attempt_id uuid,p_order_id uuid,p_project_id uuid,p_event_id text,
  p_status text,p_amount integer,p_amount_paid integer,p_currency text,p_test boolean)
returns text language plpgsql security invoker set search_path=public as $$
declare attempt public.product_payment_attempts%rowtype;
declare ord public.uzsakymai%rowtype;
declare ord_id uuid;
declare result text;
declare previous text;
begin
  if p_event_id is null or p_event_id !~ '^[0-9a-f]{64}$' or p_test is null or p_amount is null or p_amount<=0
    or p_amount_paid is null or p_amount_paid<0 or p_status is null or length(p_status) not between 1 and 80 then raise exception 'Invalid event'; end if;
  select order_id into ord_id from public.product_payment_attempts where id=p_attempt_id;
  if ord_id is null then return 'not_found'; end if;
  select * into ord from public.uzsakymai where id=ord_id for update;
  select * into attempt from public.product_payment_attempts where id=p_attempt_id for update;
  if p_order_id is distinct from attempt.provider_order_id or p_project_id is distinct from attempt.project_id
    or p_amount is distinct from attempt.amount_cents or p_currency is distinct from attempt.currency
    or (attempt.status='test_paid' and not p_test) or (attempt.status='paid' and p_test) then return 'rejected_quote_or_amount'; end if;
  select status into previous from public.payment_events where provider='paysera_modern' and provider_event_id=p_event_id;
  if found then return previous; end if;
  result:='recorded';
  if attempt.status not in ('test_paid','paid') and p_status='paid' and p_amount_paid>=p_amount then
    if p_test then
      update public.product_payment_attempts set status='test_paid',paid_at=now(),claim_token=null where id=attempt.id;
      if not ord.apmoketa then update public.uzsakymai set payment_status='cancelled',payment_test=true where id=ord.id; end if;
    else
      if ord.apmoketa or ord.total_cents<>attempt.amount_cents or ord.currency<>attempt.currency or ord.fulfillment_status='cancelled' then
        return 'rejected_quote_or_amount'; end if;
      result:='accepted';
      update public.product_payment_attempts set status='paid',paid_at=now(),claim_token=null where id=attempt.id;
      update public.uzsakymai set apmoketa=true,payment_status='paid',payment_test=false,payment_provider='paysera_modern',
        payment_reference=p_order_id::text,paid_at=now(),busena='apmoketas' where id=ord.id;
    end if;
  end if;
  insert into public.payment_events(order_id,provider,provider_event_id,provider_payment_id,event_type,status,amount_cents,currency,payload,processed_at)
    values(ord.id,'paysera_modern',p_event_id,p_order_id::text,'order.'||p_status,result,p_amount_paid,p_currency,
      jsonb_build_object('attempt_id',p_attempt_id,'project_id',p_project_id,'test',p_test,'amount',p_amount),now());
  return result;
end; $$;

revoke all on function public.begin_product_paysera_payment(uuid,uuid,uuid), public.attach_product_paysera_order(uuid,uuid,uuid,integer,text,uuid),
  public.attach_product_paysera_link(uuid,uuid,uuid,uuid,text,timestamptz),public.fail_product_paysera_creation(uuid,uuid,integer),
  public.process_product_paysera_payment(uuid,uuid,uuid,text,text,integer,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.begin_product_paysera_payment(uuid,uuid,uuid), public.attach_product_paysera_order(uuid,uuid,uuid,integer,text,uuid),
  public.attach_product_paysera_link(uuid,uuid,uuid,uuid,text,timestamptz),public.fail_product_paysera_creation(uuid,uuid,integer),
  public.process_product_paysera_payment(uuid,uuid,uuid,text,text,integer,integer,text,boolean) to service_role;
