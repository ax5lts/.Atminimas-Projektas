import { adminClient, env } from "../_shared/core.ts";
import { handleModernWebhook } from "../_shared/paysera-modern.ts";
import { payseraConfig, verifyPayseraCallback } from "../_shared/paysera.ts";

function reply(text: string, status = 200) {
  return new Response(text, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

type Dependencies = {
  read: (name: string) => string;
  client: () => {
    rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
      data: unknown;
      error: { code?: string } | null;
    }>;
  };
};

export async function handlePayseraWebhook(
  request: Request,
  dependencies: Dependencies = {
    read: (name: string) => env(name, false),
    client: adminClient,
  },
) {
  if (!["GET", "POST"].includes(request.method)) {
    return reply("Method not allowed", 405);
  }
  if (Number(request.headers.get("content-length") || 0) > 16000) {
    return reply("Payload too large", 413);
  }
  let config;
  try {
    config = payseraConfig(dependencies.read);
  } catch {
    return reply("Payments are not configured", 503);
  }
  let callback;
  try {
    const raw = request.method === "GET"
      ? new URL(request.url).search.slice(1)
      : await request.text();
    callback = verifyPayseraCallback(raw, config);
  } catch {
    return reply("Invalid callback", 400);
  }
  // A live deployment must never accept sandbox callbacks, or vice versa.
  if (callback.test !== config.test) return reply("Invalid payment mode", 400);
  try {
    const { data, error } = await dependencies.client().rpc(
      "process_paysera_service_payment",
      {
        p_attempt_id: callback.attemptId,
        p_project_id: callback.projectId,
        p_event_id: callback.eventId,
        p_reference: callback.reference,
        p_status: callback.status,
        p_amount_cents: callback.amountCents,
        p_currency: callback.currency,
        p_test: callback.test,
      },
    );
    if (error) {
      console.error("Paysera callback database failure", error.code);
      return reply("Processing failed", 500);
    }
    if (data === "rejected_quote_or_amount" || data === "not_found") {
      return reply("Payment does not match the order", 409);
    }
    if (data !== "accepted" && data !== "recorded") {
      return reply("Processing failed", 500);
    }
    // Acknowledge only after the transaction has committed, including safe retries.
    return reply("OK");
  } catch {
    return reply("Processing failed", 500);
  }
}

if (import.meta.main) {
  Deno.serve((request) =>
    request.headers.has("x-paysera-signature") ||
      request.headers.get("content-type")?.includes("application/json")
      ? handleModernWebhook(request)
      : handlePayseraWebhook(request)
  );
}
