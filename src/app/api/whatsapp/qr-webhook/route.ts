import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeSecretEqual } from '@/lib/cron/verify-secret'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { deliverInboundMessage } from '@/lib/whatsapp/deliver-inbound-message'

// Inbound side of the unofficial QR/Baileys connection — the
// counterpart to src/app/api/whatsapp/webhook/route.ts (official Meta
// Cloud API), sharing the same downstream logic via
// deliver-inbound-message.ts. See supabase/migrations/115 and the Fase
// 1 plan for why this is a separate route rather than branching inside
// Meta's webhook: the payload shape, auth (shared secret, not Meta's
// HMAC signature), and transport (services/wa-qr-gateway/, not Meta)
// are all different from the start.
//
// 1:1 conversations only — the gateway itself already drops group/
// broadcast/status messages (see services/wa-qr-gateway/src/sessions.ts).
// Media (image/video/audio/document) is supported: the gateway
// downloads + decrypts it and uploads to the private qr-inbound-media
// bucket, handing back a path this route turns into `mediaUrl` — see
// src/app/api/whatsapp/qr-media/[...path]/route.ts for how that's
// served back out (a short-lived signed URL, not a public link).

// Lazy-initialized to avoid build-time crash when env vars are missing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

interface QrWebhookPayload {
  accountId: string
  whatsappSessionId: string
  externalMessageId: string
  senderPhone: string
  contactName?: string
  contentType: string
  contentText: string | null
  mediaUrl: string | null
  timestamp: number
}

export async function POST(request: Request) {
  const secret = process.env.WA_QR_WEBHOOK_SECRET
  if (!secret) {
    console.error('[qr-webhook] WA_QR_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }
  if (!timingSafeSecretEqual(request.headers.get('x-qr-webhook-secret'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: QrWebhookPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const { accountId, externalMessageId, senderPhone, contactName, contentType, contentText, mediaUrl, timestamp } = body
  // Either a text body or a media attachment is required — a media
  // message with no caption has neither `contentText` nor is missing
  // anything, so this checks for at least one of the two rather than
  // requiring contentText unconditionally (that would 400 every
  // uncaptioned photo/voice note).
  if (!accountId || !externalMessageId || !senderPhone || !contentType || (!contentText && !mediaUrl)) {
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 })
  }

  const db = supabaseAdmin()

  // Which line (whatsapp_config row) this came in on, and who owns it
  // for the NOT NULL user_id FK on contact/conversation inserts — same
  // role config.user_id plays for the Meta path (see that webhook's
  // processMessage comment). `.eq('provider', 'qr')` matters once an
  // account can have both a cloud_api and a qr row (migration 115).
  const { data: config, error: configError } = await db
    .from('whatsapp_config')
    .select('id, user_id')
    .eq('account_id', accountId)
    .eq('provider', 'qr')
    .maybeSingle()

  if (configError) {
    console.error('[qr-webhook] failed to look up whatsapp_config:', configError.message)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
  if (!config) {
    console.error('[qr-webhook] no qr whatsapp_config row for account:', accountId)
    return NextResponse.json({ error: 'account not configured for qr' }, { status: 404 })
  }

  await deliverInboundMessage({
    db,
    accountId,
    configOwnerUserId: config.user_id,
    whatsappConfigId: config.id,
    senderPhone: normalizePhone(senderPhone),
    contactName: contactName || senderPhone,
    externalMessageId,
    contentType,
    contentText,
    mediaUrl,
    interactiveReplyId: null,
    replyToExternalId: null,
    timestamp: new Date(timestamp),
  })

  return NextResponse.json({ ok: true })
}
