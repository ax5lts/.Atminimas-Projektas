-- New photos use immutable filenames. Keep legacy names valid and retain all
-- existing owner, bucket, folder-depth, type and size checks.
do $migration$
declare
  definition text;
  policy_row record;
  old_pattern text := 'photo-[1-8]\.';
  new_pattern text := 'photo-[1-8](-[0-9a-f]{32})?\.';
begin
  select pg_get_functiondef('private.normalize_profile_media_json()'::regprocedure) into definition;
  if strpos(definition, old_pattern) = 0 then raise exception 'Expected media filename validator not found'; end if;
  execute replace(definition, old_pattern, new_pattern);
  for policy_row in
    select policyname, qual, with_check from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname in ('Savininkas ikelia atminimo failus', 'Savininkas atnaujina atminimo failus')
  loop
    if policy_row.qual is not null then
      execute format('alter policy %I on storage.objects using (%s)', policy_row.policyname,
        replace(policy_row.qual, old_pattern, new_pattern));
    end if;
    if policy_row.with_check is not null then
      execute format('alter policy %I on storage.objects with check (%s)', policy_row.policyname,
        replace(policy_row.with_check, old_pattern, new_pattern));
    end if;
  end loop;
end;
$migration$;
