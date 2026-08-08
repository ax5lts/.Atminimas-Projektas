import { Webhook } from "npm:svix@1.99.1";
import { adminClient, env, json } from "../_shared/core.ts";
import { maskEmail, sha256Hex } from "../_shared/email.ts";

const ACCEPTED_EVENTS = new Set([
  "sent",
  "delivered",
  "delivery_delayed",
  "bounced",
  "failed",
  "complained",
  "suppressed",
  "opened",
  "clicked",
]);
const PROBLEM_EVENTS = new Set([
  "delivery_delayed",
  "bounced",
  "failed",
  "complained",
  "suppressed",
]);
const STATUS_BY_EVENT: Record<string, string> = {
  sent: "sent",
  delivered: "delivered",
  delivery_delayed: "delayed",
  bounced: "bounced",
  failed: "failed",
  complained: "complained",
  suppressed: "suppressed",
};

async function signingSecret(client: ReturnType<typeof adminClient>) {
  const configured = env("RESEND_WEBHOOK_SECRET", false);
  if (configured) return configured;
  const { data, error } = await client.rpc("get_resend_webhook_secret");
  if (error) throw error;
  const value = typeof data === "string" ? data.trim() : "";
  if (!value) throw new Error("Webhook signing secret is not configured");
  return value;
}

function safeText(value: unknown, length = 300) {
  return typeof value === "string" ? value.trim().slice(0, length) : "";
}

async function touchAlert(
  client: ReturnType<typeof adminClient>,
  input: {
    alertKey: string;
    severity: "warning" | "critical";
    title: string;
    detail: string;
    entityId: string;
    metadata: Record<string, unknown>;
  },
) {
  const now = new Date().toISOString();
  const { data: existing } = await client.from("ops_alerts")
    .select("id,occurrences")
    .eq("alert_key", input.alertKey)
    .maybeSingle();
  const record = {
    alert_key: input.alertKey,
    category: "email_delivery",
    severity: input.severity,
    status: "open",
    title: input.title,
    detail: input.detail,
    entity_type: "email_message",
    entity_id: input.entityId,
    metadata: input.metadata,
    occurrences: Number(existing?.occurrences || 0) + 1,
    last_seen_at: now,
    resolved_at: null,
    updated_at: now,
  };
  const { error } = existing?.id
    ? await client.from("ops_alerts").update(record).eq("id", existing.id)
    : await client.from("ops_alerts").insert(record);
  if (error) throw error;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  }
  try {
    const declaredLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > 131_072) {
      return json({ error: "Payload too large" }, 413);
    }
    const svixId = safeText(request.headers.get("svix-id"), 255);
    const svixTimestamp = safeText(request.headers.get("svix-timestamp"), 255);
    const svixSignature = safeText(request.headers.get("svix-signature"), 1000);
    if (!svixId || !svixTimestamp || !svixSignature) {
      return json({ error: "Missing webhook signature" }, 400);
    }
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 131_072) {
      return json({ error: "Payload too large" }, 413);
    }
    const client = adminClient();
    const verified = new Webhook(await signingSecret(client)).verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as Record<string, unknown>;
    const rawType = safeText(verified.type, 80);
    const eventType = rawType.replace(/^email\./, "");
    if (!ACCEPTED_EVENTS.has(eventType)) return json({ received: true });
    const data = verified.data && typeof verified.data === "object"
      ? verified.data as Record<string, unknown>
      : {};
    const providerEmailId = safeText(data.email_id, 255);
    if (!providerEmailId) return json({ error: "Missing email id" }, 400);
    const timestampRaw = safeText(verified.created_at, 100);
    const eventDate = timestampRaw ? new Date(timestampRaw) : new Date();
    const eventAt = Number.isNaN(eventDate.valueOf())
      ? new Date().toISOString()
      : eventDate.toISOString();
    const recipient = Array.isArray(data.to) ? safeText(data.to[0], 320) : "";
    const recipientMasked = recipient ? maskEmail(recipient) : null;
    const recipientHash = recipient
      ? await sha256Hex(recipient.trim().toLowerCase())
      : null;
    const { data: message, error: messageError } = await client
      .from("email_messages")
      .select("id,order_id,last_event_at,status")
      .eq("provider_email_id", providerEmailId)
      .maybeSingle();
    if (messageError) throw messageError;

    const { error: eventError } = await client.from("email_delivery_events")
      .insert({
        svix_id: svixId,
        provider_email_id: providerEmailId,
        email_message_id: message?.id || null,
        order_id: message?.order_id || null,
        event_type: eventType,
        event_at: eventAt,
        recipient_masked: recipientMasked,
        recipient_hash: recipientHash,
        detail: {
          provider_status: safeText(data.status, 80) || null,
          bounce_type: safeText(data.bounce_type, 80) || null,
        },
      });
    if (eventError?.code === "23505") return json({ received: true, duplicate: true });
    if (eventError) throw eventError;

    if (message?.id) {
      const previousAt = message.last_event_at
        ? new Date(message.last_event_at).valueOf()
        : 0;
      if (new Date(eventAt).valueOf() >= previousAt) {
        const update: Record<string, unknown> = {
          last_event_at: eventAt,
          updated_at: new Date().toISOString(),
        };
        if (STATUS_BY_EVENT[eventType]) update.status = STATUS_BY_EVENT[eventType];
        if (eventType === "delivered") {
          update.delivered_at = eventAt;
          update.last_error = null;
        } else if (PROBLEM_EVENTS.has(eventType)) {
          update.failed_at = eventAt;
          update.last_error = `resend_${eventType}`;
        }
        const { error: updateError } = await client.from("email_messages")
          .update(update).eq("id", message.id);
        if (updateError) throw updateError;
      }
    }

    if (PROBLEM_EVENTS.has(eventType)) {
      const critical = eventType !== "delivery_delayed";
      await touchAlert(client, {
        alertKey: `email_delivery:${providerEmailId}:${eventType}`,
        severity: critical ? "critical" : "warning",
        title: critical
          ? "El. laiškas nepasiekė gavėjo"
          : "El. laiško pristatymas vėluoja",
        detail: `Tiekėjas pranešė būseną „${eventType}“. Gavėjas: ${recipientMasked || "užmaskuotas"}.`,
        entityId: providerEmailId,
        metadata: { event_type: eventType, order_id: message?.order_id || null },
      });
    } else if (eventType === "delivered") {
      await client.from("ops_alerts").update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("category", "email_delivery").eq("entity_id", providerEmailId)
        .eq("status", "open");
    }
    return json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/signature|timestamp|verification|no matching/i.test(message)) {
      return json({ error: "Invalid webhook signature" }, 400);
    }
    console.error("resend-webhook failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "Webhook processing failed" }, 500);
  }
});
