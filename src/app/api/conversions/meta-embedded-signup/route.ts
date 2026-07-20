import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { encrypt } from '@/lib/whatsapp/encryption';
import { exchangeMetaAdsSignupCode, listAdAccounts, listPixelsForAdAccount } from '@/lib/conversions/meta-ads-api';

/**
 * POST /api/conversions/meta-embedded-signup
 *
 * Backend half of the direct Meta Ads/CAPI connection — the frontend
 * button (components/settings/meta-ads-embedded-signup-button.tsx)
 * runs Meta's hosted Business Login popup and hands this route the
 * resulting `code`. Unlike WhatsApp's version of this flow, there's no
 * separate phone-number lookup: this route exchanges the code, then
 * auto-discovers which ad account (and, under it, which pixel) the
 * client just granted access to — that's the whole point of this
 * integration, no Business Manager/Events Manager IDs to type in.
 *
 * Picks the FIRST ad account and FIRST pixel it finds. Most accounts
 * only have one of each; a picker UI for the rare case of several is
 * deliberately left out of this first version — worth adding only if
 * it turns out to matter in practice.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');

    const body = await request.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code : '';
    if (!code) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }

    let accessToken: string;
    let expiresAt: Date | null;
    try {
      const result = await exchangeMetaAdsSignupCode({ code });
      accessToken = result.accessToken;
      expiresAt = result.expiresAt;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta OAuth error';
      console.error('[conversions/meta-embedded-signup] code exchange failed:', message);
      return NextResponse.json({ error: `Meta OAuth error: ${message}` }, { status: 400 });
    }

    let adAccounts;
    try {
      adAccounts = await listAdAccounts(accessToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error';
      return NextResponse.json({ error: `Could not list ad accounts: ${message}` }, { status: 400 });
    }
    const adAccount = adAccounts[0];
    if (!adAccount) {
      return NextResponse.json(
        { error: 'No ad account was shared. Reconnect and make sure to select an ad account in the popup.' },
        { status: 400 },
      );
    }

    let pixels;
    try {
      pixels = await listPixelsForAdAccount(adAccount.id, accessToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error';
      return NextResponse.json({ error: `Could not list pixels: ${message}` }, { status: 400 });
    }
    const pixel = pixels[0];
    if (!pixel) {
      return NextResponse.json(
        {
          error:
            'That ad account has no Meta Pixel yet. Create one in Meta Events Manager, then reconnect.',
        },
        { status: 400 },
      );
    }

    const { error } = await supabase.from('conversion_tracking_config').upsert(
      {
        account_id: accountId,
        created_by: userId,
        meta_pixel_id: pixel.id,
        meta_access_token: encrypt(accessToken),
        meta_ad_account_id: adAccount.id,
        meta_token_expires_at: expiresAt ? expiresAt.toISOString() : null,
      },
      { onConflict: 'account_id' },
    );

    if (error) {
      console.error('[conversions/meta-embedded-signup] save error:', error);
      return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      adAccountName: adAccount.name,
      pixelId: pixel.id,
      pixelName: pixel.name,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
