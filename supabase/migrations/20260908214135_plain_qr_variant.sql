begin;
-- Keep the old star value readable for history, but accept plain QR for new orders.
alter table public.uzsakymai drop constraint uzsakymai_product_pattern_check;
alter table public.uzsakymai add constraint uzsakymai_product_pattern_check
  check (product_pattern in ('tree','heart','wings','star','plain'));
create or replace function public.create_designed_product_order(
  p_profile_id text, p_actor_id uuid, p_product_type text, p_page_url text, p_qr_url text,
  p_product_color text, p_product_pattern text
) returns public.uzsakymai language plpgsql security invoker set search_path=public as $$
declare ord public.uzsakymai%rowtype;
begin
  if p_actor_id is null or p_product_type is distinct from 'metal'
    or p_product_color is null or p_product_color not in ('gold','silver','black')
    or p_product_pattern is null or p_product_pattern not in ('tree','heart','wings','plain')
    then raise exception 'Invalid product design'; end if;
  perform 1 from public.profiliai where id=p_profile_id and owner_id=p_actor_id and deleted_at is null for update;
  if not found then raise exception 'Profile not found'; end if;
  perform 1 from public.product_catalog where id=p_product_type and enabled and price_cents>0;
  if not found then raise exception 'Product unavailable'; end if;
  select * into ord from public.uzsakymai where profilis_id=p_profile_id and product_type=p_product_type
    and product_color=p_product_color and product_pattern=p_product_pattern
    and not apmoketa and fulfillment_status<>'cancelled' order by created_at desc limit 1;
  if ord.id is not null then return ord; end if;
  insert into public.uzsakymai(profilis_id,product_type,puslapio_url,qr_kodas_url,product_color,product_pattern)
    values(p_profile_id,p_product_type,p_page_url,p_qr_url,p_product_color,p_product_pattern) returning * into ord;
  return ord;
end; $$;
revoke all on function public.create_designed_product_order(text,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_designed_product_order(text,uuid,text,text,text,text,text) to service_role;

commit;
