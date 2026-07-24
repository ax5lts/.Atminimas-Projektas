-- Private memorial media and least-privilege API access.
--
-- Public memorial pages are served through the `profile-content` Edge Function.
-- The browser must not read `profiliai`, legacy `medijos`, or the `atminimas`
-- bucket anonymously.

-- Stop legacy default ACLs from automatically exposing future application
-- tables, sequences, and functions. The migration owner (`postgres`) is
-- mandatory. Hosted Supabase does not normally let `postgres` assume the
-- managed `supabase_admin` role, so that role is handled when possible and
-- otherwise produces an explicit follow-up warning without rolling back all
-- of the current-object protections in this migration.
do $default_acl$
declare
  target_role name;
begin
  for target_role in
    select role_row.rolname::name
    from pg_catalog.pg_roles as role_row
    where role_row.rolname in ('postgres', 'supabase_admin')
    order by role_row.rolname
  loop
    if target_role = 'supabase_admin'
      and current_user <> target_role
      and not pg_has_role(current_user, target_role, 'MEMBER')
    then
      raise warning
        'SECURITY FOLLOW-UP REQUIRED: managed role supabase_admin still has legacy public-schema default ACLs. Run the equivalent ALTER DEFAULT PRIVILEGES revokes as supabase_admin or ask Supabase Support to remove them.';
      continue;
    end if;

    execute format(
      'alter default privileges for role %I in schema public revoke all privileges on tables from public, anon, authenticated, service_role',
      target_role
    );
    execute format(
      'alter default privileges for role %I in schema public revoke all privileges on sequences from public, anon, authenticated, service_role',
      target_role
    );
    execute format(
      'alter default privileges for role %I in schema public revoke all privileges on functions from public, anon, authenticated, service_role',
      target_role
    );
  end loop;
end;
$default_acl$;

revoke create on schema public from public, anon, authenticated, service_role;
grant usage on schema public to anon, authenticated;
grant usage on schema public to service_role;

-- Reset every current public-schema API grant, then rebuild the allow-list.
-- RLS remains the row-level boundary; column grants below are the first layer.
revoke all privileges on all tables in schema public
  from public, anon, authenticated, service_role;
revoke all privileges on all sequences in schema public
  from public, anon, authenticated, service_role;
revoke all privileges on all functions in schema public
  from public, anon, authenticated, service_role;

-- Trusted backend/Edge code needs a complete explicit baseline on objects that
-- already exist, even in a fresh project whose future default ACL is empty.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant select on table public.profiliai to authenticated;
grant insert (
  id,
  owner_id,
  vardas,
  pavarde,
  gimimo_data,
  mirties_data,
  epitafija,
  tekstas_200,
  layout_json,
  media_json,
  aktyvus,
  apmoketa
) on table public.profiliai to authenticated;
grant update (aktyvus, statusas, apmoketa)
  on table public.profiliai to authenticated;
alter table public.profiliai
  alter column owner_id set default auth.uid();
grant select on table public.user_roles to authenticated;

alter table public.user_roles enable row level security;
alter table public.user_roles force row level security;
drop policy if exists "User gali matyti savo role" on public.user_roles;
create policy "User gali matyti savo role"
  on public.user_roles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on table public.uzsakymai to authenticated;
grant update (
  delivery_method,
  carrier,
  city,
  parcel_terminal,
  recipient_name,
  recipient_phone,
  recipient_email,
  shipping_status,
  tracking_number,
  shipment_created_at,
  customer_approved_at
) on table public.uzsakymai to authenticated;

-- Legal submissions enter through the rate-limited `legal-submission` Edge
-- Function. Authenticated administrators only read and decide them directly.
grant select on table public.atsisakymai, public.turinio_pranesimai
  to authenticated;
grant update (status, decision_note, decided_at)
  on table public.atsisakymai, public.turinio_pranesimai
  to authenticated;

grant select on table public.paslaugu_uzklausos to authenticated;
grant update (statusas, admin_pastaba, scheduled_for, updated_at)
  on table public.paslaugu_uzklausos to authenticated;

grant select on table public.product_catalog, public.shipping_catalog
  to anon, authenticated;
grant update (name, price_cents, currency, vat_rate, enabled, updated_at)
  on table public.product_catalog to authenticated;
