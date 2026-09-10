import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse, UnauthorizedError, ForbiddenError } from '@/lib/auth/account'
import { disconnectQrSession, QrGatewayError } from '@/lib/whatsapp/qr-gateway-client'

/**
 * POST /api/whatsapp/qr/disconnect
 *
 * Logs out the Baileys session and clears its persisted auth state
 * (see sessions.ts's disconnectSession). The account can reconnect
 * later, which starts a fresh pairing — not a resume of the old one.
 */
export async function POST() {
  try {
    const { accountId } = await requireRole('admin')
    await disconnectQrSession(accountId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    if (error instanceof QrGatewayError) {
      console.error('qr/disconnect gateway error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    console.error('Error in qr/disconnect POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
