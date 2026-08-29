import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { encrypt } from "@/lib/whatsapp/encryption";
import { generate2faCode, hash2faCode, twoFaExpiryFromNow } from "@/lib/auth/two-factor";
import { TRUSTED_DEVICE_COOKIE, hashTrustedDeviceToken } from "@/lib/auth/trusted-device";
import { sendLogin2faEmail } from "@/lib/email/login-2fa-email";
import { parseBrowser, parseDevice } from "@/lib/auth/parse-user-agent";
import { lookupCountry } from "@/lib/auth/geo-ip";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS, getClientIp } from "@/lib/rate-limit";

/**
 * Server-side Turnstile verification. Skips (returns true) when
 * TURNSTILE_SECRET_KEY isn't set — keeps local dev working; the paired
 * client widget likewise renders nothing when its site key is unset.
 */
async function verifyTurnstileToken(token: string, remoteIp: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error("[auth/login] Turnstile verification failed:", err);
    return false;
  }
}

/** Cliente Supabase anónimo que NO persiste cookies — para validar
 *  credenciales sin dejar al usuario logueado antes de pasar el 2FA. */
function nonPersistingClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Paso 1 del login. Verifica captcha + credenciales. Si el dispositivo
 * es de confianza (cookie válida) crea la sesión y termina. Si no, genera
 * un código 2FA, lo manda por correo y responde `mfaRequired` SIN crear
 * sesión — la sesión (cifrada) queda guardada en el reto para el paso 2.
 *
 * En la app Android esta ruta solo se ejecuta al usar el formulario de
 * login (primer inicio o tras logout); las aperturas normales restauran
 * la sesión nativa y no pasan por aquí, así que el 2FA no molesta al
 * biométrico ni se pide en cada apertura.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const turnstileToken = typeof body?.turnstileToken === "string" ? body.turnstileToken : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const limit = checkRateLimit(`login:${ip}:${email.toLowerCase()}`, RATE_LIMITS.login);
  if (!limit.success) return rateLimitResponse(limit);

  // Fail-open opcional: si TURNSTILE_FAIL_OPEN='true', un token ausente o
  // inválido NO bloquea el login. Pensado para dispositivos que no logran
  // resolver Turnstile (reloj desfasado, DNS/VPN, WebView viejo) y quedarían
  // 100% bloqueados. La seguridad restante sigue activa: rate-limit por
  // IP+correo, contraseña y 2FA por correo. Por defecto (sin la env) el
  // comportamiento es estricto, como antes.
  const captchaFailOpen = process.env.TURNSTILE_FAIL_OPEN === "true";
  if (process.env.TURNSTILE_SECRET_KEY && !turnstileToken) {
    if (!captchaFailOpen) {
      return NextResponse.json({ error: "Please complete the CAPTCHA" }, { status: 400 });
    }
    console.warn("[auth/login] Turnstile token ausente — permitido por TURNSTILE_FAIL_OPEN");
  } else {
    const captchaValid = await verifyTurnstileToken(turnstileToken, ip === "unknown" ? null : ip);
    if (!captchaValid) {
      if (!captchaFailOpen) {
        return NextResponse.json({ error: "CAPTCHA verification failed" }, { status: 400 });
      }
      console.warn("[auth/login] Turnstile inválido — permitido por TURNSTILE_FAIL_OPEN");
    }
  }

  // Validación de credenciales SIN persistir la sesión.
  const anon = nonPersistingClient();
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError || !signIn.session || !signIn.user) {
    return NextResponse.json({ error: signInError?.message || "Invalid credentials" }, { status: 401 });
  }
  const { session, user } = signIn;

  // ¿Dispositivo de confianza? (salta el 2FA)
  const cookieStore = await cookies();
  const tdToken = cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value;
  if (tdToken) {
    const admin = supabaseAdmin();
    const { data: dev } = await admin
      .from("trusted_devices")
      .select("id")
      .eq("user_id", user.id)
      .eq("token_hash", hashTrustedDeviceToken(tdToken))
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (dev) {
      await admin.from("trusted_devices").update({ last_used_at: new Date().toISOString() }).eq("id", dev.id);
      const supabase = await createClient();
      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (error) {
        return NextResponse.json({ error: "Could not start session" }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }
  }

  // Dispositivo nuevo → emitir reto 2FA.
  const code = generate2faCode();
  const admin = supabaseAdmin();
  const encryptedSession = encrypt(
    JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }),
  );
  const { data: challenge, error: challengeError } = await admin
    .from("login_2fa_challenges")
    .insert({
      user_id: user.id,
      email,
      code_hash: hash2faCode(code),
      encrypted_session: encryptedSession,
      expires_at: twoFaExpiryFromNow(),
      ip_address: ip === "unknown" ? null : ip,
    })
    .select("id")
    .single();

  if (challengeError || !challenge) {
    console.error("[auth/login] challenge insert failed:", challengeError);
    return NextResponse.json({ error: "Could not start verification" }, { status: 500 });
  }

  const ua = request.headers.get("user-agent");
  const device = [parseBrowser(ua), parseDevice(ua)].filter(Boolean).join(" · ") || null;
  const location = await lookupCountry(ip);
  try {
    await sendLogin2faEmail({ to: email, code, device, location });
  } catch (err) {
    console.error("[auth/login] 2FA email failed:", err);
    return NextResponse.json({ error: "Could not send the verification code" }, { status: 500 });
  }

  return NextResponse.json({ mfaRequired: true, challengeId: challenge.id });
}