grant update (price_cents, currency, enabled, updated_at)
  on table public.shipping_catalog to authenticated;

grant select, update on table public.business_profile to authenticated;
grant select on table
  public.payment_events,
  public.invoice_documents,
  public.production_jobs
  to authenticated;
grant update (status, scheduled_for, admin_note, updated_at)
  on table public.production_jobs to authenticated;
grant select, update on table public.automation_events to authenticated;
grant select on table public.automation_audit_log to authenticated;

grant select on table public.import_runs, public.import_errors
  to authenticated;
grant select, insert, update, delete
  on table public.grave_photo_submissions
  to authenticated;

-- Only non-sensitive columns from official cemetery imports are exposed to
-- browser roles. Service-role import jobs keep their existing explicit grants.
grant select (id, name, normalized_name)
  on table public.municipalities
  to anon, authenticated;
grant select (id, municipality_id, name, normalized_name)
  on table public.cemeteries
  to anon, authenticated;
grant select (
  id,
  municipality_id,
  cemetery_id,
  section,
  row,
  place_number,
  latitude,
  longitude,
  is_active
) on table public.graves
  to anon, authenticated;
grant select (
  id,
  municipality_id,
  cemetery_id,
  grave_id,
  first_name,
  last_name,
  full_name,
  grave_section,
  grave_row,
  grave_place_number,
  normalized_first_name,
  normalized_last_name,
  normalized_full_name,
  birth_date,
  death_date,
  burial_date,
  birth_year,
  death_year,
  burial_year,
  birth_date_text,
  death_date_text,
  burial_date_text,
  is_active
) on table public.deceased_people
  to anon, authenticated;

-- `kapavietes` also contains internal source and administrator columns. Public
-- access is column-limited; authenticated access is subsequently limited to an
-- administrator by RLS.
grant select (
  id,
  vardas,
  pavarde,
  gimimo_data,
  mirties_data,
  gimimo_metai,
  mirties_metai,
  kapiniu_pavadinimas,
  miestas,
  adresas,
  sektorius,
  eile,
  kapo_numeris,
  vietos_aprasymas,
  platuma,
  ilguma,
  statusas
) on table public.kapavietes to anon;
grant select, insert, update, delete
  on table public.kapavietes to authenticated;

-- The memorial engagement migration was added after some production
-- environments were initialized, so these grants must be deployment-safe when
-- either table is not present yet.
do $memorial_grants$
begin
  if to_regclass('public.memorial_candles') is not null then
    execute
      'grant select on table public.memorial_candles to authenticated';
    execute
      'grant select, insert on table public.memorial_candles to service_role';
  end if;

  if to_regclass('public.memorial_memories') is not null then
    execute
      'grant select on table public.memorial_memories to authenticated';
    execute
      'grant update (status, moderated_at, moderated_by) on table public.memorial_memories to authenticated';
    execute
      'grant select, insert on table public.memorial_memories to service_role';
  end if;
end;
$memorial_grants$;

-- Restore only the browser-callable RPCs. Every other public function remains
-- service-role-only (where previously granted) or inaccessible to browser roles.
grant execute on function public.set_my_profile_visibility(text, boolean)
  to authenticated;
grant execute on function public.set_my_order_delivery(
  uuid, text, text, text, text, text, text
) to authenticated;
grant execute on function public.admin_update_shipment(uuid, text, text)
  to authenticated;
grant execute on function public.approve_order_for_production(uuid)
  to authenticated;
grant execute on function public.accept_my_service_quote(uuid, integer)
  to authenticated;
grant execute on function public.decline_my_service_quote(uuid, integer)
  to authenticated;
grant execute on function public.ieskoti_kapavieciu(text, integer)
  to anon, authenticated;
grant execute on function public.search_deceased(
  text, text, text, integer, integer, text, text, integer, integer
) to anon, authenticated;

-- Anonymous inserts are intentionally removed: these policies predate the
-- validating, rate-limited Edge Function and would bypass it if left in place.
drop policy if exists "Anon pateikia sutarties atsisakyma"
  on public.atsisakymai;
drop policy if exists "Anon pateikia turinio pranesima"
  on public.turinio_pranesimai;
drop policy if exists "Viesas uzsakymu kurimas"
  on public.uzsakymai;

