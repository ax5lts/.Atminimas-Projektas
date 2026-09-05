import { createHmac } from "node:crypto";
import {
  assertModernOrder,
  handleModernWebhook,
  modernCheckoutUrl,
  modernPaymentEvent,
  parseModernConfig,
  paymentIsTest,
  startModernServicePayment,
  verifyModernSignature,
} from "./paysera-modern.ts";

const project = "01a07175-b221-7358-8db0-c832cedafd3c";
const attempt = "b0b07af0-afbe-42ea-8c65-08af2cb3737b";
const orderId = "019ed03a-84f0-7ba0-874a-f7473738875b";
const actor = "571f19ca-cf2a-4096-a527-3c56d937e78b";
const requestId = "860115dd-e40c-4681-81cc-bdbe131fb16d";
const claim = "ac3fd92c-aea4-4e27-918c-9d6608590028";
const secret = "unit-test-modern-secret";
const config = {
  clientId: "test-client",
  clientSecret: secret,
  projectId: project,
};
const configJson = {
  client_id: config.clientId,
  client_secret: secret,
  project_id: project,
};
const checkout =
  "https://api.paysera.com/checkout-payment-link/payment-collection/v1/payment-links/testlink";
const service = {
  id: requestId,
  payment_attempt_id: attempt,
  quote_amount_cents: 2500,
  currency: "EUR",
  payment_status: "processing",
  payment_provider: "paysera_modern",
  payment_session_id: null,
  payment_session_expires_at: new Date(Date.now() + 3600000).toISOString(),
};
const callback = {
  event: { type: "payment", name: "status_updated" },
  order: { paysera_order_id: orderId, merchant_order_id: attempt },
  payment: { status: "settled", amount: 1500, currency: "EUR" },
};
const readOrder = {
  id: orderId,
  reference: attempt,
  project_id: project,
  amount: 2500,
  amount_paid: 2500,
  currency: "EUR",
  status: "paid",
};
const raw = new TextEncoder().encode(JSON.stringify(callback));
const signature = createHmac("sha256", secret).update(raw).digest("hex");
function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function throws(fn: () => unknown) {
  let failed = false;
  try {
    fn();
  } catch {
    failed = true;
  }
  assert(failed, "expected rejection");
}

Deno.test("Modern config requires the OAuth pair and supports the project's UUIDv7", () => {
  assert(parseModernConfig(configJson).projectId === project);
  throws(() => parseModernConfig({ ...configJson, client_secret: "" }));
  throws(() => parseModernConfig({ ...configJson, project_id: "123456" }));
});
Deno.test("Modern signature verifies raw bytes and rejects malformed or changed signatures", () => {
  assert(verifyModernSignature(raw, signature, secret));
  assert(!verifyModernSignature(raw, signature, "different"));
  assert(
    !verifyModernSignature(
      new TextEncoder().encode(JSON.stringify({ ...callback, extra: true })),
      signature,
      secret,
    ),
  );
  for (const sig of ["", signature + "x", "0".repeat(64), signature.slice(1)]) {
    assert(!verifyModernSignature(raw, sig, secret));
  }
});
Deno.test("Modern redirects permit only the documented payment-collection endpoint", () => {
  assert(modernCheckoutUrl(checkout) === checkout);
  for (
    const url of [
      checkout.replace("https:", "http:"),
      checkout.replace("api.paysera.com", "api.paysera.com.evil.test"),
      checkout + "?redirect=https://evil.test",
      checkout.replace("api.paysera.com", "user@api.paysera.com"),
      "https://api.paysera.com/other",
      checkout + "/../other",
    ]
  ) assert(!modernCheckoutUrl(url));
});
Deno.test("Order creation responses must match the frozen quote and project", () => {
  const order = {
    order_id: orderId,
    project_id: project,
    purchase: { reference: attempt, amount: 2500, currency: "EUR" },
  };
  assertModernOrder(order, service, config);
  throws(() =>
    assertModernOrder({ ...order, project_id: actor }, service, config)
  );
  throws(() =>
    assertModernOrder(
      { ...order, purchase: { ...order.purchase, amount: 1 } },
      service,
      config,
    )
  );
  throws(() =>
    assertModernOrder(
      { ...order, purchase: { ...order.purchase, reference: actor } },
      service,
      config,
    )
  );
});
Deno.test("Thin payment callbacks use authoritative order totals and isolate sandbox flags", () => {
  const event = modernPaymentEvent(raw, callback, readOrder, config);
  assert(
    event.p_amount_paid === 2500 && event.p_amount === 2500 && !event.p_test,
  );
  assert(
    modernPaymentEvent(
      raw,
      { ...callback, payment: { is_test: true } },
      readOrder,
      config,
    ).p_test,
  );
  assert(
    modernPaymentEvent(raw, callback, { ...readOrder, is_test: true }, config)
      .p_test,
  );
  throws(() =>
    modernPaymentEvent(
      raw,
      callback,
      { ...readOrder, project_id: actor },
      config,
    )
  );
  throws(() =>
    modernPaymentEvent(
      raw,
      callback,
      { ...readOrder, reference: actor },
      config,
    )
  );
  throws(() =>
    modernPaymentEvent(raw, callback, { ...readOrder, amount_paid: -1 }, config)
  );
  throws(() => paymentIsTest({ is_test: "false" }));
  assert(
    paymentIsTest({
      order: { payment_links: [{ payments: [{ is_test: true }] }] },
    }),
  );
});

