"use client";

import { useAuth } from "@/hooks/use-auth";
import { resolveFeatureAccess, type GatedFeature } from "@/lib/billing-platform/features";

/**
 * Whether the current account's plan includes a given in-app-gated
 * feature (see features.ts), with a platform admin's per-account
 * override (057_account_feature_overrides.sql) taking precedence in
 * either direction. Returns `true` while auth is still loading, same
 * fail-open behavior as `useHasAccess`, so the UI doesn't flash a
 * locked state before the real plan arrives.
 */
export function useHasFeature(feature: GatedFeature): boolean {
  const { profileLoading, account } = useAuth();
  if (profileLoading || !account) return true;
  return resolveFeatureAccess(account.plan, feature, account.feature_overrides);
}
