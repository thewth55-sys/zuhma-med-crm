"use client";

import { useEffect, useState } from "react";
import { Puck, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { toast } from "sonner";
import { Loader2, ExternalLink, Copy } from "lucide-react";

import { slugify } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fullConfig } from "@/lib/landing-builder/editor-config";

const EMPTY_DATA: Data = { content: [], root: {} };

/**
 * Staff-only editor for a client's landing page, using `fullConfig`
 * (the wider block palette) — reached from Admin → Cuentas → Acciones
 * → "Editar landing". See /api/platform-admin/accounts/[accountId]/landing.
 */
export function AdminLandingEditor({ accountId }: { accountId: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Data>(EMPTY_DATA);
  const [slug, setSlug] = useState("");
  const [published, setPublished] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/platform-admin/accounts/${accountId}/landing`);
      const body = await res.json().catch(() => null);
      if (res.ok && body?.page) {
        setSlug(body.page.slug || "");
        setPublished(body.page.published);
        setData((body.page.content as Data) ?? EMPTY_DATA);
      }
    } finally {
      setLoading(false);
    }
  }

  async function save(next: { content?: Data; slug?: string; published?: boolean }) {
    const res = await fetch(`/api/platform-admin/accounts/${accountId}/landing`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(body?.error || "No se pudo guardar");
      return null;
    }
    return body.page as { id: string; slug: string | null; published: boolean };
  }

  async function handleSaveMeta() {
    setSavingMeta(true);
    try {
      const saved = await save({ slug: slugify(slug), published });
      if (saved) {
        setSlug(saved.slug || "");
        toast.success("Guardado");
      }
    } finally {
      setSavingMeta(false);
    }
  }

  async function handlePublishContent(next: Data) {
    setData(next);
    const saved = await save({ content: next });
    if (saved) toast.success("Contenido guardado");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const publicUrl = typeof window !== "undefined" && slug ? `${window.location.origin}/site/${slug}` : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Publicación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground">Publicar página</p>
            <Switch checked={published} onCheckedChange={setPublished} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-landing-slug">Dirección</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">/site/</span>
              <Input id="admin-landing-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
          </div>
          {publicUrl && (
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
              <a href={publicUrl} target="_blank" rel="noreferrer" className="flex-1 truncate text-primary hover:underline">
                {publicUrl}
              </a>
              <Button variant="ghost" size="icon" type="button" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Enlace copiado"); }}>
                <Copy className="size-4" />
              </Button>
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="icon" type="button">
                  <ExternalLink className="size-4" />
                </Button>
              </a>
            </div>
          )}
          <Button onClick={handleSaveMeta} disabled={savingMeta}>
            {savingMeta ? "Guardando..." : "Guardar"}
          </Button>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border border-border">
        <Puck
          config={fullConfig}
          data={data}
          onPublish={handlePublishContent}
          height="70vh"
          // Puck's default live-preview canvas renders inside a srcdoc
          // iframe, which has an opaque/null origin — this app's CSP
          // 'self' source doesn't match anything loaded from inside
          // it, so the canvas's own stylesheets (including its Inter
          // font CDN reference) get blocked. Disabling iframe
          // isolation renders the canvas directly in the main
          // document instead — same CSP context, no more violations.
          // Cosmetic-only tradeoff (this editor's own chrome styles
          // can now bleed into the live-preview canvas); the actual
          // published page at /site/[slug] never uses this editor.
          iframe={{ enabled: false }}
        />
      </div>
    </div>
  );
}
