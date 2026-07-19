import {
  adminClient,
  env,
  handleOptions,
  json,
  money,
  publicSiteUrl,
  requireUser,
} from "../_shared/core.ts";
import { sendEmail } from "../_shared/email.ts";

const ALLOWED_SERVICES = ["zvakes", "geles", "kapu_tvarkymas"] as const;
const PRICE_GROUPS = {
  zvakes: ["candle_1", "candle_2", "candle_5", "candle_other"],
  geles: ["flower_1", "flower_3", "flower_5", "flower_bouquet", "flower_other"],
  kapu_tvarkymas: ["cleaning_full", "cleaning_grooves", "cleaning_surface", "cleaning_monument", "cleaning_leaves"],
} as const;
const ALL_PRICE_KEYS: string[] = Object.values(PRICE_GROUPS).flat() as string[];
const MAX_CENTS = 100_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Settings = {
  id: string;
  base_label: string;
  base_latitude: number | string;
  base_longitude: number | string;
  road_factor_min: number | string;
  road_factor_max: number | string;
  included_round_trip_km: number | string;
  travel_rate_cents_per_km: number | null;
  manual_review_over_one_way_km: number | string;
  price_catalog: Record<string, number | null>;
  updated_at: string;
  updated_by?: string | null;
};

class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function requiredText(value: unknown, min: number, max: number, label: string) {
  const result = text(value, max);
  if (result.length < min) throw new HttpError(`Trūksta lauko: ${label}`);
  return result;
}

function email(value: unknown) {
  const result = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError("Įrašykite galiojantį el. paštą");
  return result;
}

