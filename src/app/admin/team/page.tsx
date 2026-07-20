"use client";

// ============================================================
// /admin/team — manage who has platform-admin access (Zuhma Med CRM
// internal staff, not clinic accounts). Backed by /api/platform-admin/team.
// ============================================================

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, ShieldOff, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TeamMember {
  userId: string;
  email: string | null;
  fullName: string | null;
  createdAt: string;
  invitedBy: string | null;
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

export default function AdminTeamPage() {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<TeamMember | null>(null);
  const [revoking, setRevoking] = useState(false);

  async function loadMembers() {
    try {
      const res = await fetch("/api/platform-admin/team", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo cargar el equipo");
      setMembers(body.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  useEffect(() => {
    void loadMembers();
  }, []);

  async function handleAdd() {
    if (!email.trim()) return;
    setSaving(true);
    try {
      await postJson("/api/platform-admin/team", { email: email.trim() });
      toast.success("Acceso de administrador otorgado");
      setAddOpen(false);
      setEmail("");
      void loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo agregar");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/platform-admin/team/${revokeTarget.userId}`, { method: "DELETE" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo quitar el acceso");
      toast.success("Acceso de administrador revocado");
      setRevokeTarget(null);
      void loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo quitar el acceso");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Equipo interno</h1>
          <p className="text-sm text-muted-foreground">
            Personas con acceso al panel de administración de Zuhma Med CRM — no ven las cuentas de
            clientes como usuarios de esa cuenta, tienen acceso al panel completo.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Agregar admin
        </Button>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : !members ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando equipo…
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Admin desde</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell className="flex items-center gap-2 font-medium text-foreground">
                    <UserCog className="size-4 text-muted-foreground" />
                    {member.fullName ?? "—"}
                  </TableCell>
                  <TableCell>{member.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setRevokeTarget(member)}
                    >
                      <ShieldOff className="size-4" />
                      Quitar acceso
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar administrador</DialogTitle>
            <DialogDescription>
              Si el correo no tiene cuenta todavía, se crea un usuario nuevo sin ningún consultorio
              asociado y se le envía un correo de invitación. Si ya existe (por ejemplo, es dueño de
              una cuenta de cliente), solo se le otorga acceso adicional al panel — sin enviar
              correo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="team-email">Correo</Label>
            <Input
              id="team-email"
              type="email"
              placeholder="nombre@zuhma.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAdd} disabled={saving || !email.trim()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quitar acceso de administrador</DialogTitle>
            <DialogDescription>
              {revokeTarget?.email} perderá acceso al panel de administración de Zuhma Med CRM. Esto no
              afecta ninguna cuenta de cliente a la que pertenezca por separado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
              {revoking ? <Loader2 className="size-4 animate-spin" /> : null}
              Quitar acceso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
