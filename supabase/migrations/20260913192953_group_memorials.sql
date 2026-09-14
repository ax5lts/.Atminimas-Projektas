-- Membership is written only by the authenticated profile-manage backend.
-- Existing RLS and publication controls continue to govern the root profile.
alter table public.profiliai add column if not exists group_members text[] not null default '{}';
alter table public.profiliai add constraint profile_group_size check (cardinality(group_members) <= 7);
comment on column public.profiliai.group_members is 'Ordered additional people shown through this memorial QR; private children remain private at their own URLs.';
