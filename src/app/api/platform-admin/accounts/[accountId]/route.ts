// ============================================================
// GET /api/platform-admin/accounts/[accountId] — the "Cuenta 360"
// detail feed: account/plan info and internal team members. Same
// service-role + requirePlatformAdmin() gate as every other
// /api/platform-admin/** route.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { getAiTokenQuotaStatus } from "@/lib/ai/quota";

export async function GET(_request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    await requirePlatformAdmin();
    const { accountId } = await params;

    const db = supabaseAdmin();

    const { data: account, error: accountErr } = await db
      .from("accounts")
      .select(
        "id, name, owner_user_id, plan, subscription_status, trial_ends_at, included_seats, created_at, logo_url, ai_access_blocked, ai_token_limit_override",
      )
      .eq("id", accountId)
      .maybeSingle();

    if (accountErr) {
      console.error("[GET /api/platform-admin/accounts/:id] account fetch error:", accountErr);
      return NextResponse.json({ error: "Failed to load account" }, { status: 500 });
    }
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { data: members, error: membersErr } = await db
      .from("profiles")
      .select("user_id, full_name, email, phone, account_role, google_calendar_connected, avatar_url")
      .eq("account_id", accountId)
      .order("account_role", { ascending: true });

    if (membersErr) {
      console.error("[GET /api/platform-admin/accounts/:id] members fetch error:", membersErr);
      return NextResponse.json({ error: "Failed to load account" }, { status: 500 });
    }

    // Never decrypt secrets here — same write-only posture as the
    // account's own Settings UI (MASKED_KEY in ai-config.tsx): the
    // admin panel shows *whether* something is configured, not the
    // value, even partially.
    const { data: aiConfig } = await db
      .from("ai_configs")
      .select("provider, model, is_active, auto_reply_enabled")
      .eq("account_id", accountId)
      .maybeSingle();

    // whatsapp_config is account-scoped (UNIQUE(account_id) since
    // 017_account_sharing.sql) — one connection per account, not per
    // member, despite the `user_id` audit column on the row.
    const { data: whatsappConfig } = await db
      .from("whatsapp_config")
      .select("phone_number_id, waba_id, status, connected_at, registered_at, last_registration_error")
      .eq("account_id", accountId)
      .maybeSingle();

    const { data: conversionConfig } = await db
      .from("conversion_tracking_config")
      .select("meta_pixel_id, meta_track_lead_created, meta_track_deal_won, meta_track_first_reply, meta_track_automations, google_ads_conversion_id")
      .eq("account_id", accountId)
      .maybeSingle();

    const { data: loginEvents } = await db
      .from("login_events")
      .select("user_id, ip_address, browser, device, country, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(5);

    const { data: tags, error: tagsErr } = await db
      .from("account_tags")
      .select("id, label")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true });

    if (tagsErr) {
      console.error("[GET /api/platform-admin/accounts/:id] tags fetch error:", tagsErr);
    }

    const { data: notes, error: notesErr } = await db
      .from("account_notes")
      .select("id, body, author_user_id, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (notesErr) {
      console.error("[GET /api/platform-admin/accounts/:id] notes fetch error:", notesErr);
    }

    const quota = await getAiTokenQuotaStatus(db, accountId);

    const { data: recentErrors, error: errorsErr } = await db
      .from("integration_errors")
      .select("id, source, code, message, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (errorsErr) {
      console.error("[GET /api/platform-admin/accounts/:id] integration_errors fetch error:", errorsErr);
    }

    const authorIds = [...new Set((notes ?? []).map((n) => n.author_user_id).filter(Boolean))] as string[];
    const authorNames = new Map<string, string | null>();
    await Promise.all(
      authorIds.map(async (id) => {
        const { data } = await db.auth.admin.getUserById(id);
        authorNames.set(
          id,
          (data?.user?.user_metadata?.full_name as string | undefined) ?? data?.user?.email ?? null,
        );
      }),
    );

    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
        ownerUserId: account.owner_user_id,
        plan: account.plan,
        subscriptionStatus: account.subscription_status,
        trialEndsAt: account.trial_ends_at,
        includedSeats: account.included_seats,
        createdAt: account.created_at,
        logoUrl: account.logo_url,
        aiAccessBlocked: account.ai_access_blocked,
        aiTokenLimitOverride: account.ai_token_limit_override,
      },
      aiQuota: quota,
      recentErrors: (recentErrors ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        code: e.code,
        message: e.message,
        createdAt: e.created_at,
      })),
      members: (members ?? []).map((m) => ({
        userId: m.user_id,
        fullName: m.full_name,
        email: m.email,
        phone: m.phone,
        role: m.account_role,
        avatarUrl: m.avatar_url,
      })),
      integrations: {
        ai: aiConfig
          ? {
              provider: aiConfig.provider,
              model: aiConfig.model,
              isActive: aiConfig.is_active,
              autoReplyEnabled: aiConfig.auto_reply_enabled,
            }
          : null,
        whatsapp: whatsappConfig
          ? {
              phoneNumberId: whatsappConfig.phone_number_id,
              wabaId: whatsappConfig.waba_id,
              status: whatsappConfig.status,
              connectedAt: whatsappConfig.connected_at,
              registeredAt: whatsappConfig.registered_at,
              lastRegistrationError: whatsappConfig.last_registration_error,
            }
          : null,
        googleCalendar: (members ?? [])
          .filter((m) => m.google_calendar_connected)
          .map((m) => m.full_name ?? m.email ?? "—"),
        metaCapi: conversionConfig
          ? {
              hasPixelId: !!conversionConfig.meta_pixel_id,
              trackLeadCreated: conversionConfig.meta_track_lead_created,
              trackDealWon: conversionConfig.meta_track_deal_won,
              trackFirstReply: conversionConfig.meta_track_first_reply,
              trackAutomations: conversionConfig.meta_track_automations,
              hasGoogleAdsId: !!conversionConfig.google_ads_conversion_id,
            }
          : null,
      },
      sessions: (loginEvents ?? []).map((s) => {
        const member = (members ?? []).find((m) => m.user_id === s.user_id);
        return {
          memberName: member?.full_name ?? member?.email ?? "—",
          ipAddress: s.ip_address,
          browser: s.browser,
          device: s.device,
          country: s.country,
          createdAt: s.created_at,
        };
      }),
      tags: (tags ?? []).map((t) => ({ id: t.id, label: t.label })),
      notes: (notes ?? []).map((n) => ({
        id: n.id,
        body: n.body,
        authorName: n.author_user_id ? (authorNames.get(n.author_user_id) ?? null) : null,
        createdAt: n.created_at,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
