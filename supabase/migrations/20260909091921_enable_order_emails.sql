-- Activate after deploying automation-worker and verifying check=true readiness.
do $$
declare task_id bigint;
begin
  select jobid into task_id from cron.job where jobname='atminimas-order-emails-every-minute';
  if task_id is null then raise exception 'Order email scheduler missing'; end if;
  perform cron.alter_job(task_id,active:=true);
end $$;
