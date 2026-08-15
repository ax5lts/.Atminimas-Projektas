import { handleOptions, json } from "../_shared/core.ts";

// Product payments are intentionally disabled while Atminimas accepts only
// non-binding preorders. Keeping this endpoint explicit prevents an old client
// or bookmarked checkout page from creating a new payment session.
Deno.serve((request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  return json({
    error:
      "Šiuo metu priimame tik išankstinius užsakymus be mokėjimo.",
    preorder_url: "/isankstinis-uzsakymas.html",
    payment_enabled: false,
  }, 409);
});
