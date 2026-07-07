-- Užsakymai yra privatūs: juos mato tik profilio savininkas arba administratorius.
revoke select, insert on table public.uzsakymai from anon;
grant select, insert on table public.uzsakymai to authenticated;

drop policy if exists "Viesas uzsakymu kurimas" on public.uzsakymai;
create policy "Viesas uzsakymu kurimas"
  on public.uzsakymai for insert
  to authenticated
  with check (
    busena = 'sukurtas'
    and apmoketa = false
    and exists (
      select 1
      from public.profiliai p
      where p.id = profilis_id
        and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Viesas uzsakymu skaitymas pagal aktyvu profili" on public.uzsakymai;
create policy "Viesas uzsakymu skaitymas pagal aktyvu profili"
  on public.uzsakymai for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiliai p
      where p.id = uzsakymai.profilis_id
        and (
          p.owner_id = (select auth.uid())
          or exists (
            select 1
            from public.user_roles r
            where r.user_id = (select auth.uid())
              and r.role = 'admin'
          )
        )
    )
  );

-- Failus kelti gali tik prisijungę vartotojai.
revoke insert on table storage.objects from anon;
grant insert on table storage.objects to authenticated;

drop policy if exists "Viesas atminimas failu ikelimas" on storage.objects;
create policy "Viesas atminimas failu ikelimas"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'atminimas');
