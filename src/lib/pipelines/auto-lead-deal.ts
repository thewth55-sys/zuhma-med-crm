import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Crea automáticamente un negocio en la PRIMERA etapa del pipeline
 * principal de la cuenta cuando entra un lead nuevo (p.ej. primer mensaje
 * de un contacto de WhatsApp). Así cada conversación nueva aparece sola en
 * Prospectos, sin depender de una automatización.
 *
 * Best-effort: si la cuenta no tiene pipeline/etapas configurados, no hace
 * nada; cualquier error se registra y se traga (nunca debe romper la
 * recepción del mensaje que lo disparó).
 *
 * El pipeline "principal" es el más antiguo de la cuenta (la tabla
 * `pipelines` no tiene columna de orden) — normalmente el "Sales Pipeline"
 * por defecto. La etapa destino es la de menor `position` de ese pipeline
 * (la columna "New Lead").
 */
export async function createLeadDeal(
  db: SupabaseClient,
  args: {
    accountId: string;
    userId: string;
    contactId: string;
    conversationId?: string | null;
    title: string;
  },
): Promise<void> {
  try {
    const { data: pipeline } = await db
      .from("pipelines")
      .select("id")
      .eq("account_id", args.accountId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (!pipeline) return;

    const { data: stage } = await db
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", pipeline.id)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (!stage) return;

    const { data: acct } = await db
      .from("accounts")
      .select("default_currency")
      .eq("id", args.accountId)
      .maybeSingle<{ default_currency: string | null }>();

    await db.from("deals").insert({
      account_id: args.accountId,
      user_id: args.userId,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      contact_id: args.contactId,
      conversation_id: args.conversationId ?? null,
      title: args.title,
      value: 0,
      currency: acct?.default_currency ?? "USD",
      status: "open",
    });
  } catch (err) {
    console.error("[createLeadDeal] failed:", err);
  }
}
