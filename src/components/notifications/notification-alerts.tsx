"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { playChime } from "@/lib/notifications/sound";
import { readNotificationSoundPref } from "@/hooks/use-notification-sound-pref";
import type { Conversation, Notification } from "@/types";

/**
 * NotificationAlerts — headless, mount ONCE per signed-in dashboard tab
 * (dashboard-shell.tsx, same pattern as PresenceHeartbeat). Plays a
 * chime and/or shows a native browser notification for two events:
 *
 *   - a new inbound message (conversations.unread_count goes up —
 *     the same signal use-total-unread.ts already tracks for the
 *     sidebar's unread dot)
 *   - this user gets assigned a conversation (a `notifications` row
 *     lands for them — currently the only notification type)
 *
 * Native popups only fire while the tab isn't the visible/focused one
 * — same convention as Slack/WhatsApp Web, so a user actively looking
 * at the inbox doesn't get a redundant OS popup on top of the in-app
 * update. The chime plays regardless of focus (useful on a second
 * monitor); it's silenced entirely by the Settings toggle
 * (use-notification-sound-pref.ts).
 */
export function NotificationAlerts() {
  const { user } = useAuth();
  const unreadByConversation = useRef<Map<string, number>>(new Map());
  const initializedConversations = useRef(false);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();

    function shouldPopup() {
      return typeof document !== "undefined" && document.visibilityState !== "visible";
    }

    function notify(title: string, body?: string) {
      if (!shouldPopup()) return;
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (window.Notification.permission !== "granted") return;
      try {
        new window.Notification(title, { body, icon: "/icon.png" });
      } catch {
        // Some browsers throw constructing Notification outside a
        // user-gesture context in edge cases — never worth crashing over.
      }
    }

    // Seed the unread-count map so the first realtime event after mount
    // can tell "went up" from "was already unread" — mirrors
    // use-total-unread.ts's own init load.
    (async () => {
      const { data } = await supabase.from("conversations").select("id, unread_count");
      const map = unreadByConversation.current;
      for (const row of (data ?? []) as { id: string; unread_count: number }[]) {
        map.set(row.id, row.unread_count ?? 0);
      }
      initializedConversations.current = true;
    })();

    const messageChannel = supabase
      .channel("notification-alerts-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        (payload) => {
          if (!initializedConversations.current) return;
          const row = payload.new as Conversation | undefined;
          if (!row?.id) return;
          const previous = unreadByConversation.current.get(row.id) ?? 0;
          const next = row.unread_count ?? 0;
          unreadByConversation.current.set(row.id, next);
          if (next > previous) {
            if (readNotificationSoundPref()) playChime("message");
            // Realtime postgres_changes payloads carry only the raw row —
            // no joined `contact` — so the preview falls back to the
            // last message text rather than a contact name.
            notify("Nuevo mensaje", row.last_message_text ?? undefined);
          }
        },
      )
      .subscribe();

    const assignmentChannel = supabase
      .channel("notification-alerts-assignments")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const row = payload.new as Notification;
          if (row.user_id !== user.id) return;
          if (readNotificationSoundPref()) playChime("assignment");
          notify(row.title, row.body ?? undefined);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(assignmentChannel);
    };
  }, [user]);

  return null;
}
