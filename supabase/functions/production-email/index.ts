import {
  handleOptions,
  json,
  readJson,
  RequestError,
  requireUser,
} from "../_shared/core.ts";
import { bytesToBase64, sendEmail } from "../_shared/email.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { Allow: "POST, OPTIONS" });
  }

  try {
    const { client, user } = await requireUser(request);
    const { data: role } = await client.from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (role?.role !== "admin") {
      return json({ error: "Prieiga draudžiama" }, 403);
    }

    const body = await readJson(request, 8_000);
    const orderId = String(body.order_id || "").trim();
    const resend = body.resend === true;
    if (!UUID_PATTERN.test(orderId)) {
      throw new RequestError("Neteisingas užsakymo numeris", 400);
    }

    const [{ data: business, error: businessError }, { data: job, error: jobError }] =
      await Promise.all([
        client.from("business_profile").select(
          "manufacturer_name,manufacturer_email,email",
        ).eq("singleton", true).maybeSingle(),
        client.from("production_jobs").select(
          "id,order_id,qr_svg_path,manufacturer_email_sent_at",
        ).eq("order_id", orderId).maybeSingle(),
      ]);
    if (businessError) throw businessError;
    if (jobError) throw jobError;
    if (!business?.manufacturer_email) {
      throw new RequestError(
        "Pirmiausia nustatymuose įrašykite gamintojo el. paštą",
        409,
      );
    }
    if (!job?.qr_svg_path) {
      throw new RequestError("Gamybos SVG failas dar neparuoštas", 409);
    }
    if (job.manufacturer_email_sent_at && !resend) {
      throw new RequestError(
        "SVG jau buvo išsiųstas. Pakartotinį siuntimą patvirtinkite atskirai.",
        409,
      );
    }

    const [{ data: order, error: orderError }, { data: svgBlob, error: svgError }] =
      await Promise.all([
        client.from("uzsakymai").select("id,product_type")
          .eq("id", orderId).maybeSingle(),
        client.storage.from("automation-documents").download(job.qr_svg_path),
      ]);
    if (orderError || !order) {
      throw orderError || new Error("Užsakymas nerastas");
    }
    if (svgError || !svgBlob) {
      throw svgError || new Error("SVG failo atidaryti nepavyko");
    }

    const { data: product } = await client.from("product_catalog").select(
      "name",
    ).eq("id", order.product_type).maybeSingle();
    const svgBytes = new Uint8Array(await svgBlob.arrayBuffer());
    const svgText = new TextDecoder().decode(svgBytes.subarray(0, 1_024));
    if (
      svgBytes.byteLength === 0 ||
      svgBytes.byteLength > 5_000_000 ||
      !/<svg[\s>]/i.test(svgText)
    ) {
      throw new Error("Paruoštas failas nėra tinkamas SVG");
    }

    const sent = await sendEmail({
      to: business.manufacturer_email,
      replyTo: business.email || undefined,
      subject: `Gamybos SVG #${orderId.slice(0, 8).toUpperCase()}`,
      heading: "QR kodas lentelės gamybai",
      paragraphs: [
        `Užsakymas: #${orderId.slice(0, 8).toUpperCase()}`,
        `Produktas: ${product?.name || order.product_type}`,
        "Spaudai ir graviravimui naudokite pridėtą SVG failą. Nekeiskite balto tarpo aplink QR kodą.",
      ],
      attachments: [{
        filename: `atminimas-${orderId.slice(0, 8)}-qr.svg`,
        content: bytesToBase64(svgBytes),
      }],
      idempotencyKey: resend
        ? `manufacturer:${orderId}:${crypto.randomUUID()}`
        : `manufacturer:${orderId}:initial`,
      orderId,
      recipientKind: "manufacturer",
      category: "production.manufacturer_svg",
    });

    const sentAt = new Date().toISOString();
    const { error: updateError } = await client.from("production_jobs").update({
      manufacturer_email_recipient: business.manufacturer_email,
      manufacturer_email_sent_at: sentAt,
      updated_at: sentAt,
    }).eq("id", job.id);
    if (updateError) throw updateError;

    return json({
      ok: true,
      sent_at: sentAt,
      recipient: business.manufacturer_email,
      provider_id: typeof sent?.id === "string" ? sent.id : null,
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return json({ error: error.message }, error.status);
    }
    const message = error instanceof Error ? error.message : "";
    if (/^(Authentication required|Invalid session)$/i.test(message)) {
      return json({ error: "Prisijungimo sesija nebegalioja" }, 401);
    }
    console.error("production-email failed", error);
    return json({ error: "SVG gamintojui išsiųsti nepavyko" }, 500);
  }
});
