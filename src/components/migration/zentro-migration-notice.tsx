'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';

import { Button } from '@/components/ui/button';

const BODY =
  'Tu clínica ya se mudó a Zentro Med. Entra con el mismo correo y contraseña. Descarga la app oficial; esta app dejará de funcionar pronto.';

function subscribeNoop() {
  return () => {};
}

function isNativeNow() {
  return Capacitor.isNativePlatform();
}

function isNativeOnServer() {
  return false;
}

function go(url: string) {
  window.location.href = url;
}

export function ZentroMigrationNotice({
  zentroLoginUrl,
  zentroAppUrl,
  autoRedirectSeconds,
}: {
  zentroLoginUrl: string;
  zentroAppUrl: string | null;
  autoRedirectSeconds: number;
}) {
  // getServerSnapshot keeps the first paint identical on the server.
  // After hydration the client snapshot flips on the native app, and the
  // redirect effect below re-checks Capacitor so a WebView never auto-leaves.
  const native = useSyncExternalStore(
    subscribeNoop,
    isNativeNow,
    isNativeOnServer
  );
  const [secondsLeft, setSecondsLeft] = useState(autoRedirectSeconds);

  useEffect(() => {
    if (native || Capacitor.isNativePlatform()) return;
    if (autoRedirectSeconds <= 0) {
      go(zentroLoginUrl);
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = autoRedirectSeconds - elapsed;
      if (left <= 0) {
        window.clearInterval(timer);
        go(zentroLoginUrl);
        return;
      }
      setSecondsLeft(left);
    }, 250);

    return () => window.clearInterval(timer);
  }, [native, autoRedirectSeconds, zentroLoginUrl]);

  const countdown =
    secondsLeft === 1
      ? 'Te redirigimos a Zentro Med en 1 segundo.'
      : `Te redirigimos a Zentro Med en ${secondsLeft} segundos.`;

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img
          src="/zuhma-isotipo.png"
          alt=""
          className="mx-auto mb-6 h-12 w-12"
        />
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
          Zuhma ahora es Zentro Med
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
          {BODY}
        </p>
        <div className="mt-8 flex flex-col gap-3">
          {native ? (
            <>
              {zentroAppUrl ? (
                <Button
                  type="button"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-full"
                  onClick={() => go(zentroAppUrl)}
                >
                  Descargar la app oficial
                </Button>
              ) : null}
              <Button
                type="button"
                variant={zentroAppUrl ? 'outline' : 'default'}
                className={
                  zentroAppUrl
                    ? 'h-10 w-full'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-full'
                }
                onClick={() => go(zentroLoginUrl)}
              >
                Entrar a Zentro Med
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-full"
                onClick={() => go(zentroLoginUrl)}
              >
                Entrar a Zentro Med
              </Button>
              <p className="text-muted-foreground text-sm" aria-live="polite">
                {countdown}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
