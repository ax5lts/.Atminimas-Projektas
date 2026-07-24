import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.1";
import { BlockedAutomationError, env } from "./core.ts";

type ShipmentOrder = Record<string, unknown> & {
  id: string;
  carrier?: string;
  shipment_provider_ref?: string;
  tracking_number?: string;
};

function adapterConfig() {
  const rawUrl = env("SHIPMENT_ADAPTER_URL", false);
  const secret = env("SHIPMENT_ADAPTER_SECRET", false);
  if (!rawUrl || !secret) {
    throw new BlockedAutomationError(
      "Vežėjo sutartis ir siuntų API adapteris dar nesukonfigūruoti",
    );
  }
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new BlockedAutomationError(
      "Siuntų adapteris privalo naudoti saugų HTTPS adresą",
    );
  }
  return { url: url.href, secret };
}

function adapterOrder(order: ShipmentOrder) {
  return {
    id: order.id,
    delivery_method: order.delivery_method,
    carrier: order.carrier,
    city: order.city,
    parcel_terminal: order.parcel_terminal,
    recipient_name: order.recipient_name,
    recipient_phone: order.recipient_phone,
    recipient_email: order.recipient_email,
    product_type: order.product_type,
    shipment_provider_ref: order.shipment_provider_ref,
    tracking_number: order.tracking_number,
  };
}

function boundedText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function safeTrackingUrl(value: unknown) {
  if (!value) return null;
  try {
    const parsed = new URL(boundedText(value, 1000));
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.href
      : null;
  } catch (_error) {
    return null;
  }
}

async function callAdapter(action: "create" | "sync", order: ShipmentOrder) {
  const adapter = adapterConfig();
  const response = await fetch(adapter.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adapter.secret}`,
    },
    body: JSON.stringify({
      action,
      carrier: order.carrier,
      order: adapterOrder(order),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Siuntų adapteris grąžino klaidą (${response.status})`);
  }
  return data as Record<string, unknown>;
}

function shippingStatus(value: unknown) {
  const normalized = String(value || "").toLowerCase();
  if (["delivered", "pristatyta"].includes(normalized)) return "pristatyta";
  if (["shipped", "in_transit", "accepted", "išsiųsta"].includes(normalized)) {
    return "išsiųsta";
  }
  if (["cancelled", "canceled", "atšaukta"].includes(normalized)) {
    return "atšaukta";
  }
  return "paruošti";
}

function base64Bytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function createShipment(
  client: SupabaseClient,
  order: ShipmentOrder,
) {
  const data = await callAdapter("create", order);
  const trackingNumber = boundedText(data.tracking_number, 200);
  const providerRef = boundedText(data.provider_ref, 200);
  if (!trackingNumber || !providerRef) {
    throw new Error(
      "Siuntų adapteris negrąžino sekimo numerio arba siuntos ID",
    );
  }

  let labelPath: string | null = null;
  const labelBase64 = String(data.label_base64 || "");
  if (labelBase64) {
    if (labelBase64.length > 14_000_000) {
      throw new Error("Siuntos lipdukas per didelis");
    }
    const bytes = base64Bytes(labelBase64);
    if (bytes.byteLength > 10 * 1024 * 1024) {
      throw new Error("Siuntos lipdukas per didelis");
    }
    const mime = String(data.label_mime || "application/pdf");
    if (!["application/pdf", "application/zpl"].includes(mime)) {
      throw new Error("Siuntos lipduko formatas nepalaikomas");
    }
    const extension = mime === "application/zpl" ? "zpl" : "pdf";
    labelPath = `labels/${order.id}/label.${extension}`;
    const { error } = await client.storage.from("automation-documents").upload(
      labelPath,
      bytes,
      { contentType: mime, upsert: true },
    );
    if (error) throw error;
  }

  const update = {
    shipment_provider_ref: providerRef,
    tracking_number: trackingNumber,
    tracking_url: safeTrackingUrl(data.tracking_url),
    label_storage_path: labelPath,
    shipping_status: shippingStatus(data.status),
    last_tracking_sync_at: new Date().toISOString(),
  };
  const { error } = await client.from("uzsakymai").update(update).eq(
    "id",
    order.id,
  );
  if (error) throw error;
  return update;
}

export async function syncShipment(
  client: SupabaseClient,
  order: ShipmentOrder,
) {
  const data = await callAdapter("sync", order);
  const update = {
    shipping_status: shippingStatus(data.status),
    tracking_url: safeTrackingUrl(data.tracking_url),
    last_tracking_sync_at: new Date().toISOString(),
  };
  const { error } = await client.from("uzsakymai").update(update).eq(
    "id",
    order.id,
  );
  if (error) throw error;
  return update;
}
