begin;
set local statement_timeout='15s';
set local request.jwt.claims='{"role":"service_role"}';
do $$
declare actor uuid;
declare fixture uuid;
declare project uuid:=gen_random_uuid();
declare provider_order uuid:=gen_random_uuid();
declare payload jsonb;
declare attempt uuid;
declare claim uuid;
declare denied boolean;
declare result text;
declare req public.paslaugu_uzklausos%rowtype;
declare count_before integer;
declare sandbox_attempt uuid;
declare sandbox_order uuid;
declare saved_service jsonb;
begin
  select id into actor from auth.users limit 1;
  insert into public.paslaugu_uzklausos(owner_id,paslaugos,mirusiojo_vardas,kapiniu_pavadinimas,kapo_vieta,
    quote_status,quote_amount_cents,quote_sent_at,quote_expires_at,quote_accepted_at,payment_status,quote_revision)
  values(actor,array['zvakes'],'Modern checkout test','Test cemetery','Test location','accepted',2500,
    now(),now()+interval '2 days',now(),'pending',1) returning id into fixture;
  denied:=false;
  begin perform public.begin_my_paysera_modern_payment(fixture,gen_random_uuid(),project);
    exception when others then denied:=true; end;
  assert denied,'another owner cannot pay';
  update public.paslaugu_uzklausos set quote_status='sent' where id=fixture;
  denied:=false;
  begin perform public.begin_my_paysera_modern_payment(fixture,actor,project);
    exception when others then denied:=true; end;
  assert denied,'quote must be accepted';
  update public.paslaugu_uzklausos set quote_status='accepted',quote_expires_at=now()-interval '1 hour' where id=fixture;
  denied:=false;
  begin perform public.begin_my_paysera_modern_payment(fixture,actor,project);
    exception when others then denied:=true; end;
  assert denied,'quote must not be expired';
  update public.paslaugu_uzklausos set quote_expires_at=now()+interval '2 days' where id=fixture;
  payload:=public.begin_my_paysera_modern_payment(fixture,actor,project);
  attempt:=(payload->'service'->>'payment_attempt_id')::uuid;
  claim:=(payload->>'claim_token')::uuid;
  assert claim is not null and attempt is not null;
  payload:=public.begin_my_paysera_modern_payment(fixture,actor,project);
  assert payload->>'claim_token' is null,'concurrent request must not create another order';
  assert (payload->'service'->>'payment_attempt_id')::uuid=attempt;
  denied:=false;
  begin perform public.fail_paysera_modern_creation(attempt,claim,500);
    exception when others then denied:=true; end;
  assert denied,'ambiguous failures must retain the claim';
  payload:=public.begin_my_paysera_modern_payment(fixture,actor,project);
  assert payload->>'claim_token' is null;
  perform public.fail_paysera_modern_creation(attempt,claim,400);
  select * into req from public.paslaugu_uzklausos where id=fixture;
  assert req.payment_status='failed' and req.payment_create_token is null,'definite rejection must release claim';
  payload:=public.begin_my_paysera_modern_payment(fixture,actor,project);
  assert (payload->'service'->>'payment_attempt_id')::uuid<>attempt,'definitively rejected order can restart';
  attempt:=(payload->'service'->>'payment_attempt_id')::uuid;
  claim:=(payload->>'claim_token')::uuid;
  denied:=false;
  begin perform public.attach_paysera_modern_order(attempt,gen_random_uuid(),provider_order,project,2500,'EUR');
    exception when others then denied:=true; end;
  assert denied,'wrong creation token must fail';
  denied:=false;
  begin perform public.attach_paysera_modern_order(attempt,claim,provider_order,project,2400,'EUR');
    exception when others then denied:=true; end;
  assert denied,'response amount binding required';
  perform public.attach_paysera_modern_order(attempt,claim,provider_order,project,2500,'EUR');
  perform public.fail_paysera_modern_creation(attempt,claim,422);
  payload:=public.begin_my_paysera_modern_payment(fixture,actor,project);
  assert (payload->'service'->>'payment_attempt_id')::uuid=attempt and payload->'service'->>'payment_session_id'=provider_order::text;
  assert payload->>'claim_token' is not null,'link-only retry retains provider order';
  claim:=(payload->>'claim_token')::uuid;
  denied:=false;
  begin perform public.attach_paysera_modern_link(attempt,claim,provider_order,gen_random_uuid(),'https://evil.test/',now()+interval '30 minutes');
    exception when others then denied:=true; end;
  assert denied,'unsafe redirect must fail';
  perform public.attach_paysera_modern_link(attempt,claim,provider_order,gen_random_uuid(),
    'https://api.paysera.com/checkout-payment-link/payment-collection/v1/payment-links/testlink',now()+interval '30 minutes');
  payload:=public.begin_my_paysera_modern_payment(fixture,actor,project);
  assert payload->>'claim_token' is null and payload->'service'->>'payment_checkout_url' is not null;
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat('a',64),'paid',2400,2500,'EUR',false);
  assert result='rejected_quote_or_amount';
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat('b',64),'paid',2500,2500,'USD',false);
  assert result='rejected_quote_or_amount';
  result:=public.process_paysera_modern_payment(attempt,gen_random_uuid(),project,repeat('c',64),'paid',2500,2500,'EUR',false);
  assert result='rejected_quote_or_amount';
  result:=public.process_paysera_modern_payment(attempt,provider_order,gen_random_uuid(),repeat('d',64),'paid',2500,2500,'EUR',false);
  assert result='rejected_quote_or_amount';
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat('e',64),'paid',2500,1500,'EUR',false);
  assert result='recorded','partial funds must not mark paid';
  select * into req from public.paslaugu_uzklausos where id=fixture;
  assert req.payment_status='processing';
  update public.paslaugu_uzklausos set payment_session_expires_at=now()-interval '1 hour' where id=fixture;
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat('f',64),'paid',2500,2500,'EUR',false);
  assert result='accepted','delayed confirmed payment must be accepted';
  select * into req from public.paslaugu_uzklausos where id=fixture;
  assert req.payment_status='paid' and req.paid_at is not null and not req.payment_test;
  select count(*) into count_before from public.service_payment_events where request_id=fixture;
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat('f',64),'paid',2500,2500,'EUR',false);
  assert result='accepted' and count_before=(select count(*) from public.service_payment_events where request_id=fixture);
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat('1',64),'pending_payment',2500,0,'EUR',false);
  select * into req from public.paslaugu_uzklausos where id=fixture;
  assert req.payment_status='paid','late pending event must not undo payment';

  insert into public.paslaugu_uzklausos(owner_id,paslaugos,mirusiojo_vardas,kapiniu_pavadinimas,kapo_vieta,
    quote_status,quote_amount_cents,quote_sent_at,quote_expires_at,payment_status,quote_revision)
  values(actor,array['zvakes'],'Modern sandbox test','Test cemetery','Test location','accepted',2500,
    now(),now()+interval '2 days','pending',1) returning id into fixture;
  payload:=public.begin_my_paysera_modern_payment(fixture,actor,project);
  attempt:=(payload->'service'->>'payment_attempt_id')::uuid;
  claim:=(payload->>'claim_token')::uuid;
  provider_order:=gen_random_uuid();
  perform public.attach_paysera_modern_order(attempt,claim,provider_order,project,2500,'EUR');
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat('2',64),'paid',2500,2500,'EUR',true);
  select * into req from public.paslaugu_uzklausos where id=fixture;
  assert result='recorded' and req.payment_status='cancelled' and req.paid_at is null and req.payment_test;
  sandbox_attempt:=attempt;
  sandbox_order:=provider_order;
  saved_service:=to_jsonb(req);
  assert exists(select 1 from public.service_payment_events e where e.request_id=fixture
    and e.provider_event_id=repeat('2',64) and e.payload->>'project_id'=project::text),
    'successful test evidence must preserve its project for later attempts';

  -- Reproduce the deployed bug: a second callback was rejected after the first
  -- test success closed the attempt. The old payload did not store project_id.
  update public.service_payment_events e set payload=e.payload-'project_id'
    where e.request_id=fixture and e.provider_event_id=repeat('2',64);
  insert into public.service_payment_events(request_id,provider,provider_event_id,provider_payment_id,
    payment_attempt_id,quote_revision,event_type,status,amount_cents,currency,payload)
  values(fixture,'paysera_modern',repeat('3',64),provider_order::text,attempt,1,'order.paid',
    'rejected_quote_or_amount',2500,'EUR',jsonb_build_object('status','paid','test',true,'amount',2500));
  select count(*) into count_before from public.service_payment_events where request_id=fixture;
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat('3',64),'paid',2500,2500,'EUR',true);
  assert result='recorded','retry must recover the exact previously rejected sandbox callback';
  assert count_before=(select count(*) from public.service_payment_events where request_id=fixture);
  assert exists(select 1 from public.service_payment_events e where e.request_id=fixture
    and e.provider_event_id=repeat('3',64) and e.status='recorded' and e.payload->>'project_id'=project::text);
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat('3',64),'paid',2500,2500,'EUR',true);
  assert result='recorded' and count_before=(select count(*) from public.service_payment_events where request_id=fixture),
    'retry of a repaired callback must remain idempotent';
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat('4',64),'paid',2500,2500,'EUR',true);
  assert result='recorded','distinct order/payment callbacks must acknowledge a completed sandbox';
  assert (select to_jsonb(p) from public.paslaugu_uzklausos p where id=fixture)=saved_service,
    'closed sandbox callbacks must not update the service or its timestamps';

  result:=public.process_paysera_modern_payment(attempt,provider_order,gen_random_uuid(),repeat('5',64),'paid',2500,2500,'EUR',true);
  assert result='rejected_quote_or_amount','closed sandbox still requires the original project';
  result:=public.process_paysera_modern_payment(attempt,gen_random_uuid(),project,repeat('6',64),'paid',2500,2500,'EUR',true);
  assert result='rejected_quote_or_amount','closed sandbox still requires the original provider order';
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat('7',64),'paid',2400,2500,'EUR',true);
  assert result='rejected_quote_or_amount','closed sandbox still requires the original quote amount';
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat('8',64),'paid',2500,2500,'USD',true);
  assert result='rejected_quote_or_amount','closed sandbox still requires the original currency';
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat('9',64),'paid',2500,2500,'EUR',false);
  assert result='rejected_quote_or_amount','a sandbox order must never become a live payment';
  -- A rejected event with different stored data must not be repaired merely
  -- because another callback supplies correct parameters with its event id.
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat('7',64),'paid',2500,2500,'EUR',true);
  assert result='rejected_quote_or_amount','repair requires the exact stored callback data';
  assert (select to_jsonb(p) from public.paslaugu_uzklausos p where id=fixture)=saved_service;

  -- A new quote and attempt replace the current payment fields. Delayed test
  -- callbacks must use historical evidence and never modify the new attempt.
  update public.paslaugu_uzklausos set quote_amount_cents=3000,quote_revision=2 where id=fixture;
  payload:=public.begin_my_paysera_modern_payment(fixture,actor,project);
  attempt:=(payload->'service'->>'payment_attempt_id')::uuid;
  claim:=(payload->>'claim_token')::uuid;
  provider_order:=gen_random_uuid();
  assert attempt<>sandbox_attempt;
  perform public.attach_paysera_modern_order(attempt,claim,provider_order,project,3000,'EUR');
  select to_jsonb(p) into saved_service from public.paslaugu_uzklausos p where id=fixture;
  result:=public.process_paysera_modern_payment(sandbox_attempt,sandbox_order,project,repeat(md5('historic-test'),2),'paid',2500,2500,'EUR',true);
  assert result='recorded','a delayed test callback after a new attempt must be acknowledged';
  assert exists(select 1 from public.service_payment_events e where e.request_id=fixture
    and e.provider_event_id=repeat(md5('historic-test'),2) and e.quote_revision=1 and e.payload->>'amount'='2500');
  assert (select to_jsonb(p) from public.paslaugu_uzklausos p where id=fixture)=saved_service,
    'old test callback must leave the entire new attempt unchanged';
  result:=public.process_paysera_modern_payment(sandbox_attempt,sandbox_order,gen_random_uuid(),repeat(md5('historic-project'),2),'paid',2500,2500,'EUR',true);
  assert result='not_found','historical acknowledgement requires persisted original project evidence';
  result:=public.process_paysera_modern_payment(sandbox_attempt,gen_random_uuid(),project,repeat(md5('historic-order'),2),'paid',2500,2500,'EUR',true);
  assert result='not_found';
  result:=public.process_paysera_modern_payment(sandbox_attempt,sandbox_order,project,repeat(md5('historic-amount'),2),'paid',3000,3000,'EUR',true);
  assert result='not_found','current quote amount cannot substitute for the historical amount';
  result:=public.process_paysera_modern_payment(sandbox_attempt,sandbox_order,project,repeat(md5('historic-currency'),2),'paid',2500,2500,'USD',true);
  assert result='not_found';
  result:=public.process_paysera_modern_payment(sandbox_attempt,sandbox_order,project,repeat(md5('historic-live'),2),'paid',2500,2500,'EUR',false);
  assert result='not_found','historical test evidence must never authorize a live payment';
  assert (select to_jsonb(p) from public.paslaugu_uzklausos p where id=fixture)=saved_service;
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat(md5('new-live-paid'),2),'paid',3000,3000,'EUR',false);
  assert result='accepted','the new live attempt still settles normally';
  select to_jsonb(p) into saved_service from public.paslaugu_uzklausos p where id=fixture;
  result:=public.process_paysera_modern_payment(sandbox_attempt,sandbox_order,project,repeat(md5('historic-after-paid'),2),'paid',2500,2500,'EUR',true);
  assert result='recorded' and (select to_jsonb(p) from public.paslaugu_uzklausos p where id=fixture)=saved_service,
    'old test callback must not cancel or alter a completed live payment';
  update public.service_payment_events e set payload=e.payload-'project_id'
    where e.request_id=fixture and e.payment_attempt_id=sandbox_attempt;
  result:=public.process_paysera_modern_payment(sandbox_attempt,sandbox_order,project,repeat(md5('historic-no-project'),2),'paid',2500,2500,'EUR',true);
  assert result='not_found','legacy events cannot prove historical project binding after replacement';

  insert into public.paslaugu_uzklausos(owner_id,paslaugos,mirusiojo_vardas,kapiniu_pavadinimas,kapo_vieta,
    quote_status,quote_amount_cents,quote_sent_at,quote_expires_at,payment_status,quote_revision)
  values(actor,array['zvakes'],'Unproven sandbox test','Test cemetery','Test location','accepted',2500,
    now(),now()+interval '2 days','pending',1) returning id into fixture;
  payload:=public.begin_my_paysera_modern_payment(fixture,actor,project);
  attempt:=(payload->'service'->>'payment_attempt_id')::uuid;
  claim:=(payload->>'claim_token')::uuid;
  provider_order:=gen_random_uuid();
  perform public.attach_paysera_modern_order(attempt,claim,provider_order,project,2500,'EUR');
  update public.paslaugu_uzklausos set payment_status='cancelled',payment_test=true where id=fixture;
  result:=public.process_paysera_modern_payment(attempt,provider_order,project,repeat(md5('unproven-test'),2),'paid',2500,2500,'EUR',true);
  assert result='rejected_quote_or_amount','cancelled test status alone is not proof of completed payment';
  assert not has_function_privilege('anon','public.get_paysera_checkout_credentials()','EXECUTE');
  assert not has_function_privilege('authenticated','public.get_paysera_checkout_credentials()','EXECUTE');
  assert not has_function_privilege('anon','private.read_paysera_checkout_credentials()','EXECUTE');
  assert not has_function_privilege('authenticated','private.read_paysera_checkout_credentials()','EXECUTE');
  assert has_function_privilege('service_role','public.get_paysera_checkout_credentials()','EXECUTE');
  assert not has_function_privilege('authenticated','public.begin_my_paysera_modern_payment(uuid,uuid,uuid)','EXECUTE');
  assert not has_function_privilege('anon','public.process_paysera_modern_payment(uuid,uuid,uuid,text,text,integer,integer,text,boolean)','EXECUTE');
  assert not has_function_privilege('authenticated','public.process_paysera_modern_payment(uuid,uuid,uuid,text,text,integer,integer,text,boolean)','EXECUTE');
end;
$$;
select 'Modern checkout database assertions passed; fixtures rolled back' as result;
rollback;
