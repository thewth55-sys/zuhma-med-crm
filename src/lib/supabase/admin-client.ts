import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazy, shared service-role client for server-side code that must
// bypass RLS (webhooks, platform-admin routes, public booking, etc).
// Mirrors the pattern used by src/lib/automations/admin-client.ts,
// src/lib/ai/admin-client.ts, src/lib/flows/admin-client.ts, and
// src/app/api/whatsapp/webhook/route.ts.
//
// Moved here when the Stripe-based SaaS subscription-billing module
// was removed from this fork, since this client itself has nothing to
// do with billing and is consumed broadly (platform-admin, public
// booking, integrations, auth).
let _adminClient: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _adminClient
}
