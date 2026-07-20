FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Expose build arguments for env variables (required by Next.js at build time)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG SUPABASE_SERVICE_ROLE_KEY
ARG ENCRYPTION_KEY
ARG META_APP_SECRET
ARG META_APP_ID
ARG NEXT_PUBLIC_META_APP_ID
ARG NEXT_PUBLIC_META_WA_SIGNUP_CONFIG_ID
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_APP_LOCALE
ARG STRIPE_SECRET_KEY
ARG STRIPE_WEBHOOK_SECRET
ARG STRIPE_PRICE_STANDALONE_BASE
ARG STRIPE_PRICE_STANDALONE_SEAT
ARG STRIPE_PRICE_ZENTRO_SALUD_STARTER
ARG STRIPE_PRICE_ZENTRO_SALUD_PRO
ARG STRIPE_PRICE_SEAT_ADDON
ARG BILLING_CRON_SECRET
ARG RESEND_API_KEY
ARG RESEND_FROM_EMAIL
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_AUTH_TOKEN

# Inject build arguments as environment variables for next build
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
ENV ENCRYPTION_KEY=$ENCRYPTION_KEY
ENV META_APP_SECRET=$META_APP_SECRET
ENV META_APP_ID=$META_APP_ID
ENV NEXT_PUBLIC_META_APP_ID=$NEXT_PUBLIC_META_APP_ID
ENV NEXT_PUBLIC_META_WA_SIGNUP_CONFIG_ID=$NEXT_PUBLIC_META_WA_SIGNUP_CONFIG_ID
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_APP_LOCALE=$NEXT_PUBLIC_APP_LOCALE
ENV STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY
ENV STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET
ENV STRIPE_PRICE_STANDALONE_BASE=$STRIPE_PRICE_STANDALONE_BASE
ENV STRIPE_PRICE_STANDALONE_SEAT=$STRIPE_PRICE_STANDALONE_SEAT
ENV STRIPE_PRICE_ZENTRO_SALUD_STARTER=$STRIPE_PRICE_ZENTRO_SALUD_STARTER
ENV STRIPE_PRICE_ZENTRO_SALUD_PRO=$STRIPE_PRICE_ZENTRO_SALUD_PRO
ENV STRIPE_PRICE_SEAT_ADDON=$STRIPE_PRICE_SEAT_ADDON
ENV BILLING_CRON_SECRET=$BILLING_CRON_SECRET
ENV RESEND_API_KEY=$RESEND_API_KEY
ENV RESEND_FROM_EMAIL=$RESEND_FROM_EMAIL
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV SENTRY_DSN=$SENTRY_DSN
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN

# Caps V8's heap during `next build`. Without this, V8 tries to grow
# memory unbounded on a constrained host; the kernel OOM-kills the
# process with NO error output at all (the build just stops dead —
# at "Running TypeScript ...", "Creating an optimized production
# build ...", or "Collecting page data ...", same signature, just a
# different point in the pipeline depending on what's heaviest that
# build), which is what happened repeatedly on this VPS as the
# codebase's build weight grew (Sentry, then the Puck-based landing
# builder). History: 1536 → 2048 (Sentry) did not fix it alone;
# disabling Sentry sourcemaps, webpack's persistent cache, and the
# TypeScript check all reduced the WORK done and helped, but the
# build still hung at "Collecting page data" with 2 parallel workers.
# Previous cap raises alone never fixed anything, because with
# multiple parallel workers the SUM of their heaps could still exceed
# the container's real memory regardless of each one's individual
# cap. next.config.ts forces `experimental.cpus: 1`, which removes
# SIBLING workers contending with each other — but it does NOT mean
# only one Node process is alive during "Collecting page data" /
# "Generating static pages": Next spawns that one worker as a CHILD
# of the main `next build` process, which stays resident (and, with
# webpack's cache disabled, still holding whatever it hasn't
# GC'd from compiling) while the worker runs. NODE_OPTIONS is
# inherited by the child, so BOTH processes could independently grow
# toward this same cap — raising it to "map directly to usable
# memory" assumed a single process and silently doubled the real
# ceiling instead. Confirmed this host has 4GB total. 2 processes ×
# 2560MB each could reach ~5GB combined, over the real limit — which
# is consistent with the build hanging at exactly this phase even
# after that raise. Lowered so 2 processes at cap (~3GB) leaves ~1GB
# for the OS/container overhead instead of assuming only one process
# is ever resident.
#
# Lowered again 2026-07-16: the codebase grew enough (AI agenda tool
# calling batch) that 1536MB × 2 processes hung at this same phase a
# second time. This value isn't a one-time constant — it needs
# revisiting as the app grows, since the real constraint is the fixed
# 4GB container ceiling, not this number. If it recurs again, the more
# durable fix is raising the container's actual memory limit rather
# than continuing to shrink this cap toward the point a single
# process can't fit the build at all. Verified locally that a full
# build still completes at this value before lowering.
# Override via the NODE_BUILD_MEMORY_MB build arg.
ARG NODE_BUILD_MEMORY_MB=1024
ENV NODE_OPTIONS=--max-old-space-size=${NODE_BUILD_MEMORY_MB}

# Build the project
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Disable telemetry during runtime
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
CMD ["node", "server.js"]
