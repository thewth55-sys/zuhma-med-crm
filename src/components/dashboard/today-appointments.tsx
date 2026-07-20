'use client'

import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { TodayAppointmentItem } from '@/lib/dashboard/types'
import { cn } from '@/lib/utils'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

const STATUS_STYLES: Record<TodayAppointmentItem['status'], string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  confirmed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  completed: 'bg-primary/10 text-primary border-primary/30',
  cancelled: 'bg-muted text-muted-foreground border-border',
  no_show: 'bg-red-500/10 text-red-400 border-red-500/30',
}

const timeFormatter = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' })

/**
 * Replaces the old sales-pipeline donut on the dashboard — a clinic's
 * day-to-day operational question is "who's coming in today", not
 * deal-stage value. Read-only; edits stay in the Agenda view.
 */
export function TodayAppointments({
  items,
  loading,
}: {
  items: TodayAppointmentItem[] | null
  loading: boolean
}) {
  const t = useTranslations('Dashboard.todayAppointments')
  const tStatus = useTranslations('Pipelines.appointments.status')

  return (
    <section className="flex h-full flex-col rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
          <p className="text-xs text-muted-foreground">{t('description')}</p>
        </div>
        <Link href="/agenda" className="text-xs font-medium text-primary hover:text-primary/80">
          {t('viewAgenda')}
        </Link>
      </header>

      {loading || !items ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 p-5">
          <EmptyState icon={CalendarClock} title={t('empty')} hint={t('emptyHint')} />
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {items.map((appt) => (
            <li key={appt.id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="w-14 shrink-0 text-sm font-medium tabular-nums text-foreground">
                {timeFormatter.format(new Date(appt.startAt))}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {appt.patientName || t('noPatient')}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[appt.doctorName, appt.serviceTypeName].filter(Boolean).join(' · ') || t('noDetails')}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  STATUS_STYLES[appt.status],
                )}
              >
                {tStatus(appt.status)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
