# Supabase backend

Naujam pokalbiui pradėti skaitykite [bendras instrukcijas](../AGENTS.md), [backend žemėlapį](../docs/BACKEND.md) ir [paskutinę patikrintą būseną](../docs/PROJECT_STATE.md). Tikslūs vietiniai importai bei gateway nustatymai yra [generuojamame žemėlapyje](../docs/GENERATED_MAP.md).

## Šaltiniai ir atkūrimo ribos

`migrations/` yra vietinių DB pakeitimų šaltinis. `schema.sql` yra ankstyvas bazinis schemos aprašas, o ne dabartinės produkcijos dump. Repozitorija turi žinomų neatitikimų su produkcija: prieigos kodų bei dalies automatizavimo kūrimo SQL ir kelių produkcijos funkcijų vietinių šaltinių trūksta. Jų nebuvimas nėra įrodymas, kad produkcijoje jie neveikia.

Prieš naujos aplinkos atkūrimą, migracijų perleidimą ar produkcijos pakeitimą palyginkite tikrą nuotolinę istoriją ir reikiamus objektus. Vien `schema.sql` ir visų vietinių failų paleidimas nėra patikrinta pilno atkūrimo procedūra. Jau įdiegtų migracijų neperrašykite kaip naujų pakeitimų.

## Dabartinės sutartys

- Naujas atminimo profilis pagal nutylėjimą neviešas; paskelbimą valdo savininkas.
- Privatus turinys ir failų nuorodos gaunami per tikrinamą `profile-content`; prieigos kodas ir grupės neturi apeiti privatumo.
- Užsakymų / pasiūlymų duomenys ribojami savininkui bei administratoriui; administratoriui būtinas MFA `aal2`.
- Įkėlimai tikrinami pagal vartotojo UUID ir kelią. Saugyklos privačios, failų kiekį ir talpą riboja atominė DB apskaita.
- Mokamų QR lentelių kelias yra `profile-manage` → `payment-create` → Paysera webhook; autoritetingos sumos ir būsena nustatomos serveryje.
- Senas išankstinių užsakymų `preorder` endpoint uždarytas (410). Jis nėra dabartinis mokamų užsakymų kelias.
- Viešos teisinės ir turinio užklausos priimamos tik per tikrinamus galinius taškus; jų skaitymo ir administravimo teisės ribotos.

Pakeitus bendrą `_shared` failą reikia atskirai įdiegti visas susijusias funkcijas su jų priklausomybėmis. `config.toml` yra vietinė konfigūracija: redagavimas savaime nepakeičia produkcijos Auth ar gateway.

Procedūros: [DEPLOYMENT.md](../DEPLOYMENT.md), [SECURITY.md](../SECURITY.md), [Paysera konfigūracija](PAYSERA_SETUP.md), [automatika](AUTOMATION_SETUP.md). SQL testų ir izoliuotų scenarijų eiga aprašyta [BACKEND.md](../docs/BACKEND.md).
