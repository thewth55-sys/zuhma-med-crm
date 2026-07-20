"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";

import type { Plan, SubscriptionStatus } from "@/lib/billing-platform/plans";

interface DashboardData {
  mrrTotal: number;
  mrrByPlan: Record<Plan, number>;
  planCounts: Record<Plan, number>;
  statusCounts: Record<SubscriptionStatus, number>;
  newAccountsLast30d: number;
  trialCount: number;
  conversionRate: number | null;
  atRisk: { id: string; name: string; reason: "past_due" | "trial_ending"; detail: string }[];
}

const PLAN_LABEL: Record<Plan, string> = {
  trial: "Prueba",
  standalone: "Standalone",
  zentro_salud_starter: "Zentro Salud Starter",
  zentro_salud_pro: "Zentro Salud Pro",
};

function formatMoney(usd: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    usd,
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/platform-admin/dashboard", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "No se pudo cargar el dashboard");
        setData(body);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando dashboard…
      </div>
    );
  }

  const paidPlans: Plan[] = ["zentro_salud_pro", "zentro_salud_starter", "standalone"];
  const maxPlanMrr = Math.max(...paidPlans.map((p) => data.mrrByPlan[p]), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Ventas y salud de la plataforma.</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg bg-muted p-4">
          <div className="text-xs text-muted-foreground">MRR</div>
          <div className="mt-1 text-2xl font-medium text-foreground">{formatMoney(data.mrrTotal)}</div>
        </div>
        <div className="rounded-lg bg-muted p-4">
          <div className="text-xs text-muted-foreground">Cuentas activas</div>
          <div className="mt-1 text-2xl font-medium text-foreground">
            {data.statusCounts.active + data.statusCounts.past_due}
          </div>
        </div>
        <div className="rounded-lg bg-muted p-4">
          <div className="text-xs text-muted-foreground">Nuevas (30 días)</div>
          <div className="mt-1 text-2xl font-medium text-foreground">{data.newAccountsLast30d}</div>
        </div>
        <div className="rounded-lg bg-muted p-4">
          <div className="text-xs text-muted-foreground">Conversión prueba→pago</div>
          <div className="mt-1 text-2xl font-medium text-foreground">
            {data.conversionRate === null ? "—" : `${Math.round(data.conversionRate * 100)}%`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-4">
          <div className="mb-3 text-sm font-medium text-foreground">Ingresos por plan</div>
          <div className="space-y-3">
            {paidPlans.map((plan) => (
              <div key={plan}>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{PLAN_LABEL[plan]}</span>
                  <span>{formatMoney(data.mrrByPlan[plan])}</span>
                </div>
                <div className="h-1.5 rounded bg-muted">
                  <div
                    className="h-full rounded bg-primary"
                    style={{ width: `${(data.mrrByPlan[plan] / maxPlanMrr) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="mb-3 text-sm font-medium text-foreground">Cuentas en riesgo</div>
          {data.atRisk.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna cuenta en riesgo ahora mismo.</p>
          ) : (
            <div className="space-y-2">
              {data.atRisk.map((account) => (
                <Link
                  key={account.id}
                  href={`/admin/accounts/${account.id}`}
                  className="flex items-center justify-between text-sm hover:underline"
                >
                  <span className="text-foreground">{account.name}</span>
                  <span
                    className={
                      account.reason === "past_due" ? "text-destructive" : "text-yellow-600 dark:text-yellow-400"
                    }
                  >
                    {account.detail}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
