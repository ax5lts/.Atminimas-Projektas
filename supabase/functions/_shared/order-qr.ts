import { bytesToBase64 } from "./email.ts";

export async function orderQrAttachment(
  order: { id: string; puslapio_url?: string | null },
  supabaseUrl: string,
  fetcher: typeof fetch = fetch,
) {
  if (!order.puslapio_url) throw new Error("Užsakymas neturi QR paskirties nuorodos");
  const url = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/qr-code?data=${encodeURIComponent(order.puslapio_url)}&format=svg`;
  const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`QR generatorius grąžino ${response.status}`);
  const svg = await response.text();
  if (!response.headers.get("content-type")?.includes("image/svg+xml") || !/<svg[\s>]/i.test(svg) || svg.length > 5_000_000) {
    throw new Error("QR generatorius negrąžino SVG failo");
  }
  return { filename: `qr-${order.id}.svg`, content: bytesToBase64(new TextEncoder().encode(svg)) };
}
