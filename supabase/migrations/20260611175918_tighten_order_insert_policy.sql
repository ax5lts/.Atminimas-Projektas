drop policy if exists "Viesas uzsakymu kurimas" on public.uzsakymai;
create policy "Viesas uzsakymu kurimas"
  on public.uzsakymai for insert
  to anon, authenticated
  with check (
    busena = 'sukurtas'
    and apmoketa = false
    and exists (
      select 1
      from public.profiliai p
      where p.id = profilis_id
        and p.aktyvus = true
    )
  );
