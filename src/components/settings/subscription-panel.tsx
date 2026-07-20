"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Download, FileText, Loader2, CreditCard, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";
import { PLAN_CONFIG, hasActiveAccess, type Plan } from "@/lib/billing-platform/plans";
import { formatCurrency } from "@/lib/currency";

interface Invoice {
  id: string;
  number: string | null;
  status: "draft" | "open" | "paid" | "uncollectible" | "void" | null;
  attempted: boolean;
  amountDue: number;
  amountPaid: number;
  currency: string;
  created: number;
  description: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

const INVOICE_STATUS_META: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  paid: { label: "Pagada", variant: "default" },
  failed: { label: "Rechazada", variant: "destructive" },
  pending: { label: "Pendiente", variant: "secondary" },
  uncollectible: { label: "Incobrable", variant: "destructive" },
  void: { label: "Anulada", variant: "outline" },
};

function invoiceStatusKey(inv: Invoice): keyof typeof INVOICE_STATUS_META {
  if (inv.status === "paid") return "paid";
  if (inv.status === "void") return "void";
  if (inv.status === "uncollectible") return "uncollectible";
  if (inv.status === "open") return inv.attempted ? "failed" : "pending";
  return "pending";
}

const PLAN_LABELS: Record<Plan, string> = {
  trial: "Prueba gratuita",
  standalone: "Zentro Med (independiente)",
  zentro_salud_starter: "Zentro Salud Starter",
  zentro_salud_pro: "Zentro Salud Pro",
};

const STATUS_LABELS: Record<string, string> = {
  trialing: "En prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  canceled: "Cancelada",
  trial_expired: "Prueba vencida",
  suspended: "Suspendida",
};

/**
 * Zentro Med's OWN subscription (what the clinic pays Zentro Med) —
 * not to be confused with the "Billing" section, which is the
 * clinic's invoicing to ITS patients (quotes/invoices/payments,
 * a completely separate module with its own Stripe-free design).
 */
export function SubscriptionPanel() {
  const { account, isOwner, refreshProfile } = useAuth();
  const [loadingAction, setLoadingAction] = useState<Plan | "portal" | null>(null);
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);

  useEffect(() => {
    // The Stripe redirect lands here before the webhook necessarily
    // finishes updating `accounts` — refetch on arrival so the plan
    // shown doesn't lag behind what was just purchased.
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      toast.success("¡Suscripción activada!");
      void refreshProfile();
    } else if (checkout === "canceled") {
      toast.info("Pago cancelado — no se hizo ningún cargo.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing-platform/invoices", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Failed to load invoices");
        if (!cancelled) setInvoices(body.invoices);
      } catch (err) {
        console.error("[SubscriptionPanel] invoices fetch error:", err);
        if (!cancelled) setInvoicesError("No se pudo cargar el historial de pagos");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  if (!account) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(account.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );
  const active = hasActiveAccess(account.subscription_status);

  async function startCheckout(plan: Plan) {
    setLoadingAction(plan);
    try {
      const res = await fetch("/api/billing-platform/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "checkout failed");
      window.location.href = data.url;
    } catch (err) {
      console.error("Checkout error:", err);
      toast.error("No se pudo iniciar el pago. Intenta de nuevo.");
      setLoadingAction(null);
    }
  }

  async function openPortal() {
    setLoadingAction("portal");
    try {
      const res = await fetch("/api/billing-platform/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "portal failed");
      window.location.href = data.url;
    } catch (err) {
      console.error("Portal error:", err);
      toast.error("No se pudo abrir el portal de facturación.");
      setLoadingAction(null);
    }
  }

  return (
    <section className="max-w-3xl animate-in fade-in-50 space-y-4 duration-200">
      <SettingsPanelHead
        title="Suscripción"
        description="El plan de Zentro Med de esta cuenta — separado de la facturación que tú le emites a tus pacientes."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <CreditCard className="size-4 text-primary" />
            Plan actual
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {PLAN_LABELS[account.plan]} · {STATUS_LABELS[account.subscription_status] ?? account.subscription_status}
            {account.plan === "trial" && account.subscription_status === "trialing" && (
              <> · {daysLeft} {daysLeft === 1 ? "día restante" : "días restantes"}</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!active && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              Tu acceso está en modo de solo lectura. Activa un plan para seguir creando y editando.
            </div>
          )}

          {!isOwner ? (
            <p className="text-sm text-muted-foreground">
              Solo el propietario de la cuenta puede administrar la suscripción.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(["standalone", "zentro_salud_starter", "zentro_salud_pro"] as const).map((plan) => {
                  const config = PLAN_CONFIG[plan];
                  const isCurrent = account.plan === plan && active;
                  return (
                    <div key={plan} className="rounded-lg border border-border bg-muted/40 p-3">
                      <p className="text-sm font-medium text-foreground">{PLAN_LABELS[plan]}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {config.basePriceUsd > 0
                          ? `$${config.basePriceUsd} USD/mes`
                          : `$${config.seatPriceUsd} USD/usuario/mes`}
                        {config.includedSeats > 0 && ` · ${config.includedSeats} asientos incluidos`}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant={isCurrent ? "outline" : "default"}
                        disabled={isCurrent || loadingAction !== null}
                        onClick={() => startCheckout(plan)}
                        className="mt-3 w-full text-xs"
                      >
                        {loadingAction === plan ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : isCurrent ? (
                          "Plan actual"
                        ) : (
                          "Activar"
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>

              {account.stripe_customer_id && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openPortal}
                  disabled={loadingAction !== null}
                  className="text-xs"
                >
                  {loadingAction === "portal" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="size-3.5" />
                  )}
                  Gestionar suscripción y método de pago
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {isOwner && account.stripe_customer_id && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <FileText className="size-4 text-primary" />
              Historial de pagos
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Cada cargo a esta cuenta — aprobado, pendiente o rechazado — con su comprobante
              descargable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoicesError ? (
              <p className="text-sm text-destructive">{invoicesError}</p>
            ) : invoices === null ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Cargando…
              </div>
            ) : invoices.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Todavía no hay pagos registrados en esta cuenta.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {invoices.map((inv) => {
                  const meta = INVOICE_STATUS_META[invoiceStatusKey(inv)];
                  const amount = inv.status === "paid" ? inv.amountPaid : inv.amountDue;
                  const downloadUrl = inv.invoicePdf ?? inv.hostedInvoiceUrl;
                  return (
                    <li key={inv.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {formatCurrency(amount / 100, inv.currency)}
                          </span>
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {new Date(inv.created * 1000).toLocaleDateString()}
                          {inv.description ? ` · ${inv.description}` : ""}
                        </p>
                      </div>
                      {downloadUrl ? (
                        <a
                          href={downloadUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                        >
                          <Download className="size-3.5" />
                          Descargar
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