function finite(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validCoordinates(latitude: number | null, longitude: number | null) {
  return latitude !== null && longitude !== null && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function roundUpFive(value: number) {
  return Math.ceil(Math.max(0, value) / 5) * 5;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const earthKm = 6371;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cleanPriceKeys(value: unknown, allowed: readonly string[]) {
  if (!Array.isArray(value)) return [];
  const result = Array.from(new Set(value.map((item) => String(item || "")).filter((item) => allowed.includes(item))));
  return result;
}

function priceCatalog(settings: Settings) {
  const source = settings.price_catalog && typeof settings.price_catalog === "object" ? settings.price_catalog : {};
  return Object.fromEntries(ALL_PRICE_KEYS.map((key) => {
    const value = source[key];
    return [key, Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null];
  }));
}

function calculateEstimate(settings: Settings, keys: string[], latitude: number | null, longitude: number | null) {
  const catalog = priceCatalog(settings);
  const uniqueKeys = Array.from(new Set(keys.filter((key) => ALL_PRICE_KEYS.includes(key))));
  const missingPriceKeys = uniqueKeys.filter((key) => !Number.isInteger(catalog[key]));
  const serviceCents = missingPriceKeys.length ? null : uniqueKeys.reduce((sum, key) => sum + Number(catalog[key]), 0);
  const reasons: string[] = [];
  if (!uniqueKeys.length) reasons.push("services_missing");
  if (missingPriceKeys.length) reasons.push("prices_missing");
  if (uniqueKeys.some((key) => key.endsWith("_other"))) reasons.push("custom_option");

  const baseLat = finite(settings.base_latitude);
  const baseLng = finite(settings.base_longitude);
  const hasDestination = validCoordinates(latitude, longitude);
  const hasBase = validCoordinates(baseLat, baseLng);
  let straightKm: number | null = null;
  let oneWayMinKm: number | null = null;
  let oneWayMaxKm: number | null = null;
  let roundTripMinKm: number | null = null;
  let roundTripMaxKm: number | null = null;
  let travelMinCents: number | null = null;
  let travelMaxCents: number | null = null;

  if (!hasDestination) reasons.push("coordinates_missing");
  if (!hasBase) reasons.push("base_unconfigured");
  if (hasDestination && hasBase) {
    straightKm = haversineKm(baseLat as number, baseLng as number, latitude as number, longitude as number);
    oneWayMinKm = roundUpFive(straightKm * Number(settings.road_factor_min));
    oneWayMaxKm = Math.max(oneWayMinKm, roundUpFive(straightKm * Number(settings.road_factor_max)));
    roundTripMinKm = oneWayMinKm * 2;
    roundTripMaxKm = oneWayMaxKm * 2;
    if (oneWayMaxKm > Number(settings.manual_review_over_one_way_km)) reasons.push("distance_limit");
    const rate = settings.travel_rate_cents_per_km;
    if (!Number.isInteger(rate) || Number(rate) < 0) {
      reasons.push("travel_rate_missing");
    } else {
      const included = Number(settings.included_round_trip_km) || 0;
      travelMinCents = Math.round(Math.max(0, roundTripMinKm - included) * Number(rate));
      travelMaxCents = Math.round(Math.max(0, roundTripMaxKm - included) * Number(rate));
      if (travelMinCents > MAX_CENTS || travelMaxCents > MAX_CENTS) {
        travelMinCents = null;
        travelMaxCents = null;
        reasons.push("amount_limit");
      }
    }
  }

  let calculated = reasons.length === 0 && serviceCents !== null && travelMinCents !== null && travelMaxCents !== null;
  let totalMinCents = calculated ? serviceCents + travelMinCents : null;
  let totalMaxCents = calculated ? serviceCents + travelMaxCents : null;
  if ((totalMinCents !== null && totalMinCents > MAX_CENTS) || (totalMaxCents !== null && totalMaxCents > MAX_CENTS)) {
    reasons.push("amount_limit");
    calculated = false;
    totalMinCents = null;
    totalMaxCents = null;
  }
  const configurationMissing = reasons.some((reason) => reason === "prices_missing" || reason === "travel_rate_missing" || reason === "base_unconfigured");
  return {
    estimate_status: calculated ? "calculated" : configurationMissing ? "unconfigured" : "manual_required",
    reasons,
    missing_price_keys: missingPriceKeys,
    base_label: settings.base_label,
    price_catalog_cents: catalog,
    straight_distance_km: straightKm === null ? null : Number(straightKm.toFixed(2)),
    estimated_one_way_min_km: oneWayMinKm,
    estimated_one_way_max_km: oneWayMaxKm,
    estimated_round_trip_min_km: roundTripMinKm,
    estimated_round_trip_max_km: roundTripMaxKm,
    estimated_service_cents: serviceCents,
    estimated_travel_min_cents: travelMinCents,
    estimated_travel_max_cents: travelMaxCents,
    estimated_total_min_cents: totalMinCents,
    estimated_total_max_cents: totalMaxCents,
    currency: "EUR",
  };
}

async function loadSettings(client = adminClient()) {
  const { data, error } = await client.from("service_quote_settings").select("*").eq("id", "default").single();
  if (error || !data) throw new Error(error?.message || "Paslaugų kainodara nerasta");
  return data as Settings;
}

async function bodyOf(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("Netinkama užklausa");
  return body as Record<string, unknown>;
}

async function requireAdmin(request: Request) {
  const session = await requireUser(request);
  const client = adminClient();
  const { data, error } = await client.from("user_roles").select("role").eq("user_id", session.user.id).eq("role", "admin").maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError("Reikalingos administratoriaus teisės", 403);
  return { ...session, client };
}

async function optionalUser(request: Request) {
  try {
    const session = await requireUser(request);
    return session.user.is_anonymous ? null : session;
  } catch (_error) {
    return null;
  }
}

function requestIp(request: Request) {
  const direct = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "";
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return text(direct || forwarded.split(",")[0], 128);
}

async function pseudonymousRateLimitHashes(request: Request) {
  const secret = env("RATE_LIMIT_HASH_SECRET", false) || env("SUPABASE_SERVICE_ROLE_KEY");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const hash = async (scope: string, value: string) => {
    const signature = new Uint8Array(await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`atminimas-service-rate-v1:${scope}:${value}`),
    ));
    return Array.from(signature).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  };
  const ip = requestIp(request);
  const deviceMaterial = [
    ip || "no-ip",
    text(request.headers.get("user-agent"), 512),
    text(request.headers.get("accept-language"), 128),
    text(request.headers.get("sec-ch-ua"), 256),
    text(request.headers.get("sec-ch-ua-mobile"), 16),
    text(request.headers.get("sec-ch-ua-platform"), 64),
  ].join("\n");
  return {
    ip_hash: ip ? await hash("ip", ip) : null,
    device_hash: await hash("device", deviceMaterial),
  };
}

async function consumeRequestRateLimit(client: ReturnType<typeof adminClient>, request: Request) {
  const hashes = await pseudonymousRateLimitHashes(request);
  const { error } = await client.rpc("consume_service_request_rate_limit", {
    p_ip_hash: hashes.ip_hash,
    p_device_hash: hashes.device_hash,
  });
  if (!error) return;
  if (/rate_limit_(?:ip|device)(?:\b|$)/i.test(error.message || "")) {
    throw new HttpError("Per daug užklausų iš šio įrenginio arba tinklo. Pabandykite po valandos.", 429);
  }
  throw error;
}

function optionSelection(body: Record<string, unknown>, services: string[]) {
  const candles = cleanPriceKeys(body.candle_keys, PRICE_GROUPS.zvakes);
  const flowers = cleanPriceKeys(body.flower_keys, PRICE_GROUPS.geles);
  const cleaning = cleanPriceKeys(body.cleaning_keys, PRICE_GROUPS.kapu_tvarkymas);
  if (services.includes("zvakes") && candles.length !== 1) throw new HttpError("Pasirinkite žvakių kiekį");
  if (services.includes("geles") && flowers.length !== 1) throw new HttpError("Pasirinkite gėlių variantą");
  if (services.includes("kapu_tvarkymas") && !cleaning.length) throw new HttpError("Pasirinkite tvarkymo darbus");
  return {
    candle_keys: services.includes("zvakes") ? candles : [],
    flower_keys: services.includes("geles") ? flowers : [],
    cleaning_keys: services.includes("kapu_tvarkymas") ? cleaning : [],
    all: [
      ...(services.includes("zvakes") ? candles : []),
      ...(services.includes("geles") ? flowers : []),
      ...(services.includes("kapu_tvarkymas") ? cleaning : []),
    ],
  };
}

async function estimateAction(body: Record<string, unknown>) {
  const settings = await loadSettings();
  const keys = cleanPriceKeys(body.price_keys, ALL_PRICE_KEYS);
  const latitude = finite(body.destination_latitude);
  const longitude = finite(body.destination_longitude);
  return calculateEstimate(settings, keys, latitude, longitude);
}

async function createAction(request: Request, body: Record<string, unknown>) {
  if (text(body.website, 200)) throw new HttpError("Netinkama užklausa");
  const session = await optionalUser(request);
  const client = adminClient();
  const services = Array.isArray(body.services)
    ? Array.from(new Set(body.services.map((value) => String(value || "")).filter((value) => ALLOWED_SERVICES.includes(value as typeof ALLOWED_SERVICES[number]))))
    : [];
  if (!services.length) throw new HttpError("Pasirinkite bent vieną paslaugą");
  const options = optionSelection(body, services);
  const latitude = finite(body.destination_latitude);
  const longitude = finite(body.destination_longitude);
  const hasCoordinates = validCoordinates(latitude, longitude);
  const requestedSource = String(body.location_source || "manual");
  const locationSource = hasCoordinates && ["registry", "saved"].includes(requestedSource) ? requestedSource : "manual";
  const settings = await loadSettings(client);
  const estimate = calculateEstimate(settings, options.all, latitude, longitude);
  const contactEmail = email(body.contact_email);
  await consumeRequestRateLimit(client, request);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: rateError } = await client.from("paslaugu_uzklausos")
    .select("id", { count: "exact", head: true }).eq("contact_email", contactEmail).gte("created_at", since);
  if (rateError) throw rateError;
  if ((recentCount || 0) >= 5) throw new HttpError("Šiuo el. paštu šiandien jau pateikta per daug užklausų", 429);
  const sessionEmail = String(session?.user.email || "").trim().toLowerCase();
  const ownerId = session?.user.email_confirmed_at && sessionEmail === contactEmail
    ? session.user.id
    : null;
  const payload = {
    owner_id: ownerId,
    contact_email: contactEmail,
    contact_phone: text(body.contact_phone, 40) || null,
    paslaugos: services,
    mirusiojo_vardas: requiredText(body.deceased_name, 2, 180, "mirusiojo vardas"),
    kapiniu_pavadinimas: requiredText(body.cemetery_name, 2, 200, "kapinių pavadinimas"),
    savivaldybe: requiredText(body.municipality, 2, 160, "miestas arba savivaldybė"),
    kapo_vieta: requiredText(body.grave_location, 3, 1000, "kapo vieta"),
    geliu_pageidavimai: services.includes("geles") ? text(body.flower_details, 1200) || null : null,
    zvakiu_pageidavimai: services.includes("zvakes") ? text(body.candle_details, 1200) || null : null,
    tvarkymo_pageidavimai: services.includes("kapu_tvarkymas") ? text(body.cleaning_details, 1600) || null : null,
    papildoma_informacija: text(body.extra_information, 2000) || null,
    destination_latitude: hasCoordinates ? latitude : null,
    destination_longitude: hasCoordinates ? longitude : null,
    location_source: locationSource,
    estimate_status: estimate.estimate_status,
    straight_distance_km: estimate.straight_distance_km,
    estimated_one_way_min_km: estimate.estimated_one_way_min_km,
    estimated_one_way_max_km: estimate.estimated_one_way_max_km,
    estimated_round_trip_min_km: estimate.estimated_round_trip_min_km,
    estimated_round_trip_max_km: estimate.estimated_round_trip_max_km,
    estimated_service_cents: estimate.estimated_service_cents,
    estimated_travel_min_cents: estimate.estimated_travel_min_cents,
    estimated_travel_max_cents: estimate.estimated_travel_max_cents,
    estimated_total_min_cents: estimate.estimated_total_min_cents,
    estimated_total_max_cents: estimate.estimated_total_max_cents,
    currency: "EUR",
    quote_status: "awaiting_admin",
    payment_status: "not_ready",
  };
  const { data, error } = await client.from("paslaugu_uzklausos").insert(payload).select("id,quote_status,estimate_status,estimated_total_min_cents,estimated_total_max_cents,currency,created_at").single();
  if (error) throw error;
  return { request: data, estimate };
}

