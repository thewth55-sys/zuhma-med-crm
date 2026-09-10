import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse, UnauthorizedError, ForbiddenError } from '@/lib/auth/account'

/**
 * POST /api/whatsapp/qr/accept-risk
 *
 * Records the mandatory risk acknowledgment (migration 115's
 * whatsapp_config_provider_fields_check CHECK requires
 * qr_risk_accepted_at to be set on every 'qr' row — a row cannot exist
 * without it) and creates the account's qr whatsapp_config row if one
 * doesn't already exist. This is deliberately the ONLY way a 'qr' row
 * gets created — see whatsapp-provider-picker.tsx, which gates the
 * "Conectar por QR" button behind this endpoint succeeding first.
 *
 * Idempotent: re-accepting (e.g. after a disconnect) just re-stamps the
 * existing row rather than erroring.
 */
export async function POST() {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const { data: existing, error: existingError } = await supabase
      .from('whatsapp_config')
      .select('id')
      .eq('account_id', accountId)
      .eq('provider', 'qr')
      .maybeSingle()

    if (existingError) {
      console.error('Error checking existing qr whatsapp_config:', existingError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const now = new Date().toISOString()

    if (existing) {
      const { error: updateError } = await supabase
        .from('whatsapp_config')
        .update({ qr_risk_accepted_at: now, qr_risk_accepted_by: userId })
        .eq('id', existing.id)
      if (updateError) {
        console.error('Error updating qr risk acceptance:', updateError)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    const { error: insertError } = await supabase.from('whatsapp_config').insert({
      account_id: accountId,
      user_id: userId,
      provider: 'qr',
      qr_risk_accepted_at: now,
      qr_risk_accepted_by: userId,
      qr_connection_state: 'idle',
    })
    if (insertError) {
      console.error('Error creating qr whatsapp_config:', insertError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error in qr/accept-risk POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
