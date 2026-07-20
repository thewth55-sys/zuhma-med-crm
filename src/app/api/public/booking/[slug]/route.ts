import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { getPublicBookingConfig } from "@/lib/scheduling/public-booking";
import { checkRateLimit, getClientIp, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/public/booking/[slug] — config for the public booking
 * widget's client-side interactivity (re-fetched here rather than
 * only passed down from the SSR page, since the widget also needs it
 * after client-side navigation). No session exists for an anonymous
 * visitor, so this always runs through the service-role client — same
 * posture as the WhatsApp webhook.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`public-booking-config:${ip}`, RATE_LIMITS.publicBookingRead);
  if (!limit.success) return rateLimitResponse(limit);

  const { slug } = await params;
  const config = await getPublicBookingConfig(supabaseAdmin(), slug);

  if (!config) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    accountName: config.accountName,
    doctors: config.doctors,
    serviceTypes: config.serviceTypes,
  });
}
