/**
 * In-app feature gates that vary by plan (as opposed to
 * `hasActiveAccess` in plans.ts, which is the binary "is this account
 * locked out entirely" check).
 *
 * Deliberately narrow: only features with an actual in-app screen are
 * listed here. Most other agency-delivered line items from the
 * /pricing checklist (Meta/Google Ads management, monthly content,
 * account manager, strategy sessions) have no in-app surface to gate
 * — those are fulfilled outside this codebase. "Landing de
 * especialidad" is the one exception with two delivery modes: a
 * self-serve basic builder gated here (`landing_builder`), and a
 * premium version built by Zentro's internal design team from the
 * platform-admin editor (staff-only, gated by requirePlatformAdmin()
 * rather than a plan check — see puck-config.tsx).
 */

import type { Plan } from "./plans";

export type GatedFeature =
  | "automations"
  | "ai_autoreply"
  | "whatsapp_inbox"
  | "broadcasts"
  | "landing_builder";

export const GATED_FEATURES: GatedFeature[] = [
  "automations",
  "ai_autoreply",
  "whatsapp_inbox",
  "broadcasts",
  "landing_builder",
];

export const FEATURE_LABEL: Record<GatedFeature, string> = {
  automations: "Automatizaciones y Flows",
  ai_autoreply: "WhatsApp IA",
  whatsapp_inbox: "Bandeja de WhatsApp",
  broadcasts: "Difusiones",
  landing_builder: "Constructor de landing",
};

/** `accounts.feature_overrides` — absent key falls back to the plan default. */
export type FeatureOverrides = Partial<Record<GatedFeature, boolean>>;

const FEATURE_MIN_PLAN: Record<GatedFeature, Plan[]> = {
  // "Automatizaciones y flows" — trial doesn't get it per /pricing;
  // every paid plan (standalone included) does.
  automations: ["standalone", "zentro_salud_starter", "zentro_salud_pro"],
  // "WhatsApp IA (requiere plan de pago)" on the trial card.
  ai_autoreply: ["standalone", "zentro_salud_starter", "zentro_salud_pro"],
  // The trial checklist never lists a WhatsApp inbox at all (only
  // "WhatsApp IA" appears, explicitly X'd out) — WhatsApp itself is a
  // paid-plan feature, not just its AI reply layer.
  whatsapp_inbox: ["standalone", "zentro_salud_starter", "zentro_salud_pro"],
  // Bulk WhatsApp campaigns, same reasoning as the inbox above.
  broadcasts: ["standalone", "zentro_salud_starter", "zentro_salud_pro"],
  // Self-serve landing builder (basic component config only) — not
  // on the free trial, matching every other paid-plan feature above.
  landing_builder: ["standalone", "zentro_salud_starter", "zentro_salud_pro"],
};

export function planHasFeature(plan: Plan, feature: GatedFeature): boolean {
  return FEATURE_MIN_PLAN[feature].includes(plan);
}

/**
 * Plan default, unless a platform admin explicitly overrode this
 * feature for the account (see 057_account_feature_overrides.sql) —
 * an override always wins, in either direction.
 */
export function resolveFeatureAccess(
  plan: Plan,
  feature: GatedFeature,
  overrides: FeatureOverrides | null | undefined,
): boolean {
  const override = overrides?.[feature];
  if (override !== undefined) return override;
  return planHasFeature(plan, feature);
}
