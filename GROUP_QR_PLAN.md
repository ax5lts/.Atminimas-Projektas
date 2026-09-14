# Grupinis QR

Tikslas: vienu QR kodu atverti kelių žmonių atminimą ir leisti redaktoriuje kiekvieną žmogų kurti atskirai.

## Įgyvendintas planas

1. Redaktoriaus viršuje pasirinkimas vienam žmogui arba grupei; iki 8 žmonių, slenkamos nuotraukų kortelės ir nuotraukų įkėlimo mygtukas.
2. Atskiri vardai, datos, istorijos, nuotraukos, video, subtitrai, dizainas ir pakeitimų istorija kiekvienam žmogui. Juodraščio failai atskirti pagal žmogų.
3. Pirmasis žmogus išlaiko pagrindinio puslapio ID ir QR. Papildomi įrašai susiejami per `group_members`; jų savininkas turi sutapti. Privati grupė prieinama tik savininkui / administratoriui, viešos grupės turinys pateikiamas per pagrindinį puslapį.
4. Viešame puslapyje žmogus pasirenkamas nuotraukos kortele. Kliento zonoje grupė rodoma viena kortele.
5. Patikrintas juodraščio atkūrimas su nuotraukomis, pakartotinis išsaugojimas, nutrūkusio grupavimo pakartojimas be dublikatų, žmonių pašalinimas ir grįžimas prie vieno žmogaus.

## Patikros

- `node --test tests/*.test.cjs`: 31 testas.
- `python -m unittest discover -s tests -p 'test_*.py'`: 206 testai.
- Deno: `profile-content`, bendrojo `core` ir `profile-manage/group_test.ts` testai; 10 testų, įskaitant prieigos ir savininko tikrinimus.
- `tests/group-editor.browser.cjs`: tikras redaktorius Chrome naršyklėje su izoliuotu API pakaitalu, 390 ir 1440 px ekranuose. Mokėjimai ir tikrų žmonių įrašai nekuriami.
- `tests/group_memorials_database.sql`: tikroje DB patikrintos teisės, RLS, išsaugojimas ir grupės dydžio ribojimas; bandymo įrašai atšaukti su ROLLBACK.
- `node scripts/build.mjs`: paruoštas `dist/`.

## Diegimo būsena

Supabase projektui pritaikyta `20260913192953_group_memorials.sql`, įdiegtos `profile-content` v12 ir `profile-manage` v17. Esamo viešo vieno žmogaus puslapio API grąžino HTTP 200. Nauji saugumo patarėjo įspėjimai neatsirado; iki pakeitimo buvę perspėjimai liko tokie patys.

Frontend pakeitimai paruošti šiame projekte ir `dist/`; Vercel frontend šiame darbe nepublikuotas. Vietinė peržiūra: `http://localhost:5000/redaktorius.html?product=digital`.

Papildomas žmogus turi atskirą įrašą, bet grupės išsaugojimas nekuria jam atskiro mokėjimo ar fizinio QR užsakymo. Papildomą žmogų pašalinus iš išsaugotos grupės, jo atskiras puslapis lieka savininko paskyroje. Pagrindinio žmogaus pašalinimas iš grupės neleidžiamas, kad išliktų QR adresas.

## 2026-09-14 redaktoriaus stabilumo pataisymai

- Rašant atnaujinamas tekstas, išlaikant tas pačias nuotraukas ir žmonių korteles DOM. Peržiūros atnaujinimai sujungiami į vieną ekrano kadrą.
- Kiekvieno žmogaus failai ir atšaukimo istorija išlieka atmintyje. Prieš perjungiant žmogų perskaitomi reikalingi failai; greiti pakartotiniai pridėjimo paspaudimai nesukuria tuščių dublikatų.
- Nuotraukos įkėlimo įvykis nebeperrašo naudotojo nustatyto rėmelio dydžio.
- Išeinant iš puslapio arba paslėpus skirtuką nedelsiant įrašomi laukiantys teksto pakeitimai. Laikina IndexedDB skaitymo klaida neištrina juodraščio; pranešama apie nepavykusį atkūrimą ir sustabdomas redagavimas, kad nebūtų perrašyti neatkurti duomenys.
- Iš serverio gauti nauji nuotraukų peržiūros adresai naudojami atkuriant išsaugotų puslapių juodraščius.
- Telefone palikta viena slenkant matoma žingsnių juosta; „Toliau“ mygtukai rodomi po turiniu ir jo neuždengia. Grupės blokas priderintas prie redaktoriaus spalvų.

Naršyklės regresiniai testai papildyti teksto ir nuotraukų stabilumo, greito pridėjimo, atskiros atšaukimo istorijos, skubaus perkrovimo ir dirbtinai sukeltos IndexedDB klaidos scenarijais. Patikros vykdomos su izoliuotu API pakaitalu, 390 ir 1440 px pločio Chrome languose. Šie frontend pataisymai paruošti vietiniame projekte; viešinimui reikia Vercel diegimo.

## 2026-09-14 pasirinkti patobulinimai (1, 2, 3 ir 6)

- Nuotraukų biblioteka: papildymas iki 8 nuotraukų kiekvienam žmogui, vienos nuotraukos pakeitimas ir pašalinimas, įskaitant paskutinę. Išsaugotos nepakeistos nuotraukos neįkeliamos pakartotinai.
- Pagrindinio portreto pasirinkimas perkelia nuotrauką į pirmą vietą kortelėje bei istorijoje ir išlaiko jos aprašymą. Nuotraukų eiliškumo pakeitimai atnaujina istorijos nuorodas.
- Trys išdėstymai: „Portretas ir istorija“, „Nuotraukų albumas“, „Šeimos atminimas“. Išlieka tekstai ir nuotraukos; pakeitimą galima atšaukti. Sėkmingai išsaugojus paskyroje, pakeitimų istorija pradedama iš naujo, kad negrįžtų jau pašalintų serverio failų nuorodos.
- Aiškiai rodoma vietinio juodraščio, privataus paskyros puslapio arba paskelbto puslapio būsena ir dar neišsaugoti pakeitimai. Grupės kortelės parodo, ar įrašytas vardas ir pridėta nuotrauka.
- Naujos nuotraukos gauna unikalius failų vardus, todėl nepavykęs išsaugojimas neperrašo ankstesnės nuotraukos. Dalinai išsaugotos grupės pakartojimas naudoja jau sukurtus įrašus ir įkeltų nuotraukų kelius.

Patikros: 32 Node testai, 206 Python testai, 10 Deno testų; Chrome 390 ir 1440 px su izoliuotu API. Tikrinta mišri vietinių ir išsaugotų nuotraukų biblioteka, portreto pasirinkimas, visi trys išdėstymai, paskutinės nuotraukos pašalinimas, atkūrimas ir grupės išsaugojimo pakartojimas. Tikros DB bandymas `tests/editor_photo_versions_database.sql` patvirtino 8 nuotraukų ir tuščios bibliotekos saugojimą; duomenys atšaukti. `dist/` surinktas, išdėstymų ekrano kopijos vizualiai patikrintos.

Supabase pritaikyta `20260914133742_editor_photo_versions.sql`; įdiegtos `profile-manage` v18 ir `profile-content` v13. Viešo puslapio API patikra sėkminga, publikavimo būsena grąžinama, savininko duomenys neatskleidžiami. Saugumo patarėjo radiniai nepasikeitė. Ankstesni radiniai: [ribotų lentelių RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [SECURITY DEFINER RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [slaptažodžių apsauga](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Frontend paruoštas vietiniame projekte ir `dist/`; Vercel šiame etape nepublikuotas.
