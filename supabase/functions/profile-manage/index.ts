import {
  env,
  handleOptions,
  json,
  publicSiteUrl,
  readJson,
  RequestError,
  requireUser,
  safeProfileLayout,
  safeStoryBlocks,
  storyBlocksText,
  userClient,
} from "../_shared/core.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.1";

type MediaItem = {
  type?: string;
  path?: string;
  alt?: string;
  caption?: string | null;
  language?: string;
  order?: number;
};

const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;
const MEDIA_TYPES = new Set(["image", "video", "captions"]);
const MEDIA_FILE_PATTERNS: Record<string, RegExp> = {
  image: /^photo-[1-8]\.(?:jpg|jpeg|png|webp)$/,
  video: /^video\.(?:mp4|mov)$/,
  captions: /^captions\.vtt$/,
};
const text = (value: unknown, max: number) =>
  String(value ?? "").trim().slice(0, max) || null;

function mediaPath(
  raw: unknown,
  ownerId: string,
  profileId: string,
  mediaType: string,
) {
  const path = String(raw || "").trim();
  const segments = path.split("/");
  if (
    !path ||
    path.length > 700 ||
    path.includes("\\") ||
    segments.length !== 3 ||
    segments.some((segment) =>
      !segment || segment === "." || segment === ".."
    ) ||
    segments[0] !== ownerId ||
    segments[1] !== profileId ||
    !MEDIA_FILE_PATTERNS[mediaType]?.test(segments[2])
  ) return "";
  return path;
}

function safeMedia(
  value: unknown,
  ownerId: string,
  profileId: string,
): MediaItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).flatMap((raw) => {
    const item = raw as MediaItem;
    const type = MEDIA_TYPES.has(String(item.type)) ? String(item.type) : "";
    const path = mediaPath(item.path, ownerId, profileId, type);
    if (!type || !path) return [];
    return [{
      type,
      path,
      alt: text(item.alt, 180) || undefined,
      caption: text(item.caption, 240),
      language: text(item.language, 12) || undefined,
      order: Number.isFinite(Number(item.order))
        ? Math.min(10, Math.max(1, Math.trunc(Number(item.order))))
        : 1,
    }];
  });
}

