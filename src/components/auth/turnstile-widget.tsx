"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: (code?: string) => void;
          "timeout-callback"?: () => void;
          retry?: "auto" | "never";
          "retry-interval"?: number;
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  /** Avisa al contenedor si el captcha está activo (site key presente),
   *  para que sepa si debe exigir el token antes de permitir el submit. */
  onReady?: (active: boolean) => void;
  /** Se llama con `true` cuando el captcha no logra resolver (error o timeout)
   *  y el servidor está en fail-open — para que el contenedor permita el
   *  submit igualmente; `false` cuando vuelve a resolver. */
  onUnavailable?: (unavailable: boolean) => void;
}

// Si tras este tiempo no hay token ni error explícito (el caso del spinner
// "Verificando…" colgado, típico de reloj desfasado / DNS-VPN del
// dispositivo), lo tratamos como fallo y mostramos el reintento.
const SOLVE_TIMEOUT_MS = 20_000;

/**
 * Cloudflare Turnstile widget. El site key se obtiene EN RUNTIME de
 * /api/auth/turnstile-config (no de NEXT_PUBLIC_*, que el build de
 * Easypanel no incrusta de forma fiable). Si no hay site key, no renderiza
 * nada ni bloquea — el skip server-side vive en /api/auth/login.
 *
 * Resiliencia: auto-reintento nativo + un timeout propio que atrapa el
 * "Verificando…" infinito (que no dispara error-callback), mostrando un
 * mensaje con botón "Reintentar" en vez de dejar al usuario bloqueado. Si
 * el servidor corre en fail-open, además avisa vía onUnavailable para que
 * el login pueda continuar sin token.
 */
export function TurnstileWidget({ onVerify, onExpire, onReady, onUnavailable }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const solvedRef = useRef(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [failOpen, setFailOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/turnstile-config")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        const key = typeof d?.siteKey === "string" && d.siteKey ? d.siteKey : null;
        setSiteKey(key);
        setFailOpen(d?.failOpen === true);
        onReady?.(Boolean(key));
      })
      .catch(() => {
        if (active) onReady?.(false);
      });
    return () => {
      active = false;
    };
    // onReady is stable enough for this one-shot fetch; avoid re-fetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markFailed = useCallback(() => {
    if (solvedRef.current) return;
    setFailed(true);
    if (failOpen) onUnavailable?.(true);
  }, [failOpen, onUnavailable]);

  const armTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(markFailed, SOLVE_TIMEOUT_MS);
  }, [markFailed]);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !siteKey || !window.turnstile) return;
    solvedRef.current = false;
    setFailed(false);
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token: string) => {
        solvedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        setFailed(false);
        onUnavailable?.(false);
        onVerify(token);
      },
      "expired-callback": () => {
        onExpire?.();
        armTimer();
      },
      "error-callback": () => markFailed(),
      "timeout-callback": () => markFailed(),
      retry: "auto",
      "retry-interval": 4000,
    });
    armTimer();
  }, [siteKey, onVerify, onExpire, markFailed, armTimer, onUnavailable]);

  useEffect(() => {
    if (!scriptLoaded || !siteKey || widgetIdRef.current) return;
    renderWidget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded, siteKey]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleRetry = useCallback(() => {
    setFailed(false);
    onUnavailable?.(false);
    solvedRef.current = false;
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      armTimer();
    } else {
      renderWidget();
    }
  }, [armTimer, renderWidget, onUnavailable]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async
        defer
        onLoad={() => setScriptLoaded(true)}
      />
      <div ref={containerRef} />
      {failed ? (
        <div className="mt-2 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
          No se pudo completar la verificación. Revisa la <strong>fecha y hora</strong> del
          dispositivo (ponla en automática) y tu conexión (DNS privado / VPN).{" "}
          <button type="button" onClick={handleRetry} className="font-medium text-primary underline">
            Reintentar
          </button>
          {failOpen ? (
            <span className="mt-1 block">Puedes continuar de todas formas.</span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
