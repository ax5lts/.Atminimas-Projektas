# Serverio dalies žemėlapis

Šis dokumentas padeda rasti keičiamą kodą ir jo prieigos ribas. Diegimo veiksmus žiūrėkite [DEPLOYMENT.md](../DEPLOYMENT.md), saugumo principus – [SECURITY.md](../SECURITY.md), paskutinio patikrinto leidimo būseną – [2026-11-09 saugumo ataskaitoje](../SECURITY_FIXES_2026-11-09.md). Šaltinio failas savaime nepatvirtina, kad ta pati versija jau veikia produkcijoje.

## Kur kas yra

| Vieta | Paskirtis |
| --- | --- |
| [`supabase/functions/`](../supabase/functions/) | Deno Edge Functions; kiekvienos funkcijos pradinis failas – `<pavadinimas>/index.ts` |
| [`supabase/functions/_shared/core.ts`](../supabase/functions/_shared/core.ts) | Klientų kūrimas, `requireUser`, `sessionNeedsMfa`, JSON atsakymai, dydžio ribos, turinio normalizavimas |
| [`_shared/mfa.ts`](../supabase/functions/_shared/mfa.ts), [`_shared/request-ip.ts`](../supabase/functions/_shared/request-ip.ts) | Patikrintos sesijos MFA reikalavimas ir patikimo įėjimo IP normalizavimas |
| [`_shared/paysera-products.ts`](../supabase/functions/_shared/paysera-products.ts), [`_shared/paysera-modern.ts`](../supabase/functions/_shared/paysera-modern.ts), [`_shared/paysera.ts`](../supabase/functions/_shared/paysera.ts) | QR užsakymų mokėjimas, Modern integracija ir ankstesnių Paysera pranešimų tikrinimas |
| [`_shared/shipping.ts`](../supabase/functions/_shared/shipping.ts), [`_shared/email.ts`](../supabase/functions/_shared/email.ts) | Siuntų ir el. laiškų adapteriai; iškvietimai gali turėti tikrą išorinį poveikį |
| [`supabase/schema.sql`](../supabase/schema.sql), [`supabase/migrations/`](../supabase/migrations/) | Pradinis karkasas ir nuoseklūs DB pakeitimai; galiojančias teises lemia visas migracijų rezultatas |
| [`supabase/config.toml`](../supabase/config.toml) | Vietinio Supabase ir deklaruojami funkcijų gateway nustatymai; produkcijos nustatymus tikrinkite atskirai |
| [`assets/atminimas-duomenys.js`](../assets/atminimas-duomenys.js), [`assets/auth.js`](../assets/auth.js) | Naršyklės duomenų adapteris, tiesioginės Data API / Storage užklausos ir Auth sesija |

Produkcijos frontend yra statinis Vercel leidimas. [`app.py`](../app.py) ir [`serve.py`](../serve.py) nėra produkcinio Supabase backend pakaitalas. `scripts/build.mjs` surenka viešą `dist/` ir nekopijuoja DB ar Edge šaltinių.

## Edge užklausų žemėlapis

Žemiau aprašytas vietinio kodo elgesys. API adresas yra `<SUPABASE_URL>/functions/v1/<pavadinimas>`. `OPTIONS` daugelyje funkcijų tvarkomas atskirai.

