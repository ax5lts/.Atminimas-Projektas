import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "assets" / "business-config.js"
APP_CONFIG = ROOT / "assets" / "supabase-config.js"
REQUIRED = {
    "legalName": "veiklos vykdytojo vardas arba įmonės pavadinimas",
    "activityForm": "veiklos forma",
    "registrationCode": "veiklos / įmonės kodas",
    "registry": "registras",
    "address": "korespondencijos / buveinės adresas",
    "email": "viešas el. paštas",
    "vatStatus": "PVM statusas",
    "priceVat": "ar kaina su PVM",
    "shippingPrice": "siuntimo kaina",
    "shippingTerritory": "siuntimo teritorija",
    "productionTime": "pagaminimo terminas",
    "deliveryTime": "pristatymo terminas",
    "paymentMethods": "mokėjimo būdai",
    "paymentProvider": "mokėjimų teikėjas",
    "emailProvider": "automatinių el. laiškų teikėjas",
    "hostingProvider": "svetainės hostingo teikėjas",
    "hostingPeriod": "atminimo puslapio talpinimo trukmė",
    "manufacturer": "ženkliuko gamintojas",
    "productIdentifier": "produkto identifikatorius",
    "material": "ženkliuko medžiaga",
    "dimensions": "ženkliuko matmenys",
    "mounting": "tvirtinimo būdas",
    "safetyWarnings": "saugos perspėjimai",
}


text = CONFIG.read_text(encoding="utf-8")
values = dict(re.findall(r'^\s*([A-Za-z][A-Za-z0-9]*):\s*"([^"]*)"', text, re.M))
missing = [description for key, description in REQUIRED.items() if not values.get(key, "").strip()]
app_text = APP_CONFIG.read_text(encoding="utf-8")
app_values = dict(re.findall(r'^\s*([A-Z][A-Z0-9_]*):\s*"([^"]*)"', app_text, re.M))
if not app_values.get("PUBLIC_SITE_URL", "").strip():
    missing.append("viešas produkcinės svetainės adresas (domenas)")

if missing:
    print("SVETAINĖ DAR NEPARUOŠTA REALIAI PREKYBAI. Trūksta:")
    for item in missing:
        print("- " + item)
    sys.exit(1)

print("Rekvizitų ir komercinių duomenų patikra: OK")