function mediaPaths(value: unknown, ownerId: string | null, profileId: string) {
  if (!ownerId || !Array.isArray(value)) return [];
  return value
    .map((item) => {
      const media = item as MediaItem;
      return mediaPath(
        media?.path,
        ownerId,
        profileId,
        String(media?.type || ""),
      );
    })
    .filter(Boolean);
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
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { client, user, token } = await requireUser(request);
    const body = await readJson(request, 256_000);
    const action = String(body.action || "");

    if (action === "delete_order") {
      const orderId = String(body.order_id || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
        return json({ error: "Neteisingas užsakymo numeris" }, 400);
      }
      if (!await adminAccess(client, user.id)) {
        return json({ error: "Veiksmas leidžiamas tik administratoriui" }, 403);
      }

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
      if (
        order.apmoketa || order.payment_status === "paid" ||
        order.payment_status === "processing" ||
        order.customer_approved_at || invoice
      ) {
        return json({
          error:
            "Apmokėto arba apskaitoje naudojamo užsakymo ištrinti negalima",
        }, 409);
      }

      const { error: deleteOrderError } = await client.from("uzsakymai")
        .delete().eq("id", orderId);
      if (deleteOrderError) throw deleteOrderError;
      return json({
        ok: true,
        deleted_order: orderId,
        profile_id: order.profilis_id,
      });
    }

    const profileId = String(body.profile_id || "").trim();
    if (!PROFILE_ID_PATTERN.test(profileId)) {
      return json({ error: "Neteisingas puslapio kodas" }, 400);
    }

    const { data: profile, error: profileError } = await client
      .from("profiliai")
      .select("id,owner_id,story_blocks_json,media_json,deleted_at")
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

    if (action === "publish_prototype") {
      if (!isOwner || !await adminAccess(client, user.id)) {
        return json(
          { error: "Prototipą gali skelbti tik jo administratorius" },
          403,
        );
      }
      const { error: publishError } = await client.from("profiliai").update({
        aktyvus: true,
        apmoketa: true,
        statusas: "apmoketa",
      }).eq("id", profileId).eq("owner_id", user.id);
      if (publishError) throw publishError;

      const page = new URL("sablonas-viskas.html", publicSiteUrl());
      page.searchParams.set("slug", profileId);
      const pageUrl = page.href;
      const qrUrl = `${
        env("SUPABASE_URL").replace(/\/$/, "")
      }/functions/v1/qr-code?data=${encodeURIComponent(pageUrl)}`;
      return json({
        ok: true,
        profile_id: profileId,
        page_url: pageUrl,
        qr_url: qrUrl,
      });
    }

    if (action === "create_order") {
      if (!isOwner) {
        return json(
          { error: "Užsakymą gali sukurti tik puslapio savininkas" },
          403,
        );
      }
      const productType = String(body.product_type || "");
      if (productType !== "metal" && productType !== "asa") {
        return json({ error: "Neteisingas produkto tipas" }, 400);
      }
      const { data: product, error: productError } = await client
        .from("product_catalog")
        .select("id")
        .eq("id", productType)
        .eq("enabled", true)
        .not("price_cents", "is", null)
        .maybeSingle();
      if (productError) throw productError;
      if (!product) {
        return json({ error: "Šio produkto šiuo metu užsakyti negalima" }, 409);
      }

      const page = new URL("sablonas-viskas.html", publicSiteUrl());
      page.searchParams.set("slug", profileId);
      const pageUrl = page.href;
      const qrUrl = `${
        env("SUPABASE_URL").replace(/\/$/, "")
      }/functions/v1/qr-code?data=${encodeURIComponent(pageUrl)}`;
      const { data: order, error: orderError } = await client
        .from("uzsakymai")
        .insert({
          profilis_id: profileId,
          puslapio_url: pageUrl,
          qr_kodas_url: qrUrl,
          product_type: productType,
          busena: "sukurtas",
          apmoketa: false,
        })
        .select("id,profilis_id,puslapio_url,qr_kodas_url,busena")
        .single();
      if (orderError) throw orderError;
      return json(order, 201);
    }

    if (action === "update") {
      if (!isOwner) {
        return json({ error: "Redaguoti gali tik puslapio savininkas" }, 403);
      }
      const input = body.profile && typeof body.profile === "object" &&
          !Array.isArray(body.profile)
        ? body.profile as Record<string, unknown>
        : {};
      const existingStoryBlocks = safeStoryBlocks(
        profile.story_blocks_json,
      );
      const hasStoryBlocks = Object.prototype.hasOwnProperty.call(
        body,
        "story_blocks",
      );
      const hasLegacyText = Object.prototype.hasOwnProperty.call(
        input,
        "tekstas_200",
      );
      const legacyText = text(input.tekstas_200, 10000) || "";
      const media = safeMedia(
        body.media,
        String(profile.owner_id || ""),
        profileId,
      );
      let storyBlocks = existingStoryBlocks;
      if (hasStoryBlocks) {
        storyBlocks = safeStoryBlocks(body.story_blocks);
      } else if (hasLegacyText && legacyText !== storyBlocksText(storyBlocks)) {
        storyBlocks = safeStoryBlocks(
          [
            ...(legacyText ? [{ type: "text", text: legacyText }] : []),
            ...media
              .filter((item) => item.type === "image")
              .sort((left, right) =>
                Number(left.order || 0) - Number(right.order || 0)
              )
              .slice(0, 8)
              .map((item, index) => ({
                type: "photo",
                photoOrder: Number(item.order || index + 1),
              })),
          ],
        );
      }
      const layout = safeProfileLayout(body.layout);
      const payload = {
        vardas: text(input.vardas, 120),
        pavarde: text(input.pavarde, 120),
        gimimo_data: text(input.gimimo_data, 40),
        mirties_data: text(input.mirties_data, 40),
        epitafija: text(input.epitafija, 180),
        tekstas_200: storyBlocksText(storyBlocks) || null,
        story_blocks_json: storyBlocks,
        layout_json: layout,
        media_json: media,
      };
      if (!payload.vardas) return json({ error: "Įrašykite vardą" }, 400);

      const { error: updateError } = await client.from("profiliai").update(
        payload,
      ).eq("id", profileId);
      if (updateError) throw updateError;

      const keep = new Set(mediaPaths(media, profile.owner_id, profileId));
      const stale = mediaPaths(profile.media_json, profile.owner_id, profileId)
        .filter((path) => !keep.has(path));
      if (stale.length) {
        const { error: storageError } = await userClient(token).storage.from(
          "atminimas",
        ).remove(stale);
        if (storageError) {
          console.error("Stale media cleanup failed", storageError);
        }
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
        order.apmoketa || order.payment_status === "paid" ||
        order.payment_status === "processing" || order.customer_approved_at
      ) || hasInvoice;

      if (mustRetainOrder) {
        const { error: deleteError } = await client.from("profiliai").update({
          vardas: null,
          pavarde: null,
          gimimo_data: null,
          mirties_data: null,
          epitafija: null,
          tekstas_200: null,
          story_blocks_json: [],
          layout_json: {},
          media_json: [],
          aktyvus: false,
          deleted_at: new Date().toISOString(),
        }).eq("id", profileId);
        if (deleteError) {
          throw deleteError;
        }
      } else {
        const { error: deleteError } = await client.from("profiliai").delete()
          .eq("id", profileId);
        if (deleteError) {
          throw deleteError;
        }
      }

      const paths = mediaPaths(profile.media_json, profile.owner_id, profileId);
      if (paths.length) {
        const storage = isOwner ? userClient(token).storage : client.storage;
        const { error: storageError } = await storage.from("atminimas").remove(
          paths,
        );
        if (storageError) {
          console.error("Deleted profile media cleanup failed", storageError);
        }
      }
      return json({
        ok: true,
        retained_order: mustRetainOrder,
        deleted_orders: mustRetainOrder ? 0 : orderIds.length,
      });
    }

    return json({ error: "Nežinomas veiksmas" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (error instanceof RequestError) {
      return json({ error: error.message }, error.status);
    }
    if (/^(Authentication required|Invalid session)$/i.test(message)) {
      return json({ error: "Prisijungimo sesija nebegalioja" }, 401);
    }
    console.error("profile-manage failed", error);
    return json({ error: "Nepavyko pakeisti puslapio" }, 500);
  }
});
