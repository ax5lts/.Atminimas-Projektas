-- Hibridinis kapavieciu prieziuros pasiulymas: preliminarus ivertis,
-- administratoriaus galutine kaina, kliento patvirtinimas ir atskiras mokejimas.

-- Svecio uzklausa gali buti pateikta be paskyros. Prisijungus ji saugiai
-- priskiriama tik tai paciai patvirtintai el. pasto paskyrai.
alter table public.paslaugu_uzklausos
  drop constraint if exists paslaugu_uzklausos_owner_id_fkey,
  alter column owner_id drop not null;

alter table public.paslaugu_uzklausos
  add constraint paslaugu_uzklausos_owner_id_fkey
    foreign key (owner_id) references auth.users (id) on delete set null;

alter table public.paslaugu_uzklausos
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists savivaldybe text,
  add column if not exists destination_latitude numeric(9, 6),
  add column if not exists destination_longitude numeric(9, 6),
  add column if not exists location_source text not null default 'manual',
  add column if not exists estimate_status text not null default 'manual_required',
  add column if not exists straight_distance_km numeric(8, 2),
  add column if not exists estimated_one_way_min_km numeric(8, 2),
  add column if not exists estimated_one_way_max_km numeric(8, 2),
  add column if not exists estimated_round_trip_min_km numeric(8, 2),
  add column if not exists estimated_round_trip_max_km numeric(8, 2),
  add column if not exists estimated_service_cents integer,
  add column if not exists estimated_travel_min_cents integer,
  add column if not exists estimated_travel_max_cents integer,
  add column if not exists estimated_total_min_cents integer,
  add column if not exists estimated_total_max_cents integer,
  add column if not exists currency text not null default 'EUR',
  add column if not exists quote_status text not null default 'awaiting_admin',
  add column if not exists quote_amount_cents integer,
  add column if not exists quote_message text,
  add column if not exists quote_revision integer not null default 0,
  add column if not exists quote_sent_at timestamptz,
  add column if not exists quote_expires_at timestamptz,
  add column if not exists quote_accepted_at timestamptz,
  add column if not exists quote_declined_at timestamptz,
  add column if not exists quote_email_sent_at timestamptz,
  add column if not exists quote_email_error text,
  add column if not exists quote_sent_by uuid references auth.users (id) on delete set null,
  add column if not exists payment_status text not null default 'not_ready',
  add column if not exists payment_provider text,
  add column if not exists payment_attempt_id uuid,
  add column if not exists payment_session_id text,
  add column if not exists payment_session_expires_at timestamptz,
  add column if not exists payment_reference text,
  add column if not exists paid_at timestamptz;

update public.paslaugu_uzklausos p
set contact_email = lower(trim(u.email))
from auth.users u
where p.owner_id = u.id and p.contact_email is null and u.email is not null;

alter table public.paslaugu_uzklausos
  drop constraint if exists paslaugu_uzklausos_savivaldybe_check,
  drop constraint if exists paslaugu_uzklausos_contact_check,
  drop constraint if exists paslaugu_uzklausos_coordinates_check,
  drop constraint if exists paslaugu_uzklausos_location_source_check,
  drop constraint if exists paslaugu_uzklausos_estimate_status_check,
  drop constraint if exists paslaugu_uzklausos_distance_values_check,
  drop constraint if exists paslaugu_uzklausos_estimate_values_check,
  drop constraint if exists paslaugu_uzklausos_currency_check,
  drop constraint if exists paslaugu_uzklausos_quote_status_check,
  drop constraint if exists paslaugu_uzklausos_quote_values_check,
  drop constraint if exists paslaugu_uzklausos_quote_state_check,
  drop constraint if exists paslaugu_uzklausos_payment_status_check,
  drop constraint if exists paslaugu_uzklausos_payment_state_check;

