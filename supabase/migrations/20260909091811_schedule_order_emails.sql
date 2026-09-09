begin;
-- A dedicated scheduler credential stays inside Vault and is never stored in Git.
do $$
begin
  if not exists(select 1 from vault.secrets where name='automation_worker_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'automation_worker_secret','Order email scheduler authentication');
  end if;
  if not exists(select 1 from vault.secrets where name='automation_worker_url') then
    perform vault.create_secret('https://tpwrkgdmtucecqxbpwwf.supabase.co/functions/v1/automation-worker','automation_worker_url','Order email worker endpoint');
  end if;
end $$;

-- The service-role worker can verify a supplied credential but cannot retrieve it.
create function public.automation_worker_authorized(p_secret text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(length(p_secret)=64 and exists(
    select 1 from vault.decrypted_secrets
    where name='automation_worker_secret'
      and extensions.digest(p_secret,'sha256')=extensions.digest(decrypted_secret,'sha256')
  ),false);
$$;
revoke all on function public.automation_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.automation_worker_authorized(text) to service_role;

create function private.invoke_order_email_worker(p_check boolean default false)
returns bigint language plpgsql security definer set search_path='' as $$
declare endpoint text; credential text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='automation_worker_url';
  select decrypted_secret into credential from vault.decrypted_secrets where name='automation_worker_secret';
  if endpoint is null or credential is null then raise exception 'Order email scheduler is not configured'; end if;
  return net.http_post(url:=endpoint,
    headers:=jsonb_build_object('Content-Type','application/json','x-automation-secret',credential),
    body:=jsonb_build_object('check',p_check),timeout_milliseconds:=60000);
end $$;
revoke all on function private.invoke_order_email_worker(boolean) from public,anon,authenticated,service_role;

-- Activate only after the deployed worker has passed its readiness check.
do $$
declare task_id bigint;
begin
  task_id:=cron.schedule('atminimas-order-emails-every-minute','* * * * *','select private.invoke_order_email_worker();');
  perform cron.alter_job(task_id,active:=false);
end $$;
commit;