-- Public memorial data is returned only by `profile-content`, which applies the
-- publication/deletion checks and replaces paths with short-lived signed URLs.
drop policy if exists "Viesas skaitymas profiliu" on public.profiliai;
drop policy if exists "Savininkas skaito savo profilius" on public.profiliai;
drop policy if exists "Savininkas arba admin skaito profili"
  on public.profiliai;
drop policy if exists "Viesas kurimas profiliu" on public.profiliai;
drop policy if exists "Prisijunges kuria savo privatu profili"
  on public.profiliai;
create policy "Prisijunges kuria savo privatu profili"
  on public.profiliai
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and coalesce(aktyvus, false) = false
    and apmoketa = false
    and deleted_at is null
  );
create policy "Savininkas arba admin skaito profili"
  on public.profiliai
  for select
  to authenticated
  using (
    (
      owner_id = (select auth.uid())
      and deleted_at is null
    )
    or exists (
      select 1
      from public.user_roles as role
      where role.user_id = (select auth.uid())
        and role.role = 'admin'
    )
  );

drop policy if exists "Viesas skaitymas medijos" on public.medijos;

-- The hand-maintained grave registry exposes published rows only to the anon
-- role. Authenticated table access is reserved for administrators.
drop policy if exists "Viesai rodomos tik paskelbtos kapavietes"
  on public.kapavietes;
drop policy if exists "Admin skaito visas kapavietes"
  on public.kapavietes;
drop policy if exists "Paskelbtas kapavietes skaito visi, visas skaito admin"
  on public.kapavietes;
drop policy if exists "Anon skaito paskelbtas kapavietes"
  on public.kapavietes;

create policy "Anon skaito paskelbtas kapavietes"
  on public.kapavietes
  for select
  to anon
  using (statusas = 'paskelbtas');

create policy "Admin skaito visas kapavietes"
  on public.kapavietes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles as role
      where role.user_id = (select auth.uid())
        and role.role = 'admin'
    )
  );

-- Keep the object path private even for published manual grave records. The
-- public UI receives a stable row id and `grave-photo` proxies the image only
-- after it has independently confirmed that the row is published.
create or replace function public.ieskoti_kapavieciu(
  paieska text,
  rezultatu_limitas integer default 20
)
returns table (
  id uuid,
  vardas text,
  pavarde text,
  gimimo_data date,
  mirties_data date,
  gimimo_metai smallint,
  mirties_metai smallint,
  kapiniu_pavadinimas text,
  miestas text,
  adresas text,
  sektorius text,
  eile text,
  kapo_numeris text,
  vietos_aprasymas text,
  platuma numeric,
  ilguma numeric,
  nuotraukos_kelias text
)
language sql
stable
security invoker
set search_path = public, extensions
as $manual_grave_search$
  select
    grave.id,
    grave.vardas,
    grave.pavarde,
    grave.gimimo_data,
    grave.mirties_data,
    grave.gimimo_metai,
    grave.mirties_metai,
    grave.kapiniu_pavadinimas,
    grave.miestas,
    grave.adresas,
    grave.sektorius,
    grave.eile,
    grave.kapo_numeris,
    grave.vietos_aprasymas,
    grave.platuma,
    grave.ilguma,
    null::text as nuotraukos_kelias
  from public.kapavietes as grave
  where grave.statusas = 'paskelbtas'
    and char_length(trim(coalesce(paieska, ''))) >= 2
    and (
      unaccent(lower(grave.vardas || ' ' || grave.pavarde))
        like '%' || unaccent(lower(trim(paieska))) || '%'
      or similarity(
        unaccent(lower(grave.vardas || ' ' || grave.pavarde)),
        unaccent(lower(trim(paieska)))
      ) >= 0.25
    )
  order by
    (
      unaccent(lower(grave.vardas || ' ' || grave.pavarde))
        = unaccent(lower(trim(paieska)))
    ) desc,
    similarity(
      unaccent(lower(grave.vardas || ' ' || grave.pavarde)),
      unaccent(lower(trim(paieska)))
    ) desc,
    grave.pavarde,
    grave.vardas
  limit least(greatest(coalesce(rezultatu_limitas, 20), 1), 50);
$manual_grave_search$;

