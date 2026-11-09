# Kapaviečių paieška

Šiame faile saugomas iš ankstesnio README perkeltas paieškos ir importo aprašas. Dabartinę realizaciją tikrinkite pagal [frontendą](../assets/official-grave-search.js), [Edge Function](../supabase/functions/cemetery-search/index.ts) ir [vietinį API](../app.py). Teiginiai apie išorinių paslaugų kvotas ar prieinamumą nėra nuolatinė garantija.

## Oficiali kapaviečių paieška

Paieška naudoja Valstybės duomenų agentūros rinkinį [Savivaldybių kapinių registro duomenys](https://data.gov.lt/datasets/2779/?resource_version=1619), licencija [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Oficialūs duomenys Supabase duomenų bazėje nebesaugomi. Viešas frontend kviečia `cemetery-search` Edge Function. Funkcija pirmiausia tikrina greitą viešą CEMETY paiešką, o jei ji neatsako arba negrąžina rezultatų, naudoja `https://get.data.gov.lt/datasets/gov/kapines/registras`. Funkcija:

- pati aptinka visus `velioniai` savivaldybių modelius ir sąrašą laiko atminties podėlyje 6 valandas;
- riboja vienu metu vykdomų oficialaus API užklausų skaičių;
- palaiko dalinę vardo ir pavardės paiešką, metus, savivaldybę, kapines bei puslapiavimą;
- į naršyklę grąžina tik rezultatui parodyti reikalingus laukus;
- naudoja dokumentuotus `contains(...)`, AND / OR, `limit(...)` ir puslapiavimo veiksmus.

Kapavietės žemėlapio peržiūra naudoja OpenStreetMap plyteles, o neveikiant plytelėms pateikia tiesioginę nuorodą į OpenStreetMap.

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
