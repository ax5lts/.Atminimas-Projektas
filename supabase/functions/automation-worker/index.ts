import { adminClient, BlockedAutomationError, env, json, publicSiteUrl, requireAutomationSecret, retryDelay } from "../_shared/core.ts";
import { bytesToBase64, sendEmail } from "../_shared/email.ts";
import { createInvoicePdf, sha256Hex } from "../_shared/invoice-pdf.ts";
import { createShipment } from "../_shared/shipping.ts";

type AutomationEvent = {
  id: number;
  event_key: string;
  event_type: string;
  order_id?: string | null;
  recipient_email?: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

const client = adminClient();

async function orderDetails(orderId: string) {
  const { data, error } = await client.from("uzsakymai")
    .select("*,profiliai!inner(id,vardas,pavarde,owner_id)")
    .eq("id", orderId).maybeSingle();
  if (error || !data) throw error || new Error("Užsakymas nerastas");
  const { data: product } = await client.from("product_catalog").select("name").eq("id", data.product_type).maybeSingle();
  return { ...data, product_catalog: product };
}

async function processInvoice(event: AutomationEvent) {
  if (!event.order_id) throw new Error("Trūksta užsakymo numerio");
  const order = await orderDetails(event.order_id);
  const { data: business, error: businessError } = await client.from("business_profile").select("*").eq("singleton", true).maybeSingle();
  if (businessError) throw businessError;
  if (!business?.ready_for_invoicing) throw new BlockedAutomationError("Neužpildyti rekvizitai arba nepatvirtintas dokumento tipas");
  if (!order.recipient_email) throw new BlockedAutomationError("Užsakymas neturi gavėjo el. pašto");

  const seller = {
    legal_name: business.legal_name,
    activity_form: business.activity_form,
    registration_code: business.registration_code,
    vat_code: business.vat_code,
    address: business.address,
    email: business.email,
    phone: business.phone,
  };
  const buyer = {
    name: order.recipient_name,
    email: order.recipient_email,
    address: [order.carrier, order.city, order.parcel_terminal].filter(Boolean).join(", "),
  };
  let { data: invoice } = await client.from("invoice_documents").select("*").eq("order_id", order.id).maybeSingle();
  if (!invoice) {
    const { data, error } = await client.rpc("create_invoice_record", {
      p_order_id: order.id,
      p_document_type: business.invoice_document_type,
      p_seller_snapshot: seller,
      p_buyer_snapshot: buyer,
    });
    if (error) throw error;
    invoice = data;
  }

  let pdfBytes: Uint8Array;
  let storagePath = invoice.storage_path as string | null;
  if (storagePath) {
    const { data, error } = await client.storage.from("automation-documents").download(storagePath);
    if (error || !data) throw error || new Error("Nepavyko įkelti sąskaitos PDF");
    pdfBytes = new Uint8Array(await data.arrayBuffer());
  } else {
    pdfBytes = await createInvoicePdf({
      number: invoice.invoice_number,
      documentType: invoice.document_type,
      issueDate: invoice.issue_date,
      seller,
      buyer,
      productName: order.product_catalog?.name || "QR atminimo ženkliukas",
      subtotalCents: invoice.subtotal_cents,
      shippingCents: invoice.shipping_cents,
      totalCents: invoice.total_cents,
      currency: invoice.currency,
    });
    storagePath = `invoices/${order.id}/${invoice.invoice_number}.pdf`;
    const { error: uploadError } = await client.storage.from("automation-documents").upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (uploadError) throw uploadError;
    const hash = await sha256Hex(pdfBytes);
    const { error: updateError } = await client.from("invoice_documents").update({ storage_path: storagePath, sha256: hash }).eq("id", invoice.id);
    if (updateError) throw updateError;
  }

  await sendEmail({
    to: order.recipient_email,
    subject: `Jūsų dokumentas ${invoice.invoice_number}`,
    heading: "Mokėjimo dokumentas paruoštas",
    paragraphs: ["Ačiū. Mokėjimas gautas, o užsakymo dokumentas pridėtas prie šio laiško.", `Užsakymas: ${order.id}`],
    actionUrl: `${publicSiteUrl()}vartotojas.html`,
    actionLabel: "Atidaryti kliento zoną",
    attachments: [{ filename: `${invoice.invoice_number}.pdf`, content: bytesToBase64(pdfBytes) }],
    idempotencyKey: event.event_key,
  });
  await client.from("invoice_documents").update({ emailed_at: new Date().toISOString() }).eq("id", invoice.id);
}

async function processQr(event: AutomationEvent) {
  if (!event.order_id) throw new Error("Trūksta užsakymo numerio");
  const order = await orderDetails(event.order_id);
  const qrUrl = `${env("SUPABASE_URL")}/functions/v1/qr-code?data=${encodeURIComponent(order.puslapio_url)}`;
  const response = await fetch(qrUrl);
  if (!response.ok) throw new Error(`QR generatorius grąžino ${response.status}`);
  const svg = await response.text();
  const path = `production/${order.id}/qr.svg`;
  const { error: uploadError } = await client.storage.from("automation-documents").upload(path, new TextEncoder().encode(svg), {
    contentType: "image/svg+xml",
    upsert: true,
  });
  if (uploadError) throw uploadError;
  const { error: updateError } = await client.from("production_jobs").update({ status: "qr_ready", qr_svg_path: path }).eq("order_id", order.id);
  if (updateError) throw updateError;

  const adminEmail = env("ADMIN_EMAIL", false);
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: `QR paruoštas gamybai #${order.id.slice(0, 8)}`,
      heading: "Naujas darbas gamybos eilėje",
      paragraphs: [`Produktas: ${order.product_catalog?.name || order.product_type}`, `Klientas patvirtino užsakymą ${order.id}.`],
      actionUrl: `${publicSiteUrl()}admin.html`,
      actionLabel: "Atidaryti gamybos eilę",
      idempotencyKey: `${event.event_key}:admin`,
    });
  }
}

