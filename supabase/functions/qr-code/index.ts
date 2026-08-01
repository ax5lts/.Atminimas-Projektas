import QRCode from "npm:qrcode@1.5.4";
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

  if (!value || value.length > 2048 || !["png", "svg"].includes(format)) {
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
      !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)
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
