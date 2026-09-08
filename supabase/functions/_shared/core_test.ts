import { readJson, RequestError } from "./core.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function rejectsWithStatus(
  action: () => Promise<unknown>,
  status: number,
) {
  try {
    await action();
  } catch (error) {
    assert(error instanceof RequestError, "expected a safe request error");
    assert(
      error.status === status,
      `expected HTTP ${status}, got ${error.status}`,
    );
    return;
  }
  throw new Error(`expected HTTP ${status}`);
}

Deno.test("readJson preserves empty bodies and object input", async () => {
  const empty = await readJson(
    new Request("https://test.invalid", { method: "POST" }),
  );
  assert(Object.keys(empty).length === 0, "empty body should remain an object");
  const parsed = await readJson(
    new Request("https://test.invalid", {
      method: "POST",
      body: '{"ok":true}',
    }),
  );
  assert(parsed.ok === true, "object should be parsed");
});

Deno.test("readJson handles UTF-8 characters split between chunks at byte limit", async () => {
  const encoded = new TextEncoder().encode('{"name":"Ąžuolas"}');
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === encoded.length) controller.close();
      else controller.enqueue(encoded.slice(offset, ++offset));
    },
  });
  const result = await readJson(
    new Request("https://test.invalid", {
      method: "POST",
      body,
    }),
    encoded.length,
  );
  assert(
    result.name === "Ąžuolas",
    "split multibyte characters should decode correctly",
  );
});

Deno.test("readJson cancels oversized chunked input before reading the rest", async () => {
  let reads = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      reads += 1;
      controller.enqueue(new Uint8Array(8));
    },
    cancel() {
      cancelled = true;
    },
  }, { highWaterMark: 0 });
  const request = new Request("https://test.invalid", { method: "POST", body });
  await rejectsWithStatus(() => readJson(request, 10), 413);
  assert(
    reads === 2,
    "oversized stream should stop at its first excessive chunk",
  );
  assert(cancelled, "remaining request input must be cancelled");
  assert(!body.locked, "reader lock must be released after rejection");
});

Deno.test("readJson rejects declared oversize before consuming input", async () => {
  const request = new Request("https://test.invalid", {
    method: "POST",
    headers: { "Content-Length": "100" },
    body: "{}",
  });
  await rejectsWithStatus(() => readJson(request, 10), 413);
  assert(!request.bodyUsed, "declared excessive input should not be read");
});

Deno.test("readJson counts UTF-8 bytes and rejects invalid JSON shapes", async () => {
  await rejectsWithStatus(() =>
    readJson(
      new Request("https://test.invalid", {
        method: "POST",
        body: '{"x":"ą"}',
      }),
      9,
    ), 413);
  for (const body of ["null", "[]", "true", "{broken}"]) {
    await rejectsWithStatus(() =>
      readJson(
        new Request("https://test.invalid", {
          method: "POST",
          body,
        }),
      ), 400);
  }
});
