import { handleQrRequest } from "./index.ts";
import jpeg from "npm:jpeg-js@0.4.4";
import pngjs from "npm:pngjs@5.0.0";
import jsQR from "npm:jsqr@1.4.0";
import { Buffer } from "node:buffer";
const decodeQR = jsQR as unknown as (pixels: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
const target = "https://atminimokodas.lt/sablonas-viskas.html?slug=Romaldas-Rimaitis";
function request(value: string, format: string) {
  return new Request(`https://example.supabase.co/functions/v1/qr-code?data=${encodeURIComponent(value)}&format=${format}`);
}
for (const format of ["png", "jpg", "jpeg", "svg"]) {
  Deno.test(`current domain produces a downloadable ${format} QR`, async () => {
    const response = await handleQrRequest(request(target, format));
    if (response.status !== 200) throw new Error(await response.text());
    const extension = format === "jpeg" ? "jpg" : format;
    if (!response.headers.get("content-disposition")?.includes(`atminimas-qr.${extension}`)) throw new Error("Missing download filename");
    if (format === "svg") {
      if (!response.headers.get("content-type")?.includes("image/svg+xml") || !(await response.text()).includes("<svg")) throw new Error("Invalid SVG");
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer());
      const raster = format === "png" ? pngjs.PNG.sync.read(Buffer.from(bytes)) : jpeg.decode(bytes, { useTArray: true });
      if (raster.width !== 1200 || raster.height !== 1200) throw new Error("Wrong dimensions");
      const decoded = decodeQR(new Uint8ClampedArray(raster.data), raster.width, raster.height);
      if (decoded?.data !== target) throw new Error("QR does not scan to the expected memorial page");
    }
  });
}
Deno.test("QR endpoint rejects unrelated domains, paths and missing identifiers", async () => {
  for (const value of ["https://evil.invalid/sablonas-viskas.html?slug=test", "https://atminimokodas.lt/admin.html?slug=test", "https://atminimokodas.lt/sablonas-viskas.html"]) {
    if ((await handleQrRequest(request(value,"png"))).status !== 400) throw new Error("Unsafe target accepted");
  }
});
