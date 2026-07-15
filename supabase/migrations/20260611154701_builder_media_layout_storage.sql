alter table public.profiliai
  add column if not exists tekstas_200 text,
  add column if not exists layout_json jsonb not null default '{}'::jsonb,
  add column if not exists media_json jsonb not null default '[]'::jsonb,
  add column if not exists apmoketa boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atminimas',
  'atminimas',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

grant select, insert on table storage.objects to anon, authenticated;

drop policy if exists "Viesas atminimas failu skaitymas" on storage.objects;
create policy "Viesas atminimas failu skaitymas"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'atminimas');

drop policy if exists "Viesas atminimas failu ikelimas" on storage.objects;
create policy "Viesas atminimas failu ikelimas"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'atminimas');
