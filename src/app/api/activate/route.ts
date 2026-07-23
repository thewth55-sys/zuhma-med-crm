import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { hashActivationCode, TERMS_VERSION } from "@/lib/auth/activation-code";
import { getPasswordStrengthError } from "@/lib/password-strength";

/**
 * POST /api/activate  (public)
 *
 * Completes the onboarding of an account owner created from /admin. The
 * owner receives an activation CODE by email (not a one-time link, which
 * mail scanners consume → otp_expired) and submits it here together with
 * a new password and explicit Terms & Conditions acceptance.
 *
 * On success: sets the password + confirms the email, records the T&C
 * acceptance (timestamp + version) on the profile, and burns the code.
 * The client then signs in with the password it just set.
 *
 * Enumeration is bounded by a per-email rate limit and by returning a
 * generic error when the email/code pair doesn't match.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body?.code === "string" ? body.code : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const termsAccepted = body?.termsAccepted === true;

    if (!email || !code || !password) {
      return NextResponse.json({ error: "Faltan datos requeridos." }, { status: 400 });
    }
    if (!termsAccepted) {
      return NextResponse.json(
        { error: "Debes aceptar los Términos y Condiciones para activar tu cuenta." },
        { status: 400 },
      );
    }
    if (getPasswordStrengthError(password)) {
      return NextResponse.json(
        { error: "La contraseña no cumple los requisitos (mínimo 8 caracteres)." },
        { status: 400 },
      );
    }

    const limit = checkRateLimit(`activate:${email}`, RATE_LIMITS.activate);
    if (!limit.success) return rateLimitResponse(limit);

    const db = supabaseAdmin();

    // Resolve the owner from the email, then the account they own (the
    // activation code lives on that account row).
    const { data: profile } = await db
      .from("profiles")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();

    const invalid = NextResponse.json(
      { error: "El correo o el código no son válidos." },
      { status: 400 },
    );
    if (!profile?.user_id) return invalid;

    const { data: account } = await db
      .from("accounts")
      .select("id, activation_code_hash, activation_code_expires_at, activation_code_used_at")
      .eq("owner_user_id", profile.user_id)
      .maybeSingle();

    if (!account?.activation_code_hash) return invalid;
    if (hashActivationCode(code) !== account.activation_code_hash) return invalid;

    if (account.activation_code_used_at) {
      return NextResponse.json(
        { error: "Este código ya fue usado. Si ya activaste tu cuenta, inicia sesión." },
        { status: 400 },
      );
    }
    if (
      account.activation_code_expires_at &&
      new Date(account.activation_code_expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "El código expiró. Pide a tu contacto en Zuhma que te reenvíe uno nuevo." },
        { status: 400 },
      );
    }

    // Set the password + confirm the email in one call.
    const { error: updateErr } = await db.auth.admin.updateUserById(profile.user_id, {
      password,
      email_confirm: true,
    });
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Record T&C acceptance and burn the code. Best-effort but logged —
    // the account is already usable at this point.
    await db
      .from("profiles")
      .update({ terms_accepted_at: now, terms_version: TERMS_VERSION })
      .eq("user_id", profile.user_id);

    await db
      .from("accounts")
      .update({ activation_code_used_at: now })
      .eq("id", account.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/activate] unexpected error:", err);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
