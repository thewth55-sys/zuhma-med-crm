import { supabaseAdmin } from '@/lib/supabase/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'

/**
 * Resolve the per-account Meta App Secret for an inbound WhatsApp
 * webhook, used when the receiving account brought its OWN Meta app
 * (BYO WABA) so its webhooks are signed with a secret the global
 * `META_APP_SECRET` can't verify.
 *
 * The raw body is parsed ONLY to read the routing identifiers
 * (`entry[].id` = WABA id, `entry[].changes[].value.metadata.phone_number_id`).
 * That's safe to do before the signature is verified because the result
 * is used solely to pick WHICH secret to try — acceptance still requires
 * a valid HMAC, which an attacker can't forge without the secret itself.
 *
 * Returns null for Embedded Signup accounts (no per-account secret),
 * malformed bodies, or a decryption failure — the caller then falls
 * through to rejecting the request.
 */
export async function resolveAccountAppSecret(rawBody: string): Promise<string | null> {
  let wabaId: string | undefined
  let phoneNumberId: string | undefined
  try {
    const parsed = JSON.parse(rawBody)
    const entry = Array.isArray(parsed?.entry) ? parsed.entry[0] : undefined
    if (entry && typeof entry.id === 'string') wabaId = entry.id
    const change = Array.isArray(entry?.changes) ? entry.changes[0] : undefined
    const pnid = change?.value?.metadata?.phone_number_id
    if (typeof pnid === 'string') phoneNumberId = pnid
  } catch {
    return null
  }

  if (!wabaId && !phoneNumberId) return null

  const admin = supabaseAdmin()
  let query = admin
    .from('whatsapp_config')
    .select('app_secret')
    .not('app_secret', 'is', null)
    .limit(1)

  // Prefer phone_number_id (unique per number); fall back to WABA id for
  // payloads without message metadata (e.g. some status events).
  query = phoneNumberId
    ? query.eq('phone_number_id', phoneNumberId)
    : query.eq('waba_id', wabaId as string)

  const { data, error } = await query.maybeSingle()
  if (error || !data?.app_secret) return null

  try {
    return decrypt(data.app_secret as string)
  } catch {
    return null
  }
}
