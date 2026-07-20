'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { slugify } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslations } from 'next-intl';

/**
 * "Agenda de citas online 24/7" — every /pricing tier (including the
 * free trial) advertises this, so unlike automations/broadcasts/etc.
 * it's not plan-gated. Publishes the account's public booking page at
 * /agendar/[slug]. RLS already lets admin+ update their own `accounts`
 * row (migration 017), so this saves straight through the browser
 * client like the rest of this settings family — no bespoke API route.
 */
export function PublicBookingSettings() {
  const t = useTranslations('Settings.scheduling.publicBooking');
  const supabase = createClient();
  const { accountId, loading: authLoading } = useAuth();
  const canEdit = useCan('edit-settings');

  const [loading, setLoading] = useState(true);
  const [accountName, setAccountName] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [slug, setSlug] = useState('');
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!accountId) {
      setLoading(false);
      return;
    }
    void fetchAccount(accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, accountId]);

  async function fetchAccount(acctId: string) {
    try {
      setLoading(true);
      const { data } = await supabase
        .from('accounts')
        .select('name, public_booking_slug, public_booking_enabled')
        .eq('id', acctId)
        .single();
      if (data) {
        setAccountName(data.name);
        setEnabled(data.public_booking_enabled ?? false);
        setSlug(data.public_booking_slug || slugify(data.name));
        setSavedSlug(data.public_booking_slug ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!accountId) return;
    const cleanSlug = slugify(slug);
    if (!cleanSlug) {
      toast.error(t('slugRequired'));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('accounts')
        .update({ public_booking_slug: cleanSlug, public_booking_enabled: enabled })
        .eq('id', accountId);
      if (error) {
        if (error.code === '23505') {
          toast.error(t('slugTaken'));
        } else {
          toast.error(t('saveError'));
        }
        return;
      }
      setSlug(cleanSlug);
      setSavedSlug(cleanSlug);
      toast.success(t('saved'));
    } finally {
      setSaving(false);
    }
  }

  const publicUrl =
    typeof window !== 'undefined' && savedSlug
      ? `${window.location.origin}/agendar/${savedSlug}`
      : savedSlug
        ? `/agendar/${savedSlug}`
        : null;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">{t('enableLabel')}</p>
            <p className="text-xs text-muted-foreground">{t('enableHint')}</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="public-booking-slug">{t('slugLabel')}</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">/agendar/</span>
            <Input
              id="public-booking-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={!canEdit}
              placeholder={slugify(accountName)}
            />
          </div>
        </div>

        {publicUrl && (
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 truncate text-primary hover:underline"
            >
              {publicUrl}
            </a>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(publicUrl);
                toast.success(t('linkCopied'));
              }}
            >
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
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
