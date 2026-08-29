"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

const DISMISS_KEY = "androidAppBannerDismissedAt";
const DISMISS_DAYS = 14;

function isDismissed(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (!Number.isFinite(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Banner de app — invita a un visitante Android de la web móvil a
 * instalar la app nativa. Nunca se muestra dentro de la app Capacitor
 * (`isNativePlatform()`), en desktop, ni en iOS. El descarte se recuerda
 * por DISMISS_DAYS para no molestar cada visita.
 *
 * Enlaza a una descarga directa de APK (public/downloads/). Cambia el
 * enlace por la ficha de Play Store cuando se publique.
 */
export function AndroidAppBanner() {
  const t = useTranslations("AndroidAppBanner");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const isAndroid = /Android/i.test(window.navigator.userAgent);
    if (!isAndroid || isDismissed()) return;
    queueMicrotask(() => setVisible(true));
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3 border-t border-border bg-card px-4 py-3 shadow-lg">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset in a plain <img>, not an app-router page */}
      <img src="/icon-192.png" alt="" className="size-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{t("title")}</p>
        <p className="truncate text-xs text-muted-foreground">{t("subtitle")}</p>
      </div>
      <a
        href="/downloads/zuhma-med.apk"
        className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        {t("download")}
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("dismiss")}
        className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
