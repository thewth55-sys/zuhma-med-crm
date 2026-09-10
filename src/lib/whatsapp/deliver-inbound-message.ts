// ============================================================
// Inbound message delivery — the provider-agnostic tail end of
// receiving a WhatsApp message, shared by:
//   - src/app/api/whatsapp/webhook/route.ts (official Meta Cloud API)
//   - src/app/api/whatsapp/qr-webhook/route.ts (unofficial QR/Baileys gateway)
//
// Everything Meta-specific (parsing `value.messages[]`, resolving
// media via an access token, HMAC signature verification) stays in
// each route's own file. Everything from "we now have a normalized
// inbound message" onward — contact/conversation resolution, storing
// the message, and firing flows/automations/AI-reply/webhooks — used
// to live inline in the Meta webhook's `processMessage` and is
// extracted here so the QR gateway's webhook doesn't have to
// duplicate ~250 lines of business logic to get the same behavior.
//
// This is a straight extraction, not a rewrite — the logic and most
// comments below are unchanged from the original `processMessage` /
// `findOrCreateContact` / `findOrCreateConversation` /
// `lookupInternalIdByMetaId` / `flagBroadcastReplyIfAny`.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { dispatchInboundToFlows } from '@/lib/flows/engine'
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply'
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver'
import { dispatchConversionEvent } from '@/lib/conversions/dispatch'
import { createLeadDeal } from '@/lib/pipelines/auto-lead-deal'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContactRow = any

interface ContactOutcome {
  contact: ContactRow
  /** True when this call created the row; drives new_contact_created
   *  automation dispatch below. */
  wasCreated: boolean
}

const ALLOWED_CONTENT_TYPES = new Set([
  'text', 'image', 'document', 'audio', 'video',
  'location', 'template', 'interactive',
])

export interface DeliverInboundMessageParams {
  db: SupabaseClient
  accountId: string
  /** Sender-of-record for inserts that need a NOT NULL user_id FK
   *  (contacts, conversations). For Meta this is the admin who saved
   *  the WhatsApp config; the QR gateway passes the equivalent owner
   *  of its whatsapp_config row. */
  configOwnerUserId: string
  /** Which whatsapp_config row (which line) this message came in on.
   *  Null for the code paths that predate multi-line support — see
   *  supabase/migrations/087_conversations_whatsapp_config.sql. */
  whatsappConfigId: string | null
  /** Already E.164-normalized. */
  senderPhone: string
  contactName: string
  /** Meta's `message.id` or the Baileys gateway's own message id.
   *  Stored in messages.message_id — NOT unique across the table
   *  (see migration 009), used only for status/reaction/reply lookups
   *  scoped by conversation. */
  externalMessageId: string
  contentType: string
  contentText: string | null
  mediaUrl: string | null
  interactiveReplyId: string | null
  /** The external id of the message this one is quote-replying to,
   *  if any (Meta's `message.context.id` or Baileys' quoted-message
   *  id). Resolved to our internal UUID below; a miss is fine — the
   *  message just renders without a quote. */
  replyToExternalId: string | null
  timestamp: Date
  /** Set by callers that already resolved contact/conversation
   *  themselves before deciding to call this function — the Meta
   *  webhook does this because it needs the conversation to handle
   *  reactions, which short-circuit BEFORE reaching here (reactions
   *  aren't messages and never call deliverInboundMessage at all).
   *  Passing this skips a redundant round of find-or-create. Callers
   *  with nothing to reuse (the QR gateway, which has no reactions in
   *  Phase 1) omit this and deliverInboundMessage resolves it fresh. */
  resolved?: ResolvedContactAndConversation
}

export interface ResolvedContactAndConversation {
  contactRecord: ContactRow
  contactOutcome: ContactOutcome
  conversation: ContactRow
  conversationCreated: boolean
}

/**
 * Find-or-create the contact and conversation for an inbound message,
 * without doing anything else. Exported so callers that need the
 * conversation before they can decide how to handle the message (the
 * Meta webhook: reactions target an existing conversation but aren't
 * messages themselves) don't have to duplicate this, and can pass the
 * result into `deliverInboundMessage` via `resolved` to avoid
 * resolving it twice.
 */
