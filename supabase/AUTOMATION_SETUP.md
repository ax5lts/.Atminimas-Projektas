# Automatizavimo aktyvavimas

Kode nėra ir neturi būti tikrų API raktų. Prieš diegiant automatizavimą reikia:

1. Supabase Edge Function Secrets nustatyti `PUBLIC_SITE_URL`, `AUTOMATION_SECRET`, `ADMIN_EMAIL`, `EMAIL_FROM`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY` ir `STRIPE_WEBHOOK_SECRET`.
2. Stripe webhook nukreipti į `https://tpwrkgdmtucecqxbpwwf.supabase.co/functions/v1/payment-webhook` ir prenumeruoti `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`.
3. Resend patvirtinti siuntėjo domeną. `EMAIL_FROM` turi priklausyti patvirtintam domenui.
4. Administravimo puslapyje užpildyti veiklos rekvizitus, pasirinkti teisingą dokumento tipą ir kainas. Dokumento tipą turi patvirtinti buhalteris.
5. Automatiniams lipdukams sudaryti sutartį su vežėju arba agregatoriumi ir pateikti HTTPS adapterį pagal žemiau aprašytą sutartį.
6. Supabase Vault sukurti paslaptis `project_url` ir `automation_secret`, tada paleisti `cron-setup.sql.example`.

## Siuntų adapterio sutartis

Supabase į `SHIPMENT_ADAPTER_URL` siunčia autentifikuotą `POST` su `action: "create"` arba `action: "sync"`, vežėju ir užsakymo duomenimis. Adapteris turi grąžinti:

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
