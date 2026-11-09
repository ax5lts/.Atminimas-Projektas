# Svetainės sąsajos žemėlapis

Šis dokumentas paaiškina, kur keisti naršyklės kodą. Bendrą projekto sandarą ir dabartinę diegimo būseną skaitykite kartu su [README](../README.md), [ARCHITECTURE](ARCHITECTURE.md) ir [PROJECT_STATE](PROJECT_STATE.md). Failų pavadinimai ir sąsajos šiame žemėlapyje patikrinti pagal 2026-11-09 šaltinį.

## Kaip veikia frontend

Svetainę sudaro šakniniame kataloge esantys `.html` puslapiai, bendras [css/styles.css](../css/styles.css) ir paprasti naršyklės scenarijai kataloge `assets/`. Čia nėra React, kliento maršrutizatoriaus ar komponentų rinkinio. Perėjimas į kitą HTML failą įkelia kitą dokumentą.

Dauguma JS failų yra savarankiškai vykdomos funkcijos (IIFE). Jie suranda HTML elementus pagal `id`, klases arba `data-*`, prijungia įvykius ir prireikus užklausia Supabase HTTP API. Pavyzdžiui, `assets/client-access.js` naudoja paprastą globalų kodą, todėl ne visi failai turi vienodą apvalkalą. Puslapio HTML esanti `<script>` seka nustato priklausomybių įkėlimo tvarką.

Redaguokite pirminius HTML, CSS ir JS failus. `pnpm build` vykdo [scripts/build.mjs](../scripts/build.mjs): atrenka viešus failus, suspaudžia JS/CSS per esbuild, apskaičiuoja jų turinio versijas ir sukuria `dist/`. Surinkimas iš naujo sukuria `dist/`; jo failai nėra redagavimo šaltinis. HTML ir atpažintos JS/CSS nuorodos gauna `?v=<turinio maiša>`, todėl paprastam pakeitimui nereikia ranka keisti visų versijų žymų.

Surinkiklis kopijuoja šakninius HTML, `favicon.ico`, `robots.txt`, `sitemap.xml`, leidžiamus tiesioginius `assets/` ir `css/` failus bei `public/paysera-verify-*.txt`. Naujas įdėtas katalogas ar naujas failo plėtinys automatiškai nepatenka į rinkinį: tokiu atveju peržiūrėkite surinkiklio leidžiamų failų taisykles. `.env`, Supabase šaltinis, testai ir `*.example.*` konfigūracija neviešinami.

## Puslapiai ir jų scenarijai

Visuose dabartiniuose HTML puslapiuose yra `assets/site-ui.js`. Toliau nurodyti pagrindiniai konkretaus puslapio scenarijai; tiksli jų ir bendrų pagalbininkų tvarka lieka atitinkamame HTML faile.

