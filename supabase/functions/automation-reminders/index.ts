import { adminClient, json, requireAutomationSecret } from "../_shared/core.ts";

const client = adminClient();

async function enqueue(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return 0;
  const { error } = await client.from("automation_events").upsert(rows, { onConflict: "event_key", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    requireAutomationSecret(request);
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const week = `${now.getUTCFullYear()}-${Math.ceil((((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86400000) + new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).getUTCDay() + 1) / 7)}`;
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let created = 0;

    const { data: unpaid, error: unpaidError } = await client.from("uzsakymai")
      .select("id,recipient_email,created_at")
      .eq("apmoketa", false)
      .not("recipient_email", "is", null)
      .lte("created_at", oneDayAgo)
      .gte("created_at", sevenDaysAgo);
    if (unpaidError) throw unpaidError;
    created += await enqueue((unpaid || []).map((row) => ({
      event_key: `order:${row.id}:unpaid-reminder:${day}`,
      event_type: "order.unpaid_reminder",
      order_id: row.id,
      recipient_email: row.recipient_email,
      payload: { order_id: row.id },
    })));

    const { data: approvals, error: approvalError } = await client.from("uzsakymai")
      .select("id,recipient_email,paid_at")
      .eq("apmoketa", true)
      .is("customer_approved_at", null)
      .not("recipient_email", "is", null)
      .lte("paid_at", oneDayAgo);
    if (approvalError) throw approvalError;
    created += await enqueue((approvals || []).map((row) => ({
      event_key: `order:${row.id}:approval-reminder:${day}`,
      event_type: "production.approval_reminder",
      order_id: row.id,
      recipient_email: row.recipient_email,
      payload: { order_id: row.id },
    })));

    const { data: stalled, error: stalledError } = await client.from("uzsakymai")
      .select("id,carrier,production_completed_at")
      .eq("fulfillment_status", "ready_to_ship")
      .is("tracking_number", null)
      .lte("production_completed_at", oneDayAgo);
    if (stalledError) throw stalledError;
    const adminEmail = Deno.env.get("ADMIN_EMAIL") || null;
    created += await enqueue((stalled || []).map((row) => ({
      event_key: `order:${row.id}:shipping-attention:${day}`,
      event_type: "admin.shipping_attention",
      order_id: row.id,
      recipient_email: adminEmail,
      payload: { order_id: row.id, carrier: row.carrier },
    })));

    const inOneDay = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const { data: services, error: serviceError } = await client.from("paslaugu_uzklausos")
      .select("id,owner_id,scheduled_for,reminder_sent_at")
      .not("scheduled_for", "is", null)
      .is("reminder_sent_at", null)
      .gte("scheduled_for", now.toISOString())
      .lte("scheduled_for", inOneDay);
    if (serviceError) throw serviceError;
    for (const service of services || []) {
      const { data: userData } = await client.auth.admin.getUserById(service.owner_id);
      const email = userData?.user?.email || null;
      created += await enqueue([{
        event_key: `service:${service.id}:reminder`,
        event_type: "service.reminder",
        recipient_email: email,
        payload: { request_id: service.id, scheduled_for: service.scheduled_for },
      }]);
    }

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data: unfinished, error: unfinishedError } = await client.from("profiliai")
      .select("id,owner_id,vardas,pavarde,created_at")
      .eq("aktyvus", false)
      .gte("created_at", thirtyDaysAgo)
      .lte("created_at", twoDaysAgo);
    if (unfinishedError) throw unfinishedError;
    for (const profile of unfinished || []) {
      const { data: userData } = await client.auth.admin.getUserById(profile.owner_id);
      const email = userData?.user?.email || null;
      if (!email) continue;
      created += await enqueue([{
        event_key: `profile:${profile.id}:unfinished:${week}`,
        event_type: "profile.unfinished_reminder",
        recipient_email: email,
        payload: { profile_id: profile.id, name: [profile.vardas, profile.pavarde].filter(Boolean).join(" ") },
      }]);
    }

    return json({ created, checked_at: now.toISOString() });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Reminder job failed" }, 401);
  }
});
