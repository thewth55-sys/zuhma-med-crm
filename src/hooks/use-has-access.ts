"use client";

import { useAuth } from "@/hooks/use-auth";
import { hasActiveAccess } from "@/lib/billing-platform/plans";

/**
 * Whether the current account is entitled to use the product right
 * now. `false` only for a lapsed trial or a fully canceled
 * subscription — see `hasActiveAccess` for the exact status set.
 * Returns `true` while auth is still loading so the UI doesn't flash
 * a read-only banner before the real status arrives.
 */
export function useHasAccess(): boolean {
  const { profileLoading, account } = useAuth();
  if (profileLoading || !account) return true;
  return hasActiveAccess(account.subscription_status);
}
