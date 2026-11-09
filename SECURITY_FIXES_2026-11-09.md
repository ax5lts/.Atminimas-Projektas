**Saugumo pataisymai — galutinė būsena, 2026-11-09**

**Kodas publikuotas, frontend ir serverio pataisos veikia produkcijoje. Iš penkių radinių keturi sutvarkyti. Penktas — nutekėjusių slaptažodžių apsauga — nepasiekiamas esamame Supabase Free plane: teikėjas jį siūlo nuo Pro. Mokamas planas nepirktas.**

Svetainė: https://atminimokodas.lt/ . Supabase projektas: `tpwrkgdmtucecqxbpwwf`. Organizacija `Memori`: patikrintas `free` / `tier_free` planas.

Pagrindinis kodo commit: `8673424f8351b38a61210cc1c86949cc422bef71` (main). GitHub Actions patikros sėkmingos, Vercel publikavimas sėkmingas. Produkcijos `auth.js`, `mfa.js`, `memorial-page.js` sutampa su patikrintu surinkimu; HTML sutampa normalizavus Git eilučių pabaigas.

| Radinys | Galutinė būsena |
| --- | --- |
| Administratoriaus MFA neprivalomas | Sutvarkyta DB ir Edge Functions; administratoriui būtina aal2 sesija net prieš užregistruojant pirmą faktorių |
| Atminimo puslapio prieigos kodas ignoruojamas | Sutvarkyta serverio patikra, grupių turinys ir mobili kodo forma |
| Apeinami žvakių / prisiminimų limitai | Sutvarkyti patikimo IP identifikatoriai ir atominiai DB limitai |
| Failų kvotų nėra | Įdiegtos atominės paskyros ir puslapio kvotos |
| Nutekėjusių slaptažodžių apsauga išjungta | Free plano ribojimas; įjungti galima perėjus bent į Pro |

**Administratorių MFA.**

Serveris tikrą administratoriaus rolę nuskaito iš DB, ne iš kliento redaguojamo user_metadata. DB taisyklė ir visos jautrios Edge Functions reikalauja aal2 administratoriui, net jei jis dar neturi registruoto MFA faktoriaus. Įprastiems vartotojams be faktoriaus MFA registravimas išlieka savanoriškas; užregistravus patvirtintą faktorių aal2 privalomas.

Prisijungimo, administravimo, kliento zonos ir mokėjimo puslapiai nukreipia administratorių į `saugumas.html`. Iki patvirtinimo galima perskaityti tik savo rolę, kad veiktų registravimo nukreipimas; svetimų rolių skaitymas ir rašymas nesuteikiami. QR ir TOTP paslaptis neišsaugomi naršyklės saugyklose.

TOTP registravimas ir tikrinimas patikrinti ir su tikra laikina testine paskyra produkcijoje: gauta aal2 sesija. Testinė paskyra, faktorius ir sesijos pašalinti; DB patvirtino 0 likusių testinių paskyrų. Tikri administratorių telefonai ir jų faktoriai nekeisti. Laikinai panaudota apsaugota diagnostika išjungtoje email-test funkcijoje; funkcijai grąžintas pradinis išjungtas kodas ir JWT patikra. Laiškai nesiųsti.

**Abu administratoriai turi vieną kartą patys prijungti savo autentifikavimo programėlę per https://atminimokodas.lt/saugumas.html .** Kol to nepadarys, administratoriaus jautrūs veiksmai bus blokuojami. Tai veikiantis MFA reikalavimas, o ne likęs kodo diegimas.

**Prieigos kodai.**

profile-content grąžina 403 iki serverinio kodo patvirtinimo ir nepasirašo privačių failų nuorodų. Kodas siunčiamas tik POST JSON kūne, nesaugomas URL, sessionStorage ar localStorage. Esamas serverinis RPC taiko 5 nesėkmingų bandymų / 15 minučių blokavimą. Nesant patikimo IP kodo bandymas neleidžiamas. Atskirai apsaugoti grupės nariai neatskleidžiami bendrame turinyje; apsaugoto puslapio bendruomenės skiltis slepiama. Savininko / administratoriaus išimtis leidžiama tik patikrinus jo sesiją ir MFA.

**Viešo pateikimo limitai.**

CF-Connecting-IP nustato patikimas Cloudflare įėjimas. Kliento User-Agent, X-Forwarded-For ir X-Real-IP nekeičia ribojimo tapatybės; IPv6 normalizuojamas. DB saugomas HMAC identifikatorius, ne neapdorotas IP. Vienu atominiu veiksmu rezervuojami visi nepriklausomi limitai; nepraėjus vienam, visa rezervacija atšaukiama.

- Vienas IP tame pačiame puslapyje: 1 žvakė / val. arba 2 prisiminimai / 24 val.
- Vienas IP visoje svetainėje: 30 pateikimų / val.
- Vienas puslapis: 1000 žvakių / val. arba 100 prisiminimų / 24 val.
- Visa svetainė: 10000 pateikimų / val.

Limitų langai prasideda nuo pirmo pateikimo. Viešas apsaugotų puslapių bendruomenės skaitymas ir rašymas neleidžiami. Seni skaitikliai valomi ribotu kiekiu. Bendrą IP turintys lankytojai dalijasi IP limitu.

**Failų kvotos.**

| Apimtis | Talpa | Failai | Ne tušti apskaitos aplankai |
| --- | --- | --- | --- |
| Paskyra, atminimo failai ir pateiktos kapaviečių nuotraukos kartu | 1 GiB | 256 | 32 |
| Atminimo puslapio aplankas | 256 MiB | 32, įskaitant versijas | — |
| Paskyros kapaviečių nuotraukų pateikimai | 256 MiB | 64 | Viena bendra apimtis |

