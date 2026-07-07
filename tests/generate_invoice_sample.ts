import { createInvoicePdf } from "../supabase/functions/_shared/invoice-pdf.ts";

const output = Deno.args[0];
if (!output) throw new Error("Output path required");
const bytes = await createInvoicePdf({
  number: "ATM-2026-000001",
  documentType: "payment_confirmation",
  issueDate: "2026-07-07",
  seller: {
    legal_name: "Atminimas bandomieji rekvizitai",
    activity_form: "Individuali veikla",
    registration_code: "000000",
    address: "Vilnius, Lietuva",
    email: "pagalba@example.lt",
  },
  buyer: { name: "Vardenis Pavardenis", email: "klientas@example.lt", address: "Omniva, Vilnius, Bandomasis paštomatas" },
  productName: "Metalo QR atminimo ženkliukas",
  subtotalCents: 5900,
  shippingCents: 300,
  totalCents: 6200,
  currency: "EUR",
});
await Deno.writeFile(output, bytes);
