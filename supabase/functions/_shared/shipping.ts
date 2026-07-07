import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.1";
import { BlockedAutomationError, env } from "./core.ts";

type ShipmentOrder = Record<string, unknown> & { id: string; carrier?: string; shipment_provider_ref?: string; tracking_number?: string };

function adapterConfig() {
  const rawUrl = env("SHIPMENT_ADAPTER_URL", false);
  const secret = env("SHIPMENT_ADAPTER_SECRET", false);
  if (!rawUrl || !secret) throw new BlockedAutomationError("Vežėjo sutartis ir siuntų API adapteris dar nesukonfigūruoti");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new BlockedAutomationError("Siuntų adapteris privalo naudoti HTTPS");
  return { url: url.href, secret };
}

async function callAdapter(action: "create" | "sync", order: ShipmentOrder) {
  const adapter = adapterConfig();
  const response = await fetch(adapter.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adapter.secret}` },
    body: JSON.stringify({ action, carrier: order.carrier, order }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Siuntų adapteris ${response.status}: ${JSON.stringify(data)}`);
  return data as Record<string, unknown>;
}

function shippingStatus(value: unknown) {
  const normalized = String(value || "").toLowerCase();
  if (["delivered", "pristatyta"].includes(normalized)) return "pristatyta";
  if (["shipped", "in_transit", "accepted", "išsiųsta"].includes(normalized)) return "išsiųsta";
  if (["cancelled", "canceled", "atšaukta"].includes(normalized)) return "atšaukta";
  return "paruošti";
}

function base64Bytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function createShipment(client: SupabaseClient, order: ShipmentOrder) {
  const data = await callAdapter("create", order);
  const trackingNumber = String(data.tracking_number || "").trim();
  const providerRef = String(data.provider_ref || "").trim();
  if (!trackingNumber || !providerRef) throw new Error("Siuntų adapteris negrąžino sekimo numerio arba siuntos ID");

  let labelPath: string | null = null;
  const labelBase64 = String(data.label_base64 || "");
  if (labelBase64) {
    const bytes = base64Bytes(labelBase64);
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Siuntos lipdukas per didelis");
    const mime = String(data.label_mime || "application/pdf");
    const extension = mime === "application/zpl" ? "zpl" : "pdf";
    labelPath = `labels/${order.id}/label.${extension}`;
    const { error } = await client.storage.from("automation-documents").upload(labelPath, bytes, { contentType: mime, upsert: true });
    if (error) throw error;
  }

  const update = {
    shipment_provider_ref: providerRef,
    tracking_number: trackingNumber,
    tracking_url: data.tracking_url ? String(data.tracking_url) : null,
    label_storage_path: labelPath,
    shipping_status: shippingStatus(data.status),
    last_tracking_sync_at: new Date().toISOString(),
  };
  const { error } = await client.from("uzsakymai").update(update).eq("id", order.id);
  if (error) throw error;
  return update;
}

export async function syncShipment(client: SupabaseClient, order: ShipmentOrder) {
  const data = await callAdapter("sync", order);
  const update = {
    shipping_status: shippingStatus(data.status),
    tracking_url: data.tracking_url ? String(data.tracking_url) : null,
    last_tracking_sync_at: new Date().toISOString(),
  };
  const { error } = await client.from("uzsakymai").update(update).eq("id", order.id);
  if (error) throw error;
  return update;
}