| Puslapis | Pagrindiniai scenarijai | Atsakomybė |
| --- | --- | --- |
| [index.html](../index.html) | `assets/official-grave-search.js` | Pradinis puslapis ir kapavietės paieška. |
| [kapu-ieskojimas.html](../kapu-ieskojimas.html) | `assets/official-grave-search.js` | Išsamesnė paieška, vieta žemėlapyje, išsaugotos kapavietės, nuotraukos pateikimas. |
| [kapu-prieziura.html](../kapu-prieziura.html) | `assets/home.js` | Kapų priežiūros paslaugų pasirinkimas, kainos įvertis ir užklausa. `home.js` šiame projekte nepriklauso `index.html`. |
| [parduotuve.html](../parduotuve.html) | `assets/product-catalog.js`, `assets/plaque-design.js`, `assets/shop.js` | QR lentelės dizainas, vieno žmogaus / grupės pasirinkimas, katalogo prieinamumas, perėjimas į redaktorių. |
| [redaktorius.html](../redaktorius.html) | `assets/atminimas-duomenys.js`, `assets/plaque-design.js`, `assets/memorial-group.js`, `assets/redaktorius.js` | Turinio, dizaino ir peržiūros žingsniai, nuotraukų biblioteka, grupė, juodraštis ir išsaugojimas. |
| [apmokejimas.html](../apmokejimas.html) | `assets/plaque-design.js`, `assets/checkout.js` | Esamas užsakymas, pristatymo katalogas, paštomatai ir mokėjimo pradžia. |
| [vartotojas.html](../vartotojas.html) | `assets/plaque-design.js`, `assets/user.js`, `assets/saved-memorials.js` | Paskyros puslapiai, viešinimas, užsakymai, paslaugų pasiūlymai ir šiame įrenginyje išsaugoti atminimai. |
| [prisijungti.html](../prisijungti.html) | `assets/auth.js`, `assets/form-validation.js`, `assets/login.js` | Prisijungimas ir saugus tęstinumo adresas `next`. |
| [registruotis.html](../registruotis.html) | `assets/auth.js`, `assets/form-validation.js`, `assets/register.js` | Paskyros sukūrimas ir el. pašto patvirtinimas. |
| [slaptazodis.html](../slaptazodis.html) | `assets/form-validation.js`, `assets/password-reset.js` | Atkūrimo laiškas ir slaptažodžio pakeitimas su atkūrimo žetonu. Šis puslapis nekrauna `auth.js`. |
| [saugumas.html](../saugumas.html) | `assets/auth.js`, `assets/mfa.js` | TOTP programėlės prijungimas, kodo patvirtinimas ir tęstinumas po MFA. |
| [sablonas-viskas.html](../sablonas-viskas.html) | `assets/atminimas-duomenys.js`, `assets/memorial-actions.js`, `assets/memorial-group.js`, `assets/memorial-page.js` | Atminimo puslapio skaitymas, grupės pasirinkimas, galerija ir prieigos kodo forma. |
| [klientai.html](../klientai.html) | `assets/client-access.js` | Puslapio identifikatoriaus įvedimas ir nukreipimas į atminimo puslapį. |
| [admin.html](../admin.html) | `assets/admin.js`, `assets/graves-admin.js`, `assets/grave-photo-admin.js` | Administravimo skyriai ir nuotraukų moderavimas. |
| [grazinimas.html](../grazinimas.html), [pranesti.html](../pranesti.html) | `assets/legal-forms.js` | Sutarties atsisakymo arba turinio pranešimo forma. |
| [aciu.html](../aciu.html) | `assets/thank-you.js`, `assets/business-details.js` | Padėkos tekstas pagal užklausos tipą ir kontaktai. |
| [rekvizitai.html](../rekvizitai.html) | `assets/business-details.js`, `assets/site-seo.js` | Rekvizitai ir struktūriniai SEO duomenys. |
| [privatumas.html](../privatumas.html), [taisykles.html](../taisykles.html), [prieinamumas.html](../prieinamumas.html) | `assets/business-details.js` | Informaciniai tekstai ir bendri rekvizitų laukai. |
| [qr-kodas-ant-kapo.html](../qr-kodas-ant-kapo.html), [404.html](../404.html) | Bendras `assets/site-ui.js`; QR informaciniame puslapyje dar yra `auth.js` | Informacinis turinys arba klaidos puslapis. |
| [isankstinis-uzsakymas.html](../isankstinis-uzsakymas.html) | Verslo rekvizitų ir katalogo pagalbininkai | Senas adresas; `vercel.json` nukreipia į `parduotuve.html`. Šis HTML nebeįkelia `assets/preorder.js`. |

## Bendros naršyklės sąsajos

Tai esami `window` objektai, kuriais failai dalijasi funkcijomis. Keičiant jų vardus ar metodus reikia patikrinti visus kvietėjus su `rg`.

