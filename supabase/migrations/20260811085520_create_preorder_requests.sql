begin;

create table if not exists public.preorder_requests (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  product_type text not null,
  product_name text not null,
  quantity smallint not null default 1,
  expected_price_cents bigint,
  currency text not null default 'EUR',
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  notes text,
  source_path text,
  status text not null default 'new',
  admin_note text,
  consent_at timestamptz not null,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint preorder_requests_product_type_check
    check (product_type in ('metal', 'asa')),
  constraint preorder_requests_quantity_check
    check (quantity between 1 and 10),
  constraint preorder_requests_price_check
    check (expected_price_cents is null or expected_price_cents >= 0),
  constraint preorder_requests_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint preorder_requests_name_check
    check (char_length(trim(customer_name)) between 2 and 160),
  constraint preorder_requests_email_check
    check (
      char_length(customer_email) between 3 and 254
      and customer_email = lower(trim(customer_email))
      and customer_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint preorder_requests_phone_check
    check (customer_phone is null or char_length(trim(customer_phone)) between 5 and 40),
  constraint preorder_requests_notes_check
    check (notes is null or char_length(notes) <= 2000),
  constraint preorder_requests_source_path_check
    check (source_path is null or char_length(source_path) <= 500),
  constraint preorder_requests_status_check
    check (status in ('new', 'contacted', 'confirmed', 'declined', 'closed')),
  constraint preorder_requests_admin_note_check
    check (admin_note is null or char_length(admin_note) <= 3000)
);

comment on table public.preorder_requests is
  'Neįpareigojantys QR lentelių išankstiniai užsakymai be mokėjimo.';
comment on column public.preorder_requests.expected_price_cents is
  'Pateikimo metu serveryje rasta produkto katalogo kaina; gali būti null.';

create index if not exists preorder_requests_created_at_idx
  on public.preorder_requests (created_at desc);
create index if not exists preorder_requests_email_created_at_idx
  on public.preorder_requests (customer_email, created_at desc);
create index if not exists preorder_requests_status_created_at_idx
  on public.preorder_requests (status, created_at desc);

alter table public.preorder_requests enable row level security;

revoke all on table public.preorder_requests
  from public, anon, authenticated, service_role;
grant select, update on table public.preorder_requests to authenticated;
grant select, insert, update on table public.preorder_requests to service_role;

drop policy if exists "Admin reads preorder requests"
  on public.preorder_requests;
create policy "Admin reads preorder requests"
  on public.preorder_requests for select to authenticated
  using (
    exists (
      select 1
      from public.user_roles as role
      where role.user_id = (select auth.uid())
        and role.role = 'admin'
    )
  );

drop policy if exists "Admin updates preorder requests"
  on public.preorder_requests;
create policy "Admin updates preorder requests"
  on public.preorder_requests for update to authenticated
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

commit;
