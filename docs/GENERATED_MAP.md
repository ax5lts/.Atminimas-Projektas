# Generuojamas kodo žemėlapis

Šis failas generuojamas iš vietinių HTML, JavaScript, Edge importų ir `supabase/config.toml`. Atnaujinkite su `pnpm docs:map`; `pnpm docs:check` aptinka pasenusį žemėlapį. Jo neredaguokite ranka.

Tai šaltinių katalogas, ne produkcijos versijų ar visų galimų vykdymo kelių įrodymas. Dinamiškai įkeliamus skriptus ir veiksmų sutartis aiškina [FRONTEND.md](FRONTEND.md) bei [BACKEND.md](BACKEND.md).

## HTML ir tiesioginių skriptų tvarka

Eilutėje išlaikyta tikra HTML įkėlimo tvarka. Užklausų versijų žymos praleistos; išoriniai skriptai neįtraukti.

| Puslapis | Vietiniai skriptai iš eilės |
| --- | --- |
| [404.html](../404.html) | [assets/site-ui.js](../assets/site-ui.js) |
| [aciu.html](../aciu.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/business-config.js](../assets/business-config.js)<br>[assets/business-details.js](../assets/business-details.js)<br>[assets/thank-you.js](../assets/thank-you.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [admin.html](../admin.html) | [assets/plaque-design.js](../assets/plaque-design.js)<br>[assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/auth.js](../assets/auth.js)<br>[assets/admin.js](../assets/admin.js)<br>[assets/graves-admin.js](../assets/graves-admin.js)<br>[assets/grave-photo-admin.js](../assets/grave-photo-admin.js)<br>[assets/loading.js](../assets/loading.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [apmokejimas.html](../apmokejimas.html) | [assets/plaque-design.js](../assets/plaque-design.js)<br>[assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/business-config.js](../assets/business-config.js)<br>[assets/auth.js](../assets/auth.js)<br>[assets/business-details.js](../assets/business-details.js)<br>[assets/checkout.js](../assets/checkout.js)<br>[assets/loading.js](../assets/loading.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [grazinimas.html](../grazinimas.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/legal-forms.js](../assets/legal-forms.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [index.html](../index.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/auth.js](../assets/auth.js)<br>[assets/official-grave-search.js](../assets/official-grave-search.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [isankstinis-uzsakymas.html](../isankstinis-uzsakymas.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/business-config.js](../assets/business-config.js)<br>[assets/business-details.js](../assets/business-details.js)<br>[assets/product-catalog.js](../assets/product-catalog.js)<br>[assets/form-validation.js](../assets/form-validation.js)<br>[assets/loading.js](../assets/loading.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [kapu-ieskojimas.html](../kapu-ieskojimas.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/auth.js](../assets/auth.js)<br>[assets/loading.js](../assets/loading.js)<br>[assets/official-grave-search.js](../assets/official-grave-search.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [kapu-prieziura.html](../kapu-prieziura.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/business-config.js](../assets/business-config.js)<br>[assets/business-details.js](../assets/business-details.js)<br>[assets/auth.js](../assets/auth.js)<br>[assets/loading.js](../assets/loading.js)<br>[assets/home.js](../assets/home.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [klientai.html](../klientai.html) | [assets/client-access.js](../assets/client-access.js)<br>[assets/loading.js](../assets/loading.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [parduotuve.html](../parduotuve.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/business-config.js](../assets/business-config.js)<br>[assets/business-details.js](../assets/business-details.js)<br>[assets/product-catalog.js](../assets/product-catalog.js)<br>[assets/plaque-design.js](../assets/plaque-design.js)<br>[assets/shop.js](../assets/shop.js)<br>[assets/loading.js](../assets/loading.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [pranesti.html](../pranesti.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/legal-forms.js](../assets/legal-forms.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [prieinamumas.html](../prieinamumas.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/business-config.js](../assets/business-config.js)<br>[assets/business-details.js](../assets/business-details.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [prisijungti.html](../prisijungti.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/auth.js](../assets/auth.js)<br>[assets/form-validation.js](../assets/form-validation.js)<br>[assets/login.js](../assets/login.js)<br>[assets/loading.js](../assets/loading.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [privatumas.html](../privatumas.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/business-config.js](../assets/business-config.js)<br>[assets/business-details.js](../assets/business-details.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [qr-kodas-ant-kapo.html](../qr-kodas-ant-kapo.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/auth.js](../assets/auth.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [redaktorius.html](../redaktorius.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/auth.js](../assets/auth.js)<br>[assets/product-catalog.js](../assets/product-catalog.js)<br>[assets/atminimas-duomenys.js](../assets/atminimas-duomenys.js)<br>[assets/plaque-design.js](../assets/plaque-design.js)<br>[assets/memorial-group.js](../assets/memorial-group.js)<br>[assets/redaktorius.js](../assets/redaktorius.js)<br>[assets/loading.js](../assets/loading.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [registruotis.html](../registruotis.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/auth.js](../assets/auth.js)<br>[assets/form-validation.js](../assets/form-validation.js)<br>[assets/register.js](../assets/register.js)<br>[assets/loading.js](../assets/loading.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [rekvizitai.html](../rekvizitai.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/business-config.js](../assets/business-config.js)<br>[assets/business-details.js](../assets/business-details.js)<br>[assets/site-seo.js](../assets/site-seo.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [sablonas-viskas.html](../sablonas-viskas.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/auth.js](../assets/auth.js)<br>[assets/atminimas-duomenys.js](../assets/atminimas-duomenys.js)<br>[assets/memorial-actions.js](../assets/memorial-actions.js)<br>[assets/memorial-group.js](../assets/memorial-group.js)<br>[assets/memorial-page.js](../assets/memorial-page.js)<br>[assets/loading.js](../assets/loading.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [saugumas.html](../saugumas.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/auth.js](../assets/auth.js)<br>[assets/mfa.js](../assets/mfa.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [slaptazodis.html](../slaptazodis.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/form-validation.js](../assets/form-validation.js)<br>[assets/password-reset.js](../assets/password-reset.js)<br>[assets/loading.js](../assets/loading.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [taisykles.html](../taisykles.html) | [assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/business-config.js](../assets/business-config.js)<br>[assets/business-details.js](../assets/business-details.js)<br>[assets/site-ui.js](../assets/site-ui.js) |
| [vartotojas.html](../vartotojas.html) | [assets/plaque-design.js](../assets/plaque-design.js)<br>[assets/supabase-config.js](../assets/supabase-config.js)<br>[assets/auth.js](../assets/auth.js)<br>[assets/loading.js](../assets/loading.js)<br>[assets/user.js](../assets/user.js)<br>[assets/site-ui.js](../assets/site-ui.js)<br>[assets/saved-memorials.js](../assets/saved-memorials.js) |

## Bendri naršyklės objektai

Statiniu būdu aptiktos vardinių `window` / `global` objektų priskyrimo vietos. Tai nėra visų įvykių ar funkcijų iškvietimų grafas.

| Failas | Eksportuojami vardai |
| --- | --- |
| [analytics-config.js](../assets/analytics-config.js) | `ATMINIMAS_ANALYTICS` |
| [atminimas-duomenys.js](../assets/atminimas-duomenys.js) | `AtminimasApi` |
| [auth.js](../assets/auth.js) | `AtminimasAuth` |
| [business-config.js](../assets/business-config.js) | `ATMINIMAS_BUSINESS` |
| [business-details.js](../assets/business-details.js) | `ATMINIMAS_BUSINESS`, `AtminimasBusinessDetails` |
| [form-validation.js](../assets/form-validation.js) | `AtminimasForms` |
| [loading.js](../assets/loading.js) | `AtminimasLoading` |
| [memorial-actions.js](../assets/memorial-actions.js) | `AtminimasMemorialActions` |
| [plaque-design.js](../assets/plaque-design.js) | `AtminimasPlaqueDesign` |
| [product-catalog.js](../assets/product-catalog.js) | `AtminimasProductCatalog` |
| [service-prices.js](../assets/service-prices.js) | `ATMINIMAS_SERVICE_PRICES` |
| [site-ui.js](../assets/site-ui.js) | `AtminimasUi` |
| [supabase-config.js](../assets/supabase-config.js) | `ATMINIMAS_CONFIG` |

## Vietinės Edge Functions ir jų priklausomybės

`verify_jwt` nurodomas tik iš vietinio config.toml. `false` nereiškia, kad funkcija neturi vidinės autorizacijos; nenustatytas laukas nepatvirtina produkcijos nustatymo. Įdiegta funkcija gali turėti kitą versiją — tikrinkite paslaugą.

| Funkcija | Vietinis verify_jwt | Santykinės priklausomybės, įskaitant netiesiogines |
| --- | --- | --- |
| [automation-reminders/index.ts](../supabase/functions/automation-reminders/index.ts) | `false` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts) |
| [automation-worker/index.ts](../supabase/functions/automation-worker/index.ts) | `false` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/email.ts](../supabase/functions/_shared/email.ts)<br>[_shared/invoice-pdf.ts](../supabase/functions/_shared/invoice-pdf.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts)<br>[_shared/order-copy.ts](../supabase/functions/_shared/order-copy.ts)<br>[_shared/order-qr.ts](../supabase/functions/_shared/order-qr.ts)<br>[_shared/shipping.ts](../supabase/functions/_shared/shipping.ts)<br>[_shared/worker-auth.ts](../supabase/functions/_shared/worker-auth.ts) |
| [business-profile/index.ts](../supabase/functions/business-profile/index.ts) | `false` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts) |
| [cemetery-search/index.ts](../supabase/functions/cemetery-search/index.ts) | `false` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts) |
| [document-download/index.ts](../supabase/functions/document-download/index.ts) | `true` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts) |
| [grave-photo/index.ts](../supabase/functions/grave-photo/index.ts) | `false` | [_shared/mfa.ts](../supabase/functions/_shared/mfa.ts) |
| [legal-submission/index.ts](../supabase/functions/legal-submission/index.ts) | `false` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts) |
| [memorial-engagement/index.ts](../supabase/functions/memorial-engagement/index.ts) | `false` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts)<br>[_shared/request-ip.ts](../supabase/functions/_shared/request-ip.ts) |
| [ops-assistant/index.ts](../supabase/functions/ops-assistant/index.ts) | nenurodyta | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts) |
| [parcel-lockers/index.ts](../supabase/functions/parcel-lockers/index.ts) | `false` | — |
| [payment-create/index.ts](../supabase/functions/payment-create/index.ts) | `true` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts)<br>[_shared/paysera-modern.ts](../supabase/functions/_shared/paysera-modern.ts)<br>[_shared/paysera-products.ts](../supabase/functions/_shared/paysera-products.ts) |
| [payment-webhook/index.ts](../supabase/functions/payment-webhook/index.ts) | `false` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts) |
| [paysera-webhook/index.ts](../supabase/functions/paysera-webhook/index.ts) | `false` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts)<br>[_shared/paysera-modern.ts](../supabase/functions/_shared/paysera-modern.ts)<br>[_shared/paysera.ts](../supabase/functions/_shared/paysera.ts) |
| [preorder/index.ts](../supabase/functions/preorder/index.ts) | `false` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts) |
| [production-email/index.ts](../supabase/functions/production-email/index.ts) | `true` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/email.ts](../supabase/functions/_shared/email.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts)<br>[_shared/order-copy.ts](../supabase/functions/_shared/order-copy.ts) |
| [profile-content/index.ts](../supabase/functions/profile-content/index.ts) | `false` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts)<br>[_shared/request-ip.ts](../supabase/functions/_shared/request-ip.ts) |
| [profile-manage/index.ts](../supabase/functions/profile-manage/index.ts) | `true` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts) |
| [qr-code/index.ts](../supabase/functions/qr-code/index.ts) | `false` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts) |
| [service-flow/index.ts](../supabase/functions/service-flow/index.ts) | `false` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/email.ts](../supabase/functions/_shared/email.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts)<br>[_shared/paysera-modern.ts](../supabase/functions/_shared/paysera-modern.ts) |
| [shipping-create/index.ts](../supabase/functions/shipping-create/index.ts) | `true` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts)<br>[_shared/shipping.ts](../supabase/functions/_shared/shipping.ts) |
| [shipping-sync/index.ts](../supabase/functions/shipping-sync/index.ts) | `false` | [_shared/core.ts](../supabase/functions/_shared/core.ts)<br>[_shared/mfa.ts](../supabase/functions/_shared/mfa.ts)<br>[_shared/shipping.ts](../supabase/functions/_shared/shipping.ts) |

## Bendrų serverio failų vartotojai

Pakeitus bendrą failą, šis sąrašas padeda rasti funkcijas, kurių diegimo kopiją gali reikėti atnaujinti. Taip pat vertinkite pasikeitusio elgesio ir testų apimtį.

| Priklausomybė | Funkcijos, pasiekiančios ją per importus |
| --- | --- |
| [_shared/core.ts](../supabase/functions/_shared/core.ts) | `automation-reminders`, `automation-worker`, `business-profile`, `cemetery-search`, `document-download`, `legal-submission`, `memorial-engagement`, `ops-assistant`, `payment-create`, `payment-webhook`, `paysera-webhook`, `preorder`, `production-email`, `profile-content`, `profile-manage`, `qr-code`, `service-flow`, `shipping-create`, `shipping-sync` |
| [_shared/email.ts](../supabase/functions/_shared/email.ts) | `automation-worker`, `production-email`, `service-flow` |
| [_shared/invoice-pdf.ts](../supabase/functions/_shared/invoice-pdf.ts) | `automation-worker` |
| [_shared/mfa.ts](../supabase/functions/_shared/mfa.ts) | `automation-reminders`, `automation-worker`, `business-profile`, `cemetery-search`, `document-download`, `grave-photo`, `legal-submission`, `memorial-engagement`, `ops-assistant`, `payment-create`, `payment-webhook`, `paysera-webhook`, `preorder`, `production-email`, `profile-content`, `profile-manage`, `qr-code`, `service-flow`, `shipping-create`, `shipping-sync` |
| [_shared/order-copy.ts](../supabase/functions/_shared/order-copy.ts) | `automation-worker`, `production-email` |
| [_shared/order-qr.ts](../supabase/functions/_shared/order-qr.ts) | `automation-worker` |
| [_shared/paysera-modern.ts](../supabase/functions/_shared/paysera-modern.ts) | `payment-create`, `paysera-webhook`, `service-flow` |
| [_shared/paysera-products.ts](../supabase/functions/_shared/paysera-products.ts) | `payment-create` |
| [_shared/paysera.ts](../supabase/functions/_shared/paysera.ts) | `paysera-webhook` |
| [_shared/request-ip.ts](../supabase/functions/_shared/request-ip.ts) | `memorial-engagement`, `profile-content` |
| [_shared/shipping.ts](../supabase/functions/_shared/shipping.ts) | `automation-worker`, `shipping-create`, `shipping-sync` |
| [_shared/worker-auth.ts](../supabase/functions/_shared/worker-auth.ts) | `automation-worker` |
