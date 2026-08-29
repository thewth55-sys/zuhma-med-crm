import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/google-calendar/client";
import { encrypt } from "@/lib/whatsapp/encryption";
import { getBaseUrl } from "@/lib/site-url";

const REDIRECT_PATH = "/settings?tab=profile";

/**
 * GET /api/google-calendar/callback — Google redirects here after
 * consent. `state` carries the user id from connect/route.ts, but
 * isn't trusted on its own: the callback re-checks it against
 * whoever is logged in right now (state can't be forged into a valid
 * Supabase session, so this closes the only gap that would matter).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateUserId = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const baseUrl = getBaseUrl(request);

  if (oauthError || !code || !stateUserId) {
    return NextResponse.redirect(`${baseUrl}${REDIRECT_PATH}&google=error`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }
  if (user.id !== stateUserId) {
    return NextResponse.redirect(`${baseUrl}${REDIRECT_PATH}&google=error`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refreshToken) {
      // Shouldn't happen — connect/route.ts always sends prompt=consent,
      // which forces Google to issue one — but fail loud rather than
      // silently "connecting" with nothing to refresh later.
      console.error("[google-calendar callback] no refresh_token in response");
      return NextResponse.redirect(`${baseUrl}${REDIRECT_PATH}&google=error`);
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        google_calendar_connected: true,
        google_calendar_id: "primary",
        google_refresh_token: encrypt(tokens.refreshToken),
        google_calendar_connected_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (error) {
      console.error("[google-calendar callback] update error:", error);
      return NextResponse.redirect(`${baseUrl}${REDIRECT_PATH}&google=error`);
    }
  } catch (err) {
    console.error("[google-calendar callback] token exchange failed:", err);
    return NextResponse.redirect(`${baseUrl}${REDIRECT_PATH}&google=error`);
  }

  return NextResponse.redirect(`${baseUrl}${REDIRECT_PATH}&google=connected`);
}
