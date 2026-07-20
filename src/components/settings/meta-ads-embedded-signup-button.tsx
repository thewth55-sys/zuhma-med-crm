'use client';

// ============================================================
// Meta Ads Embedded Connect — Meta's hosted self-service flow for
// sharing a customer's own ad account/pixel, as an alternative front
// door to the manual "paste your pixel ID + CAPI token" fields below
// it (conversion-tracking-config.tsx, untouched by this file). Same
// FB.login()-with-config_id mechanism as WhatsApp Embedded Signup
// (whatsapp-embedded-signup-button.tsx), just against a different
// Login Configuration — no postMessage listener needed here since the
// backend discovers the granted ad account/pixel itself via the
// Graph API instead of relying on a WA_EMBEDDED_SIGNUP-style event.
//
// Renders nothing when NEXT_PUBLIC_META_APP_ID isn't set, same
// no-op-without-config pattern as the WhatsApp button.
//
// Requires TWO env vars:
//   NEXT_PUBLIC_META_APP_ID               — the Meta App's ID (public, shared with WhatsApp's button)
//   NEXT_PUBLIC_META_ADS_SIGNUP_CONFIG_ID — the "Login Configuration" created
//     specifically for this in that app's dashboard (Facebook Login for
//     Business → Configurations), requesting ads_management/
//     business_management/read_insights.
// ============================================================

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Megaphone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js';

interface MetaAdsEmbeddedSignupButtonProps {
  onConnected: (result: { adAccountName: string; pixelName: string }) => void;
}

export function MetaAdsEmbeddedSignupButton({ onConnected }: MetaAdsEmbeddedSignupButtonProps) {
  const t = useTranslations('Settings.conversions');
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_ADS_SIGNUP_CONFIG_ID;

  const [sdkReady, setSdkReady] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!appId) return;

    function initFb() {
      window.FB?.init({
        appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: 'v21.0',
      });
      setSdkReady(true);
    }

    if (window.FB) {
      initFb();
    } else {
      window.fbAsyncInit = initFb;
      if (!document.getElementById('facebook-jssdk')) {
        const script = document.createElement('script');
        script.id = 'facebook-jssdk';
        script.src = SDK_SRC;
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
      }
    }
  }, [appId]);

  // Split out from the FB.login() call on purpose — see the identical
  // comment in whatsapp-embedded-signup-button.tsx: the callback must
  // be a plain synchronous function, this is where the async work happens.
  async function processLoginResponse(response: { authResponse?: { code?: string } }) {
    const code = response.authResponse?.code;
    if (!code) {
      toast.error(t('adsEmbeddedSignupCanceled'));
      setConnecting(false);
      return;
    }

    try {
      const res = await fetch('/api/conversions/meta-embedded-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.success === false) {
        toast.error(body?.error ?? t('adsEmbeddedSignupFailed'));
        return;
      }
      toast.success(t('adsEmbeddedSignupSuccess', { account: body.adAccountName, pixel: body.pixelName }));
      onConnected({ adAccountName: body.adAccountName, pixelName: body.pixelName });
    } catch (err) {
      console.error('Meta Ads Embedded Connect provisioning error:', err);
      toast.error(t('adsEmbeddedSignupFailed'));
    } finally {
      setConnecting(false);
    }
  }

  function handleConnect() {
    if (!window.FB || !configId) return;
    setConnecting(true);

    window.FB.login(
      (response) => {
        void processLoginResponse(response);
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
      },
    );
  }

  if (!appId || !configId) return null;

  return (
    <Button type="button" variant="outline" onClick={handleConnect} disabled={!sdkReady || connecting}>
      {connecting ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}
      {t('adsEmbeddedSignupConnect')}
    </Button>
  );
}
