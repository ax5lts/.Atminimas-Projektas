import { calculateEstimate, optionSelection, type Settings } from "./index.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    id: "default",
    base_label: "Panevėžys",
    base_latitude: 55.7348,
    base_longitude: 24.3575,
    road_factor_min: 1.15,
    road_factor_max: 1.35,
    included_round_trip_km: 20,
    travel_rate_cents_per_km: 35,
    manual_review_over_one_way_km: 200,
    price_catalog: {
      candle_1: 300,
      candle_2: 500,
      candle_5: 2000,
      candle_other: null,
      flower_1: 500,
      flower_3: 1500,
      flower_5: 2500,
      flower_bouquet: null,
      flower_other: null,
      cleaning_full: 12000,
      cleaning_grooves: 2000,
      cleaning_surface: 1500,
      cleaning_monument: 3000,
      cleaning_leaves: 5000,
    },
    updated_at: "2026-09-03T00:00:00.000Z",
    ...overrides,
  };
}

Deno.test("fixed services and the included round trip are calculated", () => {
  const result = calculateEstimate(
    settings(),
    ["flower_3", "candle_2"],
    55.7348,
    24.3575,
  );
  assert(result.estimate_status === "calculated", "estimate should calculate");
  assert(
    result.estimated_service_cents === 2000,
    "service subtotal should be 20 EUR",
  );
  assert(
    result.estimated_travel_min_cents === 0,
    "included travel should be free",
  );
  assert(result.estimated_total_min_cents === 2000, "total should be 20 EUR");
  assert(
    result.included_round_trip_km === 20,
    "public rule should expose included km",
  );
  assert(
    result.travel_rate_cents_per_km === 35,
    "public rule should expose the rate",
  );
});

Deno.test("kilometres above the allowance use the configured rate", () => {
  const result = calculateEstimate(
    settings(),
    ["flower_1"],
    55.8348,
    24.3575,
  );
  assert(
    result.estimated_round_trip_min_km === 30,
    "trip should round to 30 km",
  );
  assert(
    result.estimated_travel_min_cents === 350,
    "10 charged km should cost 3.50 EUR",
  );
  assert(
    result.estimated_total_min_cents === 850,
    "total should include travel",
  );
});

Deno.test("unpriced custom bouquet requires a manual quote, not configuration", () => {
  const result = calculateEstimate(
    settings(),
    ["flower_bouquet"],
    55.7348,
    24.3575,
  );
  assert(
    result.estimate_status === "manual_required",
    "bouquet should be manual",
  );
  assert(
    result.reasons.includes("custom_option"),
    "custom reason should be returned",
  );
  assert(
    !result.reasons.includes("prices_missing"),
    "custom option is not a configuration error",
  );
});

Deno.test("journeys above the configured one-way limit require confirmation", () => {
  const result = calculateEstimate(
    settings(),
    ["cleaning_full"],
    57.2348,
    24.3575,
  );
  assert(
    result.reasons.includes("distance_limit"),
    "long trip should be flagged",
  );
  assert(
    result.estimate_status === "manual_required",
    "long trip should stay manual",
  );
  assert(
    result.estimated_travel_min_cents !== null,
    "travel range should remain visible",
  );
  assert(
    result.estimated_total_min_cents === null,
    "total awaits manual confirmation",
  );
});

Deno.test("full cleaning cannot be combined with separate cleaning tasks", () => {
  let threw = false;
  try {
    optionSelection(
      { cleaning_keys: ["cleaning_full", "cleaning_grooves"] },
      ["kapu_tvarkymas"],
    );
  } catch (_error) {
    threw = true;
  }
  assert(threw, "conflicting cleaning choices must be rejected");
});
