alter table public.deceased_people
  add column if not exists grave_section text,
  add column if not exists grave_row text,
  add column if not exists grave_place_number text;

grant select (grave_section, grave_row, grave_place_number)
  on public.deceased_people to anon, authenticated;

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
language sql stable security invoker
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
