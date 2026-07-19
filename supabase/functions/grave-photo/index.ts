const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PHOTO_BUCKET = "grave-photo-submissions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

type PhotoRow = {
  storage_path: string;
  mime_type: string;
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function serviceHeaders(): HeadersInit {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json",
  };
}

function storagePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function isAdmin(request: Request): Promise<boolean> {
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return false;

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: authorization,
      Accept: "application/json",
    },
  });
  if (!userResponse.ok) return false;
  const user = await userResponse.json().catch(() => null);
  if (!user?.id) return false;

  const params = new URLSearchParams({
    select: "role",
    user_id: `eq.${user.id}`,
    role: "eq.admin",
    limit: "1",
  });
  const roleResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?${params}`, {
    headers: serviceHeaders(),
  });
  if (!roleResponse.ok) return false;
  const roles = await roleResponse.json().catch(() => []);
  return Array.isArray(roles) && roles.length > 0;
}

async function findPhoto(url: URL, request: Request): Promise<PhotoRow | null | Response> {
  const reviewId = (url.searchParams.get("review_id") || "").trim();
  const params = new URLSearchParams({
    select: "storage_path,mime_type",
    limit: "1",
  });

  if (reviewId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reviewId)) {
      return jsonResponse({ error: "Neteisingas nuotraukos identifikatorius." }, 400);
    }
    if (!await isAdmin(request)) return jsonResponse({ error: "Reikia administratoriaus teisių." }, 403);
    params.set("id", `eq.${reviewId}`);
  } else {
    const sourceModel = (url.searchParams.get("source_model") || "").trim();
    const graveId = (url.searchParams.get("grave_source_id") || "").trim();
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(sourceModel) || !graveId || graveId.length > 300) {
      return jsonResponse({ error: "Trūksta kapavietės identifikatoriaus." }, 400);
    }
    params.set("source_model", `eq.${sourceModel}`);
    params.set("grave_source_id", `eq.${graveId}`);
    params.set("status", "eq.approved");
    params.set("order", "reviewed_at.desc.nullslast");
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/grave_photo_submissions?${params}`, {
    headers: serviceHeaders(),
  });
  if (!response.ok) {
    console.error("grave photo lookup failed", response.status, await response.text());
    return jsonResponse({ error: "Nuotraukos patikrinti nepavyko." }, 502);
  }
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] as PhotoRow : null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse({ error: "Leidžiami tik GET ir HEAD metodai." }, 405);
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Nuotraukų paslauga nesukonfigūruota." }, 500);
  }

  const url = new URL(request.url);
  const found = await findPhoto(url, request);
  if (found instanceof Response) return found;
  if (!found) return jsonResponse({ error: "Patvirtintos kapavietės nuotraukos nėra." }, 404);

  const objectResponse = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(PHOTO_BUCKET)}/${storagePath(found.storage_path)}`,
    { headers: serviceHeaders() },
  );
  if (!objectResponse.ok || !objectResponse.body) {
    console.error("grave photo object missing", objectResponse.status, found.storage_path);
    return jsonResponse({ error: "Nuotraukos failas nepasiekiamas." }, 404);
  }

  const review = url.searchParams.has("review_id");
  const headers = new Headers({
    ...corsHeaders,
    "Content-Type": found.mime_type || objectResponse.headers.get("content-type") || "image/jpeg",
    "Cache-Control": review ? "private, no-store" : "public, max-age=300",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
  });
  const length = objectResponse.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(request.method === "HEAD" ? null : objectResponse.body, { status: 200, headers });
});
