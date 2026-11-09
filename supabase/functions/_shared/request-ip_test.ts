import { trustedClientIp } from "./request-ip.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

Deno.test("trusted ingress IP ignores spoofed forwarding headers and browser identity", () => {
  const request = new Request("https://test.invalid", { headers: {
    "cf-connecting-ip": "192.0.2.40",
    "x-forwarded-for": "203.0.113.99, 198.51.100.1",
    "x-real-ip": "203.0.113.100",
    "user-agent": "attacker-controlled",
  } });
  assert(trustedClientIp(request) === "192.0.2.40", "must use the ingress address");
  assert(trustedClientIp(new Request("https://test.invalid", { headers: {
    "x-forwarded-for": "192.0.2.40", "x-real-ip": "192.0.2.40",
  } })) === null, "forwarding headers alone must not be trusted");
});

Deno.test("trusted ingress IP canonicalizes IPv6 and rejects ambiguous input", () => {
  const request = (address: string) => new Request("https://test.invalid", {
    headers: { "cf-connecting-ip": address },
  });
  assert(trustedClientIp(request("2001:0DB8:0000:0000:0000:0000:0000:0001")) ===
    "2001:db8::1", "equivalent IPv6 representations must share an identity");
  for (const address of ["", "unknown", "192.0.2.1, 192.0.2.2", "192.0.2.1:1234", "256.0.0.1", "fe80::1%eth0"]) {
    assert(trustedClientIp(request(address)) === null, `must reject ${address}`);
  }
});
