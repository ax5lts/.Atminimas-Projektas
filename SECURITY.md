# Saugumo diegimas ir priežiūra

Šio projekto saugumas remiasi keliomis nepriklausomomis apsaugomis: mažiausiomis
duomenų bazės teisėmis, RLS taisyklėmis, privačia failų saugykla, serveriniu
įvesties tikrinimu, trumpalaikėmis failų nuorodomis ir naršyklės saugumo
taisyklėmis. Vien kodo pakeitimai negali garantuoti, kad incidentas niekada
neįvyks, todėl produkcijos nustatymai ir stebėsena yra tokie pat svarbūs.

## Skubus veiksmas

Anksčiau pokalbyje paskelbtą „Stripe“ testinį slaptą raktą reikia panaikinti
„Stripe Dashboard“ ir sukurti naują. Naują raktą laikykite tik „Supabase Edge
Functions Secrets“; jo nerašykite į HTML, JavaScript, Git, pokalbius ar ekrano
nuotraukas. Viešas `pk_...` raktas nėra paslaptis, tačiau `sk_...` raktas yra.

Jei kada nors nuteka „Supabase service role“, duomenų bazės slaptažodis ar
mokėjimo webhook paslaptis, juos taip pat nedelsiant pakeiskite ir patikrinkite
atitinkamos paslaugos žurnalus.

## Dabartinis diegimas ir patikros

Produkcija: `https://atminimokodas.lt/`. `main` šakos pakeitimus automatiškai publikuoja GitHub–Vercel integracija. Vercel vykdo `scripts/build.mjs`, viešina tik `dist/` ir nustato `vercel.json` saugumo antraštes. GitHub Actions tikrina kodą ir jo surinkimą; GitHub Pages produkcijos neviešina.

1. Patikrinkite migracijų bei funkcijų suderinamumą su esamu frontend. Prieigos ribojimus įjunkite tik paruošę atitinkamą prisijungimo srautą.
2. Prieš DB pakeitimus pasirūpinkite atsargine kopija. Pritaikykite tik konkrečiam leidimui reikalingas migracijas ir patikrinkite jas atšaukiamoje testinėje transakcijoje.
3. Įdiekite pakeistas Edge Functions kartu su visomis jų santykinėmis priklausomybėmis. Bendro failo pakeitimas automatiškai neatnaujina kitų jau įdiegtų funkcijų.
4. Paleiskite atitinkamus Node, Python, Deno ir naršyklės testus, surinkite svetainę. Po `main` publikavimo palaukite Vercel Production sėkmės ir patikrinkite pagrindinį domeną.
5. Patikrinkite, kad svečias negali skaityti privačių lentelių, o savininkas negali keisti svetimų įrašų. Failų saugyklos turi likti privačios; viešas atminimo turinys ir trumpalaikės failų nuorodos gaunami per `profile-content`.
6. QR užsakymai kuriami per `profile-manage`; mokėjimą pradeda `payment-create`, mokėjimo būseną nustato Paysera webhook. Paprasta lentelė kainuoja 50 €, su raštu — 60 €, pristatymas — 3 €. Istorinių užsakymų sumos neperrašomos.
7. Bandymuose nemokėkite ir nesiųskite tikrų laiškų. Diegimo patikrai naudokite atskirus testus bei tik skaitymo užklausas. Sekite Security Advisor ir produkcijos klaidas.

## MFA įjungimas

Paskyros puslapis `saugumas.html` skirtas autentifikavimo programėlei prijungti ir prisijungimui patvirtinti. TOTP slaptas raktas rodomas tik registruojant programėlę ir nesaugomas naršyklės saugyklose. Kodai siunčiami tiesiogiai Supabase Auth.

`private.session_mfa_satisfied()` ir ribojančios RLS politikos reikalauja `aal2` vartotojui užregistravus patvirtintą MFA faktorių. Owner RPC funkcijos ir autentifikuotos Edge Functions taiko tą pačią taisyklę. Service role automatikos srautai nepaverčiami interaktyviais prisijungimais.

