-- Modern OAuth checkout. Secrets are stored separately in encrypted Supabase Vault.
create or replace function private.read_paysera_checkout_credentials()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select decrypted_secret::jsonb from vault.decrypted_secrets
    where name = 'paysera_checkout_modern' limit 1;
$$;
revoke all on function private.read_paysera_checkout_credentials() from public, anon, authenticated;
grant execute on function private.read_paysera_checkout_credentials() to service_role;

create or replace function public.get_paysera_checkout_credentials()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.read_paysera_checkout_credentials(); $$;
revoke all on function public.get_paysera_checkout_credentials() from public, anon, authenticated;
grant execute on function public.get_paysera_checkout_credentials() to service_role;

alter table public.paslaugu_uzklausos
  add column payment_create_token uuid,
  add column payment_checkout_url text,
  add column payment_link_id uuid;

alter table public.paslaugu_uzklausos
  drop constraint paslaugu_uzklausos_payment_state_check,
  add constraint paslaugu_uzklausos_payment_state_check check (
    (payment_status not in ('processing', 'paid') or (
      payment_provider is not null and payment_provider in ('stripe', 'paysera', 'paysera_modern')
      and payment_attempt_id is not null and payment_session_expires_at is not null
    ))
    and (payment_status <> 'paid' or (
      payment_session_id is not null and payment_reference is not null and paid_at is not null and not payment_test
    ))
    and (payment_provider is distinct from 'paysera' or (
      payment_project_id is not null and payment_project_id ~ '^[1-9][0-9]{0,10}$'
      and payment_session_id is not null and payment_session_id = payment_attempt_id::text
    ))
    and (payment_provider is distinct from 'paysera_modern' or (
      payment_project_id is not null and payment_project_id ~ '^[0-9a-f-]{36}$'
      and (payment_checkout_url is null or (
        payment_session_id is not null and payment_link_id is not null
        and payment_checkout_url ~ '^https://api[.]paysera[.]com/checkout-payment-link/payment-collection/v1/payment-links/[A-Za-z0-9_-]+$'
      ))
    ))
  );
create unique index paslaugu_uzklausos_paysera_modern_attempt_idx
  on public.paslaugu_uzklausos (payment_attempt_id) where payment_provider = 'paysera_modern';

create or replace function public.begin_my_paysera_modern_payment(p_request_id uuid, p_actor_id uuid, p_project_id uuid)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare req public.paslaugu_uzklausos%rowtype;
declare claim uuid;
begin
  if p_actor_id is null or p_project_id is null then raise exception 'Authentication and project required'; end if;
  select * into req from public.paslaugu_uzklausos where id = p_request_id for update;
  if req.id is null or req.owner_id is distinct from p_actor_id then raise exception 'Service request not found'; end if;
  if req.payment_status = 'paid' then return jsonb_build_object('service', to_jsonb(req)); end if;
  if req.quote_status <> 'accepted' then raise exception 'Quote must be accepted'; end if;
  if req.payment_status = 'processing' then
    if req.payment_provider <> 'paysera_modern' then return jsonb_build_object('service', to_jsonb(req)); end if;
    if req.payment_project_id <> p_project_id::text then raise exception 'Payment project changed'; end if;
    if req.payment_checkout_url is not null or req.payment_create_token is not null then
      return jsonb_build_object('service', to_jsonb(req));
    end if;
    -- Retry only after a definitive failure explicitly released the creation claim.
  else
    if req.payment_status not in ('pending','failed','cancelled')
      or req.quote_expires_at is null or req.quote_expires_at <= now() + interval '5 minutes'
      or req.quote_amount_cents is null or req.quote_amount_cents <= 0 or req.currency <> 'EUR' then
      raise exception 'Payment is not ready or quote expired';
    end if;
    update public.paslaugu_uzklausos set
      payment_provider = 'paysera_modern', payment_project_id = p_project_id::text,
      payment_status = 'processing', payment_attempt_id = gen_random_uuid(),
      payment_session_id = null, payment_checkout_url = null, payment_link_id = null,
      payment_test = false, payment_reference = null, paid_at = null,
      payment_session_expires_at = least(req.quote_expires_at, now() + interval '1 hour'), updated_at = now()
      where id = req.id returning * into req;
  end if;
  claim := gen_random_uuid();
  update public.paslaugu_uzklausos set payment_create_token = claim, updated_at = now()
    where id = req.id returning * into req;
  return jsonb_build_object('service', to_jsonb(req), 'claim_token', claim);
