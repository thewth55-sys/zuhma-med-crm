import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./resend-client";
import { renderBrandedEmail } from "./branded-template";

/**
 * Internal team alerts (new booking, payment received) — sent to
 * every admin+ member with an email on file. Deliberately
 * "never throws": a notification failure (missing RESEND_API_KEY,
 * Resend outage, no admin has an email) must never fail the action
 * that triggered it — a payment got recorded or an appointment got
 * booked either way. Callers fire this without awaiting, or await it
 * and ignore the result.
 */
export async function notifyAccountTeam(
  db: SupabaseClient,
  params: {
    accountId: string;
    heading: string;
    bodyHtml: string;
    subject: string;
  },
): Promise<void> {
  try {
    const { data: account } = await db
      .from("accounts")
      .select("name, logo_url, quote_accent_color")
      .eq("id", params.accountId)
      .maybeSingle();
    if (!account) return;

    const { data: admins } = await db
      .from("profiles")
      .select("email")
      .eq("account_id", params.accountId)
      .in("account_role", ["owner", "admin"])
      .not("email", "is", null);

    const recipients = (admins ?? [])
      .map((p) => p.email as string | null)
      .filter((email): email is string => !!email);
    if (recipients.length === 0) return;

    const html = renderBrandedEmail({
      heading: params.heading,
      bodyHtml: params.bodyHtml,
      brandName: account.name,
      logoUrl: account.logo_url,
      accentColor: account.quote_accent_color,
      footerNote: `Notificación interna de ${account.name} en Zuhma Med CRM.`,
    });

    await sendEmail({ to: recipients, subject: params.subject, html });
  } catch (err) {
    console.error("[notifyAccountTeam] failed:", err);
  }
}
