# Svetainės ir indeksavimo patikra — 2026-09-14

## Pataisymų būsena po audito

Atnaujinta kliento zonos kaina į „nuo 50 €“, įrašyti Resend / Vercel / Supabase teikėjai ir esamo 5 × 5 cm plieninio gaminio aprašymas. Privatumo puslapyje patikslinti faktiniai paslaugų teikėjai. GA4 palikta išjungta; tuščias neprivalomos analitikos ID nebelaikomas prekybą blokuojančia klaida. Atnaujintos diegimo instrukcijos.

Įdiegta migracija `20260914190718_audit_mfa_guards_and_indexes.sql`: pridėti 3 trūkstami indeksai ir ribojančios MFA politikos viešos schemos lentelėms bei Storage. Owner RPC ir devynios interaktyvios Edge Functions saugomos nuo patvirtintą MFA turinčios paskyros prieigos su `aal1`. Pridėtas `saugumas.html` autentifikavimo programėlės prijungimui, kodui patvirtinti ir faktoriui pašalinti. TOTP paslaptis naršyklės saugyklose neišsaugoma.

**Dar neužbaigta:** abi administratoriaus paskyros turi pačios prijungti telefonus; MFA dar neprivaloma paskyroms, kurios neturi patvirtinto faktoriaus. Nutekėjusių slaptažodžių apsauga tebėra išjungta, nes šiame seanse nėra prieigos prie Supabase Auth nustatymų. Search Console ir indeksavimo prašymai laukia prijungtos naršyklės. Neprijungtiems administratoriams nebuvo įjungtas prieigą užblokuojantis reikalavimas.

Po migracijos neliko neindeksuotų išorinių raktų radinių. Likę Security Advisor įspėjimai: nutekėjusių slaptažodžių apsauga, du savininką ir MFA tikrinantys SECURITY DEFINER RPC; dvi vidinės lentelės be RLS politikų yra uždaros. Toliau pateikta originali audito ataskaita aprašo būseną iki pataisymų.

Patikrinta produkcija `https://atminimokodas.lt/`, leidimas `64ad93c`, ir Supabase projektas `tpwrkgdmtucecqxbpwwf`. Tai HTTP, konfigūracijos, kodo ir prieigos patikra, ne išsamus įsilaužimo bandymas. Šios patikros metu produkcijos duomenys ir nustatymai nekeisti, mokėjimai ir laiškai nesiųsti.

## Svarbiausi radiniai

| Prioritetas | Radinys ir įrodymas | Ką daryti |
| --- | --- | --- |
| Aukštas | Abi 2 svetainės administratoriaus paskyros neturi patvirtinto MFA faktoriaus (`auth.mfa_factors`). Kode nėra administratoriaus `aal2` reikalavimo. Tai padidina paskyros perėmimo pasekmes; perėmimo įrodymų ši patikra nenustatė. | Paruošti MFA registravimą ir prisijungimą, administratoriams įjungti antrą veiksnį, tada riboti kritinius veiksmus serverio pusėje. Vien reikalavimo įjungimas dabar galėtų užblokuoti administravimą. |
| Vidutinis | Supabase Security Advisor: `auth_leaked_password_protection` išjungta. | Įjungti nutekėjusių slaptažodžių tikrinimą, patikrinus projekto plano galimybes. |
| Vidutinis | `assets/business-config.js` neužpildyti `emailProvider`, `hostingProvider`, `productIdentifier`. `tests/readiness_check.py` baigiasi klaida. | Teikėjai jau žinomi iš diegimo: Resend ir Vercel (backend — Supabase). Patikslinti viešai pateikiamus teikėjus bei tikrą produkto identifikatorių. Produkto identifikatorius šioje patikroje neišgalvotas. |
| Žemas | `assets/user.js:431` tuščios paskyros pranešimas vis dar sako „už 60 €“, nors paprasta QR lentelė kainuoja 50 €. Parduotuvėje rodoma 50 / 60 € teisingai. | Pakeisti pranešimą į „nuo 50 € ir pristatymo kainą“ arba naudoti katalogo kainą. |
| Žemas | GA4 matavimo ID tuščias, todėl `assets/analytics.js` neįjungia analitikos. | Jei norima lankomumo analitikos, įrašyti tikrą GA4 ID. Tai nėra Google indeksavimo sąlyga ar savaiminė saugumo spraga. Esamas pasirengimo testas šį lauką traktuoja pernelyg griežtai. |
| Žemas | 3 išoriniai raktai neturi atskirų indeksų: `grave_photo_submissions.reviewed_by`, `paslaugu_uzklausos.quote_sent_by`, `service_quote_settings.updated_by`. | Vertinti pagal užklausų ir lentelių dydį. Tai našumo patarimai, ne duomenų nutekėjimas. 27 „unused index“ radiniai savaime nėra priežastis šalinti indeksus. |
| Žemas | `SECURITY.md` likę seni teiginiai apie GitHub Pages ir neveikiančius mokamus užsakymus, nors dabartinė produkcija publikuojama GitHub–Vercel keliu ir naudoja Paysera. | Atnaujinti eksploatavimo instrukcijas, kad kitas diegimas nesiremtų pasenusiu aprašu. |

MFA radinys susijęs su svetainės administratoriaus paskyromis Supabase Auth. Jis nieko nepasako apie atskirų Supabase organizacijos ar GitHub paskyrų MFA — jų ši patikra nenustatė.

## Kas patikrinta sėkmingai

