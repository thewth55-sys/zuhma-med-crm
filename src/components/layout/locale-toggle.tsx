"use client";

import { useState } from "react";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * Language toggle — mirrors ModeToggle's single-button pattern (same
 * 40×40 hit target, same hover styles). Only two locales exist today
 * (en/es), so a binary toggle beats a dropdown menu.
 *
 * Locale is resolved server-side per request (`src/i18n/request.ts`
 * reads the `NEXT_LOCALE` cookie), so switching requires a full reload
 * rather than a client-side swap — there's no partial-update path.
 */
export function LocaleToggle({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("LocaleToggle");
  const [switching, setSwitching] = useState(false);
  const nextLocale = locale === "en" ? "es" : "en";
  const label = t("switchTo", { locale: nextLocale === "en" ? "English" : "Español" });

  async function switchLocale() {
    if (switching) return;
    setSwitching(true);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
    } finally {
      window.location.reload();
    }
  }

  return (
    <button
      type="button"
      onClick={switchLocale}
      disabled={switching}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",
        className,
      )}
    >
      <Languages className="h-5 w-5" />
    </button>
  );
}
