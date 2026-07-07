import { adminClient, BlockedAutomationError, json, requireAutomationSecret } from "../_shared/core.ts";
import { syncShipment } from "../_shared/shipping.ts";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    requireAutomationSecret(request);
    const client = adminClient();
    const { data: orders, error } = await client.from("uzsakymai")
      .select("*")
      .not("shipment_provider_ref", "is", null)
      .in("shipping_status", ["paruošti", "išsiųsta"])
      .limit(100);
    if (error) throw error;
    const results: Array<Record<string, unknown>> = [];
    for (const order of orders || []) {
      try {
        results.push({ order_id: order.id, ...(await syncShipment(client, order)) });
      } catch (syncError) {
        results.push({ order_id: order.id, error: syncError instanceof Error ? syncError.message : "Sync failed" });
      }
    }
    return json({ checked: results.length, results });
  } catch (error) {
    const status = error instanceof BlockedAutomationError ? 409 : 401;
    return json({ error: error instanceof Error ? error.message : "Nepavyko patikrinti siuntų" }, status);
  }
});