async function claimAction(request: Request, body: Record<string, unknown>) {
  const { user } = await requireUser(request);
  const client = adminClient();
  if (user.is_anonymous || !user.email || !user.email_confirmed_at) {
    throw new HttpError("Pirmiausia prisijunkite patvirtintu el. paštu", 401);
  }
  const requestId = String(body.request_id || "");
  if (!requestId) throw new HttpError("Trūksta paslaugos užklausos numerio");
  const { data: existing, error } = await client.from("paslaugu_uzklausos")
    .select("id,owner_id,contact_email,quote_status,quote_revision")
    .eq("id", requestId).maybeSingle();
  if (error) throw error;
  if (!existing) throw new HttpError("Paslaugos užklausa nerasta", 404);
  if (existing.owner_id === user.id) return { claimed: true, request: existing };
  if (existing.owner_id) throw new HttpError("Ši užklausa jau priskirta kitai paskyrai", 409);
  if (String(existing.contact_email || "").toLowerCase() !== user.email.toLowerCase()) {
    throw new HttpError("Prisijunkite tuo pačiu el. paštu, kuriuo pateikėte užklausą", 403);
  }
  const { data: claimed, error: claimError } = await client.from("paslaugu_uzklausos")
    .update({ owner_id: user.id, updated_at: new Date().toISOString() })
    .eq("id", requestId).is("owner_id", null)
    .select("id,owner_id,quote_status,quote_revision").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) throw new HttpError("Užklausos priskyrimo būsena pasikeitė. Atnaujinkite puslapį.", 409);
  return { claimed: true, request: claimed };
}

