"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus } from "lucide-react";

import Link from "next/link";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccountActionsMenu } from "@/components/admin/account-actions-menu";

interface AdminAccount {
  id: string;
  name: string;
  ownerUserId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  subscriptionStatus: string;
  seatsUsed: number;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  suspended: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Activa",
  suspended: "Suspendida",
};

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newOwnerFullName, setNewOwnerFullName] = useState("");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");

  async function loadAccounts() {
    try {
      const res = await fetch("/api/platform-admin/accounts", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo cargar la lista de cuentas");
      setAccounts(body.accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/platform-admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: newAccountName,
          ownerFullName: newOwnerFullName,
          ownerEmail: newOwnerEmail,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo crear la cuenta");
      toast.success(`Cuenta creada — invitación enviada a ${newOwnerEmail}`);
      setCreateOpen(false);
      setNewAccountName("");
      setNewOwnerFullName("");
      setNewOwnerEmail("");
      void loadAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    } finally {
      setCreating(false);
    }
  }

  const query = search.trim().toLowerCase();
  const filteredAccounts =
    accounts && query
      ? accounts.filter((account) =>
          [account.name, account.ownerName, account.ownerEmail]
            .filter(Boolean)
            .some((field) => field!.toLowerCase().includes(query)),
        )
      : accounts;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Cuentas</h1>
          <p className="text-sm text-muted-foreground">
            Todas las cuentas de Zuhma Med CRM. Acceso abierto, sin niveles de plan.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder="Buscar por nombre, dueño o correo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Nueva cuenta
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : !accounts ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando cuentas…
        </div>
      ) : accounts.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Todavía no hay cuentas registradas.
        </p>
      ) : filteredAccounts && filteredAccounts.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Ninguna cuenta coincide con &ldquo;{search}&rdquo;.
        </p>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead>Dueño</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Miembros</TableHead>
                <TableHead>Creada</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(filteredAccounts ?? []).map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium text-foreground">
                    <Link href={`/admin/accounts/${account.id}`} className="hover:underline">
                      {account.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-foreground">{account.ownerName ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {account.ownerEmail ?? "sin email resuelto"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[account.subscriptionStatus] ?? "default"}>
                      {STATUS_LABEL[account.subscriptionStatus] ?? account.subscriptionStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>{account.seatsUsed}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(account.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <AccountActionsMenu
                      accountId={account.id}
                      accountName={account.name}
                      ownerEmail={account.ownerEmail}
                      subscriptionStatus={account.subscriptionStatus}
                      onChanged={loadAccounts}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva cuenta</DialogTitle>
            <DialogDescription>
              Crea la cuenta y su dueño. Se le enviará un correo de invitación para
              que configure su contraseña y entre directo a su cuenta — sin
              autorregistro público.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateAccount} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-account-name">Nombre de la cuenta / clínica</Label>
              <Input
                id="new-account-name"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                placeholder="Clínica Dental Ejemplo"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-owner-name">Nombre del dueño</Label>
              <Input
                id="new-owner-name"
                value={newOwnerFullName}
                onChange={(e) => setNewOwnerFullName(e.target.value)}
                placeholder="Nombre completo"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-owner-email">Correo del dueño</Label>
              <Input
                id="new-owner-email"
                type="email"
                value={newOwnerEmail}
                onChange={(e) => setNewOwnerEmail(e.target.value)}
                placeholder="dueño@clinica.com"
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                Crear e invitar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
