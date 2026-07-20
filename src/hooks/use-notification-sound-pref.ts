"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "zentro:notificationSoundsEnabled";

/** Read directly (not via the hook) from the alert listener, which
 *  doesn't need to re-render on change — it just checks this at the
 *  moment a realtime event fires. */
export function readNotificationSoundPref(): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === null ? true : raw === "true";
}

/** Reactive version for the Settings toggle UI. */
export function useNotificationSoundPref(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(readNotificationSoundPref());
  }, []);

  const update = useCallback((next: boolean) => {
    setEnabled(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }, []);

  return [enabled, update];
}
