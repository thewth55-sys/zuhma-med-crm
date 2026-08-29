import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { TRUSTED_DEVICE_COOKIE, hashTrustedDeviceToken } from "@/lib/auth/trusted-device";

/**
 * Limpieza de "dispositivo de confianza" al cerrar sesión. Borra la
 * cookie httpOnly (solo se puede borrar en servidor) y su fila en
 * trusted_devices, de modo que el próximo inicio de sesión en este
 * dispositivo vuelva a pedir el código 2FA — el comportamiento pedido
 * para la app Android tras logout. La revocación de la sesión de
 * Supabase la sigue haciendo el cliente (useAuth.signOut).
 */
export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value;

  if (token) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabaseAdmin()
          .from("trusted_devices")
          .delete()
          .eq("user_id", user.id)
          .eq("token_hash", hashTrustedDeviceToken(token));
      }
    } catch (err) {
      console.error("[auth/logout] trusted device cleanup failed:", err);
    }
    cookieStore.set(TRUSTED_DEVICE_COOKIE, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return NextResponse.json({ ok: true });
}
