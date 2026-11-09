-- Administrators must verify MFA even before their first factor is enrolled.
-- Auth enrollment/challenge endpoints remain available at aal1.
create or replace function private.session_mfa_satisfied()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()->>'aal') = 'aal2', false)
    or (
      not exists (
        select 1 from public.user_roles
        where user_id = (select auth.uid()) and role = 'admin'
      )
      and not exists (
        select 1 from auth.mfa_factors
        where user_id = (select auth.uid()) and status = 'verified'
      )
    );
$$;
revoke all on function private.session_mfa_satisfied() from public, anon;
grant execute on function private.session_mfa_satisfied() to authenticated;

-- Self-only role discovery must work while enrolling MFA. The existing
-- permissive auth.uid() = user_id policy and SELECT-only grants stay in place.
drop policy if exists enrolled_mfa_required on public.user_roles;