Vieno failo ribos: atminimas 50 MiB, grave-photo-submissions 8 MiB. Failus galima įkelti prieš išsaugant profilį. Keitimas apskaito dydžio skirtumą, ištrynimas atlaisvina kvotą. Nežinomo dydžio tarpinė užklausa rezervuoja failo maksimumą.

Trys storage.objects AFTER STATEMENT trigeriai apskaito galutinį rašymą ir saugo nuo lygiagrečių įkėlimų bei Storage privilegijuoto užbaigimo. Jie nerašo failų metaduomenų; apskaita laikoma privačiose lentelėse. Bootstrap suskaičiavo esamus failus, jų nekeitė ir netrynė. Po diegimo apskaita sutikrinta su tikrais objektais. Tai valdomos Storage schemos papildymas, todėl po Storage atnaujinimų būtina pakartoti kvotų regresinius testus.

**Įdiegtos migracijos.**

- 20261109100240_memorial_engagement_atomic_limits.sql
- 20261109100241_storage_owner_quotas.sql
- 20261109121128_require_admin_mfa.sql

Vietiniai pavadinimai sulyginti su produkcijos migracijų istorija.

**Įdiegtos Edge Functions.**

| Funkcija | Versija |
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

Funkcijos įdiegtos su visomis santykinėmis priklausomybėmis. Pradiniai JWT gateway nustatymai išlaikyti; viešos funkcijos pačios taiko atitinkamas prieigos patikras. Tarpinis privacy-only diegimo rinkinys jau pakeistas pagrindiniu griežtu MFA kodu.

**Patikros.**

- 208 Python ir 38 Node testai praėjo.
- Deno Edge testų aibė praėjo; po papildomo MFA scenarijaus atskirai praėjo 3 MFA testai, įskaitant tikros rolės nuskaitymą ir neįregistruoto administratoriaus aal1 atmetimą.
- Surinkimas ir 3 verify-build testai praėjo.
- Izoliuotas Chrome: naujas prisijungimas ir esama administratoriaus aal1 sesija nukreipiami į MFA; registravimas, klaidingas kodas, pakartojimas, aal2 ir administravimo prieiga veikia. Kodai / paslaptys išvalomi.
- Prieigos kodo forma patikrinta 320, 390 ir 1440 px pločiuose.
- Izoliuotos PostgreSQL kvotų, ribojimo ir MFA SQL patikros praėjo.
- Tikras izoliuotas PostgreSQL 17: keturi 12 lygiagrečių užklausų kvotų ribų scenarijai praleido tik leistiną vieną įrašą; 20 lygiagrečių žvakės užklausų praleido vieną.
- Produkcijoje su ROLLBACK praėjo kvotų, pateikimo limitų ir griežto MFA SQL testai; kvotų testui naudota laikina metaduomenų lentelė.
- Produkcijos OPTIONS patvirtino patikimo IP antraštės prieinamumą. Vercel pagrindinio domeno HTML / JavaScript atitinka patikrintą surinkimą.
- GitHub Actions ir Vercel kodo commit publikavimas sėkmingi.

Pakartojimo komandos:

```powershell
python -m unittest discover -s tests -p 'test_*.py' -q
node --test tests/*.test.cjs
pnpm dlx deno test --node-modules-dir=none --allow-env --allow-net supabase/functions
node scripts/build.mjs
node --test tests/verify-build.cjs
node tests/security-database-isolated.mjs '<testavimo-priklausomybiu-katalogas>'
node tests/security-database-concurrency.mjs '<testavimo-priklausomybiu-katalogas>'
```

**Plano ribojimas.**

Supabase organizacijos planas patikrintas: Free. Pagal [oficialią dokumentaciją](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) nutekėjusių slaptažodžių apsauga teikiama nuo Pro. Security Advisor šį perspėjimą vis dar rodo. Tai neišjungta kodo pataisa ir jos negalima įjungti esamame plane. Mokamam plano pakeitimui reikėtų atskiro sprendimo dėl kainos; plano ir apmokėjimo duomenys nekeisti. Prie paskyros neprijungta nauja mokama paslauga.

Tikrinti teises per esamą Supabase prijungimą, vietinį CLI, projekto konfigūraciją ir GitHub Actions prieigas. Valdymo API žetono nėra, bet TOTP parengtis tiesiogiai patvirtinta realiu registravimo / tikrinimo srautu, todėl MFA diegimas užbaigtas.

**Atkūrimas ir likę asmeniniai veiksmai.**

Ankstesni funkcijų šaltiniai: .codex-qa/security-before-2026-11-09/edge-functions.json . Ankstesnė MFA SQL funkcija ir ACL papildomai išsaugotos tame pačiame aplanke. Tai kodo ir tikslinės schemos kopija, ne visos DB / failų atsarginė kopija. Užduoties metu tikri klientų duomenys, mokėjimai ir siuntos nekeisti. Testinės Auth paskyros pašalintos; tikrų vartotojų faktoriai nekeisti.

Kiekvieno administratoriaus autentifikavimo programėlės prijungimą turi atlikti pats paskyros valdytojas savo telefone. Tam paruošta ir produkcijoje patikrinta visa serverio bei sąsajos eiga. Atkūrimas praradus programėlę turi remtis tapatybės patikra; viešo MFA apėjimo nėra.

Ankstesni naudotojo pakeitimai išsaugoti. Prisijungimo pataisa ir jos regresiniai testai įtraukti į publikuotą kodą. Pašaliniai output, AGENTS.md, DEBUG ir ne šios užduoties failai į kodo commit neįtraukti. Slaptų raktų, TOTP paslapčių ar klientų turinio ataskaitoje nėra.
