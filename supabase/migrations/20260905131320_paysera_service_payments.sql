-- Paysera Checkout Classic for accepted grave-care quotes. QR preorders remain unpaid.
alter table public.paslaugu_uzklausos
  add column payment_project_id text,
  add column payment_test boolean not null default false;

alter table public.paslaugu_uzklausos
  drop constraint paslaugu_uzklausos_payment_state_check,
  add constraint paslaugu_uzklausos_payment_state_check check (
    (payment_status not in ('processing', 'paid') or (
      payment_provider is not null and payment_provider in ('stripe', 'paysera')
      and payment_attempt_id is not null and payment_session_expires_at is not null
    ))
    and (payment_status <> 'paid' or (
      payment_session_id is not null and payment_reference is not null and paid_at is not null
      and not payment_test
    ))
    and (payment_provider is distinct from 'paysera' or (
      payment_project_id is not null and payment_project_id ~ '^[1-9][0-9]{0,10}$'
      and payment_session_id is not null
      and payment_session_id = payment_attempt_id::text
    ))
  );

create unique index paslaugu_uzklausos_paysera_attempt_idx
  on public.paslaugu_uzklausos (payment_attempt_id) where payment_provider = 'paysera';

create or replace function public.begin_my_paysera_service_payment(
  p_request_id uuid, p_actor_id uuid, p_project_id text, p_test boolean
)
returns public.paslaugu_uzklausos
language plpgsql security invoker set search_path = public
as $$
declare req public.paslaugu_uzklausos%rowtype;
declare attempt uuid;
begin
  if p_actor_id is null then raise exception 'Authentication required'; end if;
  if p_project_id is null or p_project_id !~ '^[1-9][0-9]{0,10}$' or p_test is null then
    raise exception 'Invalid Paysera configuration';
  end if;
  select * into req from public.paslaugu_uzklausos where id = p_request_id for update;
  if req.id is null or req.owner_id is distinct from p_actor_id then
    raise exception 'Service request not found';
  end if;
  if req.payment_status = 'paid' then return req; end if;
  if req.quote_status <> 'accepted' then raise exception 'Quote must be accepted'; end if;
  if req.payment_status = 'processing' then
    if req.payment_provider = 'paysera' and (
      req.payment_project_id is distinct from p_project_id or req.payment_test is distinct from p_test
    ) then raise exception 'Payment configuration changed during an active attempt'; end if;
    -- Never replace a pending bank transfer with a second payable order.
    return req;
  end if;
  if req.quote_expires_at is null or req.quote_expires_at <= now() + interval '15 minutes' then
    raise exception 'Quote expired; request a new quote';
  end if;
  if req.payment_status not in ('pending', 'failed', 'cancelled')
      or req.quote_amount_cents is null or req.quote_amount_cents <= 0 or req.currency <> 'EUR' then
    raise exception 'Payment is not ready';
  end if;
  attempt := gen_random_uuid();
  update public.paslaugu_uzklausos set
    payment_status = 'processing', payment_provider = 'paysera',
    payment_project_id = p_project_id, payment_test = p_test,
    payment_attempt_id = attempt, payment_session_id = attempt::text,
    payment_session_expires_at = least(req.quote_expires_at, now() + interval '23 hours'),
    payment_reference = null, paid_at = null, updated_at = now()
  where id = req.id returning * into req;
  return req;
end;
$$;
revoke all on function public.begin_my_paysera_service_payment(uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.begin_my_paysera_service_payment(uuid, uuid, text, boolean) to service_role;

create or replace function public.process_paysera_service_payment(
  p_attempt_id uuid, p_project_id text, p_event_id text, p_reference text,
  p_status integer, p_amount_cents integer, p_currency text, p_test boolean
)
returns text
language plpgsql security invoker set search_path = public
as $$
declare req public.paslaugu_uzklausos%rowtype;
declare event_status text;
declare existing_status text;
declare valid_payment boolean;
begin
  if p_attempt_id is null or p_event_id is null or p_event_id !~ '^[0-9a-f]{64}$'
    or p_project_id is null or p_reference is null or length(p_reference) not between 1 and 255
    or p_status is null or p_status not between 0 and 4 or p_amount_cents is null or p_amount_cents < 0
    or p_currency is null or p_currency !~ '^[A-Z]{3}$' or p_test is null then
    raise exception 'Invalid Paysera event';
  end if;
  select * into req from public.paslaugu_uzklausos
    where payment_provider = 'paysera' and payment_attempt_id = p_attempt_id for update;
  if req.id is null then return 'not_found'; end if;
  select status into existing_status from public.service_payment_events
    where provider = 'paysera' and provider_event_id = p_event_id;
  if found then return existing_status; end if;

  valid_payment := req.quote_status = 'accepted' and req.payment_status in ('processing', 'paid')
    and req.payment_session_id = p_attempt_id::text
    and req.payment_project_id = p_project_id and req.payment_test = p_test
    and req.quote_amount_cents = p_amount_cents and req.currency = p_currency;
  event_status := case
    when not coalesce(valid_payment, false) then 'rejected_quote_or_amount'
    when p_status in (1, 3) and not p_test then 'accepted'
    else 'recorded'
  end;
  insert into public.service_payment_events (
    request_id, provider, provider_event_id, provider_payment_id, payment_attempt_id, quote_revision,
    event_type, status, amount_cents, currency, payload, processed_at
  ) values (
    req.id, 'paysera', p_event_id, p_reference, p_attempt_id, req.quote_revision,
    'paysera.status.' || p_status, event_status, p_amount_cents, p_currency,
    jsonb_build_object('status', p_status, 'test', p_test, 'projectid', p_project_id), now()
  );
  if event_status = 'accepted' and req.payment_status <> 'paid' then
    -- Callback arrival may be delayed after the payment-initiation deadline.
    -- The accepted quote and attempt stay locked until payment is reconciled.
    update public.paslaugu_uzklausos set
      payment_status = 'paid', payment_reference = p_reference, paid_at = now(),
      statusas = 'susisiekta', updated_at = now()
    where id = req.id;
  elsif valid_payment and p_test and p_status in (1, 3) then
    -- Successful sandbox payments never mark a real service as paid.
    update public.paslaugu_uzklausos set payment_status = 'cancelled', updated_at = now()
      where id = req.id;
  end if;
  return event_status;
end;
$$;
revoke all on function public.process_paysera_service_payment(uuid, text, text, text, integer, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.process_paysera_service_payment(uuid, text, text, text, integer, integer, text, boolean)
  to service_role;
