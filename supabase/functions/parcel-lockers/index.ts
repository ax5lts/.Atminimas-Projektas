const SOURCES: Record<string, string> = {
  omniva: "https://trmnl.lt/omniva_lt-all.json",
  "lp-express": "https://trmnl.lt/lpexpress-all.json",
  dpd: "https://trmnl.lt/dpd_lt-all.json",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 10_000;
type CacheEntry = { body: string; expires: number };

export function createParcelLockerHandler({
  fetcher = fetch,
  now = Date.now,
}: { fetcher?: typeof fetch; now?: () => number } = {}) {
  // These maps are bounded by the three supported carriers. Concurrent callers
  // share the same download and successful lists survive warm-instance calls.
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Promise<CacheEntry>>();

  async function load(carrier: string): Promise<CacheEntry> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const response = await fetcher(SOURCES[carrier], {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Source unavailable");
      const raw = await response.json();
      if (!Array.isArray(raw)) throw new Error("Unexpected source");

      const lockers = raw
        .filter((item): item is Record<string, unknown> => (
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
        ))
        .filter((item) => (
          !item.country || String(item.country).toUpperCase() === "LT"
        ))
        .slice(0, 1500)
        .map((item) => ({
          id: String(item.id || ""),
          title: String(item.title || ""),
          address: carrier === "omniva" ? "" : String(item.address || ""),
          city: carrier === "omniva"
            ? String(item.address || item.city || "")
            : String(item.city || ""),
          postCode: String(item.post_code || ""),
        }))
        .filter((item) => item.id && item.title && item.city)
        .sort((a, b) => (
          a.city.localeCompare(b.city, "lt") ||
          a.title.localeCompare(b.title, "lt")
        ));
      if (!lockers.length) throw new Error("Empty source");
      const entry = {
        body: JSON.stringify({ carrier, lockers, source: "trmnl.lt" }),
        expires: now() + CACHE_TTL_MS,
      };
      cache.set(carrier, entry);
      return entry;
    } finally {
      clearTimeout(timer);
    }
  }

  return async (request: Request) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: CORS });
    }

    const carrier = new URL(request.url).searchParams.get("carrier") || "";
    if (!Object.hasOwn(SOURCES, carrier)) {
      return new Response(JSON.stringify({ error: "Unsupported carrier" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    try {
      let entry = cache.get(carrier);
      if (!entry || entry.expires <= now()) {
        let loading = pending.get(carrier);
        if (!loading) {
          loading = load(carrier).finally(() => pending.delete(carrier));
          pending.set(carrier, loading);
        }
        entry = await loading;
      }
      const maxAge = Math.max(0, Math.floor((entry.expires - now()) / 1000));
      return new Response(entry.body, {
        status: 200,
        headers: {
          ...CORS,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}`,
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response(
        JSON.stringify({ error: "Parcel locker list unavailable" }),
        {
          status: 502,
          headers: {
            ...CORS,
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        },
      );
    }
  };
}

if (import.meta.main) Deno.serve(createParcelLockerHandler());
