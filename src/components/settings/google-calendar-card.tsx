"use client";

// ============================================================
// GoogleCalendarCard — Settings → Tu perfil.
//
// Any account member can connect their own Google Calendar here (not
// just a linked doctor) — every confirmed/rescheduled/cancelled
// appointment in the account then mirrors into every connected
// member's calendar. See lib/scheduling/google-calendar-sync.ts for
// the fan-out and 045_google_calendar_per_user.sql for the schema.
// ============================================================

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Link2, Link2Off, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function GoogleCalendarCard() {
  const t = useTranslations("Settings.profile");
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [connected, setConnected] = useState<boolean | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("google_calendar_connected")
        .eq("user_id", user.id)
        .maybeSingle();
      setConnected(data?.google_calendar_connected ?? false);
    })();
  }, [user, supabase]);

  useEffect(() => {
    const google = searchParams.get("google");
    if (!google) return;
    if (google === "connected") {
      toast.success(t("googleConnected"));
      setConnected(true);
    } else if (google === "error") {
      toast.error(t("googleConnectFailed"));
    }
    router.replace("/settings?tab=profile");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/google-calendar/disconnect", { method: "POST" });
      if (!res.ok) {
        toast.error(t("googleDisconnectFailed"));
        return;
      }
      setConnected(false);
      toast.success(t("googleDisconnected"));
    } finally {
      setDisconnecting(false);
    }
  }

  if (connected === null) return null;

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("googleTitle")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {connected ? t("googleConnectedHint") : t("googleDisconnectedHint")}
            </p>
          </div>
        </div>
        {connected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="shrink-0 text-xs"
          >
            {disconnecting ? <Loader2 className="size-3.5 animate-spin" /> : <Link2Off className="size-3.5" />}
            {t("googleDisconnect")}
          </Button>
        ) : (
          <a
            href="/api/google-calendar/connect"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/70"
          >
            <Link2 className="size-3.5" />
            {t("googleConnect")}
          </a>
        )}
      </CardContent>
    </Card>
  );
}
