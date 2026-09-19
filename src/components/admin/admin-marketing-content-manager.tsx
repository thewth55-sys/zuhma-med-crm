"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, RotateCcw, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface MarketingContentPiece {
  id: string;
  title: string;
  description: string | null;
  content_type: "reel" | "carrusel" | "historia";
  drive_url: string;
  scheduled_publish_at: string | null;
  status: "pending" | "approved" | "rejected" | "published";
  feedback: string | null;
  compliance_checklist: string[] | null;
  created_at: string;
}

interface TeamMember {
  userId: string;
  email: string | null;
  fullName: string | null;
}

interface Comment {
  id: string;
  author_type: "clinic" | "staff";
  author_name: string;
  body: string;
  created_at: string;
}

const STATUS_STYLES: Record<MarketingContentPiece["status"], string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  rejected: "bg-red-500/10 text-red-600 border-red-500/30",
  published: "bg-muted text-muted-foreground border-border",
};

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

interface AdminMarketingContentManagerProps {
  accountId: string;
  currentExecutiveId: string | null;
}

export function AdminMarketingContentManager({
  accountId,
  currentExecutiveId,
}: AdminMarketingContentManagerProps) {
  const [executiveId, setExecutiveId] = useState(currentExecutiveId ?? "none");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pieces, setPieces] = useState<MarketingContentPiece[]>([]);
  const [loadingPieces, setLoadingPieces] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [commentsOpenFor, setCommentsOpenFor] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    fetch("/api/platform-admin/team")
      .then((res) => res.json())
      .then((data) => setMembers(data.members ?? []))
      .catch((err) => {
        console.error("[AdminMarketingContentManager] team fetch failed:", err);
        toast.error("No se pudo cargar el equipo");
      });

    fetch(`/api/platform-admin/accounts/${accountId}/marketing-content`)
      .then((res) => res.json())
      .then((data) => setPieces((data.pieces ?? []) as MarketingContentPiece[]))
      .catch((err) => {
        console.error("[AdminMarketingContentManager] pieces fetch failed:", err);
        toast.error("No se pudieron cargar las piezas");
      })
      .finally(() => setLoadingPieces(false));
  }, [accountId]);

  async function handleExecutiveChange(value: string) {
    setExecutiveId(value);
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/marketing-executive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executiveId: value === "none" ? null : value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo actualizar la ejecutiva");
        return;
      }
      toast.success("Ejecutiva actualizada");
    } catch (err) {
      console.error("[AdminMarketingContentManager] executive update failed:", err);
      toast.error("No se pudo actualizar la ejecutiva");
    }
  }

  async function handleStatusChange(pieceId: string, status: "pending" | "published") {
    setBusyId(pieceId);
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/marketing-content/${pieceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo actualizar la pieza");
        return;
      }
      setPieces((prev) => prev.map((p) => (p.id === pieceId ? { ...p, ...data.piece } : p)));
      toast.success("Actualizado");
    } catch (err) {
      console.error("[AdminMarketingContentManager] status update failed:", err);
      toast.error("No se pudo actualizar la pieza");
    } finally {
      setBusyId(null);
    }
  }

  async function openComments(pieceId: string) {
    setCommentsOpenFor(pieceId);
    if (comments[pieceId]) return;
    setCommentsLoading(true);
    try {
      const res = await fetch(
        `/api/platform-admin/accounts/${accountId}/marketing-content/${pieceId}/comments`,
      );
      const data = await res.json().catch(() => null);
      setComments((prev) => ({ ...prev, [pieceId]: (data?.comments ?? []) as Comment[] }));
    } catch (err) {
      console.error("[AdminMarketingContentManager] comments fetch failed:", err);
      toast.error("No se pudieron cargar los comentarios");
    } finally {
      setCommentsLoading(false);
    }
  }

  async function handlePostComment() {
    if (!commentsOpenFor || !commentInput.trim()) return;
    setPostingComment(true);
    try {
      const res = await fetch(
        `/api/platform-admin/accounts/${accountId}/marketing-content/${commentsOpenFor}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: commentInput.trim() }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo enviar el comentario");
        return;
      }
      setComments((prev) => ({
        ...prev,
        [commentsOpenFor]: [...(prev[commentsOpenFor] ?? []), data.comment as Comment],
      }));
      setCommentInput("");
    } catch (err) {
      console.error("[AdminMarketingContentManager] comment post failed:", err);
      toast.error("No se pudo enviar el comentario");
    } finally {
      setPostingComment(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Ejecutiva asignada</p>
        <Select value={executiveId} onValueChange={(v) => v && handleExecutiveChange(v)}>
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue placeholder="Selecciona una ejecutiva" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin asignar</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.userId} value={member.userId}>
                {member.fullName ?? member.email ?? member.userId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loadingPieces ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : pieces.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay piezas para esta cuenta.</p>
      ) : (
        <div className="space-y-3">
          {pieces.map((piece) => {
            const isBusy = busyId === piece.id;
            return (
              <Card key={piece.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <span>{piece.title}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[piece.status]}`}
                    >
                      {piece.status}
                    </span>
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {piece.content_type}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {piece.description && (
                    <p className="text-sm text-muted-foreground">{piece.description}</p>
                  )}
                  <a
                    href={piece.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline underline-offset-2"
                  >
                    Ver en Google Drive
                  </a>
                  {piece.compliance_checklist && piece.compliance_checklist.length > 0 && (
                    <ul className="space-y-1">
                      {piece.compliance_checklist.map((item, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  {piece.status === "rejected" && piece.feedback && (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Motivo de la clínica: </span>
                      {piece.feedback}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {piece.status === "approved" && (
                      <Button size="sm" onClick={() => handleStatusChange(piece.id, "published")} disabled={isBusy}>
                        {isBusy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                        Marcar como publicada
                      </Button>
                    )}
                    {piece.status === "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange(piece.id, "pending")}
                        disabled={isBusy}
                      >
                        {isBusy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                        Reabrir para revisión
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openComments(piece.id)}>
                      Ver comentarios
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={commentsOpenFor !== null} onOpenChange={(open) => !open && setCommentsOpenFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Comentarios</DialogTitle>
            <DialogDescription>Conversación con la clínica sobre esta pieza.</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-3 overflow-y-auto">
            {commentsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="size-4 animate-spin text-primary" />
              </div>
            ) : commentsOpenFor && comments[commentsOpenFor]?.length ? (
              comments[commentsOpenFor].map((c) => (
                <div key={c.id} className="space-y-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-foreground">{c.author_name}</span>
                    <span className="text-xs text-muted-foreground">{dateFormatter.format(new Date(c.created_at))}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{c.body}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sin comentarios todavía.</p>
            )}
          </div>
          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col">
            <Textarea
              value={commentInput}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setCommentInput(e.target.value)}
              placeholder="Escribe un comentario para la clínica…"
              rows={2}
            />
            <Button onClick={handlePostComment} disabled={postingComment || !commentInput.trim()}>
              {postingComment ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
