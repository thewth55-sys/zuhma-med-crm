import { NextResponse } from 'next/server';

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { encrypt } from '@/lib/whatsapp/encryption';

/**
 * Settings-class config for Meta CAPI + Google Ads conversion
 * tracking. Any member can read (GET); only admin+ can write. Mirrors
 * `whatsapp_config` / `ai_configs`: `meta_access_token` is
 * AES-256-GCM-encrypted at rest and never round-tripped to the
 * client — GET replaces it with a `has_token` boolean.
 */

interface ConfigRow {
  meta_pixel_id: string | null;
  meta_access_token: string | null;
  meta_test_event_code: string | null;
  meta_track_lead_created: boolean;
  meta_track_deal_won: boolean;
  meta_track_first_reply: boolean;
  meta_track_automations: boolean;
  google_ads_conversion_id: string | null;
  google_ads_lead_created_label: string | null;
  google_ads_deal_won_label: string | null;
  google_ads_first_reply_label: string | null;
}

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    const { data, error } = await supabase
      .from('conversion_tracking_config')
      .select(
        'meta_pixel_id, meta_access_token, meta_test_event_code, meta_track_lead_created, meta_track_deal_won, meta_track_first_reply, meta_track_automations, google_ads_conversion_id, google_ads_lead_created_label, google_ads_deal_won_label, google_ads_first_reply_label'
      )
      .eq('account_id', accountId)
      .maybeSingle<ConfigRow>();

    if (error) {
      console.error('[conversions/config GET] load error:', error);
      return NextResponse.json({ error: 'Failed to load configuration' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ config: null });
    }

    const { meta_access_token, ...rest } = data;
    return NextResponse.json({
      config: { ...rest, has_token: Boolean(meta_access_token) },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const body = await request.json().catch(() => ({}));

    if (!body.meta_pixel_id?.trim() && !body.meta_access_token?.trim() && !body.google_ads_conversion_id?.trim()) {
      return NextResponse.json({ error: 'Provide at least a Meta pixel or a Google Ads conversion ID' }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      account_id: accountId,
      created_by: userId,
      meta_pixel_id: body.meta_pixel_id?.trim() || null,
      meta_test_event_code: body.meta_test_event_code?.trim() || null,
      meta_track_lead_created: Boolean(body.meta_track_lead_created),
      meta_track_deal_won: Boolean(body.meta_track_deal_won),
      meta_track_first_reply: Boolean(body.meta_track_first_reply),
      meta_track_automations: Boolean(body.meta_track_automations),
      google_ads_conversion_id: body.google_ads_conversion_id?.trim() || null,
      google_ads_lead_created_label: body.google_ads_lead_created_label?.trim() || null,
      google_ads_deal_won_label: body.google_ads_deal_won_label?.trim() || null,
      google_ads_first_reply_label: body.google_ads_first_reply_label?.trim() || null,
    };

    // Only overwrite the encrypted token when the caller actually sent
    // a new one — same "re-enter to change" UX as whatsapp_config.
    if (typeof body.meta_access_token === 'string' && body.meta_access_token.trim()) {
      payload.meta_access_token = encrypt(body.meta_access_token.trim());
    } else {
      const { data: existing } = await supabase
        .from('conversion_tracking_config')
        .select('meta_access_token')
        .eq('account_id', accountId)
        .maybeSingle<{ meta_access_token: string | null }>();
      payload.meta_access_token = existing?.meta_access_token ?? null;
    }

    const { error } = await supabase
      .from('conversion_tracking_config')
      .upsert(payload, { onConflict: 'account_id' });

    if (error) {
      console.error('[conversions/config POST] save error:', error);
      return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE() {
  try {
    const { supabase, accountId } = await requireRole('admin');

    const { error } = await supabase
      .from('conversion_tracking_config')
      .delete()
      .eq('account_id', accountId);

    if (error) {
      console.error('[conversions/config DELETE] error:', error);
      return NextResponse.json({ error: 'Failed to reset configuration' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
