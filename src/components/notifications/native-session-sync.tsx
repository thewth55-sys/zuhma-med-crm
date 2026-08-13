"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";
import { saveNativeSession, clearNativeSession } from "@/lib/native-session";

/**
 * Respalda la sesión de Supabase en almacenamiento nativo cada vez que
 * cambia — ver native-session.ts para el porqué. Se monta una vez por
 * sesión autenticada. El restore-al-arrancar ocurre en la página de
 * login (la única alcanzable sin sesión), no aquí.
 */
export function NativeSessionSync() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        void saveNativeSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      } else if (event === "SIGNED_OUT") {
        void clearNativeSession();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
