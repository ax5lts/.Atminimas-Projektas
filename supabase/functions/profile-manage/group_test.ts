import { handleRequest as manage } from "./index.ts";
import { handleRequest as content } from "../profile-content/index.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

Deno.test("group ownership, membership validation, and public/private access", async () => {
  const originalFetch = globalThis.fetch;
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const previous = keys.map(key => Deno.env.get(key));
  Deno.env.set(keys[0], "https://test.invalid");
  Deno.env.set(keys[1], "test-key");
  let user = owner;
  let factors: Array<{ status: string }> = [];
  let active = false;
  let childOwner = owner;
  let nested = false;
  let writes = 0;
  let lastWrite: Record<string, unknown> = {};
  let requestedChildren = 0;
  globalThis.fetch = (input, options) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return Promise.resolve(Response.json({ id: user, factors }));
    if (url.pathname === "/rest/v1/user_roles") return Promise.resolve(Response.json(null));
    if (options?.method === "PATCH") { writes++; lastWrite = JSON.parse(String(options.body)); return Promise.resolve(new Response(null, { status: 204 })); }
    if (url.searchParams.has("group_members")) return Promise.resolve(Response.json([]));
    if (url.searchParams.get("id")?.startsWith("in.")) {
      requestedChildren++;
      return Promise.resolve(Response.json([{ id: "child", owner_id: childOwner, group_members: nested ? ["nested"] : [], vardas: "Ona", media_json: [], deleted_at: null }]));
    }
    return Promise.resolve(Response.json({ id: "root", owner_id: owner, vardas: "Jonas", aktyvus: active, group_members: ["child"], media_json: [], deleted_at: null }));
  };
  const change = (members: unknown, authenticated = true) => manage(new Request("https://test.invalid", {
    method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: "Bearer test" } : {}) },
    body: JSON.stringify({ action: "set_group_members", profile_id: "root", members }),
  }));
  try {
    assert((await change(["child"], false)).status === 401, "guest cannot link people");
    factors = [{ status: "verified" }];
    assert((await change(["child"])).status === 403, "enrolled MFA user needs an aal2 session before writes");
    assert(writes === 0, "MFA rejection must not write");
    factors = [];
    user = other;
    assert((await change(["child"])).status === 404, "another account cannot edit the root");
    user = owner;
    assert((await change(["root"])).status === 400, "self reference is rejected");
    assert((await change(["child", "child"])).status === 400, "duplicates are rejected");
    assert((await change(Array(8).fill("child"))).status === 400, "group limit is enforced");
    childOwner = other;
    assert((await change(["child"])).status === 400, "foreign children are rejected");
    childOwner = owner;
    nested = true;
    assert((await change(["child"])).status === 400, "nested groups are rejected");
    nested = false;
    assert(writes === 0, "invalid requests must not write");
    assert((await change(["child"])).status === 200, "owner can group people");
    assert((await change([])).status === 200, "owner can remove group membership");
    requestedChildren = 0;
    assert((await content(new Request("https://test.invalid?profile_id=root"))).status === 404, "private root is hidden");
    assert(requestedChildren === 0, "private group children are not queried for guests");
    active = true;
    const published = await content(new Request("https://test.invalid?profile_id=root"));
    const payload = await published.json();
    assert(payload.is_public === true, "editor receives publication state");
    assert(payload.members.length === 1 && payload.members[0].vardas === "Ona", "public root includes ordered member content");
    assert(!("owner_id" in payload.members[0]), "public response excludes ownership identifiers");
    const versioned = owner + "/root/photo-1-0123456789abcdef0123456789abcdef.webp";
    const update = await manage(new Request("https://test.invalid", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
      body: JSON.stringify({ action: "update", profile_id: "root", profile: { vardas: "Test" }, media: [
        { type: "image", order: 1, path: versioned },
        { type: "image", order: 2, path: other + "/root/photo-2.jpg" },
        { type: "image", order: 3, path: owner + "/root/../photo-3.jpg" },
      ] }),
    }));
    assert(update.status === 200, "versioned photo update succeeds");
    const writtenMedia = lastWrite.media_json as Array<{ path: string }>;
    assert(writtenMedia.length === 1 && writtenMedia[0].path === versioned, "new names preserve owner and traversal checks");
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, i) => previous[i] === undefined ? Deno.env.delete(key) : Deno.env.set(key, previous[i]!));
  }
});
