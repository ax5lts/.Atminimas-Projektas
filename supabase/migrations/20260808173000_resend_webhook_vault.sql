-- Resend pasirasymo paslaptis laikoma Vault ir prieinama tik service_role Edge Functions.
create or replace function public.get_resend_webhook_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'resend_webhook_secret'
  limit 1;
$$;
revoke all on function public.get_resend_webhook_secret()
  from public, anon, authenticated;
grant execute on function public.get_resend_webhook_secret() to service_role;

create or replace function public.store_resend_webhook_config(
  p_webhook_id text,
  p_signing_secret text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_id uuid;
begin
  if p_webhook_id is null or char_length(p_webhook_id) > 255 then
    raise exception 'invalid webhook id';
  end if;
  if p_signing_secret is null
     or p_signing_secret !~ '^whsec_[A-Za-z0-9+/=_-]{16,500}$' then
    raise exception 'invalid signing secret';
  end if;

  select id into secret_id from vault.secrets
  where name = 'resend_webhook_secret' limit 1;
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
  select id into secret_id from vault.secrets
  where name = 'resend_webhook_id' limit 1;
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
$$;
revoke all on function public.store_resend_webhook_config(text, text)
  from public, anon, authenticated;
grant execute on function public.store_resend_webhook_config(text, text)
  to service_role;
