import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  adminClient,
  env,
  publicSiteUrl,
  RequestError,
  requireUser,
} from "./core.ts";

export type ModernConfig = {
  clientId: string;
  clientSecret: string;
  projectId: string;
};
export const PAYSERA_API = "https://api.paysera.com";
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Client = ReturnType<typeof adminClient>;

export function parseModernConfig(
  value: Record<string, unknown>,
): ModernConfig {
  const clientId = String(value.client_id || "").trim();
  const clientSecret = String(value.client_secret || "").trim();
  const projectId = String(value.project_id || "").trim();
  if (!clientId || !clientSecret || !UUID.test(projectId)) {
    throw new RequestError("„Paysera“ duomenys dar nenustatyti", 503);
  }
  return { clientId, clientSecret, projectId };
}

export async function loadModernConfig(client: Client): Promise<ModernConfig> {
  const clientId = env("PAYSERA_CLIENT_ID", false);
  const clientSecret = env("PAYSERA_CLIENT_SECRET", false);
  const projectId = env("PAYSERA_MODERN_PROJECT_ID", false);
  if (clientId || clientSecret || projectId) {
    return parseModernConfig({
      client_id: clientId,
      client_secret: clientSecret,
      project_id: projectId,
    });
  }
  // Server-only RPC: PUBLIC, anon and authenticated have no execute privilege.
  const { data, error } = await client.rpc("get_paysera_checkout_credentials");
  if (error || !data) {
    throw new RequestError("„Paysera“ duomenys dar nenustatyti", 503);
  }
  return parseModernConfig(data);
}

export class PayseraApiError extends RequestError {
  providerStatus: number;
  constructor(status: number, code: string) {
    super(
      code === "payment_collection_not_activated"
        ? "Mokėjimų surinkimas „Paysera“ projekte dar neaktyvuotas. Susisiekite su mumis."
        : "„Paysera“ mokėjimo paruošti nepavyko. Pabandykite vėliau.",
      503,
    );
    this.providerStatus = status;
  }
}

// Never include provider response bodies or bearer tokens in errors/logs.
export async function payseraJson(
  path: string,
  token: string,
  body?: unknown,
  transport = fetch,
) {
  const response = await transport(PAYSERA_API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PayseraApiError(response.status, String(data?.error || ""));
  }
  if (!data || typeof data !== "object") {
    throw new RequestError("Neteisingas mokėjimų teikėjo atsakymas", 502);
  }
  return data as Record<string, any>;
}

export async function modernAccessToken(
  config: ModernConfig,
  transport = fetch,
) {
  const response = await transport(
    PAYSERA_API + "/auth/realms/Paysera/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await response.json().catch(() => null);
  if (
    !response.ok || typeof data?.access_token !== "string" || !data.access_token
  ) {
    throw new RequestError("Prisijungti prie „Paysera“ nepavyko", 503);
  }
  return data.access_token as string;
}

export function modernCheckoutUrl(value: unknown) {
  const raw = String(value || "");
  return /^https:\/\/api\.paysera\.com\/checkout-payment-link\/payment-collection\/v1\/payment-links\/[A-Za-z0-9_-]+$/
      .test(raw) && raw.length <= 2048
    ? raw
    : "";
}

export function assertModernOrder(
  order: Record<string, any>,
  service: Record<string, any>,
  config: ModernConfig,
) {
  if (
    !UUID.test(String(order.order_id || "")) ||
    order.project_id !== config.projectId ||
    order.purchase?.reference !== service.payment_attempt_id ||
    order.purchase?.amount !== service.quote_amount_cents ||
    order.purchase?.currency !== service.currency
  ) throw new RequestError("Mokėjimo duomenys neatitinka pasiūlymo", 502);
}

export function modernOrderBody(
  service: Record<string, any>,
  config: ModernConfig,
  site: string,
  callback: string,
) {
  const resultUrl = `${site}vartotojas.html?service=${
    encodeURIComponent(service.id)
  }`;
  for (const value of [site, callback]) {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new RequestError("Neteisingas svetainės adresas", 503);
    }
  }
  return {
    project_id: config.projectId,
    redirect_urls: {
      success_url: `${resultUrl}&payment=success#paslaugos`,
      failure_url: `${resultUrl}&payment=cancelled#paslaugos`,
      cancel_url: `${resultUrl}&payment=cancelled#paslaugos`,
      callback_url: callback,
    },
    purchase: {
      reference: service.payment_attempt_id,
      amount: service.quote_amount_cents,
      currency: service.currency,
    },
    metadata: {
      referrer: site,
      platform: "atminimas",
      platform_version: "1.0.0",
    },
  };
}

