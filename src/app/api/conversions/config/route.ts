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
  // Google Ads API (server-side ECL). Los 3 secretos van cifrados.
  google_ads_developer_token: string | null;
  google_ads_client_id: string | null;
  google_ads_client_secret: string | null;
  google_ads_refresh_token: string | null;
  google_ads_customer_id: string | null;
  google_ads_login_customer_id: string | null;
  google_ads_qualified_action_id: string | null;
  google_ads_won_action_id: string | null;
  google_ads_lead_action_id: string | null;
  google_ads_track_pipeline: boolean;
}

const GOOGLE_ADS_API_COLUMNS =
  'google_ads_developer_token, google_ads_client_id, google_ads_client_secret, google_ads_refresh_token, google_ads_customer_id, google_ads_login_customer_id, google_ads_qualified_action_id, google_ads_won_action_id, google_ads_lead_action_id, google_ads_track_pipeline';

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    const { data, error } = await supabase
      .from('conversion_tracking_config')
      .select(
        `meta_pixel_id, meta_access_token, meta_test_event_code, meta_track_lead_created, meta_track_deal_won, meta_track_first_reply, meta_track_automations, google_ads_conversion_id, google_ads_lead_created_label, google_ads_deal_won_label, google_ads_first_reply_label, ${GOOGLE_ADS_API_COLUMNS}`
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

    // Nunca se devuelven los secretos al cliente; sólo un booleano has_*.
    const {
      meta_access_token,
      google_ads_developer_token,
      google_ads_client_secret,
      google_ads_refresh_token,
      ...rest
    } = data;
    return NextResponse.json({
      config: {
        ...rest,
        has_token: Boolean(meta_access_token),
        has_google_developer_token: Boolean(google_ads_developer_token),
        has_google_client_secret: Boolean(google_ads_client_secret),
        has_google_refresh_token: Boolean(google_ads_refresh_token),
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const body = await request.json().catch(() => ({}));

    if (
      !body.meta_pixel_id?.trim() &&
      !body.meta_access_token?.trim() &&
      !body.google_ads_conversion_id?.trim() &&
      !body.google_ads_customer_id?.trim()
    ) {
      return NextResponse.json({ error: 'Provide at least a Meta pixel or a Google Ads ID' }, { status: 400 });
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
      // Google Ads API (server-side ECL) — no secretos aquí:
      google_ads_client_id: body.google_ads_client_id?.trim() || null,
      google_ads_customer_id: body.google_ads_customer_id?.replace(/\D/g, '') || null,
      google_ads_login_customer_id: body.google_ads_login_customer_id?.replace(/\D/g, '') || null,
      google_ads_qualified_action_id: body.google_ads_qualified_action_id?.trim() || null,
      google_ads_won_action_id: body.google_ads_won_action_id?.trim() || null,
      google_ads_lead_action_id: body.google_ads_lead_action_id?.trim() || null,
      google_ads_track_pipeline: Boolean(body.google_ads_track_pipeline),
    };

    // Secretos cifrados con patrón "re-enter to change": sólo se
    // sobreescriben cuando el cliente envía un valor nuevo.
    const { data: existing } = await supabase
      .from('conversion_tracking_config')
      .select('meta_access_token, google_ads_developer_token, google_ads_client_secret, google_ads_refresh_token')
      .eq('account_id', accountId)
      .maybeSingle<{
        meta_access_token: string | null;
        google_ads_developer_token: string | null;
        google_ads_client_secret: string | null;
        google_ads_refresh_token: string | null;
      }>();

    const keepOrEncrypt = (incoming: unknown, current: string | null): string | null =>
      typeof incoming === 'string' && incoming.trim() ? encrypt(incoming.trim()) : current ?? null;

    payload.meta_access_token = keepOrEncrypt(body.meta_access_token, existing?.meta_access_token ?? null);
    payload.google_ads_developer_token = keepOrEncrypt(body.google_ads_developer_token, existing?.google_ads_developer_token ?? null);
    payload.google_ads_client_secret = keepOrEncrypt(body.google_ads_client_secret, existing?.google_ads_client_secret ?? null);
    payload.google_ads_refresh_token = keepOrEncrypt(body.google_ads_refresh_token, existing?.google_ads_refresh_token ?? null);

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
