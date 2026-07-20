// ============================================================
// Shared HTML wrapper for every email this app sends directly via
// Resend — table-based layout (email-client-safe, no flexbox/grid),
// inline styles only (many clients strip <style> blocks).
//
// ZUHMA_CORAL/ZUHMA_CORAL_DARK are the real brand colors, the same
// ones pdf-theme.ts uses (Zuhma's primary coral, #F94B5A).
// ============================================================

const ZUHMA_CORAL = "#f94b5a";
const ZUHMA_CORAL_DARK = "#a83240";

/**
 * Escapes the 5 characters HTML gives special meaning, for any
 * user-controlled string (a patient's name, phone, a WhatsApp
 * message) interpolated into a `bodyHtml` string before it's handed
 * to `renderBrandedEmail`. Without this, a patient could name
 * themselves `<a href="https://evil">...` on the public booking form
 * and have that render as a live link/markup in the internal team
 * notification email — no script execution (mail clients strip
 * `<script>`), but real HTML/link injection into a trusted email.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface BrandedEmailParams {
  /** Shown as the big heading inside the email body. */
  heading: string;
  /** Pre-escaped/trusted HTML for the body content — paragraphs, a button, etc. */
  bodyHtml: string;
  /** "Zuhma Med CRM" for the app's own emails, or a clinic's name for patient-facing documents. */
  brandName: string;
  /** Clinic's own logo for patient-facing emails; omit to fall back to Zuhma's isotipo. */
  logoUrl?: string | null;
  /** Clinic's own accent color; falls back to Zuhma's real green. */
  accentColor?: string | null;
  /** Small print at the very bottom, e.g. "Enviado por Clínica X vía Zuhma Med CRM". */
  footerNote?: string;
}

/**
 * Renders the full HTML document for one email. Keep the caller's
 * `bodyHtml` to simple tags (`<p>`, `<a>`, `<strong>`) — this wrapper
 * only owns the header/footer chrome, not rich content styling.
 */
export function renderBrandedEmail(params: BrandedEmailParams): string {
  const accent = params.accentColor || ZUHMA_CORAL;
  const logo = params.logoUrl || "https://app.zuhma.com/zentro-isotipo.png";

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f5; font-family: Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; max-width:560px; width:100%;">
            <tr>
              <td style="background-color:${accent}; height:6px; line-height:6px; font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${logo}" width="32" height="32" alt="" style="display:block; border-radius:6px;" />
                    </td>
                    <td style="vertical-align:middle; padding-left:10px; font-size:15px; font-weight:700; color:${ZUHMA_CORAL_DARK};">
                      ${params.brandName}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <h1 style="margin:0 0 16px 0; font-size:20px; color:#1a1a1a;">${params.heading}</h1>
                <div style="font-size:14px; line-height:1.6; color:#333;">
                  ${params.bodyHtml}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 28px 32px; border-top:1px solid #eee; margin-top:16px;">
                <p style="margin:16px 0 0 0; font-size:11px; color:#999;">
                  ${params.footerNote || "Este es un correo automático, no es necesario responder."}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Small helper for a call-to-action button matching the app's button style. */
export function emailButton(label: string, href: string, accentColor?: string | null): string {
  const accent = accentColor || ZUHMA_CORAL;
  return `<a href="${href}" style="display:inline-block; margin-top:12px; padding:10px 20px; background-color:${accent}; color:${ZUHMA_CORAL_DARK}; font-weight:700; font-size:14px; text-decoration:none; border-radius:6px;">${label}</a>`;
}
