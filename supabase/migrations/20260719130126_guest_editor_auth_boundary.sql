-- Svečias puslapį ruošia tik vietiniame naršyklės juodraštyje.
-- Profilį į paskyrą prieš apmokėjimą įrašo tik prisijungęs jo savininkas.
revoke all privileges on table public.profiliai from anon;
grant select on table public.profiliai to anon;

revoke update, delete, truncate, references, trigger
  on table public.profiliai from authenticated;
grant select, insert on table public.profiliai to authenticated;

drop policy if exists "Viesas kurimas profiliu" on public.profiliai;
drop policy if exists "Prisijunges kuria savo privatu profili" on public.profiliai;
create policy "Prisijunges kuria savo privatu profili"
  on public.profiliai for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and coalesce(aktyvus, false) = false
    and apmoketa = false
    and deleted_at is null
  );
