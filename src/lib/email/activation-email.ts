import { renderBrandedEmail } from "@/lib/email/branded-template";
import { sendEmail } from "@/lib/email/resend-client";
import { ACTIVATION_CODE_TTL_DAYS } from "@/lib/auth/activation-code";

// Correo de activación con CÓDIGO (no link). Reutilizado por la creación
// de cuenta y por el reenvío de activación del admin. El código se muestra
// grande y monoespaciado para que sea fácil de copiar/teclear en /activar.

export interface SendActivationCodeEmailArgs {
  to: string;
  code: string;
  /** Dominio base para armar el enlace a /activar (ej. https://medcrm.zuhma.online). */
  baseUrl: string;
}

/**
 * Normaliza la URL base para que el enlace nunca salga malformado aunque
 * la env venga con un typo: corrige el error común de una sola diagonal
 * tras el esquema (`https:/host` → `https://host`) y agrega `https://`
 * si falta el protocolo. Gmail marca "url no válida" ante un `https:/`.
 */
function normalizeBaseUrl(raw: string): string {
  let base = raw.trim().replace(/\/+$/, "");
  base = base.replace(/^(https?:)\/(?!\/)/i, "$1//");
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base;
}

export async function sendActivationCodeEmail(args: SendActivationCodeEmailArgs): Promise<void> {
  const activateUrl = `${normalizeBaseUrl(args.baseUrl)}/activar`;

  const codeBlock =
    `<div style="margin:16px 0; padding:16px; text-align:center; background-color:#f4f4f5; ` +
    `border-radius:8px; font-family:'Courier New',monospace; font-size:28px; font-weight:700; ` +
    `letter-spacing:6px; color:#1a1a1a;">${args.code}</div>`;

  const html = renderBrandedEmail({
    heading: "Activa tu cuenta en Zuhma",
    bodyHtml:
      `<p>Te damos la bienvenida a Zuhma. Para activar tu cuenta, entra a la página de ` +
      `activación e ingresa este código:</p>` +
      codeBlock +
      `<p style="margin-top:4px;">Ve a <a href="${activateUrl}" style="color:#f94b5a;">${activateUrl}</a>, ` +
      `escribe tu correo y este código, define tu contraseña y acepta los Términos y Condiciones.</p>` +
      `<p style="margin-top:16px; font-size:12px; color:#999;">El código vence en ` +
      `${ACTIVATION_CODE_TTL_DAYS} días. Si no solicitaste esta cuenta, ignora este correo.</p>`,
    brandName: "Zuhma",
  });

  await sendEmail({
    to: args.to,
    subject: "Tu código de activación de Zuhma",
    html,
  });
}