async function getSettingsAction(request: Request) {
  await requireAdmin(request);
  const client = adminClient();
  return { settings: await loadSettings(client) };
}

async function saveSettingsAction(request: Request, body: Record<string, unknown>) {
  const { user } = await requireAdmin(request);
  const client = adminClient();
  const sourceCatalog = body.price_catalog && typeof body.price_catalog === "object" && !Array.isArray(body.price_catalog)
    ? body.price_catalog as Record<string, unknown>
    : {};
  const catalog = Object.fromEntries(ALL_PRICE_KEYS.map((key) => {
    const raw = sourceCatalog[key];
    if (raw === null || raw === undefined || raw === "") return [key, null];
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > 10000000) throw new HttpError(`Netinkama kaina: ${key}`);
    return [key, value];
  }));
  const baseLatitude = finite(body.base_latitude);
  const baseLongitude = finite(body.base_longitude);
  if (!validCoordinates(baseLatitude, baseLongitude)) throw new HttpError("Netinkamos bazės koordinatės");
  const factorMin = finite(body.road_factor_min);
  const factorMax = finite(body.road_factor_max);
  if (factorMin === null || factorMax === null || factorMin < 1 || factorMax < factorMin || factorMax > 3) throw new HttpError("Netinkami kelio koeficientai");
  const includedKm = finite(body.included_round_trip_km);
  const reviewKm = finite(body.manual_review_over_one_way_km);
  const rateValue = body.travel_rate_cents_per_km === null || body.travel_rate_cents_per_km === "" ? null : Number(body.travel_rate_cents_per_km);
  if (includedKm === null || includedKm < 0 || reviewKm === null || reviewKm <= 0) throw new HttpError("Netinkamos kelionės ribos");
  if (rateValue !== null && (!Number.isInteger(rateValue) || rateValue < 0 || rateValue > 100000)) throw new HttpError("Netinkamas kilometro tarifas");
  const update = {
    base_label: requiredText(body.base_label, 2, 120, "bazės pavadinimas"),
    base_latitude: baseLatitude,
    base_longitude: baseLongitude,
    road_factor_min: factorMin,
    road_factor_max: factorMax,
    included_round_trip_km: includedKm,
    travel_rate_cents_per_km: rateValue,
    manual_review_over_one_way_km: reviewKm,
    price_catalog: catalog,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };
  const { data, error } = await client.from("service_quote_settings").update(update).eq("id", "default").select("*").single();
  if (error) throw error;
  return { settings: data };
}

