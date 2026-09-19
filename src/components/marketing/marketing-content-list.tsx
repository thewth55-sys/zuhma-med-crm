"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  created_at: string;
}

const THUMBNAIL_STYLES: Record<ContentType, string> = {
  reel: "bg-gradient-to-br from-emerald-100 to-teal-200",
  carrusel: "bg-gradient-to-br from-emerald-100 to-emerald-200",
  historia: "bg-gradient-to-br from-violet-100 to-violet-200",
};

const STATUS_BADGE_STYLES: Record<PieceStatus, string> = {
  pending: "bg-amber-500 text-white",
  approved: "bg-emerald-500 text-white",
  rejected: "bg-red-500 text-white",
  published: "bg-muted-foreground text-white",
};

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function MarketingContentList() {
  const t = useTranslations("Marketing.content");
  const router = useRouter();

  const [pieces, setPieces] = useState<MarketingContentPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PieceStatus>("pending");

  useEffect(() => {
    async function fetchPieces() {
      try {
        const res = await fetch("/api/marketing-content-pieces");
        const data = await res.json().catch(() => null);
        setPieces((data?.pieces ?? []) as MarketingContentPiece[]);
      } catch (err) {
        console.error("[MarketingContentList] fetch failed:", err);
      } finally {
        setLoading(false);
      }
    }
    void fetchPieces();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  const pending = pieces
    .filter((p) => p.status === "pending")
    .sort((a, b) => {
      if (!a.scheduled_publish_at) return 1;
      if (!b.scheduled_publish_at) return -1;
      return new Date(a.scheduled_publish_at).getTime() - new Date(b.scheduled_publish_at).getTime();
    });
  const approved = pieces.filter((p) => p.status === "approved");
  const rejected = pieces.filter((p) => p.status === "rejected");
  const published = pieces.filter((p) => p.status === "published");

  const groups: Record<PieceStatus, MarketingContentPiece[]> = { pending, approved, rejected, published };
  const emptyKeys: Record<PieceStatus, string> = {
    pending: "empty.pending",
    approved: "empty.approved",
    rejected: "empty.rejected",
    published: "empty.published",
  };
  const actionKeys: Record<PieceStatus, string> = {
    pending: "actions.review",
    approved: "actions.view",
    rejected: "actions.viewNote",
    published: "actions.view",
  };

  function renderGrid(items: MarketingContentPiece[], status: PieceStatus) {
    if (items.length === 0) {
      return <p className="py-6 text-sm text-muted-foreground">{t(emptyKeys[status])}</p>;
    }
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((piece) => (
          <Card
            key={piece.id}
            onClick={() => router.push(`/marketing/content/${piece.id}`)}
            className="cursor-pointer overflow-hidden"
          >
            <div className={`relative h-32 ${THUMBNAIL_STYLES[piece.content_type]}`}>
              <span className="absolute top-2 left-2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-foreground">
                {piece.content_type.toUpperCase()}
              </span>
              <span
                className={`absolute top-2 right-2 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${STATUS_BADGE_STYLES[piece.status]}`}
              >
                {t(`statusValues.${piece.status}`)}
              </span>
            </div>
            <CardContent className="space-y-1.5">
              <p className="font-semibold text-foreground">{piece.title}</p>
              {piece.description && (
                <p className="line-clamp-2 text-sm text-muted-foreground">{piece.description}</p>
              )}
              <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                <span className="text-muted-foreground">
                  {piece.status === "published"
                    ? dateFormatter.format(new Date(piece.created_at))
                    : piece.scheduled_publish_at
                      ? dateFormatter.format(new Date(piece.scheduled_publish_at))
                      : ""}
                </span>
                <span className="font-medium text-foreground">{t(actionKeys[status])}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeTab === "pending" && pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <span className="text-sm font-medium text-foreground">
            {t("banner.title", { count: pending.length })}
          </span>
          <Button size="sm" className="ml-auto" onClick={() => router.push(`/marketing/content/${pending[0].id}`)}>
            {t("banner.cta")}
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => v && setActiveTab(v as PieceStatus)}>
        <TabsList>
          <TabsTrigger value="pending">{t("tabs.pending")} ({groups.pending.length})</TabsTrigger>
          <TabsTrigger value="approved">{t("tabs.approved")} ({groups.approved.length})</TabsTrigger>
          <TabsTrigger value="rejected">{t("tabs.rejected")} ({groups.rejected.length})</TabsTrigger>
          <TabsTrigger value="published">{t("tabs.published")} ({groups.published.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">{renderGrid(pending, "pending")}</TabsContent>
        <TabsContent value="approved">{renderGrid(approved, "approved")}</TabsContent>
        <TabsContent value="rejected">{renderGrid(rejected, "rejected")}</TabsContent>
        <TabsContent value="published">{renderGrid(published, "published")}</TabsContent>
      </Tabs>
    </div>
  );
}
