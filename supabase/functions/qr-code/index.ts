import QRCode from "npm:qrcode@1.5.4";
import { publicSiteUrl } from "../_shared/core.ts";

Deno.serve(async (request: Request) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { "Allow": "GET" },
    });
  }

  const requestUrl = new URL(request.url);
  const value = requestUrl.searchParams.get("data") || "";

  if (!value || value.length > 2048) {
    return new Response("Invalid QR value", { status: 400 });
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
      return new Response("Unsupported QR target", { status: 400 });
    }

    const svg = await QRCode.toString(value, {
      type: "svg",
      width: 1200,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });

    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Invalid QR target", { status: 400 });
  }
});
