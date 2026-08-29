import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { encrypt } from '@/lib/whatsapp/encryption'

/**
 * PATCH /api/whatsapp/config/verify-token
 *
 * Updates ONLY whatsapp_config.verify_token — split out from the main
 * POST /api/whatsapp/config on purpose. That route requires
 * access_token because it re-verifies credentials with Meta on every
 * save; verify_token is a purely local secret (compared against
 * Meta's hub.verify_token challenge in our own webhook GET handler,
 * never sent to Meta), so forcing a re-entry of the access token just
 * to rotate it is an unnecessary dead end — especially for a
 * connection made via Embedded Signup, where the account's own
 * WhatsApp screen never showed anyone the token's plaintext to paste
 * back in (see #whatsapp-embedded-signup-2026-07-16).
 */
export async function PATCH(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin')

    const body = await request.json().catch(() => ({}))
    const verifyToken = typeof body?.verify_token === 'string' ? body.verify_token.trim() : ''
    if (!verifyToken) {
      return NextResponse.json({ error: 'verify_token is required' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('whatsapp_config')
      .select('id')
      .eq('account_id', accountId)
      .maybeSingle()
    if (!existing) {
      return NextResponse.json(
        { error: 'Connect WhatsApp first before setting a webhook verify token.' },
        { status: 404 },
      )
    }

    const { error } = await supabase
      .from('whatsapp_config')
      .update({ verify_token: encrypt(verifyToken), updated_at: new Date().toISOString() })
      .eq('account_id', accountId)

    if (error) {
      console.error('[whatsapp/config/verify-token PATCH] update error:', error)
      return NextResponse.json({ error: 'Failed to save verify token' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
