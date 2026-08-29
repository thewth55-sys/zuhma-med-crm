import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { decrypt } from '@/lib/whatsapp/encryption';

/**
 * Verifies the stored Meta access token by pinging the Graph API —
 * mirrors `verifyPhoneNumber`'s role in `/api/whatsapp/config` GET.
 * Returns 200 with a `connected` flag rather than a raw error status,
 * same "shaped response, not a throw" convention as the WhatsApp
 * connection test.
 */
export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    const { data } = await supabase
      .from('conversion_tracking_config')
      .select('meta_pixel_id, meta_access_token')
      .eq('account_id', accountId)
      .maybeSingle<{ meta_pixel_id: string | null; meta_access_token: string | null }>();

    if (!data?.meta_pixel_id || !data?.meta_access_token) {
      return NextResponse.json({ connected: false, message: 'No Meta pixel/token saved yet' });
    }

    const accessToken = decrypt(data.meta_access_token);
    const response = await fetch(`https://graph.facebook.com/v21.0/${data.meta_pixel_id}?fields=id,name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return NextResponse.json({
        connected: false,
        message: body?.error?.message ?? `Meta API error: ${response.status}`,
      });
    }

    return NextResponse.json({ connected: true });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Encrypted token')) {
      return NextResponse.json({ connected: false, message: "Stored token can't be decrypted" });
    }
    return toErrorResponse(err);
  }
}
