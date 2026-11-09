-- Counts are independent of browser headers and reserved atomically. No raw IP
-- addresses are persisted. All writes enter through the service-role backend.
create schema if not exists private;

create table private.memorial_engagement_limits (
  scope text not null check (char_length(scope) between 1 and 40),
  subject_key text not null check (char_length(subject_key) between 1 and 200),
  requests integer not null check (requests > 0),
  expires_at timestamptz not null,
  primary key (scope, subject_key)
);
create index memorial_engagement_limits_expiry_idx
  on private.memorial_engagement_limits (expires_at);
alter table private.memorial_engagement_limits enable row level security;
revoke all on private.memorial_engagement_limits from public, anon, authenticated;

create or replace function public.consume_memorial_engagement_rate_limit(
  p_profile_id text,
  p_action text,
  p_ip_hash text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_limit record;
  v_requests integer;
  v_window integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise insufficient_privilege using message = 'Service role required';
  end if;
  if p_action not in ('candle', 'memory') or p_action is null
     or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$'
     or p_profile_id is null or p_profile_id !~* '^[a-z0-9][a-z0-9-]{0,99}$' then
    raise invalid_parameter_value using message = 'Invalid engagement rate-limit input';
  end if;
  if not exists (
    select 1 from public.profiliai p where p.id = p_profile_id
      and p.aktyvus and p.deleted_at is null and not p.access_code_protected
  ) then
    raise invalid_parameter_value using message = 'Memorial unavailable';
  end if;

  -- Opportunistic cleanup is bounded, indexed and skips rows another call holds.
  delete from private.memorial_engagement_limits l using (
    select scope, subject_key from private.memorial_engagement_limits
    where expires_at < v_now - interval '1 day'
    order by expires_at limit 100 for update skip locked
  ) old where l.scope = old.scope and l.subject_key = old.subject_key;

  v_window := case when p_action = 'candle' then 3600 else 86400 end;
  -- A subtransaction rolls back ALL reservations if any independent limit fails.
  begin
    for v_limit in
      select * from (values
        ('ip-hour', p_ip_hash, 30, 3600),
        ('profile-' || p_action, p_profile_id,
          case when p_action = 'candle' then 1000 else 100 end, v_window),
        ('site-hour', 'all', 10000, 3600),
        ('visitor-' || p_action, p_ip_hash || ':' || p_profile_id,
          case when p_action = 'candle' then 1 else 2 end, v_window)
      ) limits(scope, subject_key, max_requests, window_seconds)
      order by scope, subject_key
    loop
      v_requests := null;
      insert into private.memorial_engagement_limits as current_limit
        (scope, subject_key, requests, expires_at)
      values (v_limit.scope, v_limit.subject_key, 1,
        v_now + make_interval(secs => v_limit.window_seconds))
      on conflict (scope, subject_key) do update
        set requests = case when current_limit.expires_at <= v_now then 1
          else current_limit.requests + 1 end,
          expires_at = case when current_limit.expires_at <= v_now
            then excluded.expires_at else current_limit.expires_at end
        where current_limit.expires_at <= v_now
          or current_limit.requests < v_limit.max_requests
      returning requests into v_requests;
      if v_requests is null then
        raise exception using message = 'memorial_engagement_rate_limited';
      end if;
    end loop;
  exception when raise_exception then
    if sqlerrm = 'memorial_engagement_rate_limited' then return false; end if;
    raise;
  end;
  return true;
end;
$$;

revoke all on function public.consume_memorial_engagement_rate_limit(text, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_memorial_engagement_rate_limit(text, text, text)
  to service_role;

comment on function public.consume_memorial_engagement_rate_limit(text, text, text)
  is 'Atomic rolling windows: 1 candle/hour or 2 memories/day per IP/profile, plus independent IP, profile and site caps. Service backend only.';
