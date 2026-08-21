import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";

const PLATFORMS = ["android", "ios", "web"] as const;

/**
 * POST /api/push/register — upsert del token FCM de este dispositivo
 * para el usuario con sesión. Lo llama la app Capacitor en cuanto tiene
 * un token (ver push-registration.tsx) — al primer arranque y cada vez
 * que el OS rota el token.
 *
 * DELETE /api/push/register — desregistra un token (p.ej. al cerrar
 * sesión), para que un dispositivo viejo deje de recibir pushes de una
 * cuenta a la que ya no pertenece.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole("viewer");
    const body = await request.json().catch(() => ({}));

    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const platform = PLATFORMS.includes(body?.platform) ? body.platform : "android";

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("push_tokens")
      .upsert(
        { account_id: accountId, user_id: userId, token, platform },
        { onConflict: "user_id,token" },
      );

    if (error) {
      console.error("[push/register POST] upsert error:", error);
      return NextResponse.json({ error: "Failed to register push token" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, userId } = await requireRole("viewer");
    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const { error } = await supabase.from("push_tokens").delete().eq("user_id", userId).eq("token", token);

    if (error) {
      console.error("[push/register DELETE] delete error:", error);
      return NextResponse.json({ error: "Failed to unregister push token" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
