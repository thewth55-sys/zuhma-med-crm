"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DemoAccount {
  id: string;
  name: string;
  isDemo: boolean;
}
interface ThreadMessage {
  id: string;
  senderType: string;
  text: string | null;
  contentType: string;
  createdAt: string;
}

const timeFmt = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });

/**
 * Simulador de cliente para demos de ventas. Actúa como el "teléfono del
 * paciente": escribes como el cliente (→ entra en vivo a la bandeja del
 * CRM que estés impersonando) y ves las respuestas del agente por polling
 * (el admin no es miembro de la cuenta demo, así que no hay Realtime
 * directo aquí). Solo funciona con cuentas demo.
 */
export default function DemoSimulatorPage() {
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [phone, setPhone] = useState("+525550000199");
  const [name, setName] = useState("Paciente demo");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/platform-admin/accounts", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        const demo = ((body?.accounts ?? []) as DemoAccount[]).filter((a) => a.isDemo);
        setAccounts(demo);
        if (demo[0]) setAccountId(demo[0].id);
      } catch {
        toast.error("No se pudieron cargar las cuentas demo");
      }
    })();
  }, []);

  const loadThread = useCallback(async () => {
    if (!accountId || !phone.trim()) return;
    try {
      const params = new URLSearchParams({ accountId, phone: phone.trim() });
      const res = await fetch(`/api/platform-admin/demo/thread?${params}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (res.ok) setMessages(body.messages ?? []);
    } catch {
      // silencioso — es polling
    }
  }, [accountId, phone]);

  // Polling del hilo (ve respuestas del agente/IA en vivo).
  useEffect(() => {
    setMessages([]);
    if (!accountId || !phone.trim()) return;
    void loadThread();
    const t = setInterval(() => void loadThread(), 2500);
    return () => clearInterval(t);
  }, [accountId, phone, loadThread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    if (!accountId || !phone.trim() || !text.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/platform-admin/demo/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, phone: phone.trim(), name: name.trim(), text: text.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "No se pudo enviar");
      setText("");
      await loadThread();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Smartphone className="size-5 text-primary" /> Simulador de cliente
        </h1>
        <p className="text-sm text-muted-foreground">
          Escribe como el paciente para demostrar la recepción en vivo. Impersona la cuenta demo en
          otra pestaña para responder desde el CRM. Solo cuentas demo.
        </p>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          No hay cuentas demo. Crea una desde <strong>Cuentas → Cuenta demo</strong>.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Cuenta demo</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-muted px-2 text-sm text-foreground"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Paciente (nombre)</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Teléfono</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9" />
            </div>
          </div>

          {/* Chat estilo teléfono */}
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-medium text-foreground">
              {name || phone} · {phone}
            </div>
            <div ref={scrollRef} className="h-[380px] space-y-2 overflow-y-auto bg-background/50 p-4">
              {messages.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Aún no hay mensajes. Escribe abajo para iniciar.
                </p>
              ) : (
                messages.map((m) => {
                  const isCustomer = m.senderType === "customer";
                  return (
                    <div key={m.id} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-sm ${
                          isCustomer
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.text ?? `[${m.contentType}]`}</p>
                        <p className={`mt-0.5 text-[10px] ${isCustomer ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {isCustomer ? "Paciente" : "Agente"} · {timeFmt.format(new Date(m.createdAt))}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-border p-2">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Escribe como el paciente…"
                className="h-10"
              />
              <Button onClick={send} disabled={sending || !text.trim()} className="h-10">
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
