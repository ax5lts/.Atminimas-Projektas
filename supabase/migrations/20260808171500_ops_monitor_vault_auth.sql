-- Leidzia Edge Function patikrinti Cron perduota Vault paslapti jos neatskleidziant.
create or replace function public.verify_ops_monitor_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from vault.decrypted_secrets s
      where s.name = 'ops_monitor_secret'
        and encode(extensions.digest(s.decrypted_secret, 'sha256'), 'hex') =
          encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
    ),
    false
  );
$$;
revoke all on function public.verify_ops_monitor_secret(text)
  from public, anon, authenticated;
grant execute on function public.verify_ops_monitor_secret(text) to service_role;
