import {
  adminClient,
  env,
  handleOptions,
  json,
  readJson,
  RequestError,
} from "../_shared/core.ts";

const REPORT_REASONS = new Set([
  "atvaizdas_privatus_gyvenimas",
  "autoriu_teises",
  "melaginga_zeminanti_informacija",
  "kita_neteiseta",
]);

function text(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function requiredText(value: unknown, min: number, max: number, label: string) {
  const result = text(value, max);
  if (result.length < min) {
    throw new RequestError(`Patikrinkite lauką: ${label}`);
  }
  return result;
}

function email(value: unknown) {
  const result = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    throw new RequestError("Įrašykite galiojantį el. paštą");
  }
  return result;
}

function httpsUrl(value: unknown) {
  try {
    const parsed = new URL(text(value, 1000));
    if (parsed.protocol !== "https:") throw new Error("https required");
    parsed.username = "";
    parsed.password = "";
    return parsed.href;
  } catch (_error) {
    throw new RequestError("Įrašykite tikslią HTTPS turinio nuorodą");
  }
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return text(
    request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-real-ip") ||
      forwarded.split(",")[0],
    128,
  );
}

async function hmac(value: string, scope: string) {
  if (!value) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(
      env("RATE_LIMIT_HASH_SECRET", false) || env("SUPABASE_SERVICE_ROLE_KEY"),
    ),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`atminimas-legal-v1:${scope}:${value}`),
  );
  return Array.from(new Uint8Array(signature)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function rateLimit(request: Request) {
  const fingerprint = [
    text(request.headers.get("user-agent"), 512),
    text(request.headers.get("accept-language"), 128),
    text(request.headers.get("sec-ch-ua"), 256),
    text(request.headers.get("sec-ch-ua-platform"), 64),
  ].join("|");
  const client = adminClient();
  const { error } = await client.rpc("consume_service_request_rate_limit", {
    p_ip_hash: await hmac(clientIp(request), "ip"),
    p_device_hash: await hmac(fingerprint, "device"),
  });
  if (!error) return;
  if (/rate_limit_(?:ip|device)(?:\b|$)/i.test(error.message || "")) {
    throw new RequestError(
      "Per daug pateikimų. Palaukite ir pabandykite vėliau.",
      429,
    );
  }
  throw error;
}

function reference(prefix: string) {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${date}-${crypto.randomUUID().split("-")[0].toUpperCase()}`;
}

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await readJson(request, 16_000);
    const kind = text(body.form_type, 40);
    const prefix = kind === "atsisakymai"
      ? "ATS"
      : kind === "turinio_pranesimai"
      ? "PRN"
      : "";
    if (!prefix) throw new RequestError("Nežinoma forma");
    const referenceCode = reference(prefix);

    if (text(body.website, 200)) {
      return json({ reference_code: referenceCode, accepted: true }, 202);
    }
    await rateLimit(request);

    const client = adminClient();
    if (kind === "atsisakymai") {
      const payload = {
        reference_code: referenceCode,
        customer_name: requiredText(
          body.customer_name,
          2,
          160,
          "vardas ir pavardė",
        ),
        customer_email: email(body.customer_email),
        order_reference: requiredText(
          body.order_reference,
          1,
          100,
          "užsakymo numeris",
        ),
        statement: requiredText(body.statement, 10, 2000, "pareiškimas"),
        status: "gauta",
      };
      const { error } = await client.from("atsisakymai").insert(payload);
      if (error) throw error;
    } else {
      const reason = text(body.reason, 80);
      if (!REPORT_REASONS.has(reason)) {
        throw new RequestError("Pasirinkite pažeidimo rūšį");
      }
      if (body.good_faith !== "yes") {
        throw new RequestError("Patvirtinkite sąžiningo pateikimo pareiškimą");
      }
      const payload = {
        reference_code: referenceCode,
        reporter_email: email(body.reporter_email),
        content_url: httpsUrl(body.content_url),
        reason,
        explanation: requiredText(body.explanation, 10, 5000, "paaiškinimas"),
        good_faith: "yes",
        status: "gauta",
      };
      const { error } = await client.from("turinio_pranesimai").insert(payload);
      if (error) throw error;
    }

    return json({
      reference_code: referenceCode,
      submitted_at: new Date().toISOString(),
      accepted: true,
    }, 201);
  } catch (error) {
    if (error instanceof RequestError) {
      return json({ error: error.message }, error.status);
    }
    console.error("legal-submission failed", error);
    return json({ error: "Pateikimo išsaugoti nepavyko" }, 500);
  }
});
