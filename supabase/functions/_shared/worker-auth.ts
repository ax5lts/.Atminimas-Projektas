import { constantTimeEqual } from "./core.ts";

export async function authorizeOrderWorker(
  request: Request,
  legacySecret: string,
  verifyVault: (secret: string) => Promise<boolean>,
): Promise<boolean> {
  const received = request.headers.get("x-automation-secret") || "";
  if (!received || received.length > 512) return false;
  if (legacySecret && constantTimeEqual(legacySecret, received)) return true;
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  return await verifyVault(received);
}
