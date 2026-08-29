"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";
import { loadNativeSession, clearNativeSession } from "@/lib/native-session";
import { AndroidAppBanner } from "@/components/android-app-banner";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UsersRound } from "lucide-react";

// `useSearchParams` opts the component out of static prerendering
// unless it sits under a Suspense boundary. We split the form into
// a child component so the outer page can prerender the chrome
// (background, card frame) while the form hydrates with the query
// string on the client.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  // Forwarded from `/join/<token>` when the visitor already has an
  // account. After a successful sign-in we send them to the join
  // page to accept rather than to /dashboard.
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("LoginPage");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => {
    const e = searchParams.get("error");
    if (e === "no_account") return t("errorNoAccount");
    if (e === "auth_callback_failed") return t("errorAuthCallback");
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Se determina en runtime desde el widget (site key vía API), no en build.
  const [captchaActive, setCaptchaActive] = useState(false);
  // El widget avisa cuando no logra resolver (error/timeout) y el servidor
  // está en fail-open: en ese caso dejamos continuar sin token.
  const [captchaUnavailable, setCaptchaUnavailable] = useState(false);

  // 2FA por correo (solo dispositivos nuevos).
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [verifying, setVerifying] = useState(false);

  // Login con Google (solo web — Google bloquea OAuth en WebView).
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleAvailable = !Capacitor.isNativePlatform();

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const supabase = createClient();
      const next = inviteToken ? `/join/${encodeURIComponent(inviteToken)}` : "/dashboard";
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) {
        setError(error.message);
        setGoogleLoading(false);
      }
      // En éxito, el navegador se redirige a Google — no reseteamos loading.
    } catch {
      setError(t("errorAuthCallback"));
      setGoogleLoading(false);
    }
  };

  const handleTurnstileExpire = useCallback(() => setTurnstileToken(null), []);

  // Native-only session restore. On the Android app the WebView's own
  // cookie jar isn't reliably persisted across a full app close on
  // every OEM (see native-session.ts), so if we backed up a session to
  // native storage before, restore it here before showing the form.
  // No-op on web — `restoring` stays false and the form renders.
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    queueMicrotask(() => setRestoring(true));
    (async () => {
      const stored = await loadNativeSession();
      if (!stored) {
        setRestoring(false);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
      });
      if (error) {
        console.error("Native session restore failed:", error);
        await clearNativeSession();
        setRestoring(false);
        return;
      }
      // Hard navigation so the server (middleware) sees the fresh cookies.
      window.location.href = inviteToken
        ? `/join/${encodeURIComponent(inviteToken)}`
        : "/dashboard";
    })();
  }, [inviteToken]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Goes through our own route (not supabase.auth.signInWithPassword
    // directly) so the Turnstile token gets verified server-side before
    // Supabase is ever called — see src/app/api/auth/login/route.ts.
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, turnstileToken }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error || "Login failed");
      setLoading(false);
      return;
    }

    // Dispositivo nuevo → pedir el código 2FA antes de entrar.
    if (data.mfaRequired) {
      setMfaChallengeId(data.challengeId);
      setLoading(false);
      return;
    }

    // Hard navigation, not router.push — the session cookies were just
    // set by the server route, and a full load guarantees the browser
    // Supabase client (and every server component) reads them fresh
    // instead of relying on stale in-memory client state.
    window.location.href = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : "/dashboard";
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallengeId) return;
    setError(null);
    setVerifying(true);

    const res = await fetch("/api/auth/login/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: mfaChallengeId, code, rememberDevice }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error || t("codeError"));
      setVerifying(false);
      // Reto expirado/agotado → volver al formulario de login.
      if (res.status === 400 || res.status === 429) {
        setMfaChallengeId(null);
        setCode("");
      }
      return;
    }

    window.location.href = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : "/dashboard";
  };

  if (restoring) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <AndroidAppBanner />
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            {inviteToken ? (
              <UsersRound className="h-6 w-6 text-primary" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- static brand asset
              <img src="/zuhma-isotipo.png" alt="" className="h-7 w-7" />
            )}
          </div>
          <CardTitle className="text-xl text-foreground">
            {inviteToken ? t('titleAccept') : t('titleWelcome')}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {inviteToken
              ? t('descAccept')
              : t('descWelcome')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mfaChallengeId ? (
            <form onSubmit={handleVerify} className="flex flex-col gap-4">
              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}
              <p className="text-sm text-muted-foreground">{t('codeSentTo', { email })}</p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="code" className="text-muted-foreground">
                  {t('codeLabel')}
                </Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                  className="border-border bg-muted text-center text-lg tracking-[0.5em] text-foreground focus-visible:border-primary focus-visible:ring-primary/20"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="size-4 accent-primary"
                />
                {t('rememberDevice')}
              </label>
              <Button
                type="submit"
                disabled={verifying || code.length < 6}
                className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {verifying ? t('verifying') : t('verify')}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMfaChallengeId(null);
                  setCode('');
                  setError(null);
                }}
                className="text-center text-sm text-muted-foreground hover:text-foreground"
              >
                {t('backToLogin')}
              </button>
            </form>
          ) : (
          <>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-muted-foreground">
                {t('emailLabel')}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-muted-foreground">
                  {t('passwordLabel')}
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary hover:text-primary/80"
                >
                  {t('forgotPassword')}
                </Link>
              </div>
              <PasswordInput
                id="password"
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <TurnstileWidget
              onVerify={setTurnstileToken}
              onExpire={handleTurnstileExpire}
              onReady={setCaptchaActive}
              onUnavailable={setCaptchaUnavailable}
            />

            <Button
              type="submit"
              disabled={loading || (captchaActive && !turnstileToken && !captchaUnavailable)}
              className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? t('signingIn') : t('signIn')}
            </Button>
          </form>

          {googleAvailable && (
            <>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">{t('orContinue')}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="h-10 w-full gap-2"
              >
                {googleLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <svg className="size-4" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.5 0 24 0 14.6 0 6.4 5.4 2.5 13.2l7.9 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.4z" />
                    <path fill="#FBBC05" d="M10.4 28.3c-.5-1.4-.8-3-.8-4.8s.3-3.3.8-4.8l-7.9-6.1C.9 15.9 0 19.8 0 23.5s.9 7.6 2.5 10.9l7.9-6.1z" />
                    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.6 2.1-8.8 2.1-6.3 0-11.7-3.7-13.6-9.8l-7.9 6.1C6.4 42.6 14.6 48 24 48z" />
                  </svg>
                )}
                {t('continueWithGoogle')}
              </Button>
            </>
          )}

          {/* Public self-signup is deliberately not advertised here —
              new accounts are meant to come from the marketing
              landing page, not be self-discoverable from /login. The
              one exception is a teammate accepting an invite: if they
              land here via /join/<token> without an account yet, they
              still need a way to create one with the invite attached,
              so this stays visible only when an invite token is
              present. /signup itself is unchanged and still reachable
              directly (that's what the landing page links to). */}
          {inviteToken && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {t('noAccount')}{" "}
              <Link
                href={`/signup?invite=${encodeURIComponent(inviteToken)}`}
                className="text-primary hover:text-primary/80"
              >
                {t('createAccount')}
              </Link>
            </p>
          )}
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
