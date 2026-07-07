import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.110.1";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-automation-secret, stripe-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", ...extra },
  });
}

export function handleOptions(request: Request) {
  return request.method === "OPTIONS" ? new Response(null, { status: 204, headers: CORS_HEADERS }) : null;
}

export function env(name: string, required = true) {
  const value = (Deno.env.get(name) || "").trim();
  if (required && !value) throw new Error(`Missing secret: ${name}`);
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Authentication required");
  const client = adminClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid session");
  return { client, user: data.user, token };
}

export function requireAutomationSecret(request: Request) {
  const expected = env("AUTOMATION_SECRET");
  const received = request.headers.get("x-automation-secret") || "";
  if (!constantTimeEqual(expected, received)) throw new Error("Invalid automation secret");
}

export function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function publicSiteUrl() {
  return (env("PUBLIC_SITE_URL", false) || "https://ax5lts.github.io/.Atminimas-Projektas/").replace(/\/?$/, "/");
}

export function money(cents: number | null | undefined, currency = "EUR") {
  return new Intl.NumberFormat("lt-LT", { style: "currency", currency }).format((cents || 0) / 100);
}

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);
}

export function retryDelay(attempt: number) {
  return Math.min(24 * 60 * 60, Math.max(60, 2 ** Math.min(attempt, 10) * 30));
}

export class BlockedAutomationError extends Error {}
