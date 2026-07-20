// ============================================================
// Meta Marketing API helpers for the direct Ads/CAPI connection —
// same config_id-driven "Facebook Login for Business" exchange as
// WhatsApp Embedded Signup (whatsapp/meta-api.ts), just against a
// different Login Configuration (ads_management/business_management/
// read_insights instead of whatsapp_business_management), and reused
// here so the two integrations don't duplicate the OAuth/error-shape
// plumbing.
// ============================================================

import { throwMetaError } from "@/lib/whatsapp/meta-api";

const META_API_VERSION = "v21.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export interface ExchangeMetaAdsSignupCodeArgs {
  code: string;
}

export interface ExchangeMetaAdsSignupCodeResult {
  accessToken: string;
  /** Only present if Meta's response included one — see the migration's doc comment. */
  expiresAt: Date | null;
}

export async function exchangeMetaAdsSignupCode(
  args: ExchangeMetaAdsSignupCodeArgs,
): Promise<ExchangeMetaAdsSignupCodeResult> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("META_APP_ID / META_APP_SECRET are not configured");
  }

  const url = new URL(`${META_API_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", args.code);

  const response = await fetch(url.toString());
  if (!response.ok) {
    await throwMetaError(response, `Meta OAuth exchange failed: ${response.status}`);
  }
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Meta OAuth exchange returned no access_token");
  }
  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
  };
}

export interface MetaAdAccount {
  id: string;
  name: string;
}

/** Lists the ad accounts the user just granted access to via the login popup. */
export async function listAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const url = `${META_API_BASE}/me/adaccounts?fields=id,name&access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url);
  if (!response.ok) {
    await throwMetaError(response, `Failed to list ad accounts: ${response.status}`);
  }
  const data = (await response.json()) as { data?: MetaAdAccount[] };
  return data.data ?? [];
}

export interface MetaPixel {
  id: string;
  name: string;
}

/** Lists the Meta Pixels owned by a given ad account. An ad account can own zero, one, or several. */
export async function listPixelsForAdAccount(adAccountId: string, accessToken: string): Promise<MetaPixel[]> {
  const url = `${META_API_BASE}/${adAccountId}/adspixels?fields=id,name&access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url);
  if (!response.ok) {
    await throwMetaError(response, `Failed to list pixels: ${response.status}`);
  }
  const data = (await response.json()) as { data?: MetaPixel[] };
  return data.data ?? [];
}
