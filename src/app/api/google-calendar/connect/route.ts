import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl } from "@/lib/google-calendar/client";
import { getBaseUrl } from "@/lib/site-url";

/**
 * GET /api/google-calendar/connect — starts the OAuth consent flow.
 * Any signed-in account member connects THEIR OWN calendar (no
 * admin-on-behalf-of flow — Google's consent screen has to be
 * completed by the actual account owner). `state` carries the user
 * id; the callback re-verifies it against the session that returns
 * from Google rather than trusting it outright.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${getBaseUrl(request)}/login`);
  }

  return NextResponse.redirect(buildAuthUrl(user.id));
}
