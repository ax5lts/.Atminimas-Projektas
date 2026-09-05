-- Run in a transaction. All fixtures and audit events are rolled back.
begin;
set local statement_timeout = '15s';
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare actor uuid;
declare fixture uuid;
declare test_fixture uuid;
declare req public.paslaugu_uzklausos%rowtype;
declare retry public.paslaugu_uzklausos%rowtype;
declare attempt uuid;
declare result text;
declare rejected boolean;
declare event_count integer;
begin
  select id into actor from auth.users limit 1;
  if actor is null then raise exception 'A test owner is required'; end if;
  insert into public.paslaugu_uzklausos (
    owner_id, paslaugos, mirusiojo_vardas, kapiniu_pavadinimas, kapo_vieta,
    quote_status, quote_amount_cents, quote_sent_at, quote_expires_at,
    quote_accepted_at, payment_status, quote_revision
  ) values (
    actor, array['zvakes'], 'Paysera SQL test', 'Test cemetery', 'Test location',
    'accepted', 2500, now(), now() + interval '2 days', now(), 'pending', 1
  ) returning id into fixture;

  rejected := false;
  begin
    perform public.begin_my_paysera_service_payment(fixture, gen_random_uuid(), '123456', false);
  exception when others then rejected := true; end;
  assert rejected, 'another owner must not start the payment';
  update public.paslaugu_uzklausos set quote_status = 'sent' where id = fixture;
  rejected := false;
  begin
    perform public.begin_my_paysera_service_payment(fixture, actor, '123456', false);
  exception when others then rejected := true; end;
  assert rejected, 'unaccepted quote must not be payable';
  update public.paslaugu_uzklausos set quote_status = 'accepted', quote_expires_at = now() - interval '1 hour' where id = fixture;
  rejected := false;
  begin
    perform public.begin_my_paysera_service_payment(fixture, actor, '123456', false);
  exception when others then rejected := true; end;
  assert rejected, 'expired quote must not be payable';
  update public.paslaugu_uzklausos set quote_expires_at = now() + interval '2 days' where id = fixture;

  req := public.begin_my_paysera_service_payment(fixture, actor, '123456', false);
  attempt := req.payment_attempt_id;
  retry := public.begin_my_paysera_service_payment(fixture, actor, '123456', false);
  assert retry.payment_attempt_id = attempt and retry.payment_session_id = attempt::text, 'retry must reuse the same order';
  rejected := false;
  begin
    perform public.begin_my_paysera_service_payment(fixture, actor, '123456', true);
  exception when others then rejected := true; end;
  assert rejected, 'active mode must not change';

  result := public.process_paysera_service_payment(attempt, '123456', repeat('a',64), 'test', 1, 2400, 'EUR', false);
  assert result = 'rejected_quote_or_amount', 'underpayment must fail';
  result := public.process_paysera_service_payment(attempt, '123456', repeat('b',64), 'test', 1, 2500, 'USD', false);
  assert result = 'rejected_quote_or_amount', 'wrong currency must fail';
  result := public.process_paysera_service_payment(attempt, '654321', repeat('c',64), 'test', 1, 2500, 'EUR', false);
  assert result = 'rejected_quote_or_amount', 'wrong project must fail';
  result := public.process_paysera_service_payment(attempt, '123456', repeat('d',64), 'test', 1, 2500, 'EUR', true);
  assert result = 'rejected_quote_or_amount', 'test callback cannot pay a live order';
  result := public.process_paysera_service_payment(gen_random_uuid(), '123456', repeat('e',64), 'test', 1, 2500, 'EUR', false);
  assert result = 'not_found', 'unknown order must fail';
  for event_count in 0..4 loop
    if event_count in (1,3) then continue; end if;
    result := public.process_paysera_service_payment(attempt, '123456', lpad(event_count::text,64,'0'), 'test', event_count, 2500, 'EUR', false);
    select * into req from public.paslaugu_uzklausos where id = fixture;
    assert result = 'recorded' and req.payment_status = 'processing', 'pending status must not mark paid';
  end loop;

  -- A bank may notify us after the initiation deadline.
  update public.paslaugu_uzklausos set payment_session_expires_at = now() - interval '1 hour' where id = fixture;
  result := public.process_paysera_service_payment(attempt, '123456', repeat('f',64), 'paid-test', 1, 2500, 'EUR', false);
  select * into req from public.paslaugu_uzklausos where id = fixture;
  assert result = 'accepted' and req.payment_status = 'paid' and req.payment_reference = 'paid-test' and req.paid_at is not null, 'valid delayed payment must persist';
  select count(*) into event_count from public.service_payment_events where request_id = fixture;
  result := public.process_paysera_service_payment(attempt, '123456', repeat('f',64), 'paid-test', 1, 2500, 'EUR', false);
  assert result = 'accepted' and event_count = (select count(*) from public.service_payment_events where request_id = fixture), 'duplicate callback must not duplicate events';
  result := public.process_paysera_service_payment(attempt, '123456', repeat('1',64), 'info-test', 3, 2500, 'EUR', false);
  select * into retry from public.paslaugu_uzklausos where id = fixture;
  assert result = 'accepted' and retry.paid_at = req.paid_at and retry.payment_reference = 'paid-test', 'additional info must not repeat payment';

  insert into public.paslaugu_uzklausos (
    owner_id, paslaugos, mirusiojo_vardas, kapiniu_pavadinimas, kapo_vieta,
    quote_status, quote_amount_cents, quote_sent_at, quote_expires_at, payment_status, quote_revision
  ) values (
    actor, array['zvakes'], 'Paysera sandbox SQL test', 'Test cemetery', 'Test location',
    'accepted', 2500, now(), now() + interval '2 days', 'pending', 1
  ) returning id into test_fixture;
  req := public.begin_my_paysera_service_payment(test_fixture, actor, '123456', true);
  result := public.process_paysera_service_payment(req.payment_attempt_id, '123456', repeat('2',64), 'sandbox-test', 1, 2500, 'EUR', true);
  select * into retry from public.paslaugu_uzklausos where id = test_fixture;
  assert result = 'recorded' and retry.payment_status = 'cancelled' and retry.paid_at is null, 'sandbox must never fulfill';
  retry := public.begin_my_paysera_service_payment(test_fixture, actor, '123456', false);
  assert retry.payment_attempt_id <> req.payment_attempt_id and not retry.payment_test, 'completed sandbox can start a fresh live attempt';

  assert not has_function_privilege('anon', 'public.begin_my_paysera_service_payment(uuid,uuid,text,boolean)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.begin_my_paysera_service_payment(uuid,uuid,text,boolean)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.process_paysera_service_payment(uuid,text,text,text,integer,integer,text,boolean)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.process_paysera_service_payment(uuid,text,text,text,integer,integer,text,boolean)', 'EXECUTE');
  assert has_function_privilege('service_role', 'public.process_paysera_service_payment(uuid,text,text,text,integer,integer,text,boolean)', 'EXECUTE');
end;
$$;
select 'Paysera database assertions passed; fixtures rolled back' as result;
rollback;
