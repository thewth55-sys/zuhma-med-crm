import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Server-side Turnstile verification. Mirrors the WhatsApp/Meta
 * outbound-call style (plain fetch, AbortSignal.timeout). Skips
 * verification (returns true) when TURNSTILE_SECRET_KEY isn't set —
 * keeps local dev working without a Cloudflare account; the paired
 * client-side widget (src/components/auth/turnstile-widget.tsx)
 * likewise renders nothing when its site key is unset, so the two
 * stay consistent.
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

/**
 * Login goes through this route (instead of calling
 * supabase.auth.signInWithPassword directly from the browser) so the
 * Turnstile token can be verified server-side before Supabase is ever
 * called — a client-only check can't stop someone hitting Supabase's
 * REST API directly with the (public) anon key.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const turnstileToken = typeof body?.turnstileToken === "string" ? body.turnstileToken : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  if (process.env.TURNSTILE_SECRET_KEY && !turnstileToken) {
    return NextResponse.json({ error: "Please complete the CAPTCHA" }, { status: 400 });
  }

  const remoteIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const captchaValid = await verifyTurnstileToken(turnstileToken, remoteIp);
  if (!captchaValid) {
    return NextResponse.json({ error: "CAPTCHA verification failed" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ success: true });
}
