import { handleOptions, json, readJson, RequestError } from "../_shared/core.ts";
import { startProductPayment } from "../_shared/paysera-products.ts";

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    return json(await startProductPayment(request, await readJson(request, 8_000)));
  } catch (error) {
    return json({ error: error instanceof RequestError ? error.message : "Mokėjimo paruošti nepavyko" }, error instanceof RequestError ? error.status : 500);
  }
});
