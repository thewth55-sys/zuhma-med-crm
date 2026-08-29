# Contribuir a Zuhma Med CRM

Repositorio privado del producto (Zuhma). Guía rápida para el equipo.

## Puesta en marcha

```bash
git clone https://github.com/thewth55-sys/zuhma-med-crm.git
cd zuhma-med-crm
cp .env.local.example .env.local   # Supabase + Meta
npm install
npm run dev
```

Setup completo (migraciones de Supabase, WhatsApp Business API, deploy) — ver
[`docs/`](./docs/).

## Flujo de trabajo

- Rama desde el último `main`; un cambio lógico por PR.
- Corre `npm run typecheck` y `npm run format` antes de subir.
- Primera línea del commit: imperativa y breve; el cuerpo explica el *porqué*,
  el diff muestra el *qué*.
- Llena la plantilla de PR, en especial el **Test plan**.

## Reportar seguridad

**No abras issues públicos de seguridad.** Sigue el flujo privado en
[`.github/SECURITY.md`](./.github/SECURITY.md).

## Referencia de scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Turbopack dev server en el puerto 3000. |
| `npm run build` | Build de producción (Next corre su propio typecheck). |
| `npm run typecheck` | `tsc --noEmit`. Pasada rápida solo de TS. |
| `npm run lint` | ESLint. |
| `npm run format` | Prettier write. |
| `npm run format:check` | Prettier en modo check (útil en CI). |

## Licencia

Fork de [wacrm](https://github.com/ArnasDon/wacrm), MIT ([`LICENSE`](./LICENSE)).
El copyright original se conserva; tus adiciones son tuyas.
