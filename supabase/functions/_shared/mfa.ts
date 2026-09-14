// Call only after Supabase Auth has validated the token with getUser().
// The factors come from that live user response, never from user_metadata.
export function verifiedSessionNeedsMfa(
  token: string,
  user: { factors?: Array<{ status?: string }> },
): boolean {
  if (!user.factors?.some((factor) => factor.status === "verified")) return false;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return claims.aal !== "aal2";
  } catch {
    return true;
  }
}