export async function resolveContactAndConversation(
  db: SupabaseClient,
  args: {
    accountId: string
    configOwnerUserId: string
    whatsappConfigId: string | null
    senderPhone: string
    contactName: string
  }
): Promise<ResolvedContactAndConversation | null> {
  const { accountId, configOwnerUserId, whatsappConfigId, senderPhone, contactName } = args

  const contactOutcome = await findOrCreateContact(
    db,
    accountId,
    configOwnerUserId,
    senderPhone,
    contactName
  )
  if (!contactOutcome) return null
  const contactRecord = contactOutcome.contact

  if (contactOutcome.wasCreated) {
    await dispatchConversionEvent(db, accountId, 'lead_created', {
      phone: senderPhone,
    })
  }

  // Scoped to the specific line this message came in on, so a reply
  // always goes back out the same line the contact is talking to —
  // see migration 087's comment for why this matters once an account
  // can have two active lines.
  const convResult = await findOrCreateConversation(
    db,
    accountId,
    configOwnerUserId,
    contactRecord.id,
    whatsappConfigId
  )
  if (!convResult) return null
  const conversation = convResult.conversation

  // Lead nuevo → crea automáticamente un negocio en la primera etapa del
  // pipeline principal, ligado a esta conversación. Best-effort: no bloquea
  // la recepción del mensaje y no hace nada si no hay pipeline configurado.
  if (contactOutcome.wasCreated) {
    await createLeadDeal(db, {
      accountId,
      userId: configOwnerUserId,
      contactId: contactRecord.id,
      conversationId: conversation.id,
      title: contactName || senderPhone,
    })
  }

  // Emit conversation.created as soon as the thread is opened — before
  // the message insert in deliverInboundMessage — so a subscriber
  // always sees the thread open before its first message.received.
  if (convResult.created) {
    await dispatchWebhookEvent(db, accountId, 'conversation.created', {
      conversation_id: conversation.id,
      contact_id: contactRecord.id,
    })
  }

  return {
    contactRecord,
    contactOutcome,
    conversation,
    conversationCreated: convResult.created,
  }
}

