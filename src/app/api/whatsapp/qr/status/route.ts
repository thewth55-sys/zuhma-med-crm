import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse, UnauthorizedError, ForbiddenError } from '@/lib/auth/account'

/**
 * GET /api/whatsapp/qr/status
 *
 * Polled every ~3s by whatsapp-qr-connect.tsx while a QR pairing is in
 * progress (and at a slower cadence once connected, to notice a drop).
 * Read-only — any team member can see connection status, same as the
 * existing WABA status indicators (viewer role, not admin).
 *
 * Returns `{ configured: false }` if the account never accepted the
 * risk disclosure (no qr row exists yet) rather than a 404 — the UI
 * treats that as "show the picker", not an error.
 */
export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('viewer')

    const { data: config, error } = await supabase
      .from('whatsapp_config')
      .select(
        'qr_connection_state, qr_current_code, qr_code_expires_at, qr_connected_phone, qr_last_disconnect_reason'
      )
      .eq('account_id', accountId)
      .eq('provider', 'qr')
      .maybeSingle()

    if (error) {
      console.error('Error fetching qr status:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
    if (!config) {
      return NextResponse.json({ configured: false })
    }

    return NextResponse.json({
      configured: true,
      connection_state: config.qr_connection_state,
      qr_code: config.qr_current_code,
      qr_code_expires_at: config.qr_code_expires_at,
      connected_phone: config.qr_connected_phone,
      last_disconnect_reason: config.qr_last_disconnect_reason,
    })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error in qr/status GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
