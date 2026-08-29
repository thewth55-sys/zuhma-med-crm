import type { SupabaseClient } from '@supabase/supabase-js'
import {
  daysAgoStart,
  DOW_SHORT_MON_FIRST,
  lastNDayKeys,
  localDayKey,
  mondayIndex,
  startOfLocalDay,
} from './date-utils'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  ResponseTimeBucket,
  ResponseTimeSummary,
  TodayAppointmentItem,
} from './types'

// ------------------------------------------------------------
// All client-side aggregation. RLS scopes every query to the
// signed-in user automatically, so we never pass user_id explicitly
// here. Perf is acceptable for the current scale (low thousands of
// messages) — if a tenant's dataset outgrows this, we'd migrate the
// heavy aggregations to SQL RPCs. Noted in the PR.
// ------------------------------------------------------------

type DB = SupabaseClient

// --- 1. Metric cards ---------------------------------------------------

/** Rounds a fraction to a one-decimal percent; 0 when the denominator is 0. */
function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 1000) / 10
}

export async function loadMetrics(db: DB): Promise<MetricsBundle> {
  const todayStart = startOfLocalDay().toISOString()
  const yesterdayStart = daysAgoStart(1).toISOString()
  // Rolling 30-day windows for the medical KPIs below — a daily window
  // gives too few samples (conversion/no-show/new-vs-returning are all
  // low-volume events for a single clinic), so these compare "last 30
  // days" against the 30 days before that instead of today vs yesterday.
  const period30Start = daysAgoStart(29).toISOString()
  const period60Start = daysAgoStart(59).toISOString()

  const [
    openConvCur,
    newConvToday,
    newConvYesterday,
    newContactsToday,
    newContactsYesterday,
    closedDealsCurrent,
    closedDealsPrevious,
    paymentsCurrent,
    paymentsPrevious,
    quotesCurrent,
    quotesPrevious,
    apptsCurrentRes,
    apptsPreviousRes,
  ] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', todayStart),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db.from('contacts').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    // Conversion rate: won / (won + lost) among deals closed in the window.
    db.from('deals').select('status').in('status', ['won', 'lost']).gte('updated_at', period30Start),
    db
      .from('deals')
      .select('status')
      .in('status', ['won', 'lost'])
      .gte('updated_at', period60Start)
      .lt('updated_at', period30Start),
    // Revenue collected vs quoted: actual payments vs quotes issued.
    db.from('payments').select('amount').gte('paid_at', period30Start),
    db.from('payments').select('amount').gte('paid_at', period60Start).lt('paid_at', period30Start),
    db.from('quotes').select('total').gte('issue_date', period30Start),
    db.from('quotes').select('total').gte('issue_date', period60Start).lt('issue_date', period30Start),
    // No-show/cancellation rate + new-vs-returning patients both derive
    // from the same appointment window, so fetch it once per period.
    db.from('appointments').select('contact_id, status, start_at').gte('start_at', period30Start),
    db
      .from('appointments')
      .select('contact_id, status, start_at')
      .gte('start_at', period60Start)
      .lt('start_at', period30Start),
  ])

  const closedCur = (closedDealsCurrent.data ?? []) as { status: string }[]
  const closedPrev = (closedDealsPrevious.data ?? []) as { status: string }[]
  const conversionRate: MetricsBundle['conversionRate'] = {
    current: pct(closedCur.filter((d) => d.status === 'won').length, closedCur.length),
    previous: pct(closedPrev.filter((d) => d.status === 'won').length, closedPrev.length),
  }

  const collectedCur = ((paymentsCurrent.data ?? []) as { amount: number }[]).reduce(
    (sum, p) => sum + p.amount,
    0,
  )
  const collectedPrev = ((paymentsPrevious.data ?? []) as { amount: number }[]).reduce(
    (sum, p) => sum + p.amount,
    0,
  )
  const quotedCur = ((quotesCurrent.data ?? []) as { total: number }[]).reduce(
    (sum, q) => sum + q.total,
    0,
  )
  const quotedPrev = ((quotesPrevious.data ?? []) as { total: number }[]).reduce(
    (sum, q) => sum + q.total,
    0,
  )
  const revenueCollectedRatio: MetricsBundle['revenueCollectedRatio'] = {
    current: quotedCur === 0 ? (collectedCur > 0 ? 100 : 0) : pct(collectedCur, quotedCur),
    previous: quotedPrev === 0 ? (collectedPrev > 0 ? 100 : 0) : pct(collectedPrev, quotedPrev),
  }

  const apptsCur = (apptsCurrentRes.data ?? []) as {
    contact_id: string | null
    status: string
    start_at: string
  }[]
  const apptsPrev = (apptsPreviousRes.data ?? []) as {
    contact_id: string | null
    status: string
    start_at: string
  }[]
  const isNoShow = (a: { status: string }) => a.status === 'cancelled' || a.status === 'no_show'
  const noShowRate: MetricsBundle['noShowRate'] = {
    current: pct(apptsCur.filter(isNoShow).length, apptsCur.length),
    previous: pct(apptsPrev.filter(isNoShow).length, apptsPrev.length),
  }

  // New vs returning: for every distinct patient seen in a window, check
  // whether they had any appointment before that window started. Two
  // small follow-up queries (one per window) since this depends on the
  // contact IDs the window above just returned.
  const [newPatientsCur, newPatientsPrev] = await Promise.all([
    countNewPatients(db, apptsCur, period30Start),
    countNewPatients(db, apptsPrev, period60Start),
  ])

  return {
    activeConversations: {
      current: openConvCur.count ?? 0,
      // "vs yesterday" on a current-state count has no clean answer
      // without snapshots — we show the delta in NEW open conversations
      // today vs yesterday. That's the business-meaningful daily signal.
      previous: (newConvToday.count ?? 0) - (newConvYesterday.count ?? 0),
    },
    newContactsToday: {
      current: newContactsToday.count ?? 0,
      previous: newContactsYesterday.count ?? 0,
    },
    conversionRate,
    revenueCollectedRatio,
    revenueCollectedAmount: collectedCur,
    revenueQuotedAmount: quotedCur,
    noShowRate,
    newPatientsRatio: {
      current: pct(newPatientsCur.newCount, newPatientsCur.distinctCount),
      previous: pct(newPatientsPrev.newCount, newPatientsPrev.distinctCount),
    },
    newPatientsCount: newPatientsCur.newCount,
    returningPatientsCount: newPatientsCur.distinctCount - newPatientsCur.newCount,
  }
}

