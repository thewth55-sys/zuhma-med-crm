'use client';

// ============================================================
// QuoteBrandingPanel — Settings → Billing.
//
// Controls what appears on a generated quote PDF beyond the line
// items themselves: terms & conditions footer and an accent color for
// the header/totals. The logo itself is NOT edited here — it's the
// same accounts.logo_url set once from Settings → Overview (one
// upload, reused by both the sidebar and the PDF) — this panel links
// there instead of duplicating the upload control.
// ============================================================

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Palette } from 'lucide-react';
import Link from 'next/link';

import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

const DEFAULT_ACCENT = '#4ADE5A';
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function QuoteBrandingPanel() {
  const { account, canManageMembers, refreshProfile } = useAuth();
  const [terms, setTerms] = useState(account?.quote_terms ?? '');
  const [color, setColor] = useState(account?.quote_accent_color ?? DEFAULT_ACCENT);
  const [saving, setSaving] = useState(false);

  if (!account) return null;

  async function save() {
    if (!HEX_RE.test(color)) {
      toast.error('El color debe ser un hex válido, ej. #4ADE5A');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_terms: terms, quote_accent_color: color }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? 'No se pudo guardar');
        return;
      }
      toast.success('Personalización de cotizaciones guardada');
      void refreshProfile();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Palette className="size-4 text-primary" />
          Personalización de cotizaciones
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Cómo se ven tus cotizaciones exportadas en PDF. El logo se toma del que subiste en{' '}
          <Link href="/settings?tab=overview" className="text-primary hover:underline">
            Ajustes → Resumen
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canManageMembers ? (
          <p className="text-sm text-muted-foreground">
            Solo un administrador puede editar esta configuración.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Color de acento</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={HEX_RE.test(color) ? color : DEFAULT_ACCENT}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-muted"
                  aria-label="Color de acento"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder={DEFAULT_ACCENT}
                  maxLength={7}
                  className="h-9 w-28 rounded-md border border-border bg-muted px-2 text-sm font-mono text-foreground"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Términos y condiciones</Label>
              <textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                maxLength={4000}
                rows={5}
                placeholder="Ej. Cotización válida por 15 días. No incluye insumos de terceros..."
                className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Aparece al final de cada cotización exportada en PDF. Déjalo vacío para omitirlo.
              </p>
            </div>

            <Button type="button" size="sm" onClick={save} disabled={saving} className="text-xs">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Guardar
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
