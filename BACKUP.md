# Duomenų bazės atsarginė kopija prieš kapinių importą

Prieš taikydami `20260713210000_official_cemetery_import.sql`, Supabase Dashboard patikrinkite **Database → Backups**, ar yra nauja sėkminga kopija. Mokamame plane rekomenduojamas įjungtas PITR.

Papildomai su tiesioginiu DB prisijungimu sukurkite loginę kopiją (slaptažodžio nerašykite komandoje ar repozitorijoje):

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file "atminimas-before-cemetery-$(date +%F).dump"
```

Windows PowerShell:

```powershell
pg_dump $env:DATABASE_URL --format=custom --no-owner --no-acl --file "atminimas-before-cemetery.dump"
```

Patikrinkite kopiją: `pg_restore --list atminimas-before-cemetery.dump` turi baigtis be klaidos. Kopiją laikykite užšifruotoje, nuo projekto atskirtoje vietoje.

Atkūrimas į tuščią patikros DB:

```bash
createdb atminimas_restore_test
pg_restore --dbname atminimas_restore_test --clean --if-exists --no-owner atminimas-before-cemetery.dump
```

Migracija tik prideda lenteles, indeksus ir funkcijas; ji netrina esamų duomenų. Nesėkmės atveju pirmiausia sustabdykite importą, išsaugokite `import_runs`/`import_errors`, tada atkurkite visą DB per Supabase PITR arba `pg_restore`. Produkcinės DB neatkurkite nepatikrinę kopijos atskiroje DB.
