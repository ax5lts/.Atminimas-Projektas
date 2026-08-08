create table if not exists private.help_chatbot_rate_limits (
  client_hash text not null,
  bucket_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (client_hash, bucket_start)
);

comment on table private.help_chatbot_rate_limits is
  'Server-only fixed-window counters for the public help chatbot.';

create index if not exists help_chatbot_rate_limits_cleanup_idx
  on private.help_chatbot_rate_limits (bucket_start);

alter table private.help_chatbot_rate_limits enable row level security;
alter table private.help_chatbot_rate_limits force row level security;

revoke all on table private.help_chatbot_rate_limits
  from public, anon, authenticated, service_role;

create or replace function public.consume_help_chatbot_rate_limit(
  p_client_hash text,
  p_limit integer default 30,
  p_window_seconds integer default 600
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_bucket timestamptz;
  next_count integer;
begin
  if p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'help_chatbot_identity_invalid';
  end if;
  if p_limit < 1 or p_limit > 300 or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'help_chatbot_limit_invalid';
  end if;

  current_bucket := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  delete from private.help_chatbot_rate_limits
  where bucket_start < clock_timestamp() - interval '1 day';

  insert into private.help_chatbot_rate_limits as limits (
    client_hash,
    bucket_start,
    request_count
  ) values (
    p_client_hash,
    current_bucket,
    1
  )
  on conflict (client_hash, bucket_start)
  do update set request_count = limits.request_count + 1
  returning request_count into next_count;

  if next_count > p_limit then
    raise exception 'help_chatbot_rate_limited';
  end if;

  return next_count;
end;
$$;

comment on function public.consume_help_chatbot_rate_limit(text, integer, integer) is
  'Consumes one server-authorized chatbot request; never callable from the browser.';

revoke all on function public.consume_help_chatbot_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_help_chatbot_rate_limit(text, integer, integer)
  to service_role;
