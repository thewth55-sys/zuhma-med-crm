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
/**
 * GET ?diag=1 — beacon de diagnóstico TEMPORAL desde push-registration.tsx.
 * Registra en el log del servidor qué condición (native/enabled/user) corta
 * el registro del token en el dispositivo. Sin secretos ni auth; quitar una
 * vez confirmado el push (buscar "[push/diag]").
 */
export function GET(request: Request) {
  const u = new URL(request.url);
  if (u.searchParams.get("diag") === "1") {
    const native = u.searchParams.get("native") === "true";
    const enabled = u.searchParams.get("enabled") === "true";
    const user = u.searchParams.get("user") === "true";
    console.log(`[push/diag] native=${native} enabled=${enabled} user=${user}`);
  }
  return NextResponse.json({ ok: true });
}

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
