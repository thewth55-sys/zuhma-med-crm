"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { NotificationAlerts } from "@/components/notifications/notification-alerts";
import { PushRegistration } from "@/components/notifications/push-registration";
import { NativeSessionSync } from "@/components/notifications/native-session-sync";
import { BiometricLock } from "@/components/notifications/biometric-lock";
import {
  isMigrationNoticeHolding,
  MigrationGate,
} from "@/components/migration/migration-gate";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  // The gate signs the user out on purpose. Hold the shell open so that
  // doesn't bounce them to /login and unmount the notice.
  const [migrationHolding, setMigrationHolding] = useState(false);
  const holdForMigration = useCallback(() => setMigrationHolding(true), []);
  const holding = migrationHolding || isMigrationNoticeHolding();

  useEffect(() => {
    if (!loading && !user && !holding) {
      router.push("/login");
    }
  }, [user, loading, router, holding]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user && !holding) return null;

  return (
    <BiometricLock>
    <div className="flex h-screen overflow-hidden bg-background">
      {user ? (
        <>
          {/* Reports this tab's online/away presence once we know a user is
              signed in. Headless — renders nothing. */}
          <PresenceHeartbeat />
          {/* Plays a chime / fires a native popup on new messages or
              assignments while this tab is open. Headless — renders nothing. */}
          <NotificationAlerts />
          {/* Native-only (no-op on web): registers the device for FCM push
              and backs up the session to native storage. */}
          <PushRegistration />
          <NativeSessionSync />
        </>
      ) : null}
      {/* Stays mounted after sign-out so the notice is not thrown away
          with the authenticated chrome. Sits beside NativeSessionSync
          while a session is still present. */}
      <MigrationGate onHold={holdForMigration} />
      {user ? (
        <>
          <Sidebar open={sidebarOpen} onClose={closeSidebar} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header onOpenSidebar={() => setSidebarOpen(true)} />
            {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
          </div>
        </>
      ) : null}
    </div>
    </BiometricLock>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