| Globalus objektas | Šaltinis | Svarbios sąsajos |
| --- | --- | --- |
| `ATMINIMAS_CONFIG` | `assets/supabase-config.js` | Vieši `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PUBLIC_SITE_URL`, pasirinktinis `CEMETERY_SEARCH_API_URL`; šablonas yra `assets/supabase-config.example.js`. |
| `ATMINIMAS_BUSINESS` | `assets/business-config.js` | Vieši rekvizitai ir atsarginiai svetainės tekstai. |
| `ATMINIMAS_ANALYTICS` | `assets/analytics-config.js` | `GA_MEASUREMENT_ID` analitikos konfigūracija. |
| `AtminimasAuth` | `assets/auth.js` | `user`, `isAdmin`, `needsMfa`, `assuranceLevel`, `authorizedFetch`, `ensureFreshSession`, prisijungimo, registracijos ir MFA metodai. |
| `AtminimasApi` | `assets/atminimas-duomenys.js` | `loadAtminimasBySlug`, `createAtminimas`, `updateAtminimas`, `deleteAtminimas`, `setGroupMembers`, `createUzsakymas`, `publishAdminPrototype`, `uploadBuilderMedia`, `qrImageUrl`. |
| `AtminimasProductCatalog` | `assets/product-catalog.js` | `load`, `priceForDesign`, `formatPrice`, `normalizeType`. |
| `AtminimasPlaqueDesign` | `assets/plaque-design.js` | `read`, `save`, `normalize`, `query`, `label`, `render`, spalvų ir raštų rinkiniai. |
| `AtminimasGroup` | `assets/memorial-group.js` | `name`, `render`, `maxPeople: 8`. Tas pats pasirinkimo valdiklis naudojamas redaktoriuje ir skaitymo puslapyje. |
| `AtminimasForms` | `assets/form-validation.js` | `setBusy`, `setStatus`, `validateField`, `clearFieldError`. |
| `AtminimasLoading` | `assets/loading.js` | `cards`, `show`, `finish`; bendras `data-loading` puslapio užbaigimas. |
| `AtminimasBusinessDetails` | `assets/business-details.js` | `refresh`, `loadRemote`; užpildo `[data-business]` ir gauna viešus rekvizitus per `business-profile`. |
| `AtminimasUi` | `assets/site-ui.js` | `copyText`, `toast`; pats failas taip pat inicijuoja navigaciją, mobilų meniu, grįžimo nuorodas ir kitus bendrus elementus. |
| `AtminimasMemorialActions` | `assets/memorial-actions.js` | `init(profile, options)`; dalijimasis, QR, išsaugojimas, kalendoriaus priminimas, galerija ir vieša bendruomenė. |

`admin.js` patvirtinęs prieigą išsiunčia `atminimas:admin-ready` įvykį. Jį prenumeruoja `graves-admin.js` ir `grave-photo-admin.js`; jų duomenų įkėlimas neturi pradėti apeiti šios tvarkos.

## Pagrindiniai srautai

### Parduotuvė, redaktorius ir užsakymas

`shop.js` perskaito dizainą ir grupės pasirinkimą, o `product-catalog.js` patikrina nuotolinį `product_catalog`. Katalogo klaida palieka užsakymo tęsimą užrakintą. Šaltinyje yra ir aiški 5000 / 6000 ct EUR katalogo suderinamumo patikra; keičiant kainodarą neužtenka pakeisti vieno užrašo HTML. Serveris turi nustatyti tikrą užsakymo sumą.

Parduotuvės nuoroda perduoda redaktoriui `product`, `color`, `pattern` ir `memorial`. Redaktorius taip pat palaiko `edit=<profilio-id>`, prisijungimo tęstinumą ir administratoriaus `prototype=1` kelią. `redaktorius.js` yra pagrindinis didelis redaktoriaus valdiklis: jo viduje yra žingsniai, peržiūra, teksto blokai, nuotraukų paruošimas, grupės žmonės ir saugojimo būsenos.

