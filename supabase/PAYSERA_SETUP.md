# Paysera Checkout Modern

Integracija skirta QR lentelių užsakymams ir priimtiems kapavietės priežiūros pasiūlymams. QR lentelių katalogo kainos: `metal` ir `asa` po 5000 ct; pristatymas į paštomatą – 300 ct. Mokėjimo suma skaičiuojama serveryje.

## Tikro 0,50 EUR mokėjimo patikra 2026-09-08

- Savininkas prisijungė ir pats apmokėjo atskirą 50 ct patikros pasiūlymą `50ca5386-b396-49b7-a300-332a1690aacf`. „Paysera“ užsakymas: `01a08009-2fd4-72db-8c76-b58fceb05b54`.
- Serveris gavo du pasirašytus pranešimus apie tą patį mokėjimą: abu `order.paid`, `accepted`, 50 ct EUR, `test=false`. Tai du callback, o ne du mokėjimai.
- Užklausa turi `payment_status='paid'`, `payment_test=false`, `paid_at='2026-09-08T08:02:33.936216Z'` (11:02 Vilniaus laiku). Tikras apmokėjimas patvirtintas pagal serverio įrašą, ne vien pagal grįžimo URL.
- Patikros įrašas aiškiai pažymėtas techniniu bandymu; gaminys negaminamas ir kapavietės priežiūra neatliekama. Automatinių paslaugos įvykių nesukurta, parduotuvės kainos nepakeistos, grąžinimas neinicijuotas.
- Ši patikra patvirtina tikrą Paysera mokėjimą per atskirą paslaugos pasiūlymą. Visas 53 EUR fizinės QR lentelės mokėjimas atskirai dar neatliktas.

## Patikra 2026-09-07

- „Paysera“ projektas aktyvuotas; savininkas įjungė projekto „Test Mode“.
- Per gyvą svetainę prisijungta, priimtas atskiras 1 EUR bandomasis pasiūlymas ir sukurtas „Checkout Modern“ užsakymas. „Mock payment / Test Bank“ sėkmingai imitavo mokėjimą, grįžimo nuoroda nuvedė į kliento zoną.
- Svetainė užregistravo pasirašytą tikrą „Paysera“ testinį callback: `payment_test=true`, `payment_status='cancelled'`, `paid_at=null`. Paslaugų el. laiškų automatikos įvykių nesukurta; tikri pinigai nepervesti.
- Patikra aptiko pakartotinių testinių callback klaidą: „payment“ pranešimas gavo HTTP 200, vėlesnis atskiras „order“ pranešimas – HTTP 409, nes pirmasis uždarė bandymą. Tai pakartotinių pranešimų apdorojimo klaida, o ne nepavykęs testinis mokėjimas.
- Produkcijoje pritaikyta migracija `20260907151856_acknowledge_completed_paysera_test_callbacks.sql`. Ji patvirtina užbaigto testinio bandymo pranešimus pagal ankstesnio sėkmingo testinio mokėjimo įrodymus; nauji įvykiai išsaugo ir projekto ID. Pavėlavę ankstesnio testinio bandymo pranešimai nekeičia naujo bandymo ar tikro mokėjimo būsenos.
- Visa papildyta „Modern“ DB testų rinkmena praėjo vienoje transakcijoje su `ROLLBACK`. Patikrinti atskiri callback, ankstesnio klaidingo atmetimo pakartojimas, neteisingi užsakymo / projekto / sumos / valiutos duomenys ir vėluojantys pranešimai po naujo ar apmokėto tikro bandymo.
- Po pataisos per „Paysera“ portalą pakartotas ankstesnis pranešimas („Synchronise status“). Portalas parodė **„Callback Delivered“ (18:19 Vilniaus laiku)**; abu svetainės mokėjimo įvykiai dabar `recorded`. Testinis bandymas išliko neapmokėtas (`payment_test=true`, `paid_at=null`).
- Bandomoji užklausa: `cb7787df-bed9-4e0a-914f-a78b0ee067e4`. „Paysera“ užsakymas: `01a07c6c-43fb-75b4-82d4-fffc2e8bdc8b`. Po patikros testinė paslauga atšaukta (`statusas='atsaukta'`), pasiūlymo galiojimas užbaigtas, kad vėliau jo nebūtų galima netyčia apmokėti tikru režimu. Įrašas ir callback istorija palikti patikros bei pakartotinių pranešimų sutikrinimui.
- Dabartinė kliento sąsaja testinį `cancelled` statusą rodo kaip „mokėjimas atšauktas“. Tikras testo rezultatas tikrinamas per `payment_test` ir `service_payment_events`; testinis bandymas sąmoningai nepažymimas apmokėtu. Po šios patikros savininkas pranešė išjungęs projekto „Test Mode“. Tikras mokėjimas dar neatliktas.

## Ankstesnė būsena 2026-09-05

