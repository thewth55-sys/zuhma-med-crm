// ============================================================
// POST /api/auth/log-session — records one row in login_events for
// the "Sesiones recientes" card in the admin Cuenta 360 panel. Fired
// client-side by useAuth() right after a genuine SIGNED_IN event (see
// use-auth.tsx), fire-and-forget — never blocks the sign-in UX.
// ============================================================

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getClientIp, checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { parseBrowser, parseDevice } from "@/lib/auth/parse-user-agent";
import { lookupCountry } from "@/lib/auth/geo-ip";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not an error — this route is best-effort telemetry, not something
  // the caller needs to know failed.
  if (!user) return NextResponse.json({ ok: true });

  const limit = checkRateLimit(`logSession:${user.id}`, RATE_LIMITS.logSession);
  if (!limit.success) return rateLimitResponse(limit);

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent");
  const country = await lookupCountry(ip);

  const { error } = await supabase.from("login_events").insert({
    user_id: user.id,
    account_id: profile?.account_id ?? null,
    ip_address: ip === "unknown" ? null : ip,
    user_agent: userAgent,
    browser: parseBrowser(userAgent),
    device: parseDevice(userAgent),
    country,
  });

  if (error) {
    console.error("[POST /api/auth/log-session] insert error:", error);
  }

  return NextResponse.json({ ok: true });
}
