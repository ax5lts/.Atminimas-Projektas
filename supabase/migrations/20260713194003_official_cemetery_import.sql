-- Oficialaus Lietuvos atviru duomenu kapiniu registro integracija.
-- Lentelės paliktos kaip išjungto ankstesnio importo techninė istorija.
-- Pries vykdant: atlikite BACKUP.md aprasyta atsargine kopija.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.municipalities (
  id uuid primary key default gen_random_uuid(),
  source_code text not null unique check (source_code ~ '^[A-Za-z0-9]+$'),
  name text not null,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cemeteries (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  source_name text not null,
  name text not null,
  normalized_name text not null,
  address text,
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id, normalized_name)
);

create table if not exists public.graves (
  id uuid primary key default gen_random_uuid(),
  source_record_id text not null,
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  cemetery_id uuid references public.cemeteries(id) on delete set null,
  grave_source_id text,
  grave_type text,
  section text,
  row text,
  place_number text,
  length_m numeric,
  width_m numeric,
  area_m2 numeric,
  buried_count integer,
  maximum_burials integer,
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  geometry text,
  cultural_heritage boolean,
  heritage_code text,
  heritage_description text,
  nonstandard_size boolean,
  raw_data jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  missing_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id, source_record_id),
  unique (municipality_id, grave_source_id),
  check (length_m is null or length_m >= 0),
  check (width_m is null or width_m >= 0),
  check (area_m2 is null or area_m2 >= 0),
  check (buried_count is null or buried_count >= 0),
  check (maximum_burials is null or maximum_burials >= 0)
);

create table if not exists public.deceased_people (
  id uuid primary key default gen_random_uuid(),
  source_record_id text not null,
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  cemetery_id uuid references public.cemeteries(id) on delete set null,
  grave_id uuid references public.graves(id) on delete set null,
  grave_source_id text,
  grave_section text,
  grave_row text,
  grave_place_number text,
  first_name text,
  last_name text,
  full_name text not null,
  normalized_first_name text,
  normalized_last_name text,
  normalized_full_name text not null,
  gender text,
  birth_date date,
  death_date date,
  burial_date date,
  birth_year smallint check (birth_year between 1000 and 2200),
  death_year smallint check (death_year between 1000 and 2200),
  burial_year smallint check (burial_year between 1000 and 2200),
  birth_date_text text,
  death_date_text text,
  burial_date_text text,
  grave_depth numeric check (grave_depth is null or grave_depth >= 0),
  relationship_information text,
  additional_information text,
  raw_data jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  missing_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id, source_record_id),
  check (death_date is null or birth_date is null or death_date >= birth_date),
  check (burial_date is null or death_date is null or burial_date >= death_date)
);