-- A valid Stripe signature proves that Stripe sent the event, but the event
-- must also belong to the exact Checkout Session created for this order. This
-- prevents another Checkout integration on the same Stripe account from
-- crediting or failing an unrelated order by reusing its metadata.
create or replace function public.process_stripe_payment_event(
  p_order_id uuid,
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
as $stripe_order_event$
declare
  ord public.uzsakymai%rowtype;
  paid_event boolean;
  valid_amount boolean;
  valid_reference boolean;
  event_status text;
begin
  select *
  into ord
  from public.uzsakymai
  where id = p_order_id
  for update;

  if ord.id is null then
    raise exception 'Order not found';
  end if;

  paid_event := p_event_type in (
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded'
  ) and p_payment_status = 'paid';
  valid_amount := p_amount_cents = ord.total_cents
    and upper(p_currency) = ord.currency;
  valid_reference := p_mode = 'payment'
    and ord.payment_provider = 'stripe'
    and coalesce(
      nullif(ord.payment_reference, '') = nullif(p_object_id, ''),
      false
    );

  event_status := case
    when paid_event and not valid_reference then 'rejected_reference'
    when paid_event and not valid_amount then 'rejected_amount'
    when paid_event then 'accepted'
    when not valid_reference then 'rejected_reference'
    else 'recorded'
  end;

  insert into public.payment_events (
    order_id,
    provider,
    provider_event_id,
    provider_payment_id,
    event_type,
    status,
    amount_cents,
    currency,
    payload,
    processed_at
  ) values (
    ord.id,
    'stripe',
    p_provider_event_id,
    nullif(p_provider_payment_id, ''),
    p_event_type,
    event_status,
    p_amount_cents,
    nullif(upper(p_currency), ''),
    jsonb_build_object(
      'id', p_object_id,
      'payment_status', p_payment_status,
      'mode', p_mode
    ),
    now()
  )
  on conflict (provider, provider_event_id) do nothing;

  if paid_event
    and valid_amount
    and valid_reference
    and ord.apmoketa = false
  then
    update public.uzsakymai
    set
      apmoketa = true,
      payment_status = 'paid',
      payment_provider = 'stripe',
      payment_reference = coalesce(
        nullif(p_provider_payment_id, ''),
        nullif(p_object_id, '')
      ),
      paid_at = now(),
      busena = 'apmoketas'
    where id = ord.id;
  elsif p_event_type = 'checkout.session.async_payment_failed'
    and valid_reference
    and ord.apmoketa = false
  then
    update public.uzsakymai
    set payment_status = 'failed'
    where id = ord.id;
  end if;

  return event_status;
end;
$stripe_order_event$;

revoke all on function public.process_stripe_payment_event(
  uuid, text, text, text, integer, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.process_stripe_payment_event(
  uuid, text, text, text, integer, text, text, text, text
) to service_role;

-- Direct authenticated profile creation bypasses the editor Edge Function, so
-- enforce the same content boundaries in Postgres. The layout is rebuilt from
-- an allow-list and invalid/unknown properties are discarded.
create or replace function private.normalize_profile_layout_and_text()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $normalize_layout$
declare
  layout_key text;
  layout_item jsonb;
  normalized_layout jsonb := '{}'::jsonb;
  normalized_piece jsonb;
  raw_value text;
  numeric_value numeric;
  position_parts text[];
begin
  if char_length(coalesce(new.vardas, '')) > 120 then
    raise exception using
      errcode = '23514',
      message = 'vardas may contain at most 120 characters';
  end if;
  if char_length(coalesce(new.pavarde, '')) > 120 then
    raise exception using
      errcode = '23514',
      message = 'pavarde may contain at most 120 characters';
  end if;
  if char_length(coalesce(new.epitafija, '')) > 180 then
    raise exception using
      errcode = '23514',
      message = 'epitafija may contain at most 180 characters';
  end if;
  if char_length(coalesce(new.tekstas_200, '')) > 10000 then
    raise exception using
      errcode = '23514',
      message = 'tekstas_200 may contain at most 10000 characters';
  end if;
  if char_length(coalesce(new.gimimo_data::text, '')) > 40
    or char_length(coalesce(new.mirties_data::text, '')) > 40
  then
    raise exception using
      errcode = '23514',
      message = 'Profile date text may contain at most 40 characters';
  end if;
  if new.owner_id is not null
    and char_length(btrim(coalesce(new.vardas, ''))) = 0
  then
    raise exception using
      errcode = '23514',
      message = 'Owned profile vardas is required';
  end if;
  if new.owner_id is not null
    and new.id !~ '^[a-z0-9][a-z0-9-]{0,99}$'
  then
    raise exception using
      errcode = '23514',
      message = 'Owned profile id must be a URL-safe slug';
  end if;

  if new.layout_json is null then
    new.layout_json := '{}'::jsonb;
  end if;
  if jsonb_typeof(new.layout_json) is distinct from 'object' then
    raise exception using
      errcode = '23514',
      message = 'layout_json must be a JSON object';
  end if;
  if octet_length(new.layout_json::text) > 32768 then
    raise exception using
      errcode = '23514',
      message = 'layout_json may contain at most 32 KB';
  end if;

  for layout_key, layout_item in
    select layout_row.key, layout_row.value
    from jsonb_each(new.layout_json) as layout_row(key, value)
  loop
    if layout_key not in (
      '__stage',
      'header',
      'text',
      'photo-1',
      'photo-2',
      'photo-3',
      'photo-4',
      'video'
    ) or jsonb_typeof(layout_item) is distinct from 'object' then
      continue;
    end if;

    normalized_piece := '{}'::jsonb;

    if layout_key = '__stage' then
      if jsonb_typeof(layout_item -> 'background') = 'string'
        and (layout_item ->> 'background') ~* '^#[0-9a-f]{6}$'
      then
        normalized_piece := normalized_piece || jsonb_build_object(
          'background',
          lower(layout_item ->> 'background')
        );
      end if;

      if jsonb_typeof(layout_item -> 'heightPct') in ('number', 'string') then
        raw_value := regexp_replace(
          btrim(layout_item ->> 'heightPct'),
          '%$',
          ''
        );
        if raw_value ~ '^\d+(?:\.\d{1,3})?$' then
          numeric_value := raw_value::numeric;
          if numeric_value between 100 and 1200 then
            normalized_piece := normalized_piece || jsonb_build_object(
              'heightPct',
              numeric_value::text
            );
          end if;
        end if;
      end if;

      if jsonb_typeof(layout_item -> 'layoutVersion') in ('number', 'string')
        and (layout_item ->> 'layoutVersion') ~ '^\d+$'
      then
        numeric_value := (layout_item ->> 'layoutVersion')::numeric;
        if numeric_value = trunc(numeric_value)
          and numeric_value between 1 and 2
        then
          normalized_piece := normalized_piece || jsonb_build_object(
            'layoutVersion',
            numeric_value::integer
          );
        end if;
      end if;
    else
      if jsonb_typeof(layout_item -> 'left') in ('number', 'string') then
        raw_value := regexp_replace(btrim(layout_item ->> 'left'), '%$', '');
        if raw_value ~ '^\d+(?:\.\d{1,3})?$' then
          numeric_value := raw_value::numeric;
          if numeric_value between 0 and 100 then
            normalized_piece := normalized_piece || jsonb_build_object(
              'left',
              numeric_value::text || '%'
            );
          end if;
        end if;
      end if;

      if jsonb_typeof(layout_item -> 'top') in ('number', 'string') then
        raw_value := regexp_replace(btrim(layout_item ->> 'top'), '%$', '');
        if raw_value ~ '^\d+(?:\.\d{1,3})?$' then
          numeric_value := raw_value::numeric;
          if numeric_value between 0 and 100 then
            normalized_piece := normalized_piece || jsonb_build_object(
              'top',
              numeric_value::text || '%'
            );
          end if;
        end if;
      end if;

      if jsonb_typeof(layout_item -> 'topPct') in ('number', 'string') then
        raw_value := regexp_replace(
          btrim(layout_item ->> 'topPct'),
          '%$',
          ''
        );
        if raw_value ~ '^\d+(?:\.\d{1,3})?$' then
          numeric_value := raw_value::numeric;
          if numeric_value between 0 and 1200 then
            normalized_piece := normalized_piece || jsonb_build_object(
              'topPct',
              numeric_value::text
            );
          end if;
        end if;
      end if;

      if jsonb_typeof(layout_item -> 'width') in ('number', 'string') then
        raw_value := regexp_replace(btrim(layout_item ->> 'width'), '%$', '');
        if raw_value ~ '^\d+(?:\.\d{1,3})?$' then
          numeric_value := raw_value::numeric;
          if numeric_value between 1 and 100 then
            normalized_piece := normalized_piece || jsonb_build_object(
              'width',
              numeric_value::text || '%'
            );
          end if;
        end if;
      end if;

      if jsonb_typeof(layout_item -> 'heightPct') in ('number', 'string') then
        raw_value := regexp_replace(
          btrim(layout_item ->> 'heightPct'),
          '%$',
          ''
        );
        if raw_value ~ '^\d+(?:\.\d{1,3})?$' then
          numeric_value := raw_value::numeric;
          if numeric_value between 4 and 180 then
            normalized_piece := normalized_piece || jsonb_build_object(
              'heightPct',
              numeric_value::text
            );
          end if;
        end if;
      end if;

      if jsonb_typeof(layout_item -> 'fit') = 'string'
        and (layout_item ->> 'fit') in ('crop', 'contain')
      then
        normalized_piece := normalized_piece || jsonb_build_object(
          'fit',
          layout_item ->> 'fit'
        );
      end if;

      if jsonb_typeof(layout_item -> 'objectPosition') = 'string' then
        position_parts := regexp_match(
          btrim(layout_item ->> 'objectPosition'),
          '^(\d+(?:\.\d{1,3})?)%[[:space:]]+(\d+(?:\.\d{1,3})?)%$'
        );
        if position_parts is not null
          and position_parts[1]::numeric between 0 and 100
          and position_parts[2]::numeric between 0 and 100
        then
          normalized_piece := normalized_piece || jsonb_build_object(
            'objectPosition',
            position_parts[1]::numeric::text || '% '
              || position_parts[2]::numeric::text || '%'
          );
        end if;
      end if;
    end if;

    if normalized_piece <> '{}'::jsonb then
      normalized_layout := normalized_layout
        || jsonb_build_object(layout_key, normalized_piece);
    end if;
  end loop;

  new.layout_json := normalized_layout;
  return new;
end;
$normalize_layout$;

revoke all on function private.normalize_profile_layout_and_text()
  from public, anon, authenticated;

drop trigger if exists normalize_profile_layout_and_text on public.profiliai;
create trigger normalize_profile_layout_and_text
  before insert or update of
    id,
    owner_id,
    vardas,
    pavarde,
    gimimo_data,
    mirties_data,
    epitafija,
    tekstas_200,
    layout_json
  on public.profiliai
  for each row
  execute function private.normalize_profile_layout_and_text();

-- Keep only canonical media metadata in the database. In particular, never
-- trust or persist client-provided `url`, `sourceUrl`, or `source_url` values.
-- Signed delivery URLs are generated by `profile-content` when content is read.
create or replace function private.normalize_profile_media_json()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $normalize_media$
declare
  item jsonb;
  normalized jsonb := '[]'::jsonb;
  normalized_item jsonb;
  media_type text;
  media_path text;
  path_parts text[];
  file_name text;
  alt_text text;
  caption_text text;
  language_text text;
  order_number numeric;
  order_value integer;
begin
  if new.media_json is null then
    new.media_json := '[]'::jsonb;
  end if;

  if jsonb_typeof(new.media_json) is distinct from 'array' then
    raise exception using
      errcode = '23514',
      message = 'media_json must be a JSON array';
  end if;

  if octet_length(new.media_json::text) > 65536 then
    raise exception using
      errcode = '23514',
      message = 'media_json may contain at most 64 KB';
  end if;

  if jsonb_array_length(new.media_json) > 10 then
    raise exception using
      errcode = '23514',
      message = 'media_json may contain at most 10 items';
  end if;

  for item in
    select media_row.value
    from jsonb_array_elements(new.media_json) as media_row(value)
  loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception using
        errcode = '23514',
        message = 'Every media_json item must be an object';
    end if;

    if jsonb_typeof(item -> 'type') is distinct from 'string' then
      raise exception using
        errcode = '23514',
        message = 'Every media_json item must have a string type';
    end if;
    media_type := item ->> 'type';
    if media_type not in ('image', 'video', 'captions') then
      raise exception using
        errcode = '23514',
        message = 'Unsupported media_json item type';
    end if;

    if jsonb_typeof(item -> 'path') is distinct from 'string' then
      raise exception using
        errcode = '23514',
        message = 'Every media_json item must have a string path';
    end if;
    media_path := regexp_replace(btrim(item ->> 'path'), '^/+', '');
    path_parts := string_to_array(media_path, '/');

    if media_path = ''
      or char_length(media_path) > 700
      or position(E'\\' in media_path) > 0
      or media_path ~ '[[:cntrl:]]'
      or exists (
        select 1
        from unnest(path_parts) as path_part(value)
        where path_part.value in ('', '.', '..')
      )
    then
      raise exception using
        errcode = '23514',
        message = 'Invalid media_json item path';
    end if;

    -- The only production ownerless legacy layout is
    -- `profile-id/photo-N.ext`. It must never be able to reference a modern
    -- UUID owner folder. Every owned record uses owner/profile/file instead.
    if new.owner_id is null then
      if cardinality(path_parts) <> 2
        or path_parts[1] <> new.id
        or path_parts[1] !~ '^[a-z0-9][a-z0-9-]{0,99}$'
        or path_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or media_type <> 'image'
        or path_parts[2] !~ '^photo-[1-8]\.(jpg|jpeg|png|webp)$'
      then
        raise exception using
          errcode = '23514',
          message = 'Invalid ownerless legacy media path';
      end if;
    else
      if cardinality(path_parts) <> 3
        or path_parts[1] <> new.owner_id::text
        or path_parts[2] <> new.id
        or path_parts[2] !~ '^[a-z0-9][a-z0-9-]{0,99}$'
      then
        raise exception using
          errcode = '23514',
          message = 'Owned media path must match owner/profile/file';
      end if;

      file_name := path_parts[3];
      if (
        media_type = 'image'
        and file_name !~ '^photo-[1-8]\.(jpg|jpeg|png|webp)$'
      ) or (
        media_type = 'video'
        and file_name !~ '^video\.(mp4|mov)$'
      ) or (
        media_type = 'captions'
        and file_name <> 'captions.vtt'
      ) then
        raise exception using
          errcode = '23514',
          message = 'Media type and file name do not match';
      end if;
    end if;

    if item ? 'alt'
      and jsonb_typeof(item -> 'alt') not in ('string', 'null')
    then
      raise exception using
        errcode = '23514',
        message = 'Media alt must be a string or null';
    end if;
    if item ? 'caption'
      and jsonb_typeof(item -> 'caption') not in ('string', 'null')
    then
      raise exception using
        errcode = '23514',
        message = 'Media caption must be a string or null';
    end if;
    if item ? 'language'
      and jsonb_typeof(item -> 'language') not in ('string', 'null')
    then
      raise exception using
        errcode = '23514',
        message = 'Media language must be a string or null';
    end if;

    alt_text := nullif(btrim(left(item ->> 'alt', 180)), '');
    caption_text := nullif(btrim(left(item ->> 'caption', 240)), '');
    language_text := nullif(btrim(left(item ->> 'language', 12)), '');

    order_value := 1;
    if jsonb_typeof(item -> 'order') = 'number' then
      order_number := (item ->> 'order')::numeric;
      order_value := least(10, greatest(1, trunc(order_number)))::integer;
    end if;

    normalized_item := jsonb_build_object(
      'type', media_type,
      'path', media_path,
      'alt', alt_text,
      'caption', caption_text,
      'language', language_text,
      'order', order_value
    );
    normalized := normalized || jsonb_build_array(normalized_item);
  end loop;

  new.media_json := normalized;
  return new;
end;
$normalize_media$;

revoke all on function private.normalize_profile_media_json()
  from public, anon, authenticated;

drop trigger if exists normalize_profile_media_json on public.profiliai;
create trigger normalize_profile_media_json
  before insert or update of media_json, owner_id, id
  on public.profiliai
  for each row
  execute function private.normalize_profile_media_json();

-- Apply the allow-lists to existing rows as well, including removal of historic
-- client URL/source fields. The existing profile-update guard recognizes the
-- transaction-local service claim; the previous claim is restored afterwards.
do $normalize_existing_profiles$
declare
  previous_claims text := current_setting('request.jwt.claims', true);
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"service_role"}',
    true
  );

  update public.profiliai
  set
    layout_json = layout_json,
    media_json = media_json;

  perform set_config(
    'request.jwt.claims',
    coalesce(previous_claims, ''),
    true
  );
