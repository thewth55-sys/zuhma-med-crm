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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const captchaRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

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

    // Hard navigation, not router.push — the session cookies were just
    // set by the server route, and a full load guarantees the browser
    // Supabase client (and every server component) reads them fresh
    // instead of relying on stale in-memory client state.
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
              <Input
                id="password"
                type="password"
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <TurnstileWidget onVerify={setTurnstileToken} onExpire={handleTurnstileExpire} />

            <Button
              type="submit"
              disabled={loading || (captchaRequired && !turnstileToken)}
              className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? t('signingIn') : t('signIn')}
            </Button>
          </form>

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
        </CardContent>
      </Card>
    </div>
  );
}
