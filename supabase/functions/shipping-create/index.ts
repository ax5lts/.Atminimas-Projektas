import {
  BlockedAutomationError,
  handleOptions,
  json,
  readJson,
  RequestError,
  requireUser,
} from "../_shared/core.ts";
import { createShipment } from "../_shared/shipping.ts";

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  try {
    const { client, user } = await requireUser(request);
    const { data: role } = await client.from("user_roles").select("role").eq(
      "user_id",
      user.id,
    ).eq("role", "admin").maybeSingle();
    if (role?.role !== "admin") {
      return json({ error: "Prieiga draudžiama" }, 403);
    }
    const body = await readJson(request, 8_000);
    const orderId = String(body.order_id || "");
    const { data: order, error } = await client.from("uzsakymai").select(
      "id,delivery_method,carrier,city,parcel_terminal,recipient_name,recipient_phone,recipient_email,product_type,shipment_provider_ref,tracking_number,fulfillment_status",
    )
      .eq("id", orderId).maybeSingle();
    if (error || !order) return json({ error: "Užsakymas nerastas" }, 404);
    if (order.fulfillment_status !== "ready_to_ship") {
      return json({ error: "Užsakymas dar neparuoštas siųsti" }, 409);
    }
    const result = await createShipment(client, order);
    return json({ shipment: result });
  } catch (error) {
    if (error instanceof RequestError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof BlockedAutomationError) {
      return json({ error: error.message }, 409);
    }
    const message = error instanceof Error ? error.message : "";
    if (/^(Authentication required|Invalid session)$/i.test(message)) {
      return json({ error: "Prisijungimo sesija nebegalioja" }, 401);
    }
    console.error("shipping-create failed", error);
    return json({ error: "Nepavyko sukurti siuntos" }, 500);
  }
});
