import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";
import { hash2faCode, TWO_FA_MAX_ATTEMPTS } from "@/lib/auth/two-factor";
import {
  TRUSTED_DEVICE_COOKIE,
  TRUSTED_DEVICE_TTL_DAYS,
  newTrustedDeviceToken,
  hashTrustedDeviceToken,
  trustedDeviceExpiryFromNow,
} from "@/lib/auth/trusted-device";
import { parseBrowser, parseDevice } from "@/lib/auth/parse-user-agent";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS, getClientIp } from "@/lib/rate-limit";

/**
 * Paso 2 del login con 2FA. Verifica el código del reto y, si es válido,
 * recién ahí establece la sesión (descifra los tokens guardados en el
 * paso 1). Si el usuario marcó "recordar dispositivo", crea un
 * trusted_device y setea la cookie (60 días) para saltar el 2FA la
 * próxima vez.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const challengeId = typeof body?.challengeId === "string" ? body.challengeId : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const rememberDevice = body?.rememberDevice === true;

  if (!challengeId || !code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const limit = checkRateLimit(`login2fa:${ip}:${challengeId}`, RATE_LIMITS.login2fa);
  if (!limit.success) return rateLimitResponse(limit);

  const admin = supabaseAdmin();
  const { data: challenge } = await admin
    .from("login_2fa_challenges")
    .select("id, user_id, code_hash, encrypted_session, attempts, expires_at, consumed_at")
    .eq("id", challengeId)
    .maybeSingle();

  if (!challenge || challenge.consumed_at || new Date(challenge.expires_at) < new Date()) {
    return NextResponse.json({ error: "Code expired. Please sign in again." }, { status: 400 });
  }
  if (challenge.attempts >= TWO_FA_MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many attempts. Please sign in again." }, { status: 429 });
  }

  if (hash2faCode(code) !== challenge.code_hash) {
    await admin
      .from("login_2fa_challenges")
      .update({ attempts: challenge.attempts + 1 })
      .eq("id", challenge.id);
    return NextResponse.json({ error: "Incorrect code" }, { status: 401 });
  }

  // Código correcto: consumir el reto y establecer la sesión.
  await admin.from("login_2fa_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id);

  let tokens: { access_token: string; refresh_token: string };
  try {
    tokens = JSON.parse(decrypt(challenge.encrypted_session));
  } catch (err) {
    console.error("[auth/verify] session decrypt failed:", err);
    return NextResponse.json({ error: "Could not start session" }, { status: 500 });
  }

  const supabase = await createClient();
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  if (sessionError) {
    return NextResponse.json({ error: "Could not start session" }, { status: 500 });
  }

  // Recordar dispositivo (60 días).
  if (rememberDevice) {
    const token = newTrustedDeviceToken();
    const ua = request.headers.get("user-agent");
    const label = [parseBrowser(ua), parseDevice(ua)].filter(Boolean).join(" · ") || null;
    const expires = trustedDeviceExpiryFromNow();
    await admin.from("trusted_devices").insert({
      user_id: challenge.user_id,
      token_hash: hashTrustedDeviceToken(token),
      label,
      ip_address: ip === "unknown" ? null : ip,
      expires_at: expires.toISOString(),
    });
    const cookieStore = await cookies();
    cookieStore.set(TRUSTED_DEVICE_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: TRUSTED_DEVICE_TTL_DAYS * 86_400,
    });
  }

  return NextResponse.json({ success: true });
}