| Vieša funkcija / veiksmas | Metodas | Ką tikrina arba grąžina |
| --- | --- | --- |
| `profile-content` | GET, POST | Paskelbtą atminimo turinį ir trumpalaikes failų nuorodas; POST tikrina prieigos kodą. Savininko / administratoriaus išimtis reikalauja patikrintos sesijos ir MFA |
| `memorial-engagement` | GET, POST | Žvakes ir patvirtintus prisiminimus; pateikimams taiko atominį ribojimą. Apsaugotų puslapių viešą bendruomenės prieigą atmeta |
| `cemetery-search` | POST | Ribotą paiešką per nustatytus `get.data.gov.lt` ir Cemety šaltinius |
| `grave-photo` | GET, HEAD | Paskelbtos kapavietės arba patvirtintos pateiktos nuotraukos turinį. `review_id` atvejis skirtas tik administratoriui |
| `qr-code` | GET | QR vaizdą leistinam svetainės adresui; tikslą tikrina serveris |
| `parcel-lockers` | GET | Pristatymo terminalų sąrašą |
| `business-profile` | GET | Tik aiškiai parinktus viešus rekvizitų laukus, ne visą `business_profile` eilutę |
| `legal-submission` | POST | Sutarties atsisakymą / turinio pranešimą per įvesties ir dažnio patikrą |
| `service-flow`: `estimate`, `create` | POST | Paslaugos įvertį ir užklausos pateikimą; galutinę kainą nustato pasiūlymo eiga |
| `preorder` | POST | Ankstesnis išankstinio užsakymo adresas; dabartinis kodas grąžina `410` ir nukreipia į parduotuvės eigą |

| Prisijungusio naudotojo funkcija / veiksmas | Prieigos riba |
| --- | --- |
| `profile-manage` | `requireUser`, tada savininko / administratoriaus patikros pagal veiksmą. Savininko veiksmai apima `update`, `delete`, `set_access_code`, `create_order`; `set_group_members` taip pat tikrina bendrą grupės narių savininką |
| `payment-create` | `startProductPayment` tikrina sesiją, paskyrą ir konkretų užsakymą; kainą / mokėjimo bandymą parenka serverio RPC, ne naršyklė |
| `document-download` | Užsakymo savininkas arba administratorius; gamybos QR – tik administratoriui. `automation-documents` nuoroda pasirašoma 120 sekundžių |
| `service-flow`: `claim`, `start_payment` | Patikrinta sesija. `claim` reikalauja to paties patvirtinto el. pašto ir dar nepriskirtos užklausos; mokėjimas tikrinamas pagal savininką ir pasiūlymo būseną |

| Administratoriaus veiksmai | Patikra |
| --- | --- |
| `shipping-create`, `production-email`, `ops-assistant` | `requireUser`, DB rolė `admin` ir MFA; gali kurti siuntą, siųsti laišką arba skaityti veiklos suvestinę |
| `profile-manage`: `delete_order`, `publish_prototype` | Papildomos administratoriaus ir būsenos patikros; prototipą skelbia jo savininkas administratorius |
| `service-flow`: `get_settings`, `save_settings`, `send_quote` | Vietinis `requireAdmin`, kuris remiasi bendru `requireUser` ir DB role |
| `grave-photo?review_id=...` | Auth `/user` patikra, administratoriaus MFA ir rolė; leidžia peržiūrėti dar neviešą nuotrauką |

| Automatika / webhook | Tapatybės patikra |
| --- | --- |
| `automation-worker` | `authorizeOrderWorker`: `x-automation-secret`, ankstesnis `AUTOMATION_SECRET` arba Vault paslaptį tikrinantis `automation_worker_authorized` RPC |
| `automation-reminders`, `shipping-sync` | `requireAutomationSecret`; tai serverio užduotys, ne interaktyvus administratoriaus prisijungimas |
| `paysera-webhook` | Paysera parašas ir konkretus mokėjimo bandymas, projektas, suma, valiuta bei testinė / tikra aplinka; būseną užbaigia transakcinis RPC |
| `payment-webhook` | Ankstesnių Stripe įvykių parašas, laiko langas ir mokėjimo atitiktis užsakymui / pasiūlymui |

Produkcijos inventoriuje gali būti papildomų funkcijų, kurių vietinio `index.ts` nėra: `help-chatbot`, `ops-monitor`, `resend-webhook`, `email-test`. Jų būseną ir šaltinį prieš pakeitimus nuskaitykite per prijungtą Supabase. Paskutinio saugumo leidimo metu `email-test` grąžintas į išjungtą `410` realizaciją. Nekurkite jo naujai vien pagal seną diagnostikos pokalbį.