end;
$$;
revoke all on function public.begin_my_paysera_modern_payment(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_my_paysera_modern_payment(uuid,uuid,uuid) to service_role;

create or replace function public.attach_paysera_modern_order(
  p_attempt_id uuid, p_claim_token uuid, p_order_id uuid, p_project_id uuid, p_amount integer, p_currency text
)
returns void language plpgsql security invoker set search_path = public
as $$
declare req public.paslaugu_uzklausos%rowtype;
begin
  select * into req from public.paslaugu_uzklausos
    where payment_provider='paysera_modern' and payment_attempt_id=p_attempt_id for update;
  if req.id is null or req.payment_create_token is distinct from p_claim_token or p_claim_token is null
    or req.payment_status <> 'processing' or req.payment_project_id is distinct from p_project_id::text
    or p_order_id is null or req.quote_amount_cents is distinct from p_amount or req.currency is distinct from p_currency
    or (req.payment_session_id is not null and req.payment_session_id <> p_order_id::text) then
    raise exception 'Payment order binding mismatch';
  end if;
  update public.paslaugu_uzklausos set payment_session_id=p_order_id::text, updated_at=now() where id=req.id;
end;
$$;
revoke all on function public.attach_paysera_modern_order(uuid,uuid,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.attach_paysera_modern_order(uuid,uuid,uuid,uuid,integer,text) to service_role;

create or replace function public.attach_paysera_modern_link(
  p_attempt_id uuid, p_claim_token uuid, p_order_id uuid, p_link_id uuid, p_url text, p_expires_at timestamptz
)
returns void language plpgsql security invoker set search_path = public
as $$
declare req public.paslaugu_uzklausos%rowtype;
begin
  select * into req from public.paslaugu_uzklausos
    where payment_provider='paysera_modern' and payment_attempt_id=p_attempt_id for update;
  if req.id is null or p_claim_token is null or req.payment_create_token is distinct from p_claim_token
    or req.payment_status <> 'processing' or req.payment_session_id is distinct from p_order_id::text
    or p_link_id is null or p_url is null or p_expires_at is null or p_expires_at <= now()
    or p_expires_at > req.payment_session_expires_at + interval '30 seconds'
    or length(p_url) > 2048
    or p_url !~ '^https://api[.]paysera[.]com/checkout-payment-link/payment-collection/v1/payment-links/[A-Za-z0-9_-]+$' then
    raise exception 'Payment link binding mismatch';
  end if;
  update public.paslaugu_uzklausos set payment_checkout_url=p_url, payment_link_id=p_link_id,
    payment_session_expires_at=p_expires_at, payment_create_token=null, updated_at=now() where id=req.id;
end;
$$;
revoke all on function public.attach_paysera_modern_link(uuid,uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.attach_paysera_modern_link(uuid,uuid,uuid,uuid,text,timestamptz) to service_role;

create or replace function public.fail_paysera_modern_creation(p_attempt_id uuid,p_claim_token uuid,p_http_status integer)
returns void language plpgsql security invoker set search_path = public
as $$
begin
  if p_http_status is null or p_http_status not in (400,401,403,404,422) or p_claim_token is null then
    raise exception 'Ambiguous requests cannot be retried automatically';
  end if;
  update public.paslaugu_uzklausos set payment_create_token=null,
    payment_status=case when payment_session_id is null then 'failed' else 'processing' end, updated_at=now()
    where payment_provider='paysera_modern' and payment_attempt_id=p_attempt_id
      and payment_create_token=p_claim_token and payment_status='processing' and payment_checkout_url is null;
end;
$$;
revoke all on function public.fail_paysera_modern_creation(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.fail_paysera_modern_creation(uuid,uuid,integer) to service_role;

create or replace function public.process_paysera_modern_payment(
  p_attempt_id uuid,p_order_id uuid,p_project_id uuid,p_event_id text,
  p_status text,p_amount integer,p_amount_paid integer,p_currency text,p_test boolean
)
returns text language plpgsql security invoker set search_path = public
as $$
declare req public.paslaugu_uzklausos%rowtype;
declare result text;
declare existing text;
declare valid boolean;
begin
  if p_attempt_id is null or p_order_id is null or p_project_id is null or p_event_id is null
    or p_event_id !~ '^[0-9a-f]{64}$' or p_status is null or length(p_status) not between 1 and 80
    or p_amount is null or p_amount<=0 or p_amount_paid is null or p_amount_paid<0
    or p_currency is null or p_currency !~ '^[A-Z]{3}$' or p_test is null then raise exception 'Invalid payment event'; end if;
  select * into req from public.paslaugu_uzklausos
    where payment_provider='paysera_modern' and payment_attempt_id=p_attempt_id for update;
  if req.id is null then return 'not_found'; end if;
  select status into existing from public.service_payment_events where provider='paysera_modern' and provider_event_id=p_event_id;
  if found then return existing; end if;
  valid := req.payment_session_id=p_order_id::text and req.payment_project_id=p_project_id::text
    and req.quote_status='accepted' and req.payment_status in ('processing','paid')
    and req.quote_amount_cents=p_amount and req.currency=p_currency
    and not (req.payment_status='paid' and p_test);
  result := case when not coalesce(valid,false) then 'rejected_quote_or_amount'
    when p_status='paid' and p_amount_paid>=p_amount and not p_test then 'accepted' else 'recorded' end;
  insert into public.service_payment_events(request_id,provider,provider_event_id,provider_payment_id,
    payment_attempt_id,quote_revision,event_type,status,amount_cents,currency,payload,processed_at)
    values(req.id,'paysera_modern',p_event_id,p_order_id::text,p_attempt_id,req.quote_revision,
      'order.'||p_status,result,p_amount_paid,p_currency,jsonb_build_object('status',p_status,'test',p_test,'amount',p_amount),now());
  if result='accepted' and req.payment_status<>'paid' then
    update public.paslaugu_uzklausos set payment_status='paid',payment_reference=p_order_id::text,
      paid_at=now(),payment_test=false,statusas='susisiekta',updated_at=now() where id=req.id;
  elsif valid and p_test and p_status='paid' and p_amount_paid>=p_amount then
    update public.paslaugu_uzklausos set payment_test=true,payment_status='cancelled',updated_at=now() where id=req.id;
  end if;
  return result;
end;
$$;
revoke all on function public.process_paysera_modern_payment(uuid,uuid,uuid,text,text,integer,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.process_paysera_modern_payment(uuid,uuid,uuid,text,text,integer,integer,text,boolean) to service_role;
