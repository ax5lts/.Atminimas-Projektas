import QRCode from "npm:qrcode@1.5.4";
import jpeg from "npm:jpeg-js@0.4.4";
import {
  CORS_HEADERS,
  handleOptions,
  publicSiteUrl,
} from "../_shared/core.ts";

function responseHeaders(extra: Record<string, string> = {}) {
  return {
    ...CORS_HEADERS,
    "Content-Security-Policy": "default-src 'none'",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
}

function createJpeg(value: string): Uint8Array<ArrayBuffer> {
  const width = 1200;
  const margin = 4;
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" }) as {
    modules: { size: number; get: (row: number, column: number) => boolean };
  };
  const moduleCount = qr.modules.size;
  const scale = Math.floor(width / (moduleCount + margin * 2));
  const renderedSize = (moduleCount + margin * 2) * scale;
  const offset = Math.floor((width - renderedSize) / 2) + margin * scale;
  const rgba = new Uint8Array(width * width * 4);
  rgba.fill(255);

  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      const startX = offset + column * scale;
      const startY = offset + row * scale;
      for (let y = startY; y < startY + scale; y += 1) {
        for (let x = startX; x < startX + scale; x += 1) {
          const pixel = (y * width + x) * 4;
          rgba[pixel] = 0;
          rgba[pixel + 1] = 0;
          rgba[pixel + 2] = 0;
        }
      }
    }
  }

  const encoded = jpeg.encode({ data: rgba, width, height: width }, 95).data;
  const output = new Uint8Array(encoded.byteLength);
  output.set(encoded);
  return output;
}

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: responseHeaders({ "Allow": "GET, OPTIONS" }),
    });
  }

  const requestUrl = new URL(request.url);
  const value = requestUrl.searchParams.get("data") || "";
  const format = requestUrl.searchParams.get("format") || "png";

  if (
    !value ||
    value.length > 2048 ||
    !["png", "jpg", "jpeg", "svg"].includes(format)
  ) {
    return new Response("Invalid QR value", {
      status: 400,
      headers: responseHeaders(),
    });
  }

  try {
    const target = new URL(value);
    const expected = new URL("sablonas-viskas.html", publicSiteUrl());
    const slug = target.searchParams.get("slug");
    if (
      target.protocol !== "https:" ||
      target.origin !== expected.origin ||
      target.pathname !== expected.pathname ||
      !slug ||
      !/^[a-z0-9][a-z0-9-]{0,99}$/i.test(slug)
    ) {
      return new Response("Unsupported QR target", {
        status: 400,
        headers: responseHeaders(),
      });
    }

    if (format === "svg") {
      const svg = await QRCode.toString(value, {
        type: "svg",
        width: 1200,
        margin: 4,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });

      return new Response(svg, {
        status: 200,
        headers: responseHeaders({
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Content-Disposition": 'attachment; filename="atminimas-qr.svg"',
          "Cache-Control": "public, max-age=86400",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'",
        }),
      });
    }

    if (format === "jpg" || format === "jpeg") {
      const jpg = createJpeg(value);
      return new Response(jpg, {
        status: 200,
        headers: responseHeaders({
          "Content-Type": "image/jpeg",
          "Content-Disposition": 'attachment; filename="atminimas-qr.jpg"',
          "Cache-Control": "public, max-age=86400",
        }),
      });
    }

    const dataUrl = await QRCode.toDataURL(value, {
      type: "image/png",
      width: 1200,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
    const encoded = dataUrl.split(",", 2)[1];
    if (!encoded) throw new Error("PNG generation failed");
    const png = Uint8Array.from(
      atob(encoded),
      (character) => character.charCodeAt(0),
    );

    return new Response(png, {
      status: 200,
      headers: responseHeaders({
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="atminimas-qr.png"',
        "Cache-Control": "public, max-age=86400",
      }),
    });
  } catch {
    return new Response("Invalid QR target", {
      status: 400,
      headers: responseHeaders(),
    });
  }
});
