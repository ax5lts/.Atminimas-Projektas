begin;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  test_owner uuid;
  root_id text := 'group-regression-' || gen_random_uuid()::text;
  child_id text := 'group-regression-' || gen_random_uuid()::text;
begin
  if has_column_privilege('authenticated', 'public.profiliai', 'group_members', 'UPDATE')
    or has_column_privilege('authenticated', 'public.profiliai', 'group_members', 'INSERT')
    or has_column_privilege('anon', 'public.profiliai', 'group_members', 'SELECT') then
    raise exception 'Untrusted roles can bypass the group API';
  end if;
  if not has_column_privilege('service_role', 'public.profiliai', 'group_members', 'UPDATE') then
    raise exception 'Backend cannot save group membership';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.profiliai'::regclass) then
    raise exception 'Profile RLS is disabled';
  end if;
  select id into test_owner from auth.users limit 1;
  if test_owner is null then raise exception 'Test requires an existing owner'; end if;
  insert into public.profiliai (id,owner_id,vardas,aktyvus) values
    (root_id,test_owner,'Group regression',false), (child_id,test_owner,'Group regression child',false);
  update public.profiliai set group_members=array[child_id] where id=root_id;
  if not exists (select 1 from public.profiliai where id=root_id and group_members=array[child_id] and not aktyvus) then
    raise exception 'Group write changed publication state or did not persist';
  end if;
  begin
    update public.profiliai set group_members=array_fill(child_id,array[8]) where id=root_id;
    raise exception 'More than seven additional people were accepted';
  exception when check_violation then null;
  end;
end;
$$;
rollback;
select 'Group persistence, size, RLS and column permissions passed; test rows rolled back' as result;