- Produkcijoje pritaikytos migracijos `20260905131320_paysera_service_payments.sql` ir `20260905190542_paysera_modern_checkout.sql`.
- „Supabase“ projekte `tpwrkgdmtucecqxbpwwf` įdiegtos `service-flow` v7 ir `paysera-webhook` v2. Išsaugota gyvos versijos el. laiškų operacijų apskaita.
- Pateikti „Checkout Modern“ OAuth duomenys išsaugoti šifruotame „Supabase Vault“ įraše `paysera_checkout_modern`. Prisijungimas prie „Paysera“ ir mokėjimo būdų užklausa sėkmingi.
- Užsakymo kūrimą „Paysera“ atmeta HTTP 400 `payment_collection_not_activated`. Projekto savininkas turi aktyvuoti mokėjimų surinkimą „Paysera“ paskyroje. Iki tol svetainė parodo suprantamą klaidos pranešimą ir leidžia vėliau bandyti dar kartą.
- 207 Python ir 24 Deno testai praėjo. Abi DB testų rinkmenos naudoja `ROLLBACK`; bandomi užsakymai neišsaugoti. Gyvas pasirašytas kontrolinis webhook grąžino `200 OK`, neteisingas parašas ir neprisijungęs mokėjimo inicijavimas – `401`.
- Visas mokėjimo kelias per banką dar nepatikrintas, nes mokėjimų surinkimas neaktyvus. Tikras mokėjimas neatliktas.

## Konfigūracija

Produkcijoje naudojamas „Vault“ JSON įrašas `paysera_checkout_modern` su laukais `client_id`, `client_secret`, `project_id`. Jį skaito tik serveriui skirta `get_paysera_checkout_credentials` funkcija. `anon` ir `authenticated` rolėms vykdymas uždraustas; teisės į bendrą iššifruotų paslapčių sąrašą nesuteiktos.

Alternatyva kitai aplinkai – vienu metu nustatyti visus tris „Supabase Edge Functions Secrets“:

- `PAYSERA_CLIENT_ID`
- `PAYSERA_CLIENT_SECRET`
- `PAYSERA_MODERN_PROJECT_ID` – OAuth projekte patvirtintas UUID.

Jei bent vienas iš šių kintamųjų nustatytas, reikia visų trijų; nepilna konfigūracija nesujungiama su „Vault“ reikšmėmis. `PUBLIC_SITE_URL=https://atminimokodas.lt/` apibrėžia grįžimo adresą. Slapti duomenys laikomi tik serveryje, jų nėra frontend ir Git.

Patvirtinimo adresas perduodamas kuriant kiekvieną užsakymą:

```text
https://tpwrkgdmtucecqxbpwwf.supabase.co/functions/v1/paysera-webhook
```

„Checkout Modern“ priima JSON POST su `X-Paysera-Signature`: HMAC-SHA256 skaičiuojamas iš nepakitusio užklausos turinio, naudojant OAuth kliento paslaptį. Funkcijos `verify_jwt=false`, nes banko pranešimas neturi vartotojo JWT. `service-flow` mokėjimo veiksmas pats patikrina vartotojo sesiją ir pasiūlymo savininką.

## Aktyvavimas ir patikra

1. „Paysera“ paskyroje užbaikite šio projekto mokėjimų surinkimo aktyvavimą. Vien veikiančių OAuth duomenų neužtenka.
2. Pagal „Paysera“ instrukcijas įjunkite projekto „Test Mode“, kai jis prieinamas. „Checkout Modern“ testavimo režimas valdomas projekto nustatymuose; vietinis `PAYSERA_TEST` kintamasis skirtas tik ankstesniam „Checkout Classic“ kodui.
3. Su atskiru bandomuoju paslaugos pasiūlymu patikrinkite prisijungimą, pasiūlymo priėmimą, mokėjimo nuorodą, nukreipimą ir pasirašytą webhook.
4. Bandomąjį mokėjimą sistema turi užregistruoti kaip testinį, o paslaugą palikti neapmokėtą. Po bandymo „Paysera“ projekto režimą grąžinkite į numatytą produkcinį režimą.
5. Tikrą mokėjimą ir jo pasirodymą administratoriaus sąraše atskirai patikrina svetainės savininkas. Grįžimas į svetainę savaime nėra apmokėjimo patvirtinimas.

## Elgsena ir gedimų tvarkymas

