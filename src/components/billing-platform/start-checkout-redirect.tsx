"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

const PURCHASABLE_PLAN_IDS = ["standalone", "zentro_salud_starter", "zentro_salud_pro"];

/**
 * Headless — mounted once in DashboardShell alongside PresenceHeartbeat.
 * Consumes `?startCheckout=<plan>` (set by /signup's emailRedirectTo for
 * a visitor who clicked a paid-plan CTA on /pricing) and immediately
 * sends them into Stripe Checkout for that plan, instead of dropping
 * them on the empty trial dashboard first. Renders nothing either way.
 */
function StartCheckoutRedirectInner() {
  const searchParams = useSearchParams();
  const startedRef = useRef(false);

  useEffect(() => {
    const plan = searchParams.get("startCheckout");
    if (!plan || !PURCHASABLE_PLAN_IDS.includes(plan) || startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const res = await fetch("/api/billing-platform/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.url) {
          toast.error(
            body?.error ?? "No pudimos iniciar el pago. Actívalo desde Ajustes → Suscripción.",
          );
          return;
        }
        window.location.href = body.url;
      } catch (err) {
        console.error("[StartCheckoutRedirect] failed:", err);
        toast.error("No pudimos iniciar el pago. Actívalo desde Ajustes → Suscripción.");
      }
    })();
  }, [searchParams]);

  return null;
}

export function StartCheckoutRedirect() {
  return (
    <Suspense fallback={null}>
      <StartCheckoutRedirectInner />
    </Suspense>
  );
}