- Patikrinti 22 HTML adresai: 21 grąžina HTTP 200; senas išankstinio užsakymo adresas teisingai grąžina 308 į parduotuvę.
- Patikrintos 43 papildomos vidinės nuorodos ir HTML nurodyti ištekliai: visi grąžino HTTP 200. Tai neapima visų dinamiškai sukuriamų nuorodų ir visų CSS paveikslų.
- Neegzistuojantis adresas grąžina tikrą 404. Tiesioginis `404.html` grąžina 200 su `noindex`; jis neįtrauktas į sitemap.
- `.env`, `.env.local`, `.git/config`, `supabase/config.toml`, `package.json` produkcijoje grąžina 404.
- Visuose 21 HTTP 200 HTML atsakymuose yra CSP, HSTS, `nosniff`, Referrer Policy, X-Frame-Options ir Permissions Policy antraštės.
- HTTP, www, senas Vercel domenas ir `/index.html` nuosekliai nukreipiami į kanoninį HTTPS adresą.
- Supabase `public` schemoje nerasta lentelių ar peržiūrų be RLS apsaugos. Visos 4 failų saugyklos privačios, nustatyti failų dydžio limitai.
- 7 tiesioginės anoniminės REST skaitymo užklausos į profilius, užsakymus, roles, paslaugų užklausas, medijas, išankstinius užsakymus ir nuotraukų pateikimus atmestos HTTP 401 / SQL `42501`. Tikri įrašai nebuvo išvesti į ataskaitą.
- Viešos `SECURITY DEFINER` funkcijos anoniminei rolei nevykdomos. `accept_my_service_quote` ir `decline_my_service_quote` tikrina prisijungimą, atmeta anoniminę paskyrą ir reikalauja `owner_id = auth.uid()`. Advisor perspėjimas šiais dviem atvejais savaime neįrodo spragos.
- RLS lentelės be politikų yra uždaros įprastoms rolėms; vien dėl informacinio perspėjimo prieigos politikos nepridėtos.
- `pnpm audit`: 0 žinomų pažeidžiamumų šiame Node priklausomybių medyje. Tai ne visų Deno/npm/jsr backend priklausomybių auditas.
- Viešo `dist/` teksto patikra nerado tikrintų slaptų raktų žymenų (`sk_live_`, `sk_test_`, `sb_secret_`, privataus rakto antraštės, `service_role`). Tai ne visų galimų paslapčių aptikimo garantija.

Prieš šį auditą dabartinis leidimas praėjo 32 Node, 206 Python ir 10 Deno testų, mobiliojo / kompiuterio redaktoriaus patikras ir produkcijos redaktoriaus bei viešo atminimo puslapio bandymą. Kodas nuo leidimo nepakeistas. Šio audito metu prisijungto kliento, administratoriaus ir realaus mokėjimo srautai iš naujo naršyklėje nevykdyti, nes prijungtos naršyklės nėra.

## Google ir indeksavimas

Sitemap turi 10 viešų adresų. Visi grąžina HTTP 200, turi aprašymą, vieną H1 ir teisingą kanoninį adresą. `noindex` jiems nenustatytas. `robots.txt` leidžia nuskaitymą ir nurodo teisingą sitemap.

Tikrinimui Search Console paruošti adresai:

1. https://atminimokodas.lt/
2. https://atminimokodas.lt/parduotuve.html
3. https://atminimokodas.lt/kapu-ieskojimas.html
4. https://atminimokodas.lt/kapu-prieziura.html
5. https://atminimokodas.lt/rekvizitai.html
6. https://atminimokodas.lt/taisykles.html
7. https://atminimokodas.lt/privatumas.html
8. https://atminimokodas.lt/grazinimas.html
9. https://atminimokodas.lt/pranesti.html
10. https://atminimokodas.lt/prieinamumas.html

Redaktorius, administravimas, kliento zona, prisijungimas, mokėjimas ir atminimo puslapių šablonas sąmoningai turi `noindex`. Jų nereikia įtraukti į sitemap ar prašyti indeksuoti vien dėl naujo grupinio QR atnaujinimo. `noindex` nėra prieigos apsauga; privatūs duomenys saugomi per autentifikaciją ir serverio teises.

**Search Console nepasiekta.** Prijungtų naršyklių sąrašas tuščias, in-app browser įrankis grąžino „Browser is not available: iab“, Search Console jungties nėra. Vartotojui pateiktas prašymas prijungti naršyklę. Todėl faktinis Google indeksavimo statusas, Google pasirinkti canonical, Search Console saugumo / manual action ataskaitos ir Core Web Vitals nepatikrinti. Indeksavimo prašymai ir sitemap pateikimas nevykdyti. HTTP 200 ir taisyklingas sitemap nėra įrodymas, kad Google adresą indeksavo.

Prijungus Search Console: pasirinkti atminimokodas.lt nuosavybę, patikrinti Sitemap / Page indexing / Security issues / Manual actions ataskaitas; prioritetiniams viešiems adresams atlikti URL inspection ir Live test, tada prašyti indeksavimo ten, kur adresas dar neindeksuotas arba Google mato seną versiją. Privatiems adresams prašymų neteikti. Google pats sprendžia, kada nuskaityti ir ar indeksuoti.

## Šaltiniai ir patikrų failai

- [Google: indeksavimo užklausa](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- [Google: sitemap pateikimas](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Supabase: produkcijos patikra](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase: nutekėję slaptažodžiai](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- [Supabase: SECURITY DEFINER radiniai](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Supabase: RLS be politikų](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Supabase: neindeksuoti išoriniai raktai](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- Vietiniai įrodymai: `tmp/site-audit-live.json`, `tmp/security-live-probes.json`, `tmp/dependency-audit.json`.