async function processEmailEvent(event: AutomationEvent) {
  const order = event.order_id ? await orderDetails(event.order_id) : null;
  const adminEvent = event.event_type.startsWith("admin.") || event.event_type === "order.created";
  const recipient = event.recipient_email || (adminEvent ? env("ADMIN_EMAIL", false) : order?.recipient_email);
  const userUrl = `${publicSiteUrl()}vartotojas.html`;
  const templates: Record<string, { subject: string; heading: string; paragraphs: string[]; action?: string }> = {
    "order.created": {
      subject: "Gautas naujas užsakymas",
      heading: "Naujas užsakymas sistemoje",
      paragraphs: [`Užsakymas: ${order?.id || "–"}`, `Produktas: ${order?.product_catalog?.name || order?.product_type || "–"}`],
      action: "Atidaryti administravimą",
    },
    "payment.confirmed": {
      subject: "Mokėjimas gautas",
      heading: "Mokėjimas sėkmingas",
      paragraphs: ["Gavome jūsų mokėjimą. Netrukus gausite mokėjimo dokumentą.", "Prieš gamybą dar reikės patvirtinti galutinį QR puslapį."],
      action: "Peržiūrėti užsakymą",
    },
    "production.approval_requested": {
      subject: "Patvirtinkite QR prieš gamybą",
      heading: "Reikalingas jūsų patvirtinimas",
      paragraphs: ["Peržiūrėkite atminimo puslapį ir patvirtinkite, kad QR ženkliuką galima gaminti."],
      action: "Peržiūrėti ir patvirtinti",
    },
    "order.unpaid_reminder": {
      subject: "Neužbaigtas Atminimas užsakymas",
      heading: "Užsakymas dar neapmokėtas",
      paragraphs: ["Jūsų užsakymas išsaugotas, tačiau mokėjimas dar negautas. Jei norite tęsti, atidarykite kliento zoną."],
      action: "Tęsti užsakymą",
    },
    "production.approval_reminder": {
      subject: "Laukiame QR gamybos patvirtinimo",
      heading: "Patvirtinkite galutinį vaizdą",
      paragraphs: ["Mokėjimas gautas, bet gamybos nepradedame be jūsų patvirtinimo."],
      action: "Patvirtinti",
    },
    "shipping.sent": {
      subject: "Jūsų siunta išsiųsta",
      heading: "Siunta perduota vežėjui",
      paragraphs: [`Vežėjas: ${order?.carrier || "–"}`, `Sekimo numeris: ${order?.tracking_number || "–"}`],
      action: "Peržiūrėti siuntą",
    },
    "shipping.delivered": {
      subject: "Siunta pristatyta",
      heading: "Užsakymas pristatytas",
      paragraphs: ["Vežėjas pažymėjo siuntą kaip pristatytą. Dėkojame, kad pasirinkote Atminimas."],
      action: "Atidaryti kliento zoną",
    },
    "service.scheduled": {
      subject: "Paslaugos laikas patvirtintas",
      heading: "Paslauga suplanuota",
      paragraphs: [`Planuojamas laikas: ${String(event.payload.scheduled_for || "–")}`],
      action: "Peržiūrėti užklausą",
    },
    "service.reminder": {
      subject: "Priminimas apie rytoj suplanuotą paslaugą",
      heading: "Paslauga artėja",
      paragraphs: [`Planuojamas laikas: ${String(event.payload.scheduled_for || "–")}`],
      action: "Atidaryti kliento zoną",
    },
    "service.completed": {
      subject: "Paslauga atlikta",
      heading: "Darbas pažymėtas kaip atliktas",
      paragraphs: ["Jūsų užsakyta kapavietės priežiūros paslauga atlikta."],
      action: "Peržiūrėti užklausą",
    },
    "admin.shipping_attention": {
      subject: "Siuntai reikia administratoriaus veiksmo",
      heading: "Užsakymas laukia siuntos",
      paragraphs: [`Užsakymas ${order?.id || "–"} pagamintas, tačiau dar neturi sekimo numerio.`],
      action: "Atidaryti siuntų sąrašą",
    },
    "profile.unfinished_reminder": {
      subject: "Užbaikite savo atminimo puslapį",
      heading: "Atminimo puslapis dar nepaskelbtas",
      paragraphs: [`Puslapis ${String(event.payload.name || "").trim() || "be pavadinimo"} dar nebaigtas arba nepaskelbtas. Galite bet kada grįžti ir tęsti.`],
      action: "Tęsti puslapį",
    },
  };
  const template = templates[event.event_type];
  if (!template) throw new BlockedAutomationError(`Neįgyvendintas įvykio tipas: ${event.event_type}`);
  if (!recipient) throw new BlockedAutomationError("Trūksta gavėjo el. pašto");
  await sendEmail({
    to: recipient,
    subject: template.subject,
    heading: template.heading,
    paragraphs: template.paragraphs,
    actionUrl: adminEvent ? `${publicSiteUrl()}admin.html` : userUrl,
    actionLabel: template.action,
    idempotencyKey: event.event_key,
  });
}

