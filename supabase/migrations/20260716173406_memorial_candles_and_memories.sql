-- Viešos atminimo puslapio žvakės ir moderuojami prisiminimai.
-- Vieši lankytojai lentelių tiesiogiai nepasiekia: įrašus priima ir skaito
-- tik `memorial-engagement` Edge Function, naudojanti service role.

create table if not exists public.memorial_candles (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references public.profiliai (id) on delete cascade,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.memorial_memories (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references public.profiliai (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 2 and 80),
  message text not null check (char_length(message) between 10 and 800),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  moderated_at timestamptz,
  moderated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists memorial_candles_profile_created_idx
  on public.memorial_candles (profile_id, created_at desc);
create index if not exists memorial_candles_visitor_profile_created_idx
  on public.memorial_candles (visitor_hash, profile_id, created_at desc);
create index if not exists memorial_memories_profile_status_created_idx
  on public.memorial_memories (profile_id, status, created_at desc);
create index if not exists memorial_memories_visitor_profile_created_idx
  on public.memorial_memories (visitor_hash, profile_id, created_at desc);
create index if not exists memorial_memories_moderated_by_idx
  on public.memorial_memories (moderated_by)
  where moderated_by is not null;

alter table public.memorial_candles enable row level security;
alter table public.memorial_memories enable row level security;

revoke all on table public.memorial_candles, public.memorial_memories
  from public, anon, authenticated;
grant select on table public.memorial_candles to authenticated;
grant select, update on table public.memorial_memories to authenticated;
grant select, insert on table public.memorial_candles, public.memorial_memories to service_role;

drop policy if exists "Admin reads memorial candles" on public.memorial_candles;
create policy "Admin reads memorial candles"
  on public.memorial_candles for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles as role
      where role.user_id = (select auth.uid())
        and role.role = 'admin'
    )
  );

drop policy if exists "Admin reads memorial memories" on public.memorial_memories;
create policy "Admin reads memorial memories"
  on public.memorial_memories for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles as role
      where role.user_id = (select auth.uid())
        and role.role = 'admin'
    )
  );

drop policy if exists "Admin moderates memorial memories" on public.memorial_memories;
create policy "Admin moderates memorial memories"
  on public.memorial_memories for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles as role
      where role.user_id = (select auth.uid())
        and role.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.user_roles as role
      where role.user_id = (select auth.uid())
        and role.role = 'admin'
    )
  );
