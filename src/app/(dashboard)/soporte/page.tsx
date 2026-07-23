"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, RefreshCw, LifeBuoy } from "lucide-react";

interface TicketRow {
  id: string;
  subject: string;
  status: string | null;
  updated_at: string;
}
interface Message {
  id: string;
  author_name: string | null;
  body: string;
  direction: "user" | "support";
  created_at: string;
}
interface Detail {
  ticket: { id: string; subject: string; status: string | null };
  messages: Message[];
}

function fmt(ts: string): string {
  try {
    return new Date(ts).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return ts;
  }
}

export default function SoportePage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    const res = await fetch("/api/support/tickets");
    const data = await res.json().catch(() => null);
    if (res.ok) setTickets(data?.tickets ?? []);
  }, []);

  const openTicket = useCallback(async (id: string) => {
    setSelectedId(id);
    setShowNew(false);
    setLoadingDetail(true);
    setError(null);
    const res = await fetch(`/api/support/tickets/${id}`);
    const data = await res.json().catch(() => null);
    setLoadingDetail(false);
    if (res.ok) setDetail(data);
    else setError(data?.error ?? "No se pudo cargar el ticket.");
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/support/tickets");
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (active) setTickets(data?.tickets ?? []);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/support/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, message }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "No se pudo crear el ticket.");
      return;
    }
    setSubject("");
    setMessage("");
    setShowNew(false);
    await loadTickets();
    if (data?.id) openTicket(data.id);
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/support/tickets/${selectedId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: reply }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "No se pudo enviar la respuesta.");
      return;
    }
    setReply("");
    openTicket(selectedId);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <LifeBuoy className="size-6" /> Ayuda y soporte
          </h1>
          <p className="text-sm text-muted-foreground">
            Crea un ticket y el equipo de Zuhma te responderá aquí mismo.
          </p>
        </div>
        <Button onClick={() => { setShowNew(true); setSelectedId(null); setDetail(null); }}>
          <Plus className="size-4" /> Nuevo ticket
        </Button>
      </div>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        {/* Lista */}
        <div className="space-y-2">
          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no tienes tickets.</p>
          ) : (
            tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => openTicket(t.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                  selectedId === t.id ? "border-primary bg-muted" : "border-border"
                }`}
              >
                <div className="font-medium">{t.subject}</div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t.status ?? "—"}</span>
                  <span>{fmt(t.updated_at)}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Detalle / nuevo */}
        <div>
          {showNew ? (
            <Card>
              <CardHeader>
                <CardTitle>Nuevo ticket</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={createTicket} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="subject">Asunto</Label>
                    <Input id="subject" required value={subject} onChange={(e) => setSubject(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="message">Describe tu solicitud</Label>
                    <textarea
                      id="message"
                      required
                      rows={5}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <Button type="submit" disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null} Enviar ticket
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : selectedId && detail ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>{detail.ticket.subject}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">Estado: {detail.ticket.status ?? "—"}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => openTicket(selectedId)} disabled={loadingDetail}>
                  {loadingDetail ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Actualizar
                </Button>
              </CardHeader>
              <CardContent>
                <div className="mb-4 space-y-3">
                  {detail.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-lg border p-3 text-sm ${
                        m.direction === "support" ? "border-primary/30 bg-primary/5" : "border-border bg-muted/40"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-medium">
                          {m.direction === "support" ? "Soporte Zuhma" : m.author_name ?? "Tú"}
                        </span>
                        <span>{fmt(m.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))}
                </div>
                <form onSubmit={sendReply} className="space-y-2">
                  <textarea
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Escribe una respuesta…"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Button type="submit" disabled={busy || !reply.trim()}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null} Responder
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">
              Selecciona un ticket para ver la conversación, o crea uno nuevo.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
