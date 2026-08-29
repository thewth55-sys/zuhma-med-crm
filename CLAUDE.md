@AGENTS.md

# Zuhma Med CRM

## What this is

A multi-tenant WhatsApp CRM/EHR for clinics — shared WhatsApp inbox,
patient pipeline, doctor/room scheduling, clinical records, invoicing,
and no-code automations. Offered **free, as a value-add to Zuhma's own
marketing clients** — it is not sold standalone, has **no billing of
its own**, and every account gets full, equal access.

Private GitHub repo: `github.com/thewth55-sys/zuhma-med-crm`. Deployed
via Easypanel at `medcrm.zuhma.online` (project name in Easypanel:
`medcrm`).

## Scope of this build

No subscription model:
- No Stripe billing, no plan tiers, no per-plan gating — every account
  has full, equal access to all features.
- Public self-serve signup is disabled — accounts are created only by a
  Zuhma platform admin from `/admin` (`POST /api/platform-admin/accounts`),
  which invites the owner by email. `/signup` only handles accepting an
  existing team invite.
- `/` redirects to `/login` (no public marketing landing).

Uncapped by default:
- Patient count per account (migration `068_open_plan_unlimited_patients.sql`).
- AI token usage per account (`src/lib/ai/quota.ts`) — a platform admin
  can still set a manual `ai_token_limit_override` per account for cost
  control; it is not plan-driven.

Branding: Zuhma's coral accent (`#F94B5A`, theme id `"zuhma"` in
`src/lib/themes.ts` / `src/app/globals.css`), the Zuhma isotipo
(`public/zuhma-isotipo.png`, favicon, PWA icons), Zuhma wordmark SVG at
`public/zuhma-logo.svg`.

The `accounts.plan` column is kept only as inert metadata (values
`trial` / `standalone`) — nothing reads it for gating. Historical
migrations are never edited in place; only ever append new ones.

## Deployment — things that trip up a fresh setup

- **Needs its own Supabase project.** Run `supabase link --project-ref
  <ref>` then `supabase db push` to apply all migrations.
- A brand-new Supabase project installs `uuid-ossp` into the
  `extensions` schema, not `public` — migration
  `000_uuid_generate_v4_compat.sql` papers over that so migrations 001+
  (which all call bare `uuid_generate_v4()`) don't fail. Don't remove it.
- **No public signup** means there's no way to create the first user
  through the UI. Bootstrap the first platform admin manually:
  1. Supabase Dashboard → Authentication → Users → Add user (don't
     insert into `auth.users` by hand — GoTrue owns fields raw SQL
     will get wrong).
  2. `insert into platform_admins (user_id) select id from auth.users
     where email = '...';`
  3. Log in at `/login`, go to `/admin`, use "Nueva cuenta" to create
     the first real clinic account (this sends the clinic owner an
     invite email via `inviteUserByEmail`, which `handle_new_user()`
     turns into an `accounts` + `profiles` row automatically).
- Required env vars to boot at all: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — the
  middleware throws on every request without them (a generic 500).
  See `.env.local.example` for the full list (WhatsApp, Resend, AI
  providers, etc. are optional beyond that).

## Known follow-ups (not yet done)

- Production domain is still the placeholder `app.zuhma.com` in a few
  places (Supabase `site_url`/redirect URLs in `supabase/config.toml`,
  email footer links) — the real deploy domain is `medcrm.zuhma.online`.
  Should reconcile these once the domain is final.
- The marketing copy inside `src/app/landing-content.ts` /
  `src/app/crm/landing-content.ts` was never rewritten (only the CTA
  links were repointed) — but `/` no longer renders that file at all
  (it redirects straight to `/login`), so this is dead content now, not
  a live inconsistency. Safe to delete if confirmed unused.
