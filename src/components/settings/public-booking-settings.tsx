'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, ExternalLink, ImagePlus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { slugify } from '@/lib/utils';
import { uploadAccountMedia, MEDIA_MAX_BYTES_BY_KIND } from '@/lib/storage/upload-media';
import type { BookingPageConfig } from '@/lib/scheduling/public-booking';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

  // Personalización link-in-bio (accounts.booking_page).
  const [page, setPage] = useState<BookingPageConfig>({});
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  function setPageField<K extends keyof BookingPageConfig>(key: K, value: BookingPageConfig[K]) {
    setPage((prev) => ({ ...prev, [key]: value }));
  }
  function setContactField(key: string, value: string) {
    setPage((prev) => ({ ...prev, contact: { ...(prev.contact ?? {}), [key]: value } }));
  }
  function setSocialField(key: string, value: string) {
    setPage((prev) => ({ ...prev, social: { ...(prev.social ?? {}), [key]: value } }));
  }

  async function handleCoverFile(file: File) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Usa una imagen PNG, JPEG o WebP');
      return;
    }
    if (file.size > MEDIA_MAX_BYTES_BY_KIND.image) {
      toast.error('La imagen debe pesar 5 MB o menos');
      return;
    }
    setUploadingCover(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      setPageField('coverImageUrl', publicUrl);
      toast.success('Portada subida — recuerda guardar');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir la portada');
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  }

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
        .select('name, public_booking_slug, public_booking_enabled, booking_page')
        .eq('id', acctId)
        .single();
      if (data) {
        setAccountName(data.name);
        setEnabled(data.public_booking_enabled ?? false);
        setSlug(data.public_booking_slug || slugify(data.name));
        setSavedSlug(data.public_booking_slug ?? null);
        setPage((data.booking_page as BookingPageConfig | null) ?? {});
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
        .update({ public_booking_slug: cleanSlug, public_booking_enabled: enabled, booking_page: page })
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

        {/* Personalización estilo link-in-bio */}
        <div className="space-y-4 border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">Personalización de la página</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Color de acento</Label>
              <input
                type="color"
                value={page.accentColor || '#F94B5A'}
                onChange={(e) => setPageField('accentColor', e.target.value)}
                disabled={!canEdit}
                className="h-9 w-full cursor-pointer rounded-md border border-border bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Color de portada</Label>
              <input
                type="color"
                value={page.coverColor || page.accentColor || '#F94B5A'}
                onChange={(e) => setPageField('coverColor', e.target.value)}
                disabled={!canEdit}
                className="h-9 w-full cursor-pointer rounded-md border border-border bg-transparent"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Imagen de portada (opcional)</Label>
              <div className="flex items-center gap-2">
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleCoverFile(f);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canEdit || uploadingCover}
                  onClick={() => coverInputRef.current?.click()}
                >
                  {uploadingCover ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                  {page.coverImageUrl ? 'Cambiar' : 'Subir'}
                </Button>
                {page.coverImageUrl ? (
                  <button
                    type="button"
                    onClick={() => setPageField('coverImageUrl', null)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Quitar portada"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Título</Label>
              <Input
                value={page.headline ?? ''}
                onChange={(e) => setPageField('headline', e.target.value)}
                disabled={!canEdit}
                placeholder={accountName}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Subtítulo</Label>
              <Input
                value={page.tagline ?? ''}
                onChange={(e) => setPageField('tagline', e.target.value)}
                disabled={!canEdit}
                placeholder="Fisioterapia y rehabilitación · CDMX"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Bio / presentación</Label>
            <Textarea
              value={page.bio ?? ''}
              onChange={(e) => setPageField('bio', e.target.value)}
              disabled={!canEdit}
              className="min-h-[60px]"
              placeholder="Agenda tu cita en línea en segundos. Atención personalizada, sin llamadas ni esperas."
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">WhatsApp</Label>
              <Input
                value={page.contact?.whatsapp ?? ''}
                onChange={(e) => setContactField('whatsapp', e.target.value)}
                disabled={!canEdit}
                placeholder="+52 55 1234 5678"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Teléfono</Label>
              <Input
                value={page.contact?.phone ?? ''}
                onChange={(e) => setContactField('phone', e.target.value)}
                disabled={!canEdit}
                placeholder="+52 55 1234 5678"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Correo</Label>
              <Input
                value={page.contact?.email ?? ''}
                onChange={(e) => setContactField('email', e.target.value)}
                disabled={!canEdit}
                placeholder="contacto@clinica.com"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Link de mapa (opcional)</Label>
              <Input
                value={page.contact?.mapUrl ?? ''}
                onChange={(e) => setContactField('mapUrl', e.target.value)}
                disabled={!canEdit}
                placeholder="https://maps.google.com/…"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Instagram</Label>
              <Input value={page.social?.instagram ?? ''} onChange={(e) => setSocialField('instagram', e.target.value)} disabled={!canEdit} placeholder="https://instagram.com/…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Facebook</Label>
              <Input value={page.social?.facebook ?? ''} onChange={(e) => setSocialField('facebook', e.target.value)} disabled={!canEdit} placeholder="https://facebook.com/…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">TikTok</Label>
              <Input value={page.social?.tiktok ?? ''} onChange={(e) => setSocialField('tiktok', e.target.value)} disabled={!canEdit} placeholder="https://tiktok.com/@…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Sitio web</Label>
              <Input value={page.social?.web ?? ''} onChange={(e) => setSocialField('web', e.target.value)} disabled={!canEdit} placeholder="https://…" />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={page.showServices !== false} onCheckedChange={(v) => setPageField('showServices', v)} disabled={!canEdit} />
              Mostrar servicios
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={page.showAddress !== false} onCheckedChange={(v) => setPageField('showAddress', v)} disabled={!canEdit} />
              Mostrar dirección
            </label>
          </div>
        </div>

        {canEdit && (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
