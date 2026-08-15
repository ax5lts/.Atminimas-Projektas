# Automatizavimo aktyvavimas

Kode nėra ir neturi būti tikrų API raktų. Prieš diegiant automatizavimą reikia:

1. Supabase Edge Function Secrets nustatyti `PUBLIC_SITE_URL`, `AUTOMATION_SECRET`, `ADMIN_EMAIL`, `EMAIL_FROM`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY` ir `STRIPE_WEBHOOK_SECRET`.
2. QR lentelių išankstiniams užsakymams „Stripe“ nenaudojamas. `payment-create` tyčia nekuria sesijų. Esamą `payment-webhook` konfigūraciją palikite tik tada, jei dar gali būti užbaigiama anksčiau pradėta istorinė mokėjimo sesija.
3. Resend patvirtinti siuntėjo domeną. `EMAIL_FROM` turi priklausyti patvirtintam domenui.
   `ADMIN_EMAIL` galima nustatyti į `atminimokodas@gmail.com`; šis adresas taip
   pat naudojamas administratoriaus pranešimams. Gamintojo adresas įrašomas
   administravimo puslapio skiltyje „Rekvizitai ir kainos“ ir nėra laikomas
   viešame frontend konfigūracijos faile.
4. Administravimo puslapyje užpildyti veiklos rekvizitus, pasirinkti teisingą dokumento tipą ir kainas. Dokumento tipą turi patvirtinti buhalteris.
5. Automatiniams lipdukams sudaryti sutartį su vežėju arba agregatoriumi ir pateikti HTTPS adapterį pagal žemiau aprašytą sutartį.
6. Supabase Vault sukurti paslaptis `project_url` ir `automation_secret`, tada paleisti `cron-setup.sql.example`.

## QR failų ir gamintojo eiga

1. Klientas savo zonoje gali atsisiųsti 1200 × 1200 QR kodą PNG arba JPG formatu.
2. Jau anksčiau apmokėtam istoriniam užsakymui klientui patvirtinus gamybą, automatikos darbininkas paruošia SVG
   ir išsaugo jį privačiame `automation-documents` bucket'e.
3. Administratorius gamybos eilėje pirmiausia gali SVG atsisiųsti ir patikrinti,
   tada mygtuku „Siųsti SVG gamintojui“ išsiųsti jį kaip laiško priedą.
4. Laiškas siunčiamas per Resend iš `EMAIL_FROM`, o atsakymo adresas paimamas iš
   verslo profilio el. pašto. `atminimokodas@gmail.com` slaptažodis svetainėje
   nenaudojamas ir neturi būti saugomas Supabase.
5. Kai gamintojas patvirtins failo reikalavimus ir procesas bus išbandytas,
   rankinį mygtuką galima pakeisti automatiniu įvykiu. Iki tol paliktas žmogaus
   patvirtinimas apsaugo nuo neteisingo ar pakartotinio failo išsiuntimo.

## Siuntų adapterio sutartis

Supabase į `SHIPMENT_ADAPTER_URL` siunčia autentifikuotą `POST` su `action:
"create"` arba `action: "sync"`, vežėju ir tik pristatymui būtinu užsakymo
laukų rinkiniu. Atminimo tekstas, profilio savininko ID, mokėjimo nuorodos ir
kiti pristatymui nereikalingi duomenys adapteriui neperduodami. Adapteris turi
grąžinti:

```json
{
  "provider_ref": "carrier-shipment-id",
  "tracking_number": "TRACK123",
  "tracking_url": "https://...",
  "status": "shipped",
  "label_base64": "...",
  "label_mime": "application/pdf"
}
```

Leidžiamos būsenos: `ready`, `shipped`, `in_transit`, `delivered`, `cancelled`. Adapteris saugo konkretaus vežėjo API raktus; jie nepatenka į naršyklę ar GitHub.

## Atsarginės kopijos

Klaidų ir svarbių pakeitimų audito žurnalas saugomas duomenų bazėje. Pačias atsargines kopijas reikia įjungti Supabase plano nustatymuose arba suplanuoti šifruotą `pg_dump` į atskirą saugyklą. Kopija toje pačioje duomenų bazėje nėra tikra atsarginė kopija.