Esamų paskyrų MFA registraciją turi užbaigti patys paskyrų valdytojai savo telefonuose. Kol nėra patvirtinto faktoriaus, jų prieiga išlaikoma, kad būtų galima užbaigti registraciją. Todėl vien šio leidimo publikavimas nereiškia, kad abi administratoriaus paskyros jau apsaugotos MFA. Užbaigus abiejų paskyrų registraciją galima atskiru patikrintu pakeitimu padaryti MFA privalomą administratoriaus rolei nepriklausomai nuo turimų faktorių.

Praradus autentifikavimo programėlę reikia tapatybės patikros ir administratoriaus atkūrimo procedūros; nekurkite viešo MFA apėjimo. Nutekėjusių slaptažodžių apsauga įjungiama Supabase Auth nustatymuose, kai turima prieiga ir planas palaiko funkciją.

## Produkcijos nustatymai

Prieš priimant tikrus klientų duomenis:

- „Supabase Auth“ įjunkite nutekėjusių slaptažodžių apsaugą. Prieš įjungdami
  „Turnstile“ CAPTCHA, pirmiausia prijunkite jos valdiklį ir `captchaToken`
  perdavimą registracijos, prisijungimo bei slaptažodžio atkūrimo formose;
  dabartiniame frontende šios integracijos dar nėra, todėl vien Dashboard
  jungiklis sustabdytų šias formas.
- Administratoriaus paskyrai užbaikite TOTP MFA registraciją. Naujo leidimo
  serverinė apsauga pradeda reikalauti `aal2`, kai paskyrai patvirtinamas
  pirmasis MFA faktorius.
- Nustatykite tikslų `Site URL` ir tik būtinus `Redirect URLs`; nenaudokite
  plačių pakaitos šablonų produkcijoje.
- Prijunkite nuosavą SMTP, stebėkite nesėkmingus prisijungimus ir nustatykite
  perspėjimus apie neįprastą Auth, Storage bei mokėjimų aktyvumą.
- Tiesioginę PostgreSQL tinklo prieigą apribokite tik realiai naudojamiems
  administravimo IP adresams. Naršyklė turi jungtis per Data API, ne DB portą.
- Įjunkite automatines atsargines kopijas; mokamam planui rekomenduojamas PITR.
  Periodiškai atlikite atkūrimo bandymą atskiroje aplinkoje.
- Produkcijos paslaptis laikykite paslaugų „Secrets“ saugyklose, suteikite
  prieigą tik būtiniems žmonėms ir bent kartą per ketvirtį peržiūrėkite teises.

## Hostingo antraštės

HTML turi atsarginę CSP meta taisyklę, tačiau meta žyma negali nustatyti
`frame-ancestors`, HSTS ir kitų HTTP antraščių. „GitHub Pages“ neleidžia
valdyti visų reikiamų antraščių, todėl prieš tikrą paleidimą naudokite hostingą
arba reverse proxy, kuris nustato bent:

```text
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; script-src-elem 'self' https://www.googletagmanager.com; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co https://www.google-analytics.com; media-src 'self' blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com; frame-src https://www.openstreetmap.org
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(self)
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-site
X-Frame-Options: DENY
```

Po domeno prijungimo antraštes patikrinkite realiame HTTPS URL, ne tik vietiniame
serveryje.

## Incidento atvejis

1. Sustabdykite pažeistą raktą, funkciją ar paskyrą, bet nenaikinkite žurnalų.
2. Pakeiskite visas galimai paliestas paslaptis ir atšaukite aktyvias sesijas.
3. Nustatykite paveiktus duomenis, laikotarpį ir naudotojus iš nekintamų žurnalų
   bei atsarginių kopijų.
4. Atkurkite tik patikrintą versiją, stebėkite pasikartojimą ir užfiksuokite
   taisomuosius veiksmus.
5. Jei pažeisti asmens duomenys, įvertinkite BDAR pranešimo prievolę ir terminus
   su kompetentingu specialistu.