exception
  when others then
    perform set_config(
      'request.jwt.claims',
      coalesce(previous_claims, ''),
      true
    );
    raise;
end;
$normalize_existing_profiles$;

-- Private profiles and unpublished manual grave photos must never be reachable
-- through permanent public object URLs.
update storage.buckets
set public = false
where id in ('atminimas', 'kapavietes');

revoke all privileges on table storage.objects from public, anon;
grant select, insert, update, delete on table storage.objects
  to authenticated;

drop policy if exists "Viesas atminimas failu skaitymas"
  on storage.objects;
drop policy if exists "Viesas atminimas failu ikelimas"
  on storage.objects;
drop policy if exists "Leisti trinti storage testus"
  on storage.objects;
drop policy if exists "Savininkas skaito atminimo failus"
  on storage.objects;
drop policy if exists "Savininkas ikelia atminimo failus"
  on storage.objects;
drop policy if exists "Savininkas atnaujina atminimo failus"
  on storage.objects;
drop policy if exists "Savininkas salina atminimo failus"
  on storage.objects;

create policy "Savininkas skaito atminimo failus"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'atminimas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner_id = (select auth.uid())::text
  );

-- Uploads happen before the profile row is inserted, so the policy validates a
-- bounded object-name grammar without requiring an existing profile record.
create policy "Savininkas ikelia atminimo failus"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'atminimas'
    and owner_id = (select auth.uid())::text
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] ~ '^[a-z0-9][a-z0-9-]{0,99}$'
    and storage.filename(name) ~
      '^(photo-[1-8]\.(jpg|jpeg|png|webp)|video\.(mp4|mov)|captions\.vtt)$'
  );

