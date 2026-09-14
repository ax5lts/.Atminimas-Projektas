-- Restrict access after a user verifies an MFA factor. Users without an
-- enrolled factor can still sign in and complete enrollment without lockout.
create or replace function private.session_mfa_satisfied()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()->>'aal') = 'aal2', false)
    or not exists (
      select 1 from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    );
$$;
revoke all on function private.session_mfa_satisfied() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.session_mfa_satisfied() to authenticated;

do $$
declare target record;
begin
  for target in
    select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and c.relrowsecurity
      and (n.nspname='public' or (n.nspname='storage' and c.relname='objects'))
  loop
    execute format('create policy enrolled_mfa_required on %I.%I as restrictive for all to authenticated using ((select private.session_mfa_satisfied())) with check ((select private.session_mfa_satisfied()))',target.nspname,target.relname);
  end loop;
end;
$$;

-- These two owner-checked RPCs bypass table RLS, so enforce MFA in their body.
do $$
declare target text; definition text;
begin
  foreach target in array array['public.accept_my_service_quote(uuid,integer)','public.decline_my_service_quote(uuid,integer)'] loop
    select pg_get_functiondef(target::regprocedure) into definition;
    if strpos(definition,'if caller is null or')=0 then raise exception 'Expected RPC guard not found: %',target; end if;
    execute replace(definition,'if caller is null or','if not private.session_mfa_satisfied() or caller is null or');
  end loop;
end;
$$;

create index if not exists grave_photo_submissions_reviewed_by_idx on public.grave_photo_submissions(reviewed_by);
create index if not exists paslaugu_uzklausos_quote_sent_by_idx on public.paslaugu_uzklausos(quote_sent_by);
create index if not exists service_quote_settings_updated_by_idx on public.service_quote_settings(updated_by);
