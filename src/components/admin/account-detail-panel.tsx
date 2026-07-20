"use client";

// ============================================================
// AccountDetailPanel — the "Cuenta 360" body for /admin/accounts/[id].
// Fetches /api/platform-admin/accounts/[id] and renders plan info,
// internal team members, and Stripe payment history, plus the same
// AccountActionsMenu used in the accounts table.
// ============================================================

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bot,
  CreditCard,
  Laptop,
  Lock,
  Loader2,
  Notebook,
  Plug,
  Plus,
  ShieldCheck,
  Ticket,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountActionsMenu } from "@/components/admin/account-actions-menu";
import type { Plan, SubscriptionStatus } from "@/lib/billing-platform/plans";
import {
  GATED_FEATURES,
  FEATURE_LABEL,
  resolveFeatureAccess,
  type FeatureOverrides,
} from "@/lib/billing-platform/features";

interface AccountDetail {
  id: string;
  name: string;
  ownerUserId: string;
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string;
  includedSeats: number;
  hasStripeCustomer: boolean;
  hasStripeSubscription: boolean;
  createdAt: string;
  featureOverrides: FeatureOverrides;
  logoUrl: string | null;
  aiAccessBlocked: boolean;
  aiTokenLimitOverride: number | null;
}

interface AiQuota {
  used: number;
  limit: number | null;
  exceeded: boolean;
  blocked: boolean;
}

interface IntegrationError {
  id: string;
  source: "whatsapp_send" | "ai_auto_reply";
  code: string | null;
  message: string;
  createdAt: string;
}

interface CouponOption {
  id: string;
  code: string;
  description: string | null;
  active: boolean;
}

interface Member {
  userId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  avatarUrl: string | null;
}

interface Payment {
  id: string;
  status: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  created: number;
  description: string | null;
  hostedInvoiceUrl: string | null;
}

interface Integrations {
  ai: { provider: string; model: string; isActive: boolean; autoReplyEnabled: boolean } | null;
  whatsapp: {
    phoneNumberId: string | null;
    wabaId: string | null;
    status: string;
    connectedAt: string | null;
    registeredAt: string | null;
    lastRegistrationError: string | null;
  } | null;
  googleCalendar: string[];
  metaCapi: {
    hasPixelId: boolean;
    trackLeadCreated: boolean;
    trackDealWon: boolean;
    trackFirstReply: boolean;
    trackAutomations: boolean;
    hasGoogleAdsId: boolean;
  } | null;
}

interface Session {
  memberName: string;
  ipAddress: string | null;
  browser: string | null;
  device: string | null;
  country: string | null;
  createdAt: string;
}

interface HistoryEvent {
  type: "login" | "admin_action";
  description: string;
  detail: string | null;
  createdAt: string;
}

interface Tag {
  id: string;
  label: string;
}

interface Note {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

const PLAN_LABEL: Record<Plan, string> = {
  trial: "Prueba",
  standalone: "Standalone",
  zentro_salud_starter: "Zentro Salud Starter",
  zentro_salud_pro: "Zentro Salud Pro",
};

const STATUS_VARIANT: Record<SubscriptionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  trialing: "secondary",
  active: "default",
  past_due: "destructive",
  canceled: "outline",
  trial_expired: "destructive",
  suspended: "destructive",
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: "En prueba",
  active: "Activa",
  past_due: "Pago vencido",
  canceled: "Cancelada",
  trial_expired: "Prueba vencida",
  suspended: "Suspendida",
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Dueño",
  admin: "Administrador",
  member: "Miembro",
  viewer: "Solo lectura",
};

const ERROR_SOURCE_LABEL: Record<IntegrationError["source"], string> = {
  whatsapp_send: "Envío WhatsApp",
  ai_auto_reply: "Auto-respuesta IA",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  paid: "Pagado",
  open: "Pendiente",
  uncollectible: "Rechazado",
  void: "Anulado",
};

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase() }).format(
    cents / 100,
  );
}

