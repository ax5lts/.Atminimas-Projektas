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

alter table public.uzsakymai enable row level security;

grant select, insert on table public.uzsakymai to anon, authenticated;
drop policy if exists "Viesas uzsakymu kurimas" on public.uzsakymai;
create policy "Viesas uzsakymu kurimas"
  on public.uzsakymai for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Viesas uzsakymu skaitymas pagal aktyvu profili" on public.uzsakymai;
create policy "Viesas uzsakymu skaitymas pagal aktyvu profili"
  on public.uzsakymai for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.profiliai p
      where p.id = uzsakymai.profilis_id
        and p.aktyvus = true
    )
  );