create policy "Savininkas atnaujina atminimo failus"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'atminimas'
    and owner_id = (select auth.uid())::text
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] ~ '^[a-z0-9][a-z0-9-]{0,99}$'
    and storage.filename(name) ~
      '^(photo-[1-8]\.(jpg|jpeg|png|webp)|video\.(mp4|mov)|captions\.vtt)$'
  )
  with check (
    bucket_id = 'atminimas'
    and owner_id = (select auth.uid())::text
    and cardinality(storage.foldername(name)) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] ~ '^[a-z0-9][a-z0-9-]{0,99}$'
    and storage.filename(name) ~
      '^(photo-[1-8]\.(jpg|jpeg|png|webp)|video\.(mp4|mov)|captions\.vtt)$'
  );

create policy "Savininkas salina atminimo failus"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'atminimas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and owner_id = (select auth.uid())::text
  );

-- Manual grave images are delivered by `grave-photo`, which first verifies
-- publication status. Administrators keep direct authenticated access for
-- uploads and maintenance, with a bounded object-name grammar.
drop policy if exists "Admin ikelia kapavieciu nuotraukas"
  on storage.objects;
drop policy if exists "Admin mato kapavieciu failus"
  on storage.objects;
drop policy if exists "Admin trina kapavieciu failus"
  on storage.objects;

create policy "Admin ikelia kapavieciu nuotraukas"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'kapavietes'
    and owner_id = (select auth.uid())::text
    and cardinality(storage.foldername(name)) = 1
    and (storage.foldername(name))[1] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and storage.filename(name) ~
      '^pagrindine-[0-9]{10,16}\.(jpg|jpeg|png|webp)$'
    and exists (
      select 1
      from public.kapavietes as grave
      where grave.id::text = (storage.foldername(name))[1]
    )
    and exists (
      select 1
      from public.user_roles as role
      where role.user_id = (select auth.uid())
        and role.role = 'admin'
    )
  );

create policy "Admin mato kapavieciu failus"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'kapavietes'
    and exists (
      select 1
      from public.user_roles as role
      where role.user_id = (select auth.uid())
        and role.role = 'admin'
    )
  );

create policy "Admin trina kapavieciu failus"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'kapavietes'
    and exists (
      select 1
      from public.user_roles as role
      where role.user_id = (select auth.uid())
        and role.role = 'admin'
    )
  );
