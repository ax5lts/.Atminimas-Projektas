import { adminClient, constantTimeEqual, env, json } from "../_shared/core.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function verifyStripeSignature(payload: string, header: string, secret: string) {
  const values = header.split(",").map((part) => part.trim().split("="));
  const timestamp = values.find(([key]) => key === "t")?.[1] || "";
  const signatures = values.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  const expected = Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((signature) => constantTimeEqual(expected, signature));
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  const secret = env("STRIPE_WEBHOOK_SECRET", false);
  if (!secret || !(await verifyStripeSignature(raw, signature, secret))) return json({ error: "Invalid signature" }, 401);

  try {
    const event = JSON.parse(raw);
    const object = event?.data?.object || {};
    const entityType = String(object?.metadata?.entity_type || "");
    const serviceRequestId = String(object?.metadata?.service_request_id || "");
    const quoteRevision = Number(object?.metadata?.quote_revision ?? -1);
    const paymentAttemptId = String(object?.metadata?.payment_attempt_id || "");
    const orderId = String(object?.metadata?.order_id || object?.client_reference_id || "");
    if (!event.id || !event.type) return json({ received: true, ignored: true });
    const client = adminClient();
    const amount = Number(object.amount_total ?? object.amount ?? 0);
    const currency = String(object.currency || "").toUpperCase();
    if (entityType === "service") {
      if (!UUID_PATTERN.test(serviceRequestId) || !Number.isInteger(quoteRevision) || quoteRevision < 0 || !UUID_PATTERN.test(paymentAttemptId)) {
        return json({ received: true, entity: "service", ignored: true });
      }
      const { data: serviceStatus, error: serviceError } = await client.rpc("process_stripe_service_payment_event", {
        p_request_id: serviceRequestId,
        p_quote_revision: quoteRevision,
        p_payment_attempt_id: paymentAttemptId,
        p_provider_event_id: event.id,
        p_provider_payment_id: String(object.payment_intent || object.id || ""),
        p_event_type: event.type,
        p_amount_cents: Number.isFinite(amount) ? amount : 0,
        p_currency: currency,
        p_payment_status: String(object.payment_status || ""),
        p_object_id: String(object.id || ""),
        p_mode: String(object.mode || ""),
      });
      if (serviceError) throw serviceError;
      return json({ received: true, entity: "service", status: serviceStatus });
    }
    if (!orderId) return json({ received: true, ignored: true });
    const { data: status, error: processError } = await client.rpc("process_stripe_payment_event", {
      p_order_id: orderId,
      p_provider_event_id: event.id,
      p_provider_payment_id: String(object.payment_intent || object.id || ""),
      p_event_type: event.type,
      p_amount_cents: Number.isFinite(amount) ? amount : 0,
      p_currency: currency,
      p_payment_status: String(object.payment_status || ""),
      p_object_id: String(object.id || ""),
      p_mode: String(object.mode || ""),
    });
    if (processError) throw processError;
    return json({ received: true, status });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Webhook processing failed" }, 500);
  }
});
