# Supabase pakeitimai

Produkcinė duomenų bazė jau atnaujinta. Naujam projektui pirmiausia taikykite `schema.sql`, tada visus failus iš `migrations` pagal datos ir pavadinimo tvarką.

Svarbiausi saugumo principai:

- naujas profilis pagal nutylėjimą yra neviešas;
- profilį paskelbti ar paslėpti gali jo savininkas;
- užsakymus mato tik savininkas ir administratorius;
- failus galima kelti tik į prisijungusio vartotojo UUID aplanką;
- sutarties atsisakymai ir turinio pranešimai leidžiami pateikti viešai, bet juos skaityti ir administruoti gali tik administratorius;
- gavėjo ir siuntos duomenys keičiami tik per patikrintas funkcijas bei RLS taisykles.

Po kiekvieno schemos pakeitimo paleiskite „Supabase Security Advisor“ ir testus.
