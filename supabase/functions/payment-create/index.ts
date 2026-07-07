import { env, handleOptions, json, publicSiteUrl, requireUser } from "../_shared/core.ts";

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { client, user } = await requireUser(request);
    const body = await request.json();
    const orderId = String(body.order_id || "");
    if (!orderId) return json({ error: "Trūksta užsakymo numerio" }, 400);

    const { data: order, error } = await client
      .from("uzsakymai")
      .select("id,profilis_id,total_cents,currency,payment_status,apmoketa,recipient_email,updated_at,profiliai!inner(owner_id)")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    const ownerId = (order?.profiliai as { owner_id?: string } | null)?.owner_id;
    if (!order || ownerId !== user.id) return json({ error: "Užsakymas nerastas" }, 404);
    if (order.apmoketa || order.payment_status === "paid") return json({ error: "Užsakymas jau apmokėtas" }, 409);
    if (!Number.isInteger(order.total_cents) || order.total_cents <= 0) {
      return json({ error: "Galutinė produkto arba pristatymo kaina dar nepatvirtinta" }, 409);
    }

    const stripeKey = env("STRIPE_SECRET_KEY", false);
    if (!stripeKey) return json({ error: "Mokėjimų tiekėjas dar nesukonfigūruotas" }, 503);
    const site = publicSiteUrl();
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", `${site}apmokejimas.html?order=${encodeURIComponent(order.id)}&payment=success`);
    params.set("cancel_url", `${site}apmokejimas.html?order=${encodeURIComponent(order.id)}&payment=cancelled`);
    params.set("client_reference_id", order.id);
    params.set("metadata[order_id]", order.id);
    params.set("line_items[0][price_data][currency]", String(order.currency || "EUR").toLowerCase());
    params.set("line_items[0][price_data][unit_amount]", String(order.total_cents));
    params.set("line_items[0][price_data][product_data][name]", "Atminimas QR užsakymas");
    params.set("line_items[0][quantity]", "1");
    params.set("locale", "lt");
    params.set("customer_email", order.recipient_email || user.email || "");

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `checkout-${order.id}-${order.updated_at}`.slice(0, 255),
      },
      body: params,
    });
    const session = await response.json();
    if (!response.ok || !session.url || !session.id) throw new Error(`Stripe ${response.status}: ${JSON.stringify(session)}`);

    const { error: updateError } = await client.from("uzsakymai").update({
      payment_status: "processing",
      payment_provider: "stripe",
      payment_reference: session.id,
    }).eq("id", order.id);
    if (updateError) throw updateError;
    return json({ checkout_url: session.url, session_id: session.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Nepavyko pradėti mokėjimo" }, 500);
  }
});
