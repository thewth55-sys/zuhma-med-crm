import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeEmbeddedSignupCode, getWabaPhoneNumbers } from '@/lib/whatsapp/meta-api'
import { saveWhatsAppConfig } from '@/lib/whatsapp/save-config'

/**
 * POST /api/whatsapp/embedded-signup
 *
 * Backend half of WhatsApp Embedded Signup — the frontend button
 * (components/settings/whatsapp-embedded-signup-button.tsx) runs
 * Meta's hosted popup via the Facebook JS SDK and hands this route
 * the resulting `code` (+ `waba_id`, and `phone_number_id` when Meta's
 * event included it). This route's own job is just the two steps
 * unique to Embedded Signup — exchanging the code for a token, and
 * resolving the phone number when Meta's event didn't include one —
 * then hands off to `saveWhatsAppConfig()` (shared with the manual
 * "paste your token" route) for the verify/claim-check/register/
 * subscribe/persist tail, so the two entry points can't drift.
 *
 * Same account-scoping as the manual route: any authenticated member
 * of the account can complete this, no extra role floor — matching
 * the existing route's permission level rather than introducing a
 * mismatch between the two paths for the same underlying feature.
 *
 * Unlike the manual flow, there's no PIN field in the UI — Embedded
 * Signup customers verify their number's OTP inside Meta's own popup,
 * so a PIN this route generates itself is passed through (only ever
 * used for that one /register call; nothing depends on the customer
 * knowing it).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (profileError || !accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const { code, waba_id: wabaId, phone_number_id: suppliedPhoneNumberId } = body

    if (!code || !wabaId) {
      return NextResponse.json(
        { error: 'code and waba_id are required' },
        { status: 400 },
      )
    }

    let accessToken: string
    try {
      const result = await exchangeEmbeddedSignupCode({ code })
      accessToken = result.accessToken
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta OAuth error'
      console.error('[embedded-signup] code exchange failed:', message)
      return NextResponse.json({ error: `Meta OAuth error: ${message}` }, { status: 400 })
    }

    // Trust a client-supplied phone_number_id (Meta's WA_EMBEDDED_SIGNUP
    // event usually includes one) but fall back to asking the WABA
    // itself when it's missing — a WABA fresh out of Embedded Signup
    // for a new number has exactly one.
    let phoneNumberId = suppliedPhoneNumberId as string | undefined
    if (!phoneNumberId) {
      try {
        const numbers = await getWabaPhoneNumbers({ wabaId, accessToken })
        phoneNumberId = numbers[0]?.id
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown Meta API error'
        return NextResponse.json(
          { error: `Could not resolve a phone number for this WhatsApp Business Account: ${message}` },
          { status: 400 },
        )
      }
    }
    if (!phoneNumberId) {
      return NextResponse.json(
        { error: 'No phone number found on this WhatsApp Business Account.' },
        { status: 400 },
      )
    }

    const pin = String(Math.floor(100000 + Math.random() * 900000))
    const result = await saveWhatsAppConfig({
      supabase,
      accountId,
      savedByUserId: user.id,
      phoneNumberId,
      wabaId,
      accessToken,
      pin,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.errorStatus ?? 400 })
    }

    if (result.registrationError) {
      return NextResponse.json({
        success: false,
        saved: true,
        registered: false,
        registration_error: result.registrationError,
        phone_info: result.phoneInfo,
      })
    }

    return NextResponse.json({
      success: true,
      saved: true,
      registered: result.registered,
      phone_info: result.phoneInfo,
    })
  } catch (error) {
    console.error('[embedded-signup] unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
