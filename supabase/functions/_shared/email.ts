import { BlockedAutomationError, env, escapeHtml } from "./core.ts";

type Attachment = { filename: string; content: string };

export async function sendEmail(input: {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  actionUrl?: string;
  actionLabel?: string;
  attachments?: Attachment[];
  idempotencyKey: string;
}) {
  const apiKey = env("RESEND_API_KEY", false);
  const from = env("EMAIL_FROM", false);
  if (!apiKey || !from) throw new BlockedAutomationError("El. pašto tiekėjas dar nesukonfigūruotas");
  if (!input.to || !input.to.includes("@")) throw new BlockedAutomationError("Trūksta gavėjo el. pašto");

  const body = input.paragraphs.map((paragraph) => `<p style="margin:0 0 16px;line-height:1.6;color:#34312d">${escapeHtml(paragraph)}</p>`).join("");
  const action = input.actionUrl
    ? `<p style="margin:26px 0"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#174f4a;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(input.actionLabel || "Atidaryti")}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#fffaf0;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px 20px"><div style="padding:30px;border:1px solid #e5e0d5;border-radius:18px;background:#fffdf8"><p style="margin:0 0 12px;color:#174f4a;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:12px">Atminimas</p><h1 style="margin:0 0 22px;font-size:28px;color:#111">${escapeHtml(input.heading)}</h1>${body}${action}<p style="margin:28px 0 0;padding-top:18px;border-top:1px solid #e5e0d5;color:#6b665e;font-size:13px">Tai automatinis pranešimas apie jūsų užsakymą.</p></div></div></body></html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html,
      attachments: input.attachments || [],
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Resend ${response.status}: ${JSON.stringify(result)}`);
  return result;
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}
