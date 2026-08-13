"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { BiometricAuth } from "@aparajita/capacitor-biometric-auth";
import { Fingerprint, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type LockStatus = "checking" | "unlocked" | "locked";

// Un ciclo background→foreground más corto que esto casi seguro es el
// Activity transitorio de nuestro propio prompt biométrico abriéndose y
// cerrándose, o un diálogo del sistema cerrándose — no el usuario
// cambiando de app y volviendo. Solo un gap de al menos esto re-bloquea.
const MIN_BACKGROUND_MS = 3000;

/**
 * Candado de la app Android — envuelve todo el shell autenticado
 * (dashboard-shell.tsx) para que los datos queden ocultos tras un prompt
 * biométrico cada vez que la app abre o se manda a segundo plano y se
 * reanuda, independiente de si la sesión de Supabase sigue válida.
 *
 * Usa appStateChange de @capacitor/app (transiciones reales de
 * foreground/background del OS) en vez del addResumeListener del plugin
 * biométrico — ese disparaba para CUALQUIER resume de Activity (incluido
 * el prompt biométrico mismo), causando un loop infinito de re-bloqueo.
 * Gate por tiempo transcurrido en background filtra esos casos.
 *
 * No-op en la web y en dispositivos sin biometría (checkBiometry().isAvailable === false).
 */
export function BiometricLock({ children }: { children: React.ReactNode }) {
  const t = useTranslations("BiometricLock");
  const [status, setStatus] = useState<LockStatus>("checking");
  const backgroundedAtRef = useRef<number | null>(null);
  const biometryAvailableRef = useRef(false);

  const tryUnlock = useCallback(async () => {
    setStatus("checking");
    try {
      await BiometricAuth.authenticate({
        reason: t("reason"),
        cancelTitle: t("cancel"),
        androidTitle: t("androidTitle"),
      });
      setStatus("unlocked");
    } catch (err) {
      console.error("Biometric auth failed:", err);
      setStatus("locked");
    }
  }, [t]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setStatus("unlocked");
      return;
    }

    let appStateHandle: { remove: () => void } | undefined;

    (async () => {
      try {
        const result = await BiometricAuth.checkBiometry();
        if (!result.isAvailable) {
          setStatus("unlocked");
          return;
        }
        biometryAvailableRef.current = true;
        await tryUnlock();

        appStateHandle = await App.addListener("appStateChange", ({ isActive }) => {
          if (!biometryAvailableRef.current) return;

          if (!isActive) {
            backgroundedAtRef.current = Date.now();
            return;
          }

          const backgroundedAt = backgroundedAtRef.current;
          backgroundedAtRef.current = null;
          if (backgroundedAt && Date.now() - backgroundedAt >= MIN_BACKGROUND_MS) {
            setStatus("locked");
          }
        });
      } catch (err) {
        console.error("[BiometricLock] checkBiometry threw:", err);
        setStatus("unlocked");
      }
    })();

    return () => appStateHandle?.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "checking") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "locked") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Fingerprint className="size-8 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">{t("lockedMessage")}</p>
        <Button onClick={tryUnlock}>{t("unlockButton")}</Button>
      </div>
    );
  }

  return <>{children}</>;
}