## Auth, rolės ir RLS

Naršyklė naudoja viešą projekto raktą. `adminClient()` naudoja serverinį `service_role`, kuris apeina RLS: todėl Edge funkcijos privalo pačios patikrinti naudotoją, savininką, rolę ir operacijos būseną prieš privilegijuotą skaitymą ar rašymą. Vien kliento perduotas `owner_id`, HTTP CORS arba gateway `verify_jwt` nėra leidimas keisti konkretų įrašą.

`requireUser` pirmiausia kviečia `auth.getUser(token)`, tada `sessionNeedsMfa` nuskaito tikrą rolę iš `public.user_roles`. `_shared/mfa.ts` vertina jau patikrinto tokeno `aal`. Administratoriui būtina `aal2` ir prieš užregistruojant pirmą faktorių; kitam naudotojui – kai yra patvirtintas faktorius. Rolės neimamos iš redaguojamo `user_metadata`.

DB atitikmuo – `private.session_mfa_satisfied()` ir ribojanti RLS politika `enrolled_mfa_required`. Pradinė MFA migracija sukūrė politiką tuo metu egzistavusioms RLS lentelėms; kuriant naują lentelę jos automatinio atsiradimo nėra. Jautriam naujam API objektui patikrinkite ir GRANT, ir RLS, ir MFA. Naršyklei leidžiami `SECURITY DEFINER` pasiūlymo RPC `accept_my_service_quote` / `decline_my_service_quote` tikrina tą pačią MFA sąlygą bei savininką savo viduje.

`user_roles` išimtis leidžia su `aal1` perskaityti tik savo rolę per politiką `User gali matyti savo role`, kad veiktų nukreipimas į `saugumas.html`. Naršyklei nesuteikiamas rolių rašymas ar svetimų rolių skaitymas. Auth faktoriaus registravimo ir patvirtinimo API lieka prieinamas prieš `aal2`; tikri paskyrų valdytojai faktorius prijungia patys.

Svarbūs DB duomenų blokai:

| Lentelės / schema | Paskirtis ir prieigos riba |
| --- | --- |
| `profiliai`, istorinė `medijos` | Profilis pagal nutylėjimą privatus; tiesioginė naršyklės prieiga ribojama savininku / administratoriumi. Viešas turinys pateikiamas per `profile-content` |
| `user_roles` | Paskyros rolė, jos pakeitimas yra privilegijuotas administravimo veiksmas |
| `uzsakymai`, `product_catalog`, `shipping_catalog` | Užsakymai privatūs; katalogai turi atskiras viešo skaitymo ir administravimo politikas |
| `product_payment_attempts`, `service_payment_events`, `payment_events` | Mokėjimų bandymai / įvykiai; pradžios, patvirtinimo ir idempotentiškumo RPC turi atskirus GRANT |
| `paslaugu_uzklausos`, `service_quote_settings` | Paslaugos užklausa, administratoriaus pasiūlymas ir kliento sprendimas |
| `production_jobs`, `invoice_documents`, `automation_events`, `automation_audit_log` | Gamyba, dokumentai, automatikos eilė ir auditas; dalį rezultatų skaito savininkas, administravimo teisės atskiros |
| `kapavietes`, `grave_photo_submissions` | Rankiniai įrašai ir moderuojamos naudotojų nuotraukos; nepatvirtinta nuotrauka nevieša |
| `municipalities`, `cemeteries`, `graves`, `deceased_people`, `import_*` | Ankstesnio oficialaus registro importo struktūra. Jos buvimas nereiškia, kad dabartinė vieša paieška skaito būtent šį importą |
| `memorial_candles`, `memorial_memories` | Viešus veiksmus priima ir patvirtintą turinį atrenka Edge, naršyklei tiesioginis įterpimas nesuteiktas |
| `private.memorial_engagement_limits`, `private.storage_owner_usage`, `private.storage_profile_usage` | Serveriniai skaitikliai ir kvotų apskaita; neprieinami naršyklės vaidmenims |

