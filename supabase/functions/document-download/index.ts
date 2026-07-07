import { handleOptions, json, requireUser } from "../_shared/core.ts";

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const { client, user } = await requireUser(request);
    const url = new URL(request.url);
    const orderId = url.searchParams.get("order") || "";
    const type = url.searchParams.get("type") || "invoice";
    if (!orderId || !["invoice", "qr", "label"].includes(type)) return json({ error: "Neteisinga užklausa" }, 400);

    const { data: order } = await client.from("uzsakymai").select("id,profilis_id,label_storage_path,profiliai!inner(owner_id)").eq("id", orderId).maybeSingle();
    const { data: role } = await client.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const ownerId = (order?.profiliai as { owner_id?: string } | null)?.owner_id;
    if (!order || (ownerId !== user.id && role?.role !== "admin")) return json({ error: "Prieiga draudžiama" }, 403);

    let path: string | null = null;
    if (type === "invoice") {
      const { data } = await client.from("invoice_documents").select("storage_path").eq("order_id", order.id).maybeSingle();
      path = data?.storage_path || null;
    } else if (type === "qr") {
      const { data } = await client.from("production_jobs").select("qr_pdf_path,qr_svg_path").eq("order_id", order.id).maybeSingle();
      path = data?.qr_pdf_path || data?.qr_svg_path || null;
    } else {
      path = order.label_storage_path;
    }
    if (!path) return json({ error: "Dokumentas dar neparuoštas" }, 404);
    const { data, error } = await client.storage.from("automation-documents").createSignedUrl(path, 120);
    if (error || !data?.signedUrl) throw error || new Error("Nepavyko sukurti nuorodos");
    return Response.redirect(data.signedUrl, 302);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Nepavyko atidaryti dokumento" }, 401);
  }
});
