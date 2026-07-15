# Oficialaus kapinių registro kontrolinis taškas

Atnaujinta: 2026-07-14 (Europe/Vilnius).

## Būsena

- Dalinis oficialių duomenų importas sustabdytas ir nebus tęsiamas.
- Savaitinis GitHub Actions importas pašalintas.
- Supabase oficialaus importo lentelės išvalytos:
  - `municipalities`: 0;
  - `cemeteries`: 0;
  - `graves`: 0;
  - `deceased_people`: 0;
  - `import_runs`: 0;
  - `import_errors`: 0;
  - `cemetery_import_lock`: 0.
- Supabase DB sumažėjo nuo 1 331 874 963 baitų (apie 1 270 MB) iki 13 929 619 baitų (apie 13 MB).
- Naudotojų valdoma `kapavietes` lentelė ir visi kiti projekto duomenys nebuvo trinti.
- Vietiniai `data-imports/` CSV palikti kaip Git ignoruojama atsarginė kopija.

## Naujas sprendimas

- Oficiali paieška vykdoma tiesiai per `data.gov.lt` API.
- Supabase Edge Function `cemetery-search` įdiegta projekte `tpwrkgdmtucecqxbpwwf`.
- Gyvai patikrinta paieška vienoje savivaldybėje ir visose 50 savivaldybių; paskutinio bandymo metu API klaidų nebuvo.
- Frontend daugiau nekviečia `search_deceased` DB RPC.
- Flask `/api/deceased/search` yra serverinis tos pačios Edge Function tarpininkas.
- Atvirų duomenų skaitymui API rakto nereikia; autorizacija taikoma tik duomenų kūrimui, keitimui ar šalinimui per tiekėjų sritį.
- Portalo užklausų skaičiaus kvotos šiuo metu nėra. Funkcijos vidiniai paketų, laukimo laiko ir puslapio dydžio saugikliai skirti stabilumui.
- Aiven ar kita didelė išorinė PostgreSQL duomenų bazė šiam sprendimui nereikalinga.

## Patikros

- `python -m unittest discover -s tests -v`: 58 testai, visi sėkmingi.
- Supabase Security Advisor: naujų kapinių API problemų nėra; likęs bendras perspėjimas, kad Auth nutekintų slaptažodžių apsauga išjungta.
- Performance Advisor rodo informacinius nenaudojamų indeksų pranešimus, įskaitant dabar tuščių seno importo lentelių indeksus.

## Dar liko

1. Peržiūrėti pakeitimų apimtį, tada atskirai commitinti ir iškelti į GitHub.
