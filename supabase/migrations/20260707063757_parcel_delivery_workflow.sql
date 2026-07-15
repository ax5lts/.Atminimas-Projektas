-- Pristatymo į paštomatą duomenys ir valdymo funkcijos.
alter table public.uzsakymai
  add column if not exists delivery_method text not null default 'pastomatas',
  add column if not exists carrier text,
  add column if not exists city text,
  add column if not exists parcel_terminal text,
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists recipient_email text,
  add column if not exists shipping_status text not null default 'laukiama_duomenu',
  add column if not exists tracking_number text,
  add column if not exists shipment_created_at timestamptz,
  add column if not exists payment_provider text,
  add column if not exists payment_reference text;

create index if not exists uzsakymai_shipping_status_idx on public.uzsakymai (shipping_status);

create or replace function public.set_my_order_delivery(
  order_id uuid,
  p_carrier text,
  p_city text,
  p_parcel_terminal text,
  p_recipient_name text,
  p_recipient_phone text,
  p_recipient_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_carrier not in ('Omniva', 'LP Express', 'DPD') then raise exception 'Unsupported carrier'; end if;
  if char_length(trim(p_city)) not between 2 and 120 then raise exception 'Invalid city'; end if;
  if char_length(trim(p_parcel_terminal)) not between 3 and 240 then raise exception 'Invalid parcel terminal'; end if;
  if char_length(trim(p_recipient_name)) not between 2 and 160 then raise exception 'Invalid recipient'; end if;
  if char_length(trim(p_recipient_phone)) not between 6 and 40 then raise exception 'Invalid phone'; end if;
  if char_length(trim(p_recipient_email)) not between 3 and 254 or position('@' in p_recipient_email) = 0 then raise exception 'Invalid email'; end if;

  update public.uzsakymai u
  set delivery_method = 'pastomatas', carrier = trim(p_carrier), city = trim(p_city),
      parcel_terminal = trim(p_parcel_terminal), recipient_name = trim(p_recipient_name),
      recipient_phone = trim(p_recipient_phone), recipient_email = lower(trim(p_recipient_email)),
      shipping_status = 'paruošti'
  where u.id = order_id
    and exists (
      select 1 from public.profiliai p
      where p.id = u.profilis_id and p.owner_id = (select auth.uid())
    );
  if not found then raise exception 'Order not found or access denied'; end if;
end;
$$;

revoke all on function public.set_my_order_delivery(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.set_my_order_delivery(uuid, text, text, text, text, text, text) to authenticated;

create or replace function public.admin_update_shipment(
  order_id uuid,
  new_tracking_number text,
  new_shipping_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = 'admin'
  ) then raise exception 'Admin access required'; end if;
  if new_shipping_status not in ('laukiama_duomenu', 'paruošti', 'išsiųsta', 'pristatyta', 'atšaukta') then
    raise exception 'Invalid shipping status';
  end if;
  update public.uzsakymai
  set tracking_number = nullif(trim(new_tracking_number), ''),
      shipping_status = new_shipping_status,
      shipment_created_at = case when new_shipping_status = 'išsiųsta' then coalesce(shipment_created_at, now()) else shipment_created_at end
  where id = order_id;
  if not found then raise exception 'Order not found'; end if;
end;
$$;

revoke all on function public.admin_update_shipment(uuid, text, text) from public, anon;
grant execute on function public.admin_update_shipment(uuid, text, text) to authenticated;