async function countNewPatients(
  db: DB,
  appts: { contact_id: string | null }[],
  windowStart: string,
): Promise<{ distinctCount: number; newCount: number }> {
  const contactIds = Array.from(
    new Set(appts.map((a) => a.contact_id).filter((id): id is string => !!id)),
  )
  if (contactIds.length === 0) return { distinctCount: 0, newCount: 0 }

  const { data } = await db
    .from('appointments')
    .select('contact_id')
    .in('contact_id', contactIds)
    .lt('start_at', windowStart)

  const withPriorHistory = new Set(
    ((data ?? []) as { contact_id: string | null }[]).map((r) => r.contact_id),
  )
  const newCount = contactIds.filter((id) => !withPriorHistory.has(id)).length
  return { distinctCount: contactIds.length, newCount }
}

// --- 2. Conversations over time ---------------------------------------

export async function loadConversationsSeries(
  db: DB,
  rangeDays: number,
): Promise<ConversationsSeriesPoint[]> {
  const start = daysAgoStart(rangeDays - 1).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('created_at, sender_type')
    .gte('created_at', start)
    .order('created_at', { ascending: true })
  if (error) throw error

  const keys = lastNDayKeys(rangeDays)
  const buckets = new Map<string, { incoming: number; outgoing: number }>()
  for (const k of keys) buckets.set(k, { incoming: 0, outgoing: 0 })

  for (const row of (data ?? []) as { created_at: string; sender_type: string }[]) {
    const key = localDayKey(row.created_at)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (row.sender_type === 'customer') bucket.incoming += 1
    else bucket.outgoing += 1 // agent + bot both count as outgoing
  }

  return keys.map((day) => ({ day, ...(buckets.get(day) ?? { incoming: 0, outgoing: 0 }) }))
}

