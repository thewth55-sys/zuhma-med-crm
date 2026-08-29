"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AuditEntry {
  id: string;
  adminEmail: string | null;
  action: string;
  targetAccountId: string | null;
  targetAccountName: string | null;
  targetUserId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_LABEL: Record<string, string> = {
  impersonate: "Impersonación",
  resend_activation: "Reenvío de activación",
  reset_password: "Restablecimiento de contraseña",
  set_temp_password: "Contraseña temporal establecida",
  suspend: "Suspensión",
  reactivate: "Reactivación",
  set_plan: "Cambio de plan",
};

function formatDetail(entry: AuditEntry): string {
  const m = entry.metadata;
  if (!m) return "—";
  if (entry.action === "set_plan" && "newPlan" in m) {
    return `${m.previousPlan ?? "?"}/${m.previousStatus ?? "?"} → ${m.newPlan}/${m.newStatus}`;
  }
  if ((entry.action === "suspend" || entry.action === "reactivate") && "newStatus" in m) {
    return `${m.previousStatus ?? "?"} → ${m.newStatus}`;
  }
  if (typeof m.targetEmail === "string") return m.targetEmail;
  return "—";
}

export default function AdminAuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/platform-admin/audit-log");
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "No se pudo cargar el log de auditoría");
        if (!cancelled) setEntries(body.entries);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error desconocido");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Log de auditoría</h1>
        <p className="text-sm text-muted-foreground">
          Últimas {entries?.length ?? "…"} acciones de administración de plataforma — quién,
          sobre qué cuenta y cuándo.
        </p>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : !entries ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : entries.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Todavía no hay acciones registradas.
        </p>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Cuenta objetivo</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-foreground">{entry.adminEmail ?? "—"}</TableCell>
                  <TableCell>{ACTION_LABEL[entry.action] ?? entry.action}</TableCell>
                  <TableCell className="text-foreground">
                    {entry.targetAccountName ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDetail(entry)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
