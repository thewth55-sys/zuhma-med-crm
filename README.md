# Zuhma Med CRM — CRM/EHR médico multi-tenant

> CRM/EHR para clínicas y consultorios médicos — bandeja de WhatsApp
> compartida, pipeline de pacientes, agenda de doctores/consultorios,
> expediente clínico, facturación, y automatizaciones sin código.
> Fork de [wacrm](https://github.com/ArnasDon/wacrm) (MIT).

[![License: MIT](https://img.shields.io/badge/License-MIT-violet.svg)](./LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ecf8e?logo=supabase)](https://supabase.com)

CRM/EHR multi-tenant que **Zuhma** ofrece como value-add a sus clientes. Las
cuentas las crea un admin de plataforma (sin signup público). Repositorio
privado — este README es referencia para el equipo.

## Qué incluye

- **Shared inbox** on the official WhatsApp Business API — multiple
  agents working one number, per-conversation assignment, status, and
  notes.
- **Contacts + tags + custom fields**, CSV import, deduplication.
- **Sales pipelines** (Kanban) with deals linked to conversations.
- **Broadcasts** with Meta-approved templates, delivery + read
  tracking, per-recipient variable substitution.
- **No-code automations** — triggers on inbound messages, new
  contacts, keywords, or schedule; conditional branches, waits,
  tags, webhooks. Visual builder.
- **AI reply assistant** — bring your own OpenAI or Anthropic key
  (stored encrypted). One-click AI-drafted replies in the inbox, plus an
  optional auto-reply bot with a per-conversation cap and clean human
  handoff. Add a **knowledge base** and it answers from your own content
  — hybrid retrieval (Postgres full-text, or semantic pgvector when an
  embeddings key is set).
- **Real-time dashboard** — response times, daily volume, pipeline
  value, cross-module activity feed.
- **Team accounts** — role-based access (owner / admin / agent /
  viewer), ownership transfer. Every install is account-scoped, so one
  shared inbox can be staffed by a whole team.
- **Patient records + billing/invoices.**
- **Public REST API** (`/api/v1`) with scoped, revocable API keys. See
  [docs/public-api.md](./docs/public-api.md).
- **MCP server** — drive the CRM from Claude, Cursor, and other AI
  assistants over the [Model Context Protocol](https://modelcontextprotocol.io).
  Read-only by default, opt-in writes. See [docs/mcp.md](./docs/mcp.md)
  (server in [`mcp-server/`](./mcp-server)).

## Stack

- **App** — Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
- **Data** — Supabase (Postgres + Auth + Storage + RLS).
- **WhatsApp** — Meta Cloud API (official WhatsApp Business API).

## Desarrollo

```bash
git clone https://github.com/thewth55-sys/zuhma-med-crm.git
cd zuhma-med-crm
npm install
cp .env.local.example .env.local   # Supabase + Meta
npm run dev
```

Abre <http://localhost:3000> (redirige a `/login`, o `/dashboard` si ya hay
sesión). Scripts, migraciones y flujo de trabajo en
[`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Seguridad

Reporta vulnerabilidades de forma privada — ver
[`.github/SECURITY.md`](./.github/SECURITY.md).

## Licencia

[MIT](./LICENSE). Fork de [wacrm](https://github.com/ArnasDon/wacrm); el
copyright original se conserva en `LICENSE`.