## Failai, prieigos kodai ir kvotos

`atminimas` naudoja kelią `<naudotojo UUID>/<profilio kodas>/<failas>`. Įkėlimo politika tikrina savininką, aplanko gylį ir leistiną failo vardą; profilio medijos normalizavimas neleidžia nurodyti svetimo UUID ar profilio failo. `photo-1`–`photo-8` gali turėti nekintamos versijos 32 šešioliktainių simbolių priesagą. Įkėlimas prieš sukuriant profilio DB eilutę yra numatyta redaktoriaus eiga.

`atminimas`, `kapavietes`, `grave-photo-submissions`, `automation-documents` laikomi privačiais. `profile-content` patikrina publikavimą, ištrynimą, prieigos kodą ir grupės narius prieš pasirašydamas medijos nuorodas vienai valandai. `grave-photo` prieš perduodamas vaizdą tikrina publikavimo / moderavimo būseną. Nuolatinė `/object/public/` nuoroda šių patikrų nepakeičia.

Prieigos kodo RPC vadinasi `set_memorial_access_code` ir `verify_memorial_access_code`. Kodas perduodamas tik POST JSON kūne; turinio API iki patvirtinimo nesuteikia pasirašytų failų nuorodų. Patikimo įėjimo IP tikrinimui naudokite `trustedClientIp`; pakeitus hostingą reikia patikrinti jo `CF-Connecting-IP` prielaidą.

Kvotą galutiniam Storage metaduomenų rašymui taiko `private.account_storage_owner_quota()` ir trys `storage_owner_quota_insert/update/delete` AFTER STATEMENT trigeriai. Apskaitomos ir privilegijuotai užbaigiamos operacijos, ir Storage leidimų bandymai; bandymo transakcijos atšaukimas atšaukia apskaitą. Trigeriai nekeičia Storage metaduomenų. Skaitiklių ribas bei dydžio skaičiavimą žiūrėkite migracijoje `20261109100241_storage_owner_quotas.sql`; pakeitus Storage versiją pakartokite SQL ir lygiagretumo testus.

## Migracijos ir vietinio šaltinio ribos

`schema.sql` yra ankstyva bazė. Vien jo ir visų vietinių migracijų sekos nepakanka patikrintam dabartinės produkcijos atkūrimui: žemiau išvardytos trūkstamos priklausomybės. Izoliuotos saugumo testų programos pačios paruošia joms reikalingą minimalią schemą. Esamam projektui pirmiausia palyginkite nuotolinę migracijų istoriją; netaikykite viso katalogo ir neatkurkite produkcijos per `db reset` kaip taisymo būdo. Ankstyvos viešos politikos vėlesniuose failuose panaikinamos, todėl atskiras senas SQL failas neapibūdina galiojančios prieigos.

Saugumo riboms reikšmingi failai:

- `20260730121821_harden_private_profile_media.sql`: aiškūs GRANT, privačios saugyklos, savininko politikos ir profilio JSON normalizavimas.
- `20260913192953_group_memorials.sql`, `20260914133742_editor_photo_versions.sql`: grupės narystė ir nekintamos nuotraukų versijos.
- `20260914190718_audit_mfa_guards_and_indexes.sql`: pradinės ribojančios MFA politikos.
- `20261109100240_memorial_engagement_atomic_limits.sql`: atominis `consume_memorial_engagement_rate_limit` ir serveriniai limitai.
- `20261109100241_storage_owner_quotas.sql`: privačios kvotos, esamų failų apskaitos inicijavimas ir Storage trigeriai.
- `20261109121128_require_admin_mfa.sql`: administratoriui privalomas MFA ir savos rolės skaitymo išimtis.

