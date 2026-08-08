import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.110.1";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-automation-secret, x-ops-monitor-secret, stripe-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

export function handleOptions(request: Request) {
  return request.method === "OPTIONS"
    ? new Response(null, { status: 204, headers: CORS_HEADERS })
    : null;
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

export function userClient(token: string): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export class RequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function readJson(
  request: Request,
  maxBytes = 64_000,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestError("Request body is too large", 413);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new RequestError("Request body is too large", 413);
  }
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("object required");
    }
    return parsed as Record<string, unknown>;
  } catch (_error) {
    throw new RequestError("Invalid JSON body", 400);
  }
}

const PROFILE_LAYOUT_KEYS = new Set([
  "__stage",
  "header",
  "text",
  "photo-1",
  "photo-2",
  "photo-3",
  "photo-4",
  "video",
]);

function numericLayoutValue(value: unknown, min: number, max: number) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const raw = String(value).trim().replace(/%$/, "");
  if (!/^-?\d+(?:\.\d{1,3})?$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number >= min && number <= max
    ? String(number)
    : null;
}

export function safeProfileLayout(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, Record<string, string | number>> = {};

  for (const key of Object.keys(source)) {
    if (!PROFILE_LAYOUT_KEYS.has(key)) continue;
    const raw = source[key];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const input = raw as Record<string, unknown>;
    const piece: Record<string, string | number> = {};

    if (key === "__stage") {
      if (/^#[0-9a-f]{6}$/i.test(String(input.background || ""))) {
        piece.background = String(input.background).toLowerCase();
      }
      const stageHeight = numericLayoutValue(input.heightPct, 100, 1200);
      if (stageHeight !== null) piece.heightPct = stageHeight;
      const version = Number(input.layoutVersion);
      if (Number.isInteger(version) && version >= 1 && version <= 2) {
        piece.layoutVersion = version;
      }
    } else {
      const left = numericLayoutValue(input.left, 0, 100);
      const top = numericLayoutValue(input.top, 0, 100);
      const topPct = numericLayoutValue(input.topPct, 0, 1200);
      const width = numericLayoutValue(input.width, 1, 100);
      const heightPct = numericLayoutValue(input.heightPct, 4, 180);
      if (left !== null) piece.left = `${left}%`;
      if (top !== null) piece.top = `${top}%`;
      if (topPct !== null) piece.topPct = topPct;
      if (width !== null) piece.width = `${width}%`;
      if (heightPct !== null) piece.heightPct = heightPct;
      if (input.fit === "crop" || input.fit === "contain") {
        piece.fit = input.fit;
      }

      const position = String(input.objectPosition || "").trim();
      const match = position.match(
        /^(\d+(?:\.\d{1,3})?)%\s+(\d+(?:\.\d{1,3})?)%$/,
      );
      if (match && Number(match[1]) <= 100 && Number(match[2]) <= 100) {
        piece.objectPosition = `${Number(match[1])}% ${Number(match[2])}%`;
      }
    }

    if (Object.keys(piece).length) result[key] = piece;
  }

  return result;
}

export type StoryBlock =
  | {
    type: "text";
    text: string;
    fontScale: number;
    offsetX: number;
    offsetY: number;
  }
  | {
    type: "photo";
    photoOrder: number;
    align: "full" | "left" | "right";
    widthPct: number;
    fit: "contain" | "cover";
    offsetX: number;
    offsetY: number;
  };

const MAX_STORY_BLOCKS = 40;
// Matches the existing 10000-character `tekstas_200` persistence boundary.
const MAX_STORY_TEXT_LENGTH = 10_000;

function safeStoryOffset(
  value: unknown,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "number" && typeof value !== "string") return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(Math.max(minimum, Math.min(maximum, number)) * 1000) /
    1000;
}

function safeStoryPhotoWidth(
  value: unknown,
  align: "full" | "left" | "right",
) {
  if (typeof value !== "number" && typeof value !== "string") {
    return align === "full" ? 100 : 42;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return align === "full" ? 100 : 42;
  return Math.round(Math.max(35, Math.min(100, number)));
}

function safeStoryTextScale(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return 100;
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.round(Math.max(70, Math.min(160, number)));
}

export function safeStoryBlocks(value: unknown): StoryBlock[] {
  if (!Array.isArray(value)) return [];

  const blocks: StoryBlock[] = [];
  let flattenedTextLength = 0;
  let hasNonEmptyText = false;

  for (const raw of value.slice(0, MAX_STORY_BLOCKS)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const block = raw as Record<string, unknown>;

    if (block.type === "text" && typeof block.text === "string") {
      const trimmed = block.text.trim();
      const separatorLength = trimmed && hasNonEmptyText ? 2 : 0;
      const available = Math.max(
        0,
        MAX_STORY_TEXT_LENGTH - flattenedTextLength - separatorLength,
      );
      const text = trimmed.slice(0, available).trimEnd();
      blocks.push({
        type: "text",
        text,
        fontScale: safeStoryTextScale(block.fontScale),
        offsetX: safeStoryOffset(block.offsetX, -70, 70),
        offsetY: safeStoryOffset(block.offsetY, -320, 320),
      });
      if (text) {
        flattenedTextLength += separatorLength + text.length;
        hasNonEmptyText = true;
      }
      continue;
    }

    if (block.type === "photo") {
      const photoOrder = Number(block.photoOrder);
      if (
        Number.isInteger(photoOrder) &&
        photoOrder >= 1 &&
        photoOrder <= 8
      ) {
        const align = block.align === "left" || block.align === "right"
          ? block.align
          : "full";
        blocks.push({
          type: "photo",
          photoOrder,
          align,
          widthPct: safeStoryPhotoWidth(block.widthPct, align),
          fit: block.fit === "cover" ? "cover" : "contain",
          offsetX: safeStoryOffset(block.offsetX, -70, 70),
          offsetY: safeStoryOffset(block.offsetY, -320, 320),
        });
      }
    }
  }

  return blocks;
}

export function storyBlocksText(value: unknown) {
  return safeStoryBlocks(value)
    .filter((block): block is Extract<StoryBlock, { type: "text" }> =>
      block.type === "text" && Boolean(block.text)
    )
    .map((block) => block.text)
    .join("\n\n")
    .slice(0, MAX_STORY_TEXT_LENGTH);
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
  if (!constantTimeEqual(expected, received)) {
    throw new Error("Invalid automation secret");
  }
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
  return (env("PUBLIC_SITE_URL", false) ||
    "https://ax5lts.github.io/.Atminimas-Projektas/").replace(/\/?$/, "/");
}

export function money(cents: number | null | undefined, currency = "EUR") {
  return new Intl.NumberFormat("lt-LT", { style: "currency", currency }).format(
    (cents || 0) / 100,
  );
}

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char] || char);
}

export function retryDelay(attempt: number) {
  return Math.min(24 * 60 * 60, Math.max(60, 2 ** Math.min(attempt, 10) * 30));
}

export class BlockedAutomationError extends Error {}
