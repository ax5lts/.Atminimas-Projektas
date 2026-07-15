# Atminimas

„Atminimas“ yra statinis HTML/CSS/JS projektas su Supabase PostgreSQL, Auth, Storage ir Edge Functions. `app.py` suteikia vietinį Flask API, o produkcinis frontend diegiamas per GitHub Pages.

## Oficiali kapaviečių paieška

Paieška naudoja Valstybės duomenų agentūros rinkinį [Savivaldybių kapinių registro duomenys](https://data.gov.lt/datasets/2779/?resource_version=1619), licencija [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Oficialūs duomenys Supabase duomenų bazėje nebesaugomi. Viešas frontend kviečia `cemetery-search` Edge Function, o ši užklausas siunčia tiesiai į `https://get.data.gov.lt/datasets/gov/kapines/registras`. Funkcija:

- pati aptinka visus `velioniai` savivaldybių modelius ir sąrašą laiko atminties podėlyje 6 valandas;
- riboja vienu metu vykdomų oficialaus API užklausų skaičių;
- palaiko dalinę vardo ir pavardės paiešką, metus, savivaldybę, kapines bei puslapiavimą;
- į naršyklę grąžina tik rezultatui parodyti reikalingus laukus;
- naudoja dokumentuotus `contains(...)`, AND / OR, `limit(...)` ir puslapiavimo veiksmus.

`assets/official-grave-search.js` pirmiausia naudoja neprivalomą `CEMETERY_SEARCH_API_URL`; jei jis nenustatytas, kviečia esamo Supabase projekto `/functions/v1/cemetery-search` adresą. Vietinis Flask atitikmuo yra `GET /api/deceased/search`.

## Autorizacija ir užklausos

Atvirų duomenų skaitymui per `https://get.data.gov.lt/` autorizacija ir API raktas nereikalingi. Autorizacija reikalinga duomenų tiekėjams, kurie per `https://put.data.gov.lt/` kuria, keičia arba šalina duomenis. Ši paieškos funkcija atlieka tik skaitymo veiksmus.

Oficiali dokumentacija:

- [autorizacija](https://docs.data.gov.lt/projects/atviriduomenys/latest/api/index.html#autorizacija);
- [veiksmai](https://docs.data.gov.lt/projects/atviriduomenys/latest/api/index.html#veiksmai);
- [duomenų užklausos](https://docs.data.gov.lt/projects/atviriduomenys/latest/api/index.html#duomenu-uzklausos).

Portalas šiuo metu netaiko užklausų skaičiaus kvotos. Funkcijoje esantys vienalaikių užklausų, atsakymo laukimo ir puslapio dydžio apribojimai yra tik mūsų paslaugos stabilumo saugikliai.

Vietiniam alternatyviam API adresui galima naudoti:

```text
CEMETERY_SEARCH_API_URL=https://jusu-serveris.example/api/deceased/search
```

## Ankstesnio importo atsarginė kopija

Importo kodas ir vietiniai CSV palikti kaip techninė atsarginė kopija. `data-imports/` yra ignoruojamas Git ir į produkciją nekeliamas. Savaitinis GitHub Actions importas išjungtas, todėl oficialūs duomenys į Supabase daugiau automatiškai nebus rašomi.

## Testai

```bash
python -m unittest discover -s tests -v
```

Prieš produkcinį pakeitimą patikrinkite paiešką su viena savivaldybe ir be savivaldybės filtro, Edge Function žurnalus bei Supabase Security Advisor.
