"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";

import { useHasFeature } from "@/hooks/use-has-feature";
import type { GatedFeature } from "@/lib/billing-platform/features";

interface PlanGateProps {
  feature: GatedFeature;
  /** Short name of the gated feature shown in the upsell card, e.g. "Automatizaciones y Flows". */
  featureLabel: string;
  children: ReactNode;
}

/**
 * Blurs `children` and disables interaction with them when the
 * account's plan doesn't include `feature`, overlaying an upgrade
 * prompt instead of hiding the feature outright — lets a trial user
 * see what they'd get, per the /pricing checklist's own "requiere
 * plan de pago" framing.
 *
 * Still mounts `children` underneath the blur (so effects/data
 * fetches inside it still run) — acceptable for an MVP-level upsell
 * gate; not a security boundary. The real enforcement for anything
 * sensitive lives server-side (RLS, API routes), same as every other
 * gate in this app.
 */
export function PlanGate({ feature, featureLabel, children }: PlanGateProps) {
  const hasFeature = useHasFeature(feature);
  if (hasFeature) return <>{children}</>;

  return (
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none select-none blur-sm opacity-50">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-lg">
          <Lock className="mx-auto size-8 text-primary" />
          <p className="mt-3 text-sm font-semibold text-foreground">{featureLabel}</p>
          <p className="mt-1 text-sm text-muted-foreground">Disponible en planes de pago.</p>
          <Link
            href="/settings?tab=billing-platform"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Ver planes
          </Link>
        </div>
      </div>
    </div>
  );
}
