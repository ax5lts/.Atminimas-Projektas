import { createHash } from "node:crypto";
import {
  createPayseraCheckout,
  encodePaysera,
  payseraConfig,
  payseraDeadline,
  verifyPayseraCallback,
} from "./paysera.ts";
import { handlePayseraWebhook } from "../paysera-webhook/index.ts";

const config = {
  projectId: "123456",
  password: "unit-test-password",
  test: false,
};
const attemptId = "b0b07af0-afbe-42ea-8c65-08af2cb3737b";
function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function rejects(action: () => unknown) {
  let threw = false;
  try {
    action();
  } catch {
    threw = true;
  }
  assert(threw, "Expected rejection");
}
function signed(overrides: Record<string, string> = {}) {
  const data = encodePaysera(
    new URLSearchParams({
      projectid: config.projectId,
      orderid: attemptId,
      amount: "2500",
      currency: "EUR",
      status: "1",
      test: "0",
      ...overrides,
    }),
  );
  const ss1 = createHash("md5").update(data + config.password).digest("hex");
  return new URLSearchParams({ data, ss1 }).toString();
}

Deno.test("configuration requires credentials and an explicit payment mode", () => {
  for (
    const values of [{}, {
      PAYSERA_PROJECT_ID: "123456",
      PAYSERA_SIGN_PASSWORD: "test",
    }, {
      PAYSERA_PROJECT_ID: "123456",
      PAYSERA_SIGN_PASSWORD: "test",
      PAYSERA_TEST: "false",
    }]
  ) {
    rejects(() =>
      payseraConfig((name) => (values as Record<string, string>)[name] || "")
    );
  }
  assert(
    payseraConfig((
      name,
    ) => ({
      PAYSERA_PROJECT_ID: "123456",
      PAYSERA_SIGN_PASSWORD: "test",
      PAYSERA_TEST: "1",
    }[name] || "")).test,
  );
});

Deno.test("checkout signs exact UTF-8 form data with the server amount and return URLs", () => {
  const url = new URL(createPayseraCheckout(config, {
    attemptId,
    amountCents: 2500,
    currency: "EUR",
    expiresAt: new Date("2026-09-05T15:00:00Z"),
    acceptUrl: "https://example.test/vartotojas.html?payment=success",
    cancelUrl: "https://example.test/vartotojas.html?payment=cancelled",
    callbackUrl: "https://example.test/webhook",
    email: "test@example.test",
  }));
  assert(url.origin === "https://www.paysera.com" && url.pathname === "/pay/");
  const data = url.searchParams.get("data")!;
  assert(
    url.searchParams.get("sign") ===
      createHash("md5").update(data + config.password).digest("hex"),
  );
  const params = new URLSearchParams(
    atob(data.replace(/-/g, "+").replace(/_/g, "/")),
  );
  assert(
    params.get("amount") === "2500" && params.get("orderid") === attemptId,
  );
  assert(params.get("time_limit") === "2026-09-05 18:00:00");
  assert(params.get("paytext")!.includes("Kapavietės priežiūros"));
  assert(params.get("test") === "0" && !url.href.includes(config.password));
  assert(
    !params.has("status"),
    "outbound request must not be replayable as paid callback",
  );
});

Deno.test("deadline follows Lithuania summer and winter offsets", () => {
  assert(
    payseraDeadline(new Date("2026-01-15T12:30:00Z")) === "2026-01-15 14:30:00",
  );
  assert(
    payseraDeadline(new Date("2026-07-15T12:30:00Z")) === "2026-07-15 15:30:00",
  );
});

