-- Atminimo puslapis: tekstas Supabase, nuotraukos ir video per Cloudinary public_id.
-- Paleisk Supabase SQL Editor:
-- https://supabase.com/dashboard/project/tpwrkgdmtucecqxbpwwf/sql

create table if not exists public.atminimai (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  vardas text not null,
  gimimo_data text,
  mirties_data text,
  epitafija text,
  video_cloudinary_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.nuotraukos (
  id uuid primary key default gen_random_uuid(),
  atminimas_id uuid not null references public.atminimai (id) on delete cascade,
  cloudinary_public_id text not null,
  eile_nr smallint not null check (eile_nr between 1 and 3),
  pixel_art boolean not null default false,
  unique (atminimas_id, eile_nr)
);

create table if not exists public."sablonas-viskas" (
  id text primary key,
  vardas text not null,
  pavarde text,
  gimimo_data text,
  mirties_data text,
  epitafija text,
  aktyvus boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists nuotraukos_atminimas_id_idx
  on public.nuotraukos (atminimas_id);

alter table public.atminimai enable row level security;
alter table public.nuotraukos enable row level security;
alter table public."sablonas-viskas" enable row level security;

drop policy if exists "Viešas skaitymas atminimų" on public.atminimai;
create policy "Viešas skaitymas atminimų"
  on public.atminimai for select
  using (true);

drop policy if exists "Viešas skaitymas nuotraukų" on public.nuotraukos;
create policy "Viešas skaitymas nuotraukų"
  on public.nuotraukos for select
  using (true);

-- Pavyzdinis įrašas. Cloudinary public_id pakeisk į savo failų ID.
insert into public.atminimai (
  slug,
  vardas,
  gimimo_data,
  mirties_data,
  epitafija,
  video_cloudinary_id
)
values (
  'demo',
  'VARDAS PAVARDĖ',
  '1950-01-01',
  '2024-01-01',
  'EPITAFIJA',
  'atminimas/video'
)
on conflict (slug) do nothing;

insert into public.nuotraukos (atminimas_id, cloudinary_public_id, eile_nr, pixel_art)
select a.id, v.public_id, v.eile_nr, v.pixel_art
from public.atminimai a
cross join (
  values
    ('atminimas/nuotrauka-1', 1, false),
    ('atminimas/nuotrauka-2', 2, false),
    ('atminimas/nuotrauka-3', 3, false)
) as v(public_id, eile_nr, pixel_art)
where a.slug = 'demo'
  and not exists (
    select 1
    from public.nuotraukos n
    where n.atminimas_id = a.id
      and n.eile_nr = v.eile_nr
  );

drop policy if exists "Viesas skaitymas sablono" on public."sablonas-viskas";
create policy "Viesas skaitymas sablono"
  on public."sablonas-viskas" for select
  to anon
  using (aktyvus = true);

drop policy if exists "Viesas kurimas sablono" on public."sablonas-viskas";
create policy "Viesas kurimas sablono"
  on public."sablonas-viskas" for insert
  to anon
  with check (aktyvus = true);

drop policy if exists "Viesas kurimas atminimu" on public.atminimai;
create policy "Viesas kurimas atminimu"
  on public.atminimai for insert
  to anon
  with check (true);

-- Dabartinis frontend prijungimas naudoja public.profiliai.
create table if not exists public.profiliai (
  id text primary key,
  vardas text,
  pavarde text,
  gimimo_data text,
  mirties_data text,
  epitafija text,
  aktyvus boolean default false,
  created_at timestamptz not null default now()
);

alter table public.profiliai enable row level security;
grant usage on schema public to anon, authenticated;
grant select, insert on table public.profiliai to anon, authenticated;
grant update (statusas) on table public.profiliai to authenticated;

alter table public.profiliai
  add column if not exists tekstas_200 text,
  add column if not exists layout_json jsonb not null default '{}'::jsonb,
  add column if not exists media_json jsonb not null default '[]'::jsonb,
  add column if not exists apmoketa boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists owner_id uuid default auth.uid(),
  add column if not exists statusas text not null default 'laukiama'
    check (statusas in ('laukiama', 'patvirtinta', 'apmoketa', 'atlikta', 'atsaukta'));

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

-- Admin paskyra kuriama Supabase Auth skiltyje, tada jos ID įrašomas čia:
-- insert into public.user_roles (user_id, role)
-- values ('PAKEISK_I_AUTH_USERS_ID', 'admin')
-- on conflict (user_id) do update set role = excluded.role;

alter table public.user_roles enable row level security;
grant select on table public.user_roles to authenticated;

drop policy if exists "User gali matyti savo role" on public.user_roles;
create policy "User gali matyti savo role"
  on public.user_roles for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Viesas skaitymas profiliu" on public.profiliai;
create policy "Viesas skaitymas profiliu"
  on public.profiliai for select
  to anon
  using (aktyvus = true);

drop policy if exists "Savininkas skaito savo profilius" on public.profiliai;
create policy "Savininkas skaito savo profilius"
  on public.profiliai for select
  to authenticated
  using (
    aktyvus = true
    or owner_id = (select auth.uid())
    or exists (
      select 1 from public.user_roles r
      where r.user_id = (select auth.uid())
        and r.role = 'admin'
    )
  );

drop policy if exists "Viesas kurimas profiliu" on public.profiliai;
create policy "Viesas kurimas profiliu"
  on public.profiliai for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Admin valdo profilius" on public.profiliai;
create policy "Admin valdo profilius"
  on public.profiliai for update
  to authenticated
  using (
    exists (
      select 1 from public.user_roles r
      where r.user_id = (select auth.uid())
        and r.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles r
      where r.user_id = (select auth.uid())
        and r.role = 'admin'
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atminimas',
  'atminimas',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'text/vtt']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

revoke insert on table storage.objects from anon;
grant insert on table storage.objects to authenticated;

drop policy if exists "Viesas atminimas failu ikelimas" on storage.objects;
create policy "Viesas atminimas failu ikelimas"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'atminimas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter table public.profiliai alter column aktyvus set default false;

create or replace function public.set_my_profile_visibility(profile_id text, is_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  update public.profiliai
  set aktyvus = is_active
  where id = profile_id and owner_id = (select auth.uid());
  if not found then
    raise exception 'Profile not found or access denied';
  end if;
end;
$$;

revoke all on function public.set_my_profile_visibility(text, boolean) from public, anon;
grant execute on function public.set_my_profile_visibility(text, boolean) to authenticated;

create table if not exists public.atsisakymai (
  id uuid primary key default gen_random_uuid(),
  reference_code text unique not null,
  customer_name text not null check (char_length(customer_name) between 2 and 160),
  customer_email text not null check (char_length(customer_email) between 3 and 254),
  order_reference text not null check (char_length(order_reference) between 1 and 100),
  statement text not null check (char_length(statement) between 10 and 2000),
  status text not null default 'gauta' check (status in ('gauta', 'nagrinejama', 'uzbaigta', 'atmesta')),
  created_at timestamptz not null default now()
);

create table if not exists public.turinio_pranesimai (
  id uuid primary key default gen_random_uuid(),
  reference_code text unique not null,
  reporter_email text not null check (char_length(reporter_email) between 3 and 254),
  content_url text not null check (char_length(content_url) between 8 and 1000),
  reason text not null,
  explanation text not null check (char_length(explanation) between 10 and 5000),
  good_faith text not null check (good_faith = 'yes'),
  status text not null default 'gauta' check (status in ('gauta', 'nagrinejama', 'uzbaigta', 'atmesta')),
  created_at timestamptz not null default now()
);

alter table public.atsisakymai enable row level security;
alter table public.turinio_pranesimai enable row level security;
revoke all on public.atsisakymai, public.turinio_pranesimai from anon, authenticated;
grant insert on public.atsisakymai, public.turinio_pranesimai to anon, authenticated;
grant select, update on public.atsisakymai, public.turinio_pranesimai to authenticated;

create policy "Anon pateikia sutarties atsisakyma" on public.atsisakymai
  for insert to anon, authenticated with check (status = 'gauta');
create policy "Admin valdo sutarties atsisakymus" on public.atsisakymai
  for all to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'))
  with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));
create policy "Anon pateikia turinio pranesima" on public.turinio_pranesimai
  for insert to anon, authenticated with check (status = 'gauta');
create policy "Admin valdo turinio pranesimus" on public.turinio_pranesimai
  for all to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'))
  with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

create table if not exists public.uzsakymai (
  id uuid primary key default gen_random_uuid(),
  profilis_id text not null references public.profiliai (id) on delete cascade,
  puslapio_url text not null,
  qr_kodas_url text not null,
  busena text not null default 'sukurtas',
  apmoketa boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists uzsakymai_profilis_id_idx
  on public.uzsakymai (profilis_id);

alter table public.uzsakymai
  add column if not exists delivery_method text not null default 'pastomatas',
  add column if not exists carrier text,
  add column if not exists city text,
  add column if not exists parcel_terminal text,
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists recipient_email text,
  add column if not exists shipping_status text not null default 'laukiama_duomenu',
  add column if not exists tracking_number text,
  add column if not exists shipment_created_at timestamptz,
  add column if not exists payment_provider text,
  add column if not exists payment_reference text;

create index if not exists uzsakymai_shipping_status_idx on public.uzsakymai (shipping_status);

alter table public.uzsakymai enable row level security;
revoke select, insert on table public.uzsakymai from anon;
grant select, insert on table public.uzsakymai to authenticated;

drop policy if exists "Viesas uzsakymu kurimas" on public.uzsakymai;
create policy "Viesas uzsakymu kurimas"
  on public.uzsakymai for insert
  to authenticated
  with check (
    busena = 'sukurtas'
    and apmoketa = false
    and exists (
      select 1
      from public.profiliai p
      where p.id = profilis_id
        and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Viesas uzsakymu skaitymas pagal aktyvu profili" on public.uzsakymai;
create policy "Viesas uzsakymu skaitymas pagal aktyvu profili"
  on public.uzsakymai for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiliai p
      where p.id = uzsakymai.profilis_id
        and (
          p.owner_id = (select auth.uid())
          or exists (
            select 1 from public.user_roles r
            where r.user_id = (select auth.uid())
              and r.role = 'admin'
          )
        )
    )
  );

create table if not exists public.paslaugu_uzklausos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  paslaugos text[] not null,
  mirusiojo_vardas text not null check (char_length(mirusiojo_vardas) between 2 and 180),
  kapiniu_pavadinimas text not null check (char_length(kapiniu_pavadinimas) between 2 and 200),
  kapo_vieta text not null check (char_length(kapo_vieta) between 3 and 1000),
  geliu_pageidavimai text check (geliu_pageidavimai is null or char_length(geliu_pageidavimai) <= 1200),
  zvakiu_pageidavimai text check (zvakiu_pageidavimai is null or char_length(zvakiu_pageidavimai) <= 1200),
  tvarkymo_pageidavimai text check (tvarkymo_pageidavimai is null or char_length(tvarkymo_pageidavimai) <= 1600),
  papildoma_informacija text check (papildoma_informacija is null or char_length(papildoma_informacija) <= 2000),
  statusas text not null default 'gauta' check (statusas in ('gauta', 'susisiekta', 'vykdoma', 'atlikta', 'atsaukta')),
  admin_pastaba text check (admin_pastaba is null or char_length(admin_pastaba) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paslaugu_uzklausos_allowed_services check (
    cardinality(paslaugos) between 1 and 3
    and paslaugos <@ array['zvakes', 'geles', 'kapu_tvarkymas']::text[]
  ),
  constraint paslaugu_uzklausos_flower_details check (
    'geles' = any (paslaugos) or geliu_pageidavimai is null
  ),
  constraint paslaugu_uzklausos_candle_details check (
    'zvakes' = any (paslaugos) or zvakiu_pageidavimai is null
  ),
  constraint paslaugu_uzklausos_cleaning_details check (
    'kapu_tvarkymas' = any (paslaugos) or tvarkymo_pageidavimai is null
  )
);

create index if not exists paslaugu_uzklausos_owner_created_idx
  on public.paslaugu_uzklausos (owner_id, created_at desc);

create index if not exists paslaugu_uzklausos_status_created_idx
  on public.paslaugu_uzklausos (statusas, created_at desc);

alter table public.paslaugu_uzklausos enable row level security;

revoke all on table public.paslaugu_uzklausos from public, anon, authenticated;
grant select, insert, update on table public.paslaugu_uzklausos to authenticated;

drop policy if exists "Savininkas pateikia paslaugu uzklausa" on public.paslaugu_uzklausos;
create policy "Savininkas pateikia paslaugu uzklausa"
  on public.paslaugu_uzklausos for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and statusas = 'gauta'
    and admin_pastaba is null
  );

drop policy if exists "Savininkas ir admin skaito paslaugu uzklausas" on public.paslaugu_uzklausos;
create policy "Savininkas ir admin skaito paslaugu uzklausas"
  on public.paslaugu_uzklausos for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.user_roles r
      where r.user_id = (select auth.uid()) and r.role = 'admin'
    )
  );

drop policy if exists "Admin atnaujina paslaugu uzklausas" on public.paslaugu_uzklausos;
create policy "Admin atnaujina paslaugu uzklausas"
  on public.paslaugu_uzklausos for update
  to authenticated
  using (
    exists (
      select 1 from public.user_roles r
      where r.user_id = (select auth.uid()) and r.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles r
      where r.user_id = (select auth.uid()) and r.role = 'admin'
    )
  );
