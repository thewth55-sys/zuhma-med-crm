'use client';

import { useEffect, useRef, useState } from 'react';

import { ZentroMigrationNotice } from '@/components/migration/zentro-migration-notice';
import { useAuth } from '@/hooks/use-auth';
import { clearNativeSession } from '@/lib/native-session';

type MigrationNoticeInfo = {
  migrated: true;
  zentroLoginUrl: string;
  zentroAppUrl: string | null;
};

// Set synchronously, before React flushes the sign-out. The shell reads
// this so a session clear cannot redirect to /login and unmount the notice.
let migrationNoticeHolding = false;

export function isMigrationNoticeHolding(): boolean {
  return migrationNoticeHolding;
}

export function MigrationGate({ onHold }: { onHold?: () => void }) {
  const { user, signOutWithoutRedirect } = useAuth();
  const [info, setInfo] = useState<MigrationNoticeInfo | null>(null);
  const onHoldRef = useRef(onHold);
  const handledRef = useRef(false);

  useEffect(() => {
    onHoldRef.current = onHold;
  }, [onHold]);

  useEffect(() => {
    if (!user?.id || handledRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/migration/status');
        if (cancelled || !res.ok) return;
        const data = await res.json().catch(() => null);
        if (
          cancelled ||
          handledRef.current ||
          data?.migrated !== true ||
          typeof data.zentroLoginUrl !== 'string'
        ) {
          return;
        }

        handledRef.current = true;
        migrationNoticeHolding = true;
        onHoldRef.current?.();
        setInfo({
          migrated: true,
          zentroLoginUrl: data.zentroLoginUrl,
          zentroAppUrl:
            typeof data.zentroAppUrl === 'string' && data.zentroAppUrl
              ? data.zentroAppUrl
              : null,
        });
        await signOutWithoutRedirect();
        await clearNativeSession();
      } catch (err) {
        if (!cancelled)
          console.error('[MigrationGate] status check failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, signOutWithoutRedirect]);

  if (!info) return null;

  return (
    <div className="bg-background fixed inset-0 z-[80] overflow-y-auto">
      <ZentroMigrationNotice
        zentroLoginUrl={info.zentroLoginUrl}
        zentroAppUrl={info.zentroAppUrl}
        autoRedirectSeconds={10}
      />
    </div>
  );
}
