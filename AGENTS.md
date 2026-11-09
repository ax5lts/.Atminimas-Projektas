# Darbas su Atminimas projektu

Šis failas skirtas ir naujam pokalbiui: projekto kontekstą saugome repozitorijoje. Šios instrukcijos taikomos visam projektui; konkrečios naudotojo užduoties instrukcijos turi pirmenybę.

## Darbo pradžia

1. Patikrinkite `git status --short`; išsaugokite jau esančius naudotojo pakeitimus ir neįtraukite pašalinių failų į commit.
2. Perskaitykite [README.md](README.md), [architektūrą](docs/ARCHITECTURE.md) ir [projekto būseną](docs/PROJECT_STATE.md).
3. Pagal užduotį atverkite [frontend aprašą](docs/FRONTEND.md), [backend aprašą](docs/BACKEND.md) ir atitinkamas eilutes [generuojamame žemėlapyje](docs/GENERATED_MAP.md).
4. Tikrinkite pačius šaltinius ir jų testus. Pasenę planai, pokalbių santraukos ir ankstesni auditai nėra naujausios realizacijos įrodymas.

## Projekto sandara

- Tai statinis HTML/CSS/JavaScript projektas. Šakniniai HTML yra tikri vieši adresai; puslapio logika yra `assets/`, stiliai — `css/`.
- Naršyklės skriptai daugiausia naudoja IIFE ir bendrus `window` objektus. HTML skriptų tvarka yra priklausomybių dalis. Prieš keisdami atverkite konkretų HTML ir jo skriptus.
- `assets/auth.js` valdo sesiją ir atnaujinamas autorizuotas užklausas; `assets/atminimas-duomenys.js` jungia redaktoriaus ir atminimo duomenų srautus.
- Supabase backend šaltiniai yra `supabase/functions/`, bendros dalys — `_shared/`, DB pakeitimai — `supabase/migrations/`.
- `scripts/build.mjs` generuoja ir mažina `dist/`. Šio katalogo neredaguokite kaip šaltinio.
- `serve.py` skirtas vietinei statinei peržiūrai; `app.py` — papildomam vietiniam Flask API. Produkcijoje veikia Vercel ir Supabase.
- Neperkelkite viešų HTML ar skriptų vien dėl tvarkos: QR nuorodos, dinaminis įkėlimas ir build leidžiamų failų sąrašas priklauso nuo kelių. Keičiant struktūrą reikia atnaujinti visus vartotojus ir testus.

## Elgesio ir saugumo ribos

- Verslo duomenų autoritetas yra serverio logika, DB katalogas ir RPC; naršyklės kainos ir rolės yra tik sąsajos pagalba.
- Administratoriui būtinas patvirtintas MFA (`aal2`), net prieš pirmo faktoriaus registraciją. Nepanaikinkite šio reikalavimo dėl neveikiančio kliento nukreipimo.
- Viešas atminimo turinys ir pasirašytos failų nuorodos gaunami per `profile-content`; privatūs ar kodu apsaugoti duomenys neturi būti atskleidžiami per grupes, Storage ar bendruomenės API.
- Saugokite savininko UUID ir failų kelių tikrinimą, RLS, atominius pateikimo limitus ir failų kvotas. Detalės yra [SECURITY.md](SECURITY.md).
- `sb_publishable_...` ir vieša Supabase URL nėra serverio paslaptys. Service role, DB slaptažodžių, mokėjimo ir laiškų raktų nedėkite į JS, dokumentaciją, Git ar testų išvestį.
- Vietinė peržiūra su esama konfigūracija gali kreiptis į produkciją. Mokėjimų, siuntų ir tikrų laiškų testams naudokite imitatorius; DB regresijoms — izoliuotą DB arba patikrintą ROLLBACK scenarijų.

## Patikra ir diegimas

- Taikykite pakeitimui prasmingus testus iš [README.md](README.md); sąsajos pakeitimus tikrinkite telefone.
- Prieš publikuodami paleiskite build ir `tests/verify-build.cjs`. Vien sėkmingas vietinis testas nereiškia, kad produkcija atnaujinta.
- GitHub `main` pakeitimus frontendui automatiškai publikuoja Vercel. CI workflow pavadintas `pages.yml`, tačiau GitHub Pages svetainės neviešina.
- DB migracijos ir Edge Functions diegiamos atskirai. Pakeitus `_shared` priklausomybę reikia perleisti visas ją naudojančias įdiegtas funkcijas. Sąrašas yra žemėlapyje.
- Nelaikykite `schema.sql` dabartinės DB dump kopija. Prieš naują aplinką ar migraciją palyginkite istoriją ir žinomą repo / produkcijos neatitiktį [BACKEND.md](docs/BACKEND.md).
- Konkrečias diegimo taisykles skaitykite [DEPLOYMENT.md](DEPLOYMENT.md). Po diegimo tikrinkite tikrą domeną, funkcijų versijas ir Advisor, o į būsenos dokumentą rašykite tik patikrintus faktus.

## Konteksto priežiūra

- Pakeitus puslapių skriptus, Edge importus ar gateway konfigūraciją paleiskite `pnpm docs:map`, tada `pnpm docs:check`.
- Pakeitus architektūrą atnaujinkite atitinkamą `docs/` aprašą. Pakeitus realią produkciją atnaujinkite `docs/PROJECT_STATE.md` su patikros data ir įrodymais.
- `output/`, `tmp/`, `.codex-qa/`, priklausomybės ir vietiniai env failai nėra projekto atminties šaltinis. Ilgalaikę informaciją laikykite sekamuose Markdown failuose.
- Nerašykite absoliučių konkretaus kompiuterio diskų kelių į nuolatines instrukcijas: naudokite aktyvų repozitorijos katalogą. D: ar E: raidė gali pasikeisti.
- Istorinių `AUDIT`, `SITE_AUDIT`, `DEBUG`, SEO ir leidimų ataskaitų nelaikykite dabartinės būsenos vadovu. Naudokite jas konkrečiam istoriniam sprendimui suprasti.

## Sąsajos prioritetai

Pagrindinis svetainės naudojimo būdas yra telefonas. Sąsają ir užsakymo eigą projektuokite pirmiausia telefonams.

- Pirmiausia vertinkite 320–430 px pločio ekranus, tada platesnius ekranus.
- Svarbiausi mygtukai turi būti patogiai pasiekiami liečiant ekraną; fiksuoti elementai neturi uždengti formų ar turinio.
- Palaikykite aiškų, trumpą užsakymo kelią, lengvai skaitomą tekstą ir mažą privalomų veiksmų skaičių.
- Tikrinkite vertikalų slinkimą, teksto laužymą ir naudojimą su ekrano klaviatūra. Horizontalaus puslapio slinkimo neturi būti.
- Platesnių ekranų išdėstymą derinkite prie patogaus naudojimo telefonu.
