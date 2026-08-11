import {
  adminClient,
  env,
  handleOptions,
  json,
  readJson,
  RequestError,
} from "../_shared/core.ts";

const PRODUCT_NAMES: Record<string, string> = {
  metal: "Graviruota plieno QR atminimo lentelė",
  asa: "ASA 3D spausdinta QR atminimo lentelė",
};

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
    new TextEncoder().encode(`atminimas-preorder-v1:${scope}:${value}`),
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

function reference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `PRE-${date}-${crypto.randomUUID().split("-")[0].toUpperCase()}`;
}

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await readJson(request, 16_000);
    const referenceCode = reference();
    if (text(body.website, 200)) {
      return json({ reference_code: referenceCode, accepted: true }, 202);
    }
    if (body.consent !== "yes") {
      throw new RequestError("Patvirtinkite duomenų naudojimo sąlygą");
    }

    const productType = text(body.product_type, 20);
    if (!PRODUCT_NAMES[productType]) {
      throw new RequestError("Pasirinkite lentelės variantą");
    }
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new RequestError("Pasirinkite kiekį nuo 1 iki 10");
    }

    const customerEmail = email(body.customer_email);
    const customerPhone = text(body.customer_phone, 40) || null;
    if (customerPhone && customerPhone.length < 5) {
      throw new RequestError("Patikrinkite telefono numerį");
    }

    await rateLimit(request);
    const client = adminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await client
      .from("preorder_requests")
      .select("id", { count: "exact", head: true })
      .eq("customer_email", customerEmail)
      .gte("created_at", since);
    if (countError) throw countError;
    if ((count || 0) >= 3) {
      throw new RequestError(
        "Šiuo el. paštu šiandien jau pateikta per daug išankstinių užsakymų.",
        429,
      );
    }

    const { data: catalog, error: catalogError } = await client
      .from("product_catalog")
      .select("name,price_cents,currency")
      .eq("id", productType)
      .maybeSingle();
    if (catalogError) throw catalogError;

    const payload = {
      reference_code: referenceCode,
      product_type: productType,
      product_name: text(catalog?.name, 200) || PRODUCT_NAMES[productType],
      quantity,
      expected_price_cents: Number.isInteger(catalog?.price_cents)
        ? Number(catalog?.price_cents)
        : null,
      currency: /^[A-Z]{3}$/.test(String(catalog?.currency || ""))
        ? String(catalog?.currency)
        : "EUR",
      customer_name: requiredText(body.customer_name, 2, 160, "vardas"),
      customer_email: customerEmail,
      customer_phone: customerPhone,
      notes: text(body.notes, 2000) || null,
      source_path: text(body.source_path, 500) || null,
      status: "new",
      consent_at: new Date().toISOString(),
    };
    const { data, error } = await client.from("preorder_requests").insert(
      payload,
    ).select("reference_code,created_at").single();
    if (error) throw error;

    return json({
      reference_code: data.reference_code,
      submitted_at: data.created_at,
      accepted: true,
      payment_taken: false,
    }, 201);
  } catch (error) {
    if (error instanceof RequestError) {
      return json({ error: error.message }, error.status);
    }
    console.error("preorder failed", error);
    return json({ error: "Išankstinio užsakymo išsaugoti nepavyko" }, 500);
  }
});
