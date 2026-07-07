import { BlockedAutomationError, handleOptions, json, requireUser } from "../_shared/core.ts";
import { createShipment } from "../_shared/shipping.ts";

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { client, user } = await requireUser(request);
    const { data: role } = await client.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (role?.role !== "admin") return json({ error: "Prieiga draudžiama" }, 403);
    const body = await request.json();
    const orderId = String(body.order_id || "");
    const { data: order, error } = await client.from("uzsakymai").select("*").eq("id", orderId).maybeSingle();
    if (error || !order) return json({ error: "Užsakymas nerastas" }, 404);
    if (order.fulfillment_status !== "ready_to_ship") return json({ error: "Užsakymas dar neparuoštas siųsti" }, 409);
    const result = await createShipment(client, order);
    return json({ shipment: result });
  } catch (error) {
    const status = error instanceof BlockedAutomationError ? 409 : 500;
    return json({ error: error instanceof Error ? error.message : "Nepavyko sukurti siuntos" }, status);
  }
});