- Suma ir valiuta paimamos iš serverio patvirtinto pasiūlymo. Naršyklės perduota kaina nenaudojama. Pradėto mokėjimo pasiūlymo suma užfiksuojama.
- Vienalaikiai paspaudimai gauna vieną kūrimo teisę DB transakcijoje. Išsaugota mokėjimo nuoroda pakartotinai naudojama iki jos galiojimo pabaigos (iki vienos valandos ir ne ilgiau nei galioja pasiūlymas).
- „Paysera“ užsakymas susiejamas su bandymu prieš kuriant mokėjimo nuorodą. Aiški 4xx klaida leidžia kartoti tik nepavykusį žingsnį; jau išsaugotas užsakymas nekuriamas iš naujo.
- Po neaiškaus atsakymo, tinklo pertrūkio ar 5xx automatinio pakartotinio užsakymo kūrimo nėra: „Paysera“ šiam POST neturi idempotency rakto, o `reference` nėra unikalus. Administratorius turi sutikrinti bandymo UUID su „Paysera“ užsakymų sąrašu prieš atlaisvindamas kūrimo teisę ar leisdamas naują bandymą.
- Pasibaigusi nuoroda automatiškai nekeičiama nauju mokėjimu. Pirmiausia sutikrinama teikėjo būsena. Automatinis grąžinimas ar operacinis įstrigusio bandymo atkūrimo ekranas neįgyvendinti.
- Pasirašius webhook, serveris papildomai iš „Paysera“ gauna viso užsakymo būseną. Tikrinami projektas, tiekėjo užsakymo ID, mūsų bandymo ID, užfiksuota suma, sumokėta suma ir valiuta. Vien dalinis mokėjimas nesuteikia apmokėtos būsenos.
- Tik visas apmokėtas užsakymas be `is_test=true` žymimas apmokėtu. Testinis pranešimas registruojamas, o bandymas uždaromas kaip `cancelled`, kad vėliau būtų galima pradėti naują. Pasikartojantis webhook nepakeičia apmokėjimo datos; vėlesnė laukianti būsena nepanaikina apmokėjimo.
- Atskirų užbaigto testinio mokėjimo webhook priėmimui reikia ankstesnio pilno testinio apmokėjimo įvykio ir sutampančių bandymo, „Paysera“ užsakymo, projekto, sumos bei valiutos duomenų. Ankstesni įvykiai be projekto ID gali būti sutikrinti tik kol paslaugos eilutė dar nurodo tą patį bandymą. Istoriniai testiniai įvykiai neperrašo naujo mokėjimo.
- Senasis „Stripe“ mokėjimo kodas ir „Checkout Classic“ webhook tikrinimas palikti ankstesniems bandymams. Nauji paslaugų mokėjimai inicijuojami per „Checkout Modern“.

## Diegimas ir testai

Taikykite Paysera migracijas chronologine tvarka, įskaitant `20260907151856_acknowledge_completed_paysera_test_callbacks.sql`. Sukonfigūruokite „Vault“ arba visas tris Modern paslaptis, įdiekite `paysera-webhook` ir `service-flow`, tada paskelbkite frontend per esamą Git → Vercel procesą. Slaptos serverio rinkmenos nepublikuojamos dėl `.vercelignore`.

```text
deno check supabase/functions/service-flow/index.ts supabase/functions/paysera-webhook/index.ts
deno test --allow-env supabase/functions/_shared/paysera_test.ts supabase/functions/_shared/paysera-modern_test.ts supabase/functions/service-flow/index_test.ts
python -m unittest discover -s tests -p "test_*.py"
```

`tests/paysera_database.sql` ir `tests/paysera_modern_database.sql` vykdomos DB transakcijoje su `ROLLBACK`. Modern testai apima savininką, pasiūlymo galiojimą, vienalaikį inicijavimą, neaiškius ir galutinius API atsakymus, sumos bei užsakymo susiejimą, dalinį ir pilną mokėjimą, pasikartojančius įvykius, testinį režimą ir RPC teises.

Oficialūs šaltiniai: [pirmas mokėjimas](https://developers.paysera.com/guides/checkout-modern/getting-started/your-first-payment), [užsakymai ir pakartotinių užklausų ribos](https://developers.paysera.com/guides/checkout-modern/api-integration/payment-orders), [mokėjimo nuorodos](https://developers.paysera.com/guides/checkout-modern/api-integration/payment-links), [webhook parašai](https://developers.paysera.com/guides/checkout-modern/api-integration/webhooks), [įvykių struktūra](https://developers.paysera.com/guides/checkout-modern/reference/webhook-events), [testavimo režimas](https://developers.paysera.com/guides/checkout-modern/getting-started/test-mode), [Supabase Vault](https://supabase.com/docs/guides/database/vault).

## Mokami QR lentelių užsakymai

2026-09-08 (Vilniaus laiku) pritaikyta `paysera_product_orders` migracija ir įdiegtos `payment-create` v6, `profile-manage` v14, `paysera-webhook` v3 bei `preorder` v5. Nauji PREORDER pateikimai gauna HTTP 410; istorija išsaugota.

`product_payment_attempts` saugo nekeičiamą kainą ir tiekėjo užsakymo numerį. Vienu metu leidžiamas tik vienas mokėjimo kūrimo bandymas; pakartojimas grąžina tą pačią nuorodą. Po neaiškaus Paysera POST atsakymo ar nuorodos galiojimo pabaigos reikia sutikrinti tiekėjo būseną prieš pradedant kitą mokėjimą. Suma ir pristatymo duomenys užrakinami pradėjus mokėjimą. Tik pilnas tikras mokėjimas įjungia apmokėjimo ir vykdymo automatiką.

Patikros: 205 Python patikros; 16 Deno Modern ir produkto testų; 8 kliento srautų testai. Produkto DB testai su ROLLBACK patikrino savininką, 5000+300 ct kainą, pasikartojančius bandymus, sumų ir nuorodų klastojimą, dalinius bei testinius mokėjimus ir vėluojančius callback. Bandomi duomenys neišsaugoti. Tikras 53 EUR bankinis mokėjimas neatliktas.