Juodraščio tekstas ir išdėstymas saugomi `localStorage`: naujam puslapiui naudojamas `atminimas.editor.draft.v1`, redagavimui – `atminimas.editor.edit.<id>.v1`. Failai saugomi IndexedDB duomenų bazėje `atminimas-editor-draft`, saugykloje `files`. Prisijungimo metu turi išlikti abu duomenų tipai; vien tekstinio juodraščio išsaugojimas neužtikrina nuotraukų tęstinumo.

`AtminimasApi` įkelia mediją į privačią `atminimas` saugyklą po savininko ir profilio identifikatoriais. Naujas profilis kuriamas `profiliai` lentelėje kaip neviešas; redagavimas ir grupės valdymas eina per `profile-manage`. Skaitmeninis puslapis paliekamas paskelbti kliento zonoje. Fizinės lentelės kelias kviečia `createUzsakymas`, tada pereina į `apmokejimas.html?order=<id>`. Tai kliento srauto aprašymas, ne garantija, kad serveris konkrečiu metu priima naujus mokamus užsakymus: aktyvius ribojimus tikrinkite `PROJECT_STATE.md` ir `profile-manage` / `payment-create` šaltinyje.

`checkout.js` skaito paskyrai priklausantį užsakymą, krauna pristatymo katalogą ir `parcel-lockers`, išsaugo pristatymą ir kviečia `payment-create`. Grįžimo URL `payment=success` pats nepatvirtina apmokėjimo; rodoma serverio užsakymo būsena. Nauja pristatymo ar mokėjimo UI logika neturi tiesiogiai nustatyti `apmoketa`.

### Paskyra ir MFA

`auth.js` HTTP užklausomis jungiasi prie Supabase Auth. Sesija saugoma `sessionStorage` raktu `atminimas.auth.session.v1`; senas to paties rakto įrašas `localStorage` valomas. `authorizedFetch` atnaujina besibaigiančią sesiją ir saugo nuo senos užklausos pakartojimo jau pasikeitus paskyrai. Naudokite šią funkciją naujiems autentifikuotiems kvietimams, kai nereikia specialaus kitokio protokolo.

`login.js` priima tik vietinį `.html` tęstinumo adresą. Patikrinęs naudotoją ir jo administratoriaus rolę, jis nukreipia į paskyros / administravimo puslapį arba `saugumas.html`. Administratoriui reikia `aal2` net tada, kai jis dar neturi patvirtinto MFA faktoriaus; kitiems naudotojams MFA reikalaujamas pagal jų faktorius. `mfa.js` registruoja TOTP ir po patvirtinimo pašalina QR bei slaptą raktą iš rodomo turinio. Naršyklės nukreipimas papildo serverines teises, jų nepakeičia.

`password-reset.js` atskirai perskaito atkūrimo žetoną iš URL fragmento, išvalo fragmentą ir pateikia naują slaptažodį Supabase Auth. Neįkelkite papildomų trečiųjų šalių scenarijų į šį srautą neperžiūrėję jo paslapčių tvarkymo.

### Atminimo puslapio skaitymas

`klientai.html` yra identifikatoriaus įvedimo vartai. Tikrą turinį rodo `sablonas-viskas.html`; `memorial-page.js` priima `id`, `slug` arba seną `s` parametrą. Grupėje `person` pasirenka žmogų, o reakcijos priklauso pagrindiniam bendro QR profiliui.

`AtminimasApi.loadAtminimasBySlug(id, accessCode?)` kviečia `profile-content`. Įprastai naudojamas GET; apsaugotam puslapiui kodas perduodamas tik POST JSON kūne. `403` su `access_code_required` parodo kodo formą; klaidingas kodas ar bandymų ribojimas nepateikia profilio turinio ir pasirašytų failų nuorodų. Kodas nelaikomas URL ar naršyklės saugykloje. Savininko / administratoriaus išimtį patikrina serveris.

