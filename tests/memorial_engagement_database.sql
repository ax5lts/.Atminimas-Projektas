-- Run after the rate-limit migration. Every synthetic row and counter change is
-- rolled back; this test sends no requests, emails or payments.
begin;
set local statement_timeout = '20s';

do $$
declare
  v_profile text := 'engagement-test-' || gen_random_uuid();
  v_other text := 'engagement-test-' || gen_random_uuid();
  v_hash text := repeat('a', 64);
  v_new_hash text := repeat('b', 64);
  v_denied boolean;
begin
  assert not has_function_privilege('anon',
    'public.consume_memorial_engagement_rate_limit(text,text,text)', 'EXECUTE'),
    'anonymous callers must not reserve or reset counters';
  assert not has_function_privilege('authenticated',
    'public.consume_memorial_engagement_rate_limit(text,text,text)', 'EXECUTE'),
    'authenticated callers must not impersonate another IP';
  assert has_function_privilege('service_role',
    'public.consume_memorial_engagement_rate_limit(text,text,text)', 'EXECUTE');
  assert not has_table_privilege('anon', 'private.memorial_engagement_limits', 'SELECT');
  assert not has_table_privilege('authenticated', 'private.memorial_engagement_limits', 'INSERT');
  assert (select relrowsecurity from pg_class
    where oid = 'private.memorial_engagement_limits'::regclass);

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.profiliai (id, owner_id, vardas, aktyvus, apmoketa, statusas)
    select id, (select id from auth.users limit 1), 'Synthetic test', true, true, 'apmoketa'
    from (values(v_profile), (v_other)) fixture(id);
  -- Isolate synthetic counters from the current site's hourly budget. These
  -- edits are inside the outer rollback transaction.
  delete from private.memorial_engagement_limits
    where scope = 'site-hour' or subject_key in (v_hash, v_new_hash);

  assert public.consume_memorial_engagement_rate_limit(v_profile, 'candle', v_hash);
  assert not public.consume_memorial_engagement_rate_limit(v_profile, 'candle', v_hash),
    'second candle is denied independently of all browser headers';
  assert (select requests = 1 from private.memorial_engagement_limits
    where scope = 'ip-hour' and subject_key = v_hash),
    'a denied reservation must roll back every counter increment';
  assert public.consume_memorial_engagement_rate_limit(v_profile, 'memory', v_hash);
  assert public.consume_memorial_engagement_rate_limit(v_profile, 'memory', v_hash);
  assert not public.consume_memorial_engagement_rate_limit(v_profile, 'memory', v_hash),
    'at most two memories per visitor/profile/day';

  update private.memorial_engagement_limits set expires_at = now() - interval '1 second'
    where scope = 'visitor-candle' and subject_key = v_hash || ':' || v_profile;
  assert public.consume_memorial_engagement_rate_limit(v_profile, 'candle', v_hash),
    'expired rolling window permits a new candle';
  assert not public.consume_memorial_engagement_rate_limit(v_profile, 'candle', v_hash);

  update private.memorial_engagement_limits set requests = 30
    where scope = 'ip-hour' and subject_key = v_hash;
  assert not public.consume_memorial_engagement_rate_limit(v_other, 'candle', v_hash),
    'independent IP budget applies across profiles';
  update private.memorial_engagement_limits set requests = 1000
    where scope = 'profile-candle' and subject_key = v_profile;
  assert not public.consume_memorial_engagement_rate_limit(v_profile, 'candle', v_new_hash),
    'profile budget applies across different IP addresses';
  update private.memorial_engagement_limits set requests = 10000 where scope = 'site-hour';
  assert not public.consume_memorial_engagement_rate_limit(v_other, 'candle', v_new_hash),
    'site budget caps a distributed flood across profiles';

  insert into private.memorial_engagement_limits(scope, subject_key, requests, expires_at)
    select 'cleanup-test', 'synthetic-' || generate_series(1, 200), 1, '2000-01-01'::timestamptz;
  assert not public.consume_memorial_engagement_rate_limit(v_other, 'candle', v_new_hash);
  assert (select count(*) = 100 from private.memorial_engagement_limits where scope = 'cleanup-test'),
    'cleanup removes a bounded batch even on denied requests';

  update public.profiliai set access_code_hash = extensions.crypt('58492', extensions.gen_salt('bf', 4))
    where id = v_profile;
  v_denied := false;
  begin
    perform public.consume_memorial_engagement_rate_limit(v_profile, 'candle', v_new_hash);
  exception when invalid_parameter_value then v_denied := true;
  end;
  assert v_denied, 'protected profiles cannot accept public engagement';

  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  v_denied := false;
  begin
    perform public.consume_memorial_engagement_rate_limit(v_other, 'candle', v_new_hash);
  exception when insufficient_privilege then v_denied := true;
  end;
  assert v_denied, 'function body also enforces the service role';
end;
$$;
rollback;
