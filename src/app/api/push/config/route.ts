import { NextResponse } from "next/server";

/**
 * GET /api/push/config — indica al cliente si el push nativo está
 * habilitado, leyendo la env var EN RUNTIME (server-side).
 *
 * Por qué runtime y no un NEXT_PUBLIC_* en el cliente: el pipeline de
 * build de Easypanel no incrusta de forma fiable los NEXT_PUBLIC_* en el
 * bundle del cliente, así que la app decidía siempre "deshabilitado". El
 * servidor SÍ ve la variable en runtime, de modo que aquí es autoritativo.
 * Se aceptan ambos nombres por compatibilidad con la config existente.
 */
export function GET() {
  const enabled =
    process.env.FIREBASE_PUSH_ENABLED === "true" ||
    process.env.NEXT_PUBLIC_FIREBASE_PUSH_ENABLED === "true";
  return NextResponse.json({ enabled });
}
