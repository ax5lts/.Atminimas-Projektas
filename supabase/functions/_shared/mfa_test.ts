import { verifiedSessionNeedsMfa } from "./mfa.ts";
import { requireUser, RequestError } from "./core.ts";
function assert(value: boolean) { if (!value) throw new Error("MFA guard assertion failed"); }
const token = (claims: object) => "e30." + btoa(JSON.stringify(claims)) + ".validated-elsewhere";
Deno.test("MFA guards verified factors, fails closed on malformed tokens, ignores user metadata", () => {
  const verified = { factors: [{ status: "verified" }] };
  assert(verifiedSessionNeedsMfa(token({ aal: "aal1" }), verified));
  assert(verifiedSessionNeedsMfa(token({}), verified));
  assert(verifiedSessionNeedsMfa("broken", verified));
  assert(!verifiedSessionNeedsMfa(token({ aal: "aal2" }), verified));
  assert(!verifiedSessionNeedsMfa(token({ aal: "aal1" }), { factors: [{ status: "unverified" }] }));
  assert(!verifiedSessionNeedsMfa(token({}), {}));
});

Deno.test("administrators require aal2 even with no enrolled or verified factor", () => {
  assert(verifiedSessionNeedsMfa(token({ aal: "aal1" }), {}, true));
  assert(verifiedSessionNeedsMfa(token({ aal: "aal1" }), { factors: [{ status: "unverified" }] }, true));
  assert(verifiedSessionNeedsMfa("broken", {}, true));
  assert(!verifiedSessionNeedsMfa(token({ aal: "aal2" }), {}, true));
});

Deno.test("requireUser reads the live admin role and rejects an unenrolled aal1 admin", async () => {
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const previous = names.map((name) => Deno.env.get(name));
  const originalFetch = globalThis.fetch;
  const userId = "11111111-1111-4111-8111-111111111111";
  let admin = true;
  let roleReads = 0;
  Deno.env.set(names[0], "https://mfa-api.invalid");
  Deno.env.set(names[1], "test-only-service-key");
  globalThis.fetch = (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return Promise.resolve(Response.json({ id: userId, factors: [], user_metadata: { role: "admin" } }));
    assert(url.pathname === "/rest/v1/user_roles");
    assert(url.searchParams.get("user_id") === "eq." + userId);
    assert(url.searchParams.get("role") === "eq.admin");
    roleReads++;
    return Promise.resolve(Response.json(admin ? [{ role: "admin" }] : []));
  };
  const request = (aal: string) => new Request("https://edge.invalid", { headers: { Authorization: "Bearer " + token({ sub: userId, aal }) } });
  try {
    let denied = false;
    try { await requireUser(request("aal1")); }
    catch (error) { denied = error instanceof RequestError && error.status === 403; }
    assert(denied);
    assert((await requireUser(request("aal2"))).user.id === userId);
    admin = false;
    assert((await requireUser(request("aal1"))).user.id === userId);
    assert(roleReads === 3);
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => previous[index] === undefined ? Deno.env.delete(name) : Deno.env.set(name, previous[index]!));
  }
});
