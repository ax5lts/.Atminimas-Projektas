-- Išsaugome ankstesnėje harden_update_rpcs migracijoje numatytas
-- autentifikuoto savininko ir administratoriaus stulpelių teises.
grant update (aktyvus, statusas, apmoketa)
  on table public.profiliai to authenticated;
