-- User-chosen access codes for published memorial pages.
-- Plaintext codes only cross the authenticated/public Edge Function request;
-- the database persists an adaptive, salted bcrypt hash.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.profiliai
  add column if not exists access_code_hash text,
  add column if not exists access_code_protected boolean
    generated always as (access_code_hash is not null) stored;

comment on column public.profiliai.access_code_hash is
  'Salted adaptive hash of the 5-6 digit memorial access code; never expose through the Data API.';
comment on column public.profiliai.access_code_protected is
  'Safe, generated indicator that may be exposed to the profile owner.';

-- Keep direct owner updates restricted to visibility while allowing the
-- service-role Edge Functions to manage content and the hash.
create or replace function private.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  is_admin boolean;
begin
  if coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role' then
    return new;
  end if;

  select exists (
    select 1
    from public.user_roles as role
    where role.user_id = (select auth.uid())
      and role.role = 'admin'
  ) into is_admin;
  if is_admin then return new; end if;

  if (to_jsonb(new) - 'aktyvus') is distinct from
    (to_jsonb(old) - 'aktyvus') then
    raise exception 'Profile owner may only change visibility';
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_profile_update()
  from public, anon, authenticated, service_role;

-- Do not let authenticated browser clients select the hash even for profiles
-- they own. RLS remains the row boundary; these grants are the column boundary.
revoke select on table public.profiliai from authenticated;
grant select (
  id,
  vardas,
  pavarde,
  gimimo_data,
  mirties_data,
  epitafija,
  tekstas_200,
  story_blocks_json,
  layout_json,
  media_json,
  apmoketa,
  aktyvus,
  owner_id,
  deleted_at,
  statusas,
  created_at,
  access_code_protected
) on table public.profiliai to authenticated;

create table if not exists private.memorial_access_attempts (
  profile_id text not null references public.profiliai (id) on delete cascade,
  attempt_key text not null check (attempt_key ~ '^[0-9a-f]{64}$'),
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 5),
  window_started_at timestamptz not null default clock_timestamp(),
  locked_until timestamptz,
  primary key (profile_id, attempt_key)
);

alter table private.memorial_access_attempts enable row level security;
alter table private.memorial_access_attempts force row level security;
revoke all on table private.memorial_access_attempts
  from public, anon, authenticated, service_role;

create or replace function private.is_weak_memorial_access_code(p_code text)
returns boolean
language sql
immutable
strict
security invoker
set search_path = pg_catalog
as $function$
  select
    length(replace(p_code, left(p_code, 1), '')) = 0
    or position(p_code in '0123456789') > 0
    or position(p_code in '9876543210') > 0;
$function$;

revoke all on function private.is_weak_memorial_access_code(text)
  from public, anon, authenticated, service_role;

-- Called only by the authenticated profile-manage Edge Function. The owner id
-- comes from the verified JWT, not from browser authorization decisions.
create or replace function public.set_memorial_access_code(
  p_profile_id text,
  p_owner_id uuid,
  p_protected boolean,
  p_access_code text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if p_owner_id is null then
    raise exception 'Authentication required';
  end if;

  if not coalesce(p_protected, false) then
    update public.profiliai
    set access_code_hash = null
    where id = p_profile_id
      and owner_id = p_owner_id
      and deleted_at is null;
  else
    if p_access_code is null or p_access_code !~ '^[0-9]{5,6}$' then
      raise exception 'Access code must contain 5-6 digits';
    end if;
    if private.is_weak_memorial_access_code(p_access_code) then
      raise exception 'Access code is too weak';
    end if;

    update public.profiliai
    set access_code_hash = extensions.crypt(
      p_access_code,
      extensions.gen_salt('bf', 12)
    )
    where id = p_profile_id
      and owner_id = p_owner_id
      and deleted_at is null;
  end if;

  if not found then
    raise exception 'Profile not found or access denied';
  end if;
  delete from private.memorial_access_attempts
  where profile_id = p_profile_id;
  return case when coalesce(p_protected, false) then 'protected' else 'public' end;
end;
$function$;

revoke all on function public.set_memorial_access_code(text, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.set_memorial_access_code(text, uuid, boolean, text)
  to service_role;

-- The public profile-content Edge Function is the only verifier. Five failed
-- attempts from one derived client key cause a 15-minute lock.
create or replace function public.verify_memorial_access_code(
  p_profile_id text,
  p_access_code text,
  p_attempt_key text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  stored_hash text;
  attempt private.memorial_access_attempts%rowtype;
  now_at timestamptz := clock_timestamp();
  next_failures smallint;
begin
  if p_attempt_key is null or p_attempt_key !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;

  select profile.access_code_hash
  into stored_hash
  from public.profiliai as profile
  where profile.id = p_profile_id
    and profile.aktyvus = true
    and profile.deleted_at is null;

  if not found then
    return 'not_found';
  end if;
  if stored_hash is null then
    return 'not_protected';
  end if;

  delete from private.memorial_access_attempts
  where profile_id = p_profile_id
    and window_started_at < now_at - interval '1 day';

  insert into private.memorial_access_attempts (
    profile_id,
    attempt_key,
    failed_attempts,
    window_started_at
  ) values (
    p_profile_id,
    p_attempt_key,
    0,
    now_at
  )
  on conflict (profile_id, attempt_key) do nothing;

  select *
  into attempt
  from private.memorial_access_attempts
  where profile_id = p_profile_id
    and attempt_key = p_attempt_key
  for update;

  if attempt.locked_until is not null and attempt.locked_until > now_at then
    return 'rate_limited';
  end if;

  if attempt.window_started_at < now_at - interval '15 minutes' then
    attempt.failed_attempts := 0;
    attempt.window_started_at := now_at;
    attempt.locked_until := null;
  end if;

  if p_access_code ~ '^[0-9]{5,6}$'
    and stored_hash = extensions.crypt(p_access_code, stored_hash) then
    delete from private.memorial_access_attempts
    where profile_id = p_profile_id
      and attempt_key = p_attempt_key;
    return 'granted';
  end if;

  next_failures := least(5, attempt.failed_attempts + 1);
  update private.memorial_access_attempts
  set failed_attempts = next_failures,
      window_started_at = attempt.window_started_at,
      locked_until = case
        when next_failures >= 5 then now_at + interval '15 minutes'
        else null
      end
  where profile_id = p_profile_id
    and attempt_key = p_attempt_key;

  return case when next_failures >= 5 then 'rate_limited' else 'invalid' end;
end;
$function$;

revoke all on function public.verify_memorial_access_code(text, text, text)
  from public, anon, authenticated;
grant execute on function public.verify_memorial_access_code(text, text, text)
  to service_role;