export function AccountDetailPanel({ accountId }: { accountId: string }) {
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [aiQuota, setAiQuota] = useState<AiQuota | null>(null);
  const [recentErrors, setRecentErrors] = useState<IntegrationError[]>([]);
  const [tokenLimitDraft, setTokenLimitDraft] = useState("");
  const [savingAiQuota, setSavingAiQuota] = useState(false);
  const [coupons, setCoupons] = useState<CouponOption[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [savingFeature, setSavingFeature] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingMember, setSavingMember] = useState(false);

  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiProvider, setAiProvider] = useState<"openai" | "anthropic">("openai");
  const [aiModel, setAiModel] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiIsActive, setAiIsActive] = useState(true);
  const [savingAi, setSavingAi] = useState(false);

  const [waDialogOpen, setWaDialogOpen] = useState(false);
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waWabaId, setWaWabaId] = useState("");
  const [waAccessToken, setWaAccessToken] = useState("");
  const [waVerifyToken, setWaVerifyToken] = useState("");
  const [waPin, setWaPin] = useState("");
  const [savingWa, setSavingWa] = useState(false);

  const [capiDialogOpen, setCapiDialogOpen] = useState(false);
  const [capiPixelId, setCapiPixelId] = useState("");
  const [capiAccessToken, setCapiAccessToken] = useState("");
  const [capiTestEventCode, setCapiTestEventCode] = useState("");
  const [capiTrackLead, setCapiTrackLead] = useState(false);
  const [capiTrackDeal, setCapiTrackDeal] = useState(false);
  const [capiTrackReply, setCapiTrackReply] = useState(false);
  const [capiTrackAutomations, setCapiTrackAutomations] = useState(false);
  const [capiGoogleAdsId, setCapiGoogleAdsId] = useState("");
  const [savingCapi, setSavingCapi] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<Member | null>(null);
  const [revokingSession, setRevokingSession] = useState(false);

  const [historyTarget, setHistoryTarget] = useState<Member | null>(null);
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[] | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo cargar la cuenta");
      setAccount(body.account);
      setMembers(body.members);
      setPayments(body.payments);
      setTags(body.tags ?? []);
      setNotes(body.notes ?? []);
      setIntegrations(body.integrations ?? null);
      setSessions(body.sessions ?? []);
      setAiQuota(body.aiQuota ?? null);
      setRecentErrors(body.recentErrors ?? []);
      setTokenLimitDraft(
        body.account?.aiTokenLimitOverride != null ? String(body.account.aiTokenLimitOverride) : "",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    fetch("/api/platform-admin/coupons", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => setCoupons(((body.coupons ?? []) as CouponOption[]).filter((c) => c.active)))
      .catch(() => {});
  }, []);

  async function handleApplyCoupon() {
    if (!selectedCouponId) return;
    setApplyingCoupon(true);
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/apply-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couponId: selectedCouponId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo aplicar el cupón");
      toast.success("Cupón aplicado a la suscripción");
      setSelectedCouponId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo aplicar el cupón");
    } finally {
      setApplyingCoupon(false);
    }
  }

  async function handleAddTag() {
    const label = newTag.trim();
    if (!label) return;
    setAddingTag(true);
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo agregar la etiqueta");
      setTags((prev) => [...prev, body.tag]);
      setNewTag("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo agregar la etiqueta");
    } finally {
      setAddingTag(false);
    }
  }

  async function handleRemoveTag(tagId: string) {
    setTags((prev) => prev.filter((t) => t.id !== tagId));
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/tags/${tagId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("No se pudo quitar la etiqueta");
      void load();
    }
  }

  async function handleAddNote() {
    const text = newNote.trim();
    if (!text) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo agregar la nota");
      setNotes((prev) => [body.note, ...prev]);
      setNewNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo agregar la nota");
    } finally {
      setAddingNote(false);
    }
  }

  async function handleSetFeatureOverride(feature: string, enabled: boolean | null) {
    setSavingFeature(feature);
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/feature-overrides`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, enabled }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo actualizar");
      setAccount((prev) => (prev ? { ...prev, featureOverrides: body.featureOverrides } : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setSavingFeature(null);
    }
  }

  async function handleToggleAiBlock() {
    if (!account) return;
    const nextBlocked = !account.aiAccessBlocked;
    setSavingAiQuota(true);
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/ai-quota`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: nextBlocked }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo actualizar");
      setAccount((prev) => (prev ? { ...prev, aiAccessBlocked: nextBlocked } : prev));
      toast.success(nextBlocked ? "Acceso a IA bloqueado" : "Acceso a IA restaurado");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setSavingAiQuota(false);
    }
  }

  async function handleSaveTokenLimitOverride() {
    const trimmed = tokenLimitDraft.trim();
    const tokenLimitOverride = trimmed === "" ? null : Number(trimmed);
    if (tokenLimitOverride !== null && (!Number.isInteger(tokenLimitOverride) || tokenLimitOverride < 0)) {
      toast.error("Ingresa un número entero de 0 o más, o deja el campo vacío");
      return;
    }
    setSavingAiQuota(true);
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/ai-quota`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenLimitOverride }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo actualizar");
      setAccount((prev) => (prev ? { ...prev, aiTokenLimitOverride: tokenLimitOverride } : prev));
      toast.success("Límite de tokens actualizado");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setSavingAiQuota(false);
    }
  }

  function openEditMember(member: Member) {
    setEditingMember(member);
    setEditEmail(member.email ?? "");
    setEditPhone(member.phone ?? "");
  }

  async function handleSaveMember() {
    if (!editingMember) return;
    setSavingMember(true);
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/members/${editingMember.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: editEmail.trim(), phone: editPhone.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo actualizar");
      setMembers((prev) =>
        prev.map((m) => (m.userId === editingMember.userId ? { ...m, email: editEmail.trim(), phone: editPhone.trim() } : m)),
      );
      toast.success("Datos del usuario actualizados");
      setEditingMember(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setSavingMember(false);
    }
  }

  async function handleSaveAiConfig() {
    if (!aiModel.trim() || !aiApiKey.trim()) return;
    setSavingAi(true);
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/ai-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: aiProvider, model: aiModel.trim(), apiKey: aiApiKey.trim(), isActive: aiIsActive }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo guardar");
      setIntegrations((prev) =>
        prev ? { ...prev, ai: { provider: body.provider, model: body.model, isActive: body.isActive, autoReplyEnabled: prev.ai?.autoReplyEnabled ?? false } } : prev,
      );
      toast.success("Configuración de IA guardada");
      setAiDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSavingAi(false);
    }
  }

  async function handleSaveWhatsApp() {
    if (!waPhoneNumberId.trim() || !waAccessToken.trim()) return;
    setSavingWa(true);
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/whatsapp-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId: waPhoneNumberId.trim(),
          wabaId: waWabaId.trim() || null,
          accessToken: waAccessToken.trim(),
          verifyToken: waVerifyToken.trim() || null,
          pin: waPin.trim() || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo guardar");
      if (body.registrationError) {
        toast.error(`Guardado, pero el webhook no quedó registrado: ${body.registrationError}`);
      } else {
        toast.success("WhatsApp configurado");
      }
      setWaDialogOpen(false);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSavingWa(false);
    }
  }

  async function handleSaveCapi() {
    setSavingCapi(true);
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/conversions-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metaPixelId: capiPixelId.trim() || undefined,
          metaAccessToken: capiAccessToken.trim() || undefined,
          metaTestEventCode: capiTestEventCode.trim() || undefined,
          metaTrackLeadCreated: capiTrackLead,
          metaTrackDealWon: capiTrackDeal,
          metaTrackFirstReply: capiTrackReply,
          metaTrackAutomations: capiTrackAutomations,
          googleAdsConversionId: capiGoogleAdsId.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo guardar");
      toast.success("Meta CAPI / Google Ads guardado");
      setCapiDialogOpen(false);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSavingCapi(false);
    }
  }

  async function handleRevokeSession() {
    if (!revokeTarget) return;
    setRevokingSession(true);
    try {
      const res = await fetch(
        `/api/platform-admin/accounts/${accountId}/members/${revokeTarget.userId}/revoke-session`,
        { method: "POST" },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo cerrar la sesión");
      toast.success(`Sesión de ${revokeTarget.fullName ?? revokeTarget.email} bloqueada por 1 minuto`);
      setRevokeTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cerrar la sesión");
    } finally {
      setRevokingSession(false);
    }
  }

  async function openHistory(member: Member) {
    setHistoryTarget(member);
    setHistoryEvents(null);
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/members/${member.userId}/history`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo cargar el historial");
      setHistoryEvents(body.events);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cargar el historial");
      setHistoryEvents([]);
    }
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando cuenta…
      </div>
    );
  }

  const owner = members.find((m) => m.userId === account.ownerUserId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Avatar size="lg">
            <AvatarImage src={account.logoUrl ?? undefined} alt={account.name} />
            <AvatarFallback>{account.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{account.name}</h1>
            <Badge variant={STATUS_VARIANT[account.subscriptionStatus]}>
              {STATUS_LABEL[account.subscriptionStatus]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {owner?.fullName ?? "Sin dueño resuelto"} · {owner?.email ?? "—"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
              >
                {tag.label}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag.id)}
                  aria-label={`Quitar etiqueta ${tag.label}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
              placeholder="+ Etiqueta"
              disabled={addingTag}
              className="h-6 w-28 rounded-full border-dashed px-2.5 text-xs"
            />
          </div>
          </div>
        </div>
        <AccountActionsMenu
          accountId={account.id}
          accountName={account.name}
          ownerEmail={owner?.email ?? null}
          plan={account.plan}
          subscriptionStatus={account.subscriptionStatus}
          onChanged={load}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-muted p-4">
          <div className="text-xs text-muted-foreground">Plan</div>
          <div className="mt-1 text-sm font-medium text-foreground">{PLAN_LABEL[account.plan]}</div>
        </div>
        <div className="rounded-lg bg-muted p-4">
          <div className="text-xs text-muted-foreground">Asientos</div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {members.length} / {account.includedSeats}
          </div>
        </div>
        <div className="rounded-lg bg-muted p-4">
          <div className="text-xs text-muted-foreground">Cliente desde</div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {new Date(account.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <CreditCard className="size-4" /> Pagos recientes
          </div>
          {!account.hasStripeCustomer ? (
            <p className="text-sm text-muted-foreground">Sin cliente de Stripe asociado.</p>
          ) : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay facturas.</p>
          ) : (
            <div className="space-y-2">
              {payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {new Date(payment.created * 1000).toLocaleDateString()}
                  </span>
                  <a
                    href={payment.hostedInvoiceUrl ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className={
                      payment.status === "paid"
                        ? "text-foreground hover:underline"
                        : "text-destructive hover:underline"
                    }
                  >
                    {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status} —{" "}
                    {formatMoney(payment.status === "paid" ? payment.amountPaid : payment.amountDue, payment.currency)}
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <Users className="size-4" /> Usuarios internos
          </div>
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.userId} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar size="sm">
                    <AvatarImage src={member.avatarUrl ?? undefined} alt={member.fullName ?? ""} />
                    <AvatarFallback>{(member.fullName ?? member.email ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate text-foreground">{member.fullName ?? member.email ?? "—"}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {member.email ?? "—"}
                      {member.phone ? ` · ${member.phone}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground">{ROLE_LABEL[member.role] ?? member.role}</span>
                  <button
                    type="button"
                    onClick={() => openEditMember(member)}
                    className="text-xs text-accent-foreground underline decoration-dotted hover:text-foreground"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setRevokeTarget(member)}
                    className="text-xs text-destructive underline decoration-dotted hover:text-destructive/80"
                  >
                    Cerrar sesión
                  </button>
                  <button
                    type="button"
                    onClick={() => openHistory(member)}
                    className="text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
                  >
                    Historial
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Ticket className="size-4" /> Aplicar cupón de descuento
        </div>
        {!account.hasStripeSubscription ? (
          <p className="text-sm text-muted-foreground">
            Esta cuenta no tiene una suscripción de Stripe activa — usa &ldquo;Establecer plan&rdquo; para
            una cortesía completa en su lugar.
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={selectedCouponId} onValueChange={(v) => setSelectedCouponId(v ?? "")}>
              <SelectTrigger className="sm:w-64">
                <SelectValue placeholder="Elige un cupón activo" />
              </SelectTrigger>
              <SelectContent>
                {coupons.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No hay cupones activos
                  </SelectItem>
                ) : (
                  coupons.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code}
                      {c.description ? ` — ${c.description}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!selectedCouponId || applyingCoupon} onClick={handleApplyCoupon}>
              {applyingCoupon ? <Loader2 className="size-4 animate-spin" /> : null}
              Aplicar a esta cuenta
            </Button>
          </div>
        )}
      </div>

      <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar contacto de {editingMember?.fullName ?? editingMember?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="member-email">Correo</Label>
              <Input id="member-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-phone">Teléfono</Label>
              <Input id="member-phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveMember} disabled={savingMember}>
              {savingMember ? <Loader2 className="size-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyTarget} onOpenChange={(open) => !open && setHistoryTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Historial de {historyTarget?.fullName ?? historyTarget?.email}</DialogTitle>
          </DialogHeader>
          {historyEvents === null ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : historyEvents.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Sin actividad registrada todavía.</p>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {historyEvents.map((event, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  {event.type === "login" ? (
                    <Laptop className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <div className="text-foreground">{event.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()}
                      {event.detail ? ` · ${event.detail}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar sesión de {revokeTarget?.fullName ?? revokeTarget?.email}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Bloquea que este usuario inicie sesión o refresque su sesión durante 1 minuto. Si tiene una
            pestaña abierta con un token de acceso todavía vigente, puede seguir usándola hasta que ese
            token expire por sí solo (normalmente hasta 1 hora) — Supabase no permite invalidar un token
            ya emitido al instante. Esto corta accesos nuevos, no es una desconexión instantánea garantizada.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleRevokeSession} disabled={revokingSession}>
              {revokingSession ? <Loader2 className="size-4 animate-spin" /> : null}
              Cerrar sesión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Agentes IA</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Proveedor</Label>
              <Select value={aiProvider} onValueChange={(v) => v && setAiProvider(v as "openai" | "anthropic")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-model">Modelo</Label>
              <Input
                id="ai-model"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder={aiProvider === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-key">Clave de API</Label>
              <Input
                id="ai-key"
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder="Se valida contra el proveedor antes de guardar"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={aiIsActive} onChange={(e) => setAiIsActive(e.target.checked)} />
              Activa
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveAiConfig} disabled={savingAi || !aiModel.trim() || !aiApiKey.trim()}>
              {savingAi ? <Loader2 className="size-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={waDialogOpen} onOpenChange={setWaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar WhatsApp Business</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="wa-phone-id">Phone number ID</Label>
              <Input id="wa-phone-id" value={waPhoneNumberId} onChange={(e) => setWaPhoneNumberId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-waba-id">WABA ID</Label>
              <Input id="wa-waba-id" value={waWabaId} onChange={(e) => setWaWabaId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-token">Access token</Label>
              <Input
                id="wa-token"
                type="password"
                value={waAccessToken}
                onChange={(e) => setWaAccessToken(e.target.value)}
                placeholder="Se verifica contra Meta antes de guardar"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-verify-token">Verify token (webhook)</Label>
              <Input id="wa-verify-token" value={waVerifyToken} onChange={(e) => setWaVerifyToken(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-pin">PIN de 2 pasos (6 dígitos, opcional)</Label>
              <Input id="wa-pin" value={waPin} onChange={(e) => setWaPin(e.target.value)} placeholder="Solo si vas a registrar el webhook ahora" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveWhatsApp} disabled={savingWa || !waPhoneNumberId.trim() || !waAccessToken.trim()}>
              {savingWa ? <Loader2 className="size-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={capiDialogOpen} onOpenChange={setCapiDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Meta CAPI / Google Ads</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="capi-pixel">Meta Pixel ID</Label>
              <Input id="capi-pixel" value={capiPixelId} onChange={(e) => setCapiPixelId(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="capi-token">Meta CAPI access token</Label>
              <Input
                id="capi-token"
                type="password"
                value={capiAccessToken}
                onChange={(e) => setCapiAccessToken(e.target.value)}
                placeholder="Deja vacío para conservar el actual"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="capi-test-code">Test event code (opcional)</Label>
              <Input id="capi-test-code" value={capiTestEventCode} onChange={(e) => setCapiTestEventCode(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={capiTrackLead} onChange={(e) => setCapiTrackLead(e.target.checked)} />
                Lead creado
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={capiTrackDeal} onChange={(e) => setCapiTrackDeal(e.target.checked)} />
                Deal ganado
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={capiTrackReply} onChange={(e) => setCapiTrackReply(e.target.checked)} />
                Primera respuesta
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={capiTrackAutomations}
                  onChange={(e) => setCapiTrackAutomations(e.target.checked)}
                />
                Automatizaciones
              </label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="capi-gads">Google Ads Conversion ID (opcional)</Label>
              <Input id="capi-gads" value={capiGoogleAdsId} onChange={(e) => setCapiGoogleAdsId(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCapiDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCapi} disabled={savingCapi}>
              {savingCapi ? <Loader2 className="size-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Plug className="size-4" /> Integraciones
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-foreground">
              <Bot className="size-3.5 text-muted-foreground" /> Agentes IA
            </span>
            <span className="flex items-center gap-2">
              {integrations?.ai ? (
                <span className="text-muted-foreground">
                  {integrations.ai.provider} · {integrations.ai.model} ·{" "}
                  {integrations.ai.isActive ? "Activo" : "Inactivo"}
                </span>
              ) : (
                <span className="text-muted-foreground">Sin configurar</span>
              )}
              <button
                type="button"
                onClick={() => {
                  setAiProvider(integrations?.ai?.provider === "anthropic" ? "anthropic" : "openai");
                  setAiModel(integrations?.ai?.model ?? "");
                  setAiApiKey("");
                  setAiIsActive(integrations?.ai?.isActive ?? true);
                  setAiDialogOpen(true);
                }}
                className="text-xs text-accent-foreground underline decoration-dotted hover:text-foreground"
              >
                {integrations?.ai ? "Editar" : "Configurar"}
              </button>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-foreground">WhatsApp Business</span>
            <span className="flex items-center gap-2">
              {integrations?.whatsapp ? (
                <span className="text-muted-foreground">
                  {integrations.whatsapp.status === "connected" ? "Conectado" : "Desconectado"}
                  {integrations.whatsapp.lastRegistrationError ? " · sin registrar webhook" : ""}
                </span>
              ) : (
                <span className="text-muted-foreground">Sin configurar</span>
              )}
              <button
                type="button"
                onClick={() => {
                  setWaPhoneNumberId(integrations?.whatsapp?.phoneNumberId ?? "");
                  setWaWabaId(integrations?.whatsapp?.wabaId ?? "");
                  setWaAccessToken("");
                  setWaVerifyToken("");
                  setWaPin("");
                  setWaDialogOpen(true);
                }}
                className="text-xs text-accent-foreground underline decoration-dotted hover:text-foreground"
              >
                {integrations?.whatsapp ? "Editar" : "Configurar"}
              </button>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-foreground">Google Calendar</span>
            {integrations?.googleCalendar.length ? (
              <span className="text-muted-foreground">{integrations.googleCalendar.join(", ")}</span>
            ) : (
              <span className="text-muted-foreground">Sin conectar</span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-foreground">Meta CAPI / Google Ads</span>
            <span className="flex items-center gap-2">
              {integrations?.metaCapi?.hasPixelId ? (
                <span className="text-muted-foreground">Pixel configurado</span>
              ) : (
                <span className="text-muted-foreground">Sin configurar</span>
              )}
              <button
                type="button"
                onClick={() => {
                  setCapiPixelId("");
                  setCapiAccessToken("");
                  setCapiTestEventCode("");
                  setCapiTrackLead(integrations?.metaCapi?.trackLeadCreated ?? false);
                  setCapiTrackDeal(integrations?.metaCapi?.trackDealWon ?? false);
                  setCapiTrackReply(integrations?.metaCapi?.trackFirstReply ?? false);
                  setCapiTrackAutomations(integrations?.metaCapi?.trackAutomations ?? false);
                  setCapiGoogleAdsId("");
                  setCapiDialogOpen(true);
                }}
                className="text-xs text-accent-foreground underline decoration-dotted hover:text-foreground"
              >
                {integrations?.metaCapi ? "Editar" : "Configurar"}
              </button>
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Laptop className="size-4" /> Sesiones recientes
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin inicios de sesión registrados todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-normal">Usuario</th>
                  <th className="pb-2 pr-4 font-normal">Fecha</th>
                  <th className="pb-2 pr-4 font-normal">IP</th>
                  <th className="pb-2 pr-4 font-normal">País</th>
                  <th className="pb-2 pr-4 font-normal">Navegador</th>
                  <th className="pb-2 font-normal">Dispositivo</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-2 pr-4 text-foreground">{s.memberName}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{s.ipAddress ?? "—"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{s.country ?? "—"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{s.browser ?? "—"}</td>
                    <td className="py-2 text-muted-foreground">{s.device ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Bot className="size-4" /> Cuota de IA
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-foreground">Consumo este mes</p>
              <p className="text-xs text-muted-foreground">
                {aiQuota
                  ? aiQuota.limit === null
                    ? `${aiQuota.used.toLocaleString()} tokens · sin límite`
                    : `${aiQuota.used.toLocaleString()} / ${aiQuota.limit.toLocaleString()} tokens`
                  : "Cargando…"}
              </p>
            </div>
            {aiQuota?.blocked ? (
              <Badge variant="destructive">Bloqueado por admin</Badge>
            ) : aiQuota?.exceeded ? (
              <Badge variant="destructive">Límite alcanzado</Badge>
            ) : null}
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <div>
              <p className="text-foreground">Bloquear acceso a IA</p>
              <p className="text-xs text-muted-foreground">
                Corta el auto-reply y los borradores de IA para esta cuenta, sin importar su plan.
              </p>
            </div>
            <Button
              variant={account.aiAccessBlocked ? "destructive" : "outline"}
              size="sm"
              disabled={savingAiQuota}
              onClick={handleToggleAiBlock}
            >
              {savingAiQuota ? <Loader2 className="size-4 animate-spin" /> : null}
              {account.aiAccessBlocked ? "Desbloquear" : "Bloquear"}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <div className="flex-1">
              <p className="text-foreground">Límite mensual (override)</p>
              <p className="text-xs text-muted-foreground">
                Reemplaza el límite del plan para esta cuenta. Vacío = usar el del plan.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={1}
                value={tokenLimitDraft}
                onChange={(e) => setTokenLimitDraft(e.target.value)}
                placeholder="Del plan"
                className="w-28"
              />
              <Button size="sm" disabled={savingAiQuota} onClick={handleSaveTokenLimitOverride}>
                Guardar
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <AlertTriangle className="size-4" /> Errores recientes
        </div>
        {recentErrors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin errores registrados.</p>
        ) : (
          <ul className="space-y-2">
            {recentErrors.map((e) => (
              <li key={e.id} className="rounded-md border border-border bg-muted/30 p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {ERROR_SOURCE_LABEL[e.source] ?? e.source}
                    {e.code ? ` · #${e.code}` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{e.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Lock className="size-4" /> Funciones de la cuenta
        </div>
        <div className="space-y-2 text-sm">
          {GATED_FEATURES.map((feature) => {
            const isOverridden = account.featureOverrides[feature] !== undefined;
            const effective = resolveFeatureAccess(account.plan, feature, account.featureOverrides);
            const saving = savingFeature === feature;
            return (
              <div key={feature} className="flex items-center justify-between">
                <span className="text-foreground">{FEATURE_LABEL[feature]}</span>
                <div className="flex items-center gap-2">
                  {isOverridden && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      onClick={() => handleSetFeatureOverride(feature, null)}
                      disabled={saving}
                    >
                      Usar el del plan
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSetFeatureOverride(feature, !effective)}
                    disabled={saving}
                    className={
                      "rounded-full px-2.5 py-0.5 text-xs " +
                      (effective
                        ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                        : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300")
                    }
                  >
                    {saving ? "…" : effective ? "Activo" : "Bloqueado"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Un bloqueo aquí anula el plan, pero solo oculta la función en la interfaz — no bloquea llamadas
          directas a la API todavía.
        </p>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Notebook className="size-4" /> Notas internas
        </div>
        <div className="mb-4 flex gap-2">
          <Input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
            placeholder="Agregar una nota sobre esta cuenta"
            disabled={addingNote}
          />
          <Button onClick={handleAddNote} disabled={addingNote || !newNote.trim()}>
            {addingNote ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Agregar
          </Button>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay notas.</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{note.authorName ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(note.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-0.5 text-muted-foreground">{note.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
