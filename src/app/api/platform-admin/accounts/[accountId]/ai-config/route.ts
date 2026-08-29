// ============================================================
// PATCH /api/platform-admin/accounts/[accountId]/ai-config
//
// Lets a platform admin set up or fix an account's AI provider config
// on their behalf (support scenario: client can't get their own key
// working, or asked staff to configure it for them) — same
// validate-before-save + AES-256-GCM-at-rest posture as the client's
// own Settings → Agentes IA form (src/app/api/ai/config/route.ts).
// Deliberately narrower: no embeddings key / handoff routing / auto-
// reply tuning here, those stay the account's own Settings concern.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { encrypt } from "@/lib/whatsapp/encryption";
import { validateAiCredentials } from "@/lib/ai/validate";
import type { AiProvider } from "@/lib/ai/types";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function PATCH(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId } = await params;

    const limit = checkRateLimit(`platformAdmin:aiConfig:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const provider = body?.provider as AiProvider | undefined;
    if (provider !== "openai" && provider !== "anthropic") {
      return NextResponse.json({ error: 'provider debe ser "openai" o "anthropic"' }, { status: 400 });
    }
    const model = typeof body?.model === "string" ? body.model.trim() : "";
    if (!model) return NextResponse.json({ error: "model es requerido" }, { status: 400 });
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey) return NextResponse.json({ error: "apiKey es requerido" }, { status: 400 });
    const isActive = body?.isActive !== false;

    try {
      await validateAiCredentials({
        provider,
        model,
        apiKey,
        systemPrompt: null,
        isActive: true,
        autoReplyEnabled: false,
        autoReplyMaxPerConversation: 3,
        handoffAgentId: null,
        embeddingsApiKey: null,
        agendaAccessEnabled: false,
      });
    } catch {
      return NextResponse.json(
        { error: "No se pudo validar la clave con el proveedor — revisa que sea correcta" },
        { status: 400 },
      );
    }

    const db = supabaseAdmin();
    const { error } = await db.from("ai_configs").upsert(
      {
        account_id: accountId,
        provider,
        model,
        api_key: encrypt(apiKey),
        is_active: isActive,
        created_by: admin.userId,
      },
      { onConflict: "account_id" },
    );

    if (error) {
      console.error("[PATCH /api/platform-admin/accounts/:id/ai-config] upsert error:", error);
      return NextResponse.json({ error: "No se pudo guardar la configuración" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "set_ai_config",
      targetAccountId: accountId,
      metadata: { provider, model, isActive },
    });

    return NextResponse.json({ ok: true, provider, model, isActive });
  } catch (err) {
    return toErrorResponse(err);
  }
}
