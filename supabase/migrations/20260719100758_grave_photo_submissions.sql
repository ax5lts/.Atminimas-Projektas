-- Migracija suderinta su nuotolinės duomenų bazės istorijos versija.
-- Naudotojų pateikiamos kapaviečių nuotraukos laikomos neviešai ir
-- viešai atiduodamos tik po administratoriaus patvirtinimo.
create table public.grave_photo_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_model text not null check (source_model ~ '^[A-Za-z0-9_-]{1,100}$'),
  grave_source_id text not null check (char_length(trim(grave_source_id)) between 1 and 300),
  deceased_record_id text not null check (char_length(trim(deceased_record_id)) between 1 and 300),
  deceased_name text not null check (char_length(trim(deceased_name)) between 1 and 240),
  cemetery_name text check (cemetery_name is null or char_length(trim(cemetery_name)) between 1 and 200),
  municipality text check (municipality is null or char_length(trim(municipality)) between 1 and 180),
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  storage_path text not null unique check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
  ),
  description text check (description is null or char_length(trim(description)) between 1 and 500),
  mime_type text not null default 'image/jpeg' check (mime_type = 'image/jpeg'),
  size_bytes bigint not null check (size_bytes between 1 and 8388608),
  rights_confirmed boolean not null check (rights_confirmed),
  rights_confirmed_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grave_photo_coordinates_together check (
    (latitude is null and longitude is null) or (latitude is not null and longitude is not null)
  ),
  constraint grave_photo_review_state check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  )
);

create index grave_photo_submissions_lookup_idx
  on public.grave_photo_submissions(source_model, grave_source_id, status, reviewed_at desc);
create index grave_photo_submissions_owner_idx
  on public.grave_photo_submissions(owner_id, created_at desc);
create index grave_photo_submissions_review_queue_idx
  on public.grave_photo_submissions(status, created_at asc);

alter table public.grave_photo_submissions enable row level security;
revoke all on table public.grave_photo_submissions from public, anon, authenticated;
grant select, insert, update, delete on table public.grave_photo_submissions to authenticated;

create policy "Naudotojas mato savo kapavietes nuotraukas"
  on public.grave_photo_submissions for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.user_roles r
      where r.user_id = (select auth.uid()) and r.role = 'admin'
    )
  );

create policy "Naudotojas pateikia kapavietes nuotrauka"
  on public.grave_photo_submissions for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and rights_confirmed
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
  );

create policy "Admin perziuri kapavietes nuotraukas"
  on public.grave_photo_submissions for update to authenticated
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

create policy "Naudotojas atsaukia nepatvirtinta kapavietes nuotrauka"
  on public.grave_photo_submissions for delete to authenticated
  using (
    (owner_id = (select auth.uid()) and status = 'pending')
    or exists (
      select 1 from public.user_roles r
      where r.user_id = (select auth.uid()) and r.role = 'admin'
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'grave-photo-submissions',
  'grave-photo-submissions',
  false,
  8388608,
  array['image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Naudotojas ikelia kapavietes nuotrauka"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'grave-photo-submissions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.grave_photo_submissions s
      where s.storage_path = name
        and s.owner_id = (select auth.uid())
        and s.status = 'pending'
    )
  );

create policy "Naudotojas ir admin mato pateikta kapavietes nuotrauka"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'grave-photo-submissions'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.user_roles r
        where r.user_id = (select auth.uid()) and r.role = 'admin'
      )
    )
  );

create policy "Naudotojas arba admin trina pateikta kapavietes nuotrauka"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'grave-photo-submissions'
    and (
      exists (
        select 1 from public.grave_photo_submissions s
        where s.storage_path = name
          and s.owner_id = (select auth.uid())
          and s.status = 'pending'
      )
      or exists (
        select 1 from public.user_roles r
        where r.user_id = (select auth.uid()) and r.role = 'admin'
      )
    )
  );
