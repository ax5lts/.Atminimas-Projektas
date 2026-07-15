const SOURCES: Record<string, string> = {
  omniva: "https://trmnl.lt/omniva_lt-all.json",
  "lp-express": "https://trmnl.lt/lpexpress-all.json",
  dpd: "https://trmnl.lt/dpd_lt-all.json",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  const carrier = new URL(request.url).searchParams.get("carrier") || "";
  const source = SOURCES[carrier];
  if (!source) {
    return new Response(JSON.stringify({ error: "Unsupported carrier" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const response = await fetch(source, { headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error("Source unavailable");
    const raw = await response.json();
    if (!Array.isArray(raw)) throw new Error("Unexpected source");

    const lockers = raw
      .filter((item: Record<string, unknown>) => (
        !item.country || String(item.country).toUpperCase() === "LT"
      ))
      .slice(0, 1500)
      .map((item: Record<string, unknown>) => ({
        id: String(item.id || ""),
        title: String(item.title || ""),
        address: carrier === "omniva" ? "" : String(item.address || ""),
        city: carrier === "omniva"
          ? String(item.address || item.city || "")
          : String(item.city || ""),
        postCode: String(item.post_code || ""),
      }))
      .filter((item: { id: string; title: string; city: string }) => (
        item.id && item.title && item.city
      ))
      .sort((a: { city: string; title: string }, b: { city: string; title: string }) => (
        a.city.localeCompare(b.city, "lt") || a.title.localeCompare(b.title, "lt")
      ));

    return new Response(JSON.stringify({ carrier, lockers, source: "trmnl.lt" }), {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Parcel locker list unavailable" }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
