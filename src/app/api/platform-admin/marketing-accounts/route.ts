import { NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";

export async function GET() {
  try {
    await requireStaffRole(["marketing"]);
    const { data, error } = await supabaseAdmin().from("accounts").select("id, name").order("name", { ascending: true });
    if (error) {
      console.error("[GET /api/platform-admin/marketing-accounts] error:", error);
      return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
    return NextResponse.json({ accounts: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}
