import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const SESSION_KEY = "zuhma_med_session";

export interface StoredSession {
  access_token: string;
  refresh_token: string;
}

/**
 * Respaldo explícito de la sesión de Supabase en almacenamiento nativo —
 * complemento (no reemplazo) de la sesión por cookie que la web ya usa
 * vía @supabase/ssr.
 *
 * Por qué existe: la app Android es un WebView apuntado al sitio en vivo,
 * así que su sesión normalmente vive en el cookie jar del WebView. Eso
 * debería persistir entre reinicios (la cookie de auth dura ~400 días),
 * pero algunos OEM de Android (MIUI en particular) limpian agresivamente
 * los datos del WebView al cerrar la app. @capacitor/preferences usa
 * SharedPreferences de Android (almacenamiento privado nativo) — una
 * capa más durable, así que restaurar desde aquí funciona aun cuando las
 * cookies del WebView no sobrevivieron.
 */
export async function saveNativeSession(session: StoredSession): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) });
}

export async function loadNativeSession(): Promise<StoredSession | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const { value } = await Preferences.get({ key: SESSION_KEY });
  if (!value) return null;
  try {
    return JSON.parse(value) as StoredSession;
  } catch {
    return null;
  }
}

export async function clearNativeSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await Preferences.remove({ key: SESSION_KEY });
}
