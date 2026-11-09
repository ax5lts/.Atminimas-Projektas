-- Storage performs permission probes in savepoints and can complete uploads as
-- its privileged role. Enforce quotas on the final metadata write as well as
-- those probes. This custom trigger never changes managed Storage metadata;
-- only its private accounting tables are written. Review it after Storage
-- upgrades. Upload/copy/move/delete operations still go through Storage APIs.
-- Apply through the transactional Supabase migration runner.

create table private.storage_owner_usage (
  owner_id uuid primary key,
  object_count bigint not null default 0,
  byte_count bigint not null default 0,
  profile_count bigint not null default 0,
  constraint storage_owner_object_quota check (object_count between 0 and 256),
  constraint storage_owner_byte_quota check (byte_count between 0 and 1073741824),
  constraint storage_owner_profile_quota check (profile_count between 0 and 32)
);

create table private.storage_profile_usage (
  owner_id uuid not null references private.storage_owner_usage(owner_id),
  bucket_id text not null check (bucket_id in ('atminimas', 'grave-photo-submissions')),
  profile_key text not null,
  object_count bigint not null default 0,
  byte_count bigint not null default 0,
  primary key (owner_id, bucket_id, profile_key),
  constraint storage_profile_object_quota check (
    object_count between 0 and case when bucket_id = 'atminimas' then 32 else 64 end
  ),
  constraint storage_profile_byte_quota check (byte_count between 0 and 268435456),
  constraint storage_profile_empty_usage check (object_count > 0 or byte_count = 0)
);
alter table private.storage_owner_usage enable row level security;
alter table private.storage_profile_usage enable row level security;
revoke all on private.storage_owner_usage, private.storage_profile_usage
  from public, anon, authenticated, service_role;