async function sendQuoteAction(request: Request, body: Record<string, unknown>) {
  const { user } = await requireAdmin(request);
  const client = adminClient();
  const requestId = String(body.request_id || "");
  const revision = Number(body.expected_revision);
  const amountCents = Number(body.amount_cents);
  const expiresAt = new Date(String(body.expires_at || ""));
  if (!requestId || !Number.isInteger(revision) || !Number.isInteger(amountCents) || amountCents <= 0 || Number.isNaN(expiresAt.valueOf())) {
    throw new HttpError("Trūksta pasiūlymo duomenų");
  }
  const { data: quote, error } = await client.rpc("admin_send_service_quote", {
    p_request_id: requestId,
    p_actor_id: user.id,
    p_expected_revision: revision,
    p_amount_cents: amountCents,
    p_message: text(body.message, 2000) || null,
    p_expires_at: expiresAt.toISOString(),
  });
  if (error || !quote) throw new Error(error?.message || "Pasiūlymo išsaugoti nepavyko");

  let emailSent = false;
  let emailError: string | null = null;
  try {
    let recipient = String(quote.contact_email || "").trim().toLowerCase();
    if (!recipient && quote.owner_id) {
      const { data: account, error: accountError } = await client.auth.admin.getUserById(quote.owner_id);
      if (accountError) throw accountError;
      recipient = String(account.user?.email || "").trim().toLowerCase();
    }
    if (!recipient) throw new Error("Užklausa neturi kliento el. pašto");
    await sendEmail({
      to: recipient,
      subject: "Paruoštas kapavietės priežiūros pasiūlymas",
      heading: "Jūsų paslaugų pasiūlymas paruoštas",
      paragraphs: [
        `Galutinė pasiūlymo kaina: ${money(quote.quote_amount_cents, quote.currency)}.`,
        quote.quote_message || "Peržiūrėkite pasiūlymą kliento zonoje ir pasirinkite, ar jį priimate.",
        `Pasiūlymas galioja iki ${new Intl.DateTimeFormat("lt-LT", { dateStyle: "long" }).format(new Date(quote.quote_expires_at))}.`,
        "Užklausa pateikta be privalomos paskyros. Prisijunkite arba užsiregistruokite šiuo el. paštu tik tada, kai norėsite pasiūlymą priimti ir apmokėti.",
      ],
      actionUrl: `${publicSiteUrl()}vartotojas.html?service=${encodeURIComponent(quote.id)}&claim=1#paslaugos`,
      actionLabel: "Priimti pasiūlymą ir apmokėti",
      idempotencyKey: `service:${quote.id}:quote:${quote.quote_revision}`,
    });
    emailSent = true;
    const { error: emailUpdateError } = await client.from("paslaugu_uzklausos")
      .update({ quote_email_sent_at: new Date().toISOString(), quote_email_error: null }).eq("id", quote.id);
    if (emailUpdateError) throw emailUpdateError;
  } catch (emailFailure) {
    emailError = emailFailure instanceof Error ? emailFailure.message : "Laiško išsiųsti nepavyko";
    const { error: errorUpdateError } = await client.from("paslaugu_uzklausos")
      .update({ quote_email_error: emailError.slice(0, 2000) }).eq("id", quote.id);
    if (errorUpdateError) emailError = `${emailError}; būsenos išsaugoti nepavyko: ${errorUpdateError.message}`.slice(0, 2000);
  }
  return { quote, email_sent: emailSent, email_error: emailError };
}

