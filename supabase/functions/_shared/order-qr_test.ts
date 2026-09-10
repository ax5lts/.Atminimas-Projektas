import { orderQrAttachment } from "./order-qr.ts";
const order = { id: "example-order", puslapio_url: "https://atminimokodas.lt/sablonas-viskas.html?slug=example" };
Deno.test("order copy requests the actual page QR in SVG and attaches original bytes", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>';
  const attachment = await orderQrAttachment(order, "https://example.supabase.co/", (async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get("format") !== "svg" || url.searchParams.get("data") !== order.puslapio_url) throw new Error("Wrong QR request");
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8" } });
  }) as typeof fetch);
  if (attachment.filename !== "qr-example-order.svg" || atob(attachment.content) !== svg) throw new Error("Wrong attachment");
});
Deno.test("order copy refuses an error page or a raster image renamed as SVG", async () => {
  for (const response of [new Response("error", { status: 400 }), new Response("PNG", { headers: { "Content-Type": "image/png" } })]) {
    let denied = false;
    try { await orderQrAttachment(order, "https://example.supabase.co", (async () => response) as typeof fetch); } catch { denied = true; }
    if (!denied) throw new Error("Invalid QR attachment accepted");
  }
});
