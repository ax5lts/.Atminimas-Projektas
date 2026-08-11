import {
  env,
  handleOptions,
  json,
  publicSiteUrl,
  readJson,
  RequestError,
  requireUser,
} from "../_shared/core.ts";

function checkoutUrl(value: unknown) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" &&
        parsed.hostname === "checkout.stripe.com"
      ? parsed.href
      : "";
  } catch (_error) {
    return "";
  }
}

function sessionMatches(
  session: Record<string, unknown>,
  order: Record<string, unknown>,
) {
  const metadata = session.metadata && typeof session.metadata === "object"
    ? session.metadata as Record<string, unknown>
    : {};
  return session.mode === "payment" &&
    session.client_reference_id === order.id &&
    metadata.order_id === order.id &&
    Number(session.amount_total) === Number(order.total_cents) &&
    String(session.currency || "").toUpperCase() ===
      String(order.currency || "").toUpperCase();
}

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { client, user } = await requireUser(request);
    const body = await readJson(request, 16_000);
    const orderId = String(body.order_id || "");
    if (!orderId) return json({ error: "Trūksta užsakymo numerio" }, 400);

    const { data: order, error } = await client
      .from("uzsakymai")
      .select(
        "id,profilis_id,total_cents,currency,payment_status,payment_reference,apmoketa,recipient_email,updated_at,profiliai!inner(owner_id)",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    const ownerId = (order?.profiliai as { owner_id?: string } | null)
      ?.owner_id;
    if (!order || ownerId !== user.id) {
      return json({ error: "Užsakymas nerastas" }, 404);
    }
    if (order.apmoketa || order.payment_status === "paid") {
      return json({ error: "Užsakymas jau apmokėtas" }, 409);
    }
    if (!Number.isInteger(order.total_cents) || order.total_cents <= 0) {
      return json({
        error: "Galutinė produkto arba pristatymo kaina dar nepatvirtinta",
      }, 409);
    }

    const stripeKey = env("STRIPE_SECRET_KEY", false);
    if (!stripeKey) {
      return json({ error: "Mokėjimų tiekėjas dar nesukonfigūruotas" }, 503);
    }
    if (order.payment_status === "processing" && order.payment_reference) {
      const existingResponse = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${
          encodeURIComponent(order.payment_reference)
        }`,
        { headers: { Authorization: `Bearer ${stripeKey}` } },
      );
      const existing = await existingResponse.json().catch(() => ({}));
      if (!existingResponse.ok) {
        throw new RequestError(
          "Esamo mokėjimo patikrinti nepavyko. Pabandykite vėliau.",
          502,
        );
      }
      if (!sessionMatches(existing, order)) {
        throw new RequestError(
          "Mokėjimo sesijos duomenys neatitinka užsakymo",
          409,
        );
      }
      const existingUrl = checkoutUrl(existing.url);
      if (existing.status === "open" && existingUrl) {
        return json({ checkout_url: existingUrl, session_id: existing.id });
      }
      if (
        existing.status === "complete" || existing.payment_status === "paid"
      ) {
        throw new RequestError(
          "Mokėjimas užbaigtas ir laukia saugaus Stripe patvirtinimo",
          409,
        );
      }
      if (existing.status === "expired") {
        const { error: expiredError } = await client.from("uzsakymai").update({
          payment_status: "failed",
        }).eq("id", order.id).eq("payment_reference", order.payment_reference);
        if (expiredError) throw expiredError;
        throw new RequestError(
          "Ankstesnė mokėjimo sesija nebegalioja. Pabandykite dar kartą.",
          409,
        );
      }
      throw new RequestError("Mokėjimo sesija šiuo metu nepasiekiama", 409);
    }

    const site = publicSiteUrl();
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set(
      "success_url",
      `${site}aciu.html?type=payment&order=${
        encodeURIComponent(order.id)
      }`,
    );
    params.set(
      "cancel_url",
      `${site}apmokejimas.html?order=${
        encodeURIComponent(order.id)
      }&payment=cancelled`,
    );
    params.set("client_reference_id", order.id);
    params.set("metadata[order_id]", order.id);
    params.set(
      "line_items[0][price_data][currency]",
      String(order.currency || "EUR").toLowerCase(),
    );
    params.set(
      "line_items[0][price_data][unit_amount]",
      String(order.total_cents),
    );
    params.set(
      "line_items[0][price_data][product_data][name]",
      "Atminimas QR užsakymas",
    );
    params.set("line_items[0][quantity]", "1");
    params.set("locale", "lt");
    params.set("customer_email", order.recipient_email || user.email || "");

    const response = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": `checkout-${order.id}-${order.updated_at}`.slice(
            0,
            255,
          ),
        },
        body: params,
      },
    );
    const session = await response.json();
    const safeCheckoutUrl = checkoutUrl(session.url);
    if (
      !response.ok || !safeCheckoutUrl || !session.id ||
      !sessionMatches(session, order)
    ) {
      console.error("Stripe checkout session rejected", {
        status: response.status,
        orderId: order.id,
        stripeType: session?.error?.type,
      });
      throw new RequestError(
        "Mokėjimo sesijos sukurti nepavyko. Pabandykite dar kartą.",
        502,
      );
    }

    const { error: updateError } = await client.from("uzsakymai").update({
      payment_status: "processing",
      payment_provider: "stripe",
      payment_reference: session.id,
    }).eq("id", order.id);
    if (updateError) throw updateError;
    return json({ checkout_url: safeCheckoutUrl, session_id: session.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (error instanceof RequestError) {
      return json({ error: error.message }, error.status);
    }
    if (/^(Authentication required|Invalid session)$/i.test(message)) {
      return json({ error: "Prisijungimo sesija nebegalioja" }, 401);
    }
    console.error("payment-create failed", error);
    return json({ error: "Nepavyko pradėti mokėjimo" }, 500);
  }
});