function checkoutUrl(value: unknown) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" && parsed.hostname === "checkout.stripe.com" ? parsed.href : "";
  } catch (_error) {
    return "";
  }
}

function assertStripeSessionBinding(session: Record<string, any>, service: Record<string, any>, expiresAtSeconds: number) {
  const metadata = session.metadata && typeof session.metadata === "object" ? session.metadata : {};
  const sameSession = service.payment_session_id === null || session.id === service.payment_session_id;
  const valid = sameSession
    && session.mode === "payment"
    && session.client_reference_id === `service:${service.id}`
    && String(metadata.entity_type || "") === "service"
    && String(metadata.service_request_id || "") === service.id
    && String(metadata.quote_revision || "") === String(service.quote_revision)
    && String(metadata.payment_attempt_id || "") === String(service.payment_attempt_id)
    && Number(session.amount_total) === service.quote_amount_cents
    && String(session.currency || "").toUpperCase() === String(service.currency || "EUR").toUpperCase()
    && Number(session.expires_at) === expiresAtSeconds;
  if (!valid) throw new HttpError("Stripe mokėjimo sesijos duomenys neatitinka pasiūlymo", 409);
}

async function readStripeSession(stripeKey: string, sessionId: string) {
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const session = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError("Esamos mokėjimo sesijos patikrinti nepavyko. Pabandykite dar kartą.", 502);
  return session as Record<string, any>;
}

function finalStripeClientError(status: number, response: Record<string, any>) {
  const type = String(response?.error?.type || "");
  return status >= 400 && status < 500
    && ![408, 409, 425, 429].includes(status)
    && type !== "idempotency_error";
}

