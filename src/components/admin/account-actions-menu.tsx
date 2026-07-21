"use client";

// ============================================================
// AccountActionsMenu — the /admin accounts table's per-row "Acciones"
// menu. Consolidates every platform-admin action on one account:
// impersonate, resend activation email, suspend/reactivate, and reset
// password. Every action is logged server-side to
// platform_admin_audit_log; this component just calls the routes and
// reports the result.
// ============================================================

import { useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  KeyRound,
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
import { createClient } from "@/lib/supabase/client";

interface AccountActionsMenuProps {
  accountId: string;
  accountName: string;
  ownerEmail: string | null;
  subscriptionStatus: string;
  /** Parent re-fetches the accounts list after any state-changing action. */
  onChanged: () => void;
}

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
  subscriptionStatus,
  onChanged,
}: AccountActionsMenuProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [impersonateOpen, setImpersonateOpen] = useState(false);

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
          <DropdownMenuSeparator />
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
    </>
  );
}
