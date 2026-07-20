"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useHasAccess } from "@/hooks/use-has-access";

/**
 * Full-viewport blocking overlay for a lapsed trial / canceled
 * subscription / suspended account — a stronger escalation of
 * AccessBanner (which stays a thin, non-blocking nudge shown
 * everywhere, including here). This blurs and pointer-blocks
 * literally everything else in the app so no dialog/form/nav item is
 * reachable — only the "Activar un plan" CTA is.
 *
 * Deliberately does NOT render on /settings: that's where the CTA
 * below sends the user, and it's also where the reactivation flow
 * (Checkout/Portal, both opt in to `allowSuspended` server-side —
 * see lib/auth/account.ts) actually lives. Blocking that page too
 * would make reactivation unreachable, which defeats the point.
 */
export function AccessLockOverlay() {
  const pathname = usePathname();
  const { profileLoading, account } = useAuth();
  const hasAccess = useHasAccess();

  if (profileLoading || hasAccess) return null;
  if (pathname?.startsWith("/settings")) return null;

  const suspended = account?.subscription_status === "suspended";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-md">
      <div className="max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-2xl">
        <AlertTriangle className="mx-auto size-8 text-destructive" />
        <p className="mt-3 text-base font-semibold text-foreground">
          {suspended ? "Cuenta suspendida" : "Tu prueba terminó"}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {suspended
            ? "Esta cuenta fue suspendida. Activa un plan de pago para reactivarla, o contacta a soporte si crees que es un error."
            : "Activa un plan de pago para seguir usando Zentro Med."}
        </p>
        <Link
          href="/settings?tab=billing-platform"
          className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Activar un plan
        </Link>
      </div>
    </div>
  );
}
