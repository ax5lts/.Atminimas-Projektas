import { adminClient, handleOptions, json } from "../_shared/core.ts";

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const client = adminClient();
    const { data, error } = await client
      .from("business_profile")
      .select(
        "legal_name,activity_form,registration_code,vat_code,address,email,phone,updated_at",
      )
      .eq("singleton", true)
      .maybeSingle();
    if (error) throw error;

    const vatCode = cleanText(data?.vat_code, 80);
    return json({
      business: {
        legalName: cleanText(data?.legal_name, 200),
        activityForm: cleanText(data?.activity_form, 160),
        registrationCode: cleanText(data?.registration_code, 80),
        registry:
          "Valstybinės mokesčių inspekcijos Mokesčių mokėtojų registras",
        address: cleanText(data?.address, 300),
        email: cleanText(data?.email, 254),
        phone: cleanText(data?.phone, 40),
        vatStatus: vatCode
          ? `PVM mokėtojas, kodas ${vatCode}`
          : "Ne PVM mokėtojas",
      },
      updatedAt: data?.updated_at || null,
    }, 200, {
      "Cache-Control":
        "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    });
  } catch (error) {
    console.error("business-profile failed", error);
    return json({ error: "Rekvizitų įkelti nepavyko" }, 500);
  }
});
