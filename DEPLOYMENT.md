# Paleidimo kontrolinis sąrašas

1. Užpildykite `assets/business-config.js` tikrais rekvizitais ir komercinėmis sąlygomis.
2. Įrašykite produkcinį HTTPS adresą į `PUBLIC_SITE_URL` faile `assets/supabase-config.js`.
3. Paleiskite `python tests/readiness_check.py` — reali prekyba galima tik kai patikra baigiasi be trūkstamų laukų.
4. Paleiskite `python -m unittest discover -s tests -p "test_*.py" -v`.
5. Hostinge viešinkite tik HTML puslapius bei `assets` ir `css` katalogus. Neviešinkite `.env`, `supabase`, `tests`, Python failų, `assets/supabase-config.example.js` ar projekto įrankių katalogų.
6. Priverstinai naudokite HTTPS. HTML turi atsarginę CSP taisyklę, o vietiniai serveriai nustato saugumo antraštes, tačiau produkcinis hostingas arba reverse proxy turi nustatyti ir HTTP CSP su `frame-ancestors`, HSTS, `nosniff`, Referrer, Permissions, COOP bei CORP antraštes. Vien „GitHub Pages“ tam nepakanka.
7. „Supabase Auth“ nustatymuose įjunkite nutekėjusių slaptažodžių apsaugą ir bent 12 simbolių politiką. CAPTCHA įjunkite tik prijungę jos valdiklį bei tokeno perdavimą visose Auth formose. Prieš tikrų klientų duomenis taip pat paruoškite administratoriaus MFA registravimą ir serverinį `aal2` tikrinimą.
8. Pasirašykite / priimkite duomenų tvarkymo susitarimus su „Supabase“, hostingu, el. pašto, mokėjimo ir kitais asmens duomenų tvarkytojais.
9. Prijunkite mokėjimo ir transakcinio el. pašto teikėjus. Iki tol mokėjimo mygtukas lieka išjungtas, o elektroninių formų patvirtinimai nėra automatiškai siunčiami el. paštu.
10. Saugumo pakeitimus diekite `SECURITY.md` nurodyta tvarka: nustatykite tikslų Edge Functions `PUBLIC_SITE_URL`, komanda `supabase functions deploy` įdiekite visas funkcijas, tada frontend, atsarginę kopiją ir duomenų bazės migraciją. Po diegimo paleiskite „Supabase Security Advisor“ ir patikrinkite visus viešo, privataus, savininko bei administratoriaus srautus.
11. Panaikinkite visus anksčiau paviešintus slaptus raktus. Produkcijos paslaptys turi būti tik hostingo ar „Supabase Edge Functions Secrets“ saugykloje.
12. „GitHub Pages“ diegimas dabar yra rankinis. Workflow lange `backend_ready` pažymėkite tik įdiegę reikiamas Edge Functions; tai apsaugo gyvą svetainę nuo nesuderinto frontend paleidimo.
