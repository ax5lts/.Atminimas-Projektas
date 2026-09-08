export const ORDER_COPY_EMAIL = "atminimokodas@gmail.com";

const colors: Record<string, string> = {
  gold: "Aukso spalvos plienas", silver: "Sidabrinis plienas", black: "Juodas plienas",
};
const patterns: Record<string, string> = {
  tree: "Variantas 1 – Gyvybės medis", heart: "Variantas 2 – Širdis ir žvakė",
  wings: "Variantas 3 – Angelo sparnai", plain: "Variantas 4 – Tik QR kodas",
  star: "Ankstesnis variantas 4 – Žvaigždė ir šakelė",
};

export function orderDesignCopy(order: { product_color?: unknown; product_pattern?: unknown } | null): string[] {
  if (!order?.product_color || !order.product_pattern) return ["Lentelės dizainas: senesniame užsakyme nenurodytas."];
  return [
    `Spalva: ${colors[String(order.product_color)] || "Nenurodyta"}`,
    `Raštas: ${patterns[String(order.product_pattern)] || "Nenurodytas"}`,
    "Matmenys: 5 × 5 cm",
  ];
}

export function orderEmailRecipient(adminEvent: boolean, adminEmail: string, eventEmail?: string | null, customerEmail?: string | null): string {
  // An order-created event can contain the customer's address; its copy belongs to the seller.
  return adminEvent ? adminEmail : (eventEmail || customerEmail || "");
}

export function orderManufacturingText(order: {
  id: string; product_color?: unknown; product_pattern?: unknown;
  puslapio_url?: string | null; apmoketa?: boolean; customer_approved_at?: string | null;
}): string {
  return [
    "ATMINIMAS – UŽSAKYMO KOPIJA",
    `Užsakymo numeris: ${order.id}`,
    "Gaminys: plieninė QR atminimo lentelė",
    "Kiekis: 1 vnt.",
    ...orderDesignCopy(order),
    `Mokėjimas: ${order.apmoketa ? "gautas" : "dar negautas"}`,
    `Gamyba: ${order.apmoketa && order.customer_approved_at ? "klientas patvirtino" : "nepradėti, kol klientas nepatvirtino ir neapmokėjo"}`,
    ...(order.puslapio_url ? [`QR paskirties nuoroda: ${order.puslapio_url}`] : []),
    "Gamybai naudokite tik šiam užsakymui paruoštą QR, ne parduotuvės pavyzdį.",
  ].join("\r\n");
}
