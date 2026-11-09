import { isIP } from "node:net";

// Hosted Supabase requests reach this app through Cloudflare. Its ingress
// supplies CF-Connecting-IP; X-Forwarded-For can contain caller-prepended values.
// Do not add fallbacks to arbitrary forwarding headers. A self-hosted deployment
// must enforce the same trusted ingress contract before using this helper.
// https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip
export function trustedClientIp(request: Request): string | null {
  const address = (request.headers.get("cf-connecting-ip") || "").trim();
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6 || address.includes("%")) return null;
  // Canonicalize equivalent IPv6 spellings so case/zero padding cannot create
  // separate limiter identities. URL also normalizes embedded IPv4 addresses.
  return new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase();
}
