import type { SupabaseClient } from "@supabase/supabase-js";

import { registerPhoneNumber, subscribeWabaToApp, verifyPhoneNumber } from "@/lib/whatsapp/meta-api";
import { encrypt } from "@/lib/whatsapp/encryption";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";

/**
 * The full "connect WhatsApp" orchestration — verify with Meta,
 * check the phone number isn't already claimed by another account,
 * register for inbound webhooks, subscribe the WABA, encrypt +
 * persist. Extracted from the client's own `/api/whatsapp/config`
 * POST handler (unchanged logic) so a platform admin can drive the
 * exact same flow from `/api/platform-admin/accounts/[accountId]/whatsapp-config`
 * on a client's behalf — doctors setting this up themselves is often
 * not realistic, but the Meta-side verification/registration/webhook
 * subscription steps must not diverge between the two call sites.
 *
 * `supabase` should be RLS-scoped to the target account (the client
 * route) or the service-role client (the admin route) — either works
 * since every query here is already explicitly filtered by
 * `account_id`.
 */
export interface SaveWhatsAppConfigParams {
  supabase: SupabaseClient;
  accountId: string;
  savedByUserId: string;
  phoneNumberId: string;
  wabaId?: string | null;
  accessToken: string;
  verifyToken?: string | null;
  pin?: string | null;
}

export interface SaveWhatsAppConfigResult {
  ok: boolean;
  error?: string;
  errorStatus?: number;
  registered?: boolean;
  registrationSkipped?: boolean;
  registrationError?: string | null;
  phoneInfo?: unknown;
}

export async function saveWhatsAppConfig(params: SaveWhatsAppConfigParams): Promise<SaveWhatsAppConfigResult> {
  const { supabase, accountId, savedByUserId, phoneNumberId, wabaId, accessToken, verifyToken, pin } = params;

  if (!accessToken || !phoneNumberId) {
    return { ok: false, error: "access_token and phone_number_id are required", errorStatus: 400 };
  }
  if (pin !== undefined && pin !== null && pin !== "" && !/^\d{6}$/.test(pin)) {
    return { ok: false, error: "PIN must be exactly 6 digits.", errorStatus: 400 };
  }

  // Reject if another account has already claimed this phone_number_id
  // (single-tenant-per-number — see issue #136 referenced in the
  // original route).
  const { data: claimed, error: claimedError } = await supabaseAdmin()
    .from("whatsapp_config")
    .select("account_id")
    .eq("phone_number_id", phoneNumberId)
    .neq("account_id", accountId)
    .maybeSingle();

  if (claimedError) {
    console.error("[saveWhatsAppConfig] claim check error:", claimedError);
    return { ok: false, error: "Failed to validate configuration", errorStatus: 500 };
  }
  if (claimed) {
    return {
      ok: false,
      error: "Este número de WhatsApp ya está vinculado a otra cuenta.",
      errorStatus: 409,
    };
  }

  let phoneInfo: unknown;
  try {
    phoneInfo = await verifyPhoneNumber({ phoneNumberId, accessToken });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Meta API error";
    return { ok: false, error: `Meta API error: ${message}`, errorStatus: 400 };
  }

  let encryptedAccessToken: string;
  let encryptedVerifyToken: string | null;
  try {
    encryptedAccessToken = encrypt(accessToken);
    encryptedVerifyToken = verifyToken ? encrypt(verifyToken) : null;
  } catch {
    return {
      ok: false,
      error: "Failed to encrypt token. Check that ENCRYPTION_KEY is a valid 64-character hex string.",
      errorStatus: 500,
    };
  }

  const { data: existing } = await supabase
    .from("whatsapp_config")
    .select("id, registered_at, phone_number_id")
    .eq("account_id", accountId)
    .maybeSingle();

  const sameNumber = existing?.phone_number_id === phoneNumberId && existing?.registered_at != null;

  let registeredAt: string | null = existing?.registered_at ?? null;
  let registrationError: string | null = null;
  let registrationSkipped = false;

  const needsRegistration = !sameNumber || (typeof pin === "string" && pin.length > 0);
  if (needsRegistration) {
    if (!pin) {
      registrationSkipped = true;
    } else {
      try {
        await registerPhoneNumber({ phoneNumberId, accessToken, pin });
        registeredAt = new Date().toISOString();
      } catch (err) {
        registrationError = err instanceof Error ? err.message : "Unknown Meta API error";
        console.error("[saveWhatsAppConfig] /register failed:", registrationError);
      }
    }
  }

  let subscribedAppsAt: string | null = null;
  if (wabaId) {
    try {
      await subscribeWabaToApp({ wabaId, accessToken });
      subscribedAppsAt = new Date().toISOString();
    } catch (err) {
      console.warn("[saveWhatsAppConfig] WABA subscribed_apps failed (non-fatal):", err);
    }
  }

  const baseRow = {
    phone_number_id: phoneNumberId,
    waba_id: wabaId || null,
    access_token: encryptedAccessToken,
    verify_token: encryptedVerifyToken,
    status: registrationError ? "disconnected" : "connected",
    connected_at: registrationError ? null : new Date().toISOString(),
    registered_at: registrationError ? null : registeredAt,
    subscribed_apps_at: subscribedAppsAt ?? null,
    last_registration_error: registrationError,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error: updateError } = await supabase.from("whatsapp_config").update(baseRow).eq("account_id", accountId);
    if (updateError) {
      console.error("[saveWhatsAppConfig] update error:", updateError);
      return { ok: false, error: "Failed to update configuration", errorStatus: 500 };
    }
  } else {
    const { error: insertError } = await supabase
      .from("whatsapp_config")
      .insert({ account_id: accountId, user_id: savedByUserId, ...baseRow });
    if (insertError) {
      console.error("[saveWhatsAppConfig] insert error:", insertError);
      return { ok: false, error: "Failed to save configuration", errorStatus: 500 };
    }
  }

  return {
    ok: true,
    registered: registeredAt != null,
    registrationSkipped,
    registrationError,
    phoneInfo,
  };
}
