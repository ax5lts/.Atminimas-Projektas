-- Viešai rodomos kapaviečių priežiūros kainos ir kelionės taisyklė nuo Panevėžio.
-- Kelionė skaičiuojama pirmyn ir atgal: 20 km įskaičiuota, po to 0,35 Eur/km.
update public.service_quote_settings
set
  base_label = 'Panevėžys',
  base_latitude = 55.734800,
  base_longitude = 24.357500,
  included_round_trip_km = 20,
  travel_rate_cents_per_km = 35,
  manual_review_over_one_way_km = 200,
  price_catalog = price_catalog || '{
    "candle_1": 300,
    "candle_2": 500,
    "candle_5": 2000,
    "flower_1": 500,
    "flower_3": 1500,
    "flower_5": 2500,
    "cleaning_full": 12000,
    "cleaning_grooves": 2000,
    "cleaning_surface": 1500,
    "cleaning_monument": 3000,
    "cleaning_leaves": 5000
  }'::jsonb,
  updated_at = now(),
  updated_by = null
where id = 'default';