2026-11-09 leidimo trijų migracijų vietiniai pavadinimai sulyginti su nuotoline istorija. Tai nėra patvirtinimas, kad visa produkcijos schema pilnai atkuriama iš šio katalogo. Pavyzdžiui, dabartinis kodas naudoja `access_code_hash`, `access_code_protected` ir abu prieigos kodo RPC, tačiau jų sukūrimo SQL vietiniuose `schema.sql` / `migrations` nėra. Prieš pilną atkūrimą nuskaitykite ir palyginkite tokių priklausomybių apibrėžimus bei GRANT; nekurkite spėjamo pakaitalo vien tam, kad testas nebegrąžintų „function not found“.

## Diegimas ir patikros

Vercel frontend diegimas nepaskelbia Edge Functions ar DB migracijų. Kiekviena Edge funkcija turi savo įdiegtą paketą: pakeitus bendrą `_shared` failą jau veikiantys kitų funkcijų paketai neatsinaujina. Pagal importus nustatykite visus paveiktus vartotojus ir įdiekite juos su santykinėmis priklausomybėmis. MFA pakeitimas apima ne tik `profile-manage`, bet ir turinio, mokėjimo, dokumentų bei administravimo funkcijas; konkretus paskutinio leidimo dešimties funkcijų sąrašas yra saugumo ataskaitoje.

Prieš leidimą sulyginkite schemą, funkcijų RPC priklausomybes ir gateway `verify_jwt`; naujus prieigos reikalavimus derinkite su frontend prisijungimo / MFA srautu. Serverines paslaptis laikykite Supabase Secrets / Vault; į naršyklės konfigūraciją keliauja tik viešas projekto raktas ir vieši adresai. Mokėjimus, laiškus ir siuntų kūrimą tikrinkite su izoliuotais adapteriais; tikrų išorinių veiksmų nepaleiskite kaip bendro dūmų testo.

Įprastos vietinės patikros:

```powershell
python -m unittest discover -s tests -p 'test_*.py' -q
node --test tests/*.test.cjs
pnpm dlx deno@2.9.6 test --node-modules-dir=none --allow-env --allow-net supabase/functions
pnpm build
node --test tests/verify-build.cjs
```

DB testai `tests/*.sql` tikrina konkretų migracijų rinkinį ir baigiasi `ROLLBACK`; prieš vykdymą perskaitykite jų prielaidas. `storage_quotas_database.sql` naudoja laikiną metaduomenų lentelę ir nekuria tikrų Storage failų. `mfa_database.sql` ir `memorial_engagement_database.sql` sukuria transakcinius sintetinius įrašus, todėl jie nėra grynai skaitymo užklausos.

Visiškai izoliuotoms saugumo patikroms į atskirą laikiną katalogą įdiekite `@electric-sql/pglite@0.5.15`; tikram PostgreSQL lygiagretumo bandymui ten pat – `embedded-postgres@17.11.0-beta.19` ir `pg`. Projekto `package.json` šios testavimo priklausomybės neprivalo keisti:

```powershell
node tests/security-database-isolated.mjs '<testavimo-priklausomybiu-katalogas>'
node tests/security-database-concurrency.mjs '<testavimo-priklausomybiu-katalogas>'
```

Pirmas įrankis su minimaliais Auth / lentelių modeliais tikrina kvotas, MFA ir pateikimų limitus. Antras paleidžia laikiną vietinį PostgreSQL, siunčia lygiagrečias užklausas ties kvotų / žvakių ribomis ir serverį sustabdo. Jie netikrina visos produkcijos schemos ar išorinių paslaugų parengties. Po realaus diegimo atskirai patikrinkite migracijų istoriją, funkcijų versijas, Security Advisor ir aktualius produkcijos srautus pagal [DEPLOYMENT.md](../DEPLOYMENT.md).