Deno.test("callback validates signature, project, order, status and actual funds", () => {
  const result = verifyPayseraCallback(signed(), config);
  assert(
    result.amountCents === 2500 && result.status === 1 &&
      result.attemptId === attemptId,
  );
  const actual = verifyPayseraCallback(
    signed({ payamount: "2400", paycurrency: "EUR" }),
    config,
  );
  assert(actual.amountCents === 2400);
  const invalidFields: Record<string, string>[] = [
    { projectid: "999" },
    { orderid: "invalid" },
    { status: "9" },
    { amount: "-25" },
    { amount: "2.5" },
    { currency: "eur" },
    { test: "2" },
    { payamount: "2500" },
    { paycurrency: "EUR" },
  ];
  for (const fields of invalidFields) {
    rejects(() => verifyPayseraCallback(signed(fields), config));
  }
  rejects(() =>
    verifyPayseraCallback(signed(), { ...config, password: "wrong" })
  );
  rejects(() =>
    verifyPayseraCallback(
      signed().replace(/ss1=[a-f0-9]+/, "ss1=" + "0".repeat(32)),
      config,
    )
  );
  rejects(() =>
    verifyPayseraCallback(signed() + "&ss1=" + "0".repeat(32), config)
  );
  rejects(() => verifyPayseraCallback("x".repeat(16001), config));
});

Deno.test("duplicate signed inner fields cannot override the payment status", () => {
  const data = encodePaysera(
    new URLSearchParams(
      "projectid=123456&orderid=" + attemptId +
        "&amount=2500&currency=EUR&status=0&status=1&test=0",
    ),
  );
  const ss1 = createHash("md5").update(data + config.password).digest("hex");
  rejects(() =>
    verifyPayseraCallback(new URLSearchParams({ data, ss1 }).toString(), config)
  );
});

function dependencies(result = "accepted", test = false, fail = false) {
  const calls: Record<string, unknown>[] = [];
  const deps = {
    read: (
      name: string,
    ) => ({
      PAYSERA_PROJECT_ID: config.projectId,
      PAYSERA_SIGN_PASSWORD: config.password,
      PAYSERA_TEST: test ? "1" : "0",
    }[name] || ""),
    client: () => ({
      rpc: (name: string, args: Record<string, unknown>) => {
        assert(name === "process_paysera_service_payment");
        calls.push(args);
        return Promise.resolve({
          data: result,
          error: fail ? { code: "TEST" } : null,
        });
      },
    }),
  };
  return { deps, calls };
}

Deno.test("GET and POST callbacks acknowledge persisted payments with exactly OK", async () => {
  for (const method of ["GET", "POST"]) {
    const { deps, calls } = dependencies();
    const payload = signed();
    const request = new Request(
      "https://example.test/webhook" + (method === "GET" ? "?" + payload : ""),
      {
        method,
        ...(method === "POST" ? { body: payload } : {}),
      },
    );
    const response = await handlePayseraWebhook(request, deps);
    assert(response.status === 200 && await response.text() === "OK");
    assert(
      calls.length === 1 && calls[0].p_amount_cents === 2500 &&
        calls[0].p_test === false,
    );
  }
});

Deno.test("invalid signatures and sandbox callbacks never reach the live database", async () => {
  const { deps, calls } = dependencies();
  for (
    const payload of [
      signed({ test: "1" }),
      "data=bad&ss1=bad",
      "payment=success",
    ]
  ) {
    const response = await handlePayseraWebhook(
      new Request("https://example.test/?" + payload),
      deps,
    );
    assert(response.status === 400);
  }
  assert(calls.length === 0);
});

Deno.test("unmatched amounts and database failures are not acknowledged as success", async () => {
  for (
    const status of ["rejected_quote_or_amount", "not_found", "database_error"]
  ) {
    const { deps } = dependencies(status, false, status === "database_error");
    const response = await handlePayseraWebhook(
      new Request("https://example.test/?" + signed()),
      deps,
    );
    assert(response.status >= 400 && await response.text() !== "OK");
  }
});

Deno.test("missing credentials, unsupported methods and oversized bodies fail before DB access", async () => {
  const { deps, calls } = dependencies();
  assert(
    (await handlePayseraWebhook(
      new Request("https://example.test/", { method: "PUT" }),
      deps,
    )).status === 405,
  );
  assert(
    (await handlePayseraWebhook(
      new Request("https://example.test/", {
        method: "POST",
        headers: { "content-length": "16001" },
        body: "x",
      }),
      deps,
    )).status === 413,
  );
  assert(
    (await handlePayseraWebhook(new Request("https://example.test/"), {
      ...deps,
      read: () => "",
    })).status === 503,
  );
  assert(calls.length === 0);
});
