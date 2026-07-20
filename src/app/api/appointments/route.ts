import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { syncAppointmentToGoogle } from '@/lib/scheduling/google-calendar-sync';

/**
 * GET  /api/appointments  — list appointments (filtered), used by the
 *                            deal-form Cita panel and conflict checks.
 * POST /api/appointments  — create an appointment for a deal/contact.
 *
 * Google Calendar dispatch (Phase C) also lives here (creation) and
 * at the PATCH/DELETE choke points in [id]/route.ts — every path that
 * changes an appointment's doctor/room/time/status goes through one
 * of these three, per the plan.
 */
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('viewer');
    const url = new URL(request.url);
    const dealId = url.searchParams.get('deal_id');
    const contactId = url.searchParams.get('contact_id');
    const doctorId = url.searchParams.get('doctor_id');
    const roomId = url.searchParams.get('room_id');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    let query = supabase
      .from('appointments')
      .select('*, doctor:doctors(*), room:rooms(*), service_type:service_types(*), contact:contacts(*)')
      .eq('account_id', accountId)
      .order('start_at', { ascending: true });

    if (dealId) query = query.eq('deal_id', dealId);
    if (contactId) query = query.eq('contact_id', contactId);
    if (doctorId) query = query.eq('doctor_id', doctorId);
    if (roomId) query = query.eq('room_id', roomId);
    if (from) query = query.gte('end_at', from);
    if (to) query = query.lte('start_at', to);
    // Cancelled appointments don't count toward conflict checks.
    if (doctorId || roomId) query = query.neq('status', 'cancelled');

    const { data, error } = await query;
    if (error) {
      console.error('[appointments GET] error:', error);
      return NextResponse.json({ error: 'Failed to load appointments' }, { status: 500 });
    }

    return NextResponse.json({ appointments: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const body = await request.json().catch(() => ({}));

    if (!body.start_at || !body.end_at) {
      return NextResponse.json({ error: 'start_at and end_at are required' }, { status: 400 });
    }
    if (new Date(body.end_at) <= new Date(body.start_at)) {
      return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 400 });
    }

    const doctorId = body.doctor_id || null;
    const roomId = body.room_id || null;
    const status = doctorId && roomId ? 'confirmed' : 'pending';

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        account_id: accountId,
        deal_id: body.deal_id || null,
        contact_id: body.contact_id || null,
        doctor_id: doctorId,
        room_id: roomId,
        service_type_id: body.service_type_id || null,
        start_at: body.start_at,
        end_at: body.end_at,
        status,
        source: 'manual',
        notes: body.notes || null,
        created_by: userId,
      })
      .select('*, doctor:doctors(*), room:rooms(*), service_type:service_types(*)')
      .single();

    if (error) {
      console.error('[appointments POST] error:', error);
      return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 });
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

    return NextResponse.json({ appointment: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
