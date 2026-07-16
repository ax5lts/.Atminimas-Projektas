import { adminClient, env, handleOptions, json } from "../_shared/core.ts";

const PROFILE_ID_MAX = 100;
const MEMORY_LIMIT = 20;

function text(value: unknown, max: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function profileId(value: unknown) {
  const result = text(value, PROFILE_ID_MAX);
  return /^[a-z0-9-]+$/i.test(result) ? result : "";
}

async function visitorHash(request: Request, scope: string) {
  const forwarded = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const address = forwarded || request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "unknown";
  const agent = request.headers.get("user-agent") || "unknown";
  const salt = env("SUPABASE_SERVICE_ROLE_KEY");
  const bytes = new TextEncoder().encode(`${salt}|${scope}|${address}|${agent}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}

async function publicProfileExists(client: ReturnType<typeof adminClient>, id: string) {
  const { data, error } = await client
    .from("profiliai")
    .select("id")
    .eq("id", id)
    .eq("aktyvus", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function engagement(client: ReturnType<typeof adminClient>, id: string) {
  const [{ count, error: candleError }, { data: memories, error: memoryError }] = await Promise.all([
    client.from("memorial_candles").select("id", { count: "exact", head: true }).eq("profile_id", id),
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

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed" }, 405);

  try {
    const client = adminClient();
    let id = "";
    let body: Record<string, unknown> = {};

    if (request.method === "GET") {
      id = profileId(new URL(request.url).searchParams.get("profile_id"));
    } else {
      const contentLength = Number(request.headers.get("content-length") || "0");
      if (contentLength > 12_000) return json({ error: "Užklausa per didelė" }, 413);
      body = await request.json();
      id = profileId(body.profile_id);
    }

    if (!id) return json({ error: "Neteisingas atminimo puslapio kodas" }, 400);
    if (!await publicProfileExists(client, id)) return json({ error: "Atminimo puslapis nerastas" }, 404);

    if (request.method === "GET") return json(await engagement(client, id));

    const action = text(body.action, 24);
    if (action === "candle") {
      const bucket = new Date().toISOString().slice(0, 13);
      const fingerprint = await visitorHash(request, `${id}|candle|${bucket}`);
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await client
        .from("memorial_candles")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", id)
        .eq("visitor_hash", fingerprint)
        .gte("created_at", since);
      if (countError) throw countError;
      if ((count || 0) >= 1) return json({ error: "Žvakę šiame puslapyje jau neseniai uždegėte." }, 429);

      const { error } = await client.from("memorial_candles").insert({
        profile_id: id,
        visitor_hash: fingerprint,
      });
      if (error) throw error;
      return json({ ok: true, ...await engagement(client, id) }, 201);
    }

    if (action === "memory") {
      const bucket = new Date().toISOString().slice(0, 10);
      const fingerprint = await visitorHash(request, `${id}|memory|${bucket}`);
      const authorName = text(body.author_name, 80);
      const message = text(body.message, 800);
      const honeypot = text(body.website, 200);
      if (honeypot) return json({ ok: true }, 202);
      if (authorName.length < 2) return json({ error: "Įrašykite savo vardą." }, 400);
      if (message.length < 10) return json({ error: "Prisiminimas turi būti bent 10 simbolių." }, 400);
      if (body.consent !== true) return json({ error: "Patvirtinkite turinio pateikimo sąlygas." }, 400);

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await client
        .from("memorial_memories")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", id)
        .eq("visitor_hash", fingerprint)
        .gte("created_at", since);
      if (countError) throw countError;
      if ((count || 0) >= 2) return json({ error: "Šiandien jau pateikėte kelis prisiminimus. Pabandykite rytoj." }, 429);

      const { error } = await client.from("memorial_memories").insert({
        profile_id: id,
        author_name: authorName,
        message,
        visitor_hash: fingerprint,
      });
      if (error) throw error;
      return json({ ok: true, message: "Prisiminimas gautas ir bus parodytas po peržiūros." }, 202);
    }

    return json({ error: "Nežinomas veiksmas" }, 400);
  } catch (error) {
    console.error("memorial-engagement", error);
    return json({ error: "Šios funkcijos šiuo metu atlikti nepavyko." }, 500);
  }
});
