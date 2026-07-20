// Shared result shapes the dashboard components consume. Centralised
// here so each component stays thin and the page-level loader wires
// them up without type gymnastics.

export interface MetricDelta {
  current: number
  previous: number
}

export interface MetricsBundle {
  activeConversations: MetricDelta
  newContactsToday: MetricDelta
  /** Won / (won + lost) deals closed in the last 30 days, as a percent. */
  conversionRate: MetricDelta
  /** Payments collected / quotes issued in the last 30 days, as a percent. */
  revenueCollectedRatio: MetricDelta
  /** Raw amount collected in the current 30-day window (subtitle context). */
  revenueCollectedAmount: number
  /** Raw amount quoted in the current 30-day window (subtitle context). */
  revenueQuotedAmount: number
  /** cancelled + no_show / total appointments in the last 30 days, as a percent. */
  noShowRate: MetricDelta
  /** Share of distinct patients seen in the last 30 days with no prior appointment. */
  newPatientsRatio: MetricDelta
  newPatientsCount: number
  returningPatientsCount: number
}

export interface ConversationsSeriesPoint {
  day: string // YYYY-MM-DD local
  incoming: number
  outgoing: number
}

export interface TodayAppointmentItem {
  id: string
  startAt: string
  endAt: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  patientName: string | null
  doctorName: string | null
  serviceTypeName: string | null
}

export interface ResponseTimeBucket {
  /** 0 = Mon … 6 = Sun (Monday-first). */
  dow: number
  /** Average first-response time in minutes. Null means no samples. */
  avgMinutes: number | null
  samples: number
}

export interface ResponseTimeSummary {
  buckets: ResponseTimeBucket[]
  thisWeekAvg: number | null
  lastWeekAvg: number | null
}

export type ActivityKind =
  | 'message'
  | 'deal'
  | 'broadcast'
  | 'automation'
  | 'contact'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  /** Primary line of text rendered in the feed. Pre-formatted. */
  text: string
  /** ISO timestamp the item happened at, drives relative-time + sort. */
  at: string
  /** Optional deep-link for the whole row (not all items have a target). */
  href?: string
}
