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
 * Gated tras NEXT_PUBLIC_FIREBASE_PUSH_ENABLED: el plugin nativo
 * @capacitor/push-notifications lanza un FATAL (no atrapable desde JS)
 * si el build Android no tiene google-services.json. Activa este flag
 * solo cuando google-services.json esté en el build nativo Y
 * FIREBASE_SERVICE_ACCOUNT_JSON esté configurado en el servidor.
 *
 * Se monta una vez por sesión (dashboard-shell.tsx).
 */
export function PushRegistration() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const pushEnabled = process.env.NEXT_PUBLIC_FIREBASE_PUSH_ENABLED === "true";
    const native = Capacitor.isNativePlatform();

    // TEMP DIAG — reporta al log del servidor qué gate corta el registro.
    // Quitar una vez confirmado el push (buscar "push/diag" en los logs).
    void fetch(
      `/api/push/register?diag=1&native=${native}&enabled=${pushEnabled}&user=${!!user}`,
    ).catch(() => {});

    if (!user || !pushEnabled || !native) return;

    let registrationHandle: { remove: () => void } | undefined;
    let errorHandle: { remove: () => void } | undefined;
    let tapHandle: { remove: () => void } | undefined;

    (async () => {
      registrationHandle = await PushNotifications.addListener("registration", (token) => {
        void fetch("/api/push/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.value, platform: "android" }),
        }).catch((err) => console.error("Push token registration failed:", err));
      });

      errorHandle = await PushNotifications.addListener("registrationError", (err) => {
        console.error("Push registration error:", err);
      });

      tapHandle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const url = action.notification.data?.url;
        if (typeof url === "string" && url.startsWith("/")) {
          router.push(url);
        }
      });

      const permission = await PushNotifications.requestPermissions();
      if (permission.receive === "granted") {
        await PushNotifications.register();
      }
    })();

    return () => {
      registrationHandle?.remove();
      errorHandle?.remove();
      tapHandle?.remove();
    };
  }, [user, router]);

  return null;
}