async function startPaymentAction(request: Request, body: Record<string, unknown>) {
  const { user } = await requireUser(request);
  const client = adminClient();
  if (user.is_anonymous) throw new HttpError("Prieš mokėjimą prisijunkite", 401);
  const requestId = String(body.request_id || "");
  if (!requestId) throw new HttpError("Trūksta paslaugos užklausos numerio");
  const stripeKey = env("STRIPE_SECRET_KEY", false);
  if (!stripeKey) throw new HttpError("Mokėjimų tiekėjas dar nesukonfigūruotas", 503);
  const { data: service, error } = await client.rpc("begin_my_service_payment", {
    p_request_id: requestId,
    p_actor_id: user.id,
  });
  if (error || !service) throw new Error(error?.message || "Mokėjimo bandymo pradėti nepavyko");
  if (service.payment_status === "paid") throw new HttpError("Pasiūlymas jau apmokėtas", 409);
  if (service.quote_status === "expired") throw new HttpError("Pasiūlymo galiojimas baigėsi. Paprašykite naujo pasiūlymo.", 409);
  if (service.quote_status !== "accepted" || service.payment_status !== "processing" || !service.payment_attempt_id) {
    throw new HttpError("Pirmiausia priimkite galutinį pasiūlymą", 409);
  }
  if (!Number.isInteger(service.quote_amount_cents) || service.quote_amount_cents <= 0) throw new HttpError("Galutinė kaina nepatvirtinta", 409);
  const sessionExpirySeconds = Math.floor(new Date(service.payment_session_expires_at).valueOf() / 1000);
  if (!Number.isFinite(sessionExpirySeconds)) throw new Error("Mokėjimo sesijos galiojimo laikas nenustatytas");

  if (service.payment_session_id) {
    const existingSession = await readStripeSession(stripeKey, String(service.payment_session_id));
    assertStripeSessionBinding(existingSession, service, sessionExpirySeconds);
    const existingUrl = checkoutUrl(existingSession.url);
    if (existingSession.status === "open" && existingUrl) {
      return { checkout_url: existingUrl, session_id: existingSession.id, reused: true };
    }
    if (existingSession.payment_status === "paid" || existingSession.status === "complete") {
      throw new HttpError("Mokėjimas užbaigtas ir laukia saugaus Stripe patvirtinimo", 409);
    }
    throw new HttpError("Mokėjimo sesija nebegalioja. Atnaujinkite puslapį ir pabandykite dar kartą.", 409);
  }

  const site = publicSiteUrl();
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${site}vartotojas.html?service=${encodeURIComponent(service.id)}&payment=success#paslaugos`);
  params.set("cancel_url", `${site}vartotojas.html?service=${encodeURIComponent(service.id)}&payment=cancelled#paslaugos`);
  params.set("client_reference_id", `service:${service.id}`);
  params.set("metadata[entity_type]", "service");
  params.set("metadata[service_request_id]", service.id);
  params.set("metadata[quote_revision]", String(service.quote_revision));
  params.set("metadata[payment_attempt_id]", String(service.payment_attempt_id));
  params.set("line_items[0][price_data][currency]", String(service.currency || "EUR").toLowerCase());
  params.set("line_items[0][price_data][unit_amount]", String(service.quote_amount_cents));
  params.set("line_items[0][price_data][product_data][name]", "Kapavietės priežiūros paslaugos");
  params.set("line_items[0][quantity]", "1");
  params.set("locale", "lt");
  if (service.contact_email) params.set("customer_email", String(service.contact_email));
  params.set("expires_at", String(sessionExpirySeconds));

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `service-checkout-${service.id}-${service.quote_revision}-${service.payment_attempt_id}`.slice(0, 255),
    },
    body: params,
  });
  const session = await stripeResponse.json().catch(() => ({})) as Record<string, any>;
  if (!stripeResponse.ok) {
    if (finalStripeClientError(stripeResponse.status, session)) {
      const { error: failError } = await client.rpc("fail_unattached_service_payment", {
        p_request_id: service.id,
        p_actor_id: user.id,
        p_quote_revision: service.quote_revision,
        p_payment_attempt_id: service.payment_attempt_id,
        p_http_status: stripeResponse.status,
      });
      if (failError) throw new Error(`Stripe klaida; bandymo būsenos atkurti nepavyko: ${failError.message}`);
    }
    throw new HttpError("Stripe mokėjimo sesijos sukurti nepavyko. Pabandykite dar kartą.", 502);
  }
  assertStripeSessionBinding(session, service, sessionExpirySeconds);
  const safeCheckoutUrl = checkoutUrl(session.url);
  if (!safeCheckoutUrl || !session.id) throw new Error("Stripe negrąžino saugios mokėjimo nuorodos");
  const { data: attached, error: attachError } = await client.rpc("attach_service_payment_session", {
    p_request_id: service.id,
    p_actor_id: user.id,
    p_quote_revision: service.quote_revision,
    p_payment_attempt_id: service.payment_attempt_id,
    p_session_id: String(session.id),
  });
  if (attachError || !attached || attached.payment_session_id !== session.id) {
    throw new Error(attachError?.message || "Mokėjimo sesijos patvirtinti nepavyko");
  }
  return { checkout_url: safeCheckoutUrl, session_id: session.id, reused: false };
}

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await bodyOf(request);
    const action = String(body.action || "estimate");
    if (action === "estimate") return json(await estimateAction(body));
    if (action === "create") return json(await createAction(request, body), 201);
    if (action === "claim") return json(await claimAction(request, body));
    if (action === "get_settings") return json(await getSettingsAction(request));
    if (action === "save_settings") return json(await saveSettingsAction(request, body));
    if (action === "send_quote") return json(await sendQuoteAction(request, body));
    if (action === "start_payment") return json(await startPaymentAction(request, body));
    throw new HttpError("Nežinomas veiksmas");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Paslaugos veiksmas nepavyko";
    const status = error instanceof HttpError
      ? error.status
      : /^(Authentication required|Invalid session)$/i.test(message) ? 401 : 500;
    return json({ error: message }, status);
  }
});
