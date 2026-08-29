import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { getFirebaseMessaging } from "./firebase-admin";

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export interface PushPayload {
  title: string;
  body: string;
  /** Se abre al tocar la notificación — ver el handler `pushNotificationActionPerformed` en push-registration.tsx. */
  url?: string;
}

interface TokenRow {
  id: string;
  token: string;
}

/**
 * Núcleo compartido de envío + limpieza de tokens muertos. No hace nada
 * si Firebase no está configurado o no hay filas a las cuales enviar —
 * esto nunca debe romper un mensaje entrante de WhatsApp ni una
 * asignación de conversación, así que todo fallo aquí se atrapa y se
 * registra, no se lanza.
 */
async function sendToRows(rows: TokenRow[], payload: PushPayload): Promise<void> {
  const messaging = getFirebaseMessaging();
  if (!messaging || rows.length === 0) return;

  const db = supabaseAdmin();
  try {
    const response = await messaging.sendEachForMulticast({
      tokens: rows.map((r) => r.token),
      notification: { title: payload.title, body: payload.body },
      data: payload.url ? { url: payload.url } : undefined,
      android: { priority: "high" },
    });

    const staleIds = response.responses
      .map((r, i) => ({ r, id: rows[i].id }))
      .filter(({ r }) => !r.success && r.error && INVALID_TOKEN_CODES.has(r.error.code))
      .map(({ id }) => id);

    if (staleIds.length > 0) {
      await db.from("push_tokens").delete().in("id", staleIds);
    }
  } catch (err) {
    console.error("[push send] send failed:", err);
  }
}

/** Push a todos los dispositivos de UN usuario (caso dirigido, p.ej. "se te asignó esta conversación"). */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const db = supabaseAdmin();
  const { data: rows, error } = await db.from("push_tokens").select("id, token").eq("user_id", userId);
  if (error) {
    console.error("[sendPushToUser] failed to load tokens:", error);
    return;
  }
  await sendToRows(rows ?? [], payload);
}

/**
 * Push a todos los dispositivos de CUALQUIER miembro de una cuenta —
 * para mensajes entrantes nuevos de WhatsApp, que (como el inbox
 * compartido) no se limitan a un solo asignado.
 */
export async function sendPushToAccount(accountId: string, payload: PushPayload): Promise<void> {
  const db = supabaseAdmin();
  const { data: rows, error } = await db.from("push_tokens").select("id, token").eq("account_id", accountId);
  if (error) {
    console.error("[sendPushToAccount] failed to load tokens:", error);
    return;
  }
  await sendToRows(rows ?? [], payload);
}
