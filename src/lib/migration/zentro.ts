import { supabaseAdmin } from '@/lib/supabase/admin-client';

/**
 * Transición de cuentas ya mudadas a Zentro Med.
 *
 * Todo este módulo es no-op cuando `MIGRATED_ACCOUNT_IDS` está vacío o
 * no está definido: no se consulta la base y el login / callback /
 * dashboard siguen igual. Las variables se leen en cada request
 * (server-side, sin prefijo NEXT_PUBLIC_).
 */

const DEFAULT_ZENTRO_LOGIN_URL = 'https://med.zentrolabs.com/login';
const DEFAULT_ZENTRO_APP_URL =
  'https://play.google.com/store/apps/details?id=com.zentrolabs.zentromed';

export type MigrationInfo = {
  migrated: true;
  blocked: boolean;
  zentroLoginUrl: string;
  zentroAppUrl: string | null;
};

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === 'string' ? value : undefined;
}

/** IDs de `accounts.id` marcados como migrados. Trim + lowercase. */
export function migratedAccountIds(): Set<string> {
  const raw = readEnv('MIGRATED_ACCOUNT_IDS');
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0)
  );
}

export function isAccountMigrated(id: string | null | undefined): boolean {
  if (!id?.trim()) return false;
  const ids = migratedAccountIds();
  if (ids.size === 0) return false;
  return ids.has(id.trim().toLowerCase());
}

/**
 * `true` desde `MIGRATION_LOGIN_BLOCK_AT` (ISO-8601, inclusive).
 * Sin variable, vacía o ilegible → no bloquea. No hay fecha hardcodeada.
 */
export function loginBlocked(now: Date = new Date()): boolean {
  const raw = readEnv('MIGRATION_LOGIN_BLOCK_AT')?.trim();
  if (!raw) return false;
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return false;
  return now.getTime() >= at.getTime();
}

/** Login de Zentro. Siempre agrega `from=zuhma`; `email` solo si viene. */
export function zentroLoginUrl(email?: string | null): string {
  const configured = readEnv('ZENTRO_LOGIN_URL')?.trim();
  let url: URL;
  try {
    url = new URL(configured || DEFAULT_ZENTRO_LOGIN_URL);
  } catch {
    url = new URL(DEFAULT_ZENTRO_LOGIN_URL);
  }
  const trimmed = email?.trim();
  if (trimmed) url.searchParams.set('email', trimmed);
  url.searchParams.set('from', 'zuhma');
  return url.toString();
}

/**
 * URL de la app oficial.
 * - Variable ausente → Play Store.
 * - Definida pero vacía (o solo espacios) → `null` (sin botón).
 */
export function zentroAppUrl(): string | null {
  const raw = readEnv('ZENTRO_APP_URL');
  if (raw === undefined) return DEFAULT_ZENTRO_APP_URL;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/**
 * `profiles.account_id` del usuario. Si el set de cuentas migradas está
 * vacío, retorna `null` sin tocar la base.
 */
export async function accountIdForUser(userId: string): Promise<string | null> {
  if (migratedAccountIds().size === 0) return null;

  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[migration] account lookup failed:', error);
    return null;
  }

  const accountId = data?.account_id;
  return typeof accountId === 'string' && accountId ? accountId : null;
}

/**
 * Info de migración para pintar el aviso / rechazar el login.
 * `null` si la cuenta no está en la lista (o la lista está vacía).
 */
export async function migrationInfoForUser(
  userId: string,
  email?: string | null
): Promise<MigrationInfo | null> {
  const accountId = await accountIdForUser(userId);
  if (!isAccountMigrated(accountId)) return null;
  return {
    migrated: true,
    blocked: loginBlocked(),
    zentroLoginUrl: zentroLoginUrl(email),
    zentroAppUrl: zentroAppUrl(),
  };
}