alter table public.paslaugu_uzklausos
  add constraint paslaugu_uzklausos_contact_check check (
    (owner_id is not null or contact_email is not null)
    and (contact_email is null or (
      char_length(contact_email) between 3 and 254
      and contact_email = lower(trim(contact_email))
      and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ))
    and (contact_phone is null or char_length(trim(contact_phone)) between 5 and 40)
  ),
  add constraint paslaugu_uzklausos_savivaldybe_check
    check (savivaldybe is null or char_length(trim(savivaldybe)) between 2 and 160),
  add constraint paslaugu_uzklausos_coordinates_check check (
    (destination_latitude is null and destination_longitude is null)
    or (destination_latitude between -90 and 90 and destination_longitude between -180 and 180)
  ),
  add constraint paslaugu_uzklausos_location_source_check
    check (location_source in ('registry', 'saved', 'manual')),
  add constraint paslaugu_uzklausos_estimate_status_check
    check (estimate_status in ('calculated', 'manual_required', 'unconfigured', 'failed')),
  add constraint paslaugu_uzklausos_distance_values_check check (
    (straight_distance_km is null or straight_distance_km >= 0)
    and (estimated_one_way_min_km is null or estimated_one_way_min_km >= 0)
    and (estimated_one_way_max_km is null or estimated_one_way_max_km >= coalesce(estimated_one_way_min_km, 0))
    and (estimated_round_trip_min_km is null or estimated_round_trip_min_km >= 0)
    and (estimated_round_trip_max_km is null or estimated_round_trip_max_km >= coalesce(estimated_round_trip_min_km, 0))
  ),
  add constraint paslaugu_uzklausos_estimate_values_check check (
    (estimated_service_cents is null or estimated_service_cents >= 0)
    and (estimated_travel_min_cents is null or estimated_travel_min_cents >= 0)
    and (estimated_travel_max_cents is null or estimated_travel_max_cents >= coalesce(estimated_travel_min_cents, 0))
    and (estimated_total_min_cents is null or estimated_total_min_cents >= 0)
    and (estimated_total_max_cents is null or estimated_total_max_cents >= coalesce(estimated_total_min_cents, 0))
  ),
  add constraint paslaugu_uzklausos_currency_check check (currency ~ '^[A-Z]{3}$'),
  add constraint paslaugu_uzklausos_quote_status_check
    check (quote_status in ('awaiting_admin', 'sent', 'accepted', 'declined', 'expired')),
  add constraint paslaugu_uzklausos_quote_values_check check (
    quote_revision >= 0
    and (quote_amount_cents is null or quote_amount_cents > 0)
    and (quote_message is null or char_length(quote_message) <= 2000)
    and (quote_email_error is null or char_length(quote_email_error) <= 2000)
  ),
  add constraint paslaugu_uzklausos_quote_state_check check (
    quote_status = 'awaiting_admin'
    or (quote_amount_cents is not null and quote_sent_at is not null and quote_expires_at is not null)
  ),
  add constraint paslaugu_uzklausos_payment_status_check
    check (payment_status in ('not_ready', 'pending', 'processing', 'paid', 'failed', 'refunded', 'cancelled')),
  add constraint paslaugu_uzklausos_payment_state_check check (
    (payment_status <> 'processing' or (
      payment_provider is not distinct from 'stripe' and payment_attempt_id is not null
      and payment_session_expires_at is not null
    ))
    and (payment_status <> 'paid' or (
      payment_provider is not distinct from 'stripe' and payment_attempt_id is not null
      and payment_session_expires_at is not null and payment_session_id is not null
      and payment_reference is not null and paid_at is not null
    ))
  );

create index if not exists paslaugu_uzklausos_quote_status_idx
  on public.paslaugu_uzklausos (quote_status, created_at desc);
create index if not exists paslaugu_uzklausos_payment_status_idx
  on public.paslaugu_uzklausos (payment_status, created_at desc);
create index if not exists paslaugu_uzklausos_unclaimed_email_idx
  on public.paslaugu_uzklausos (contact_email, created_at desc)
  where owner_id is null;

