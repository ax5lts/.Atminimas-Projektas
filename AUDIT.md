# Svetainės patikra ir optimizavimas – 2026-09-06

Patikrintas šiame projekte esantis „Atminimas“ frontend: 22 HTML puslapiai, jų JavaScript ir CSS, prisijungimo bei redaktoriaus srautai ir 20 Supabase Edge Functions įėjimo failų. Pakeitimai atlikti vietiniame projekte; produkcija šiame darbe neviešinta.

## Pataisyta

- Redaktorius po pirmojo išsaugojimo pereina į sukurto profilio redagavimą. Tolesnis išsaugojimas nebekuria naujo profilio ir nebeįkelia nepakeistų nuotraukų, video ar subtitrų. Nepavykus paskelbti prototipo, pakartotinis bandymas naudoja tą patį profilį.
- Prisijungimo, registracijos, užklausų ir administravimo veiksmuose pridėti vykdomo veiksmo patikrinimai. Kapavietės kūrimas išlaiko sukurtą ID, jei vėliau nepavyksta įkelti nuotraukos.
- Paslaugų kainos užklausiamos pasikeitus kainai reikšmingiems laukams. Pasenę kainos ir kapaviečių paieškos atsakymai nebeperrašo naujesnio pasirinkimo; paieška turi bendrą laukimo ribą abiem duomenų šaltiniams.
- Sutvarkytas parduotuvės pasirinkimo išlaikymas, išsaugotų atminimo nuorodų `id` / `s` / `slug` suderinamumas, netinkamų saugyklos įrašų ir kopijavimo klaidų apdorojimas.
- Vienu metu vykstantys vartotojo patikrinimai dalijasi užklausa. Pavėlavęs 401 atsakymas naudoja jau atnaujintą sesiją. Atsijungus arba pakeitus paskyrą, sena užklausa nebekartojama kitos paskyros vardu.
- Administravimas lygiagrečiai įkelia nepriklausomas skiltis, dalinis sutrikimas nebesustabdo likusių skilčių. Siuntų sąrašui panaudojami jau gauti užsakymai.
- Atminimo nuotraukų laikinos nuorodos serverio pusėje sukuriamos viena grupine Storage užklausa vietoj atskiros užklausos kiekvienam failui. Išlaikytos savininko teisės ir metaduomenys dalinio sutrikimo atveju.
- Paštomatų sąrašai vienoje veikiančioje funkcijos instancijoje laikomi iki valandos, sutampančios užklausos dalijasi atsisiuntimu, išorinio šaltinio laukimas ribotas.
- JSON užklausos dydis ribojamas duomenims atkeliaujant, įskaitant užklausas be `Content-Length`.
- Sumažinto judesio nustatymas išjungia puslapių perėjimų efektą. 404 puslapio failai ir nuorodos veikia ir neegzistuojančiuose keliuose su pakatalogiais.

## Viešinimo failų dydis

Pridėtas atkuriamas `pnpm build` su tikslia `esbuild` versija ir priklausomybių užraktu. Redaguojami šaltiniai išlieka atskirai, o į `dist/` kopijuojami tik vieši failai. HTML ir dinamiškai įkeliami skriptai gauna versijas pagal failų turinį.

| JS ir CSS failai | Sutvarkyti šaltiniai | Viešinimo versija | Sumažėjimas |
| --- | ---: | ---: | ---: |
| Be perdavimo glaudinimo | 754 985 B | 473 409 B | 37 % |
| Gzip palyginimas | 174 384 B | 138 360 B | 21 % |

Tai visų JS/CSS failų dydžių palyginimas, ne gyvos svetainės užkrovimo laiko matavimas. Vercel konfigūracija paruošta surinkti ir viešinti `dist/`.

## Patikros

- 207 Python testai, įskaitant vietinių puslapių, nuorodų ir anoniminės prieigos patikras: praėjo.
- 24 JavaScript veikimo testai ir 3 viešinimo rinkinio testai: praėjo.
- 37 Deno serverio testai ir 20 funkcijų TypeScript patikra: praėjo.
- Visi 22 optimizuoti puslapiai Chrome naršyklėje, 390 ir 1440 px pločiais: 44 patikros be JavaScript klaidų, neveikiančių paveikslėlių, pasikartojančių ID ar horizontalaus išsiplėtimo.
- Optimizuoto redaktoriaus ir administravimo integracijos naršyklėje tikrintos perimant visas išorines užklausas: dviem išsaugojimams teko vienas sukūrimas, vienas atnaujinimas ir vienas nuotraukos įkėlimas; sutampantys administravimo atnaujinimai dalijosi užklausomis. Tikri klientų įrašai šiomis patikromis nebuvo kuriami.
- Neegzistuojantis kelias su pakatalogiu grąžino 404 ir užkrovė savo stilius bei skriptus.
- Šaltinių ir sugeneruoto JavaScript sintaksė bei `git diff --check`: praėjo.

Prisijungusių klientų ir administratoriaus veiksmams naudoti izoliuoti bandomieji atsakymai. Tikri mokėjimai, laiškų siuntimas ir produkcinis diegimas nebuvo vykdomi. Vietinės komandos aprašytos `README.md`, diegimo tvarka – `DEPLOYMENT.md`.
