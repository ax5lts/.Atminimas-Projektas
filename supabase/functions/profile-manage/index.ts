import { handleOptions, json, requireUser } from "../_shared/core.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.1";

type MediaItem = {
  type?: string;
  url?: string;
  path?: string;
  alt?: string;
  caption?: string | null;
  language?: string;
  order?: number;
};

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max) || null;

function safeMedia(value: unknown): MediaItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).flatMap((raw) => {
    const item = raw as MediaItem;
    const type = ["image", "video", "captions"].includes(String(item.type)) ? String(item.type) : "";
    const path = String(item.path || "").replace(/^\/+/, "");
    const url = String(item.url || "");
    if (!type || !path || !url.startsWith("https://")) return [];
    return [{
      type,
      path: path.slice(0, 700),
      url: url.slice(0, 1200),
      alt: text(item.alt, 180) || undefined,
      caption: text(item.caption, 240),
      language: text(item.language, 12) || undefined,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : 1,
    }];
  });
}

function mediaPaths(value: unknown) {
  return safeMedia(value).map((item) => item.path || "").filter(Boolean);
}

async function adminAccess(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { client, user } = await requireUser(request);
    const body = await request.json();
    const action = String(body.action || "");

    if (action === "delete_order") {
      const orderId = String(body.order_id || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "Neteisingas užsakymo numeris" }, 400);
      if (!await adminAccess(client, user.id)) return json({ error: "Veiksmas leidžiamas tik administratoriui" }, 403);

      const { data: order, error: orderError } = await client
        .from("uzsakymai")
        .select("id,profilis_id,apmoketa,payment_status,customer_approved_at")
        .eq("id", orderId)
        .maybeSingle();
      if (orderError) throw orderError;
      if (!order) return json({ error: "Užsakymas nerastas" }, 404);

      const { data: invoice, error: invoiceError } = await client
        .from("invoice_documents")
        .select("id")
        .eq("order_id", orderId)
        .maybeSingle();
      if (invoiceError) throw invoiceError;
      if (order.apmoketa || order.payment_status === "paid" || order.payment_status === "processing" ||
          order.customer_approved_at || invoice) {
        return json({ error: "Apmokėto arba apskaitoje naudojamo užsakymo ištrinti negalima" }, 409);
      }

      const { error: deleteOrderError } = await client.from("uzsakymai").delete().eq("id", orderId);
      if (deleteOrderError) throw deleteOrderError;
      return json({ ok: true, deleted_order: orderId, profile_id: order.profilis_id });
    }

    const profileId = String(body.profile_id || "").trim();
    if (!profileId || profileId.length > 100) return json({ error: "Neteisingas puslapio kodas" }, 400);

    const { data: profile, error: profileError } = await client
      .from("profiliai")
      .select("id,owner_id,media_json,deleted_at")
      .eq("id", profileId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.deleted_at) {
      return json({ error: "Puslapis nerastas" }, 404);
    }

    const isOwner = profile.owner_id === user.id;
    let isAdmin = false;
    if (!isOwner) {
      isAdmin = await adminAccess(client, user.id);
    }
    if (!isOwner && !isAdmin) {
      return json({ error: "Puslapis nerastas" }, 404);
    }

    if (action === "update") {
      if (!isOwner) return json({ error: "Redaguoti gali tik puslapio savininkas" }, 403);
      const input = body.profile || {};
      const media = safeMedia(body.media);
      const layout = body.layout && typeof body.layout === "object" && !Array.isArray(body.layout) ? body.layout : {};
      const payload = {
        vardas: text(input.vardas, 120),
        pavarde: text(input.pavarde, 120),
        gimimo_data: text(input.gimimo_data, 40),
        mirties_data: text(input.mirties_data, 40),
        epitafija: text(input.epitafija, 180),
        tekstas_200: text(input.tekstas_200, 10000),
        layout_json: layout,
        media_json: media,
      };
      if (!payload.vardas) return json({ error: "Įrašykite vardą" }, 400);

      const { error: updateError } = await client.from("profiliai").update(payload).eq("id", profileId);
      if (updateError) throw updateError;

      const keep = new Set(mediaPaths(media));
      const stale = mediaPaths(profile.media_json).filter((path) => !keep.has(path));
      if (stale.length) {
        const { error: storageError } = await client.storage.from("atminimas").remove(stale);
        if (storageError) console.error("Stale media cleanup failed", storageError);
      }
      return json({ ok: true, profile_id: profileId });
    }

    if (action === "delete") {
      const { data: orders, error: ordersError } = await client
        .from("uzsakymai")
        .select("id,apmoketa,payment_status,customer_approved_at")
        .eq("profilis_id", profileId);
      if (ordersError) throw ordersError;
      const orderIds = (orders || []).map((order) => order.id);
      let hasInvoice = false;
      if (orderIds.length) {
        const { data: invoices, error: invoicesError } = await client
          .from("invoice_documents")
          .select("id")
          .in("order_id", orderIds)
          .limit(1);
        if (invoicesError) throw invoicesError;
        hasInvoice = Boolean(invoices && invoices.length);
      }
      const mustRetainOrder = (orders || []).some((order) =>
        order.apmoketa || order.payment_status === "paid" || order.payment_status === "processing" || order.customer_approved_at
      ) || hasInvoice;

      if (mustRetainOrder) {
        const { error: deleteError } = await client.from("profiliai").update({
          vardas: null,
          pavarde: null,
          gimimo_data: null,
          mirties_data: null,
          epitafija: null,
          tekstas_200: null,
          layout_json: {},
          media_json: [],
          aktyvus: false,
          deleted_at: new Date().toISOString(),
        }).eq("id", profileId);
        if (deleteError) throw deleteError;
      } else {
        const { error: deleteError } = await client.from("profiliai").delete().eq("id", profileId);
        if (deleteError) throw deleteError;
      }

      const paths = mediaPaths(profile.media_json);
      if (paths.length) {
        const { error: storageError } = await client.storage.from("atminimas").remove(paths);
        if (storageError) console.error("Deleted profile media cleanup failed", storageError);
      }
      return json({
        ok: true,
        retained_order: mustRetainOrder,
        deleted_orders: mustRetainOrder ? 0 : orderIds.length,
      });
    }

    return json({ error: "Nežinomas veiksmas" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Nepavyko pakeisti puslapio" }, 500);
  }
});