export async function startModernServicePayment(
  request: Request,
  body: Record<string, unknown>,
) {
  const { user, client } = await requireUser(request);
  if (user.is_anonymous) {
    throw new RequestError("Prieš mokėjimą prisijunkite", 401);
  }
  const requestId = String(body.request_id || "");
  if (!UUID.test(requestId)) {
    throw new RequestError("Neteisingas paslaugos numeris", 400);
  }
  const config = await loadModernConfig(client);
  // Authenticate and validate deployment URLs before claiming a non-idempotent creation.
  const token = await modernAccessToken(config);
  const site = publicSiteUrl();
  const callback = env("SUPABASE_URL").replace(/\/$/, "") +
    "/functions/v1/paysera-webhook";
  modernOrderBody({ id: requestId }, config, site, callback);
  const { data, error } = await client.rpc("begin_my_paysera_modern_payment", {
    p_request_id: requestId,
    p_actor_id: user.id,
    p_project_id: config.projectId,
  });
  if (error || !data?.service) {
    throw new RequestError(
      "Patikrinkite, ar pasiūlymas priimtas ir galioja",
      409,
    );
  }
  const service = data.service;
  if (service.payment_status === "paid") {
    throw new RequestError("Pasiūlymas jau apmokėtas", 409);
  }
  if (service.payment_provider === "stripe") return { legacy: true };
  if (service.payment_provider !== "paysera_modern") {
    throw new RequestError("Ankstesnis mokėjimas dar nebaigtas", 409);
  }
  const expiry = new Date(service.payment_session_expires_at).valueOf();
  if (!Number.isFinite(expiry) || expiry <= Date.now() + 30000) {
    throw new RequestError(
      "Mokėjimo nuoroda nebegalioja. Susisiekite su mumis, kad patikrintume mokėjimo būseną.",
      409,
    );
  }
  if (service.payment_checkout_url) {
    const url = modernCheckoutUrl(service.payment_checkout_url);
    if (!url) throw new RequestError("Neteisinga mokėjimo nuoroda", 502);
    return { checkout_url: url, provider: "paysera_modern", reused: true };
  }
  const claimToken = data.claim_token;
  if (!claimToken) {
    throw new RequestError(
      "Mokėjimas jau ruošiamas. Jei nuoroda nepasirodo, susisiekite su mumis.",
      409,
    );
  }
  try {
    let orderId = service.payment_session_id;
    if (!orderId) {
      const order = await payseraJson(
        "/merchant-order/integration/v1/orders",
        token,
        modernOrderBody(service, config, site, callback),
      );
      assertModernOrder(order, service, config);
      orderId = order.order_id;
      const { error: attachError } = await client.rpc(
        "attach_paysera_modern_order",
        {
          p_attempt_id: service.payment_attempt_id,
          p_claim_token: claimToken,
          p_order_id: orderId,
          p_project_id: config.projectId,
          p_amount: service.quote_amount_cents,
          p_currency: service.currency,
        },
      );
      if (attachError) {
        throw new RequestError(
          "Mokėjimo užsakymo išsaugoti nepavyko. Susisiekite su mumis.",
          502,
        );
      }
    }
    const lifetime = Math.floor((expiry - Date.now()) / 1000);
    if (lifetime < 30) {
      throw new RequestError("Mokėjimo nuorodos galiojimas baigėsi", 409);
    }
    const link = await payseraJson(
      "/checkout-payment-link/integration/v1/payment-links",
      token,
      {
        order_id: orderId,
        name: `Atminimas ${service.payment_attempt_id}`,
        lifetime,
        experience: { language: "lt" },
        purchase: { amount: service.quote_amount_cents },
        ...(service.contact_email
          ? { payer_information: { email: service.contact_email } }
          : {}),
      },
    );
    const url = modernCheckoutUrl(link.payment_URL);
    const expiresAt = Number(link.expired_at);
    if (
      !url || !UUID.test(String(link.link_id || "")) ||
      link.order_id !== orderId ||
      link.purchase?.amount !== service.quote_amount_cents ||
      !Number.isSafeInteger(expiresAt)
    ) {
      throw new RequestError("Mokėjimo nuoroda neatitinka pasiūlymo", 502);
    }
    const { error: attachError } = await client.rpc(
      "attach_paysera_modern_link",
      {
        p_attempt_id: service.payment_attempt_id,
        p_claim_token: claimToken,
        p_order_id: orderId,
        p_link_id: link.link_id,
        p_url: url,
        p_expires_at: new Date(expiresAt * 1000).toISOString(),
      },
    );
    if (attachError) {
      throw new RequestError(
        "Mokėjimo nuorodos išsaugoti nepavyko. Susisiekite su mumis.",
        502,
      );
    }
    return { checkout_url: url, provider: "paysera_modern", reused: false };
  } catch (error) {
    if (
      error instanceof PayseraApiError &&
      [400, 401, 403, 404, 422].includes(error.providerStatus)
    ) {
      const { error: releaseError } = await client.rpc(
        "fail_paysera_modern_creation",
        {
          p_attempt_id: service.payment_attempt_id,
          p_claim_token: claimToken,
          p_http_status: error.providerStatus,
        },
      );
      if (releaseError) {
        throw new RequestError(
          "Mokėjimo būseną reikia patikrinti. Susisiekite su mumis.",
          502,
        );
      }
    }
    // No retries of POST /orders after a timeout/5xx: Paysera has no idempotency key.
    if (error instanceof RequestError) throw error;
    throw new RequestError(
      "Mokėjimo atsakymas negautas. Susisiekite su mumis, kad patikrintume jo būseną.",
      502,
    );
  }
}

