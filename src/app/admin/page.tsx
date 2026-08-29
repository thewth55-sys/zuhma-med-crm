"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

interface DashboardData {
  totalAccounts: number;
  newAccountsLast30d: number;
  suspendedCount: number;
  totalSeats: number;
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Resumen operativo de la plataforma.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-muted p-4">
          <div className="text-xs text-muted-foreground">Cuentas totales</div>
          <div className="mt-1 text-2xl font-medium text-foreground">{data.totalAccounts}</div>
        </div>
        <div className="rounded-lg bg-muted p-4">
          <div className="text-xs text-muted-foreground">Nuevas (30 días)</div>
          <div className="mt-1 text-2xl font-medium text-foreground">{data.newAccountsLast30d}</div>
        </div>
        <div className="rounded-lg bg-muted p-4">
          <div className="text-xs text-muted-foreground">Suspendidas</div>
          <div className="mt-1 text-2xl font-medium text-foreground">{data.suspendedCount}</div>
        </div>
        <div className="rounded-lg bg-muted p-4">
          <div className="text-xs text-muted-foreground">Miembros totales</div>
          <div className="mt-1 text-2xl font-medium text-foreground">{data.totalSeats}</div>
        </div>
      </div>
    </div>
  );
}
