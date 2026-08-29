import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { dispatchConversionEvent } from "@/lib/conversions/dispatch";

/**
 * POST /api/conversions/pipeline-event
 *
 * Dispara un evento de conversión de pipeline server-side a partir de un
 * dealId. El cliente sólo manda el id del deal y el evento; el correo,
 * teléfono y orderId del contacto se resuelven aquí, de modo que el hash
 * y las credenciales de Google Ads nunca tocan el navegador.
 *
 * Eventos:
 *   deal_won          → sube "Paciente" (ECL, valor del deal)
 *   lead_qualified    → sube "Lead calificado" (ECL, valor medio) [botón manual]
 *   lead_disqualified → retracta el "Lead" original (por orderId)
 */
const ALLOWED = new Set(["deal_won", "lead_qualified", "lead_disqualified"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.account_id) {
    return NextResponse.json({ error: "Tu perfil no está ligado a una cuenta." }, { status: 403 });
  }

  const limit = checkRateLimit(`conversions:pipeline:${user.id}`, RATE_LIMITS.adminAction);
  if (!limit.success) return rateLimitResponse(limit);

  const body = await request.json().catch(() => null);
  const dealId = typeof body?.dealId === "string" ? body.dealId : "";
  const event = typeof body?.event === "string" ? body.event : "";
  if (!dealId || !ALLOWED.has(event)) {
    return NextResponse.json({ error: "dealId y un event válido son requeridos." }, { status: 400 });
  }

  // RLS limita a los deals de la cuenta del usuario.
  const { data: deal } = await supabase
    .from("deals")
    .select("id, value, currency, contact_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });

  const { data: contact } = await supabase
    .from("contacts")
    .select("email, phone, google_order_id")
    .eq("id", deal.contact_id)
    .maybeSingle();

  await dispatchConversionEvent(
    supabase,
    profile.account_id,
    event as "deal_won" | "lead_qualified" | "lead_disqualified",
    {
      email: contact?.email ?? undefined,
      phone: contact?.phone ?? undefined,
      dealValue: typeof deal.value === "number" ? deal.value : undefined,
      dealCurrency: deal.currency ?? undefined,
      orderId: contact?.google_order_id ?? undefined,
    },
  );

  return NextResponse.json({ ok: true });
}
