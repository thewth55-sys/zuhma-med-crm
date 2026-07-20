import type { SupabaseClient } from '@supabase/supabase-js'
import { computeAvailableSlots } from '@/lib/scheduling/public-booking'
import { notifyAccountTeam } from '@/lib/email/notify-team'
import { escapeHtml } from '@/lib/email/branded-template'
import type { ToolDefinition, ToolExecutor } from '../types'

// ============================================================
// Real-agenda tools for the AI auto-reply assistant — gated by
// `ai_configs.agenda_access_enabled` (off by default). Reuses the
// exact slot-computation the public booking widget uses
// (lib/scheduling/public-booking.ts) so a WhatsApp-booked appointment
// respects the same availability sources (declared blocks minus
// existing appointments minus Google Calendar busy time) rather than
// a second, divergent notion of "free".
//
// Booking always lands as `status: 'pending'` — same as the public
// widget — so a human still confirms it; the assistant proposes, it
// doesn't finalize. `source: 'ai_agent'` keeps it distinguishable in
// the Agenda view and reporting from a staff-entered or
// widget-entered booking.
// ============================================================

export const AGENDA_TOOLS: ToolDefinition[] = [
  {
    name: 'list_doctors_and_services',
    description:
      "Lists the business's active doctors and service types, with each one's id. Call this first if the customer hasn't already specified which doctor or service they want — you need real ids before calling check_availability or book_appointment.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'check_availability',
    description:
      'Returns real open appointment slots for one doctor and service type on a given date. Use the ids from list_doctors_and_services.',
    parameters: {
      type: 'object',
      properties: {
        doctor_id: { type: 'string', description: 'Doctor id from list_doctors_and_services.' },
        service_type_id: { type: 'string', description: 'Service type id from list_doctors_and_services.' },
        date: { type: 'string', description: 'Date to check, as YYYY-MM-DD.' },
      },
      required: ['doctor_id', 'service_type_id', 'date'],
    },
  },
  {
    name: 'book_appointment',
    description:
      "Books the appointment for the customer you're currently talking to, at an exact slot start time returned by check_availability. The booking is created as pending — a staff member still confirms it — so tell the customer it's provisional, not fully confirmed.",
    parameters: {
      type: 'object',
      properties: {
        doctor_id: { type: 'string', description: 'Doctor id from list_doctors_and_services.' },
        service_type_id: { type: 'string', description: 'Service type id from list_doctors_and_services.' },
        start_at: { type: 'string', description: 'Exact slot start time (ISO 8601), from check_availability.' },
      },
      required: ['doctor_id', 'service_type_id', 'start_at'],
    },
  },
]

export interface AgendaToolContext {
  db: SupabaseClient
  accountId: string
  contactId: string
}

function dayRangeUtc(dateStr: string): { rangeStart: string; rangeEnd: string } | null {
  const start = new Date(`${dateStr}T00:00:00.000Z`)
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() }
}