type Scenario = {
  noClaim?: boolean;
  providerError?: number;
  timeout?: boolean;
  partial?: boolean;
  sandbox?: boolean;
};
async function mocked(
  scenario: Scenario,
  action: (calls: { path: string; body: any }[]) => Promise<void>,
) {
  const names = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
    "PUBLIC_SITE_URL",
    "PAYSERA_CLIENT_ID",
    "PAYSERA_CLIENT_SECRET",
    "PAYSERA_MODERN_PROJECT_ID",
  ];
  const previous = names.map((name) => Deno.env.get(name));
  names.forEach((name) => Deno.env.delete(name));
  Deno.env.set("SUPABASE_URL", "https://supabase.test");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "unit-test-service-key");
  Deno.env.set("SUPABASE_ANON_KEY", "unit-test-anon-key");
  Deno.env.set("PUBLIC_SITE_URL", "https://example.test/");
  const oldFetch = globalThis.fetch;
  const calls: { path: string; body: any }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ path, body });
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.hostname === "supabase.test") {
      if (path === "/auth/v1/user") {
        return json({
          id: actor,
          is_anonymous: false,
          email: "test@example.test",
        });
      }
      if (path.endsWith("/get_paysera_checkout_credentials")) {
        return json(configJson);
      }
      if (path.endsWith("/begin_my_paysera_modern_payment")) {
        return json({ service, claim_token: scenario.noClaim ? null : claim });
      }
      if (path.endsWith("/process_paysera_modern_payment")) {
        return json(
          scenario.partial || scenario.sandbox ? "recorded" : "accepted",
        );
      }
      if (
        /\/(attach_paysera_modern_order|attach_paysera_modern_link|fail_paysera_modern_creation)$/
          .test(path)
      ) return json(null);
    }
    if (url.hostname === "api.paysera.com") {
      if (path.includes("/openid-connect/token")) {
        return json({ access_token: "unit-test-access-token" });
      }
      if (path === "/merchant-order/integration/v1/orders") {
        if (scenario.timeout) throw new TypeError("Simulated network timeout");
        if (scenario.providerError) {
          return json(
            { error: "payment_collection_not_activated" },
            scenario.providerError,
          );
        }
        return json({
          order_id: orderId,
          project_id: project,
          purchase: { reference: attempt, amount: 2500, currency: "EUR" },
        }, 201);
      }
      if (path === `/merchant-order/integration/v1/orders/${orderId}`) {
        return json({
          ...readOrder,
          ...(scenario.partial
            ? { amount_paid: 1500, status: "pending_payment" }
            : {}),
          ...(scenario.sandbox ? { is_test: true } : {}),
        });
      }
      if (path === "/checkout-payment-link/integration/v1/payment-links") {
        return json({
          link_id: actor,
          order_id: orderId,
          payment_URL: checkout,
          purchase: { amount: 2500 },
          expired_at: Math.floor(Date.now() / 1000) + 3500,
        }, 201);
      }
    }
    throw new Error("Unexpected request " + path);
  };
  try {
    await action(calls);
  } finally {
    globalThis.fetch = oldFetch;
    names.forEach((name, i) => {
      if (previous[i] === undefined) Deno.env.delete(name);
      else Deno.env.set(name, previous[i]!);
    });
  }
}
function checkoutRequest() {
  return new Request("https://supabase.test/service-flow", {
    method: "POST",
    headers: { authorization: "Bearer user-token" },
  });
}
function webhookRequest(sig = signature) {
  return new Request("https://supabase.test/webhook", {
    method: "POST",
    headers: { "x-paysera-signature": sig, "content-type": "application/json" },
    body: raw,
  });
}

