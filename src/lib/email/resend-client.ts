import { Resend } from "resend";

/**
 * Direct Resend API integration — sends transactional/notification
 * email from THIS app's own server code, independent of Supabase's
 * SMTP relay (which only ever fires for Supabase Auth's own built-in
 * email types: signup, magic link, password recovery, email change —
 * see docs/auth-email-hook.md for that separate piece). Everything
 * this app itself decides to send (documents to patients, internal
 * team alerts) goes through here instead.
 */

let _client: Resend | null = null;

function resendClient(): Resend {
  if (!_client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
    _client = new Resend(apiKey);
  }
  return _client;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer }[];
}

/**
 * Fire-and-report email send. Throws on failure — callers decide
 * whether that should surface to the end user (e.g. a toast on a
 * "send by email" button) or just get logged (a background
 * notification that shouldn't block the triggering action).
 */
export async function sendEmail(params: SendEmailParams): Promise<{ id: string }> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error("RESEND_FROM_EMAIL is not configured");

  const { data, error } = await resendClient().emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    replyTo: params.replyTo,
    attachments: params.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Resend returned no data");
  return { id: data.id };
}
