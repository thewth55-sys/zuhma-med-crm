import { describe, it, expect } from 'vitest'
import { getAiTokenQuotaStatus } from './quota'

function makeDb(
  usageRows: { total_tokens: number }[] | null,
  usageError: unknown = null,
  accountOverrides: { ai_access_blocked?: boolean; ai_token_limit_override?: number | null } = {},
) {
  return {
    from(table: string) {
      if (table === 'accounts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { ...accountOverrides }, error: null }),
            }),
          }),
        }
      }
      if (table === 'ai_usage_log') {
        return {
          select: () => ({
            eq: () => ({
              gte: () => Promise.resolve({ data: usageRows, error: usageError }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('getAiTokenQuotaStatus', () => {
  it('is uncapped by default (no plan tiers) and never exceeds', async () => {
    const db = makeDb(null)
    const status = await getAiTokenQuotaStatus(db, 'acct-1')
    expect(status).toEqual({ used: 0, limit: null, exceeded: false, blocked: false })
  })

  it('sums usage rows and flags exceeded once at/over an admin override cap', async () => {
    const db = makeDb([{ total_tokens: 60_000 }, { total_tokens: 50_000 }], null, {
      ai_token_limit_override: 100_000,
    })
    const status = await getAiTokenQuotaStatus(db, 'acct-1')
    expect(status.used).toBe(110_000)
    expect(status.limit).toBe(100_000)
    expect(status.exceeded).toBe(true)
  })

  it('under the override cap is not exceeded', async () => {
    const db = makeDb([{ total_tokens: 10_000 }], null, { ai_token_limit_override: 100_000 })
    const status = await getAiTokenQuotaStatus(db, 'acct-1')
    expect(status.exceeded).toBe(false)
  })

  it('fails open on a query error', async () => {
    const db = makeDb(null, { message: 'boom' }, { ai_token_limit_override: 100_000 })
    const status = await getAiTokenQuotaStatus(db, 'acct-1')
    expect(status.exceeded).toBe(false)
  })

  it('an admin block short-circuits regardless of usage', async () => {
    const db = makeDb(null, null, { ai_access_blocked: true })
    const status = await getAiTokenQuotaStatus(db, 'acct-1')
    expect(status).toEqual({ used: 0, limit: 0, exceeded: true, blocked: true })
  })

  it('an admin token-limit override caps an otherwise-uncapped account', async () => {
    const db = makeDb([{ total_tokens: 5_000 }], null, { ai_token_limit_override: 1_000 })
    const status = await getAiTokenQuotaStatus(db, 'acct-1')
    expect(status.limit).toBe(1_000)
    expect(status.exceeded).toBe(true)
    expect(status.blocked).toBe(false)
  })

  it('an override of 0 blocks usage entirely', async () => {
    const db = makeDb([], null, { ai_token_limit_override: 0 })
    const status = await getAiTokenQuotaStatus(db, 'acct-1')
    expect(status.limit).toBe(0)
    expect(status.exceeded).toBe(true)
  })

  it('is uncapped when the account row is missing', async () => {
    const db = {
      from(table: string) {
        if (table === 'accounts') {
          return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }
        }
        return {
          select: () => ({ eq: () => ({ gte: () => Promise.resolve({ data: [], error: null }) }) }),
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const status = await getAiTokenQuotaStatus(db, 'acct-1')
    expect(status.limit).toBe(null)
  })
})