-- A NULL metadata object is used by older Storage permission probes. Charge
-- the bucket maximum in that case, never zero. Final size metadata replaces
-- that reservation in the real write; the probe itself is rolled back.
create function private.storage_quota_entry(p_bucket text, p_name text, p_metadata jsonb)
returns table (owner_id uuid, profile_key text, byte_count bigint)
language plpgsql immutable security invoker set search_path = ''
as $$
declare size_text text; maximum_bytes bigint;
begin
  if p_bucket not in ('atminimas', 'grave-photo-submissions')
    or p_bucket is null or p_name is null then return; end if;
  -- Ownerless legacy memorial paths are read-only to browser roles and remain
  -- supported. Every browser-writable path starts with its owner's UUID.
  if split_part(p_name, '/', 1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then return; end if;
  owner_id := split_part(p_name, '/', 1)::uuid;
  profile_key := case when p_bucket = 'atminimas'
    then split_part(p_name, '/', 2) else 'submissions' end;
  if profile_key = '' then raise exception 'Invalid storage quota path'; end if;
  maximum_bytes := case when p_bucket = 'atminimas' then 52428800 else 8388608 end;
  size_text := coalesce(p_metadata->>'size', p_metadata->>'contentLength');
  if size_text is null then
    byte_count := maximum_bytes;
  elsif size_text !~ '^[0-9]{1,18}$' then
    raise exception using errcode = '23514', message = 'Invalid storage size metadata';
  else
    byte_count := size_text::bigint;
    if byte_count > maximum_bytes then
      raise exception using errcode = '23514', message = 'Storage object exceeds file size limit';
    end if;
  end if;
  return next;
end;
$$;
revoke all on function private.storage_quota_entry(text, text, jsonb)
  from public, anon, authenticated, service_role;

create function private.account_storage_owner_quota()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  changes jsonb := '[]'::jsonb;
  part jsonb;
  scope_changes jsonb := '[]'::jsonb;
  owner_key uuid;
  delta record;
  previous_count bigint;
  next_count bigint;
begin
  -- Statement transition tables cover multi-row INSERT/DELETE and upserts.
  -- An AFTER trigger accounts only successful rows, without double-charging
  -- the INSERT side of INSERT ... ON CONFLICT DO UPDATE.
  if tg_op in ('INSERT', 'UPDATE') then
    select coalesce(jsonb_agg(jsonb_build_object('owner_id', q.owner_id,
      'bucket_id', o.bucket_id, 'profile_key', q.profile_key,
      'objects', 1, 'bytes', q.byte_count)), '[]'::jsonb)
      into part from quota_new_objects o
      cross join lateral private.storage_quota_entry(o.bucket_id, o.name, o.metadata) q;
    changes := changes || part;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    select coalesce(jsonb_agg(jsonb_build_object('owner_id', q.owner_id,
      'bucket_id', o.bucket_id, 'profile_key', q.profile_key,
      'objects', -1, 'bytes', -q.byte_count)), '[]'::jsonb)
      into part from quota_old_objects o
      cross join lateral private.storage_quota_entry(o.bucket_id, o.name, o.metadata) q;
    changes := changes || part;
  end if;
  if changes = '[]'::jsonb then return null; end if;

  -- Lock every affected owner in UUID order before any profile row. Thus even
  -- a batch move between owners/profiles takes locks in a consistent order.
  -- Atomic counter writes and CHECK constraints protect concurrent commits;
  -- no count/sum query or permission-probe advisory lock is the boundary.
  for owner_key in
    select distinct x.owner_id from jsonb_to_recordset(changes)
      as x(owner_id uuid) order by x.owner_id
  loop
    insert into private.storage_owner_usage(owner_id) values (owner_key)
      on conflict (owner_id) do nothing;
    perform 1 from private.storage_owner_usage where owner_id = owner_key for update;
  end loop;

  for delta in
    select x.owner_id, x.bucket_id, x.profile_key,
      sum(x.objects)::bigint as objects, sum(x.bytes)::bigint as bytes
    from jsonb_to_recordset(changes)
      as x(owner_id uuid, bucket_id text, profile_key text, objects bigint, bytes bigint)
    group by x.owner_id, x.bucket_id, x.profile_key
    order by x.owner_id, x.bucket_id, x.profile_key
  loop
    insert into private.storage_profile_usage(owner_id, bucket_id, profile_key)
      values (delta.owner_id, delta.bucket_id, delta.profile_key)
      on conflict (owner_id, bucket_id, profile_key) do nothing;
    select object_count into previous_count from private.storage_profile_usage
      where owner_id = delta.owner_id and bucket_id = delta.bucket_id
        and profile_key = delta.profile_key for update;
    update private.storage_profile_usage set
      object_count = object_count + delta.objects, byte_count = byte_count + delta.bytes
      where owner_id = delta.owner_id and bucket_id = delta.bucket_id
        and profile_key = delta.profile_key returning object_count into next_count;
    scope_changes := scope_changes || jsonb_build_array(jsonb_build_object(
      'owner_id', delta.owner_id, 'profiles',
      case when previous_count = 0 and next_count > 0 then 1
           when previous_count > 0 and next_count = 0 then -1 else 0 end));
    -- Do not let repeatedly creating/deleting arbitrary slugs grow the ledger.
    if next_count = 0 then
      delete from private.storage_profile_usage where owner_id = delta.owner_id
        and bucket_id = delta.bucket_id and profile_key = delta.profile_key;
    end if;
  end loop;

  for delta in
    select x.owner_id, sum(x.objects)::bigint as objects, sum(x.bytes)::bigint as bytes
      from jsonb_to_recordset(changes)
        as x(owner_id uuid, objects bigint, bytes bigint)
      group by x.owner_id order by x.owner_id
  loop
    update private.storage_owner_usage set
      object_count = object_count + delta.objects,
      byte_count = byte_count + delta.bytes,
      profile_count = profile_count + coalesce((select sum(s.profiles)
        from jsonb_to_recordset(scope_changes) as s(owner_id uuid, profiles bigint)
        where s.owner_id = delta.owner_id), 0)
      where owner_id = delta.owner_id;
  end loop;
  return null;
end;
$$;
revoke all on function private.account_storage_owner_quota()
  from public, anon, authenticated, service_role;

-- Bootstrap and trigger installation share a transaction and block metadata
-- writers, so an upload cannot slip between the snapshot and accounting.
-- Existing files are counted, never rewritten or deleted by this migration.
lock table storage.objects in share row exclusive mode;
insert into private.storage_owner_usage(owner_id, object_count, byte_count, profile_count)
select owner_id, sum(objects), sum(bytes), count(*) from (
  select q.owner_id, o.bucket_id, q.profile_key, count(*) as objects, sum(q.byte_count) as bytes
  from storage.objects o
  cross join lateral private.storage_quota_entry(o.bucket_id, o.name, o.metadata) q
  group by q.owner_id, o.bucket_id, q.profile_key
) grouped group by owner_id;
insert into private.storage_profile_usage(owner_id, bucket_id, profile_key, object_count, byte_count)
select q.owner_id, o.bucket_id, q.profile_key, count(*), sum(q.byte_count)
  from storage.objects o
  cross join lateral private.storage_quota_entry(o.bucket_id, o.name, o.metadata) q
  group by q.owner_id, o.bucket_id, q.profile_key;

create trigger storage_owner_quota_insert after insert on storage.objects
  referencing new table as quota_new_objects for each statement
  execute function private.account_storage_owner_quota();
create trigger storage_owner_quota_update after update on storage.objects
  referencing old table as quota_old_objects new table as quota_new_objects for each statement
  execute function private.account_storage_owner_quota();
create trigger storage_owner_quota_delete after delete on storage.objects
  referencing old table as quota_old_objects for each statement
  execute function private.account_storage_owner_quota();
