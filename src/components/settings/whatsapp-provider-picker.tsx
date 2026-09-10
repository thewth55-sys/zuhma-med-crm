'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2, MessageCircle, QrCode, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { WhatsAppEmbeddedSignupButton } from '@/components/settings/whatsapp-embedded-signup-button';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { WhatsAppQrConnect } from '@/components/settings/whatsapp-qr-connect';

type Provider = 'cloud_api' | 'qr';

/**
 * Entry point for the WhatsApp settings tab. Phase 1 keeps this to one
 * active line at a time (see the Fase 1 plan) — coexisting cloud_api +
 * qr rows is schema-ready but not yet surfaced here. Decides what to
 * render from which whatsapp_config row(s) already exist:
 *   - a cloud_api row  → the existing WABA setup (unchanged)
 *   - a qr row         → the QR connect/status panel
 *   - neither          → this picker, so a new account chooses
 */
export function WhatsAppProviderPicker() {
  const t = useTranslations('Settings.whatsapp.picker');
  const { accountId } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [showRiskDialog, setShowRiskDialog] = useState(false);
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [acceptingRisk, setAcceptingRisk] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('whatsapp_config')
        .select('provider')
        .eq('account_id', accountId);
      if (cancelled) return;
      setProviders((data ?? []).map((r: { provider: Provider }) => r.provider));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch keyed on accountId only; supabase client is stable
  }, [accountId]);

  const handleAcceptRisk = async () => {
    setAcceptingRisk(true);
    try {
      const res = await fetch('/api/whatsapp/qr/accept-risk', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed to accept risk disclosure');
      setProviders((prev) => [...prev, 'qr']);
      setShowRiskDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('acceptRiskError'));
    } finally {
      setAcceptingRisk(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t('loading')}
      </div>
    );
  }

  if (providers.includes('cloud_api')) {
    return (
      <div className="space-y-4">
        <WhatsAppEmbeddedSignupButton />
        <WhatsAppConfig />
      </div>
    );
  }

  if (providers.includes('qr')) {
    return <WhatsAppQrConnect onDisconnected={() => setProviders((prev) => prev.filter((p) => p !== 'qr'))} />;
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              {t('wabaTitle')}
            </CardTitle>
            <CardDescription>{t('wabaDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <WhatsAppEmbeddedSignupButton />
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="size-5" />
              {t('qrTitle')}
            </CardTitle>
            <CardDescription>{t('qrDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setShowRiskDialog(true)}>
              <QrCode className="size-4" />
              {t('qrConnectButton')}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Falls back to the manual/advanced credentials form for accounts
          that want it without going through Embedded Signup — same
          component the picker's WABA card already renders. */}
      <div className="mt-4">
        <WhatsAppConfig />
      </div>

      <Dialog open={showRiskDialog} onOpenChange={setShowRiskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              {t('riskDialogTitle')}
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2 text-left">
              <span className="block">{t('riskDialogUnofficial')}</span>
              <span className="block">{t('riskDialogBanRisk')}</span>
              <span className="block">{t('riskDialogLimitedFeatures')}</span>
              <span className="block font-medium text-foreground">{t('riskDialogRecommendation')}</span>
            </DialogDescription>
          </DialogHeader>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={riskAccepted}
              onCheckedChange={(checked) => setRiskAccepted(checked === true)}
            />
            <span>{t('riskDialogCheckboxLabel')}</span>
          </label>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRiskDialog(false)}>
              {t('riskDialogCancel')}
            </Button>
            <Button onClick={handleAcceptRisk} disabled={!riskAccepted || acceptingRisk}>
              {acceptingRisk ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('riskDialogConfirming')}
                </>
              ) : (
                <>
                  <MessageCircle className="size-4" />
                  {t('riskDialogConfirm')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