export function createAgendaToolExecutor(ctx: AgendaToolContext): ToolExecutor {
  const { db, accountId, contactId } = ctx

  return async function executeAgendaTool(name, args): Promise<string> {
    try {
      switch (name) {
        case 'list_doctors_and_services': {
          const [{ data: doctors }, { data: serviceTypes }] = await Promise.all([
            db
              .from('doctors')
              .select('id, name, specialty')
              .eq('account_id', accountId)
              .eq('is_active', true)
              .order('name'),
            db
              .from('service_types')
              .select('id, name, duration_minutes')
              .eq('account_id', accountId)
              .eq('is_active', true)
              .order('name'),
          ])
          return JSON.stringify({ doctors: doctors ?? [], service_types: serviceTypes ?? [] })
        }

        case 'check_availability': {
          const doctorId = typeof args.doctor_id === 'string' ? args.doctor_id : ''
          const serviceTypeId = typeof args.service_type_id === 'string' ? args.service_type_id : ''
          const date = typeof args.date === 'string' ? args.date : ''
          const range = dayRangeUtc(date)
          if (!doctorId || !serviceTypeId || !range) {
            return JSON.stringify({ error: 'doctor_id, service_type_id and a valid date are required.' })
          }

          const { data: serviceType } = await db
            .from('service_types')
            .select('duration_minutes')
            .eq('id', serviceTypeId)
            .eq('account_id', accountId)
            .eq('is_active', true)
            .maybeSingle()
          if (!serviceType) {
            return JSON.stringify({ error: 'Unknown or inactive service_type_id.' })
          }

          const slots = await computeAvailableSlots(db, {
            accountId,
            doctorId,
            slotMinutes: serviceType.duration_minutes,
            rangeStart: range.rangeStart,
            rangeEnd: range.rangeEnd,
          })
          return JSON.stringify({ available_slots: slots })
        }

        case 'book_appointment': {
          const doctorId = typeof args.doctor_id === 'string' ? args.doctor_id : ''
          const serviceTypeId = typeof args.service_type_id === 'string' ? args.service_type_id : ''
          const startAtRaw = typeof args.start_at === 'string' ? args.start_at : ''
          const startAt = new Date(startAtRaw)
          if (!doctorId || !serviceTypeId || Number.isNaN(startAt.getTime())) {
            return JSON.stringify({ error: 'doctor_id, service_type_id and a valid start_at are required.' })
          }
          if (startAt.getTime() < Date.now()) {
            return JSON.stringify({ error: 'That time is in the past.' })
          }

          const [{ data: doctor }, { data: serviceType }] = await Promise.all([
            db
              .from('doctors')
              .select('id, name')
              .eq('id', doctorId)
              .eq('account_id', accountId)
              .eq('is_active', true)
              .maybeSingle(),
            db
              .from('service_types')
              .select('id, name, duration_minutes')
              .eq('id', serviceTypeId)
              .eq('account_id', accountId)
              .eq('is_active', true)
              .maybeSingle(),
          ])
          if (!doctor || !serviceType) {
            return JSON.stringify({ error: 'Unknown doctor_id or service_type_id.' })
          }

          const endAt = new Date(startAt.getTime() + serviceType.duration_minutes * 60_000)

          // Re-validate freshness right before insert — the model's
          // check_availability call could be stale by now (another
          // booking landed in between), same discipline as the public
          // booking route's own re-check.
          const dayStart = new Date(startAt)
          dayStart.setUTCHours(0, 0, 0, 0)
          const dayEnd = new Date(dayStart)
          dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)
          const freshSlots = await computeAvailableSlots(db, {
            accountId,
            doctorId,
            slotMinutes: serviceType.duration_minutes,
            rangeStart: dayStart.toISOString(),
            rangeEnd: dayEnd.toISOString(),
          })
          const stillAvailable = freshSlots.some((s) => s.start_at === startAt.toISOString())
          if (!stillAvailable) {
            return JSON.stringify({
              error: 'That slot is no longer available — call check_availability again for other options.',
            })
          }

          const { data: appointment, error: apptError } = await db
            .from('appointments')
            .insert({
              account_id: accountId,
              contact_id: contactId,
              doctor_id: doctor.id,
              service_type_id: serviceType.id,
              start_at: startAt.toISOString(),
              end_at: endAt.toISOString(),
              status: 'pending',
              source: 'ai_agent',
            })
            .select('id, start_at, end_at')
            .single()
          if (apptError) {
            console.error('[ai agenda tool] book_appointment insert failed:', apptError)
            return JSON.stringify({ error: 'Could not create the appointment.' })
          }

          const startLabel = new Intl.DateTimeFormat('es-MX', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(startAt)
          void notifyAccountTeam(db, {
            accountId,
            subject: `Nueva cita agendada por el asistente de IA`,
            heading: 'Nueva cita agendada por el asistente de IA',
            bodyHtml: `<p>El asistente de IA agendó una cita (pendiente de confirmar) para <strong>${escapeHtml(startLabel)}</strong> con ${escapeHtml(doctor.name)} (${escapeHtml(serviceType.name)}).</p>`,
          })

          return JSON.stringify({
            booked: true,
            status: 'pending',
            appointment_id: appointment.id,
            start_at: appointment.start_at,
            end_at: appointment.end_at,
          })
        }

        default:
          return JSON.stringify({ error: `Unknown tool: ${name}` })
      }
    } catch (err) {
      console.error(`[ai agenda tool] ${name} failed:`, err)
      return JSON.stringify({ error: 'Tool call failed unexpectedly.' })
    }
  }
}
