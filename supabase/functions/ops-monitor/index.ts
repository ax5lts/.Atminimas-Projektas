import {
  adminClient,
  constantTimeEqual,
  env,
  json,
  publicSiteUrl,
} from "../_shared/core.ts";
import { sendEmail } from "../_shared/email.ts";

type Severity = "info" | "warning" | "critical";
type AlertInput = {
  key: string;
  category: string;
  severity: Severity;
  title: string;
  detail: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

const client = adminClient();
const managedCategories = ["health", "orders", "automation", "production", "email_monitor"];

async function validMonitorSecret(received: string) {
  if (!received) return false;
  const expected = env("OPS_MONITOR_SECRET", false);
  if (expected) return constantTimeEqual(expected, received);
  const { data, error } = await client.rpc("verify_ops_monitor_secret", {
    p_secret: received,
  });
  if (error) throw error;
  return data === true;
}

function shortId(value: unknown) {
  return String(value || "").slice(0, 8).toUpperCase();
}

function safeError(error: unknown) {
  return error instanceof Error ? error.name.slice(0, 80) : "unknown_error";
}

async function ensureResendWebhook() {
  const { data: current, error: currentError } = await client.rpc(
    "get_resend_webhook_secret",
  );
  if (currentError) throw currentError;
  if (typeof current === "string" && current.trim()) {
    return { configured: true, created: false, detail: "configured" };
  }
  const apiKey = env("RESEND_API_KEY", false);
  if (!apiKey) return { configured: false, created: false, detail: "missing_api_key" };
  const endpoint = `${env("SUPABASE_URL")}/functions/v1/resend-webhook`;
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const listResponse = await fetch("https://api.resend.com/webhooks", { headers });
  if (!listResponse.ok) {
    return { configured: false, created: false, detail: `list_http_${listResponse.status}` };
  }
  const listed = await listResponse.json() as Record<string, unknown>;
  const webhooks = Array.isArray(listed.data) ? listed.data as Array<Record<string, unknown>> : [];
  const existing = webhooks.find((item) => item.endpoint === endpoint && item.status !== "disabled");
  let webhook: Record<string, unknown>;
  let created = false;
  if (existing?.id) {
    const detailResponse = await fetch(
      `https://api.resend.com/webhooks/${encodeURIComponent(String(existing.id))}`,
      { headers },
    );
    if (!detailResponse.ok) {
      return { configured: false, created: false, detail: `get_http_${detailResponse.status}` };
    }
    webhook = await detailResponse.json() as Record<string, unknown>;
  } else {
    const createResponse = await fetch("https://api.resend.com/webhooks", {
      method: "POST",
      headers,
      body: JSON.stringify({
        endpoint,
        events: [
          "email.sent", "email.delivered", "email.delivery_delayed",
          "email.bounced", "email.failed", "email.complained",
          "email.suppressed", "email.opened", "email.clicked",
        ],
      }),
    });
    if (!createResponse.ok) {
      return { configured: false, created: false, detail: `create_http_${createResponse.status}` };
    }
    webhook = await createResponse.json() as Record<string, unknown>;
    created = true;
  }
  const webhookId = typeof webhook.id === "string" ? webhook.id : "";
  const secret = typeof webhook.signing_secret === "string"
    ? webhook.signing_secret
    : "";
  if (!webhookId || !secret) {
    return { configured: false, created, detail: "incomplete_provider_response" };
  }
  const { error: storeError } = await client.rpc("store_resend_webhook_config", {
    p_webhook_id: webhookId,
    p_signing_secret: secret,
  });
  if (storeError) throw storeError;
  return { configured: true, created, detail: "configured" };
}

async function checkUrl(checkKey: string, url: string, targetKind: "website" | "edge_function") {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Atminimas-Ops-Monitor/1.0" },
    });
    const durationMs = Math.round(performance.now() - started);
    return {
      check_key: checkKey,
      target_kind: targetKind,
      status: response.ok ? "healthy" : response.status < 500 ? "degraded" : "down",
      http_status: response.status,
      duration_ms: durationMs,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      check_key: checkKey,
      target_kind: targetKind,
      status: "down",
      http_status: null,
      duration_ms: Math.round(performance.now() - started),
      detail: safeError(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function touchAlert(input: AlertInput) {
  const now = new Date().toISOString();
  const { data: existing, error: readError } = await client.from("ops_alerts")
    .select("id,status,occurrences,notified_at")
    .eq("alert_key", input.key).maybeSingle();
  if (readError) throw readError;
  const isNew = !existing || existing.status === "resolved";
  const record = {
    alert_key: input.key,
    category: input.category,
    severity: input.severity,
    status: "open",
    title: input.title.slice(0, 200),
    detail: input.detail.slice(0, 2000),
    entity_type: input.entityType || null,
    entity_id: input.entityId || null,
    metadata: input.metadata || {},
    occurrences: Number(existing?.occurrences || 0) + 1,
    last_seen_at: now,
    resolved_at: null,
    notified_at: isNew ? null : existing?.notified_at || null,
    updated_at: now,
  };
  const { data, error } = existing?.id
    ? await client.from("ops_alerts").update(record).eq("id", existing.id).select("id").single()
    : await client.from("ops_alerts").insert(record).select("id").single();
  if (error) throw error;
  return { id: data.id as string, isNew, ...input };
}

async function resolveMissing(seen: Set<string>) {
  const { data, error } = await client.from("ops_alerts")
    .select("id,alert_key")
    .in("category", managedCategories)
    .eq("status", "open");
  if (error) throw error;
  const ids = (data || []).filter((alert) => !seen.has(alert.alert_key)).map((alert) => alert.id);
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const { error: updateError } = await client.from("ops_alerts").update({
    status: "resolved",
    resolved_at: now,
    updated_at: now,
  }).in("id", ids);
  if (updateError) throw updateError;
  return ids.length;
}

async function notifyAdmin(alerts: Array<Awaited<ReturnType<typeof touchAlert>>>) {
  const important = alerts.filter((alert) => alert.isNew && alert.severity !== "info").slice(0, 8);
  const adminEmail = env("ADMIN_EMAIL", false);
  if (!important.length || !adminEmail) return;
  try {
    const bucket = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    await sendEmail({
      to: adminEmail,
      subject: `Atminimas: ${important.length} nauji sistemos įspėjimai`,
      heading: "Reikia patikrinti sistemos veiklą",
      paragraphs: important.map((alert) => `${alert.title}: ${alert.detail}`),
      actionUrl: `${publicSiteUrl()}admin.html#veiklos-prieziura`,
      actionLabel: "Atidaryti veiklos priežiūrą",
      idempotencyKey: `ops-alerts:${bucket}:${important.map((item) => item.id).join("-")}`,
      recipientKind: "admin",
      category: "ops.alert",
      entityType: "ops_monitor",
    });
    await client.from("ops_alerts").update({ notified_at: new Date().toISOString() })
      .in("id", important.map((alert) => alert.id));
  } catch (error) {
    console.error("ops alert notification failed", safeError(error));
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const received = request.headers.get("x-ops-monitor-secret") || "";
  if (!await validMonitorSecret(received)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let triggerSource = "schedule";
  try {
    const raw = await request.text();
    if (raw.length > 2_000) return json({ error: "Payload too large" }, 413);
    const body = raw ? JSON.parse(raw) : {};
    if (["schedule", "manual", "deploy"].includes(String(body.trigger_source))) {
      triggerSource = String(body.trigger_source);
    }
  } catch (_error) {
    return json({ error: "Invalid JSON" }, 400);
  }

  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await client.from("ops_monitor_runs")
    .insert({ trigger_source: triggerSource, started_at: startedAt })
    .select("id").single();
  if (runError || !run) return json({ error: "Monitor start failed" }, 500);

  const seen = new Set<string>();
  const touched: Array<Awaited<ReturnType<typeof touchAlert>>> = [];
  try {
    const siteUrl = publicSiteUrl();
    let webhookSetup: Awaited<ReturnType<typeof ensureResendWebhook>>;
    try {
      webhookSetup = await ensureResendWebhook();
    } catch (error) {
      webhookSetup = { configured: false, created: false, detail: safeError(error) };
    }
    if (!webhookSetup.configured) {
      const key = "email_monitor:webhook_configuration";
      seen.add(key);
      touched.push(await touchAlert({
        key,
        category: "email_monitor",
        severity: "critical",
        title: "Neveikia el. laiškų pristatymo patvirtinimai",
        detail: `Resend webhook nepavyko paruošti (${webhookSetup.detail}).`,
        entityType: "email_provider",
        entityId: "resend",
      }));
    }
    const qrTarget = new URL("sablonas-viskas.html?slug=monitor-test", siteUrl).href;
    const qrUrl = `${env("SUPABASE_URL")}/functions/v1/qr-code?data=${encodeURIComponent(qrTarget)}&format=svg`;
    const [websiteCheck, qrCheck, metricResult] = await Promise.all([
      checkUrl("public_website", siteUrl, "website"),
      checkUrl("qr_generator", qrUrl, "edge_function"),
      client.rpc("ops_collect_metrics"),
    ]);
    if (metricResult.error) throw metricResult.error;
    const metrics = (metricResult.data || {}) as Record<string, number | string>;
    const healthChecks = [websiteCheck, qrCheck].map((check) => ({ ...check, run_id: run.id }));
    const { error: healthError } = await client.from("system_health_checks").insert(healthChecks);
    if (healthError) throw healthError;

    for (const check of healthChecks) {
      if (check.status === "healthy") continue;
      const key = `health:${check.check_key}`;
      seen.add(key);
      touched.push(await touchAlert({
        key,
        category: "health",
        severity: check.status === "down" ? "critical" : "warning",
        title: check.check_key === "public_website"
          ? "Vieša svetainė neatsako tinkamai"
          : "QR generatorius neatsako tinkamai",
        detail: `${check.detail}; trukmė ${check.duration_ms} ms.`,
        entityType: check.target_kind,
        entityId: check.check_key,
        metadata: { http_status: check.http_status, duration_ms: check.duration_ms },
      }));
    }

    const aggregateAlerts: Array<[string, number, Severity, string, string]> = [
      ["orders:unpaid_24h", Number(metrics.unpaid_older_24h || 0), "warning", "Yra seniau nei prieš 24 val. neapmokėtų užsakymų", "užsakymų"],
      ["orders:payment_inconsistent", Number(metrics.payment_inconsistent || 0), "critical", "Nesutampa užsakymų mokėjimo būsenos", "įrašų"],
    ];
    for (const [key, count, severity, title, noun] of aggregateAlerts) {
      if (count <= 0) continue;
      seen.add(key);
      touched.push(await touchAlert({
        key, category: "orders", severity, title,
        detail: `Aptikta: ${count} ${noun}.`,
        metadata: { count },
      }));
    }

    const staleProcessingBefore = new Date(Date.now() - 15 * 60_000).toISOString();
    const productionBefore = new Date(Date.now() - 48 * 60 * 60_000).toISOString();
    const manufacturerBefore = new Date(Date.now() - 30 * 60_000).toISOString();
    const emailBefore = new Date(Date.now() - 30 * 60_000).toISOString();
    const [automationResult, staleAutomationResult, productionResult, manufacturerResult, emailProblemResult, emailPendingResult] = await Promise.all([
      client.from("automation_events").select("id,event_type,status,order_id,last_error").in("status", ["failed", "blocked"]).order("updated_at", { ascending: false }).limit(30),
      client.from("automation_events").select("id,event_type,status,order_id,last_error").eq("status", "processing").lt("locked_at", staleProcessingBefore).limit(30),
      client.from("production_jobs").select("id,order_id,status,updated_at").not("status", "in", "(completed,cancelled)").lt("updated_at", productionBefore).limit(30),
      client.from("production_jobs").select("id,order_id,status,updated_at").eq("status", "qr_ready").is("manufacturer_email_sent_at", null).lt("updated_at", manufacturerBefore).limit(30),
      client.from("email_messages").select("id,order_id,status,recipient_kind,recipient_masked,last_error").in("status", ["delayed", "bounced", "failed", "complained", "suppressed"]).order("updated_at", { ascending: false }).limit(30),
      client.from("email_messages").select("id,order_id,status,recipient_kind,recipient_masked").in("status", ["accepted", "sent"]).lt("sent_at", emailBefore).order("sent_at", { ascending: true }).limit(30),
    ]);
    for (const result of [automationResult, staleAutomationResult, productionResult, manufacturerResult, emailProblemResult, emailPendingResult]) {
      if (result.error) throw result.error;
    }

    for (const event of [...(automationResult.data || []), ...(staleAutomationResult.data || [])]) {
      const key = `automation:${event.id}`;
      seen.add(key);
      touched.push(await touchAlert({
        key, category: "automation", severity: event.status === "blocked" ? "critical" : "warning",
        title: event.status === "processing" ? "Automatikos užduotis įstrigo" : "Automatikos užduotis nepavyko",
        detail: `${event.event_type}; užsakymas #${shortId(event.order_id) || "–"}.`,
        entityType: "automation_event", entityId: String(event.id),
        metadata: { event_type: event.event_type, status: event.status, order_id: event.order_id || null },
      }));
    }
    for (const job of productionResult.data || []) {
      const key = `production:stalled:${job.id}`;
      seen.add(key);
      touched.push(await touchAlert({
        key, category: "production", severity: "warning",
        title: "Gamybos darbas nejuda ilgiau nei 48 val.",
        detail: `Užsakymas #${shortId(job.order_id)}, būsena „${job.status}“.`,
        entityType: "production_job", entityId: job.id,
        metadata: { order_id: job.order_id, status: job.status },
      }));
    }
    for (const job of manufacturerResult.data || []) {
      const key = `production:manufacturer_email:${job.id}`;
      seen.add(key);
      touched.push(await touchAlert({
        key, category: "production", severity: "critical",
        title: "Gamintojui neišsiųstas paruoštas QR failas",
        detail: `Užsakymas #${shortId(job.order_id)} laukia išsiuntimo gamintojui.`,
        entityType: "production_job", entityId: job.id,
        metadata: { order_id: job.order_id },
      }));
    }
    for (const message of emailProblemResult.data || []) {
      const key = `email_monitor:problem:${message.id}`;
      seen.add(key);
      touched.push(await touchAlert({
        key, category: "email_monitor", severity: message.status === "delayed" ? "warning" : "critical",
        title: "El. laiško pristatymo klaida",
        detail: `Būsena „${message.status}“, gavėjas ${message.recipient_masked}.`,
        entityType: "email_message", entityId: message.id,
        metadata: { status: message.status, order_id: message.order_id || null, recipient_kind: message.recipient_kind },
      }));
    }
    for (const message of emailPendingResult.data || []) {
      const key = `email_monitor:pending:${message.id}`;
      seen.add(key);
      touched.push(await touchAlert({
        key, category: "email_monitor", severity: "warning",
        title: "Negautas el. laiško pristatymo patvirtinimas",
        detail: `Gavėjas ${message.recipient_masked}; dabartinė būsena „${message.status}“.`,
        entityType: "email_message", entityId: message.id,
        metadata: { status: message.status, order_id: message.order_id || null, recipient_kind: message.recipient_kind },
      }));
    }

    const resolved = await resolveMissing(seen);
    const [openAlertCount, criticalAlertCount] = await Promise.all([
      client.from("ops_alerts").select("id", { count: "exact", head: true }).eq("status", "open"),
      client.from("ops_alerts").select("id", { count: "exact", head: true }).eq("status", "open").eq("severity", "critical"),
    ]);
    if (openAlertCount.error) throw openAlertCount.error;
    if (criticalAlertCount.error) throw criticalAlertCount.error;
    const snapshotDate = new Date().toISOString().slice(0, 10);
    const finalMetrics = {
      ...metrics,
      open_alerts: openAlertCount.count || 0,
      critical_alerts: criticalAlertCount.count || 0,
      site_health: healthChecks.every((check) => check.status === "healthy") ? "healthy" : "degraded",
      checks: Object.fromEntries(healthChecks.map((check) => [check.check_key, check.status])),
    };
    const { error: snapshotError } = await client.from("ops_daily_snapshots").upsert({
      snapshot_date: snapshotDate,
      metrics: finalMetrics,
      generated_at: new Date().toISOString(),
    }, { onConflict: "snapshot_date" });
    if (snapshotError) throw snapshotError;
    await notifyAdmin(touched);

    const { error: finishError } = await client.from("ops_monitor_runs").update({
      status: "completed",
      checks_total: healthChecks.length + touched.length,
      alerts_opened: touched.filter((item) => item.isNew).length,
      alerts_resolved: resolved,
      summary: finalMetrics,
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);
    if (finishError) throw finishError;
    return json({ ok: true, run_id: run.id, alerts_opened: touched.filter((item) => item.isNew).length, alerts_resolved: resolved });
  } catch (error) {
    await client.from("ops_monitor_runs").update({
      status: "failed",
      error: safeError(error),
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);
    console.error("ops-monitor failed", safeError(error));
    return json({ error: "Monitor failed", run_id: run.id }, 500);
  }
});
