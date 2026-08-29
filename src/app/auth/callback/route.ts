// ============================================================
// GET /auth/callback
//
// Exchanges a Supabase PKCE `code` (password-reset email link, and
// now the platform-admin impersonation magic link) for a real
// session, then redirects to `next`. This route was already assumed
// to exist — forgot-password/page.tsx has pointed
// `resetPasswordForEmail`'s `redirectTo` here since it was written —
// but it was never created, so the reset-password email link has
// been landing on a 404 with no session established. Built now
// because impersonation depends on the exact same exchange.
// ============================================================

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin-client";

// Resolution order mirrors getBaseUrl() in
// /api/account/invitations/route.ts: NEXT_PUBLIC_SITE_URL first, then
// proxy headers, then the bare Host header. Deliberately does NOT use
// `new URL(request.url).origin` — behind Easypanel's proxy that
// resolved to the container's internal bind address (0.0.0.0:80)
// instead of the public domain, sending every confirmation-email
// click to a dead URL.
function getBaseUrl(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  const host = request.headers.get("host")?.trim();
  if (host) {
    const reqProto = new URL(request.url).protocol.replace(":", "");
    return `${reqProto}://${host}`;
  }

  return "https://app.zuhma.com";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const baseUrl = getBaseUrl(request);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Gate del login social: en este producto no hay auto-registro. Si el
      // usuario NO tiene perfil (login con Google de un correo sin cuenta;
      // el trigger handle_new_user ya no aprovisiona para social), se
      // rechaza y se limpia el usuario huérfano. Los flujos con cuenta
      // (reset de contraseña, impersonación, invitados enlazados) sí tienen
      // perfil y pasan sin problema.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!profile) {
          await supabase.auth.signOut();
          try {
            await supabaseAdmin().auth.admin.deleteUser(user.id);
          } catch (delErr) {
            console.error("[GET /auth/callback] orphan user cleanup failed:", delErr);
          }
          return NextResponse.redirect(`${baseUrl}/login?error=no_account`);
        }
      }
      return NextResponse.redirect(`${baseUrl}${next}`);
    }
    console.error("[GET /auth/callback] exchangeCodeForSession failed:", error);
  }

  return NextResponse.redirect(`${baseUrl}/login?error=auth_callback_failed`);
}
