// ============================================================
// POST /api/internal/webhooks/new-account
//
// Receives a Supabase Database Webhook fired on INSERT into
// `accounts` (configured in the Supabase Dashboard → Database →
// Webhooks — not a SQL migration, since that lets the secret live in
// project config instead of a committed file) and emails every
// current platform admin that a new account was created.
//
// Auth: a static shared secret in the `x-webhook-secret` header,
// compared timing-safe against NEW_ACCOUNT_WEBHOOK_SECRET — same
// pattern as the cron routes (lib/cron/verify-secret.ts), reused here
// since a Database Webhook has no per-request signature the way
// Stripe/Cal.com do.
// ============================================================

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { timingSafeSecretEqual } from "@/lib/cron/verify-secret";
import { sendEmail } from "@/lib/email/resend-client";
import { renderBrandedEmail, escapeHtml } from "@/lib/email/branded-template";

const PLAN_LABEL: Record<string, string> = {
  trial: "Prueba",
  standalone: "Standalone",
  zentro_salud_starter: "Zentro Salud Starter",
  zentro_salud_pro: "Zentro Salud Pro",
};

export async function POST(request: Request) {
  const expected = process.env.NEW_ACCOUNT_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const supplied = request.headers.get("x-webhook-secret");
  if (!timingSafeSecretEqual(supplied, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const record = body?.record;
  if (body?.type !== "INSERT" || body?.table !== "accounts" || !record?.id) {
    // Not an error — a misconfigured webhook (wrong table/event) is a
    // dashboard setup mistake, not something to retry-storm over.
    return NextResponse.json({ ok: true, skipped: true });
  }

  const db = supabaseAdmin();

  const { data: admins } = await db.from("platform_admins").select("user_id");
  const recipientEmails = (
    await Promise.all(
      (admins ?? []).map(async (row) => {
        const { data } = await db.auth.admin.getUserById(row.user_id);
        return data?.user?.email ?? null;
      }),
    )
  ).filter((email): email is string => !!email);

  if (recipientEmails.length === 0) return NextResponse.json({ ok: true, sent: false });

  let ownerEmail: string | null = null;
  if (record.owner_user_id) {
    const { data } = await db.auth.admin.getUserById(record.owner_user_id);
    ownerEmail = data?.user?.email ?? null;
  }

  const planLabel = PLAN_LABEL[record.plan as string] ?? record.plan ?? "—";
  const accountName = typeof record.name === "string" ? record.name : "Cuenta nueva";

  const bodyHtml = `
    <p>Se registró una cuenta nueva en Zentro Med.</p>
    <table style="width:100%;font-size:14px;margin:16px 0;">
      <tr><td style="color:#666;padding:4px 0;">Cuenta</td><td style="padding:4px 0;"><strong>${escapeHtml(accountName)}</strong></td></tr>
      <tr><td style="color:#666;padding:4px 0;">Dueño</td><td style="padding:4px 0;">${escapeHtml(ownerEmail ?? "—")}</td></tr>
      <tr><td style="color:#666;padding:4px 0;">Plan</td><td style="padding:4px 0;">${escapeHtml(planLabel)}</td></tr>
    </table>
    <p><a href="https://med.zentrolabs.com/admin/accounts/${escapeHtml(record.id)}">Ver en el panel de admin →</a></p>
  `;

  try {
    await sendEmail({
      to: recipientEmails,
      subject: `Nueva cuenta: ${accountName}`,
      html: renderBrandedEmail({
        heading: "Nueva cuenta registrada",
        bodyHtml,
        brandName: "Zentro Med",
      }),
    });
  } catch (err) {
    // Same "never break the caller" posture as notifyAccountTeam — a
    // failed internal alert must not turn into a 500 the Database
    // Webhook then retries indefinitely.
    console.error("[POST /api/internal/webhooks/new-account] send failed:", err);
  }

  return NextResponse.json({ ok: true, sent: true, recipients: recipientEmails.length });
}
