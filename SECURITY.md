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

## Saugus šio pakeitimo diegimo eiliškumas

Failų saugyklos negalima paversti privačia anksčiau, nei svetainė pradeda naudoti
pasirašytas nuorodas. Diekite tokia tvarka:

1. Susiekite CLI su tinkamu „Supabase“ projektu ir patikrinkite projekto ID.
   Prieš diegdami `profile-manage`, nustatykite tikslų produkcijos HTTPS adresą
   Edge Functions paslaptyje `PUBLIC_SITE_URL`, nes serveris pagal jį sukuria
   užsakymo atminimo puslapio ir QR nuorodas.
2. Pirmiausia įdiekite visas Edge Functions, kad kartu būtų atnaujinti ir jų
   bendri saugumo patikrinimai:

   ```powershell
   supabase functions deploy
   ```

3. Patikrinkite, kad `profile-content` grąžina viešą aktyvų puslapį, savininkui
   leidžia matyti privatų puslapį, o svetimo privataus puslapio negrąžina.
4. Įdiekite atnaujintą frontend. Jis viešus profilius turi skaityti tik per
   `profile-content`, teisines formas siųsti tik per `legal-submission`, o
   rankiniu būdu įkeltas kapaviečių nuotraukas skaityti tik per `grave-photo`.
   „GitHub Pages“ workflow saugumo laikotarpiu paleidžiamas tik rankiniu būdu:
   pasirinkite `Deploy website to GitHub Pages` ir pažymėkite
   `backend_ready` tik kai šiame skyriuje nurodytos Edge Functions jau
   įdiegtos. Vien kodo įkėlimas į `main` gyvos svetainės automatiškai nekeičia.
5. Padarykite duomenų bazės kopiją ir tik tada pritaikykite migraciją:

   ```powershell
   supabase db push
   ```

   Svarbi migracija:
   `20260730121821_harden_private_profile_media.sql`.

   Jei diegimo žurnale matote `SECURITY FOLLOW-UP REQUIRED` apie
   `supabase_admin` numatytąsias teises, dabartinių objektų apsaugos vis tiek
   pritaikytos. Persiųskite tikslų perspėjimą „Supabase Support“ ir paprašykite
   pašalinti senas šios valdomos rolės `public` schemos default ACL teises.
6. Po migracijos patikrinkite šiuos scenarijus:

   - svečias mato aktyvų puslapį ir jo pasirašytas nuotraukas;
   - svečias nemato neaktyvaus puslapio, `owner_id` ar tikro failo kelio;
   - savininkas gali redaguoti bei ištrinti tik savo puslapį ir failus;
   - vieno naudotojo pateiktas svetimo failo kelias atmetamas;
   - anoniminė REST užklausa negali tiesiogiai skaityti `profiliai` ar
     `medijos`, įrašyti teisinių formų arba trinti Storage testų;
   - juodraščio ar paslėptos kapavietės nuotraukos tiesioginis Storage URL
     neveikia, o paskelbtos kapavietės nuotrauką grąžina `grave-photo`;
   - naują užsakymą galima sukurti tik per `profile-manage`, naudojant serverio
     sugeneruotą atminimo puslapio ir QR URL;
   - administratoriaus, užsakymo, pristatymo ir mokėjimo srautai tebėra veikiantys.
7. „Supabase Dashboard“ paleiskite „Security Advisor“ ir patikrinkite Edge
   Functions bei Auth žurnalus.

Jei vieši paveikslai po migracijos neatsidaro, neatverkite bucket viešai.
Pirmiausia tikrinkite `profile-content` diegimą, funkcijos žurnalus ir failo
kelio formatą.

## Produkcijos nustatymai

Prieš priimant tikrus klientų duomenis:

- „Supabase Auth“ įjunkite nutekėjusių slaptažodžių apsaugą. Prieš įjungdami
  „Turnstile“ CAPTCHA, pirmiausia prijunkite jos valdiklį ir `captchaToken`
  perdavimą registracijos, prisijungimo bei slaptažodžio atkūrimo formose;
  dabartiniame frontende šios integracijos dar nėra, todėl vien Dashboard
  jungiklis sustabdytų šias formas.
- Administratoriaus paskyrai įjunkite TOTP arba passkey MFA. Kritiniams
  veiksmams vėliau pridėkite serverinį `aal2` reikalavimą, kai MFA registravimo
  sąsaja bus paruošta.
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
