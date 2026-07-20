"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useHasAccess } from "@/hooks/use-has-access";

/**
 * Persistent banner shown once a trial has lapsed or a subscription
 * is fully canceled — the account keeps its data (nothing is
 * deleted) but is nudged toward Settings → Suscripción on every
 * screen until it's resolved.
 */
export function AccessBanner() {
  const { profileLoading, account } = useAuth();
  const hasAccess = useHasAccess();

  // past_due counts as active access (hasActiveAccess includes it —
  // Stripe is still retrying the card, nothing should be locked yet)
  // but silently doing nothing here means the customer has zero
  // signal their payment failed until Stripe exhausts retries and the
  // subscription actually cancels, at which point they're suddenly
  // locked out with no warning. This is intentionally the mildest of
  // the three banners: no AccessLockOverlay, no "your account is
  // read-only" — just a nudge to go fix the card before it escalates.
  if (!profileLoading && account?.subscription_status === "past_due") {
    return (
      <div className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
        <AlertTriangle className="size-4 shrink-0" />
        <span>No pudimos cobrar tu último pago. Actualiza tu método de pago para evitar interrupciones.</span>
        <Link href="/settings?tab=billing-platform" className="font-medium underline underline-offset-2 hover:no-underline">
          Actualizar método de pago
        </Link>
      </div>
    );
  }

  if (profileLoading || hasAccess) return null;

  // Suspended is an administrative lock (see /admin) — no self-serve
  // "activate a plan" way out, unlike a lapsed trial or a customer's
  // own cancellation. Distinct, more serious styling on purpose.
  if (account?.subscription_status === "suspended") {
    return (
      <div className="flex items-center justify-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" />
        <span>Esta cuenta fue suspendida. Contacta a soporte para reactivarla.</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
      <AlertTriangle className="size-4 shrink-0" />
      <span>Tu prueba terminó — estás en modo de solo lectura.</span>
      <Link href="/settings?tab=billing-platform" className="font-medium underline underline-offset-2 hover:no-underline">
        Activar un plan
      </Link>
    </div>
  );
}
