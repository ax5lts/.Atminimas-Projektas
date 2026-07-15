-- Automatizavimo branduolys. Išoriniai raktai laikomi tik Supabase Edge Function Secrets.
-- Katalogai, mokėjimų įvykiai, dokumentai, gamyba ir auditas valdomi vienoje grandinėje.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.product_catalog (
  id text primary key check (id in ('metal', 'asa')),
  name text not null,
  price_cents integer check (price_cents is null or price_cents >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  vat_rate numeric(5,2) check (vat_rate is null or vat_rate between 0 and 100),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.product_catalog (id, name, price_cents, currency, enabled)
values
  ('metal', 'Metalo QR atminimo ženkliukas', 5900, 'EUR', true),
  ('asa', 'ASA 3D QR atminimo ženkliukas', null, 'EUR', false)
on conflict (id) do update set
  name = excluded.name,
  price_cents = coalesce(public.product_catalog.price_cents, excluded.price_cents),
  currency = excluded.currency;

create table if not exists public.business_profile (
  singleton boolean primary key default true check (singleton),
  legal_name text,
  activity_form text,
  registration_code text,
  vat_code text,
  address text,
  email text,
  phone text,
  invoice_prefix text not null default 'ATM' check (invoice_prefix ~ '^[A-Z0-9-]{2,12}$'),
  invoice_document_type text not null default 'payment_confirmation'
    check (invoice_document_type in ('payment_confirmation', 'invoice', 'vat_invoice')),
  ready_for_invoicing boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.business_profile (singleton) values (true)
on conflict (singleton) do nothing;

create table if not exists public.shipping_catalog (
  carrier text primary key check (carrier in ('Omniva', 'LP Express', 'DPD')),
  price_cents integer check (price_cents is null or price_cents >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.shipping_catalog (carrier) values ('Omniva'), ('LP Express'), ('DPD')
on conflict (carrier) do nothing;

alter table public.uzsakymai
  add column if not exists currency text not null default 'EUR',
  add column if not exists subtotal_cents integer,
  add column if not exists shipping_cents integer,
  add column if not exists total_cents integer,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists paid_at timestamptz,
  add column if not exists fulfillment_status text not null default 'awaiting_payment',
  add column if not exists customer_approved_at timestamptz,
  add column if not exists production_started_at timestamptz,
  add column if not exists production_completed_at timestamptz,
  add column if not exists tracking_url text,
  add column if not exists shipment_provider_ref text,
  add column if not exists label_storage_path text,
  add column if not exists last_tracking_sync_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.uzsakymai drop constraint if exists uzsakymai_currency_check;
alter table public.uzsakymai add constraint uzsakymai_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.uzsakymai drop constraint if exists uzsakymai_amounts_check;
alter table public.uzsakymai add constraint uzsakymai_amounts_check check (
  (subtotal_cents is null or subtotal_cents >= 0)
  and (shipping_cents is null or shipping_cents >= 0)
  and (total_cents is null or total_cents >= 0)
  and (total_cents is null or total_cents = coalesce(subtotal_cents, 0) + coalesce(shipping_cents, 0))
);
alter table public.uzsakymai drop constraint if exists uzsakymai_payment_status_check;
alter table public.uzsakymai add constraint uzsakymai_payment_status_check check (
  payment_status in ('pending', 'processing', 'paid', 'failed', 'refunded', 'cancelled')
);
alter table public.uzsakymai drop constraint if exists uzsakymai_fulfillment_status_check;
alter table public.uzsakymai add constraint uzsakymai_fulfillment_status_check check (
  fulfillment_status in (
    'awaiting_payment', 'awaiting_customer_approval', 'ready_for_production',
    'in_production', 'ready_to_ship', 'shipped', 'delivered', 'cancelled'
  )
);

create index if not exists uzsakymai_payment_status_idx on public.uzsakymai (payment_status, created_at desc);
create index if not exists uzsakymai_fulfillment_status_idx on public.uzsakymai (fulfillment_status, updated_at desc);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.uzsakymai (id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  provider_payment_id text,
  event_type text not null,
  status text not null,
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);
create index if not exists payment_events_order_idx on public.payment_events (order_id, received_at desc);

create sequence if not exists public.invoice_number_seq;

create table if not exists public.invoice_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.uzsakymai (id) on delete restrict,
  invoice_number text not null unique,
  document_type text not null default 'invoice' check (document_type in ('payment_confirmation', 'invoice', 'vat_invoice', 'credit_invoice')),
  issue_date date not null default current_date,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  seller_snapshot jsonb not null,
  buyer_snapshot jsonb not null,
  storage_path text,
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.uzsakymai (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'qr_ready', 'in_production', 'quality_check', 'ready_to_ship', 'completed', 'cancelled')),
  qr_svg_path text,
  qr_pdf_path text,
  customer_approved_at timestamptz not null,
  scheduled_for date,
  admin_note text check (admin_note is null or char_length(admin_note) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists production_jobs_status_idx on public.production_jobs (status, created_at);

create table if not exists public.automation_events (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  event_type text not null,
  order_id uuid references public.uzsakymai (id) on delete cascade,
  recipient_email text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'blocked', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 30),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automation_events_pending_idx on public.automation_events (status, available_at, id);
create index if not exists automation_events_order_idx on public.automation_events (order_id, created_at desc);

create table if not exists public.automation_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists automation_audit_created_idx on public.automation_audit_log (created_at desc);
create index if not exists automation_audit_entity_idx on public.automation_audit_log (entity_type, entity_id, created_at desc);

alter table public.paslaugu_uzklausos
  add column if not exists scheduled_for timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;

alter table public.product_catalog enable row level security;
alter table public.business_profile enable row level security;
alter table public.shipping_catalog enable row level security;
alter table public.payment_events enable row level security;
alter table public.invoice_documents enable row level security;
alter table public.production_jobs enable row level security;
alter table public.automation_events enable row level security;
alter table public.automation_audit_log enable row level security;

revoke all on public.product_catalog, public.business_profile, public.shipping_catalog, public.payment_events,
  public.invoice_documents, public.production_jobs, public.automation_events,
  public.automation_audit_log from public, anon, authenticated;

grant select on public.product_catalog to anon, authenticated;
grant update (name, price_cents, currency, vat_rate, enabled, updated_at) on public.product_catalog to authenticated;
grant select on public.shipping_catalog to anon, authenticated;
grant update (price_cents, currency, enabled, updated_at) on public.shipping_catalog to authenticated;
grant select, update on public.business_profile to authenticated;
grant select on public.payment_events, public.invoice_documents, public.production_jobs to authenticated;
grant update (status, scheduled_for, admin_note, updated_at) on public.production_jobs to authenticated;
grant select, update on public.automation_events to authenticated;
grant select on public.automation_audit_log to authenticated;
grant update (customer_approved_at) on public.uzsakymai to authenticated;
grant update (scheduled_for, completed_at, reminder_sent_at) on public.paslaugu_uzklausos to authenticated;
grant all on public.product_catalog, public.business_profile, public.shipping_catalog, public.payment_events,
  public.invoice_documents, public.production_jobs, public.automation_events,
  public.automation_audit_log to service_role;
grant usage, select on sequence public.invoice_number_seq to service_role;
grant usage, select on all sequences in schema public to service_role;

drop policy if exists "Viesas skaito produktu kataloga" on public.product_catalog;
create policy "Viesas skaito produktu kataloga" on public.product_catalog
for select to anon, authenticated using (enabled = true or exists (
  select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'
));
drop policy if exists "Admin atnaujina produktu kataloga" on public.product_catalog;
create policy "Admin atnaujina produktu kataloga" on public.product_catalog
for update to authenticated
using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'))
with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

drop policy if exists "Viesas skaito pristatymo kataloga" on public.shipping_catalog;
create policy "Viesas skaito pristatymo kataloga" on public.shipping_catalog
for select to anon, authenticated using (enabled = true or exists (
  select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'
));
drop policy if exists "Admin atnaujina pristatymo kataloga" on public.shipping_catalog;
create policy "Admin atnaujina pristatymo kataloga" on public.shipping_catalog
for update to authenticated
using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'))
with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

drop policy if exists "Admin valdo verslo profili" on public.business_profile;
create policy "Admin valdo verslo profili" on public.business_profile
for all to authenticated
using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'))
with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

drop policy if exists "Savininkas ir admin skaito mokejimus" on public.payment_events;
create policy "Savininkas ir admin skaito mokejimus" on public.payment_events
for select to authenticated using (exists (
  select 1 from public.uzsakymai u
  join public.profiliai p on p.id = u.profilis_id
  where u.id = payment_events.order_id
    and (p.owner_id = (select auth.uid()) or exists (
      select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'
    ))
));

drop policy if exists "Savininkas ir admin skaito saskaitas" on public.invoice_documents;
create policy "Savininkas ir admin skaito saskaitas" on public.invoice_documents
for select to authenticated using (exists (
  select 1 from public.uzsakymai u
  join public.profiliai p on p.id = u.profilis_id
  where u.id = invoice_documents.order_id
    and (p.owner_id = (select auth.uid()) or exists (
      select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'
    ))
));

drop policy if exists "Savininkas ir admin skaito gamyba" on public.production_jobs;
create policy "Savininkas ir admin skaito gamyba" on public.production_jobs
for select to authenticated using (exists (
  select 1 from public.uzsakymai u
  join public.profiliai p on p.id = u.profilis_id
  where u.id = production_jobs.order_id
    and (p.owner_id = (select auth.uid()) or exists (
      select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'
    ))
));
drop policy if exists "Admin atnaujina gamyba" on public.production_jobs;
create policy "Admin atnaujina gamyba" on public.production_jobs
for update to authenticated
using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'))
with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

drop policy if exists "Admin skaito automatizavima" on public.automation_events;
create policy "Admin skaito automatizavima" on public.automation_events
for select to authenticated using (exists (
  select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'
));
drop policy if exists "Admin atnaujina automatizavima" on public.automation_events;
create policy "Admin atnaujina automatizavima" on public.automation_events
for update to authenticated
using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'))
with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

drop policy if exists "Admin skaito audita" on public.automation_audit_log;
create policy "Admin skaito audita" on public.automation_audit_log
for select to authenticated using (exists (
  select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'
));

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
    select * into catalog from public.product_catalog where id = new.product_type and enabled = true;
    if new.subtotal_cents is null and catalog.id is not null then
      new.subtotal_cents := catalog.price_cents;
      new.currency := catalog.currency;
    end if;
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

drop trigger if exists automation_prepare_order on public.uzsakymai;
create trigger automation_prepare_order
before insert or update on public.uzsakymai
for each row execute function private.automation_prepare_order();

-- Neapmokėti užsakymai seka administratoriaus patvirtintas katalogo kainas.
drop trigger if exists guard_order_update on public.uzsakymai;
update public.uzsakymai u
set subtotal_cents = p.price_cents
from public.product_catalog p
where u.product_type = p.id and u.apmoketa = false and p.enabled = true;

update public.uzsakymai u
set shipping_cents = s.price_cents
from public.shipping_catalog s
where u.carrier = s.carrier and u.apmoketa = false and s.enabled = true;

update public.uzsakymai
set total_cents = subtotal_cents + shipping_cents
where apmoketa = false and subtotal_cents is not null and shipping_cents is not null;

create or replace function private.automation_refresh_catalog_orders()
returns trigger language plpgsql security definer set search_path = public, private
as $$
begin
  if tg_table_name = 'product_catalog' then
    update public.uzsakymai
    set subtotal_cents = case when new.enabled then new.price_cents else null end
    where product_type = new.id and apmoketa = false;
  elsif tg_table_name = 'shipping_catalog' then
    update public.uzsakymai
    set shipping_cents = case when new.enabled then new.price_cents else null end
    where carrier = new.carrier and apmoketa = false;
  end if;
  return new;
end;
$$;
revoke all on function private.automation_refresh_catalog_orders() from public, anon, authenticated;
drop trigger if exists automation_refresh_product_orders on public.product_catalog;
create trigger automation_refresh_product_orders after update of price_cents, enabled on public.product_catalog
for each row execute function private.automation_refresh_catalog_orders();
drop trigger if exists automation_refresh_shipping_orders on public.shipping_catalog;
create trigger automation_refresh_shipping_orders after update of price_cents, enabled on public.shipping_catalog
for each row execute function private.automation_refresh_catalog_orders();

create or replace function private.guard_order_update()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare is_admin boolean;
begin
  if coalesce(auth.jwt()->>'role', '') = 'service_role' then return new; end if;
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = 'admin'
  ) into is_admin;
  if is_admin then return new; end if;

  if old.customer_approved_at is null
     and new.customer_approved_at is not null
     and old.apmoketa = true
     and new.fulfillment_status = 'ready_for_production'
     and new.customer_approved_at between now() - interval '5 minutes' and now() + interval '5 minutes'
     and (to_jsonb(new) - array['customer_approved_at','fulfillment_status','updated_at'])
       is not distinct from (to_jsonb(old) - array['customer_approved_at','fulfillment_status','updated_at']) then
    return new;
  end if;

  if old.shipping_status not in ('laukiama_duomenu', 'paruošti') then
    raise exception 'Shipment can no longer be edited by the customer';
  end if;
  if new.shipping_status <> 'paruošti' then
    raise exception 'Invalid customer shipping status';
  end if;
  if (to_jsonb(new) - array[
      'delivery_method','carrier','city','parcel_terminal','recipient_name',
      'recipient_phone','recipient_email','shipping_status','shipping_cents','total_cents','updated_at'
    ]) is distinct from (to_jsonb(old) - array[
      'delivery_method','carrier','city','parcel_terminal','recipient_name',
      'recipient_phone','recipient_email','shipping_status','shipping_cents','total_cents','updated_at'
    ]) then
    raise exception 'Customer may only change delivery details';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_order_update() from public, anon, authenticated;
create trigger guard_order_update
before update on public.uzsakymai
for each row execute function private.guard_order_update();

create or replace function private.automation_enqueue_order_events()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.automation_events (event_key, event_type, order_id, recipient_email, payload)
    values ('order:' || new.id || ':created', 'order.created', new.id, new.recipient_email,
      jsonb_build_object('order_id', new.id, 'profile_id', new.profilis_id))
    on conflict (event_key) do nothing;
  end if;

  if tg_op = 'UPDATE' and old.apmoketa = false and new.apmoketa = true then
    insert into public.automation_events (event_key, event_type, order_id, recipient_email, payload)
    values
      ('order:' || new.id || ':payment-confirmed', 'payment.confirmed', new.id, new.recipient_email,
        jsonb_build_object('order_id', new.id, 'total_cents', new.total_cents, 'currency', new.currency)),
      ('order:' || new.id || ':invoice-requested', 'invoice.requested', new.id, new.recipient_email,
        jsonb_build_object('order_id', new.id)),
      ('order:' || new.id || ':approval-requested', 'production.approval_requested', new.id, new.recipient_email,
        jsonb_build_object('order_id', new.id, 'profile_id', new.profilis_id))
    on conflict (event_key) do nothing;
  end if;

  if tg_op = 'UPDATE' and old.customer_approved_at is null and new.customer_approved_at is not null then
    insert into public.production_jobs (order_id, customer_approved_at)
    values (new.id, new.customer_approved_at)
    on conflict (order_id) do nothing;
    insert into public.automation_events (event_key, event_type, order_id, recipient_email, payload)
    values ('order:' || new.id || ':qr-requested', 'production.qr_requested', new.id, new.recipient_email,
      jsonb_build_object('order_id', new.id, 'profile_id', new.profilis_id))
    on conflict (event_key) do nothing;
  end if;

  if tg_op = 'UPDATE' and old.shipping_status is distinct from new.shipping_status and new.shipping_status = 'išsiųsta' then
    insert into public.automation_events (event_key, event_type, order_id, recipient_email, payload)
    values ('order:' || new.id || ':shipped:' || coalesce(new.tracking_number, ''), 'shipping.sent', new.id, new.recipient_email,
      jsonb_build_object('order_id', new.id, 'carrier', new.carrier, 'tracking_number', new.tracking_number, 'tracking_url', new.tracking_url))
    on conflict (event_key) do nothing;
  end if;

  if tg_op = 'UPDATE' and old.shipping_status is distinct from new.shipping_status and new.shipping_status = 'pristatyta' then
    insert into public.automation_events (event_key, event_type, order_id, recipient_email, payload)
    values ('order:' || new.id || ':delivered', 'shipping.delivered', new.id, new.recipient_email,
      jsonb_build_object('order_id', new.id))
    on conflict (event_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.automation_enqueue_order_events() from public, anon, authenticated;

drop trigger if exists automation_enqueue_order_events on public.uzsakymai;
create trigger automation_enqueue_order_events
after insert or update on public.uzsakymai
for each row execute function private.automation_enqueue_order_events();

create or replace function private.automation_touch_production()
returns trigger language plpgsql security definer set search_path = public, private
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.automation_touch_production() from public, anon, authenticated;
drop trigger if exists automation_touch_production on public.production_jobs;
create trigger automation_touch_production before update on public.production_jobs
for each row execute function private.automation_touch_production();

create or replace function private.automation_sync_production()
returns trigger language plpgsql security definer set search_path = public, private
as $$
declare ord public.uzsakymai%rowtype;
begin
  select * into ord from public.uzsakymai where id = new.order_id;
  if new.status = 'in_production' and old.status is distinct from new.status then
    update public.uzsakymai set
      fulfillment_status = 'in_production',
      production_started_at = coalesce(production_started_at, now())
    where id = new.order_id;
  elsif new.status = 'ready_to_ship' and old.status is distinct from new.status then
    update public.uzsakymai set
      fulfillment_status = 'ready_to_ship',
      production_completed_at = coalesce(production_completed_at, now())
    where id = new.order_id;
    insert into public.automation_events (event_key, event_type, order_id, recipient_email, payload)
    values ('order:' || new.order_id || ':label-requested', 'shipping.label_requested', new.order_id, ord.recipient_email,
      jsonb_build_object('order_id', new.order_id, 'carrier', ord.carrier))
    on conflict (event_key) do nothing;
  elsif new.status = 'cancelled' and old.status is distinct from new.status then
    update public.uzsakymai set fulfillment_status = 'cancelled' where id = new.order_id;
  end if;
  return new;
end;
$$;
revoke all on function private.automation_sync_production() from public, anon, authenticated;
drop trigger if exists automation_sync_production on public.production_jobs;
create trigger automation_sync_production after update on public.production_jobs
for each row execute function private.automation_sync_production();

create or replace function private.automation_enqueue_service_events()
returns trigger language plpgsql security definer set search_path = public, private
as $$
declare recipient text;
begin
  select email into recipient from auth.users where id = new.owner_id;
  if old.scheduled_for is distinct from new.scheduled_for and new.scheduled_for is not null then
    insert into public.automation_events (event_key, event_type, recipient_email, payload)
    values ('service:' || new.id || ':scheduled:' || extract(epoch from new.scheduled_for)::bigint,
      'service.scheduled', recipient,
      jsonb_build_object('request_id', new.id, 'scheduled_for', new.scheduled_for, 'services', new.paslaugos))
    on conflict (event_key) do nothing;
  end if;
  if old.statusas is distinct from new.statusas and new.statusas = 'atlikta' then
    insert into public.automation_events (event_key, event_type, recipient_email, payload)
    values ('service:' || new.id || ':completed', 'service.completed', recipient,
      jsonb_build_object('request_id', new.id, 'services', new.paslaugos))
    on conflict (event_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.automation_enqueue_service_events() from public, anon, authenticated;
drop trigger if exists automation_enqueue_service_events on public.paslaugu_uzklausos;
create trigger automation_enqueue_service_events
after update on public.paslaugu_uzklausos
for each row execute function private.automation_enqueue_service_events();

create or replace function private.automation_prepare_service()
returns trigger language plpgsql security definer set search_path = public, private
as $$
begin
  if old.statusas is distinct from new.statusas and new.statusas = 'atlikta' then
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;
revoke all on function private.automation_prepare_service() from public, anon, authenticated;
drop trigger if exists automation_prepare_service on public.paslaugu_uzklausos;
create trigger automation_prepare_service
before update on public.paslaugu_uzklausos
for each row execute function private.automation_prepare_service();

create or replace function private.automation_audit_row()
returns trigger language plpgsql security definer set search_path = public, private
as $$
begin
  insert into public.automation_audit_log (actor_id, entity_type, entity_id, action, old_data, new_data)
  values ((select auth.uid()), tg_table_name,
    coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id'), tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.automation_audit_row() from public, anon, authenticated;

drop trigger if exists automation_audit_orders on public.uzsakymai;
create trigger automation_audit_orders after insert or update or delete on public.uzsakymai
for each row execute function private.automation_audit_row();
drop trigger if exists automation_audit_production on public.production_jobs;
create trigger automation_audit_production after insert or update or delete on public.production_jobs
for each row execute function private.automation_audit_row();

create or replace function public.approve_order_for_production(order_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.uzsakymai u
  set customer_approved_at = now()
  where u.id = order_id
    and u.apmoketa = true
    and u.customer_approved_at is null
    and exists (
      select 1 from public.profiliai p
      where p.id = u.profilis_id and p.owner_id = (select auth.uid())
    );
  if not found then raise exception 'Order is not paid, already approved, or access denied'; end if;
end;
$$;
revoke all on function public.approve_order_for_production(uuid) from public, anon;
grant execute on function public.approve_order_for_production(uuid) to authenticated;

create or replace function public.create_invoice_record(
  p_order_id uuid,
  p_document_type text,
  p_seller_snapshot jsonb,
  p_buyer_snapshot jsonb
)
returns public.invoice_documents
language plpgsql
security invoker
set search_path = public
as $$
declare result public.invoice_documents%rowtype;
declare ord public.uzsakymai%rowtype;
declare prefix text;
begin
  select * into ord from public.uzsakymai where id = p_order_id for update;
  if ord.id is null or ord.apmoketa = false or ord.total_cents is null then
    raise exception 'Paid order with a final total is required';
  end if;
  select invoice_prefix into prefix from public.business_profile where singleton = true and ready_for_invoicing = true;
  if prefix is null then raise exception 'Business profile is not ready for invoicing'; end if;

  insert into public.invoice_documents (
    order_id, invoice_number, document_type, currency, subtotal_cents,
    shipping_cents, total_cents, seller_snapshot, buyer_snapshot
  ) values (
    ord.id,
    prefix || '-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0'),
    p_document_type, ord.currency, ord.subtotal_cents, ord.shipping_cents,
    ord.total_cents, p_seller_snapshot, p_buyer_snapshot
  )
  on conflict (order_id) do update set order_id = excluded.order_id
  returning * into result;
  return result;
end;
$$;
revoke all on function public.create_invoice_record(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_invoice_record(uuid, text, jsonb, jsonb) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'automation-documents', 'automation-documents', false, 10485760,
  array['application/pdf', 'image/svg+xml', 'application/zpl']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Klientai automatizavimo dokumentus gauna tik per autentifikuotą document-download Edge Function.
-- Kitų Storage krepšelių bendrų anon teisių čia nekeičiame.
