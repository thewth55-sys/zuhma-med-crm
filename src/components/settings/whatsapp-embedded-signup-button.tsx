'use client';

// ============================================================
// WhatsApp Embedded Signup — Meta's hosted self-service flow for
// connecting a customer's own WhatsApp Business Account, as an
// alternative front door to the manual "paste your System User
// token" form below it (whatsapp-config.tsx, untouched by this file).
//
// Renders nothing when NEXT_PUBLIC_META_APP_ID isn't set, same
// no-op-without-config pattern used elsewhere in this app (Sentry,
// etc.) — this feature needs real setup in Meta's App Dashboard
// before it does anything (see the doc handed to the user alongside
// this batch), so an unconfigured deployment just doesn't show the
// button rather than showing a broken one.
//
// Requires TWO env vars:
//   NEXT_PUBLIC_META_APP_ID              — the Meta App's ID (public)
//   NEXT_PUBLIC_META_WA_SIGNUP_CONFIG_ID — the "Login Configuration"
//     created specifically for WhatsApp Embedded Signup in that app's
//     dashboard (Facebook Login for Business → Configurations)
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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

export function WhatsAppEmbeddedSignupButton() {
  const t = useTranslations('Settings.whatsapp');
  const router = useRouter();
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_WA_SIGNUP_CONFIG_ID;

  const [sdkReady, setSdkReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // Meta fires the waba_id/phone_number_id via a postMessage event,
  // separately from the FB.login() callback's `code` — the two can
  // arrive in either order, so both are held here and the POST to
  // our backend only fires once both are in hand.
  const signupDataRef = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

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

    function onMessage(event: MessageEvent) {
      if (event.origin !== 'https://www.facebook.com') return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (data.event === 'FINISH' || data.event === 'FINISH_ONBOARDING') {
          signupDataRef.current.wabaId = data.data?.waba_id;
          signupDataRef.current.phoneNumberId = data.data?.phone_number_id;
        }
      } catch {
        // Not a JSON postMessage from Meta — ignore.
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [appId]);

  // Split out from the FB.login() call below on purpose: some
  // FB SDK builds (and/or Sentry's DOM-callback instrumentation
  // wrapping it) reject an `async function` passed directly as the
  // login callback with a cryptic "Expression is of type
  // asyncfunction, not function" — the callback itself must be a
  // plain synchronous function; this is where the actual async work
  // happens instead, fired-and-forgotten from that plain wrapper.
  async function processLoginResponse(response: { authResponse?: { code?: string } }) {
    const code = response.authResponse?.code;
    if (!code) {
      toast.error(t('embeddedSignupCanceled'));
      setConnecting(false);
      return;
    }

    // The postMessage event usually lands before FB.login's own
    // callback, but give it a brief window in case it hasn't yet.
    for (let i = 0; i < 10 && !signupDataRef.current.wabaId; i++) {
      await new Promise((r) => setTimeout(r, 200));
    }

    if (!signupDataRef.current.wabaId) {
      toast.error(t('embeddedSignupNoWaba'));
      setConnecting(false);
      return;
    }

    try {
      const res = await fetch('/api/whatsapp/embedded-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          waba_id: signupDataRef.current.wabaId,
          phone_number_id: signupDataRef.current.phoneNumberId,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.success === false) {
        toast.error(body?.error ?? body?.registration_error ?? t('embeddedSignupFailed'));
        return;
      }
      toast.success(t('embeddedSignupSuccess'));
      router.refresh();
      window.location.reload();
    } catch (err) {
      console.error('Embedded Signup provisioning error:', err);
      toast.error(t('embeddedSignupFailed'));
    } finally {
      setConnecting(false);
    }
  }

  function handleConnect() {
    if (!window.FB || !configId) return;
    signupDataRef.current = {};
    setConnecting(true);

    window.FB.login(
      (response) => {
        void processLoginResponse(response);
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { sessionInfoVersion: '3' },
      },
    );
  }

  if (!appId || !configId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <MessageCircle className="size-4 text-primary" />
          {t('embeddedSignupTitle')}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {t('embeddedSignupDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" onClick={handleConnect} disabled={!sdkReady || connecting}>
          {connecting ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
          {t('embeddedSignupConnect')}
        </Button>
      </CardContent>
    </Card>
  );
}
