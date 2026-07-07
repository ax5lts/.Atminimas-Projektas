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

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'text/vtt']
where id = 'atminimas';

drop policy if exists "Viesas atminimas failu ikelimas" on storage.objects;
create policy "Viesas atminimas failu ikelimas"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'atminimas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

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

drop policy if exists "Anon pateikia sutarties atsisakyma" on public.atsisakymai;
create policy "Anon pateikia sutarties atsisakyma" on public.atsisakymai
  for insert to anon, authenticated with check (status = 'gauta');
drop policy if exists "Admin valdo sutarties atsisakymus" on public.atsisakymai;
create policy "Admin valdo sutarties atsisakymus" on public.atsisakymai
  for all to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'))
  with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

drop policy if exists "Anon pateikia turinio pranesima" on public.turinio_pranesimai;
create policy "Anon pateikia turinio pranesima" on public.turinio_pranesimai
  for insert to anon, authenticated with check (status = 'gauta');
drop policy if exists "Admin valdo turinio pranesimus" on public.turinio_pranesimai;
create policy "Admin valdo turinio pranesimus" on public.turinio_pranesimai
  for all to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'))
  with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));
