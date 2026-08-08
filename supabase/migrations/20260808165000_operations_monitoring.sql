-- Veiklos prieziuros, el. laisku pristatymo ir sistemos sveikatos duomenys.
-- Gavėju adresai siuose zurnaluose nesaugomi atviru tekstu.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.ops_monitor_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_source text not null default 'schedule'
    check (trigger_source in ('schedule', 'manual', 'deploy')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'partial', 'failed')),
  checks_total integer not null default 0 check (checks_total >= 0),
  alerts_opened integer not null default 0 check (alerts_opened >= 0),
  alerts_resolved integer not null default 0 check (alerts_resolved >= 0),
  summary jsonb not null default '{}'::jsonb,
  error text check (error is null or char_length(error) <= 2000),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'resend' check (provider in ('resend')),
  provider_email_id text unique,
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 1 and 256),
  order_id uuid references public.uzsakymai (id) on delete set null,
  entity_type text check (entity_type is null or char_length(entity_type) <= 60),
  entity_id text check (entity_id is null or char_length(entity_id) <= 160),
  recipient_kind text not null default 'customer'
    check (recipient_kind in ('customer', 'admin', 'manufacturer', 'partner', 'support')),
  recipient_masked text not null check (char_length(recipient_masked) <= 320),
  recipient_hash text not null check (recipient_hash ~ '^[a-f0-9]{64}$'),
  category text not null check (char_length(category) between 1 and 100),
  status text not null default 'accepted'
    check (status in ('accepted', 'sent', 'delivered', 'delayed', 'bounced', 'failed', 'complained', 'suppressed')),
  sent_at timestamptz not null default now(),
  last_event_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_messages_order_idx
  on public.email_messages (order_id, sent_at desc);
create index if not exists email_messages_status_idx
  on public.email_messages (status, sent_at desc);
create index if not exists email_messages_problem_idx
  on public.email_messages (last_event_at desc)
  where status in ('delayed', 'bounced', 'failed', 'complained', 'suppressed');

