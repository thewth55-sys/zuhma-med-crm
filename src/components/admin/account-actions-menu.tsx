"use client";

// ============================================================
// AccountActionsMenu — the /admin accounts table's per-row "Acciones"
// menu. Consolidates every platform-admin action on one account:
// impersonate, resend activation email, suspend/reactivate, reset
// password, and manually set plan/status (covers both "cambiar nivel
// de suscripción" and "dar cortesía" — same underlying write, see the
// set-plan route's own comment). Every action is logged server-side
// to platform_admin_audit_log; this component just calls the routes
// and reports the result.
// ============================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Ban,
  Globe,
  KeyRound,
  Layers,
  Loader2,
  LogIn,
  Mail,
  MoreHorizontal,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import type { Plan, SubscriptionStatus } from "@/lib/billing-platform/plans";

interface AccountActionsMenuProps {
  accountId: string;
  accountName: string;
  ownerEmail: string | null;
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  /** Parent re-fetches the accounts list after any state-changing action. */
  onChanged: () => void;
}

const PLAN_OPTIONS: { value: Plan; label: string }[] = [
  { value: "trial", label: "Prueba" },
  { value: "standalone", label: "Standalone" },
  { value: "zentro_salud_starter", label: "Zentro Salud Starter" },
  { value: "zentro_salud_pro", label: "Zentro Salud Pro" },
];

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: "trialing", label: "En prueba" },
  { value: "active", label: "Activa" },
  { value: "past_due", label: "Pago vencido" },
  { value: "canceled", label: "Cancelada" },
  { value: "trial_expired", label: "Prueba vencida" },
  { value: "suspended", label: "Suspendida" },
];

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "La acción falló");
  return data;
}

export function AccountActionsMenu({
  accountId,
  accountName,
  ownerEmail,
  plan,
  subscriptionStatus,
  onChanged,
}: AccountActionsMenuProps) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [draftPlan, setDraftPlan] = useState<Plan>(plan);
  const [draftStatus, setDraftStatus] = useState<SubscriptionStatus>(subscriptionStatus);

  const isSuspended = subscriptionStatus === "suspended";

  async function handleImpersonateConfirm() {
    setBusyAction("impersonate");
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/impersonate`, {
        method: "POST",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.tokenHash) {
        toast.error(body?.error ?? "No se pudo iniciar la impersonación");
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        token_hash: body.tokenHash,
        type: "magiclink",
      });
      if (error) {
        toast.error(`No se pudo establecer la sesión: ${error.message}`);
        return;
      }
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("[AccountActionsMenu] impersonate failed:", err);
      toast.error("No se pudo iniciar la impersonación");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleResendActivation() {
    setBusyAction("resend");
    try {
      await postJson(`/api/platform-admin/accounts/${accountId}/resend-activation`);
      toast.success("Correo de activación reenviado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo reenviar");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleResetPassword() {
    setBusyAction("reset-password");
    try {
      await postJson(`/api/platform-admin/accounts/${accountId}/reset-password`);
      toast.success("Correo de restablecimiento de contraseña enviado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleSuspend() {
    const nextSuspended = !isSuspended;
    if (nextSuspended) {
      const ok = window.confirm(
        `¿Suspender la cuenta "${accountName}"? Todos sus usuarios pierden acceso hasta que la reactives.`,
      );
      if (!ok) return;
    }
    setBusyAction("suspend");
    try {
      await postJson(`/api/platform-admin/accounts/${accountId}/suspend`, {
        suspended: nextSuspended,
      });
      toast.success(nextSuspended ? "Cuenta suspendida" : "Cuenta reactivada");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSavePlan() {
    setBusyAction("set-plan");
    try {
      await postJson(`/api/platform-admin/accounts/${accountId}/set-plan`, {
        plan: draftPlan,
        subscriptionStatus: draftStatus,
      });
      toast.success("Plan actualizado");
      setPlanDialogOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el plan");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm">
              <MoreHorizontal className="h-3.5 w-3.5" />
              Acciones
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem
            disabled={!ownerEmail || busyAction !== null}
            onClick={() => setImpersonateOpen(true)}
          >
            <LogIn className="size-4" />
            Impersonar
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ownerEmail || busyAction !== null}
            onClick={handleResendActivation}
          >
            <Mail className="size-4" />
            Reenviar correo de activación
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!ownerEmail || busyAction !== null}
            onClick={handleResetPassword}
          >
            <KeyRound className="size-4" />
            Restablecer contraseña
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/admin/accounts/${accountId}/landing`)}>
            <Globe className="size-4" />
            Editar landing
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={busyAction !== null}
            onClick={() => {
              setDraftPlan(plan);
              setDraftStatus(subscriptionStatus);
              setPlanDialogOpen(true);
            }}
          >
            <Layers className="size-4" />
            Cambiar plan / cortesía
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busyAction !== null}
            onClick={handleToggleSuspend}
            className={isSuspended ? undefined : "text-destructive focus:text-destructive"}
          >
            {isSuspended ? <RotateCcw className="size-4" /> : <Ban className="size-4" />}
            {isSuspended ? "Reactivar cuenta" : "Suspender cuenta"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={impersonateOpen} onOpenChange={setImpersonateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Impersonar a {accountName}?</DialogTitle>
            <DialogDescription>
              Vas a iniciar sesión como <span className="text-foreground">{ownerEmail}</span>.
              Esto reemplaza tu sesión de admin actual — para volver, cierra sesión y entra de
              nuevo con tu propia cuenta. La acción queda registrada en el log de auditoría.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImpersonateOpen(false)}
              disabled={busyAction === "impersonate"}
            >
              Cancelar
            </Button>
            <Button onClick={handleImpersonateConfirm} disabled={busyAction === "impersonate"}>
              {busyAction === "impersonate" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Impersonar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar plan — {accountName}</DialogTitle>
            <DialogDescription>
              Escribe directo en la base de datos, sin pasar por Stripe. Úsalo para cortesías
              (plan pago + estado &quot;Activa&quot; sin cobrar) o para corregir un plan manualmente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Plan</label>
              <Select value={draftPlan} onValueChange={(v) => v && setDraftPlan(v as Plan)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Estado</label>
              <Select
                value={draftStatus}
                onValueChange={(v) => v && setDraftStatus(v as SubscriptionStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPlanDialogOpen(false)}
              disabled={busyAction === "set-plan"}
            >
              Cancelar
            </Button>
            <Button onClick={handleSavePlan} disabled={busyAction === "set-plan"}>
              {busyAction === "set-plan" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
