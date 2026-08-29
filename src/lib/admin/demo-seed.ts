// ============================================================
// Sembrador de datos de cuenta demo — usado por POST
// /api/platform-admin/accounts/demo para que una cuenta demo recién
// creada se vea como una clínica real al impersonarla, en vez de un
// dashboard vacío. Contactos, conversaciones tipo WhatsApp, perfiles de
// paciente y una agenda poblada.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/** Dominio interno no entregable de los dueños de cuentas demo. Sirve
 *  para identificar (y permitir borrar solo) cuentas demo. */
export const DEMO_EMAIL_DOMAIN = "@internal.zuhma.online";

interface SeedDemoAccountDataArgs {
  accountId: string;
  ownerUserId: string;
}

const CONTACT_SEEDS = [
  { name: "Ana Lucía Torres", phone: "+525550000101", email: "ana.torres@example.com" },
  { name: "Julián Camilo Restrepo", phone: "+525550000102", email: "julian.restrepo@example.com" },
  { name: "María Fernanda Ríos", phone: "+525550000103", email: "maria.rios@example.com" },
  { name: "Carlos Eduardo Peña", phone: "+525550000104", email: "carlos.pena@example.com" },
  { name: "Diana Patricia Gómez", phone: "+525550000105", email: "diana.gomez@example.com" },
  { name: "Rodrigo Andrés Muñoz", phone: "+525550000106", email: "rodrigo.munoz@example.com" },
] as const;

export async function seedDemoAccountData(
  admin: SupabaseClient,
  { accountId, ownerUserId }: SeedDemoAccountDataArgs,
): Promise<void> {
  const { data: doctor, error: doctorErr } = await admin
    .from("doctors")
    .insert({ account_id: accountId, name: "Dr. Martínez", specialty: "Medicina general" })
    .select("id")
    .single();
  if (doctorErr || !doctor) {
    throw new Error(`Failed to seed demo doctor: ${doctorErr?.message ?? "no row returned"}`);
  }

  const { data: serviceType, error: serviceTypeErr } = await admin
    .from("service_types")
    .insert({ account_id: accountId, name: "Consulta general", duration_minutes: 30 })
    .select("id")
    .single();
  if (serviceTypeErr || !serviceType) {
    throw new Error(`Failed to seed demo service type: ${serviceTypeErr?.message ?? "no row returned"}`);
  }

  const { data: contacts, error: contactsErr } = await admin
    .from("contacts")
    .insert(
      CONTACT_SEEDS.map((c) => ({
        account_id: accountId,
        user_id: ownerUserId,
        name: c.name,
        phone: c.phone,
        email: c.email,
      })),
    )
    .select("id, name");
  if (contactsErr || !contacts) {
    throw new Error(`Failed to seed demo contacts: ${contactsErr?.message ?? "no rows returned"}`);
  }

  const contactId = (name: string): string => {
    const match = contacts.find((c) => c.name === name);
    if (!match) throw new Error(`Seeded contact "${name}" not found among inserted rows`);
    return match.id;
  };

  const { error: patientsErr } = await admin.from("patient_profiles").insert(
    contacts.map((c) => {
      const extra =
        c.name === "Ana Lucía Torres"
          ? { blood_type: "O+", allergies: "Penicilina" }
          : c.name === "Diana Patricia Gómez"
            ? { chronic_conditions: "Hipertensión" }
            : {};
      return { account_id: accountId, contact_id: c.id, assigned_doctor_id: doctor.id, ...extra };
    }),
  );
  if (patientsErr) {
    throw new Error(`Failed to seed demo patient profiles: ${patientsErr.message}`);
  }

  const conversationSeeds = [
    {
      contactName: "Ana Lucía Torres",
      status: "open" as const,
      lastMessageText: "Perfecto, ahí estaré 👍",
      messages: [
        { sender_type: "customer" as const, content_text: "Hola, ¿me confirman mi cita del jueves 3pm?" },
        {
          sender_type: "bot" as const,
          content_text:
            "¡Claro! Tu cita con Dr. Martínez está confirmada para el jueves a las 3:00pm. Te escribimos 24h antes para recordarte.",
        },
        { sender_type: "customer" as const, content_text: "Perfecto, ahí estaré 👍" },
      ],
    },
    {
      contactName: "Julián Camilo Restrepo",
      status: "open" as const,
      lastMessageText: "¿Tienen cupo mañana?",
      unreadCount: 1,
      messages: [{ sender_type: "customer" as const, content_text: "¿Tienen cupo mañana?" }],
    },
    {
      contactName: "María Fernanda Ríos",
      status: "closed" as const,
      lastMessageText: "Gracias por el recordatorio",
      messages: [{ sender_type: "customer" as const, content_text: "Gracias por el recordatorio" }],
    },
  ];

  const nowIso = new Date().toISOString();

  for (const seed of conversationSeeds) {
    const { data: conversation, error: convErr } = await admin
      .from("conversations")
      .insert({
        account_id: accountId,
        user_id: ownerUserId,
        contact_id: contactId(seed.contactName),
        status: seed.status,
        last_message_text: seed.lastMessageText,
        last_message_at: nowIso,
        unread_count: seed.unreadCount ?? 0,
      })
      .select("id")
      .single();
    if (convErr || !conversation) {
      throw new Error(`Failed to seed demo conversation: ${convErr?.message ?? "no row returned"}`);
    }

    const { error: messagesErr } = await admin.from("messages").insert(
      seed.messages.map((m) => ({
        conversation_id: conversation.id,
        sender_type: m.sender_type,
        content_text: m.content_text,
      })),
    );
    if (messagesErr) {
      throw new Error(`Failed to seed demo messages: ${messagesErr.message}`);
    }
  }

  const today = new Date();
  const at = (daysFromNow: number, hour: number, minute: number): Date => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  const appointmentSeeds = [
    { contactName: "Ana Lucía Torres", start: at(0, 9, 0), status: "confirmed" as const },
    { contactName: "Julián Camilo Restrepo", start: at(0, 10, 30), status: "pending" as const },
    { contactName: "María Fernanda Ríos", start: at(0, 15, 0), status: "confirmed" as const },
    { contactName: "Carlos Eduardo Peña", start: at(1, 11, 0), status: "confirmed" as const },
    { contactName: "Diana Patricia Gómez", start: at(2, 16, 0), status: "pending" as const },
    { contactName: "Rodrigo Andrés Muñoz", start: at(-1, 9, 30), status: "completed" as const },
  ];

  const { error: appointmentsErr } = await admin.from("appointments").insert(
    appointmentSeeds.map((a) => ({
      account_id: accountId,
      contact_id: contactId(a.contactName),
      doctor_id: doctor.id,
      service_type_id: serviceType.id,
      start_at: a.start.toISOString(),
      end_at: new Date(a.start.getTime() + 30 * 60_000).toISOString(),
      status: a.status,
      source: "manual",
    })),
  );
  if (appointmentsErr) {
    throw new Error(`Failed to seed demo appointments: ${appointmentsErr.message}`);
  }
}
