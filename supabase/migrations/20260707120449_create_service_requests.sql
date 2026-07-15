-- Kapavietės priežiūros paslaugų užklausos.
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
