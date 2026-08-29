import { NextResponse } from "next/server";

/**
 * GET /api/auth/turnstile-config — entrega el site key de Turnstile al
 * cliente EN RUNTIME, en vez de depender de que NEXT_PUBLIC_* se incruste
 * en el build (el pipeline de Easypanel no lo hace de forma fiable). El
 * secret sigue leyéndose solo en el servidor (/api/auth/login).
 */
export function GET() {
  const siteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || process.env.TURNSTILE_SITE_KEY || null;
  // Cuando fail-open está activo, el servidor no bloquea un login sin token,
  // así que el cliente puede permitir el submit si el widget no logra
  // resolver (dispositivo con reloj/DNS problemático). Ver /api/auth/login.
  const failOpen = process.env.TURNSTILE_FAIL_OPEN === "true";
  return NextResponse.json({ siteKey, failOpen });
}
