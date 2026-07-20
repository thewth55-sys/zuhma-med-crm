'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';
import { MetaAdsEmbeddedSignupButton } from './meta-ads-embedded-signup-button';

const MASKED_TOKEN = '••••••••••••••••';

interface ConversionConfig {
  meta_pixel_id: string | null;
  meta_test_event_code: string | null;
  meta_track_lead_created: boolean;
  meta_track_deal_won: boolean;
  meta_track_first_reply: boolean;
  meta_track_automations: boolean;
  google_ads_conversion_id: string | null;
  google_ads_lead_created_label: string | null;
  google_ads_deal_won_label: string | null;
  google_ads_first_reply_label: string | null;
  has_token: boolean;
}

export function ConversionTrackingConfig() {
  const t = useTranslations('Settings.conversions');
  const { accountId, accountRole, loading: authLoading, profileLoading } = useAuth();
  const canEdit = accountRole ? canEditSettings(accountRole) : false;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [hasStoredToken, setHasStoredToken] = useState(false);
  const [tokenEdited, setTokenEdited] = useState(false);
  const loadedAccountIdRef = useRef<string | null>(null);

  const [metaPixelId, setMetaPixelId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaTestEventCode, setMetaTestEventCode] = useState('');
  const [trackLeadCreated, setTrackLeadCreated] = useState(false);
  const [trackDealWon, setTrackDealWon] = useState(false);
  const [trackFirstReply, setTrackFirstReply] = useState(false);
  const [trackAutomations, setTrackAutomations] = useState(false);
  const [googleConversionId, setGoogleConversionId] = useState('');
  const [googleLeadLabel, setGoogleLeadLabel] = useState('');
  const [googleDealWonLabel, setGoogleDealWonLabel] = useState('');
  const [googleFirstReplyLabel, setGoogleFirstReplyLabel] = useState('');

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/conversions/config');
      const payload = await res.json();
      const config: ConversionConfig | null = payload.config ?? null;

      if (config) {
        setMetaPixelId(config.meta_pixel_id ?? '');
        setMetaTestEventCode(config.meta_test_event_code ?? '');
        setTrackLeadCreated(config.meta_track_lead_created);
        setTrackDealWon(config.meta_track_deal_won);
        setTrackFirstReply(config.meta_track_first_reply);
        setTrackAutomations(config.meta_track_automations);
        setGoogleConversionId(config.google_ads_conversion_id ?? '');
        setGoogleLeadLabel(config.google_ads_lead_created_label ?? '');
        setGoogleDealWonLabel(config.google_ads_deal_won_label ?? '');
        setGoogleFirstReplyLabel(config.google_ads_first_reply_label ?? '');
        setHasStoredToken(config.has_token);
        setMetaAccessToken(config.has_token ? MASKED_TOKEN : '');
      }
      setTokenEdited(false);
    } catch (err) {
      console.error('fetchConfig error:', err);
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!accountId) {
      setLoading(false);
      return;
    }
    if (loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    fetchConfig();
  }, [authLoading, profileLoading, accountId, fetchConfig]);

  async function handleSave() {
    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        meta_pixel_id: metaPixelId,
        meta_test_event_code: metaTestEventCode,
        meta_track_lead_created: trackLeadCreated,
        meta_track_deal_won: trackDealWon,
        meta_track_first_reply: trackFirstReply,
        meta_track_automations: trackAutomations,
        google_ads_conversion_id: googleConversionId,
        google_ads_lead_created_label: googleLeadLabel,
        google_ads_deal_won_label: googleDealWonLabel,
        google_ads_first_reply_label: googleFirstReplyLabel,
      };
      if (tokenEdited && metaAccessToken !== MASKED_TOKEN) {
        payload.meta_access_token = metaAccessToken;
      }

      const res = await fetch('/api/conversions/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || t('saveFailed'));
        return;
      }
      toast.success(t('saveSuccess'));
      await fetchConfig();
    } catch (err) {
      console.error('Save error:', err);
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const res = await fetch('/api/conversions/config/test');
      const payload = await res.json();
      if (payload.connected) {
        toast.success(t('testSuccess'));
      } else {
        toast.error(payload.message || t('testFailed'));
      }
    } catch (err) {
      console.error('Test connection error:', err);
      toast.error(t('testFailed'));
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead title={t('title')} description={t('description')} />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  const disabled = !canEdit || saving;

  return (
    <section className="animate-in fade-in-50 duration-200 space-y-6">
      <SettingsPanelHead title={t('title')} description={t('description')} />

      {!canEdit && (
        <Alert className="bg-card border-border">
          <AlertDescription className="text-muted-foreground">{t('adminOnlyHint')}</AlertDescription>
        </Alert>
      )}

      {/* Meta Conversions API */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">{t('metaSectionTitle')}</CardTitle>
          <CardDescription className="text-muted-foreground">{t('metaSectionDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
            <p className="flex-1 text-sm text-muted-foreground">{t('adsEmbeddedSignupHint')}</p>
            <MetaAdsEmbeddedSignupButton onConnected={() => void fetchConfig()} />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">{t('metaPixelId')}</Label>
            <Input
              placeholder={t('metaPixelIdPlaceholder')}
              value={metaPixelId}
              onChange={(e) => setMetaPixelId(e.target.value)}
              disabled={disabled}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">{t('metaAccessToken')}</Label>
            <div className="relative">
              <Input
                type={showToken ? 'text' : 'password'}
                placeholder={t('metaAccessTokenPlaceholder')}
                value={metaAccessToken}
                disabled={disabled}
                onChange={(e) => {
                  setMetaAccessToken(e.target.value);
                  setTokenEdited(true);
                }}
                onFocus={() => {
                  if (metaAccessToken === MASKED_TOKEN) {
                    setMetaAccessToken('');
                    setTokenEdited(true);
                  }
                }}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {hasStoredToken && !tokenEdited && (
              <p className="text-xs text-muted-foreground">{t('metaTokenHidden')}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">
              {t('metaTestEventCode')} <span className="ml-1 text-muted-foreground">{t('metaTestEventCodeOptional')}</span>
            </Label>
            <Input
              placeholder="TEST12345"
              value={metaTestEventCode}
              onChange={(e) => setMetaTestEventCode(e.target.value)}
              disabled={disabled}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">{t('metaTestEventCodeHint')}</p>
          </div>

          <div className="space-y-3 pt-2">
            <Label className="text-muted-foreground">{t('metaEventsTitle')}</Label>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-foreground">{t('trackLeadCreated')}</span>
              <Switch checked={trackLeadCreated} onCheckedChange={setTrackLeadCreated} disabled={disabled} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-foreground">{t('trackDealWon')}</span>
              <Switch checked={trackDealWon} onCheckedChange={setTrackDealWon} disabled={disabled} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-foreground">{t('trackFirstReply')}</span>
              <Switch checked={trackFirstReply} onCheckedChange={setTrackFirstReply} disabled={disabled} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-foreground">{t('trackAutomations')}</span>
              <Switch checked={trackAutomations} onCheckedChange={setTrackAutomations} disabled={disabled} />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !hasStoredToken}
              className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              {testing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('testing')}
                </>
              ) : (
                <>
                  <Zap className="size-4" />
                  {t('testConnection')}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Google Ads */}
      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">{t('googleSectionTitle')}</CardTitle>
          <CardDescription className="text-muted-foreground">{t('googleSectionDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">{t('googleConversionId')}</Label>
            <Input
              placeholder={t('googleConversionIdPlaceholder')}
              value={googleConversionId}
              onChange={(e) => setGoogleConversionId(e.target.value)}
              disabled={disabled}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('googleLeadLabel')}</Label>
              <Input
                placeholder={t('googleLabelPlaceholder')}
                value={googleLeadLabel}
                onChange={(e) => setGoogleLeadLabel(e.target.value)}
                disabled={disabled}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('googleDealWonLabel')}</Label>
              <Input
                placeholder={t('googleLabelPlaceholder')}
                value={googleDealWonLabel}
                onChange={(e) => setGoogleDealWonLabel(e.target.value)}
                disabled={disabled}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t('googleFirstReplyLabel')}</Label>
              <Input
                placeholder={t('googleLabelPlaceholder')}
                value={googleFirstReplyLabel}
                onChange={(e) => setGoogleFirstReplyLabel(e.target.value)}
                disabled={disabled}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleSave} disabled={disabled} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('saving')}
            </>
          ) : (
            t('save')
          )}
        </Button>
      </div>
    </section>
  );
}
