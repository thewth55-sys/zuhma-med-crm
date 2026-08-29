"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Megaphone, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

type Audience = "all" | "accounts" | "users";

interface AdminAccount {
  id: string;
  name: string;
}
interface AdminUser {
  userId: string;
  name: string;
  email: string | null;
  accountName: string | null;
}
interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  send_notification: boolean;
  is_active: boolean;
  created_at: string;
}

const AUDIENCE_LABEL: Record<Audience, string> = {
  all: "Todos",
  accounts: "Cuentas",
  users: "Usuarios",
};

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [sendNotification, setSendNotification] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadList() {
    const res = await fetch("/api/platform-admin/announcements", { cache: "no-store" });
    const body = await res.json().catch(() => null);
    setAnnouncements(body?.announcements ?? []);
  }

  useEffect(() => {
    void loadList();
    fetch("/api/platform-admin/accounts", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setAccounts(b?.accounts ?? []))
      .catch(() => {});
    fetch("/api/platform-admin/users", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setUsers(b?.users ?? []))
      .catch(() => {});
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredTargets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (audience === "accounts") {
      return accounts
        .filter((a) => !q || a.name.toLowerCase().includes(q))
        .map((a) => ({ id: a.id, label: a.name, sub: "" }));
    }
    if (audience === "users") {
      return users
        .filter((u) => !q || `${u.name} ${u.email ?? ""} ${u.accountName ?? ""}`.toLowerCase().includes(q))
        .map((u) => ({ id: u.userId, label: u.name, sub: `${u.email ?? ""}${u.accountName ? ` · ${u.accountName}` : ""}` }));
    }
    return [];
  }, [audience, accounts, users, search]);

  async function handlePublish() {
    if (!title.trim() || !body.trim()) {
      toast.error("Título y cuerpo son obligatorios");
      return;
    }
    if (audience !== "all" && selected.size === 0) {
      toast.error("Elige al menos un destinatario");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/platform-admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          link_url: linkUrl || undefined,
          link_label: linkLabel || undefined,
          audience,
          send_notification: sendNotification,
          account_ids: audience === "accounts" ? [...selected] : undefined,
          user_ids: audience === "users" ? [...selected] : undefined,
        }),
      });
      const b = await res.json().catch(() => null);
      if (!res.ok) throw new Error(b?.error ?? "No se pudo publicar");
      toast.success(sendNotification ? "Aviso publicado y notificado" : "Aviso publicado");
      setTitle("");
      setBody("");
      setLinkUrl("");
      setLinkLabel("");
      setSelected(new Set());
      void loadList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo publicar");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(a: Announcement) {
    await fetch(`/api/platform-admin/announcements/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !a.is_active }),
    });
    void loadList();
  }

  async function remove(a: Announcement) {
    if (!confirm(`¿Eliminar el aviso "${a.title}"?`)) return;
    await fetch(`/api/platform-admin/announcements/${a.id}`, { method: "DELETE" });
    void loadList();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Megaphone className="size-5 text-primary" /> Avisos
        </h1>
        <p className="text-sm text-muted-foreground">
          Publica avisos que aparecen en el dashboard de los usuarios. Opcionalmente, envía también una
          notificación (campana + push).
        </p>
      </div>

      {/* Crear aviso */}
      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Título</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nueva función disponible" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Cuerpo</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[70px]" placeholder="Cuéntales qué hay de nuevo…" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Enlace (opcional)</label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Texto del enlace (opcional)</label>
              <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Ver más" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Destinatarios</label>
            <select
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value as Audience);
                setSelected(new Set());
              }}
              className="rounded-md border border-border bg-muted px-2 py-1 text-sm text-foreground"
            >
              <option value="all">Todos</option>
              <option value="accounts">Cuentas específicas</option>
              <option value="users">Usuarios específicos</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={sendNotification} onCheckedChange={setSendNotification} />
            Enviar también notificación (campana + push)
          </label>
        </div>

        {audience !== "all" && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={audience === "accounts" ? "Buscar cuenta…" : "Buscar usuario…"}
                className="h-8 max-w-xs"
              />
              <span className="text-xs text-muted-foreground">{selected.size} seleccionados</span>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {filteredTargets.map((tgt) => (
                <label key={tgt.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted">
                  <input type="checkbox" checked={selected.has(tgt.id)} onChange={() => toggle(tgt.id)} className="accent-primary" />
                  <span className="text-foreground">{tgt.label}</span>
                  {tgt.sub ? <span className="text-xs text-muted-foreground">{tgt.sub}</span> : null}
                </label>
              ))}
              {filteredTargets.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">Sin resultados.</p>}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handlePublish} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}
            {sendNotification ? "Publicar y notificar" : "Publicar aviso"}
          </Button>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {announcements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay avisos.</p>
        ) : (
          announcements.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {a.title}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {AUDIENCE_LABEL[a.audience]}
                  </span>
                  {a.send_notification ? (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Notificó</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{a.body}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} />
                  Activo
                </label>
                <button type="button" onClick={() => remove(a)} className="text-muted-foreground hover:text-destructive" aria-label="Eliminar">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
