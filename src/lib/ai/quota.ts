import type { SupabaseClient } from '@supabase/supabase-js'
import { PLAN_CONFIG, type Plan } from '@/lib/billing-platform/plans'

export interface AiQuotaStatus {
  /** Tokens spent so far this calendar month (prompt + completion, both auto-reply and draft). */
  used: number
  /** Effective monthly cap (plan default, or a platform-admin override), or null when uncapped. */
  limit: number | null
  exceeded: boolean
  /** True when a platform admin disabled AI access outright, independent of any token count. */
  blocked: boolean
}

function monthStartUtc(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/**
 * Sums this account's `ai_usage_log.total_tokens` since the start of
 * the current UTC calendar month and compares it against the
 * effective monthly cap — `accounts.ai_token_limit_override` when a
 * platform admin has set one (including 0), else
 * `PLAN_CONFIG[plan].aiTokenLimitMonthly`. Checked BEFORE calling the
 * provider (auto-reply's dispatch, the draft route) — by the time
 * usage is logged the (BYO-key) API cost already happened, so this is
 * the only point that can actually prevent going over.
 *
 * `accounts.ai_access_blocked` short-circuits everything: a platform
 * admin kill switch that applies regardless of plan or override, kept
 * distinct from the token count so callers can tell "blocked by
 * staff" from "hit your plan's limit" apart.
 *
 * Fails open: a query error returns `exceeded: false` rather than
 * blocking a reply the customer is waiting on over a transient DB
 * hiccup — same posture as `logAiUsage`.
 */
export async function getAiTokenQuotaStatus(
  db: SupabaseClient,
  accountId: string,
): Promise<AiQuotaStatus> {
  const { data: account } = await db
    .from('accounts')
    .select('plan, ai_access_blocked, ai_token_limit_override')
    .eq('id', accountId)
    .maybeSingle()

  if (account?.ai_access_blocked) {
    return { used: 0, limit: 0, exceeded: true, blocked: true }
  }

  const plan = (account?.plan as Plan | undefined) ?? 'trial'
  const limit =
    (account?.ai_token_limit_override as number | null | undefined) ??
    PLAN_CONFIG[plan].aiTokenLimitMonthly

  if (limit === null) return { used: 0, limit: null, exceeded: false, blocked: false }

  const { data, error } = await db
    .from('ai_usage_log')
    .select('total_tokens')
    .eq('account_id', accountId)
    .gte('created_at', monthStartUtc())

  if (error) {
    console.error('[ai quota] usage sum query failed:', error)
    return { used: 0, limit, exceeded: false, blocked: false }
  }

  const used = (data ?? []).reduce((sum, row) => sum + (row.total_tokens ?? 0), 0)
  return { used, limit, exceeded: used >= limit, blocked: false }
}
