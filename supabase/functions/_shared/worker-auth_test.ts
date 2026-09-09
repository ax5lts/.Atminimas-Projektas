import { authorizeOrderWorker } from "./worker-auth.ts";
const request = (secret: string) => new Request("https://example.invalid", { headers: { "x-automation-secret": secret } });
Deno.test("worker rejects missing and malformed credentials before database access", async () => {
  for (const secret of ["", "bad", "x".repeat(513)]) {
    if (await authorizeOrderWorker(request(secret), "", async () => { throw new Error("must not query"); })) throw new Error("Unauthorized");
  }
});
Deno.test("worker keeps existing secret support and accepts only a verified Vault credential", async () => {
  if (!await authorizeOrderWorker(request("existing-secret"), "existing-secret", async () => false)) throw new Error("Legacy rejected");
  const credential = "a".repeat(64);
  if (!await authorizeOrderWorker(request(credential), "", async s => s === credential)) throw new Error("Vault rejected");
  if (await authorizeOrderWorker(request(credential), "", async () => false)) throw new Error("Invalid secret accepted");
});
Deno.test("worker fails closed if Vault validation is unavailable", async () => {
  let failed = false;
  try { await authorizeOrderWorker(request("b".repeat(64)), "", async () => { throw new Error("DB unavailable"); }); }
  catch { failed = true; }
  if (!failed) throw new Error("Database error bypassed authentication");
});