async function processEvent(event: AutomationEvent) {
  if (event.event_type === "invoice.requested") return processInvoice(event);
  if (event.event_type === "production.qr_requested") return processQr(event);
  if (event.event_type === "shipping.label_requested") {
    if (!event.order_id) throw new Error("Trūksta užsakymo numerio");
    return createShipment(client, await orderDetails(event.order_id));
  }
  return processEmailEvent(event);
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    requireAutomationSecret(request);
    const { data: candidates, error } = await client.from("automation_events")
      .select("*")
      .in("status", ["pending", "failed"])
      .lte("available_at", new Date().toISOString())
      .order("id", { ascending: true })
      .limit(10);
    if (error) throw error;
    const results: Array<Record<string, unknown>> = [];

    for (const candidate of (candidates || []) as AutomationEvent[]) {
      const { data: claimed } = await client.from("automation_events").update({
        status: "processing",
        locked_at: new Date().toISOString(),
        attempts: candidate.attempts + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", candidate.id).in("status", ["pending", "failed"]).select("*").maybeSingle();
      if (!claimed) continue;
      try {
        await processEvent(claimed as AutomationEvent);
        if (claimed.event_type === "service.reminder" && claimed.payload?.request_id) {
          await client.from("paslaugu_uzklausos").update({ reminder_sent_at: new Date().toISOString() }).eq("id", claimed.payload.request_id);
        }
        await client.from("automation_events").update({
          status: "completed", processed_at: new Date().toISOString(), locked_at: null, last_error: null, updated_at: new Date().toISOString(),
        }).eq("id", candidate.id);
        results.push({ id: candidate.id, status: "completed" });
      } catch (eventError) {
        const message = eventError instanceof Error ? eventError.message : "Automation failed";
        const blocked = eventError instanceof BlockedAutomationError;
        const attempts = candidate.attempts + 1;
        const finalStatus = blocked ? "blocked" : attempts >= candidate.max_attempts ? "blocked" : "failed";
        await client.from("automation_events").update({
          status: finalStatus,
          locked_at: null,
          last_error: message.slice(0, 4000),
          available_at: new Date(Date.now() + retryDelay(attempts) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", candidate.id);
        results.push({ id: candidate.id, status: finalStatus, error: message });
      }
    }
    return json({ processed: results.length, results });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Worker failed" }, 401);
  }
});