create table if not exists public.email_delivery_events (
  id bigint generated always as identity primary key,
  svix_id text not null unique check (char_length(svix_id) between 1 and 255),
  provider_email_id text not null check (char_length(provider_email_id) <= 255),
  email_message_id uuid references public.email_messages (id) on delete set null,
  order_id uuid references public.uzsakymai (id) on delete set null,
  event_type text not null
    check (event_type in ('sent', 'delivered', 'delivery_delayed', 'bounced', 'failed', 'complained', 'suppressed', 'opened', 'clicked')),
  event_at timestamptz not null,
  recipient_masked text check (recipient_masked is null or char_length(recipient_masked) <= 320),
  recipient_hash text check (recipient_hash is null or recipient_hash ~ '^[a-f0-9]{64}$'),
  detail jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
create index if not exists email_delivery_events_message_idx
  on public.email_delivery_events (email_message_id, event_at desc);
create index if not exists email_delivery_events_provider_idx
  on public.email_delivery_events (provider_email_id, event_at desc);
create index if not exists email_delivery_events_order_idx
  on public.email_delivery_events (order_id, event_at desc);

create table if not exists public.ops_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null unique check (char_length(alert_key) between 1 and 240),
  category text not null check (char_length(category) between 1 and 80),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  title text not null check (char_length(title) between 1 and 200),
  detail text check (detail is null or char_length(detail) <= 2000),
  entity_type text check (entity_type is null or char_length(entity_type) <= 60),
  entity_id text check (entity_id is null or char_length(entity_id) <= 160),
  metadata jsonb not null default '{}'::jsonb,
  occurrences integer not null default 1 check (occurrences >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ops_alerts_open_idx
  on public.ops_alerts (severity, last_seen_at desc) where status = 'open';
create index if not exists ops_alerts_entity_idx
  on public.ops_alerts (entity_type, entity_id, last_seen_at desc);

create table if not exists public.system_health_checks (
  id bigint generated always as identity primary key,
  run_id uuid references public.ops_monitor_runs (id) on delete set null,
  check_key text not null check (char_length(check_key) between 1 and 120),
  target_kind text not null check (target_kind in ('website', 'edge_function', 'database', 'email')),
  status text not null check (status in ('healthy', 'degraded', 'down')),
  http_status integer check (http_status is null or http_status between 100 and 599),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  detail text check (detail is null or char_length(detail) <= 500),
  checked_at timestamptz not null default now()
);
create index if not exists system_health_checks_key_idx
  on public.system_health_checks (check_key, checked_at desc);
create index if not exists system_health_checks_run_idx
  on public.system_health_checks (run_id);
create index if not exists system_health_checks_checked_idx
  on public.system_health_checks (checked_at desc);

create table if not exists public.ops_daily_snapshots (
  snapshot_date date primary key,
  metrics jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);

alter table public.ops_monitor_runs enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_delivery_events enable row level security;
alter table public.ops_alerts enable row level security;
alter table public.system_health_checks enable row level security;
alter table public.ops_daily_snapshots enable row level security;

revoke all on public.ops_monitor_runs, public.email_messages,
  public.email_delivery_events, public.ops_alerts, public.system_health_checks,
  public.ops_daily_snapshots from public, anon, authenticated;
grant select on public.ops_monitor_runs, public.email_messages,
  public.email_delivery_events, public.ops_alerts, public.system_health_checks,
  public.ops_daily_snapshots to authenticated;
grant all on public.ops_monitor_runs, public.email_messages,
  public.email_delivery_events, public.ops_alerts, public.system_health_checks,
  public.ops_daily_snapshots to service_role;
grant usage, select on all sequences in schema public to service_role;

create or replace function public.ops_collect_metrics()
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'orders_total', (select count(*) from public.uzsakymai),
    'orders_today', (select count(*) from public.uzsakymai where created_at >= date_trunc('day', now())),
    'paid_today', (select count(*) from public.uzsakymai where paid_at >= date_trunc('day', now())),
    'revenue_today_cents', coalesce((select sum(total_cents) from public.uzsakymai where paid_at >= date_trunc('day', now()) and payment_status = 'paid'), 0),
    'unpaid_older_24h', (select count(*) from public.uzsakymai where apmoketa = false and created_at < now() - interval '24 hours' and payment_status not in ('cancelled', 'refunded')),
    'payment_inconsistent', (select count(*) from public.uzsakymai where apmoketa is distinct from (payment_status = 'paid')),
    'automation_problems', (select count(*) from public.automation_events where status in ('failed', 'blocked') or (status = 'processing' and locked_at < now() - interval '15 minutes')),
    'production_stalled', (select count(*) from public.production_jobs where status not in ('completed', 'cancelled') and updated_at < now() - interval '48 hours'),
    'manufacturer_email_pending', (select count(*) from public.production_jobs where status = 'qr_ready' and manufacturer_email_sent_at is null and updated_at < now() - interval '30 minutes'),
    'email_problems', (select count(*) from public.email_messages where status in ('delayed', 'bounced', 'failed', 'complained', 'suppressed')),
    'email_delivery_pending', (select count(*) from public.email_messages where status in ('accepted', 'sent') and sent_at < now() - interval '30 minutes'),
    'open_alerts', (select count(*) from public.ops_alerts where status = 'open'),
    'critical_alerts', (select count(*) from public.ops_alerts where status = 'open' and severity = 'critical'),
    'generated_at', now()
  );
$$;
revoke all on function public.ops_collect_metrics() from public, anon, authenticated;
grant execute on function public.ops_collect_metrics() to service_role;

drop policy if exists "Admin skaito prieziuros paleidimus" on public.ops_monitor_runs;
create policy "Admin skaito prieziuros paleidimus" on public.ops_monitor_runs
for select to authenticated using (exists (
  select 1 from public.user_roles r
  where r.user_id = (select auth.uid()) and r.role = 'admin'
));
drop policy if exists "Admin skaito laisku busenas" on public.email_messages;
create policy "Admin skaito laisku busenas" on public.email_messages
for select to authenticated using (exists (
  select 1 from public.user_roles r
  where r.user_id = (select auth.uid()) and r.role = 'admin'
));
drop policy if exists "Admin skaito laisku ivykius" on public.email_delivery_events;
create policy "Admin skaito laisku ivykius" on public.email_delivery_events
for select to authenticated using (exists (
  select 1 from public.user_roles r
  where r.user_id = (select auth.uid()) and r.role = 'admin'
));
drop policy if exists "Admin skaito prieziuros ispejimus" on public.ops_alerts;
create policy "Admin skaito prieziuros ispejimus" on public.ops_alerts
for select to authenticated using (exists (
  select 1 from public.user_roles r
  where r.user_id = (select auth.uid()) and r.role = 'admin'
));
drop policy if exists "Admin skaito sistemos patikras" on public.system_health_checks;
create policy "Admin skaito sistemos patikras" on public.system_health_checks
for select to authenticated using (exists (
  select 1 from public.user_roles r
  where r.user_id = (select auth.uid()) and r.role = 'admin'
));
drop policy if exists "Admin skaito dienos suvestines" on public.ops_daily_snapshots;
create policy "Admin skaito dienos suvestines" on public.ops_daily_snapshots
for select to authenticated using (exists (
  select 1 from public.user_roles r
  where r.user_id = (select auth.uid()) and r.role = 'admin'
));

-- Cron kviecia Edge Function tik tada, kai Vault yra abu reikalingi nustatymai.
-- Juos galima pakeisti neperrasant migracijos.
create or replace function private.invoke_ops_monitor()
returns bigint
language plpgsql
security definer
set search_path = private, public, vault, extensions
as $$
declare
  target_url text;
  monitor_secret text;
  request_id bigint;
begin
  select decrypted_secret into target_url
  from vault.decrypted_secrets where name = 'ops_monitor_url' limit 1;
  select decrypted_secret into monitor_secret
  from vault.decrypted_secrets where name = 'ops_monitor_secret' limit 1;
  if target_url is null or monitor_secret is null then
    return null;
  end if;
  select net.http_post(
    url := target_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ops-monitor-secret', monitor_secret
    ),
    body := '{"trigger_source":"schedule"}'::jsonb,
    timeout_milliseconds := 25000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function private.invoke_ops_monitor() from public, anon, authenticated;

create or replace function private.cleanup_ops_history()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  delete from public.system_health_checks where checked_at < now() - interval '90 days';
  delete from public.ops_monitor_runs where started_at < now() - interval '90 days';
  delete from public.email_delivery_events where received_at < now() - interval '730 days';
  delete from public.ops_alerts where status = 'resolved' and resolved_at < now() - interval '365 days';
end;
$$;
revoke all on function private.cleanup_ops_history() from public, anon, authenticated;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job
  where jobname = 'atminimas-ops-monitor-every-5-minutes' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule(
    'atminimas-ops-monitor-every-5-minutes',
    '*/5 * * * *',
    'select private.invoke_ops_monitor()'
  );
  select jobid into existing_job from cron.job
  where jobname = 'atminimas-ops-history-cleanup' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule(
    'atminimas-ops-history-cleanup',
    '17 3 * * *',
    'select private.cleanup_ops_history()'
  );
end;
$$;