-- Valandinis srauto ribojimas saugo tik serverio HMAC pseudonimus. Zalias IP,
-- User-Agent ar kitas irenginio identifikatorius i duomenu baze nepatenka.
create table if not exists private.service_request_rate_limits (
  bucket_start timestamptz not null,
  scope text not null check (scope in ('ip', 'device')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (bucket_start, scope, subject_hash)
);
create index if not exists service_request_rate_limits_cleanup_idx
  on private.service_request_rate_limits (bucket_start);
revoke all on table private.service_request_rate_limits from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on table private.service_request_rate_limits to service_role;

create or replace function public.consume_service_request_rate_limit(
  p_ip_hash text,
  p_device_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare current_bucket timestamptz := date_trunc('hour', clock_timestamp());
declare ip_count integer := 0;
declare device_count integer := 0;
begin
  if p_ip_hash is null and p_device_hash is null then
    raise exception 'rate_limit_identity_missing';
  end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'rate_limit_ip_hash_invalid';
  end if;
  if p_device_hash is not null and p_device_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'rate_limit_device_hash_invalid';
  end if;

  -- Trumpa saugojimo trukme pakankama valandiniam ribojimui ir mazina duomenu kieki.
  delete from private.service_request_rate_limits
    where bucket_start < current_bucket - interval '48 hours';

  if p_ip_hash is not null then
    insert into private.service_request_rate_limits as limits (
      bucket_start, scope, subject_hash, request_count, updated_at
    ) values (current_bucket, 'ip', p_ip_hash, 1, now())
    on conflict (bucket_start, scope, subject_hash) do update set
      request_count = limits.request_count + 1,
      updated_at = now()
    returning request_count into ip_count;
    if ip_count > 12 then raise exception 'rate_limit_ip'; end if;
  end if;

  if p_device_hash is not null then
    insert into private.service_request_rate_limits as limits (
      bucket_start, scope, subject_hash, request_count, updated_at
    ) values (current_bucket, 'device', p_device_hash, 1, now())
    on conflict (bucket_start, scope, subject_hash) do update set
      request_count = limits.request_count + 1,
      updated_at = now()
    returning request_count into device_count;
    if device_count > 6 then raise exception 'rate_limit_device'; end if;
  end if;

  return jsonb_build_object('ip_count', ip_count, 'device_count', device_count);
end;
$$;
revoke all on function public.consume_service_request_rate_limit(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_service_request_rate_limit(text, text) to service_role;

-- Kainodara ir tiksli isvykimo vieta skaitoma tik serverio ir administratoriaus.
create table if not exists public.service_quote_settings (
  id text primary key default 'default' check (id = 'default'),
  base_label text not null default 'Panevėžys' check (char_length(trim(base_label)) between 2 and 120),
  base_latitude numeric(9, 6) not null check (base_latitude between -90 and 90),
  base_longitude numeric(9, 6) not null check (base_longitude between -180 and 180),
  road_factor_min numeric(4, 2) not null default 1.15 check (road_factor_min between 1 and 3),
  road_factor_max numeric(4, 2) not null default 1.35 check (road_factor_max between road_factor_min and 3),
  included_round_trip_km numeric(8, 2) not null default 0 check (included_round_trip_km >= 0),
  travel_rate_cents_per_km integer check (travel_rate_cents_per_km is null or travel_rate_cents_per_km >= 0),
  manual_review_over_one_way_km numeric(8, 2) not null default 150 check (manual_review_over_one_way_km > 0),
  price_catalog jsonb not null default '{}'::jsonb check (jsonb_typeof(price_catalog) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.service_quote_settings (
  id, base_label, base_latitude, base_longitude, road_factor_min, road_factor_max,
  included_round_trip_km, travel_rate_cents_per_km, manual_review_over_one_way_km,
  price_catalog
) values (
  'default', 'Panevėžys', 55.734800, 24.357500, 1.15, 1.35,
  0, null, 150,
  '{"candle_1":null,"candle_2":null,"candle_5":null,"candle_other":null,"flower_1":null,"flower_3":null,"flower_5":null,"flower_bouquet":null,"flower_other":null,"cleaning_full":null,"cleaning_grooves":null,"cleaning_surface":null,"cleaning_monument":null,"cleaning_leaves":null}'::jsonb
) on conflict (id) do nothing;

alter table public.service_quote_settings enable row level security;
revoke all on table public.service_quote_settings from public, anon, authenticated;
grant select, insert, update on table public.service_quote_settings to service_role;

-- Paslaugos mokėjimo įvykiai atskirti nuo QR prekių užsakymų.
create table if not exists public.service_payment_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.paslaugu_uzklausos (id) on delete restrict,
  provider text not null check (char_length(trim(provider)) between 2 and 40),
  provider_event_id text not null check (char_length(trim(provider_event_id)) between 2 and 255),
  provider_payment_id text,
  payment_attempt_id uuid not null,
  quote_revision integer not null check (quote_revision >= 0),
  event_type text not null check (char_length(trim(event_type)) between 2 and 160),
  status text not null check (status in ('accepted', 'rejected_quote_or_amount', 'recorded')),
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create index if not exists service_payment_events_request_idx
  on public.service_payment_events (request_id, processed_at desc);
alter table public.service_payment_events enable row level security;
revoke all on table public.service_payment_events from public, anon, authenticated;
grant select, insert, update on table public.service_payment_events to service_role;
grant usage, select on sequence public.service_payment_events_id_seq to service_role;

-- Klientas paslaugos uzklausas kuria tik per serverine funkcija, kuri perskaiciuoja iverti.
revoke insert on table public.paslaugu_uzklausos from authenticated;
revoke update on table public.paslaugu_uzklausos from authenticated;
drop policy if exists "Savininkas pateikia paslaugu uzklausa" on public.paslaugu_uzklausos;
grant update (statusas, admin_pastaba, scheduled_for, updated_at)
  on table public.paslaugu_uzklausos to authenticated;
grant select, insert, update on table public.paslaugu_uzklausos to service_role;

create or replace function public.admin_send_service_quote(
  p_request_id uuid,
  p_actor_id uuid,
  p_expected_revision integer,
  p_amount_cents integer,
  p_message text,
  p_expires_at timestamptz
)
returns public.paslaugu_uzklausos
language plpgsql
security invoker
set search_path = public
as $$
declare req public.paslaugu_uzklausos%rowtype;
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_actor_id and role = 'admin'
  ) then raise exception 'Administrator access required'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'Invalid quote amount';
  end if;
  if p_expires_at is null or p_expires_at <= now() + interval '35 minutes'
      or p_expires_at > now() + interval '90 days' then
    raise exception 'Invalid quote expiry';
  end if;

  select * into req from public.paslaugu_uzklausos where id = p_request_id for update;
  if req.id is null then raise exception 'Service request not found'; end if;
  if req.quote_revision is distinct from p_expected_revision then raise exception 'Quote revision changed'; end if;
  if req.payment_status in ('processing', 'paid') then raise exception 'Payment already started'; end if;

  update public.paslaugu_uzklausos set
    quote_status = 'sent',
    quote_amount_cents = p_amount_cents,
    quote_message = nullif(trim(coalesce(p_message, '')), ''),
    quote_revision = quote_revision + 1,
    quote_sent_at = now(),
    quote_expires_at = p_expires_at,
    quote_accepted_at = null,
    quote_declined_at = null,
    quote_email_sent_at = null,
    quote_email_error = null,
    quote_sent_by = p_actor_id,
    payment_status = 'not_ready',
    payment_provider = null,
    payment_attempt_id = null,
    payment_session_id = null,
    payment_session_expires_at = null,
    payment_reference = null,
    paid_at = null,
    updated_at = now()
  where id = p_request_id
  returning * into req;
  return req;
end;
$$;
revoke all on function public.admin_send_service_quote(uuid, uuid, integer, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_send_service_quote(uuid, uuid, integer, integer, text, timestamptz)
  to service_role;

create or replace function public.accept_my_service_quote(
  p_request_id uuid,
  p_quote_revision integer
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare req public.paslaugu_uzklausos%rowtype;
declare caller uuid := (select auth.uid());
begin
  if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Authentication required';
  end if;
  select * into req from public.paslaugu_uzklausos
    where id = p_request_id and owner_id = caller for update;
  if req.id is null then raise exception 'Service request not found'; end if;
  if req.quote_revision is distinct from p_quote_revision then return 'stale'; end if;
  if req.quote_status <> 'sent' then return req.quote_status; end if;
  if req.quote_expires_at is null or req.quote_expires_at <= now() then
    update public.paslaugu_uzklausos set quote_status = 'expired', updated_at = now() where id = req.id;
    return 'expired';
  end if;
  update public.paslaugu_uzklausos set
    quote_status = 'accepted', quote_accepted_at = now(), quote_declined_at = null,
    payment_status = 'pending', statusas = 'susisiekta', updated_at = now()
  where id = req.id;
  return 'accepted';
end;
$$;
revoke all on function public.accept_my_service_quote(uuid, integer) from public, anon, authenticated;
grant execute on function public.accept_my_service_quote(uuid, integer) to authenticated;

create or replace function public.decline_my_service_quote(
  p_request_id uuid,
  p_quote_revision integer
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare req public.paslaugu_uzklausos%rowtype;
declare caller uuid := (select auth.uid());
begin
  if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Authentication required';
  end if;
  select * into req from public.paslaugu_uzklausos
    where id = p_request_id and owner_id = caller for update;
  if req.id is null then raise exception 'Service request not found'; end if;
  if req.quote_revision is distinct from p_quote_revision then return 'stale'; end if;
  if req.quote_status <> 'sent' then return req.quote_status; end if;
  update public.paslaugu_uzklausos set
    quote_status = 'declined', quote_declined_at = now(), quote_accepted_at = null,
    payment_status = 'not_ready', updated_at = now()
  where id = req.id;
  return 'declined';
end;
$$;
revoke all on function public.decline_my_service_quote(uuid, integer) from public, anon, authenticated;
grant execute on function public.decline_my_service_quote(uuid, integer) to authenticated;

create or replace function public.begin_my_service_payment(
  p_request_id uuid,
  p_actor_id uuid
)
returns public.paslaugu_uzklausos
language plpgsql
security invoker
set search_path = public
as $$
declare req public.paslaugu_uzklausos%rowtype;
begin
  if p_actor_id is null then raise exception 'Authentication required'; end if;
  select * into req from public.paslaugu_uzklausos where id = p_request_id for update;
  if req.id is null or req.owner_id is distinct from p_actor_id then
    raise exception 'Service request not found';
  end if;
  if req.payment_status = 'paid' then return req; end if;
  if req.quote_status <> 'accepted' then raise exception 'Quote must be accepted'; end if;

  -- Jau pradetam bandymui paliekamas tas pats attempt ID net jei pasiulymo
  -- galiojimo laikas praejo: klientas gali grizti tik i ta pacia Stripe sesija.
  if req.payment_status = 'processing' and req.payment_attempt_id is not null then
    return req;
  end if;

  if req.quote_expires_at is null or req.quote_expires_at <= now() + interval '35 minutes' then
    update public.paslaugu_uzklausos set
      quote_status = 'expired', payment_status = 'not_ready', payment_provider = null,
      payment_attempt_id = null, payment_session_id = null, payment_reference = null,
      payment_session_expires_at = null,
      updated_at = now()
    where id = req.id returning * into req;
    return req;
  end if;
  if req.payment_status not in ('pending', 'failed', 'cancelled') then
    raise exception 'Payment is not ready';
  end if;

  update public.paslaugu_uzklausos set
    payment_status = 'processing',
    payment_provider = 'stripe',
    payment_attempt_id = gen_random_uuid(),
    payment_session_id = null,
    payment_session_expires_at = least(req.quote_expires_at, now() + interval '23 hours 55 minutes'),
    payment_reference = null,
    paid_at = null,
    updated_at = now()
  where id = req.id returning * into req;
  return req;
end;
$$;
revoke all on function public.begin_my_service_payment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_my_service_payment(uuid, uuid) to service_role;

create or replace function public.attach_service_payment_session(
  p_request_id uuid,
  p_actor_id uuid,
  p_quote_revision integer,
  p_payment_attempt_id uuid,
  p_session_id text
)
returns public.paslaugu_uzklausos
language plpgsql
security invoker
set search_path = public
as $$
declare req public.paslaugu_uzklausos%rowtype;
begin
  if p_actor_id is null then raise exception 'Authentication required'; end if;
  if p_session_id is null or p_session_id !~ '^cs_[A-Za-z0-9_]+$' or char_length(p_session_id) > 255 then
    raise exception 'Invalid checkout session';
  end if;
  select * into req from public.paslaugu_uzklausos where id = p_request_id for update;
  if req.id is null or req.owner_id is distinct from p_actor_id then
    raise exception 'Service request not found';
  end if;
  if req.quote_revision is distinct from p_quote_revision
      or req.payment_attempt_id is distinct from p_payment_attempt_id then
    raise exception 'Payment attempt changed';
  end if;
  if req.payment_status not in ('processing', 'paid') or req.payment_provider is distinct from 'stripe' then
    raise exception 'Payment attempt is not active';
  end if;
  if req.payment_session_id is not null and req.payment_session_id <> p_session_id then
    raise exception 'Checkout session changed';
  end if;
  if req.payment_session_id is null then
    update public.paslaugu_uzklausos set payment_session_id = p_session_id, updated_at = now()
      where id = req.id returning * into req;
  end if;
  return req;
end;
$$;
revoke all on function public.attach_service_payment_session(uuid, uuid, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.attach_service_payment_session(uuid, uuid, integer, uuid, text)
  to service_role;

create or replace function public.fail_unattached_service_payment(
  p_request_id uuid,
  p_actor_id uuid,
  p_quote_revision integer,
  p_payment_attempt_id uuid,
  p_http_status integer
)
returns public.paslaugu_uzklausos
language plpgsql
security invoker
set search_path = public
as $$
declare req public.paslaugu_uzklausos%rowtype;
begin
  if p_actor_id is null then raise exception 'Authentication required'; end if;
  -- Tik galutines kliento uzklausos klaidos. Timeout, conflict ir rate-limit
  -- gali buti dviprasmiai, todel jiems paliekamas tas pats retry bandymas.
  if p_http_status < 400 or p_http_status >= 500
      or p_http_status in (408, 409, 425, 429) then
    raise exception 'Stripe response is retryable or ambiguous';
  end if;

  select * into req from public.paslaugu_uzklausos where id = p_request_id for update;
  if req.id is null or req.owner_id is distinct from p_actor_id then
    raise exception 'Service request not found';
  end if;
  if req.quote_revision is distinct from p_quote_revision
      or req.payment_attempt_id is distinct from p_payment_attempt_id then
    raise exception 'Payment attempt changed';
  end if;
  if req.payment_status <> 'processing' or req.payment_provider is distinct from 'stripe'
      or req.payment_session_id is not null then
    raise exception 'Payment attempt already has a session or is not active';
  end if;

  update public.paslaugu_uzklausos set
    payment_status = 'failed',
    payment_session_expires_at = null,
    payment_reference = null,
    updated_at = now()
  where id = req.id returning * into req;
  return req;
end;
$$;
revoke all on function public.fail_unattached_service_payment(uuid, uuid, integer, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.fail_unattached_service_payment(uuid, uuid, integer, uuid, integer)
  to service_role;

create or replace function public.process_stripe_service_payment_event(
  p_request_id uuid,
  p_quote_revision integer,
  p_payment_attempt_id uuid,
  p_provider_event_id text,
  p_provider_payment_id text,
  p_event_type text,
  p_amount_cents integer,
  p_currency text,
  p_payment_status text,
  p_object_id text,
  p_mode text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare req public.paslaugu_uzklausos%rowtype;
declare paid_event boolean;
declare valid_payment boolean;
declare event_status text;
declare inserted_event_id bigint;
declare existing_event_status text;
begin
  select * into req from public.paslaugu_uzklausos where id = p_request_id for update;
  if req.id is null then raise exception 'Service request not found'; end if;

  paid_event := p_event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
    and lower(p_payment_status) = 'paid';
  valid_payment := p_quote_revision = req.quote_revision
    and p_payment_attempt_id = req.payment_attempt_id
    and req.quote_status = 'accepted'
    and req.payment_status in ('processing', 'paid')
    and req.payment_provider = 'stripe'
    and p_mode = 'payment'
    and p_object_id = req.payment_session_id
    and p_amount_cents = req.quote_amount_cents
    and upper(p_currency) = req.currency;
  event_status := case
    when paid_event and valid_payment then 'accepted'
    when paid_event then 'rejected_quote_or_amount'
    else 'recorded'
  end;

  insert into public.service_payment_events (
    request_id, provider, provider_event_id, provider_payment_id, payment_attempt_id, quote_revision,
    event_type, status, amount_cents, currency, payload, processed_at
  ) values (
    req.id, 'stripe', p_provider_event_id, nullif(p_provider_payment_id, ''), p_payment_attempt_id, p_quote_revision,
    p_event_type, event_status, p_amount_cents, nullif(upper(p_currency), ''),
    jsonb_build_object('id', p_object_id, 'payment_status', p_payment_status, 'mode', p_mode), now()
  ) on conflict (provider, provider_event_id) do nothing
  returning id into inserted_event_id;

  if inserted_event_id is null then
    select status into existing_event_status from public.service_payment_events
      where provider = 'stripe' and provider_event_id = p_provider_event_id;
    return 'duplicate:' || coalesce(existing_event_status, 'recorded');
  end if;

  if paid_event and valid_payment and req.payment_status <> 'paid' then
    update public.paslaugu_uzklausos set
      payment_status = 'paid',
      payment_provider = 'stripe',
      payment_reference = coalesce(nullif(p_provider_payment_id, ''), nullif(p_object_id, '')),
      paid_at = now(),
      statusas = 'susisiekta',
      updated_at = now()
    where id = req.id;
  elsif p_event_type = 'checkout.session.async_payment_failed'
      and req.payment_status <> 'paid' and p_quote_revision = req.quote_revision
      and p_payment_attempt_id = req.payment_attempt_id and p_object_id = req.payment_session_id then
    update public.paslaugu_uzklausos set payment_status = 'failed', updated_at = now() where id = req.id;
  elsif p_event_type = 'checkout.session.expired'
      and req.payment_status <> 'paid' and p_quote_revision = req.quote_revision
      and p_payment_attempt_id = req.payment_attempt_id and p_object_id = req.payment_session_id then
    update public.paslaugu_uzklausos set payment_status = 'cancelled', updated_at = now() where id = req.id;
  end if;
  return event_status;
end;
$$;
revoke all on function public.process_stripe_service_payment_event(
  uuid, integer, uuid, text, text, text, integer, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.process_stripe_service_payment_event(
  uuid, integer, uuid, text, text, text, integer, text, text, text, text
) to service_role;

drop trigger if exists automation_audit_service_requests on public.paslaugu_uzklausos;
create trigger automation_audit_service_requests
after insert or update or delete on public.paslaugu_uzklausos
for each row execute function private.automation_audit_row();
