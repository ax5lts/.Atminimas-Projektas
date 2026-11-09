import { handleRequest } from "./index.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

Deno.test("engagement uses one atomic limiter identity across changed headers and fails closed", async () => {
  const originalFetch = globalThis.fetch;
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RATE_LIMIT_HASH_SECRET"];
  const previous = keys.map((key) => Deno.env.get(key));
  Deno.env.set(keys[0], "https://test.invalid");
  Deno.env.set(keys[1], "synthetic-service-key");
  Deno.env.set(keys[2], "synthetic-rate-limit-secret");
  const reservations = new Map<string, number>();
  const identities: string[] = [];
  let inserts = 0;
  let limiterUnavailable = false;
  let protectedPage = false;
  let profileQueries = 0;
  globalThis.fetch = (input, options) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/rest/v1/profiliai") {
      profileQueries++;
      assert(url.searchParams.get("access_code_protected") === "eq.false", "protected profiles must be hidden");
      return Promise.resolve(Response.json(protectedPage ? null : { id: "public-page" }));
    }
    if (url.pathname === "/rest/v1/rpc/consume_memorial_engagement_rate_limit") {
      if (limiterUnavailable) return Promise.resolve(Response.json({ message: "DB unavailable" }, { status: 503 }));
      const body = JSON.parse(String(options?.body));
      assert(/^[a-f0-9]{64}$/.test(body.p_ip_hash), "only keyed pseudonymous IP hash reaches the database");
      identities.push(body.p_ip_hash);
      const key = `${body.p_profile_id}:${body.p_action}:${body.p_ip_hash}`;
      const used = reservations.get(key) || 0;
      const accepted = used < (body.p_action === "candle" ? 1 : 2);
      if (accepted) reservations.set(key, used + 1);
      return Promise.resolve(Response.json(accepted));
    }
    if (options?.method === "POST") {
      inserts++;
      return Promise.resolve(new Response(null, { status: 201 }));
    }
    if (options?.method === "HEAD") {
      return Promise.resolve(new Response(null, { headers: { "Content-Range": `0-0/${inserts}` } }));
    }
    return Promise.resolve(Response.json([]));
  };
  const write = (agent: string, action = "candle", ip: string | null = "192.0.2.10") =>
    handleRequest(new Request("https://test.invalid", {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "User-Agent": agent,
        "X-Forwarded-For": `203.0.113.${agent.length}, 198.51.100.1`,
        ...(ip ? { "CF-Connecting-IP": ip } : {}),
      },
      body: JSON.stringify({ profile_id: "public-page", action,
        author_name: "Test visitor", message: "Synthetic memorial text.", consent: true }),
    }));
  try {
    const ready = await handleRequest(new Request("https://test.invalid", {
      method: "OPTIONS", headers: { "CF-Connecting-IP": "192.0.2.10" },
    }));
    assert(ready.headers.get("X-RateLimit-Ingress-Ready") === "true", "safe preflight readiness check must detect trusted ingress");
    const missing = await handleRequest(new Request("https://test.invalid", { method: "OPTIONS" }));
    assert(missing.headers.get("X-RateLimit-Ingress-Ready") === "false", "readiness must fail closed without a trusted IP");
    assert(profileQueries === 0, "readiness must not query or write the database");
    const concurrent = await Promise.all([write("A"), write("BB"), write("CCC")]);
    const statuses = concurrent.map((result) => result.status).sort();
    assert(JSON.stringify(statuses) === "[201,429,429]", "UA/XFF changes must not bypass the atomic reservation");
    assert(inserts === 1 && new Set(identities).size === 1, "only one candle may be inserted for the IP");
    assert((await write("first", "memory")).status === 202, "first memory accepted");
    assert((await write("second", "memory")).status === 202, "second memory accepted");
    assert((await write("third", "memory")).status === 429, "rotating UA must not allow a third memory");
    const beforeDenied = inserts;
    assert((await write("no-ip", "candle", null)).status === 503, "untrusted IP must fail closed");
    limiterUnavailable = true;
    assert((await write("db-failure", "candle", "192.0.2.11")).status === 500, "limiter failure must reject the write");
    limiterUnavailable = false;
    assert(inserts === beforeDenied, "failed checks must not insert content");
    protectedPage = true;
    assert((await handleRequest(new Request("https://test.invalid?profile_id=public-page"))).status === 404, "protected engagement must not leak on GET");
    assert((await write("protected")).status === 404, "protected page must reject writes too");
    assert(inserts === beforeDenied && profileQueries > 0, "protected requests must not insert");
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => previous[index] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[index]!));
  }
});
