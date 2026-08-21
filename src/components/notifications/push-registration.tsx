"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useAuth } from "@/hooks/use-auth";

/**
 * Registra este dispositivo para push nativo — solo hace algo dentro de
 * la app Capacitor Android (`isNativePlatform()`); no-op en la web. Los
 * tokens FCM son lo que permite al SERVIDOR mandar un push aunque la app
 * esté cerrada o el teléfono bloqueado.
 *
 * Habilitación: se consulta a `/api/push/config` EN RUNTIME en vez de
 * leer NEXT_PUBLIC_FIREBASE_PUSH_ENABLED en el cliente — el pipeline de
 * build de Easypanel no incrusta ese NEXT_PUBLIC_* de forma fiable, así
 * que la app quedaba siempre "deshabilitada". El gate sigue existiendo
 * porque el plugin nativo @capacitor/push-notifications lanza un FATAL
 * si el build Android no trae google-services.json; solo se habilita
 * cuando eso está listo Y FIREBASE_SERVICE_ACCOUNT_JSON en el servidor.
 *
 * Se monta una vez por sesión (dashboard-shell.tsx).
 */
export function PushRegistration() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;

    let cancelled = false;
    const handles: Array<{ remove: () => void }> = [];

    (async () => {
      // Fuente de verdad en runtime (ver /api/push/config).
      let enabled = false;
      try {
        const res = await fetch("/api/push/config");
        enabled = (await res.json())?.enabled === true;
      } catch {
        enabled = false;
      }
      if (cancelled || !enabled) return;

      handles.push(
        await PushNotifications.addListener("registration", (token) => {
          void fetch("/api/push/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token.value, platform: "android" }),
          }).catch((err) => console.error("Push token registration failed:", err));
        }),
      );

      handles.push(
        await PushNotifications.addListener("registrationError", (err) => {
          console.error("Push registration error:", err);
        }),
      );

      handles.push(
        await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const url = action.notification.data?.url;
          if (typeof url === "string" && url.startsWith("/")) {
            router.push(url);
          }
        }),
      );

      // Android O+ exige que el canal exista antes de postear en él. Su id
      // debe coincidir con default_notification_channel_id del manifest.
      try {
        await PushNotifications.createChannel({
          id: "zuhma_default",
          name: "Notificaciones",
          description: "Recordatorios de citas, mensajes y avisos de Zuhma Med.",
          importance: 5,
          visibility: 1,
          lights: true,
          vibration: true,
        });
      } catch {
        // no-op: en algunas variantes de Android createChannel no aplica.
      }

      const permission = await PushNotifications.requestPermissions();
      if (!cancelled && permission.receive === "granted") {
        await PushNotifications.register();
      }
    })();

    return () => {
      cancelled = true;
      handles.forEach((h) => h.remove());
    };
  }, [user, router]);

  return null;
}
