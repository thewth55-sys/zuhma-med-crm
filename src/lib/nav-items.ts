// ============================================================
// Shared main-nav item list — the default order and metadata for the
// sidebar's top nav section. Extracted out of sidebar.tsx so the
// Settings → Tu perfil reorder editor (nav-order-editor.tsx) can
// render the exact same items without duplicating this list and
// drifting from it.
//
// `bottomNavItems` (Settings, Admin) stays defined in sidebar.tsx —
// those are pinned, not part of the user-reorderable set.
// ============================================================

import {
  Bell,
  Bot,
  CalendarClock,
  GitBranch,
  Globe,
  LayoutDashboard,
  MessageSquare,
  Radio,
  Receipt,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { GatedFeature } from "@/lib/billing-platform/features";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  /**
   * When true, the nav row renders a small "Beta" chip after the label.
   * Purely informational — doesn't affect routing or access.
   */
  beta?: boolean;
  /**
   * Plan-gated feature this item's destination requires (see
   * lib/billing-platform/features.ts) — the sidebar renders a lock
   * icon next to the label when the account's plan doesn't include
   * it. The link still navigates; the destination page itself
   * enforces the gate via <PlanGate>, this is just a visual signal.
   */
  feature?: GatedFeature;
}

export const navItems: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/inbox", labelKey: "inbox", icon: MessageSquare, feature: "whatsapp_inbox" },
  { href: "/notifications", labelKey: "notifications", icon: Bell },
  { href: "/contacts", labelKey: "contacts", icon: Users },
  { href: "/pipelines", labelKey: "pipelines", icon: GitBranch },
  { href: "/agenda", labelKey: "agenda", icon: CalendarClock },
  { href: "/billing", labelKey: "billing", icon: Receipt },
  { href: "/broadcasts", labelKey: "broadcasts", icon: Radio, feature: "broadcasts" },
  { href: "/automations", labelKey: "automations", icon: Zap, feature: "automations" },
  { href: "/flows", labelKey: "flows", icon: Workflow, beta: true, feature: "automations" },
  { href: "/agents", labelKey: "aiAgents", icon: Bot, feature: "ai_autoreply" },
  { href: "/landing", labelKey: "landing", icon: Globe, feature: "landing_builder" },
];

/**
 * Applies a user's saved nav order (an array of hrefs) on top of the
 * default list. Hrefs from `order` that still exist in `items` are
 * placed first, in that order; anything else (new items shipped after
 * the user last saved, or an href that no longer exists) keeps its
 * default-list position appended at the end. Falls back to the
 * default order untouched when `order` is null/empty.
 */
export function applyNavOrder(items: NavItem[], order: string[] | null | undefined): NavItem[] {
  if (!order || order.length === 0) return items;
  const remaining = new Map(items.map((item) => [item.href, item]));
  const ordered: NavItem[] = [];
  for (const href of order) {
    const item = remaining.get(href);
    if (item) {
      ordered.push(item);
      remaining.delete(href);
    }
  }
  ordered.push(...remaining.values());
  return ordered;
}
