// ============================================================
// POST /api/platform-admin/accounts/demo
//
// Crea una cuenta DEMO totalmente poblada (contactos, conversaciones
// tipo WhatsApp, perfiles de paciente y agenda — ver demo-seed.ts) para
// dar demos en vivo del producto vía "Impersonar", en vez de un
// dashboard vacío. No se invita ningún correo real: el usuario dueño se
// crea directo con la admin API y un correo interno no entregable, solo
// para que el trigger handle_new_user() y la impersonación funcionen sin
// cambios. Se etiqueta "Demo" y se puede eliminar desde el panel.
// ============================================================

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { seedDemoAccountData, DEMO_EMAIL_DOMAIN } from "@/lib/admin/demo-seed";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const adminCtx = await requirePlatformAdmin();

    const limit = checkRateLimit(`platformAdmin:createDemo:${adminCtx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "'name' es obligatorio" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const demoEmail = `demo-${randomUUID().slice(0, 8)}${DEMO_EMAIL_DOMAIN}`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: demoEmail,
      email_confirm: true,
      user_metadata: { full_name: "Cuenta demo", brand_name: name },
    });
    if (createErr || !created?.user) {
      console.error("[POST .../accounts/demo] createUser error:", createErr);
      return NextResponse.json({ error: "No se pudo crear el usuario dueño de la demo" }, { status: 500 });
    }

    const { data: account, error: accountErr } = await admin
      .from("accounts")
      .select("id")
      .eq("owner_user_id", created.user.id)
      .maybeSingle();
    if (accountErr || !account) {
      console.error("[POST .../accounts/demo] account lookup error:", accountErr);
      return NextResponse.json(
        { error: "El usuario se creó pero la cuenta no se inicializó — revisa handle_new_user" },
        { status: 500 },
      );
    }

    // Marca la cuenta como demo → el envío saliente puentea Meta (simulador).
    await admin.from("accounts").update({ is_demo: true }).eq("id", account.id);

    const { error: tagErr } = await admin
      .from("account_tags")
      .insert({ account_id: account.id, label: "Demo", created_by: adminCtx.userId });
    if (tagErr) {
      // No fatal — la cuenta es usable sin la etiqueta.
      console.error("[POST .../accounts/demo] tag insert error:", tagErr);
    }

    try {
      await seedDemoAccountData(admin, { accountId: account.id, ownerUserId: created.user.id });
    } catch (seedErr) {
      console.error("[POST .../accounts/demo] seed error:", seedErr);
      return NextResponse.json(
        { error: "La cuenta se creó pero no se pudieron cargar los datos demo" },
        { status: 500 },
      );
    }

    await logPlatformAdminAction({
      adminUserId: adminCtx.userId,
      adminEmail: adminCtx.email,
      action: "create_demo_account",
      targetAccountId: account.id,
      targetUserId: created.user.id,
      metadata: { accountName: name },
    });

    return NextResponse.json({ accountId: account.id, ownerEmail: demoEmail });
  } catch (err) {
    return toErrorResponse(err);
  }
}