// --- 3. Today's appointments --------------------------------------------

export async function loadTodayAppointments(db: DB): Promise<TodayAppointmentItem[]> {
  const todayStart = startOfLocalDay().toISOString()
  const tomorrowStart = new Date(startOfLocalDay().getTime() + 86_400_000).toISOString()

  const { data, error } = await db
    .from('appointments')
    .select(
      'id, start_at, end_at, status, contact:contacts(name, phone), doctor:doctors(name), service_type:service_types(name)',
    )
    .gte('start_at', todayStart)
    .lt('start_at', tomorrowStart)
    .order('start_at', { ascending: true })
  if (error) throw error

  return ((data ?? []) as unknown as Array<{
    id: string
    start_at: string
    end_at: string
    status: TodayAppointmentItem['status']
    contact: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null
    doctor: { name: string }[] | { name: string } | null
    service_type: { name: string }[] | { name: string } | null
  }>).map((row) => {
    const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact
    const doctor = Array.isArray(row.doctor) ? row.doctor[0] : row.doctor
    const serviceType = Array.isArray(row.service_type) ? row.service_type[0] : row.service_type
    return {
      id: row.id,
      startAt: row.start_at,
      endAt: row.end_at,
      status: row.status,
      patientName: contact?.name || contact?.phone || null,
      doctorName: doctor?.name ?? null,
      serviceTypeName: serviceType?.name ?? null,
    }
  })
}

// --- 4. Response time by day of week ----------------------------------