export async function deliverInboundMessage(params: DeliverInboundMessageParams): Promise<void> {
  const {
    db,
    accountId,
    configOwnerUserId,
    whatsappConfigId,
    senderPhone,
    contactName,
    externalMessageId,
    contentText,
    mediaUrl,
    interactiveReplyId,
    replyToExternalId,
    timestamp,
  } = params

  const resolved =
    params.resolved ??
    (await resolveContactAndConversation(db, {
      accountId,
      configOwnerUserId,
      whatsappConfigId,
      senderPhone,
      contactName,
    }))
  if (!resolved) return
  const { contactRecord, contactOutcome, conversation } = resolved

  // Resolve quote-reply context if present. A missing parent is fine —
  // we just store NULL and the UI renders the message without a quote.
  let replyToInternalId: string | null = null
  if (replyToExternalId) {
    replyToInternalId = await lookupInternalIdByMetaId(db, replyToExternalId, conversation.id)
    if (!replyToInternalId) {
      console.warn('[deliver-inbound-message] reply context parent not found:', replyToExternalId)
    }
  }

  // The messages.content_type CHECK constraint (widened in migration 010
  // to add 'interactive' for button/list taps) allows:
  //   text, image, document, audio, video, location, template, interactive
  // Map anything else to the closest allowed value so the INSERT
  // doesn't fail with a constraint error.
  const contentType = ALLOWED_CONTENT_TYPES.has(params.contentType)
    ? params.contentType
    : 'text'

  // Determine whether this is the contact's very first inbound message
  // BEFORE we insert, so the count is accurate. Covers the case where
  // the contact row already existed (manual add / CSV import) but
  // they've never messaged us before.
  const { count: priorCustomerMsgCount } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('sender_type', 'customer')
  const isFirstInboundMessage = (priorCustomerMsgCount ?? 0) === 0

  const { error: msgError } = await db.from('messages').insert({
    conversation_id: conversation.id,
    sender_type: 'customer',
    content_type: contentType,
    content_text: contentText,
    media_url: mediaUrl,
    message_id: externalMessageId,
    status: 'delivered',
    created_at: timestamp.toISOString(),
    reply_to_message_id: replyToInternalId,
    // Only populated for content_type='interactive'.
    interactive_reply_id: interactiveReplyId,
  })

  if (msgError) {
    console.error('[deliver-inbound-message] Error inserting message:', msgError)
    return
  }

  // Update conversation
  const { error: convError } = await db
    .from('conversations')
    .update({
      last_message_text: contentText || `[${contentType}]`,
      last_message_at: new Date().toISOString(),
      unread_count: (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversation.id)

  if (convError) {
    console.error('[deliver-inbound-message] Error updating conversation:', convError)
  }

  // If this contact was a recent broadcast recipient, flag the reply
  // so the broadcast's `replied_count` advances (via the aggregate
  // trigger installed in migration 003).
  await flagBroadcastReplyIfAny(db, accountId, contactRecord.id)

  // ============================================================
  // Flow runner dispatch.
  //
  // If the runner consumes the message (it either advanced an active
  // run or started a new one), we suppress the `new_message_received`
  // + `keyword_match` automation triggers for this inbound. Customer
  // is navigating the bot menu, not sending a fresh trigger word that
  // should fork into automations.
  //
  // The relationship-level triggers (`new_contact_created`,
  // `first_inbound_message`) still fire even when consumed — those
  // are about WHO is messaging, not what they said.
  // ============================================================
  const flowResult = await dispatchInboundToFlows({
    accountId,
    userId: configOwnerUserId,
    contactId: contactRecord.id,
    conversationId: conversation.id,
    message:
      interactiveReplyId
        ? {
            kind: 'interactive_reply',
            reply_id: interactiveReplyId,
            reply_title: contentText ?? '',
            meta_message_id: externalMessageId,
          }
        : {
            kind: 'text',
            text: contentText ?? '',
            meta_message_id: externalMessageId,
          },
    isFirstInboundMessage,
  })
  const flowConsumed = flowResult.consumed

  // Fire any automations that react to this webhook event. Fire-and-
  // forget: a slow or failing automation must not block the caller's
  // 200 OK response to the provider (Meta or the QR gateway).
  const inboundText = contentText ?? ''
  const automationTriggers: (
    | 'new_contact_created'
    | 'first_inbound_message'
    | 'new_message_received'
    | 'keyword_match'
    | 'interactive_reply'
  )[] = []
  if (!flowConsumed) {
    automationTriggers.push('new_message_received', 'keyword_match')
    if (interactiveReplyId) {
      automationTriggers.push('interactive_reply')
    }
  }
  if (contactOutcome.wasCreated) automationTriggers.unshift('new_contact_created')
  if (isFirstInboundMessage) automationTriggers.unshift('first_inbound_message')
  for (const triggerType of automationTriggers) {
    runAutomationsForTrigger({
      accountId,
      triggerType,
      contactId: contactRecord.id,
      context: {
        message_text: inboundText,
        conversation_id: conversation.id,
        interactive_reply_id: interactiveReplyId ?? undefined,
      },
    }).catch((err) => console.error('[automations] dispatch failed:', err))
  }

  // AI auto-reply. Runs only for plain-text inbound the deterministic
  // flow runner did NOT consume (flows win over the LLM), and only
  // when the account has enabled it.
  if (!flowConsumed && !interactiveReplyId && inboundText.trim()) {
    await dispatchInboundToAiReply({
      accountId,
      conversationId: conversation.id,
      contactId: contactRecord.id,
      configOwnerUserId,
    })
  }

  // message.received webhook (public API).
  await dispatchWebhookEvent(db, accountId, 'message.received', {
    conversation_id: conversation.id,
    contact_id: contactRecord.id,
    whatsapp_message_id: externalMessageId,
    content_type: contentType,
    text: contentText,
  })
}

/**
 * Resolve an external (Meta or Baileys) message id into the matching
 * internal UUID, scoped to one conversation. Returns null when we
 * never received the parent (e.g. a quote-reply to a message older
 * than this CRM install).
 */
export async function lookupInternalIdByMetaId(
  db: SupabaseClient,
  metaId: string,
  conversationId: string
): Promise<string | null> {
  const { data, error } = await db
    .from('messages')
    .select('id')
    .eq('message_id', metaId)
    .eq('conversation_id', conversationId)
    .maybeSingle()
  if (error) {
    console.error('[deliver-inbound-message] lookupInternalIdByMetaId failed:', error.message)
    return null
  }
  return data?.id ?? null
}

/**
 * If an inbound message's sender is on a still-unreplied
 * broadcast_recipients row, flip it to `replied` so the reply count
 * advances on the parent broadcast.
 *
 * Best-effort — failures here must not break the main inbound-message
 * flow, so errors are swallowed with a log.
 */
async function flagBroadcastReplyIfAny(db: SupabaseClient, accountId: string, contactId: string) {
  try {
    const { data: recs, error } = await db
      .from('broadcast_recipients')
      .select('id, status, broadcast_id, broadcasts!inner(account_id)')
      .eq('contact_id', contactId)
      .eq('broadcasts.account_id', accountId)
      .in('status', ['sent', 'delivered', 'read'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !recs || recs.length === 0) return

    const row = recs[0]
    const { error: updErr } = await db
      .from('broadcast_recipients')
      .update({ status: 'replied', replied_at: new Date().toISOString() })
      .eq('id', row.id)

    if (updErr) {
      console.error('[deliver-inbound-message] Error marking broadcast recipient replied:', updErr)
    }
  } catch (err) {
    console.error('[deliver-inbound-message] flagBroadcastReplyIfAny failed:', err)
  }
}

async function findOrCreateContact(
  db: SupabaseClient,
  accountId: string,
  configOwnerUserId: string,
  phone: string,
  name: string
): Promise<ContactOutcome | null> {
  // Find an existing contact for this account by phone. The shared
  // helper pre-filters in SQL by the last-8-digit suffix then applies
  // the strict `phonesMatch` in JS on the small candidate set. The
  // same helper backs the manual contact form and CSV import, so all
  // paths agree on what "same number" means (issue #212).
  const existingContact = await findExistingContact(db, accountId, phone)

  if (existingContact) {
    if (name && name !== existingContact.name) {
      await db
        .from('contacts')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', existingContact.id)
    }
    return { contact: existingContact, wasCreated: false }
  }

  // Create new contact. account_id is the tenancy column; user_id is
  // the NOT NULL FK audit column (no inbound message has a single
  // "user who created" it — we attribute to the WhatsApp config
  // owner as a stable default).
  const { data: newContact, error: createError } = await db
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      phone,
      name: name || phone,
    })
    .select()
    .single()

  if (createError) {
    // Lost a race: a concurrent inbound delivery (or another path)
    // created this contact between our lookup and insert, and the
    // unique index (migration 022) rejected the duplicate. Re-resolve
    // the existing row instead of dropping the message.
    if (isUniqueViolation(createError)) {
      const raced = await findExistingContact(db, accountId, phone)
      if (raced) return { contact: raced, wasCreated: false }
    }
    console.error('[deliver-inbound-message] Error creating contact:', createError)
    return null
  }

  return { contact: newContact, wasCreated: true }
}

async function findOrCreateConversation(
  db: SupabaseClient,
  accountId: string,
  configOwnerUserId: string,
  contactId: string,
  whatsappConfigId: string | null,
) {
  // Look for an existing conversation on this exact line. Scoping by
  // whatsapp_config_id (not just account+contact) means a contact who
  // messages two different lines on the same account gets two
  // separate threads, each answerable only on its own line — see
  // migration 087's comment. `whatsappConfigId` can be null for
  // callers that don't know their line yet (pre-migration data, or a
  // config not wired up); `.is()` matches NULL correctly where `.eq()`
  // would not.
  let query = db
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
  query = whatsappConfigId
    ? query.eq('whatsapp_config_id', whatsappConfigId)
    : query.is('whatsapp_config_id', null)
  const { data: existing, error: findError } = await query.maybeSingle()

  if (!findError && existing) {
    return { conversation: existing, created: false }
  }

  // Create new conversation. Same tenancy + audit split as
  // findOrCreateContact above.
  const { data: newConv, error: createError } = await db
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      contact_id: contactId,
      whatsapp_config_id: whatsappConfigId,
    })
    .select()
    .single()

  if (createError) {
    console.error('[deliver-inbound-message] Error creating conversation:', createError)
    return null
  }

  return { conversation: newConv, created: true }
}
