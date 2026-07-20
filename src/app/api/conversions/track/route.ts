import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { dispatchConversionEvent, getGoogleAdsConversionParams } from '@/lib/conversions/dispatch';
import { CONVERSION_EVENTS, type ConversionEvent } from '@/lib/conversions/events';

/**
 * Client-triggered conversion hook. The dashboard UI calls this
 * right after a client-side Supabase mutation succeeds (adding a
 * contact, marking a deal won) — mutations that never pass through a
 * server route, so there's no other place to fire the server-side
 * Meta CAPI call. Also returns the Google Ads {conversionId, label}
 * for that event so the browser can fire `gtag()` immediately.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();
    const body = await request.json().catch(() => null);
    const event = body?.event as ConversionEvent | undefined;

    if (!event || !(CONVERSION_EVENTS as readonly string[]).includes(event)) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }

    await dispatchConversionEvent(supabase, accountId, event, {
      phone: typeof body.phone === 'string' ? body.phone : undefined,
      email: typeof body.email === 'string' ? body.email : undefined,
      dealValue: typeof body.dealValue === 'number' ? body.dealValue : undefined,
      dealCurrency: typeof body.dealCurrency === 'string' ? body.dealCurrency : undefined,
    });

    const google_ads = await getGoogleAdsConversionParams(supabase, accountId, event);
    return NextResponse.json({ google_ads });
  } catch (err) {
    return toErrorResponse(err);
  }
}
