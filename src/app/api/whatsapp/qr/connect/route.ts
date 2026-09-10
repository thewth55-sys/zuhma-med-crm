import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse, UnauthorizedError, ForbiddenError } from '@/lib/auth/account'
import { connectQrSession, QrGatewayError } from '@/lib/whatsapp/qr-gateway-client'

/**
 * POST /api/whatsapp/qr/connect
 *
 * Asks the wa-qr-gateway service to (re)start this account's Baileys
 * session. Requires the risk disclosure to already be accepted — see
 * qr/accept-risk — the gateway itself refuses to connect an account
 * with no qr whatsapp_config row (see sessions.ts's connectSession).
 * The frontend should start polling GET /api/whatsapp/qr/status right
 * after this resolves to pick up the QR code once the gateway emits it.
 */
export async function POST() {
  try {
    const { supabase, accountId } = await requireRole('admin')

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('id')
      .eq('account_id', accountId)
      .eq('provider', 'qr')
      .maybeSingle()

    if (configError) {
      console.error('Error checking qr whatsapp_config:', configError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
    if (!config) {
      return NextResponse.json(
        { error: 'Accept the QR risk disclosure first (POST /api/whatsapp/qr/accept-risk).' },
        { status: 400 }
      )
    }

    await connectQrSession(accountId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    if (error instanceof QrGatewayError) {
      console.error('qr/connect gateway error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    console.error('Error in qr/connect POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
