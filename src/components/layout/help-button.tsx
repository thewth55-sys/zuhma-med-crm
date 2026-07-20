"use client";

import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const ZOHO_DESK_HELP_CENTER_URL = "https://zentrolatam.zohodesk.com/portal/es/home";

/**
 * Opens the Zoho Desk help center (public knowledge base) in a new
 * tab — distinct from the Zoho chat widget already floating on every
 * page (components/zoho-desk-widget.tsx). Mirrors ModeToggle/
 * LocaleToggle's single-button pattern (same 40×40 hit target).
 */
export function HelpButton({ className }: { className?: string }) {
  const t = useTranslations("Sidebar");

  return (
    <a
      href={ZOHO_DESK_HELP_CENTER_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("menuHelp")}
      title={t("menuHelp")}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <HelpCircle className="h-5 w-5" />
    </a>
  );
}