`memorial-page.js` atvaizduoja seną ir naują išdėstymą, tekstinius istorijos blokus, grupę, galeriją bei vaizdo įrašą. `profile-content` grąžina trumpalaikes failų nuorodas ir išfiltruoja kitų savininkų ar atskirai kodu apsaugotų grupės narių turinį. Atminimo tekstą rodykite kaip tekstą, ne nekontroliuojamą HTML.

`memorial-actions.js` viešiems puslapiams kviečia `memorial-engagement`; kodu apsaugotuose puslapiuose bendruomenės dalis paslėpta. `saved-memorials.js` paskyros puslapyje rodo šiame įrenginyje `localStorage` išsaugotą sąrašą, ne atskirą serverio paskyros kolekciją.

### Kapavietės ir priežiūra

`official-grave-search.js` naudoja `cemetery-search`, rodo žemėlapio išklotinę, saugo pasirinktus kapus šiame įrenginyje ir pateikia prisijungusių naudotojų nuotraukas. `grave-photo` pateikia leidžiamas viešas nuotraukas; naujas nuotraukas peržiūri administratorius.

`home.js` kapų priežiūros puslapyje per `service-flow` gauna įvertį ir pateikia užklausą. Paskyros `user.js` per tą pačią funkciją tvarko pasiūlymo priėmimą ir mokėjimo pradžią. `assets/service-prices.js` turi tik senų puslapių suderinamumo reikšmes; jo nereikia laikyti dabartiniu kainodaros šaltiniu.

## Kas įkeliama dinamiškai

Vien HTML `<script>` sąrašas neparodo visų užklausų. `site-ui.js` funkcija `setupSeoAndAnalytics` prireikus įterpia `business-config.js`, `site-seo.js`, `analytics-config.js` ir `analytics.js` scenarijus, pažymėtus `data-site-module`. Kai yra statinis JSON-LD su `data-site-module="site-seo"`, papildomas SEO scenarijus taip neįterpiamas. Ši funkcija atskirai praleidžia `admin.html`, `redaktorius.html`, `slaptazodis.html` ir `vartotojas.html`.

`analytics.js` įkeliamas tik esant tinkamo formato GA ID; išorinė `googletagmanager.com` žyma įkeliama gavus analitikos sutikimą arba atkūrus ankstesnį sutikimą. `business-details.js` rekvizitus papildo HTTP užklausa į `business-profile`. Produktų, paštomatų, žemėlapio išklotinės ir medijos duomenys taip pat kraunami po pradinio dokumento. Testuojant su užklausų imitacijomis reikia numatyti ir šiuos kvietimus.

## Kur saugiai pradėti pakeitimą

- Tekstas, semantika, formų laukai: atitinkamas HTML; susietą `id`, `name` ar `data-*` keiskite kartu su JS kvietėjais.
- Navigacija, mobilus meniu, bendras grįžimo mygtukas, bendri pranešimai: `assets/site-ui.js` ir atitinkamos `css/styles.css` taisyklės.
- Redaktorius: pradėkite nuo `redaktorius.html` elemento ir jo panaudojimų `redaktorius.js`; medijos API keiskite `atminimas-duomenys.js`, grupės pasirinkimo komponentą – `memorial-group.js`.
- Parduotuvės dizainas: `plaque-design.js` ir `shop.js`; kainos bei prieinamumas susiję su `product-catalog.js` ir serverio katalogu.
- Prisijungimas ir sesija: `auth.js`; konkrečios formos yra `login.js`, `register.js`, `password-reset.js`, `mfa.js`.
- Atminimo turinio rodymas: `memorial-page.js`; reakcijos ir bendri veiksmai – `memorial-actions.js`; leidimų sprendimas lieka serveryje.
- Priežiūros užklausa: `kapu-prieziura.html` + `home.js`; kapavietės paieška: `official-grave-search.js`.

