import { env, publicSiteUrl, RequestError, requireUser } from "./core.ts";
import { loadModernConfig, modernAccessToken, modernCheckoutUrl, PayseraApiError, payseraJson, UUID } from "./paysera-modern.ts";

export function productOrderBody(attempt: Record<string, any>, projectId: string, site: string, callback: string) {
  const base = new URL(site);
  const hook = new URL(callback);
  if (base.protocol !== "https:" || hook.protocol !== "https:" || base.username || base.password || hook.username || hook.password) {
    throw new RequestError("Neteisingas svetainės adresas", 503);
  }
  const target = new URL("apmokejimas.html", base);
  target.searchParams.set("order", attempt.order_id);
  return {
    project_id: projectId,
    redirect_urls: {
      success_url: target.href + "&payment=success",
      failure_url: target.href + "&payment=cancelled",
      cancel_url: target.href + "&payment=cancelled",
      callback_url: hook.href,
    },
    purchase: { reference: attempt.id, amount: attempt.amount_cents, currency: attempt.currency },
    metadata: { referrer: base.href, platform: "atminimas", platform_version: "1.0.0" },
  };
}

export async function startProductPayment(request: Request, body: Record<string, unknown>) {
  const { user, client } = await requireUser(request);
  if (user.is_anonymous) throw new RequestError("Prieš mokėjimą prisijunkite", 401);
  const orderId = String(body.order_id || "");
  if (!UUID.test(orderId)) throw new RequestError("Neteisingas užsakymo numeris", 400);
  const config = await loadModernConfig(client);
  const token = await modernAccessToken(config);
  const site = publicSiteUrl();
  const callback = env("SUPABASE_URL").replace(/\/$/, "") + "/functions/v1/paysera-webhook";
  productOrderBody({ order_id: orderId }, config.projectId, site, callback);
  const { data, error } = await client.rpc("begin_product_paysera_payment", {
    p_order_id: orderId, p_actor_id: user.id, p_project_id: config.projectId,
  });
  if (error || !data?.attempt) throw new RequestError("Patikrinkite užsakymą ir pristatymo duomenis. Jei mokėjimas jau pradėtas, susisiekite su mumis.", 409);
  const attempt = data.attempt;
  if (attempt.checkout_url) {
    const url = modernCheckoutUrl(attempt.checkout_url);
    if (!url) throw new RequestError("Neteisinga mokėjimo nuoroda", 502);
    return { checkout_url: url, reused: true };
  }
  if (!data.claim_token) throw new RequestError("Mokėjimas jau ruošiamas. Palaukite ir bandykite dar kartą.", 409);
  try {
    let providerOrderId = attempt.provider_order_id;
    if (!providerOrderId) {
      const order = await payseraJson("/merchant-order/integration/v1/orders", token, productOrderBody(attempt, config.projectId, site, callback));
      if (!UUID.test(String(order.order_id)) || order.project_id !== config.projectId || order.purchase?.reference !== attempt.id ||
        order.purchase?.amount !== attempt.amount_cents || order.purchase?.currency !== attempt.currency) {
        throw new RequestError("Mokėjimo duomenys neatitinka užsakymo", 502);
      }
      providerOrderId = order.order_id;
      const attached = await client.rpc("attach_product_paysera_order", {
        p_attempt_id: attempt.id, p_claim_token: data.claim_token, p_provider_order_id: providerOrderId,
        p_amount: attempt.amount_cents, p_currency: attempt.currency, p_project_id: config.projectId,
      });
      if (attached.error) throw new RequestError("Mokėjimo užsakymo išsaugoti nepavyko", 502);
    }
    const lifetime = Math.floor((new Date(attempt.expires_at).valueOf() - Date.now()) / 1000);
    if (!Number.isSafeInteger(lifetime) || lifetime < 30) throw new RequestError("Mokėjimo nuorodos galiojimas baigėsi", 409);
    const link = await payseraJson("/checkout-payment-link/integration/v1/payment-links", token, {
      order_id: providerOrderId, name: `Atminimas ${attempt.id}`, lifetime,
      experience: { language: "lt" }, purchase: { amount: attempt.amount_cents },
    });
    const url = modernCheckoutUrl(link.payment_URL);
    if (!url || !UUID.test(String(link.link_id)) || link.order_id !== providerOrderId ||
      link.purchase?.amount !== attempt.amount_cents || !Number.isSafeInteger(link.expired_at)) {
      throw new RequestError("Mokėjimo nuoroda neatitinka užsakymo", 502);
    }
    const attached = await client.rpc("attach_product_paysera_link", {
      p_attempt_id: attempt.id, p_claim_token: data.claim_token, p_provider_order_id: providerOrderId,
      p_link_id: link.link_id, p_url: url, p_expires_at: new Date(link.expired_at * 1000).toISOString(),
    });
    if (attached.error) throw new RequestError("Mokėjimo nuorodos išsaugoti nepavyko", 502);
    return { checkout_url: url, reused: false };
  } catch (error) {
    if (error instanceof PayseraApiError && [400,401,403,404,422].includes(error.providerStatus)) {
      const released = await client.rpc("fail_product_paysera_creation", {
        p_attempt_id: attempt.id, p_claim_token: data.claim_token, p_http_status: error.providerStatus,
      });
      if (released.error) throw new RequestError("Mokėjimo būseną reikia sutikrinti. Susisiekite su mumis.", 502);
    }
    // Paysera order POST has no idempotency key. Retain claims on ambiguous failures.
    if (error instanceof RequestError) throw error;
    throw new RequestError("Mokėjimo atsakymas negautas. Susisiekite su mumis, kad patikrintume jo būseną.", 502);
  }
}
