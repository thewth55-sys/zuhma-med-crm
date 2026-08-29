'use client';

import { useTranslations } from 'next-intl';

import { ProductManager } from './product-manager';
import { TaxManager } from './tax-manager';
import { QuoteBrandingPanel } from './quote-branding-panel';
import { SettingsPanelHead } from './settings-panel-head';

/**
 * "Billing" section — catalog (products/services) and tax rates used
 * by quotes/invoices. Quotes and invoices themselves are managed from
 * the standalone /billing module and from the patient popup, not here
 * (same split as Scheduling: resources in Settings, operational
 * documents elsewhere).
 */
export function BillingPanel() {
  const t = useTranslations('Settings.billing');

  return (
    <section className="max-w-3xl animate-in fade-in-50 space-y-4 duration-200">
      <SettingsPanelHead title={t('title')} description={t('description')} />
      <ProductManager />
      <TaxManager />
      <QuoteBrandingPanel />
    </section>
  );
}