create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  import_type text not null check (import_type in ('graves', 'deceased', 'relink')),
  municipality_code text,
  source_url text,
  checksum_sha256 text,
  status text not null check (status in ('running', 'completed', 'failed', 'cancelled', 'skipped', 'dry_run')),
  downloaded_rows bigint not null default 0 check (downloaded_rows >= 0),
  inserted_rows bigint not null default 0 check (inserted_rows >= 0),
  updated_rows bigint not null default 0 check (updated_rows >= 0),
  skipped_rows bigint not null default 0 check (skipped_rows >= 0),
  invalid_rows bigint not null default 0 check (invalid_rows >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.import_errors (
  id bigint generated always as identity primary key,
  import_run_id uuid not null references public.import_runs(id) on delete cascade,
  municipality_code text,
  source_url text,
  row_number bigint,
  source_record_id text,
  error_type text not null,
  error_message text not null,
  raw_row jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cemetery_import_lock (
  lock_name text primary key,
  owner_token uuid not null,
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists cemeteries_municipality_idx on public.cemeteries(municipality_id);
create index if not exists graves_municipality_idx on public.graves(municipality_id);
create index if not exists graves_cemetery_idx on public.graves(cemetery_id);
create index if not exists graves_grave_source_idx on public.graves(municipality_id, grave_source_id);
create index if not exists deceased_municipality_idx on public.deceased_people(municipality_id);
create index if not exists deceased_cemetery_idx on public.deceased_people(cemetery_id);
create index if not exists deceased_grave_idx on public.deceased_people(grave_id);
create index if not exists deceased_birth_year_idx on public.deceased_people(birth_year);
create index if not exists deceased_death_year_idx on public.deceased_people(death_year);
create index if not exists deceased_death_date_idx on public.deceased_people(death_date);
create index if not exists deceased_first_name_trgm_idx on public.deceased_people using gin(normalized_first_name extensions.gin_trgm_ops);
create index if not exists deceased_last_name_trgm_idx on public.deceased_people using gin(normalized_last_name extensions.gin_trgm_ops);
create index if not exists deceased_full_name_trgm_idx on public.deceased_people using gin(normalized_full_name extensions.gin_trgm_ops);
create index if not exists municipalities_name_trgm_idx on public.municipalities using gin(normalized_name extensions.gin_trgm_ops);
create index if not exists cemeteries_name_trgm_idx on public.cemeteries using gin(normalized_name extensions.gin_trgm_ops);
create index if not exists import_runs_started_idx on public.import_runs(started_at desc);
create index if not exists import_runs_municipality_type_idx on public.import_runs(municipality_code, import_type, started_at desc);
create index if not exists import_errors_run_idx on public.import_errors(import_run_id, id);

alter table public.municipalities enable row level security;
alter table public.cemeteries enable row level security;
alter table public.graves enable row level security;
alter table public.deceased_people enable row level security;
alter table public.import_runs enable row level security;
alter table public.import_errors enable row level security;
alter table public.cemetery_import_lock enable row level security;

revoke all on table public.municipalities, public.cemeteries, public.graves,
  public.deceased_people, public.import_runs, public.import_errors,
  public.cemetery_import_lock from public, anon, authenticated;
grant select, insert, update on table public.municipalities, public.cemeteries,
  public.graves, public.deceased_people, public.import_runs,
  public.import_errors, public.cemetery_import_lock to service_role;
grant usage, select on sequence public.import_errors_id_seq to service_role;
grant select on table public.import_runs, public.import_errors to authenticated;

create policy "Admin skaito oficialiu importu busena"
  on public.import_runs for select to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));
create policy "Admin skaito oficialiu importu klaidas"
  on public.import_errors for select to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

create or replace function public.claim_cemetery_import(p_owner_token uuid, p_ttl_seconds integer default 900)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ttl_seconds < 60 or p_ttl_seconds > 3600 then
    raise exception 'Invalid lock TTL';
  end if;
  delete from public.cemetery_import_lock where lock_name = 'official-cemetery-import' and expires_at < now();
  insert into public.cemetery_import_lock(lock_name, owner_token, expires_at)
  values ('official-cemetery-import', p_owner_token, now() + make_interval(secs => p_ttl_seconds))
  on conflict (lock_name) do nothing;
  return exists (select 1 from public.cemetery_import_lock where lock_name = 'official-cemetery-import' and owner_token = p_owner_token);
end;
$$;

create or replace function public.heartbeat_cemetery_import(p_owner_token uuid, p_ttl_seconds integer default 900)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cemetery_import_lock set heartbeat_at = now(), expires_at = now() + make_interval(secs => p_ttl_seconds)
  where lock_name = 'official-cemetery-import' and owner_token = p_owner_token and expires_at >= now();
  return found;
end;
$$;

create or replace function public.release_cemetery_import(p_owner_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.cemetery_import_lock where lock_name = 'official-cemetery-import' and owner_token = p_owner_token;
  return found;
end;
$$;

create or replace function public.relink_deceased_people(p_municipality_id uuid default null)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare affected bigint;
begin
  update public.deceased_people d
  set grave_id = g.id, cemetery_id = g.cemetery_id, updated_at = now()
  from public.graves g
  where d.municipality_id = g.municipality_id
    and d.grave_source_id = g.grave_source_id
    and d.grave_id is distinct from g.id
    and (p_municipality_id is null or d.municipality_id = p_municipality_id);
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.search_deceased(
  p_query text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_birth_year integer default null,
  p_death_year integer default null,
  p_municipality text default null,
  p_cemetery text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  id uuid, first_name text, last_name text, full_name text,
  birth_date date, death_date date, burial_date date,
  birth_year smallint, death_year smallint, burial_year smallint,
  birth_date_text text, death_date_text text, burial_date_text text,
  municipality text, cemetery text, section text, row_name text,
  place_number text, latitude numeric, longitude numeric, total_count bigint
)
language sql stable security definer
set search_path = ''
as $$
  with filtered as (
    select d.id, d.first_name, d.last_name, d.full_name,
      d.birth_date, d.death_date, d.burial_date,
      d.birth_year, d.death_year, d.burial_year,
      d.birth_date_text, d.death_date_text, d.burial_date_text,
      m.name as municipality, c.name as cemetery,
      coalesce(d.grave_section, g.section) as section,
      coalesce(d.grave_row, g.row) as row_name,
      coalesce(d.grave_place_number, g.place_number) as place_number,
      g.latitude, g.longitude
    from public.deceased_people d
    join public.municipalities m on m.id = d.municipality_id
    left join public.cemeteries c on c.id = d.cemetery_id
    left join public.graves g on g.id = d.grave_id
    where d.is_active
      and (nullif(trim(p_query), '') is null or d.normalized_full_name like '%' || extensions.unaccent(lower(trim(p_query))) || '%')
      and (nullif(trim(p_first_name), '') is null or d.normalized_first_name like '%' || extensions.unaccent(lower(trim(p_first_name))) || '%')
      and (nullif(trim(p_last_name), '') is null or d.normalized_last_name like '%' || extensions.unaccent(lower(trim(p_last_name))) || '%')
      and (p_birth_year is null or d.birth_year = p_birth_year)
      and (p_death_year is null or d.death_year = p_death_year)
      and (nullif(trim(p_municipality), '') is null or m.normalized_name like '%' || extensions.unaccent(lower(trim(p_municipality))) || '%')
      and (nullif(trim(p_cemetery), '') is null or c.normalized_name like '%' || extensions.unaccent(lower(trim(p_cemetery))) || '%')
  )
  select f.*, count(*) over() as total_count
  from filtered f
  order by f.last_name nulls last, f.first_name nulls last, f.id
  limit least(greatest(coalesce(p_page_size, 20), 1), 100)
  offset (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 20), 1), 100);
$$;

revoke all on function public.claim_cemetery_import(uuid, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_cemetery_import(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_cemetery_import(uuid) from public, anon, authenticated;
revoke all on function public.relink_deceased_people(uuid) from public, anon, authenticated;
revoke all on function public.search_deceased(text,text,text,integer,integer,text,text,integer,integer) from public;
grant execute on function public.claim_cemetery_import(uuid, integer) to service_role;
grant execute on function public.heartbeat_cemetery_import(uuid, integer) to service_role;
grant execute on function public.release_cemetery_import(uuid) to service_role;
grant execute on function public.relink_deceased_people(uuid) to service_role;
grant execute on function public.search_deceased(text,text,text,integer,integer,text,text,integer,integer) to anon, authenticated;
