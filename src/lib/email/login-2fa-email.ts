import { renderBrandedEmail, escapeHtml } from "@/lib/email/branded-template";
import { sendEmail } from "@/lib/email/resend-client";

export interface Login2faEmailArgs {
  to: string;
  code: string;
  /** Contexto opcional del intento, para que el usuario detecte fraude. */
  device?: string | null;
  location?: string | null;
}

/** Correo branded con el código de verificación de inicio de sesión. */
export async function sendLogin2faEmail(a: Login2faEmailArgs): Promise<void> {
  const context = [a.device, a.location].filter(Boolean).map((x) => escapeHtml(String(x))).join(" · ");

  const html = renderBrandedEmail({
    heading: "Código de inicio de sesión",
    bodyHtml:
      `<p>Detectamos un inicio de sesión desde un dispositivo nuevo. Usa este código para continuar (vence en 10 minutos):</p>` +
      `<div style="margin:16px 0;text-align:center;">` +
      `<span style="display:inline-block;font-size:32px;font-weight:700;letter-spacing:8px;color:#111;background-color:#f4f4f5;border-radius:10px;padding:14px 20px;">${escapeHtml(a.code)}</span>` +
      `</div>` +
      (context ? `<p style="color:#71717a;font-size:13px;">Intento: ${context}</p>` : "") +
      `<p style="color:#71717a;font-size:13px;">Si no fuiste tú, no compartas este código y cambia tu contraseña.</p>`,
    brandName: "Zuhma",
  });

  await sendEmail({ to: a.to, subject: "Tu código de inicio de sesión — Zuhma", html });
}
