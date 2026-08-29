import { renderBrandedEmail, emailButton, escapeHtml } from "@/lib/email/branded-template";
import { sendEmail } from "@/lib/email/resend-client";

export interface AppointmentReminderEmailArgs {
  to: string;
  recipientName?: string | null;
  patientName?: string | null;
  /** Texto ya formateado, p.ej. "viernes 15 de agosto, 16:30". */
  whenText: string;
  doctorName?: string | null;
  serviceName?: string | null;
  baseUrl: string;
}

/** Correo branded de recordatorio de cita (24h antes). */
export async function sendAppointmentReminderEmail(a: AppointmentReminderEmailArgs): Promise<void> {
  const agendaUrl = `${a.baseUrl.replace(/\/+$/, "")}/agenda`;

  const rows = [
    a.patientName ? `<p style="margin:2px 0;"><strong>Paciente:</strong> ${escapeHtml(a.patientName)}</p>` : "",
    `<p style="margin:2px 0;"><strong>Cuándo:</strong> ${escapeHtml(a.whenText)}</p>`,
    a.doctorName ? `<p style="margin:2px 0;"><strong>Médico:</strong> ${escapeHtml(a.doctorName)}</p>` : "",
    a.serviceName ? `<p style="margin:2px 0;"><strong>Servicio:</strong> ${escapeHtml(a.serviceName)}</p>` : "",
  ].join("");

  const html = renderBrandedEmail({
    heading: "Recordatorio de cita",
    bodyHtml:
      `<p>Hola${a.recipientName ? " " + escapeHtml(a.recipientName) : ""}, tienes una cita en las próximas 24 horas:</p>` +
      `<div style="margin:12px 0; padding:12px 16px; background-color:#f4f4f5; border-radius:8px;">${rows}</div>` +
      emailButton("Ver en la agenda", agendaUrl),
    brandName: "Zuhma",
  });

  await sendEmail({ to: a.to, subject: "Recordatorio de cita — Zuhma", html });
}
