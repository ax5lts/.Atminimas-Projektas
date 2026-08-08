import {
  adminClient,
  BlockedAutomationError,
  env,
  escapeHtml,
} from "./core.ts";

type Attachment = { filename: string; content: string };

export async function sendEmail(input: {
  to: string;
  replyTo?: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  actionUrl?: string;
  actionLabel?: string;
  attachments?: Attachment[];
  idempotencyKey: string;
  orderId?: string;
  entityType?: string;
  entityId?: string;
  recipientKind?: "customer" | "admin" | "manufacturer" | "partner" | "support";
  category?: string;
}) {
  const apiKey = env("RESEND_API_KEY", false);
  const from = env("EMAIL_FROM", false);
  if (!apiKey || !from) {
    throw new BlockedAutomationError(
      "El. pašto tiekėjas dar nesukonfigūruotas",
    );
  }
  if (!input.to || !input.to.includes("@")) {
    throw new BlockedAutomationError("Trūksta gavėjo el. pašto");
  }

  const normalizedRecipient = input.to.trim().toLowerCase();
  const recipientHash = await sha256Hex(normalizedRecipient);
  const recipientMasked = maskEmail(normalizedRecipient);
  const client = adminClient();
  const idempotencyKey = input.idempotencyKey.slice(0, 256);
  const { data: existing, error: existingError } = await client
    .from("email_messages")
    .select("provider_email_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.provider_email_id) return { id: existing.provider_email_id };

  const { error: insertError } = await client.from("email_messages").upsert({
    idempotency_key: idempotencyKey,
    order_id: input.orderId || null,
    entity_type: input.entityType || (input.orderId ? "order" : null),
    entity_id: input.entityId || input.orderId || null,
    recipient_kind: input.recipientKind || "customer",
    recipient_masked: recipientMasked,
    recipient_hash: recipientHash,
    category: (input.category || "transactional").slice(0, 100),
    status: "accepted",
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (insertError) throw insertError;

  const body = input.paragraphs.map((paragraph) =>
    `<p style="margin:0 0 16px;line-height:1.6;color:#34312d">${
      escapeHtml(paragraph)
    }</p>`
  ).join("");
  const action = input.actionUrl
    ? `<p style="margin:26px 0"><a href="${
      escapeHtml(input.actionUrl)
    }" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#174f4a;color:#fff;text-decoration:none;font-weight:700">${
      escapeHtml(input.actionLabel || "Atidaryti")
    }</a></p>`
    : "";
  const html =
    `<!doctype html><html><body style="margin:0;background:#fffaf0;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 20px"><div style="padding:30px;border:1px solid #e5e0d5;border-radius:18px;background:#fffdf8"><p style="margin:0 0 12px;color:#174f4a;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:12px">Atminimas</p><h1 style="margin:0 0 22px;font-size:28px;color:#111">${
      escapeHtml(input.heading)
    }</h1>${body}${action}<p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #e5e0d5;color:#6b665e;font-size:13px">Tai automatinis pranešimas apie jūsų užsakymą.</p></div></div></body></html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      reply_to: input.replyTo || undefined,
      subject: input.subject,
      html,
      attachments: input.attachments || [],
    }),
  });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    await client.from("email_messages").update({
      status: "failed",
      failed_at: new Date().toISOString(),
      last_error: `resend_http_${response.status}`,
      updated_at: new Date().toISOString(),
    }).eq("idempotency_key", idempotencyKey);
    throw new Error(`El. pašto paslauga grąžino klaidą (${response.status})`);
  }
  const providerId = typeof result.id === "string" ? result.id : null;
  if (!providerId) {
    await client.from("email_messages").update({
      status: "failed",
      failed_at: new Date().toISOString(),
      last_error: "resend_missing_provider_id",
      updated_at: new Date().toISOString(),
    }).eq("idempotency_key", idempotencyKey);
    throw new Error("El. pašto paslauga negrąžino laiško numerio");
  }
  const { error: logError } = await client.from("email_messages").update({
    provider_email_id: providerId,
    status: "accepted",
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("idempotency_key", idempotencyKey);
  if (logError) throw logError;
  return result;
}

export function maskEmail(value: string) {
  const [local = "", domain = ""] = value.trim().toLowerCase().split("@");
  const [host = "", ...suffixParts] = domain.split(".");
  const localMask = local ? `${local[0]}***` : "***";
  const hostMask = host ? `${host[0]}***` : "***";
  const suffix = suffixParts.length ? `.${suffixParts.join(".")}` : "";
  return `${localMask}@${hostMask}${suffix}`.slice(0, 320);
}

export async function sha256Hex(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}
