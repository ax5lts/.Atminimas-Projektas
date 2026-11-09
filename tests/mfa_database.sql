begin;
do $$
declare test_user uuid; test_admin uuid; test_factor uuid:=gen_random_uuid();
begin
  select id into test_user from auth.users u where not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified') and not exists(select 1 from public.user_roles r where r.user_id=u.id and r.role='admin') limit 1;
  if test_user is null then raise exception 'Test needs a user without MFA'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',test_user,'aal','aal1')::text,true);
  perform set_config('request.jwt.claim.sub',test_user::text,true);
  if not private.session_mfa_satisfied() then raise exception 'Enrollment access blocked'; end if;
  insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)
    values(test_factor,test_user,'Transactional MFA regression','totp','unverified',now(),now());
  if not private.session_mfa_satisfied() then raise exception 'Unverified factor locked out user'; end if;
  update auth.mfa_factors set status='verified' where id=test_factor;
  if private.session_mfa_satisfied() then raise exception 'Verified factor did not block aal1'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',test_user,'aal','aal2')::text,true);
  if not private.session_mfa_satisfied() then raise exception 'aal2 session blocked'; end if;
  select r.user_id into test_admin from public.user_roles r where r.role='admin' limit 1;
  if test_admin is null then raise exception 'Test needs an administrator'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',test_admin,'aal','aal1')::text,true);
  perform set_config('request.jwt.claim.sub',test_admin::text,true);
  if private.session_mfa_satisfied() then raise exception 'Administrator without aal2 was allowed'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',test_admin,'aal','aal2')::text,true);
  if not private.session_mfa_satisfied() then raise exception 'Verified administrator was denied'; end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='user_roles' and policyname='enrolled_mfa_required') then raise exception 'Self role discovery blocked during enrollment'; end if;
  if exists(select 1 from pg_policies where policyname='enrolled_mfa_required' and permissive<>'RESTRICTIVE') then raise exception 'MFA policy is not restrictive'; end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='enrolled_mfa_required') then raise exception 'Storage MFA policy missing'; end if;
end;
$$;
rollback;
