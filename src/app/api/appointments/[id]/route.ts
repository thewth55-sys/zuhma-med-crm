import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { syncAppointmentToGoogle, removeAppointmentFromGoogle } from '@/lib/scheduling/google-calendar-sync';

const PATCHABLE_FIELDS = [
  'doctor_id',
  'room_id',
  'service_type_id',
  'start_at',
  'end_at',
  'status',
  'notes',
] as const;

/**
 * PATCH /api/appointments/[id] — the single choke point for
 * confirm/reschedule/cancel. Phase A: plain field updates only. Phases
 * B/C add the Google Calendar create/update/delete dispatch here
 * (per the plan, this route is deliberately where that lives — not
 * the webhook, not a cron — so every path that changes an
 * appointment's doctor/room/time/status goes through one place).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const updates: Record<string, unknown> = {};
    for (const field of PATCHABLE_FIELDS) {
      if (field in body) updates[field] = body[field] ?? null;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('appointments')
      .select('doctor_id, room_id, start_at, end_at, status')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    // Auto-confirm once doctor + room are both set and the caller
    // didn't explicitly choose a status.
    if (!('status' in updates)) {
      const doctorId = 'doctor_id' in updates ? updates.doctor_id : existing.doctor_id;
      const roomId = 'room_id' in updates ? updates.room_id : existing.room_id;
      if (doctorId && roomId && existing.status === 'pending') {
        updates.status = 'confirmed';
      }
    }

    const { data, error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select('*, doctor:doctors(*), room:rooms(*), service_type:service_types(*)')
      .single();

    if (error) {
      console.error('[appointments PATCH] error:', error);
      return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 });
    }

    await syncAppointmentToGoogle(supabase, accountId, {
      id: data.id,
      contact_id: data.contact_id,
      room_id: data.room_id,
      start_at: data.start_at,
      end_at: data.end_at,
      status: data.status,
      notes: data.notes,
    });

    return NextResponse.json({ appointment: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await params;

    // Read Google links BEFORE deleting — appointment_google_events
    // cascade-deletes with the appointment row.
    await removeAppointmentFromGoogle(supabase, accountId, id);

    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      console.error('[appointments DELETE] error:', error);
      return NextResponse.json({ error: 'Failed to delete appointment' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