Deno.test("Authenticated checkout stores the order before its link and ignores browser prices", async () => {
  await mocked({}, async (calls) => {
    const result = await startModernServicePayment(checkoutRequest(), {
      request_id: requestId,
      amount: 1,
      currency: "USD",
    });
    assert(result.checkout_url === checkout);
    const create = calls.find((c) =>
      c.path === "/merchant-order/integration/v1/orders"
    )!;
    assert(
      create.body.purchase.amount === 2500 &&
        create.body.purchase.currency === "EUR",
    );
    assert(
      calls.findIndex((c) => c.path.endsWith("/attach_paysera_modern_order")) <
        calls.findIndex((c) => c.path.endsWith("/payment-links")),
    );
    assert(calls.some((c) => c.path.endsWith("/attach_paysera_modern_link")));
    assert(!JSON.stringify(result).includes(secret));
  });
});
Deno.test("Concurrent checkout cannot repeat the non-idempotent provider POST", async () => {
  await mocked({ noClaim: true }, async (calls) => {
    let failed = false;
    try {
      await startModernServicePayment(checkoutRequest(), {
        request_id: requestId,
      });
    } catch {
      failed = true;
    }
    assert(
      failed &&
        !calls.some((c) => c.path === "/merchant-order/integration/v1/orders"),
    );
  });
});
Deno.test("Definitive provider rejection releases the claim; timeout retains it", async () => {
  for (
    const scenario of [{ providerError: 400 }, { timeout: true }, {
      providerError: 500,
    }]
  ) {
    await mocked(scenario, async (calls) => {
      let message = "";
      try {
        await startModernServicePayment(checkoutRequest(), {
          request_id: requestId,
        });
      } catch (error) {
        message = String(error);
      }
      assert(message && !message.includes(secret));
      assert(
        calls.some((c) => c.path.endsWith("/fail_paysera_modern_creation")) ===
          (scenario.providerError === 400),
      );
    });
  }
});
Deno.test("Signed webhook reads full order before recording payment; partial/test funds stay distinct", async () => {
  for (const scenario of [{}, { partial: true }, { sandbox: true }]) {
    await mocked(scenario, async (calls) => {
      const response = await handleModernWebhook(webhookRequest());
      assert(response.status === 200 && await response.text() === "OK");
      const event = calls.find((c) =>
        c.path.endsWith("/process_paysera_modern_payment")
      )!.body;
      assert(event.p_amount_paid === ("partial" in scenario ? 1500 : 2500));
      assert(event.p_test === ("sandbox" in scenario));
    });
  }
});
Deno.test("Invalid webhook signature never queries Paysera or writes payment state", async () => {
  await mocked({}, async (calls) => {
    assert(
      (await handleModernWebhook(webhookRequest("0".repeat(64)))).status ===
        401,
    );
    assert(
      !calls.some((c) =>
        c.path.includes("/merchant-order/") ||
        c.path.endsWith("/process_paysera_modern_payment")
      ),
    );
  });
});
