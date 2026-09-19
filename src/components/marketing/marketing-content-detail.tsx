"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Heart, Loader2, MessageCircle, Send, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type ContentType = "reel" | "carrusel" | "historia";
type PieceStatus = "pending" | "approved" | "rejected" | "published";

interface MarketingContentPiece {
  id: string;
  title: string;
  description: string | null;
  content_type: ContentType;
  drive_url: string;
  scheduled_publish_at: string | null;
  status: PieceStatus;
  feedback: string | null;
  compliance_checklist: string[] | null;
  created_at: string;
}

interface Comment {
  id: string;
  author_type: "clinic" | "staff";
  author_name: string;
  body: string;
  created_at: string;
}

function driveEmbedUrl(driveUrl: string): string | null {
  const match = driveUrl.match(/\/file\/d\/([^/]+)/);
  return match ? `https://drive.google.com/file/d/${match[1]}/preview` : null;
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const scheduleFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });

interface MarketingContentDetailProps {
  pieceId: string;
}

export function MarketingContentDetail({ pieceId }: MarketingContentDetailProps) {
  const t = useTranslations("Marketing.content");
  const router = useRouter();

  const [piece, setPiece] = useState<MarketingContentPiece | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    async function fetchPiece() {
      try {
        const res = await fetch(`/api/marketing-content-pieces/${pieceId}`);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setPiece(data.piece as MarketingContentPiece);
      } catch (err) {
        console.error("[MarketingContentDetail] fetch piece failed:", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    async function fetchComments() {
      try {
        const res = await fetch(`/api/marketing-content-pieces/${pieceId}/comments`);
        const data = await res.json().catch(() => null);
        setComments((data?.comments ?? []) as Comment[]);
      } catch (err) {
        console.error("[MarketingContentDetail] fetch comments failed:", err);
      }
    }
    void fetchPiece();
    void fetchComments();
  }, [pieceId]);

  function goBack() {
    router.push("/marketing/content");
  }

  async function handleApprove() {
    setDecisionBusy(true);
    try {
      const res = await fetch(`/api/marketing-content-pieces/${pieceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? t("actions.error"));
        return;
      }
      setPiece((prev) => (prev ? { ...prev, ...data.piece } : prev));
      toast.success(t("actions.success"));
    } catch (err) {
      console.error("[MarketingContentDetail] approve failed:", err);
      toast.error(t("actions.error"));
    } finally {
      setDecisionBusy(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      toast.error(t("errors.reasonRequired"));
      return;
    }
    setDecisionBusy(true);
    try {
      const res = await fetch(`/api/marketing-content-pieces/${pieceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", feedback: rejectReason.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? t("actions.error"));
        return;
      }
      setPiece((prev) => (prev ? { ...prev, ...data.piece } : prev));
      toast.success(t("actions.success"));
      setRejectOpen(false);
      setRejectReason("");
    } catch (err) {
      console.error("[MarketingContentDetail] reject failed:", err);
      toast.error(t("actions.error"));
    } finally {
      setDecisionBusy(false);
    }
  }

  async function handlePostComment() {
    if (!commentText.trim()) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/marketing-content-pieces/${pieceId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentText.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? t("actions.error"));
        return;
      }
      setComments((prev) => [...prev, data.comment as Comment]);
      setCommentText("");
    } catch (err) {
      console.error("[MarketingContentDetail] comment failed:", err);
      toast.error(t("actions.error"));
    } finally {
      setPostingComment(false);
    }
  }

  const backLink = (
    <button
      onClick={goBack}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> {t("detail.back")}
    </button>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {backLink}
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (notFound || !piece) {
    return (
      <div className="space-y-4">
        {backLink}
        <p className="text-sm text-muted-foreground">{t("detail.notFound")}</p>
      </div>
    );
  }

  const embedUrl = driveEmbedUrl(piece.drive_url);

  return (
    <div className="space-y-4">
      {backLink}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-6">
              <div className="flex w-full max-w-xs items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                  TC
                </div>
                <span className="text-sm font-semibold text-foreground">{t("detail.previewAccount")}</span>
              </div>
              <div className="w-full max-w-xs space-y-1.5">
                {embedUrl && (
                  <iframe
                    src={embedUrl}
                    className="aspect-video w-full rounded-lg border border-border"
                    allow="autoplay"
                  />
                )}
                <a
                  href={piece.drive_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-primary underline underline-offset-2"
                >
                  {t("viewOnDrive")}
                </a>
              </div>
              <div className="flex w-full max-w-xs items-center gap-4 text-muted-foreground">
                <Heart className="size-5" />
                <MessageCircle className="size-5" />
                <Share2 className="size-5" />
              </div>
              <div className="w-full max-w-xs space-y-1">
                <p className="text-sm font-semibold text-foreground">{piece.title}</p>
                {piece.description && <p className="text-sm text-muted-foreground">{piece.description}</p>}
              </div>
            </CardContent>
          </Card>

          {piece.compliance_checklist && piece.compliance_checklist.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("detail.complianceTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2">
                  {piece.compliance_checklist.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">{t("detail.complianceNote")}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {piece.status === "pending" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("detail.decisionTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full" onClick={handleApprove} disabled={decisionBusy}>
                  {decisionBusy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  {t("actions.approve")}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setRejectOpen(true)}
                  disabled={decisionBusy}
                >
                  {t("actions.reject")}
                </Button>
                {piece.scheduled_publish_at && (
                  <p className="pt-1 text-xs text-muted-foreground">
                    {t("detail.scheduledNotice", {
                      date: scheduleFormatter.format(new Date(piece.scheduled_publish_at)),
                    })}
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="space-y-1 py-4">
                <p className="text-sm font-medium text-foreground">{t(`statusValues.${piece.status}`)}</p>
                {piece.status === "rejected" && piece.feedback && (
                  <p className="text-sm text-muted-foreground">{piece.feedback}</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("detail.commentsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("detail.noComments")}</p>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="space-y-0.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-foreground">{c.author_name}</span>
                        <span className="text-xs text-muted-foreground">{dateTimeFormatter.format(new Date(c.created_at))}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={t("detail.commentPlaceholder")}
                  rows={2}
                />
                <Button size="sm" onClick={handlePostComment} disabled={postingComment || !commentText.trim()}>
                  {postingComment ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {t("actions.submit")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={rejectOpen} onOpenChange={(open) => !open && setRejectOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("dialogs.rejectTitle")}</DialogTitle>
            <DialogDescription>{t("dialogs.rejectDescription")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t("detail.rejectPlaceholder")}
            required
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={decisionBusy}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={handleReject} disabled={decisionBusy}>
              {decisionBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("actions.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
