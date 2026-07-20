"use client";

import { useEffect, useState } from "react";
import { estimateLocalPrice } from "@/lib/currency/geo-estimate";

/**
 * Renders "~$980 MXN aprox." under a USD price, once (if ever) the
 * geo/exchange-rate lookup resolves. Renders nothing while pending or
 * on any failure — see geo-estimate.ts for why this never blocks or
 * breaks the page.
 */
export function LocalPriceEstimate({ usd }: { usd: number }) {
  const [estimate, setEstimate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    estimateLocalPrice(usd).then((value) => {
      if (!cancelled) setEstimate(value);
    });
    return () => {
      cancelled = true;
    };
  }, [usd]);

  if (!estimate) return null;

  return <p className="mt-0.5 text-xs text-muted-foreground">~{estimate} aprox.</p>;
}
