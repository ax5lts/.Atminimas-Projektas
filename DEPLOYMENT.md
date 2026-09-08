# Paleidimo kontrolinis sąrašas

## 2026-09-09 atnaujinimo būsena

Produkciniam projektui `tpwrkgdmtucecqxbpwwf` pritaikytos trys lentelių dizaino ir kainos migracijos (jų failų versijos sutampa su nuotoline migracijų istorija). Įdiegtos `profile-manage` v15, `production-email` v7, `automation-worker` v7, `parcel-lockers` v8 ir `profile-content` v11. Patikra su `service_role` ir `ROLLBACK` patvirtino visus 12 derinių, 6000 ct kainą, pakartotinio užsakymo idempotentiškumą, savininko tikrinimą ir dizaino nekintamumą.

**El. laiškų automatika dar nepaleista:** patikros metu nėra suplanuoto `automation-worker` paleidimo, eilėje yra 3 laukiantys įvykiai ir nė vieno apdoroto. Prieš įjungiant periodinį vykdymą patikrinkite `RESEND_API_KEY`, `EMAIL_FROM` ir `AUTOMATION_SECRET`, peržiūrėkite esamą eilę ir sukonfigūruokite apsaugotą funkcijos paleidimą. Šiuo atnaujinimu tikri laiškai nesiųsti. Naujas gavėjas ir tekstiniai / QR priedai yra įdiegtame kode, bet vien funkcijos įdiegimas siuntimo neįjungia.

## Diegimo eiga

QR lentelių ir kapavietės priežiūros mokėjimams per „Paysera“ vykdykite [supabase/PAYSERA_SETUP.md](supabase/PAYSERA_SETUP.md).

1. Užpildykite `assets/business-config.js` tikrais rekvizitais ir komercinėmis sąlygomis.
2. Įrašykite produkcinį HTTPS adresą į `PUBLIC_SITE_URL` faile `assets/supabase-config.js`.
3. Įrašykite tikrą GA4 matavimo ID (`G-...`) faile `assets/analytics-config.js`; analitika įsijungs tik lankytojui sutikus.
4. Paleiskite `python tests/readiness_check.py` — reali prekyba galima tik kai patikra baigiasi be trūkstamų laukų.
5. Paleiskite `python -m unittest discover -s tests -p "test_*.py" -v`.
6. Paleiskite `pnpm install --frozen-lockfile`, `pnpm test` ir `pnpm build`; viešinkite tik sugeneruoto `dist/` katalogo turinį. Vercel tai nustatyta `vercel.json`. Rinkinyje yra HTML, `robots.txt`, `sitemap.xml`, `assets`, `css` ir Paysera patvirtinimo failas. `.env`, `supabase`, `tests`, Python failai ir projekto įrankiai nekopijuojami. Prijungus kitą domeną atnaujinkite `robots.txt`, `sitemap.xml` ir `PUBLIC_SITE_URL`.
7. Priverstinai naudokite HTTPS. HTML turi atsarginę CSP taisyklę, o vietiniai serveriai nustato saugumo antraštes, tačiau produkcinis hostingas arba reverse proxy turi nustatyti ir HTTP CSP su `frame-ancestors`, HSTS, `nosniff`, Referrer, Permissions, COOP bei CORP antraštes. Vien „GitHub Pages“ tam nepakanka.
8. „Supabase Auth“ nustatymuose įjunkite nutekėjusių slaptažodžių apsaugą ir bent 12 simbolių politiką. CAPTCHA įjunkite tik prijungę jos valdiklį bei tokeno perdavimą visose Auth formose. Prieš tikrų klientų duomenis taip pat paruoškite administratoriaus MFA registravimą ir serverinį `aal2` tikrinimą.
9. Pasirašykite / priimkite duomenų tvarkymo susitarimus su „Supabase“, hostingu, el. pašto, mokėjimo ir kitais asmens duomenų tvarkytojais.
10. QR lentelių `payment-create` naudoja Paysera Checkout Modern. Kainos imamos iš serverio katalogo; testiniai mokėjimai neįjungia užsakymo vykdymo. El. pašto teikėją prijunkite tik toms automatikoms, kurios realiai siunčia pranešimus.
11. Saugumo pakeitimus diekite `SECURITY.md` nurodyta tvarka: nustatykite tikslų Edge Functions `PUBLIC_SITE_URL`, komanda `supabase functions deploy` įdiekite visas funkcijas, tada frontend, atsarginę kopiją ir duomenų bazės migraciją. Po diegimo paleiskite „Supabase Security Advisor“ ir patikrinkite visus viešo, privataus, savininko bei administratoriaus srautus.
12. Panaikinkite visus anksčiau paviešintus slaptus raktus. Produkcijos paslaptys turi būti tik hostingo ar „Supabase Edge Functions Secrets“ saugykloje.
13. `.github/workflows/pages.yml` vykdo kodo patikras ir bandomąjį svetainės surinkimą. Šis workflow svetainės neviešina. Produkcinį frontend viešina Vercel iš `dist/`; pakeistas Edge Functions įdiekite atskirai.
14. Mokamiems QR lentelių užsakymams pirmiausia pritaikykite `20260907205618_paysera_product_orders.sql`, tada įdiekite `profile-manage`, `payment-create`, `paysera-webhook` ir naujus PREORDER pateikimus uždarančią `preorder`. Po DB regresinių testų su `ROLLBACK` ir Edge patikrų viešinkite frontend. Ankstesni `preorder_requests` įrašai lieka istorijai; jie automatiškai nekonvertuojami į mokamus užsakymus.

15. Spalvų ir raštų pasirinkimams pritaikykite `20260908214123_plaque_design_options.sql`, įdiekite `profile-manage` ir `production-email`, tada publikuokite frontend. Migracija prideda užsakymo dizainą, išjungia ASA katalogo įrašą ir palieka senus užsakymus istorijai.
16. Naujai 60 € kainai pritaikykite `20260908214134_plaque_price_60.sql` prieš frontend publikavimą. Su 3 € pristatymu naujas užsakymas kainuoja 63 €; ankstesnių užsakymų kainos nekeičiamos. Įdiekite `automation-worker`: pardavėjo naujo užsakymo ir gamybos kopijose įrašoma išsaugota spalva, rašto numeris ir pavadinimas. Gavėjas – tik `atminimokodas@gmail.com` (konstanta `ORDER_COPY_EMAIL`). Automatiniam siuntimui turi veikti worker paleidimas, `RESEND_API_KEY` ir `EMAIL_FROM`; nesukonfigūruotas siuntimas pažymimas automatikos žurnale. Pasirinkimai ir jų peržiūra rodomi parduotuvėje, redaktorius juos tik perduoda užsakymui.
17. Paprastam ketvirtam variantui pritaikykite `20260908214135_plain_qr_variant.sql`, tada įdiekite `profile-manage`, `production-email` ir `automation-worker` bei frontend. Naujo ketvirto varianto kodas – `plain` (tik QR); senas `star` paliekamas istorijai. Visos naujų lentelių peržiūros ir gamybos kopijos nurodo 5 × 5 cm. Naujo užsakymo el. laiške pridedama tekstinė kopija su spalva, variantu ir užsakymo numeriu; klientui patvirtinus gamybą – papildomai jo QR SVG failas persiuntimui tiekėjui. Parduotuvės QR peržiūra yra tik pavyzdys.
