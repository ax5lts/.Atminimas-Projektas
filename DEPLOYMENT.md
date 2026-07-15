# Paleidimo kontrolinis sąrašas

1. Užpildykite `assets/business-config.js` tikrais rekvizitais ir komercinėmis sąlygomis.
2. Įrašykite produkcinį HTTPS adresą į `PUBLIC_SITE_URL` faile `assets/supabase-config.js`.
3. Paleiskite `python tests/readiness_check.py` — reali prekyba galima tik kai patikra baigiasi be trūkstamų laukų.
4. Paleiskite `python -m unittest discover -s tests -p "test_*.py" -v`.
5. Hostinge viešinkite tik HTML puslapius bei `assets` ir `css` katalogus. Neviešinkite `.env`, `supabase`, `tests`, Python failų, `assets/supabase-config.example.js` ar projekto įrankių katalogų.
6. Priverstinai naudokite HTTPS. Saugumo antraštės jau nustatytos `serve.py` ir `app.py`, tačiau produkcinis hostingas taip pat turi jų nepašalinti.
7. „Supabase Auth“ nustatymuose įjunkite nutekėjusių slaptažodžių apsaugą, bent 12 simbolių politiką, CAPTCHA ir administratoriaus MFA.
8. Pasirašykite / priimkite duomenų tvarkymo susitarimus su „Supabase“, hostingu, el. pašto, mokėjimo ir kitais asmens duomenų tvarkytojais.
9. Prijunkite mokėjimo ir transakcinio el. pašto teikėjus. Iki tol mokėjimo mygtukas lieka išjungtas, o elektroninių formų patvirtinimai nėra automatiškai siunčiami el. paštu.
