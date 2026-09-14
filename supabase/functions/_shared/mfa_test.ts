import { verifiedSessionNeedsMfa } from "./mfa.ts";
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
