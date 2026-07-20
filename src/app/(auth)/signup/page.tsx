"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
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
import { CheckCircle, UsersRound } from "lucide-react";
import { getPasswordStrengthError } from "@/lib/password-strength";

// Plans a visitor can land here wanting to buy directly from
// /pricing (the trial itself isn't in this list — that's the no-param
// default path). Kept as a local literal rather than importing
// PLAN_CONFIG from lib/billing-platform/plans: that module reads
// server-only Stripe env vars at module scope, and this is a client
// component — importing it would either bundle those reads uselessly
// or (worse) tempt a future edit into leaking a price ID client-side.
const PURCHASABLE_PLAN_IDS = ["standalone", "zentro_salud_starter", "zentro_salud_pro"] as const;
type PurchasablePlan = (typeof PURCHASABLE_PLAN_IDS)[number];

const PLAN_LABEL: Record<PurchasablePlan, string> = {
  standalone: "Zentro Med independiente",
  zentro_salud_starter: "Zentro Salud Starter",
  zentro_salud_pro: "Zentro Salud Pro",
};

function isPurchasablePlan(value: string | null): value is PurchasablePlan {
  return !!value && (PURCHASABLE_PLAN_IDS as readonly string[]).includes(value);
}

// `useSearchParams` opts the component out of static prerendering
// unless wrapped in Suspense — same pattern as /login.
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const t = useTranslations("SignupPage");
  const searchParams = useSearchParams();
  // When the user lands here from `/join/<token>` we carry the
  // invite token in the query so it survives the signup → email
  // verification → redirect round-trip. `emailRedirectTo` below
  // points back at /join/<token> so the user lands on the redeem
  // step after verifying instead of being dropped on /dashboard.
  const inviteToken = searchParams.get("invite");
  // Present when the visitor came from a /pricing "Suscribirme" CTA
  // rather than "Empezar gratis" — after email confirmation we skip
  // the trial-only dashboard landing and go straight into Stripe
  // Checkout for this plan (see StartCheckoutRedirect).
  const planParam = searchParams.get("plan");
  const purchasePlan = isPurchasablePlan(planParam) ? planParam : null;

  const [fullName, setFullName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    const strengthError = getPasswordStrengthError(password);
    if (strengthError) {
      setError(t(`passwordRule_${strengthError}` as Parameters<typeof t>[0]));
      return;
    }

    setLoading(true);

    // Every path now routes through /auth/callback, which exchanges
    // the PKCE code for a session and then forwards to `next`:
    //   - invite token  → /join/<token>, so they land on the accept step
    //   - purchase plan → /dashboard?startCheckout=<plan>, so
    //     StartCheckoutRedirect sends them straight into Stripe
    //     Checkout instead of the empty trial dashboard
    //   - plain trial   → /dashboard
    const next = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : purchasePlan
        ? `/dashboard?startCheckout=${purchasePlan}`
        : "/dashboard";
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          // Read by handle_new_user() (042_account_brand_name.sql) to
          // seed accounts.name — falls back to full_name/email when
          // blank, same as before this field existed.
          brand_name: brandName.trim() || undefined,
        },
        emailRedirectTo,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If "Confirm email" is off in Supabase Auth settings, signUp()
    // returns an already-active session instead of requiring a click
    // on a confirmation link — the emailRedirectTo above then never
    // fires, since there's no email round-trip. Without this check, a
    // visitor who clicked a paid-plan CTA would land in the app fully
    // signed in and never see Stripe Checkout. Send them where the
    // redirect would have gone, right now, client-side.
    if (data.session) {
      window.location.href = next;
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border bg-card">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <CheckCircle className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl text-foreground">
              {t("checkEmailTitle")}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {t.rich("checkEmailDesc", {
                email,
                bold: (chunks: React.ReactNode) => <span className="text-foreground">{chunks}</span>,
              })}
              {purchasePlan ? (
                <>
                  {" "}
                  {t.rich("checkEmailPlanHint", {
                    plan: PLAN_LABEL[purchasePlan],
                    bold: (chunks: React.ReactNode) => <span className="text-foreground">{chunks}</span>,
                  })}
                </>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={
                inviteToken
                  ? `/login?invite=${encodeURIComponent(inviteToken)}`
                  : "/login"
              }
            >
              <Button
                variant="outline"
                className="w-full border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {t("backToSignIn")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            {inviteToken ? (
              <UsersRound className="h-6 w-6 text-primary" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- static brand asset
              <img src="/zentro-isotipo.png" alt="" className="h-7 w-7" />
            )}
          </div>
          <CardTitle className="text-xl text-foreground">
            {inviteToken ? t("titleInvite") : t("title")}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {inviteToken ? t("descInvite") : t("desc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="fullName" className="text-muted-foreground">
                {t("fullNameLabel")}
              </Label>
              <Input
                id="fullName"
                type="text"
                placeholder={t("fullNamePlaceholder")}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            {!inviteToken && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="brandName" className="text-muted-foreground">
                  {t("brandNameLabel")}{" "}
                  <span className="text-xs font-normal text-muted-foreground/70">
                    {t("optional")}
                  </span>
                </Label>
                <Input
                  id="brandName"
                  type="text"
                  placeholder={t("brandNamePlaceholder")}
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
                />
                <p className="text-xs text-muted-foreground">{t("brandNameHint")}</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-muted-foreground">
                {t("emailLabel")}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-muted-foreground">
                {t("passwordLabel")}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={t("passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
              <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirmPassword" className="text-muted-foreground">
                {t("confirmPasswordLabel")}
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder={t("confirmPasswordPlaceholder")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? t("creatingAccount") : t("createAccount")}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("haveAccount")}{" "}
            <Link
              href={
                inviteToken
                  ? `/login?invite=${encodeURIComponent(inviteToken)}`
                  : "/login"
              }
              className="text-primary hover:text-primary/80"
            >
              {t("signIn")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
