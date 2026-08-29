/**
 * Meta Conversions API (CAPI) sender.
 *
 * Same named-args, plain-`fetch()`, no-retry style as
 * `src/lib/whatsapp/meta-api.ts` — reuses its `throwMetaError` so both
 * modules parse Meta's `{error:{message}}` shape the same way.
 */

import crypto from "crypto";

import { throwMetaError } from "@/lib/whatsapp/meta-api";

const META_API_VERSION = "v21.0";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Meta requires E.164 digits only (no leading `+`) before hashing. */
function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface SendMetaConversionEventArgs {
  pixelId: string;
  accessToken: string;
  /** Meta's vocabulary (e.g. 'Lead', 'Purchase', 'Contact'), or a custom name for automations. */
  eventName: string;
  eventTime?: number; // unix seconds, defaults to now
  userData: { phone?: string; email?: string };
  customData?: Record<string, unknown>;
  testEventCode?: string;
  eventSourceUrl?: string;
}

export async function sendMetaConversionEvent(args: SendMetaConversionEventArgs): Promise<void> {
  const {
    pixelId,
    accessToken,
    eventName,
    eventTime = Math.floor(Date.now() / 1000),
    userData,
    customData,
    testEventCode,
    eventSourceUrl,
  } = args;

  const user_data: Record<string, string[]> = {};
  if (userData.phone) user_data.ph = [sha256(normalizePhone(userData.phone))];
  if (userData.email) user_data.em = [sha256(normalizeEmail(userData.email))];

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime,
        action_source: "system_generated",
        ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
        user_data,
        ...(customData ? { custom_data: customData } : {}),
      },
    ],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };

  const url = `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    await throwMetaError(response, `Meta CAPI error: ${response.status}`);
  }
}
