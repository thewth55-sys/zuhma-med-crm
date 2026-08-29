// ============================================================
// /api/platform-admin/announcements/[id]
//   PATCH  — activar/desactivar (is_active).
//   DELETE — eliminar el aviso (y sus targets por cascade).
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin();
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { is_active?: unknown } | null;
    if (typeof body?.is_active !== "boolean") {
      return NextResponse.json({ error: "'is_active' must be a boolean" }, { status: 400 });
    }
    const { error } = await supabaseAdmin()
      .from("platform_announcements")
      .update({ is_active: body.is_active })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: "No se pudo actualizar el aviso" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin();
    const { id } = await params;
    const { error } = await supabaseAdmin().from("platform_announcements").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: "No se pudo eliminar el aviso" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
