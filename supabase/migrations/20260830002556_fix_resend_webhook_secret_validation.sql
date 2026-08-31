-- Fix Resend webhook secret validation without PostgreSQL's regex
-- repetition-limit overflow. Keep the Vault writer service-role only.

create or replace function public.store_resend_webhook_config(
  p_webhook_id text,
  p_signing_secret text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  secret_id uuid;
begin
  if p_webhook_id is null
     or char_length(p_webhook_id) = 0
     or char_length(p_webhook_id) > 255 then
    raise exception 'invalid webhook id';
  end if;

  if p_signing_secret is null
     or char_length(p_signing_secret) < 22
     or char_length(p_signing_secret) > 506
     or p_signing_secret !~ '^whsec_[A-Za-z0-9+/=_-]+$' then
    raise exception 'invalid signing secret';
  end if;

  select id
  into secret_id
  from vault.secrets
  where name = 'resend_webhook_secret'
  limit 1;

  if secret_id is null then
    perform vault.create_secret(
      p_signing_secret,
      'resend_webhook_secret',
      'Resend delivery webhook signature verification'
    );
  else
    perform vault.update_secret(
      secret_id,
      p_signing_secret,
      'resend_webhook_secret',
      'Resend delivery webhook signature verification'
    );
  end if;

  secret_id := null;

  select id
  into secret_id
  from vault.secrets
  where name = 'resend_webhook_id'
  limit 1;

  if secret_id is null then
    perform vault.create_secret(
      p_webhook_id,
      'resend_webhook_id',
      'Resend delivery webhook identifier'
    );
  else
    perform vault.update_secret(
      secret_id,
      p_webhook_id,
      'resend_webhook_id',
      'Resend delivery webhook identifier'
    );
  end if;
end;
$function$;

revoke all on function public.store_resend_webhook_config(text, text)
  from public, anon, authenticated;
grant execute on function public.store_resend_webhook_config(text, text)
  to service_role;
