import { createHash, timingSafeEqual } from "node:crypto";

export type PayseraConfig = {
  projectId: string;
  password: string;
  test: boolean;
};

export function payseraConfig(read: (name: string) => string): PayseraConfig {
  const projectId = read("PAYSERA_PROJECT_ID").trim();
  const password = read("PAYSERA_SIGN_PASSWORD").trim();
  const mode = read("PAYSERA_TEST").trim();
  // Require an explicit mode: missing configuration must never enable live payments.
  if (
    !/^[1-9][0-9]{0,10}$/.test(projectId) || !password || !/^[01]$/.test(mode)
  ) {
    throw new Error("Paysera configuration is incomplete");
  }
  return { projectId, password, test: mode === "1" };
}

function digest(value: string, algorithm = "md5") {
  // Checkout Classic requires MD5(data + project password), per Paysera's protocol.
  return createHash(algorithm).update(value, "utf8").digest("hex");
}

export function encodePaysera(params: URLSearchParams) {
  return btoa(params.toString()).replace(/\+/g, "-").replace(/\//g, "_");
}

export function payseraDeadline(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vilnius",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${
    part("minute")
  }:${part("second")}`;
}

export function createPayseraCheckout(config: PayseraConfig, payment: {
  attemptId: string;
  amountCents: number;
  currency: string;
  acceptUrl: string;
  cancelUrl: string;
  callbackUrl: string;
  expiresAt: Date;
  email?: string;
}) {
  if (
    !/^[0-9a-f-]{36}$/.test(payment.attemptId) ||
    !Number.isSafeInteger(payment.amountCents) || payment.amountCents <= 0 ||
    payment.amountCents > 100000000 || payment.currency !== "EUR" ||
    !Number.isFinite(payment.expiresAt.valueOf())
  ) {
    throw new Error("Invalid Paysera payment");
  }
  for (
    const value of [payment.acceptUrl, payment.cancelUrl, payment.callbackUrl]
  ) {
    const url = new URL(value);
    if (
      url.protocol !== "https:" || url.username || url.password ||
      value.length > 255
    ) {
      throw new Error("Invalid Paysera return URL");
    }
  }
  const params = new URLSearchParams({
    projectid: config.projectId,
    orderid: payment.attemptId,
    amount: String(payment.amountCents),
    currency: payment.currency,
    accepturl: payment.acceptUrl,
    cancelurl: payment.cancelUrl,
    callbackurl: payment.callbackUrl,
    version: "1.8",
    lang: "LIT",
    country: "LT",
    test: config.test ? "1" : "0",
    time_limit: payseraDeadline(payment.expiresAt),
    paytext:
      "Kapavietės priežiūros paslaugos, užsakymas [order_nr], [site_name]",
  });
  if (payment.email) params.set("p_email", payment.email);
  const data = encodePaysera(params);
  return "https://www.paysera.com/pay/?" + new URLSearchParams({
    data,
    sign: digest(data + config.password),
  }).toString();
}

function uniqueParams(params: URLSearchParams) {
  for (const key of params.keys()) {
    if (params.getAll(key).length !== 1) {
      throw new Error("Duplicate callback parameter");
    }
  }
  return params;
}

export function verifyPayseraCallback(raw: string, config: PayseraConfig) {
  if (new TextEncoder().encode(raw).length > 16000) {
    throw new Error("Callback too large");
  }
  const outer = uniqueParams(new URLSearchParams(raw));
  const data = outer.get("data") || "";
  const signature = outer.get("ss1") || "";
  if (
    !/^[A-Za-z0-9_-]+={0,2}$/.test(data) || !/^[a-f0-9]{32}$/i.test(signature)
  ) {
    throw new Error("Invalid callback signature");
  }
  const expected = new TextEncoder().encode(digest(data + config.password));
  if (
    !timingSafeEqual(
      expected,
      new TextEncoder().encode(signature.toLowerCase()),
    )
  ) {
    throw new Error("Invalid callback signature");
  }
  const params = uniqueParams(
    new URLSearchParams(atob(data.replace(/-/g, "+").replace(/_/g, "/"))),
  );
  if (
    params.get("projectid") !== config.projectId ||
    !/^[0-4]$/.test(params.get("status") || "") ||
    !/^[01]$/.test(params.get("test") || "")
  ) throw new Error("Invalid callback project or status");
  const attemptId = params.get("orderid") || "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(attemptId)
  ) {
    throw new Error("Invalid callback order");
  }
  // When supplied, payamount/paycurrency describe the actual funds received.
  const actual = params.has("payamount") || params.has("paycurrency");
  const amount = params.get(actual ? "payamount" : "amount") || "";
  const currency = params.get(actual ? "paycurrency" : "currency") || "";
  if (!/^[0-9]{1,9}$/.test(amount) || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Invalid callback amount");
  }
  return {
    attemptId,
    projectId: config.projectId,
    test: params.get("test") === "1",
    status: Number(params.get("status")),
    amountCents: Number(amount),
    currency,
    eventId: digest(data, "sha256"),
    reference: (params.get("requestid") || attemptId).slice(0, 255),
  };
}
