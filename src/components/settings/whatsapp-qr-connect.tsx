'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, LogOut, QrCode, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type ConnectionState = 'idle' | 'awaiting_scan' | 'connected' | 'disconnected' | 'logged_out';

interface QrStatus {
  configured: boolean;
  connection_state?: ConnectionState;
  qr_code?: string | null;
  qr_code_expires_at?: string | null;
  connected_phone?: string | null;
  last_disconnect_reason?: string | null;
}

// Polled while a pairing is in flight so the QR on screen never goes
// stale without the user noticing (Baileys rotates it roughly every
// 60s — see services/wa-qr-gateway/src/sessions.ts's QR_EXPIRY_MS).
// Slower once connected: nothing to catch except an unexpected drop.
const POLL_MS_PAIRING = 3000;
const POLL_MS_CONNECTED = 15000;

/**
 * Shown once an account has accepted the QR risk disclosure (see
 * whatsapp-provider-picker.tsx). Owns connect / disconnect and renders
 * whatever services/wa-qr-gateway/ last reported through
 * GET /api/whatsapp/qr/status.
 */
export function WhatsAppQrConnect({ onDisconnected }: { onDisconnected?: () => void }) {
  const t = useTranslations('Settings.whatsapp.qr');
  const [status, setStatus] = useState<QrStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async (): Promise<QrStatus | null> => {
    try {
      const res = await fetch('/api/whatsapp/qr/status');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'status check failed');
      setStatus(data);
      return data as QrStatus;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const data = await fetchStatus();
      if (cancelled) return;
      const delay = data?.connection_state === 'connected' ? POLL_MS_CONNECTED : POLL_MS_PAIRING;
      pollRef.current = setTimeout(tick, delay);
    };
    void tick();

    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [fetchStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/whatsapp/qr/connect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'connect failed');
      await fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('connectError'));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/whatsapp/qr/disconnect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'disconnect failed');
      await fetchStatus();
      onDisconnected?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('disconnectError'));
    } finally {
      setDisconnecting(false);
    }
  };

  const state = status?.connection_state ?? 'idle';

  return (
    <div className="space-y-4">
      <Alert className="bg-amber-950/30 border-amber-700/50">
        <AlertTitle className="text-amber-400">{t('unofficialBannerTitle')}</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          {t('unofficialBannerDesc')}
        </AlertDescription>
      </Alert>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="size-5" />
            {t('title')}
          </CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'connected' && (
            <Alert className="bg-emerald-950/30 border-emerald-700/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <AlertTitle className="text-emerald-400 mb-0">{t('connected')}</AlertTitle>
              </div>
              <AlertDescription className="text-muted-foreground">
                {status?.connected_phone
                  ? t('connectedDescWithPhone', { phone: status.connected_phone })
                  : t('connectedDesc')}
              </AlertDescription>
            </Alert>
          )}

          {(state === 'idle' || state === 'disconnected' || state === 'logged_out') && (
            <div className="space-y-3">
              {status?.last_disconnect_reason && (
                <Alert className="bg-card border-border">
                  <AlertDescription className="text-muted-foreground text-sm">
                    {t('lastDisconnectReason', { reason: status.last_disconnect_reason })}
                  </AlertDescription>
                </Alert>
              )}
              <Button onClick={handleConnect} disabled={connecting}>
                {connecting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('connecting')}
                  </>
                ) : (
                  <>
                    <QrCode className="size-4" />
                    {t('showQrButton')}
                  </>
                )}
              </Button>
            </div>
          )}

          {state === 'awaiting_scan' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('scanInstructions')}</p>
              {status?.qr_code ? (
                <div className="flex justify-center rounded-lg border border-border bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- gateway-rendered data: URL, not a Next-optimizable remote asset */}
                  <img src={status.qr_code} alt={t('qrCodeAlt')} width={280} height={280} />
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t('waitingForCode')}
                </div>
              )}
              <Button variant="outline" onClick={handleConnect} disabled={connecting}>
                <RefreshCw className="size-4" />
                {t('generateNewCode')}
              </Button>
            </div>
          )}

          {state === 'connected' && (
            <Button variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('disconnecting')}
                </>
              ) : (
                <>
                  <LogOut className="size-4" />
                  {t('disconnectButton')}
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
