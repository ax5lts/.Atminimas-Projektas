-- Paysera sends distinct order and payment callbacks for one completed sandbox
-- payment. Acknowledge those callbacks without reopening or paying the service.
create or replace function public.process_paysera_modern_payment(
  p_attempt_id uuid,p_order_id uuid,p_project_id uuid,p_event_id text,
  p_status text,p_amount integer,p_amount_paid integer,p_currency text,p_test boolean
)
returns text language plpgsql security invoker set search_path = public
as $$
declare req public.paslaugu_uzklausos%rowtype;
declare completed_test public.service_payment_events%rowtype;
declare existing public.service_payment_events%rowtype;
declare result text;
declare valid boolean;
declare closed_test boolean := false;
declare event_revision integer;
begin
  if p_attempt_id is null or p_order_id is null or p_project_id is null or p_event_id is null
    or p_event_id !~ '^[0-9a-f]{64}$' or p_status is null or length(p_status) not between 1 and 80
    or p_amount is null or p_amount<=0 or p_amount_paid is null or p_amount_paid<0
    or p_currency is null or p_currency !~ '^[A-Z]{3}$' or p_test is null then raise exception 'Invalid payment event'; end if;

  select * into req from public.paslaugu_uzklausos
    where payment_provider='paysera_modern' and payment_attempt_id=p_attempt_id for update;
  if req.id is null then
    -- A fresh attempt replaces the service's payment fields. Only a previously
    -- validated, fully paid test event can identify an older sandbox attempt.
    -- Older events without a stored project cannot establish this binding.
    if not p_test then return 'not_found'; end if;
    select * into completed_test from public.service_payment_events e
      where e.provider='paysera_modern' and e.payment_attempt_id=p_attempt_id
        and e.provider_payment_id=p_order_id::text and e.currency=p_currency
        and e.status='recorded' and e.event_type='order.paid' and e.amount_cents>=p_amount
        and e.payload @> jsonb_build_object('status','paid','test',true,'amount',p_amount,'project_id',p_project_id::text)
      order by e.id limit 1;
    if completed_test.id is null then return 'not_found'; end if;
    select * into req from public.paslaugu_uzklausos where id=completed_test.request_id for update;
    if req.id is null then return 'not_found'; end if;
    closed_test := true;
    event_revision := completed_test.quote_revision;
  else
    event_revision := req.quote_revision;
    if p_test and req.payment_test and req.payment_status='cancelled'
      and req.payment_session_id=p_order_id::text and req.payment_project_id=p_project_id::text
      and req.quote_status='accepted' and req.quote_amount_cents=p_amount and req.currency=p_currency then
      select * into completed_test from public.service_payment_events e
        where e.request_id=req.id and e.provider='paysera_modern' and e.payment_attempt_id=p_attempt_id
          and e.provider_payment_id=p_order_id::text and e.quote_revision=req.quote_revision and e.currency=p_currency
          and e.status='recorded' and e.event_type='order.paid' and e.amount_cents>=p_amount
          and e.payload @> jsonb_build_object('status','paid','test',true,'amount',p_amount)
          and (not (e.payload ? 'project_id') or e.payload->>'project_id'=p_project_id::text)
        order by e.id limit 1;
      closed_test := completed_test.id is not null;
    end if;
  end if;

  select * into existing from public.service_payment_events
    where provider='paysera_modern' and provider_event_id=p_event_id;
  if existing.id is not null then
    -- Recover a retry rejected by the previous cancelled-state check. The
    -- callback must match its stored event and the independently proven test.
    if closed_test and existing.status='rejected_quote_or_amount'
      and existing.request_id=req.id and existing.payment_attempt_id=p_attempt_id
      and existing.provider_payment_id=p_order_id::text and existing.quote_revision=event_revision
      and existing.event_type='order.'||p_status and existing.amount_cents=p_amount_paid and existing.currency=p_currency
      and existing.payload @> jsonb_build_object('status',p_status,'test',true,'amount',p_amount)
      and (not (existing.payload ? 'project_id') or existing.payload->>'project_id'=p_project_id::text) then
      update public.service_payment_events set status='recorded',
        payload=payload || jsonb_build_object('project_id',p_project_id::text) where id=existing.id;
      return 'recorded';
    end if;
    return existing.status;
  end if;

  valid := req.payment_attempt_id=p_attempt_id and req.payment_provider='paysera_modern'
    and req.payment_session_id=p_order_id::text and req.payment_project_id=p_project_id::text
    and req.quote_status='accepted' and req.payment_status in ('processing','paid')
    and req.quote_amount_cents=p_amount and req.currency=p_currency
    and not (req.payment_status='paid' and p_test);
  result := case when closed_test then 'recorded'
    when not coalesce(valid,false) then 'rejected_quote_or_amount'
    when p_status='paid' and p_amount_paid>=p_amount and not p_test then 'accepted' else 'recorded' end;
  insert into public.service_payment_events(request_id,provider,provider_event_id,provider_payment_id,
    payment_attempt_id,quote_revision,event_type,status,amount_cents,currency,payload,processed_at)
    values(req.id,'paysera_modern',p_event_id,p_order_id::text,p_attempt_id,event_revision,
      'order.'||p_status,result,p_amount_paid,p_currency,
      jsonb_build_object('status',p_status,'test',p_test,'amount',p_amount,'project_id',p_project_id::text),now());
  -- Historical sandbox callbacks only add an audit event, even when the current
  -- service now has a different quote, a live attempt, or a completed payment.
  if closed_test then return result; end if;
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
