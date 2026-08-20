import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { timingSafeSecretEqual } from "@/lib/cron/verify-secret";
import { sendAppointmentReminderEmail } from "@/lib/email/appointment-reminder-email";

/**
 * GET /api/appointment-reminders/cron
 *
 * Pensado para dispararse en agenda (pg_cron → net.http_get cada ~15 min).
 * Requiere el header `x-cron-secret` = APPOINTMENT_REMINDER_CRON_SECRET.
 *
 * Busca citas que entran a la ventana de 24h y aún no se han recordado, y
 * por cada una avisa al usuario que la agendó (created_by) y al médico
 * asignado (doctors.user_id), por correo + notificación in-app. La
 * notificación in-app además dispara el push FCM (trigger de la migración
 * 072). Marca la cita como recordada (reminder_24h_sent_at) al procesarla,
 * para no reenviar en corridas superpuestas.
 */
const SKIP_STATUSES = "(cancelled,completed,no_show)";
const TZ = "America/Mexico_City";

export async function GET(request: Request) {
  const expected = process.env.APPOINTMENT_REMINDER_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  if (!timingSafeSecretEqual(request.headers.get("x-cron-secret"), expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const nowIso = new Date().toISOString();
  const in24hIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://medcrm.zuhma.online";

  const { data: due, error } = await admin
    .from("appointments")
    .select("id, account_id, start_at, created_by, doctor_id, contact_id, service_type_id")
    .gt("start_at", nowIso)
    .lte("start_at", in24hIso)
    .is("reminder_24h_sent_at", null)
    .not("status", "in", SKIP_STATUSES)
    .limit(200);

  if (error) {
    console.error("[appointment-reminders] fetch error:", error);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }

  let processed = 0;
  let notified = 0;

  for (const appt of due ?? []) {
    try {
      // Claim primero (dedup ante corridas superpuestas).
      await admin
        .from("appointments")
        .update({ reminder_24h_sent_at: new Date().toISOString() })
        .eq("id", appt.id);

      // Contexto para el mensaje.
      const [contactRes, doctorRes, serviceRes] = await Promise.all([
        appt.contact_id
          ? admin.from("contacts").select("name, phone").eq("id", appt.contact_id).maybeSingle()
          : Promise.resolve({ data: null }),
        appt.doctor_id
          ? admin.from("doctors").select("name, user_id").eq("id", appt.doctor_id).maybeSingle()
          : Promise.resolve({ data: null }),
        appt.service_type_id
          ? admin.from("service_types").select("name").eq("id", appt.service_type_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const patientName =
        (contactRes.data as { name?: string; phone?: string } | null)?.name ||
        (contactRes.data as { phone?: string } | null)?.phone ||
        null;
      const doctor = doctorRes.data as { name?: string; user_id?: string | null } | null;
      const serviceName = (serviceRes.data as { name?: string } | null)?.name ?? null;

      const whenText = new Date(appt.start_at).toLocaleString("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: TZ,
      });

      const title = "Recordatorio de cita";
      const body =
        `Cita ${patientName ? `con ${patientName} ` : ""}el ${whenText}` +
        (doctor?.name ? ` · Dr(a). ${doctor.name}` : "");

      // Destinatarios: quien agendó + médico (si tiene login). Sin duplicar.
      const recipientIds = new Set<string>();
      if (appt.created_by) recipientIds.add(appt.created_by);
      if (doctor?.user_id) recipientIds.add(doctor.user_id);

      for (const userId of recipientIds) {
        const { data: profile } = await admin
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", userId)
          .maybeSingle<{ email: string | null; full_name: string | null }>();

        // Notificación in-app (dispara push).
        await admin.from("notifications").insert({
          account_id: appt.account_id,
          user_id: userId,
          type: "appointment_reminder",
          contact_id: appt.contact_id,
          title,
          body,
        });

        // Correo.
        if (profile?.email) {
          try {
            await sendAppointmentReminderEmail({
              to: profile.email,
              recipientName: profile.full_name,
              patientName,
              whenText,
              doctorName: doctor?.name ?? null,
              serviceName,
              baseUrl,
            });
          } catch (mailErr) {
            console.error("[appointment-reminders] email failed:", mailErr);
          }
        }
        notified++;
      }
      processed++;
    } catch (err) {
      console.error("[appointment-reminders] appointment failed:", appt.id, err);
    }
  }

  return NextResponse.json({ ok: true, processed, notified });
}
