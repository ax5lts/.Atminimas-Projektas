import { ORDER_COPY_EMAIL, orderDesignCopy, orderEmailRecipient, orderManufacturingText } from "./order-copy.ts";

Deno.test("seller's copy contains the saved color and numbered pattern for all twelve designs", () => {
  const copies = new Set<string>();
  for (const product_color of ["gold", "silver", "black"]) {
    for (const product_pattern of ["tree", "heart", "wings", "plain"]) {
      const lines = orderDesignCopy({ product_color, product_pattern });
      if (!lines[0].startsWith("Spalva: ") || !lines[1].includes("Variantas ") || lines[2] !== "Matmenys: 5 × 5 cm") {
        throw new Error("Incomplete seller copy");
      }
      copies.add(lines.join("\n"));
    }
  }
  if (copies.size !== 12) throw new Error("Designs must remain distinguishable");
});

Deno.test("forwardable plain QR copy uses the requested mailbox and saved variant without personal shipping details", () => {
  if (ORDER_COPY_EMAIL !== "atminimokodas@gmail.com") throw new Error("Wrong seller mailbox");
  const text = orderManufacturingText({ id: "test-order", product_color: "black", product_pattern: "plain", apmoketa: false });
  for (const expected of ["test-order", "Juodas plienas", "Variantas 1 – Tik QR kodas", "5 × 5 cm", "nepradėti"]) {
    if (!text.includes(expected)) throw new Error(`Copy missing ${expected}`);
  }
  if (text.includes("Žvaigždė")) throw new Error("Plain QR must not contain the retired ornament");
  const approved = orderManufacturingText({ id: "test-order", product_color: "gold", product_pattern: "plain", apmoketa: true, customer_approved_at: "2026-09-09" });
  if (!approved.includes("Gamyba: klientas patvirtino")) throw new Error("Approval missing");
});

Deno.test("order-created copy always goes to seller even when the event contains customer email", () => {
  if (orderEmailRecipient(true, "seller@example.test", "customer@example.test") !== "seller@example.test") throw new Error("Incorrect copy recipient");
  if (orderEmailRecipient(true, "", "customer@example.test") !== "") throw new Error("Missing seller must never fall back to customer");
  if (orderEmailRecipient(false, "seller@example.test", null, "customer@example.test") !== "customer@example.test") throw new Error("Customer event routing changed");
});

Deno.test("old orders do not receive an invented design", () => {
  const lines = orderDesignCopy({});
  if (lines.length !== 1 || !lines[0].includes("nenurodytas")) throw new Error("Historical design must be marked unknown");
});
