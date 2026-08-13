import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

// Firebase Admin compartido y perezoso. Las credenciales de la cuenta
// de servicio viven en FIREBASE_SERVICE_ACCOUNT_JSON como un único blob
// JSON stringificado (el archivo completo que da Firebase Console al
// generar una private key) — la forma usual de llevar un archivo de
// credenciales multilínea en una env var.
let _app: App | null = null;

/**
 * Devuelve null (no lanza) cuando Firebase aún no está configurado —
 * todo call site está en una ruta (webhook de WhatsApp, asignación de
 * conversación) que debe seguir funcionando antes de que exista la app
 * Android y su proyecto Firebase. El push es aditivo, nunca una
 * dependencia dura del resto del producto.
 */
export function getFirebaseMessaging(): Messaging | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  try {
    if (!_app) {
      const existing = getApps()[0];
      _app = existing ?? initializeApp({ credential: cert(JSON.parse(raw)) });
    }
    return getMessaging(_app);
  } catch (err) {
    console.error("[firebase-admin] failed to initialize:", err);
    return null;
  }
}
