-- Mokėjimo įvykis apdorojamas vienoje duomenų bazės transakcijoje.
create or replace function public.process_stripe_payment_event(
  p_order_id uuid,
  p_provider_event_id text,
  p_provider_payment_id text,
  p_event_type text,
  p_amount_cents integer,
  p_currency text,
  p_payment_status text,
  p_object_id text,
  p_mode text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare ord public.uzsakymai%rowtype;
declare paid_event boolean;
declare valid_amount boolean;
declare event_status text;
begin
  select * into ord from public.uzsakymai where id = p_order_id for update;
  if ord.id is null then raise exception 'Order not found'; end if;

  paid_event := p_event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
    and p_payment_status = 'paid';
  valid_amount := p_amount_cents = ord.total_cents and upper(p_currency) = ord.currency;
  event_status := case when paid_event and valid_amount then 'accepted'
    when paid_event then 'rejected_amount' else 'recorded' end;

  insert into public.payment_events (
    order_id, provider, provider_event_id, provider_payment_id, event_type,
    status, amount_cents, currency, payload, processed_at
  ) values (
    ord.id, 'stripe', p_provider_event_id, nullif(p_provider_payment_id, ''), p_event_type,
    event_status, p_amount_cents, nullif(upper(p_currency), ''),
    jsonb_build_object('id', p_object_id, 'payment_status', p_payment_status, 'mode', p_mode), now()
  ) on conflict (provider, provider_event_id) do nothing;

  if paid_event and valid_amount and ord.apmoketa = false then
    update public.uzsakymai set
      apmoketa = true,
      payment_status = 'paid',
      payment_provider = 'stripe',
      payment_reference = coalesce(nullif(p_provider_payment_id, ''), nullif(p_object_id, '')),
      paid_at = now(),
      busena = 'apmoketas'
    where id = ord.id;
  elsif p_event_type = 'checkout.session.async_payment_failed' and ord.apmoketa = false then
    update public.uzsakymai set payment_status = 'failed' where id = ord.id;
  end if;

  return event_status;
end;
$$;

revoke all on function public.process_stripe_payment_event(uuid, text, text, text, integer, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.process_stripe_payment_event(uuid, text, text, text, integer, text, text, text, text)
to service_role;
