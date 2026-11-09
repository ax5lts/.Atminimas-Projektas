import {
  adminClient,
  env,
  handleOptions,
  json,
  readJson,
  RequestError,
} from "../_shared/core.ts";
import { trustedClientIp } from "../_shared/request-ip.ts";

const PROFILE_ID_MAX = 100;
const MEMORY_LIMIT = 20;

function text(value: unknown, max: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function profileId(value: unknown) {
  const result = text(value, PROFILE_ID_MAX);
  return /^[a-z0-9-]+$/i.test(result) ? result : "";
}

async function visitorHash(request: Request) {
  const address = trustedClientIp(request);
  if (!address) {
    throw new RequestError("Pateikimo patikrinti nepavyko. Pabandykite vėliau.", 503);
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(
      env("RATE_LIMIT_HASH_SECRET", false) || env("SUPABASE_SERVICE_ROLE_KEY"),
    ),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`atminimas-engagement-ip-v2:${address}`),
  );
  return Array.from(new Uint8Array(digest)).map((part) =>
    part.toString(16).padStart(2, "0")
  ).join("");
}

async function consumeRateLimit(
  client: ReturnType<typeof adminClient>,
  request: Request,
  id: string,
  action: "candle" | "memory",
) {
  const fingerprint = await visitorHash(request);
  const { data, error } = await client.rpc("consume_memorial_engagement_rate_limit", {
    p_profile_id: id,
    p_action: action,
    p_ip_hash: fingerprint,
  });
  if (error) throw error;
  if (data === false) {
    throw new RequestError(
      action === "candle"
        ? "Žvakę šiame puslapyje jau neseniai uždegėte arba pateikėte per daug užklausų. Pabandykite vėliau."
        : "Šiandien jau pateikėte kelis prisiminimus arba pateikėte per daug užklausų. Pabandykite vėliau.",
      429,
    );
  }
  if (data !== true) throw new Error("Engagement rate limit unavailable");
  return fingerprint;
}

async function publicProfileExists(
  client: ReturnType<typeof adminClient>,
  id: string,
) {
  const { data, error } = await client
    .from("profiliai")
    .select("id")
    .eq("id", id)
    .eq("aktyvus", true)
    .eq("access_code_protected", false)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function engagement(client: ReturnType<typeof adminClient>, id: string) {
  const [
    { count, error: candleError },
    { data: memories, error: memoryError },
  ] = await Promise.all([
    client.from("memorial_candles").select("id", { count: "exact", head: true })
      .eq("profile_id", id),
    client
      .from("memorial_memories")
      .select("author_name,message,created_at")
      .eq("profile_id", id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(MEMORY_LIMIT),
  ]);
  if (candleError) throw candleError;
  if (memoryError) throw memoryError;
  return { candle_count: count || 0, memories: memories || [] };
}

export async function handleRequest(request: Request) {
  const options = handleOptions(request);
  if (options) {
    options.headers.set("X-RateLimit-Ingress-Ready", String(trustedClientIp(request) !== null));
    return options;
  }
  if (!["GET", "POST"].includes(request.method)) {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const client = adminClient();
    let id = "";
    let body: Record<string, unknown> = {};

    if (request.method === "GET") {
      id = profileId(new URL(request.url).searchParams.get("profile_id"));
    } else {
      body = await readJson(request, 12_000);
      id = profileId(body.profile_id);
    }

    if (!id) return json({ error: "Neteisingas atminimo puslapio kodas" }, 400);
    if (!await publicProfileExists(client, id)) {
      return json({ error: "Atminimo puslapis nerastas" }, 404);
    }

    if (request.method === "GET") return json(await engagement(client, id));

    const action = text(body.action, 24);
    if (action === "candle") {
      const fingerprint = await consumeRateLimit(client, request, id, "candle");

      const { error } = await client.from("memorial_candles").insert({
        profile_id: id,
        visitor_hash: fingerprint,
      });
      if (error) throw error;
      return json({ ok: true, ...await engagement(client, id) }, 201);
    }

    if (action === "memory") {
      const authorName = text(body.author_name, 80);
      const message = text(body.message, 800);
      const honeypot = text(body.website, 200);
      if (honeypot) return json({ ok: true }, 202);
      if (authorName.length < 2) {
        return json({ error: "Įrašykite savo vardą." }, 400);
      }
      if (message.length < 10) {
        return json({ error: "Prisiminimas turi būti bent 10 simbolių." }, 400);
      }
      if (body.consent !== true) {
        return json({ error: "Patvirtinkite turinio pateikimo sąlygas." }, 400);
      }

      const fingerprint = await consumeRateLimit(client, request, id, "memory");

      const { error } = await client.from("memorial_memories").insert({
        profile_id: id,
        author_name: authorName,
        message,
        visitor_hash: fingerprint,
      });
      if (error) throw error;
      return json({
        ok: true,
        message: "Prisiminimas gautas ir bus parodytas po peržiūros.",
      }, 202);
    }

    return json({ error: "Nežinomas veiksmas" }, 400);
  } catch (error) {
    if (error instanceof RequestError) {
      return json({ error: error.message }, error.status);
    }
    console.error("memorial-engagement", error);
    return json({ error: "Šios funkcijos šiuo metu atlikti nepavyko." }, 500);
  }
}

if (import.meta.main) Deno.serve(handleRequest);
