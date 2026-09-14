begin;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  test_owner uuid;
  test_id text := 'photo-regression-' || gen_random_uuid()::text;
  media jsonb;
begin
  select id into test_owner from auth.users limit 1;
  if test_owner is null then raise exception 'Test requires an existing owner'; end if;
  insert into public.profiliai (id,owner_id,vardas,aktyvus)
    values (test_id,test_owner,'Photo regression',false);
  select jsonb_agg(jsonb_build_object('type','image','order',n,'path',
    test_owner::text || '/' || test_id || '/photo-' || n || '-' || replace(gen_random_uuid()::text,'-','') || '.webp'))
    into media from generate_series(1,8) n;
  update public.profiliai set media_json=media where id=test_id;
  if (select jsonb_array_length(media_json) from public.profiliai where id=test_id) <> 8 then
    raise exception 'Versioned photos were not preserved';
  end if;
  update public.profiliai set media_json='[]'::jsonb where id=test_id;
  if (select jsonb_array_length(media_json) from public.profiliai where id=test_id) <> 0 then
    raise exception 'Last photo could not be removed';
  end if;
end;
$$;
rollback;
