"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, Ticket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string | null;
  duration: "once" | "repeating" | "forever";
  durationInMonths: number | null;
  maxRedemptions: number | null;
  timesRedeemed: number | null;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

const DURATION_LABEL: Record<Coupon["duration"], string> = {
  once: "Una vez",
  repeating: "Repetido",
  forever: "Siempre",
};

function formatDiscount(c: Coupon) {
  if (c.percentOff != null) return `${c.percentOff}%`;
  if (c.amountOffCents != null) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: (c.currency ?? "usd").toUpperCase(),
    }).format(c.amountOffCents / 100);
  }
  return "—";
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [percentOff, setPercentOff] = useState("20");
  const [amountOffCents, setAmountOffCents] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [duration, setDuration] = useState<Coupon["duration"]>("once");
  const [durationInMonths, setDurationInMonths] = useState("3");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/platform-admin/coupons", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudieron cargar los cupones");
      setCoupons(body.coupons ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setCode("");
    setDescription("");
    setDiscountType("percent");
    setPercentOff("20");
    setAmountOffCents("");
    setCurrency("usd");
    setDuration("once");
    setDurationInMonths("3");
    setMaxRedemptions("");
    setExpiresAt("");
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await fetch("/api/platform-admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          description,
          discountType,
          percentOff: discountType === "percent" ? Number(percentOff) : undefined,
          amountOffCents: discountType === "amount" ? Number(amountOffCents) : undefined,
          currency: discountType === "amount" ? currency : undefined,
          duration,
          durationInMonths: duration === "repeating" ? Number(durationInMonths) : undefined,
          maxRedemptions: maxRedemptions.trim() ? Number(maxRedemptions) : null,
          expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo crear el cupón");
      toast.success("Cupón creado");
      setDialogOpen(false);
      resetForm();
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear el cupón");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(coupon: Coupon) {
    setTogglingId(coupon.id);
    try {
      const res = await fetch(`/api/platform-admin/coupons/${coupon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !coupon.active }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo actualizar");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Cupones de descuento</h1>
          <p className="text-sm text-muted-foreground">
            Códigos que los clientes pueden canjear en el checkout, o aplicar directamente a la
            suscripción de una cuenta desde su ficha.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> Crear cupón
        </Button>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : !coupons ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando cupones…
        </div>
      ) : coupons.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Ticket className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">Todavía no hay cupones</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Descuento</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>Canjes</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-foreground">{c.code}</TableCell>
                  <TableCell className="text-muted-foreground">{c.description ?? "—"}</TableCell>
                  <TableCell>{formatDiscount(c)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {DURATION_LABEL[c.duration]}
                    {c.duration === "repeating" && c.durationInMonths ? ` (${c.durationInMonths}m)` : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.timesRedeemed ?? "—"}
                    {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.active ? "default" : "outline"}>
                      {c.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={togglingId === c.id}
                      onClick={() => handleToggle(c)}
                    >
                      {togglingId === c.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : c.active ? (
                        "Desactivar"
                      ) : (
                        "Activar"
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear cupón</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="coupon-code">Código</Label>
              <Input
                id="coupon-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="CORTESIA50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coupon-desc">Descripción interna (opcional)</Label>
              <Input
                id="coupon-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Cortesía para Clínica X"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de descuento</Label>
                <Select value={discountType} onValueChange={(v) => v && setDiscountType(v as "percent" | "amount")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Porcentaje</SelectItem>
                    <SelectItem value="amount">Monto fijo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {discountType === "percent" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="coupon-percent">% de descuento</Label>
                  <Input
                    id="coupon-percent"
                    type="number"
                    min={1}
                    max={100}
                    value={percentOff}
                    onChange={(e) => setPercentOff(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="coupon-amount">Monto (centavos)</Label>
                  <Input
                    id="coupon-amount"
                    type="number"
                    min={1}
                    value={amountOffCents}
                    onChange={(e) => setAmountOffCents(e.target.value)}
                    placeholder="5000 = $50.00"
                  />
                </div>
              )}
            </div>
            {discountType === "amount" && (
              <div className="space-y-1.5">
                <Label htmlFor="coupon-currency">Moneda</Label>
                <Input
                  id="coupon-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toLowerCase())}
                  placeholder="usd"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Duración</Label>
                <Select value={duration} onValueChange={(v) => v && setDuration(v as Coupon["duration"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Una vez</SelectItem>
                    <SelectItem value="repeating">Repetido (N meses)</SelectItem>
                    <SelectItem value="forever">Siempre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {duration === "repeating" && (
                <div className="space-y-1.5">
                  <Label htmlFor="coupon-months"># de meses</Label>
                  <Input
                    id="coupon-months"
                    type="number"
                    min={1}
                    value={durationInMonths}
                    onChange={(e) => setDurationInMonths(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-max">Máx. de canjes (opcional)</Label>
                <Input
                  id="coupon-max"
                  type="number"
                  min={1}
                  value={maxRedemptions}
                  onChange={(e) => setMaxRedemptions(e.target.value)}
                  placeholder="Ilimitado"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-expires">Vence el (opcional)</Label>
                <Input
                  id="coupon-expires"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving || !code.trim()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
