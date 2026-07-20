'use client';

import { useEffect, useState } from 'react';
import { Puck, type Data } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import { toast } from 'sonner';
import { Loader2, ExternalLink, Copy } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { slugify } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { basicConfig } from '@/lib/landing-builder/editor-config';
import { useTranslations } from 'next-intl';

const EMPTY_DATA: Data = { content: [], root: {} };

/**
 * Self-serve landing editor, mounted on its own top-level page
 * (/landing) rather than a Settings tab — it needs the dashboard's
 * full content width for the Puck canvas, which Settings' narrow
 * column doesn't give it. Uses `basicConfig` — a deliberately small
 * block palette — the wider `fullConfig` is only ever used from the
 * staff-only platform-admin editor, not here.
 */
export function LandingPageEditor() {
  const t = useTranslations('Settings.landing');
  const supabase = createClient();
  const { accountId, loading: authLoading } = useAuth();
  const canEdit = useCan('edit-settings');

  const [loading, setLoading] = useState(true);
  const [rowId, setRowId] = useState<string | null>(null);
  const [data, setData] = useState<Data>(EMPTY_DATA);
  const [slug, setSlug] = useState('');
  const [published, setPublished] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    if (authLoading || !accountId) {
      if (!authLoading) setLoading(false);
      return;
    }
    void fetchPage(accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, accountId]);

  async function fetchPage(acctId: string) {
    try {
      setLoading(true);
      const { data: row } = await supabase
        .from('landing_pages')
        .select('id, slug, content, published')
        .eq('account_id', acctId)
        .maybeSingle();
      if (row) {
        setRowId(row.id);
        setSlug(row.slug || '');
        setPublished(row.published);
        setData((row.content as Data) ?? EMPTY_DATA);
      }
    } finally {
      setLoading(false);
    }
  }

  async function persist(next: { content?: Data; slug?: string; published?: boolean }) {
    if (!accountId) return;
    const payload = {
      account_id: accountId,
      tier: 'basic' as const,
      ...(next.content !== undefined ? { content: next.content } : {}),
      ...(next.slug !== undefined ? { slug: slugify(next.slug) || null } : {}),
      ...(next.published !== undefined ? { published: next.published } : {}),
    };
    const { data: saved, error } = await supabase
      .from('landing_pages')
      .upsert(payload, { onConflict: 'account_id' })
      .select('id, slug')
      .single();
    if (error) {
      if (error.code === '23505') toast.error(t('slugTaken'));
      else toast.error(t('saveError'));
      return null;
    }
    setRowId(saved.id);
    return saved;
  }

  async function handleSaveMeta() {
    setSavingMeta(true);
    try {
      const saved = await persist({ slug, published });
      if (saved) {
        setSlug(saved.slug || '');
        toast.success(t('saved'));
      }
    } finally {
      setSavingMeta(false);
    }
  }

  async function handlePublishContent(next: Data) {
    setData(next);
    const saved = await persist({ content: next });
    if (saved) toast.success(t('contentSaved'));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const publicUrl =
    typeof window !== 'undefined' && slug && rowId
      ? `${window.location.origin}/site/${slug}`
      : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">{t('publishLabel')}</p>
              <p className="text-xs text-muted-foreground">{t('publishHint')}</p>
            </div>
            <Switch checked={published} onCheckedChange={setPublished} disabled={!canEdit} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="landing-slug">{t('slugLabel')}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">/site/</span>
              <Input
                id="landing-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>
          {publicUrl && (
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
              <a href={publicUrl} target="_blank" rel="noreferrer" className="flex-1 truncate text-primary hover:underline">
                {publicUrl}
              </a>
              <Button variant="ghost" size="icon" type="button" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success(t('linkCopied')); }}>
                <Copy className="size-4" />
              </Button>
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="icon" type="button">
                  <ExternalLink className="size-4" />
                </Button>
              </a>
            </div>
          )}
          {canEdit && (
            <Button onClick={handleSaveMeta} disabled={savingMeta}>
              {savingMeta ? t('saving') : t('save')}
            </Button>
          )}
        </CardContent>
      </Card>

      {canEdit ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <Puck
            config={basicConfig}
            data={data}
            onPublish={handlePublishContent}
            height="70vh"
            // See admin-landing-editor.tsx's identical option for why:
            // Puck's default srcdoc-iframe canvas has an opaque origin
            // that this app's strict CSP 'self' source can't match,
            // blocking the canvas's own stylesheets. Disabling iframe
            // isolation avoids that entirely (cosmetic-only tradeoff;
            // never affects the published /site/[slug] page).
            iframe={{ enabled: false }}
          />
        </div>
      ) : null}
    </div>
  );
}
