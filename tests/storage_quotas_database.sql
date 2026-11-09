-- Run after the storage_owner_quotas migration, as postgres. Only temporary
-- metadata rows are used: no real Storage objects or provider files are made.
begin;
create temporary table quota_test_objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null,
  metadata jsonb,
  unique (bucket_id, name)
);
create trigger quota_test_insert after insert on quota_test_objects
  referencing new table as quota_new_objects for each statement
  execute function private.account_storage_owner_quota();
create trigger quota_test_update after update on quota_test_objects
  referencing old table as quota_old_objects new table as quota_new_objects for each statement
  execute function private.account_storage_owner_quota();
create trigger quota_test_delete after delete on quota_test_objects
  referencing old table as quota_old_objects for each statement
  execute function private.account_storage_owner_quota();

do $$
declare
  actor uuid := gen_random_uuid();
  other_actor uuid := gen_random_uuid();
  initial_usage jsonb;
  rejected boolean;
  tracked bigint;
begin
  if has_table_privilege('authenticated','private.storage_owner_usage','SELECT')
    or has_table_privilege('authenticated','private.storage_owner_usage','INSERT')
    or has_table_privilege('anon','private.storage_profile_usage','SELECT')
    or has_function_privilege('authenticated','private.account_storage_owner_quota()','EXECUTE')
    or has_function_privilege('authenticated','private.storage_quota_entry(text,text,jsonb)','EXECUTE')
    then raise exception 'Quota internals exposed to browser roles'; end if;

  -- A normal upload before any profile row exists, followed by immutable photo
  -- versions and both upsert branches, must account each stored object once.
  insert into quota_test_objects(bucket_id,name,metadata)
    values ('atminimas',actor||'/draft/photo-1.jpg','{"size":1024}');
  insert into quota_test_objects(bucket_id,name,metadata)
    values ('atminimas',actor||'/draft/photo-1-11111111111111111111111111111111.jpg','{"size":2048}');
  insert into quota_test_objects(bucket_id,name,metadata)
    values ('atminimas',actor||'/draft/photo-1.jpg','{"size":4096}')
    on conflict(bucket_id,name) do update set metadata=excluded.metadata;
  insert into quota_test_objects(bucket_id,name,metadata)
    values ('atminimas',actor||'/draft/video.mp4','{"size":8192}')
    on conflict(bucket_id,name) do update set metadata=excluded.metadata;
  if not exists(select 1 from private.storage_owner_usage where owner_id=actor
    and object_count=3 and byte_count=14336 and profile_count=1)
    then raise exception 'Upload/upsert/version accounting incorrect'; end if;
  update quota_test_objects set name=replace(name,'/draft/','/moved/') where name like actor||'/%';
  if not exists(select 1 from private.storage_owner_usage where owner_id=actor
    and object_count=3 and byte_count=14336 and profile_count=1)
    then raise exception 'Profile move changed owner totals'; end if;
  update quota_test_objects set name=replace(name,actor::text,other_actor::text)
    where name like actor||'/%';
  if not exists(select 1 from private.storage_owner_usage where owner_id=actor and object_count=0 and profile_count=0)
    or not exists(select 1 from private.storage_owner_usage where owner_id=other_actor and object_count=3 and profile_count=1)
    then raise exception 'Owner move accounting incorrect'; end if;
  delete from quota_test_objects;
  if exists(select 1 from private.storage_profile_usage where owner_id in(actor,other_actor))
    then raise exception 'Empty profile usage rows retained'; end if;

  -- Each scope allows two full eight-photo generations plus working room.
  insert into quota_test_objects(bucket_id,name,metadata)
    select 'atminimas',actor||'/versions/photo-1-'||lpad(i::text,32,'0')||'.jpg','{"size":1}'
    from generate_series(1,32) i;
  rejected:=false;
  begin
    insert into quota_test_objects(bucket_id,name,metadata)
      values('atminimas',actor||'/versions/photo-1-ffffffffffffffffffffffffffffffff.jpg','{"size":1}');
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Profile file quota bypassed'; end if;
  delete from quota_test_objects;
  rejected:=false;
  begin
    insert into quota_test_objects(bucket_id,name,metadata)
      select 'atminimas',actor||'/batch/photo-1-'||lpad(i::text,32,'0')||'.jpg','{"size":1}'
      from generate_series(1,33) i;
  exception when check_violation then rejected:=true; end;
  if not rejected or exists(select 1 from quota_test_objects)
    then raise exception 'Multi-row quota failure did not roll back the whole batch'; end if;

  insert into quota_test_objects(bucket_id,name,metadata)
    select 'atminimas',actor||'/bytes/photo-'||i||'.jpg','{"size":52428800}'
    from generate_series(1,5) i;
  rejected:=false;
  begin
    insert into quota_test_objects(bucket_id,name,metadata)
      values('atminimas',actor||'/bytes/photo-6.jpg','{"size":52428800}');
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Profile byte quota bypassed'; end if;
  delete from quota_test_objects where name=actor||'/bytes/photo-1.jpg';
  insert into quota_test_objects(bucket_id,name,metadata)
    values('atminimas',actor||'/bytes/photo-6.jpg','{"size":52428800}');
  delete from quota_test_objects;

  insert into quota_test_objects(bucket_id,name,metadata)
    select 'atminimas',actor||'/profile-'||i||'/photo-1.jpg','{"size":1}'
    from generate_series(1,32) i;
  rejected:=false;
  begin
    insert into quota_test_objects(bucket_id,name,metadata)
      values('atminimas',actor||'/profile-33/photo-1.jpg','{"size":1}');
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Arbitrary-slug quota bypassed'; end if;
  delete from quota_test_objects where name=actor||'/profile-1/photo-1.jpg';
  insert into quota_test_objects(bucket_id,name,metadata)
    values('atminimas',actor||'/profile-33/photo-1.jpg','{"size":1}');
  delete from quota_test_objects;

  insert into quota_test_objects(bucket_id,name,metadata)
    select 'atminimas',actor||'/owner-count-'||((i-1)/32)||'/photo-1-'||lpad(i::text,32,'0')||'.jpg','{"size":1}'
    from generate_series(1,256) i;
  rejected:=false;
  begin
    insert into quota_test_objects(bucket_id,name,metadata)
      values('atminimas',actor||'/owner-count-extra/photo-1.jpg','{"size":1}');
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Owner object quota bypassed'; end if;
  delete from quota_test_objects;
  insert into quota_test_objects(bucket_id,name,metadata)
    select 'atminimas',actor||'/owner-bytes-'||((i-1)/5)||'/photo-'||i||'.jpg','{"size":52428800}'
    from generate_series(1,20) i;
  rejected:=false;
  begin
    insert into quota_test_objects(bucket_id,name,metadata)
      values('atminimas',actor||'/owner-bytes-extra/photo-1.jpg','{"size":52428800}');
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Owner byte quota bypassed'; end if;
  delete from quota_test_objects;

  insert into quota_test_objects(bucket_id,name,metadata)
    select 'grave-photo-submissions',actor||'/'||gen_random_uuid()||'.jpg','{"size":1}'
    from generate_series(1,64);
  rejected:=false;
  begin
    insert into quota_test_objects(bucket_id,name,metadata)
      values('grave-photo-submissions',actor||'/'||gen_random_uuid()||'.jpg','{"size":1}');
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Grave submission quota bypassed'; end if;
  delete from quota_test_objects;

  -- Missing preflight size reserves the maximum; malformed/negative/oversized
  -- final metadata must never reduce or bypass byte accounting.
  insert into quota_test_objects(bucket_id,name,metadata)
    values('atminimas',actor||'/probe/photo-1.jpg',null);
  if not exists(select 1 from private.storage_owner_usage where owner_id=actor and byte_count=52428800)
    then raise exception 'Missing preflight size undercounted'; end if;
  delete from quota_test_objects;
  rejected:=false;
  begin
    insert into quota_test_objects(bucket_id,name,metadata)
      values('atminimas',actor||'/probe/photo-1.jpg','{"size":-1}');
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Invalid size accepted'; end if;
  rejected:=false;
  begin
    insert into quota_test_objects(bucket_id,name,metadata)
      values('atminimas',actor||'/probe/photo-1.jpg','{"size":52428801}');
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Oversized file accepted'; end if;

  -- Permission probes use subtransactions; their rolled-back reservations
  -- must disappear, while an actual privileged completion remains charged.
  select to_jsonb(u) into initial_usage from private.storage_owner_usage u where owner_id=actor;
  begin
    insert into quota_test_objects(bucket_id,name,metadata)
      values('atminimas',actor||'/savepoint/photo-1.jpg',null);
    raise exception using errcode='P7777',message='Simulated permission-probe rollback';
  exception when sqlstate 'P7777' then null; end;
  if initial_usage is distinct from(select to_jsonb(u) from private.storage_owner_usage u where owner_id=actor)
    then raise exception 'Rolled-back probe leaked quota reservation'; end if;
  insert into quota_test_objects(bucket_id,name,metadata)
    values('atminimas',actor||'/savepoint/photo-1.jpg','{"size":10}');
  if not exists(select 1 from private.storage_owner_usage where owner_id=actor and object_count=1 and byte_count=10)
    then raise exception 'Privileged completion bypassed quota'; end if;
  delete from quota_test_objects;

  insert into quota_test_objects(bucket_id,name,metadata) values
    ('kapavietes','unrelated/photo.jpg','{"size":1}'),
    ('atminimas','legacy-ownerless/photo-1.jpg','{"size":1}');
  select count(*) into tracked from private.storage_owner_usage where owner_id=actor
    and object_count=0 and byte_count=0 and profile_count=0;
  if tracked<>1 then raise exception 'Quota usage did not return to zero'; end if;
end;
$$;
rollback;
