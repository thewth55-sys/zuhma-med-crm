'use client';

import { useTranslations } from 'next-intl';

import { LandingPageEditor } from '@/components/settings/landing-page-editor';

/**
 * Top-level page (not a Settings tab) so the Puck editor gets the
 * dashboard's full content width instead of Settings' narrow
 * `minmax(0,1fr)` column — the editor canvas was rendering at a
 * cramped default zoom when it lived under Settings → Ajustes.
 */
export default function LandingPage() {
  const t = useTranslations('Settings.landing');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>
      <LandingPageEditor />
    </div>
  );
}