export async function loadResponseTime(db: DB): Promise<ResponseTimeSummary> {
  // Pull the last 14 days of messages in one shot, then walk per
  // conversation to find each "first inbound" → "first subsequent
  // outbound" pair. 14 days gives us both "this week" + "last week"
  // with enough overlap if the user opens the dashboard late on a
  // Monday.
  const fourteenDaysAgo = daysAgoStart(13).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('conversation_id, sender_type, created_at')
    .gte('created_at', fourteenDaysAgo)
    .order('conversation_id', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as {
    conversation_id: string
    sender_type: string
    created_at: string
  }[]

  // Group per conversation, pair unreplied customer messages with the
  // next outbound message from the agent/bot. A single customer message
  // can only count once (avoids inflating averages if the customer
  // double-messages while the agent takes time to reply).
  interface Sample {
    customerAt: Date
    responseAt: Date
  }
  const samples: Sample[] = []

  let currentConv = ''
  let pendingCustomer: Date | null = null
  for (const row of rows) {
    if (row.conversation_id !== currentConv) {
      currentConv = row.conversation_id
      pendingCustomer = null
    }
    const ts = new Date(row.created_at)
    if (row.sender_type === 'customer') {
      if (!pendingCustomer) pendingCustomer = ts
    } else if (pendingCustomer) {
      samples.push({ customerAt: pendingCustomer, responseAt: ts })
      pendingCustomer = null
    }
  }

  const now = new Date()
  const thisWeekStart = daysAgoStart(mondayIndex(now))
  const lastWeekStart = daysAgoStart(mondayIndex(now) + 7)

  // Per-day-of-week buckets, averaged over both weeks' worth of data
  // so each bar has more samples to stand on. If a day has no samples
  // its avgMinutes stays null and the chart renders the bar muted.
  const byDow = new Map<number, number[]>()
  for (let i = 0; i < 7; i++) byDow.set(i, [])
  const thisWeekMins: number[] = []
  const lastWeekMins: number[] = []

  for (const s of samples) {
    const diffMin = (s.responseAt.getTime() - s.customerAt.getTime()) / 60_000
    if (diffMin < 0) continue
    const dow = mondayIndex(s.customerAt)
    byDow.get(dow)!.push(diffMin)
    if (s.customerAt >= thisWeekStart) {
      thisWeekMins.push(diffMin)
    } else if (s.customerAt >= lastWeekStart && s.customerAt < thisWeekStart) {
      lastWeekMins.push(diffMin)
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length

  const buckets: ResponseTimeBucket[] = Array.from({ length: 7 }, (_, dow) => {
    const samples = byDow.get(dow) ?? []
    return {
      dow,
      avgMinutes: avg(samples),
      samples: samples.length,
    }
  })

  // Silence unused-label warnings — keep the arrays explicitly named
  // for readability above.
  void DOW_SHORT_MON_FIRST

  return {
    buckets,
    thisWeekAvg: avg(thisWeekMins),
    lastWeekAvg: avg(lastWeekMins),
  }
}

// --- 5. Activity feed --------------------------------------------------

export async function loadActivity(db: DB, limit = 20): Promise<ActivityItem[]> {
  // Pull ~10 from each source (plenty of headroom after merge-sort),
  // then interleave by timestamp. The individual per-table limits
  // keep the payload small; the final limit is enforced after sort.
  const [msgs, contacts, deals, broadcasts, autoLogs] = await Promise.all([
    db
      .from('messages')
      .select('id, content_text, sender_type, created_at, conversation_id, conversations(contact_id, contacts(name, phone))')
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('contacts')
      .select('id, name, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('deals')
      .select('id, title, updated_at, stage:pipeline_stages(name)')
      .order('updated_at', { ascending: false })
      .limit(10),
    db
      .from('broadcasts')
      .select('id, name, status, total_recipients, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    db
      .from('automation_logs')
      .select('id, trigger_event, status, created_at, automation:automations(name), contact:contacts(name, phone)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const items: ActivityItem[] = []

  // PostgREST returns nested selections as arrays by default, even when
  // the foreign key is 1:1. We normalise by taking [0] on each level.
  for (const m of (msgs.data ?? []) as unknown as Array<{
    id: string
    content_text: string | null
    created_at: string
    conversation_id: string
    conversations:
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }[]
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }
      | null
  }>) {
    const conv = Array.isArray(m.conversations) ? m.conversations[0] : m.conversations
    const contact = Array.isArray(conv?.contacts) ? conv?.contacts[0] : conv?.contacts
    const who = contact?.name || contact?.phone || 'Unknown'
    items.push({
      id: `msg-${m.id}`,
      kind: 'message',
      text: `New message from ${who}`,
      at: m.created_at,
      href: `/inbox?c=${m.conversation_id}`,
    })
  }

  for (const c of (contacts.data ?? []) as Array<{ id: string; name: string | null; phone: string; created_at: string }>) {
    items.push({
      id: `contact-${c.id}`,
      kind: 'contact',
      text: `New contact: ${c.name || c.phone}`,
      at: c.created_at,
      href: '/contacts',
    })
  }

  for (const d of (deals.data ?? []) as unknown as Array<{
    id: string
    title: string
    updated_at: string
    stage: { name: string }[] | { name: string } | null
  }>) {
    const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage
    items.push({
      id: `deal-${d.id}`,
      kind: 'deal',
      text: stage?.name
        ? `Deal "${d.title}" in ${stage.name}`
        : `Deal "${d.title}" updated`,
      at: d.updated_at,
      href: '/pipelines',
    })
  }

  for (const b of (broadcasts.data ?? []) as Array<{
    id: string
    name: string
    status: string
    total_recipients: number
    created_at: string
  }>) {
    const label =
      b.status === 'sent'
        ? `sent to ${b.total_recipients} contacts`
        : `${b.status} (${b.total_recipients} recipients)`
    items.push({
      id: `broadcast-${b.id}`,
      kind: 'broadcast',
      text: `Broadcast "${b.name}" ${label}`,
      at: b.created_at,
      href: '/broadcasts',
    })
  }

  for (const l of (autoLogs.data ?? []) as unknown as Array<{
    id: string
    trigger_event: string
    status: string
    created_at: string
    automation: { name: string }[] | { name: string } | null
    contact: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null
  }>) {
    const automation = Array.isArray(l.automation) ? l.automation[0] : l.automation
    const contact = Array.isArray(l.contact) ? l.contact[0] : l.contact
    const who = contact?.name || contact?.phone || 'a contact'
    const autoName = automation?.name || 'Automation'
    items.push({
      id: `auto-${l.id}`,
      kind: 'automation',
      text: `Automation "${autoName}" ${l.status === 'failed' ? 'failed for' : 'triggered for'} ${who}`,
      at: l.created_at,
    })
  }

  return items
    .sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0))
    .slice(0, limit)
}
