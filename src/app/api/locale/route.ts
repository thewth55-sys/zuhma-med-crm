import { NextResponse } from 'next/server';

import { LOCALE_COOKIE, isLocale } from '@/lib/locale';

/**
 * Sets the per-user UI locale override. No auth required — locale
 * isn't sensitive, and this just flips which `messages/*.json` file
 * `src/i18n/request.ts` loads on the next request.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const locale = body?.locale;

  if (!isLocale(locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
  }

  const response = NextResponse.json({ success: true, locale });
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return response;
}
