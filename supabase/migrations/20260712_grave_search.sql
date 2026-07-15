create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.kapavietes (
  id uuid primary key default gen_random_uuid(),
  vardas text not null check (char_length(trim(vardas)) between 1 and 100),
  pavarde text not null check (char_length(trim(pavarde)) between 1 and 120),
  gimimo_data date,
  mirties_data date,
  gimimo_metai smallint check (gimimo_metai between 1000 and 2200),
  mirties_metai smallint check (mirties_metai between 1000 and 2200),
  kapiniu_pavadinimas text not null check (char_length(trim(kapiniu_pavadinimas)) between 2 and 200),
  miestas text check (miestas is null or char_length(trim(miestas)) between 1 and 120),
  adresas text check (adresas is null or char_length(trim(adresas)) <= 500),
  sektorius text check (sektorius is null or char_length(trim(sektorius)) <= 80),
  eile text check (eile is null or char_length(trim(eile)) <= 80),
  kapo_numeris text check (kapo_numeris is null or char_length(trim(kapo_numeris)) <= 80),
  vietos_aprasymas text check (vietos_aprasymas is null or char_length(trim(vietos_aprasymas)) <= 1500),
  platuma numeric(9,6) check (platuma between -90 and 90),
  ilguma numeric(9,6) check (ilguma between -180 and 180),
  nuotraukos_kelias text check (nuotraukos_kelias is null or nuotraukos_kelias ~ '^[0-9a-f-]+/[A-Za-z0-9._-]+$'),
  duomenu_saltinis text check (duomenu_saltinis is null or char_length(trim(duomenu_saltinis)) <= 500),
  admin_pastabos text check (admin_pastabos is null or char_length(admin_pastabos) <= 2000),
  statusas text not null default 'juodrastis' check (statusas in ('juodrastis', 'paskelbtas', 'pasleptas')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kapavietes_datos_tvarka check (
    mirties_data is null or gimimo_data is null or mirties_data >= gimimo_data
  ),
  constraint kapavietes_koordinates_kartu check (
    (platuma is null and ilguma is null) or (platuma is not null and ilguma is not null)
  )
);

create index if not exists kapavietes_statusas_idx on public.kapavietes(statusas);
create index if not exists kapavietes_pavarde_idx on public.kapavietes(lower(pavarde));
create index if not exists kapavietes_vardas_idx on public.kapavietes(lower(vardas));

alter table public.kapavietes enable row level security;
revoke all on table public.kapavietes from public, anon, authenticated;
grant select on table public.kapavietes to anon;
grant select, insert, update, delete on table public.kapavietes to authenticated;

create policy "Viesai rodomos tik paskelbtos kapavietes"
  on public.kapavietes for select to anon, authenticated
  using (statusas = 'paskelbtas');

create policy "Admin skaito visas kapavietes"
  on public.kapavietes for select to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

create policy "Admin kuria kapavietes"
  on public.kapavietes for insert to authenticated
  with check (
    created_by = (select auth.uid()) and
    exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin')
  );

create policy "Admin atnaujina kapavietes"
  on public.kapavietes for update to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'))
  with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

create policy "Admin trina kapavietes"
  on public.kapavietes for delete to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

create or replace function public.ieskoti_kapavieciu(paieska text, rezultatu_limitas integer default 20)
returns table (
  id uuid, vardas text, pavarde text, gimimo_data date, mirties_data date,
  gimimo_metai smallint, mirties_metai smallint, kapiniu_pavadinimas text,
  miestas text, adresas text, sektorius text, eile text, kapo_numeris text,
  vietos_aprasymas text, platuma numeric, ilguma numeric, nuotraukos_kelias text
)
language sql stable security invoker
set search_path = public, extensions
as $$
  select k.id, k.vardas, k.pavarde, k.gimimo_data, k.mirties_data,
    k.gimimo_metai, k.mirties_metai, k.kapiniu_pavadinimas, k.miestas,
    k.adresas, k.sektorius, k.eile, k.kapo_numeris, k.vietos_aprasymas,
    k.platuma, k.ilguma, k.nuotraukos_kelias
  from public.kapavietes k
  where k.statusas = 'paskelbtas'
    and char_length(trim(coalesce(paieska, ''))) >= 2
    and (
      unaccent(lower(k.vardas || ' ' || k.pavarde)) like '%' || unaccent(lower(trim(paieska))) || '%'
      or similarity(unaccent(lower(k.vardas || ' ' || k.pavarde)), unaccent(lower(trim(paieska)))) >= 0.25
    )
  order by
    (unaccent(lower(k.vardas || ' ' || k.pavarde)) = unaccent(lower(trim(paieska)))) desc,
    similarity(unaccent(lower(k.vardas || ' ' || k.pavarde)), unaccent(lower(trim(paieska)))) desc,
    k.pavarde, k.vardas
  limit least(greatest(coalesce(rezultatu_limitas, 20), 1), 50);
$$;

revoke all on function public.ieskoti_kapavieciu(text, integer) from public;
grant execute on function public.ieskoti_kapavieciu(text, integer) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kapavietes', 'kapavietes', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Admin ikelia kapavieciu nuotraukas" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'kapavietes'
    and exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin')
  );
create policy "Admin mato kapavieciu failus" on storage.objects
  for select to authenticated using (
    bucket_id = 'kapavietes'
    and exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin')
  );
create policy "Admin trina kapavieciu failus" on storage.objects
  for delete to authenticated using (
    bucket_id = 'kapavietes'
    and exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin')
  );
