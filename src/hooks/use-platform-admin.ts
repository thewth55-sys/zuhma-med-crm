"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side "am I platform staff" check, purely for deciding
 * whether to render the /admin nav link — every /admin route and
 * /api/platform-admin/** route re-verifies server-side via
 * requirePlatformAdmin(), so this hook is a UI convenience only,
 * never a security boundary. Backed by the self-select RLS policy
 * on `platform_admins` (migration 040) added specifically for this.
 */
export function usePlatformAdmin(): { isPlatformAdmin: boolean; loading: boolean } {
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setIsPlatformAdmin(false);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cancelled) {
        setIsPlatformAdmin(!!data);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { isPlatformAdmin, loading };
}
