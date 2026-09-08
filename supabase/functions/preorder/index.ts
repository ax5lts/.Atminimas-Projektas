import { handleOptions, json } from "../_shared/core.ts";

Deno.serve((request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  return json({
    error: "Išankstinių užsakymų nebepriimame. Pasirinkite QR lentelę parduotuvėje ir apmokėkite per Paysera.",
    shop_url: "/parduotuve.html",
  }, 410);
});
