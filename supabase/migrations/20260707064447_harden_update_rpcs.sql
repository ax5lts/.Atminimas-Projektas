-- Apsaugoti profilių ir užsakymų atnaujinimai.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare is_admin boolean;
begin
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = 'admin'
  ) into is_admin;
  if is_admin then return new; end if;
  if (to_jsonb(new) - 'aktyvus') is distinct from (to_jsonb(old) - 'aktyvus') then
    raise exception 'Profile owner may only change visibility';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_profile_update() from public, anon, authenticated;

drop trigger if exists guard_profile_update on public.profiliai;
create trigger guard_profile_update
before update on public.profiliai
for each row execute function private.guard_profile_update();

revoke update on public.profiliai from authenticated;
grant update (aktyvus, statusas, apmoketa) on public.profiliai to authenticated;

drop policy if exists "Savininkas keicia profilio viesuma" on public.profiliai;
create policy "Savininkas keicia profilio viesuma" on public.profiliai
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

alter function public.set_my_profile_visibility(text, boolean) security invoker;

create or replace function private.guard_order_update()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare is_admin boolean;
begin
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = 'admin'
  ) into is_admin;
  if is_admin then return new; end if;
  if old.shipping_status not in ('laukiama_duomenu', 'paruošti') then
    raise exception 'Shipment can no longer be edited by the customer';
  end if;
  if new.shipping_status <> 'paruošti' then
    raise exception 'Invalid customer shipping status';
  end if;
  if (to_jsonb(new) - array[
      'delivery_method','carrier','city','parcel_terminal','recipient_name',
      'recipient_phone','recipient_email','shipping_status'
    ]) is distinct from (to_jsonb(old) - array[
      'delivery_method','carrier','city','parcel_terminal','recipient_name',
      'recipient_phone','recipient_email','shipping_status'
    ]) then
    raise exception 'Customer may only change delivery details';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_order_update() from public, anon, authenticated;

drop trigger if exists guard_order_update on public.uzsakymai;
create trigger guard_order_update
before update on public.uzsakymai
for each row execute function private.guard_order_update();

revoke update on public.uzsakymai from authenticated;
grant update (
  delivery_method, carrier, city, parcel_terminal, recipient_name, recipient_phone,
  recipient_email, shipping_status, tracking_number, shipment_created_at
) on public.uzsakymai to authenticated;

drop policy if exists "Savininkas ir admin atnaujina uzsakyma" on public.uzsakymai;
create policy "Savininkas ir admin atnaujina uzsakyma" on public.uzsakymai
for update to authenticated
using (
  exists (
    select 1 from public.profiliai p
    where p.id = uzsakymai.profilis_id
      and (
        p.owner_id = (select auth.uid())
        or exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin')
      )
  )
)
with check (
  exists (
    select 1 from public.profiliai p
    where p.id = uzsakymai.profilis_id
      and (
        p.owner_id = (select auth.uid())
        or exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin')
      )
  )
);

alter function public.set_my_order_delivery(uuid, text, text, text, text, text, text) security invoker;
alter function public.admin_update_shipment(uuid, text, text) security invoker;

drop policy if exists "Admin valdo sutarties atsisakymus" on public.atsisakymai;
create policy "Admin skaito sutarties atsisakymus" on public.atsisakymai
for select to authenticated
using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));
create policy "Admin atnaujina sutarties atsisakymus" on public.atsisakymai
for update to authenticated
using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'))
with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));

drop policy if exists "Admin valdo turinio pranesimus" on public.turinio_pranesimai;
create policy "Admin skaito turinio pranesimus" on public.turinio_pranesimai
for select to authenticated
using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));
create policy "Admin atnaujina turinio pranesimus" on public.turinio_pranesimai
for update to authenticated
using (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'))
with check (exists (select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = 'admin'));
