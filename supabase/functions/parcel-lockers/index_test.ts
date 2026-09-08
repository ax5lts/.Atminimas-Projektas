import { createParcelLockerHandler } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function request(carrier = "omniva", method = "GET") {
  return new Request(`https://test.invalid?carrier=${carrier}`, { method });
}

const sample = [
  {
    id: "v",
    title: "Vilniaus terminalas",
    address: "Vilnius",
    city: "Vilnius",
    country: "LT",
  },
  {
    id: "k",
    title: "Kauno terminalas",
    address: "Kaunas",
    city: "Kaunas",
    country: "LT",
  },
];

Deno.test("parcel lockers coalesce concurrent requests and cache serialized results", async () => {
  let calls = 0;
  let now = 0;
  const handler = createParcelLockerHandler({
    now: () => now,
    fetcher: (() => {
      calls += 1;
      return Promise.resolve(Response.json(sample));
    }) as typeof fetch,
  });
  const responses = await Promise.all([
    handler(request()),
    handler(request()),
    handler(request()),
  ]);
  assert(calls === 1, "concurrent requests should share one upstream call");
  const contents = await Promise.all(
    responses.map((response) => response.text()),
  );
  assert(
    contents.every((body) => body === contents[0]),
    "all callers need readable matching bodies",
  );
  now = 30 * 60 * 1000;
  const cached = await handler(request());
  assert(calls === 1, "warm requests should reuse the cached result");
  assert(
    cached.headers.get("Cache-Control")?.includes("max-age=1800"),
    "downstream caching must not extend source freshness",
  );
  now = 60 * 60 * 1000;
  await handler(request());
  assert(Number(calls) === 2, "an expired list should refresh");
  await handler(request("dpd"));
  assert(Number(calls) === 3, "different carriers must keep separate lists");
});

Deno.test("parcel lockers preserve usable rows when the source has malformed entries", async () => {
  const handler = createParcelLockerHandler({
    fetcher: (() =>
      Promise.resolve(Response.json([
        null,
        false,
        [],
        "invalid",
        ...sample,
        { id: "lv", title: "Riga", city: "Riga", country: "LV" },
        { id: "missing-title", city: "Kaunas" },
      ]))) as typeof fetch,
  });
  const response = await handler(request());
  const result = await response.json();
  assert(
    response.status === 200,
    "one bad source row should not break the list",
  );
  assert(
    result.lockers.length === 2,
    "only usable Lithuanian rows should remain",
  );
  assert(result.lockers[0].city === "Kaunas", "cities must remain sorted");
  assert(
    result.lockers[0].address === "",
    "Omniva's city mapping should be preserved",
  );
});

Deno.test("parcel lockers release failed requests so the next request can retry", async () => {
  let calls = 0;
  const handler = createParcelLockerHandler({
    fetcher: (() => {
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? new Response("offline", { status: 503 })
          : Response.json(sample),
      );
    }) as typeof fetch,
  });
  const failed = await Promise.all([handler(request()), handler(request())]);
  assert(
    failed.every((response) => response.status === 502),
    "concurrent failures should return safe errors",
  );
  assert(calls === 1, "concurrent failures should share one upstream call");
  assert(
    failed[0].headers.get("Cache-Control") === "no-store",
    "failures should not be cached",
  );
  assert(
    (await handler(request())).status === 200,
    "a failed promise must not poison later requests",
  );
  assert(Number(calls) === 2, "the next request should retry once");
});

Deno.test("parcel lockers reject unsupported carriers and methods without upstream work", async () => {
  const handler = createParcelLockerHandler({
    fetcher: (() => {
      throw new Error("unexpected fetch");
    }) as typeof fetch,
  });
  for (const carrier of ["", "constructor", "__proto__", "unknown"]) {
    assert(
      (await handler(request(carrier))).status === 400,
      "unsupported carriers must be rejected",
    );
  }
  assert(
    (await handler(request("omniva", "POST"))).status === 405,
    "POST should be rejected",
  );
  assert(
    (await handler(request("omniva", "OPTIONS"))).status === 204,
    "preflight should succeed",
  );
});
