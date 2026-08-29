import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/lib/locale';

export default getRequestConfig(async () => {
  // Per-user override (set by the header locale toggle) takes priority
  // over the deploy-time env var, which stays as a per-deployment default.
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const envLocale = process.env.NEXT_PUBLIC_APP_LOCALE;
  const locale = isLocale(cookieLocale) ? cookieLocale : isLocale(envLocale) ? envLocale : DEFAULT_LOCALE;

  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch (error) {
    // Fallback to English if the dictionary for the requested locale doesn't exist yet
    messages = (await import(`../../messages/en.json`)).default;
  }

  return {
    locale,
    messages
  };
});
