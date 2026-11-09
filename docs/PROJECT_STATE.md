# Paskutinė patikrinta projekto būsena

**Patikros data: 2026-11-09.** Tai užfiksuoti faktai, ne automatinis produkcijos stebėjimas. Prieš vėlesnį diegimą tikrinkite Git istoriją ir realias paslaugų versijas.

## Produkcija ir diegimas

- Svetainė: https://atminimokodas.lt/ . Frontendą iš GitHub `main` publikuoja Vercel, rinkdamas tik `dist/`.
- Repozitorija: `ax5lts/.Atminimas-Projektas`. Supabase projektas: `tpwrkgdmtucecqxbpwwf`, regionas `eu-west-1`.
- Paskutinis šio saugumo leidimo kodo commit: `8673424f8351b38a61210cc1c86949cc422bef71`. Ataskaitos commit: `f4fb0afe4e63cbc613169c2ab5b713e909a09405`. Abiejų CI ir Vercel publikavimas patikrinti sėkmingai. Vėlesni dokumentacijos commit savaime nėra naujas paslaugų elgesio patvirtinimas.
- Vercel ir Supabase yra atskiri diegimai. Dabartinė `.vercel/project.json` ar vietiniai env failai gali egzistuoti tik viename kompiuteryje; jie nepakeičia sekamų instrukcijų.

## Veikianti saugumo būsena

- Administratoriui būtinas `aal2` net neužregistravus pirmo MFA faktoriaus. Rolė tikrinama DB, ne `user_metadata`. Savo rolės SELECT paliktas prieinamas registravimo nukreipimui.
- Produkcijoje realia laikina paskyra patvirtinti TOTP registravimas, kodo tikrinimas ir `aal2`; paskyra / faktorius / sesijos pašalinti. Tai neįregistravo tikrų administratorių telefonų.
- `profile-content` iki serverinio prieigos kodo patvirtinimo negrąžina apsaugoto turinio ar pasirašytų failų nuorodų. Apsaugoti grupės nariai neatskleidžiami per grupę.
- Viešiems pateikimams veikia patikimo IP HMAC ir atominiai limitai. Storage veikia paskyros ir puslapio kvotos, apskaita patikrinta su esamais failais.
- Supabase organizacija `Memori` tikrinta naudojanti Free planą. Nutekėjusių slaptažodžių apsauga išjungta ir pagal teikėjo planą prieinama nuo Pro. Mokamas planas nekeistas.

Visa patikros apimtis ir ribos yra [saugumo ataskaitoje](../SECURITY_FIXES_2026-11-09.md).

## Paskutinio leidimo serverio versijos

| Funkcija | Patikrinta versija |
| --- | --- |
| profile-manage | 20 |
| profile-content | 16 |
| grave-photo | 7 |
| service-flow | 9 |
| payment-create | 8 |
| document-download | 8 |
| shipping-create | 7 |
| production-email | 10 |
| ops-assistant | 6 |
| memorial-engagement | 6 |
| email-test | 8, grąžintas pradinis išjungtas kodas ir JWT patikra |

Naujos pritaikytos migracijos: `20261109100240_memorial_engagement_atomic_limits.sql`, `20261109100241_storage_owner_quotas.sql`, `20261109121128_require_admin_mfa.sql`.

## Kas naujam pokalbiui svarbu

- Mokami QR užsakymai dabartiniame kode turi Paysera srautą. `preorder` yra uždarytas istorinis galinis taškas (410). Senesni aprašai, teigiantys, kad visi mokami užsakymai išjungti, pasenę.
- `schema.sql` ir vietinės migracijos nėra pilnas patikrintas produkcijos atkūrimo rinkinys. Yra ankstesnių nuotolinių migracijų / pagalbinių funkcijų, kurių šaltiniai čia nebuvo susinchronizuoti. Žr. [backend aprašą](BACKEND.md), prieš atstatymą palyginkite istorijas.
- Vietiniame functions kataloge nėra visų patikrintų produkcijos funkcijų: pvz., `help-chatbot`, `ops-monitor`, `resend-webhook`, `email-test`. Nešalinkite jų ir nelaikykite neveikiančiomis vien dėl vietinio failo nebuvimo.
- Tikrų paskyrų TOTP registravimą atlieka jų savininkai telefonu. Nenustatykite faktoriaus už naudotoją ir nekurkite MFA apėjimo.
- Pokalbio metu buvę pašaliniai `output/`, `DEBUG_2026-09-23.md`, `tests/login.browser.cjs` failai išsaugoti; jų nereikia nei build, nei naujo pokalbio pradžiai.

## Kaip atnaujinti šį failą

Po realaus patikrinimo pakeiskite datą, įrodymų commit / diegimo versijas, aktualius ribojimus ir nebaigtus darbus. Atskirai įrašykite „paruošta vietoje“, „įdiegta“ ir „patikrinta produkcijoje“. Nekopijuokite planuojamų versijų kaip jau veikiančių. Nekaupkite čia viso darbų dienoraščio; ankstesni leidimai lieka Git istorijoje ir datuotose ataskaitose.
