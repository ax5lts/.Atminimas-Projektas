# Atminimas

Lietuviška QR atminimo puslapių, lentelių užsakymo ir kapaviečių priežiūros svetainė. Frontendas yra paprastas HTML, CSS ir JavaScript; backendą teikia Supabase PostgreSQL, Auth, Storage ir Deno Edge Functions. Viešą `dist/` rinkinį publikuoja Vercel.

## Pradžia naujame pokalbyje

Pirmiausia skaitykite [AGENTS.md](AGENTS.md). Ten yra projekto taisyklės ir trumpas darbo pradžios kelias. Ankstesnių pokalbių žinoti nereikia.

| Ką norite suprasti | Kur skaityti |
| --- | --- |
| Kaip dalys susijusios ir kur redaguoti | [Architektūra](docs/ARCHITECTURE.md) |
| Puslapiai, bendri objektai, redaktorius ir užsakymo eiga | [Frontendas](docs/FRONTEND.md) |
| Funkcijos, duomenys, teisės ir migracijos | [Backendas](docs/BACKEND.md) |
| Tikslūs puslapių skriptai ir bendrų failų priklausomybės | [Generuojamas kodo žemėlapis](docs/GENERATED_MAP.md) |
| Paskutinė patikrinta produkcijos būsena ir žinomi ribojimai | [Projekto būsena](docs/PROJECT_STATE.md) |
| Saugumo principai | [SECURITY.md](SECURITY.md) |
| Diegimo procedūros ir ankstesni leidimai | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Kapaviečių paieškos ir seno importo detalės | [Paieškos aprašas](docs/CEMETERY_SEARCH.md) |

## Paleidimas

Reikia Node.js 22+ ir Python 3. Standartinei HTML peržiūrai Python paketų nereikia.

```sh
python serve.py
```

Atverkite `http://127.0.0.1:5000`. Tai vietinis statinių šaltinių serveris. Su produkcijos Supabase konfigūracija naršyklės užklausos pasiekia tikrą backendą; vietinė peržiūra savaime nesukuria izoliuotos DB.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
node --test tests/verify-build.cjs
```

`package.json` ir `vercel.json` nurodo naudojamą pnpm versiją. [pnpm-workspace.yaml](pnpm-workspace.yaml) `hoisted` režimas palaiko Windows exFAT diską be simbolinių nuorodų. Redaguokite šakninius HTML, `assets/` ir `css/`; `dist/` yra generuojamas rezultatas.

`app.py` yra papildomas vietinis Flask serveris ir paieškos API. Jam reikia `flask`, `python-dotenv` ir vietinės Supabase konfigūracijos. Jis nėra Vercel produkcijos serveris.

## Patikros

```sh
python -m unittest discover -s tests -p 'test_*.py' -q
node --test tests/*.test.cjs
pnpm dlx deno@2.9.6 test --node-modules-dir=none --allow-env --allow-net supabase/functions
node scripts/build.mjs
node --test tests/verify-build.cjs
pnpm docs:check
```

Node testai tikrina naršyklės logiką su imitatoriais; atskiri `*.browser.cjs` scenarijai naudoja Playwright. SQL testus vykdykite pagal [backend aprašą](docs/BACKEND.md), o ne kaip įprastas produkcijos migracijas. Mokėjimo ir laiškų srautus bandykite su imitatoriais.

## Dokumentacijos atnaujinimas

Pakeitus puslapių skriptus, Edge importus ar lokalią gateway konfigūraciją:

```sh
pnpm docs:map
pnpm docs:check
```

Žemėlapis skaitomas tik iš vietinių šaltinių ir nekeičia produkcijos. Architektūros pasikeitimus papildykite `docs/ARCHITECTURE.md`, tikrą diegimo rezultatą su data — `docs/PROJECT_STATE.md`. Datuoti auditai ir planai išlaikomi kaip istorija, ne kaip dabartinio elgesio garantija.
