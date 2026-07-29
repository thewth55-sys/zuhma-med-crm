import crypto from "crypto";

// ============================================================
// Cliente REST de la API de Google Ads — Enhanced Conversions for Leads.
//
// Sube el resultado del pipeline (lead calificado / paciente) usando el
// correo/teléfono hasheado del lead, y retracta la conversión Lead de los
// descalificados. No requiere gclid. Se llama server-side desde
// dispatchGoogleAdsPipeline().
// ============================================================

const API_VERSION = "v18";

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const normEmail = (e: string) => e.trim().toLowerCase();
const normPhone = (p: string) => p.replace(/[^\d]/g, ""); // dígitos E.164, sin '+'

export interface GoogleAdsCreds {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string; // solo dígitos
  loginCustomerId?: string; // opcional (MCC)
}

async function getAccessToken(c: GoogleAdsCreds): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: c.refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`OAuth token error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("OAuth: respuesta sin access_token");
  return json.access_token;
}

function userIdentifiers(email?: string, phone?: string): Array<Record<string, string>> {
  const ids: Array<Record<string, string>> = [];
  if (email) ids.push({ hashedEmail: sha256(normEmail(email)) });
  if (phone) ids.push({ hashedPhoneNumber: sha256(normPhone(phone)) });
  return ids;
}

function headers(c: GoogleAdsCreds, token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "developer-token": c.developerToken,
    ...(c.loginCustomerId ? { "login-customer-id": c.loginCustomerId } : {}),
    "Content-Type": "application/json",
  };
}

interface UploadResponse {
  partialFailureError?: unknown;
}

/** Sube una conversión ECL (lead calificado / ganado) por correo+teléfono. */
export async function uploadClickConversion(
  c: GoogleAdsCreds,
  a: {
    conversionActionId: string;
    email?: string;
    phone?: string;
    value?: number;
    currency?: string;
    conversionDateTime: string; // 'yyyy-mm-dd hh:mm:ss+hh:mm'
    orderId?: string;
  },
): Promise<void> {
  const token = await getAccessToken(c);
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${c.customerId}:uploadClickConversions`;
  const body = {
    conversions: [
      {
        conversionAction: `customers/${c.customerId}/conversionActions/${a.conversionActionId}`,
        conversionDateTime: a.conversionDateTime,
        ...(a.value != null ? { conversionValue: a.value, currencyCode: a.currency ?? "MXN" } : {}),
        userIdentifiers: userIdentifiers(a.email, a.phone),
        ...(a.orderId ? { orderId: a.orderId } : {}),
      },
    ],
    partialFailure: true,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: headers(c, token),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as UploadResponse;
  if (!res.ok) throw new Error(`Google Ads upload ${res.status}: ${JSON.stringify(json)}`);
  if (json.partialFailureError) {
    throw new Error(`Google Ads partial failure: ${JSON.stringify(json.partialFailureError)}`);
  }
}

/** Retracta la conversión Lead de un lead descalificado (por orderId). */
export async function retractConversion(
  c: GoogleAdsCreds,
  a: { conversionActionId: string; orderId: string; adjustmentDateTime: string },
): Promise<void> {
  const token = await getAccessToken(c);
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${c.customerId}:uploadConversionAdjustments`;
  const body = {
    conversionAdjustments: [
      {
        conversionAction: `customers/${c.customerId}/conversionActions/${a.conversionActionId}`,
        adjustmentType: "RETRACTION",
        adjustmentDateTime: a.adjustmentDateTime,
        orderId: a.orderId,
      },
    ],
    partialFailure: true,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: headers(c, token),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as UploadResponse;
  if (!res.ok) throw new Error(`Google Ads adjust ${res.status}: ${JSON.stringify(json)}`);
  if (json.partialFailureError) {
    throw new Error(`Google Ads partial failure: ${JSON.stringify(json.partialFailureError)}`);
  }
}

/** Formatea una fecha a 'yyyy-mm-dd hh:mm:ss+hh:mm' (offset requerido por Google). */
export function gAdsDateTime(d: Date, offset = "-06:00"): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(
    d.getUTCMinutes(),
  )}:${p(d.getUTCSeconds())}${offset}`;
}