export function verifyModernSignature(
  raw: Uint8Array,
  signature: string,
  secret: string,
) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  return timingSafeEqual(
    new TextEncoder().encode(expected),
    new TextEncoder().encode(signature.toLowerCase()),
  );
}

export function paymentIsTest(value: unknown, depth = 0): boolean {
  if (depth > 12) throw new RequestError("Payment data nesting too deep", 400);
  if (!value || typeof value !== "object") return false;
  let test = false;
  for (const [key, child] of Object.entries(value)) {
    if (key === "is_test") {
      if (typeof child !== "boolean") {
        throw new RequestError("Invalid test flag", 400);
      }
      test ||= child;
    } else if (child && typeof child === "object") {
      test ||= paymentIsTest(child, depth + 1);
    }
  }
  return test;
}

export function modernPaymentEvent(
  raw: Uint8Array,
  callback: Record<string, any>,
  order: Record<string, any>,
  config: ModernConfig,
) {
  if (
    !UUID.test(String(callback.order?.merchant_order_id || "")) ||
    order.id !== callback.order?.paysera_order_id ||
    !UUID.test(String(order.id || "")) ||
    order.reference !== callback.order?.merchant_order_id ||
    order.project_id !== config.projectId ||
    !Number.isSafeInteger(order.amount) || order.amount <= 0 ||
    order.amount > 100000000 ||
    !Number.isSafeInteger(order.amount_paid) || order.amount_paid < 0 ||
    order.amount_paid > 2147483647 ||
    !/^[A-Z]{3}$/.test(String(order.currency || "")) ||
    typeof order.status !== "string" || !order.status ||
    order.status.length > 80
  ) {
    throw new RequestError("Payment order mismatch", 409);
  }
  return {
    p_attempt_id: order.reference,
    p_order_id: order.id,
    p_project_id: config.projectId,
    p_event_id: createHash("sha256").update(raw).digest("hex"),
    p_status: order.status,
    p_amount: order.amount,
    p_amount_paid: order.amount_paid,
    p_currency: order.currency,
    p_test: paymentIsTest(callback) || paymentIsTest(order),
  };
}

export async function handleModernWebhook(request: Request) {
  const reply = (text: string, status = 200) =>
    new Response(text, {
      status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  if (request.method !== "POST") return reply("Method not allowed", 405);
  // Validate the cheap envelope before accessing the encrypted credentials.
  const signature = request.headers.get("x-paysera-signature") || "";
  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return reply("Invalid signature", 401);
  }
  if (
    request.headers.has("x-paysera-signature-alg") &&
    request.headers.get("x-paysera-signature-alg") !== "HMAC-SHA256"
  ) return reply("Invalid signature algorithm", 401);
  if (Number(request.headers.get("content-length") || 0) > 128000) {
    return reply("Payload too large", 413);
  }
  try {
    const raw = new Uint8Array(await request.arrayBuffer());
    if (raw.length > 128000) return reply("Payload too large", 413);
    const client = adminClient();
    const config = await loadModernConfig(client);
    if (!verifyModernSignature(raw, signature, config.clientSecret)) {
      return reply("Invalid signature", 401);
    }
    let callback;
    try {
      callback = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(raw),
      );
    } catch {
      return reply("Invalid JSON", 400);
    }
    const type = callback?.event?.type;
    if (!["order", "payment", "refund"].includes(type)) return reply("OK");
    if (
      !UUID.test(String(callback.order?.paysera_order_id || "")) ||
      !UUID.test(String(callback.order?.merchant_order_id || ""))
    ) return reply("Invalid order", 400);
    // Re-read the whole order: a settled individual payment may cover only part of it.
    const token = await modernAccessToken(config);
    const order = await payseraJson(
      `/merchant-order/integration/v1/orders/${callback.order.paysera_order_id}`,
      token,
    );
    const event = modernPaymentEvent(raw, callback, order, config);
    const { data, error } = await client.rpc(
      "process_paysera_modern_payment",
      event,
    );
    if (error) return reply("Processing failed", 500);
    if (data === "not_found" || data === "rejected_quote_or_amount") {
      return reply("Order mismatch", 409);
    }
    return data === "accepted" || data === "recorded"
      ? reply("OK")
      : reply("Processing failed", 500);
  } catch (error) {
    return reply(
      "Processing failed",
      error instanceof RequestError ? error.status : 500,
    );
  }
}
