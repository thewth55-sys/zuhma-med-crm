import type { SupabaseClient } from '@supabase/supabase-js'

export type IntegrationErrorSource = 'whatsapp_send' | 'ai_auto_reply'

export interface LogIntegrationErrorArgs {
  accountId: string
  source: IntegrationErrorSource
  /** Machine code when the failure has one (e.g. Meta's numeric error code), free text otherwise. */
  code?: string | null
  message: string
}

/**
 * Best-effort append to `integration_errors` — surfaced per-account in
 * the /admin panel (e.g. Meta's "display name needs approval" error)
 * so staff don't have to go digging through server logs to explain a
 * client's "why isn't it sending" report. NEVER throws: this is a
 * diagnostic side-channel, not part of the send/reply path itself —
 * same posture as `logAiUsage`.
 */
export async function logIntegrationError(
  db: SupabaseClient,
  args: LogIntegrationErrorArgs,
): Promise<void> {
  try {
    const { error } = await db.from('integration_errors').insert({
      account_id: args.accountId,
      source: args.source,
      code: args.code ?? null,
      message: args.message,
    })
    if (error) {
      console.error('[integration errors] log insert failed:', error)
    }
  } catch (err) {
    console.error('[integration errors] log insert threw:', err)
  }
}
