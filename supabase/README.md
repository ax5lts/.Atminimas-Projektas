# Supabase pakeitimai

Produkcinė duomenų bazė jau atnaujinta. `migrations/` failų versijos sutampa su produkcinės bazės migracijų istorija. Kadangi pradinis projektas buvo sukurtas dar prieš migracijų istoriją, naujam visiškai tuščiam projektui pirmiausia vieną kartą taikykite `schema.sql`, tada visus failus iš `migrations` pagal pavadinimo tvarką.

Repozitorijoje taip pat laikomas visų produkcijoje veikiančių Edge Functions šaltinis, įskaitant `qr-code` ir `parcel-lockers`. Funkcijų paslaptys turi būti saugomos tik Supabase Secrets, ne šiame aplanke.

Svarbiausi saugumo principai:

- naujas profilis pagal nutylėjimą yra neviešas;
- profilį paskelbti ar paslėpti gali jo savininkas;
- užsakymus mato tik savininkas ir administratorius;
- failus galima kelti tik į prisijungusio vartotojo UUID aplanką;
- sutarties atsisakymai ir turinio pranešimai leidžiami pateikti viešai, bet juos skaityti ir administruoti gali tik administratorius;
- gavėjo ir siuntos duomenys keičiami tik per patikrintas funkcijas bei RLS taisykles.

Po kiekvieno schemos pakeitimo paleiskite „Supabase Security Advisor“ ir testus.