Pagal [AGENTS.md](../AGENTS.md) pirmiausia tikrinkite 320–430 px pločio telefonus, tada didesnius ekranus. Neturi atsirasti horizontalaus slinkimo; mygtukai turi būti pasiekiami liečiant, fiksuotos juostos neturi uždengti formų. Redaktoriuje patikrinkite ir ekrano klaviatūrą, vertikalų slinkimą, žingsnių grįžimą bei kiekvieno grupės žmogaus duomenų nepriklausomumą.

CSS yra bendras didelis failas su vėlesniais patikslinimais. Prieš keičiant taisyklę ieškokite visų jos selektoriaus pasikartojimų; venkite plataus `input`, `button` ar visų puslapių perrašymo dėl vieno valdiklio. Pakeitus išorinį domeną, failų rodymą ar scenarijų šaltinius, palyginkite HTML CSP, `vercel.json` ir vietinio serverio antraštes.

## Susiję testai

`pnpm test` vykdo `tests/*.test.cjs`, o `.browser.cjs` failus reikia paleisti atskirai. `pnpm build` patikrina surinkimą, ne vartotojo elgseną. Testo failo pradžioje nurodytos jo paleidimo sąlygos yra svarbios: dalis senesnių naršyklės testų tikisi vietinio serverio, naujesni saugumo scenarijai patys imituoja visą tinklą.

| Keičiama sritis | Pradinis regresinių testų rinkinys |
| --- | --- |
| Sesija, prisijungimas, MFA | `tests/auth-runtime.test.cjs`, `tests/login-runtime.test.cjs`, `tests/login.browser.cjs`, `tests/mfa.browser.cjs`; serverio dalis – `supabase/functions/_shared/mfa_test.ts`, `tests/mfa_database.sql`. |
| Parduotuvė ir kliento kelias | `tests/catalog-price.test.cjs`, `tests/plaque-design.test.cjs`, `tests/client-flow.test.cjs`, `tests/shop-group.browser.cjs`, `tests/test_checkout_ux.py`. |
| Redaktorius, juodraštis, nuotraukos | `tests/editor-photo-library.test.cjs`, `tests/test_editor_wizard.py`, `tests/test_story_blocks.py`, `tests/group-editor.browser.cjs`, `tests/group-people-visibility.browser.cjs`. |
| Viešas / kodu apsaugotas turinys | `tests/memorial-access.browser.cjs`, `supabase/functions/profile-content/index_test.ts`, `supabase/functions/profile-manage/group_test.ts`. |
| Bendri elementai ir publikavimo rinkinys | `tests/public-ui.test.cjs`, `tests/test_ui_quality.py`, `tests/test_security_hardening.py`, `tests/verify-build.cjs`. |

`tests/mfa.browser.cjs` patikrina naują ir esamą `aal1` administratoriaus sesiją be MFA faktorių, registraciją, klaidingo kodo pakartojimą ir patekimą į administravimą tik gavus `aal2`. `tests/memorial-access.browser.cjs` patikrina užrakintą turinį, nesėkmingą / sėkmingą kodo įvedimą, URL / saugyklos švarą ir 320 / 390 / 1440 px išdėstymą. Abu naudoja vietinį šaltinį bei imituotas užklausas, todėl jiems nereikia veikiančio serverio ar tikrų paskyrų.

Paprastos komandos:

```powershell
pnpm test
pnpm build
node tests/verify-build.cjs

# Reikia prieinamo Playwright; PLAYWRIGHT_PATH gali rodyti į jo modulio katalogą.
node tests/mfa.browser.cjs
node tests/memorial-access.browser.cjs

# Deno testas su izoliuotomis HTTP užklausomis; nereikia produkcijos raktų.
pnpm dlx deno test --node-modules-dir=none --allow-env supabase/functions/_shared/mfa_test.ts
```

Tikri mokėjimai, laiškų siuntimas ir produkcijos duomenų keitimas nėra frontend regresinio testo dalis. Produkcinio diegimo veiksmus ir būseną tikrinkite projekto diegimo dokumentuose.
