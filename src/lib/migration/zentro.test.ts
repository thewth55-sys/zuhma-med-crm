import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  accountIdForUser,
  isAccountMigrated,
  loginBlocked,
  migratedAccountIds,
  migrationInfoForUser,
  zentroAppUrl,
  zentroLoginUrl,
} from './zentro';

const ENV_KEYS = [
  'MIGRATED_ACCOUNT_IDS',
  'ZENTRO_LOGIN_URL',
  'ZENTRO_APP_URL',
  'MIGRATION_LOGIN_BLOCK_AT',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const PLAY_STORE =
  'https://play.google.com/store/apps/details?id=com.zentrolabs.zentromed';

let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('migratedAccountIds', () => {
  it('is empty when the variable is missing, blank, or only commas', () => {
    delete process.env.MIGRATED_ACCOUNT_IDS;
    expect(migratedAccountIds().size).toBe(0);

    process.env.MIGRATED_ACCOUNT_IDS = '   ';
    expect(migratedAccountIds().size).toBe(0);

    process.env.MIGRATED_ACCOUNT_IDS = ' , , ';
    expect(migratedAccountIds().size).toBe(0);
  });

  it('trims, lowercases, and drops empty segments', () => {
    process.env.MIGRATED_ACCOUNT_IDS = ' ABC, Def , ,xyz ';
    expect([...migratedAccountIds()]).toEqual(['abc', 'def', 'xyz']);
  });

  it('dedupes case-insensitively', () => {
    process.env.MIGRATED_ACCOUNT_IDS = 'abc, ABC, abc ';
    expect(migratedAccountIds().size).toBe(1);
  });
});

describe('isAccountMigrated', () => {
  it('is false for every id when the set is empty', () => {
    delete process.env.MIGRATED_ACCOUNT_IDS;
    expect(isAccountMigrated('abc')).toBe(false);
    expect(isAccountMigrated(null)).toBe(false);
    expect(isAccountMigrated(undefined)).toBe(false);
    expect(isAccountMigrated('')).toBe(false);
  });

  it('matches case-insensitively and ignores surrounding space', () => {
    process.env.MIGRATED_ACCOUNT_IDS = 'abc,def';
    expect(isAccountMigrated('ABC')).toBe(true);
    expect(isAccountMigrated('  DeF ')).toBe(true);
    expect(isAccountMigrated('nope')).toBe(false);
    expect(isAccountMigrated('  ')).toBe(false);
  });
});

describe('loginBlocked', () => {
  it('is false when the cutoff is missing, blank, or not a date', () => {
    delete process.env.MIGRATION_LOGIN_BLOCK_AT;
    expect(loginBlocked(new Date('2026-06-01T00:00:00.000Z'))).toBe(false);

    process.env.MIGRATION_LOGIN_BLOCK_AT = '   ';
    expect(loginBlocked(new Date('2026-06-01T00:00:00.000Z'))).toBe(false);

    process.env.MIGRATION_LOGIN_BLOCK_AT = 'not-a-date';
    expect(loginBlocked(new Date('2026-06-01T00:00:00.000Z'))).toBe(false);
  });

  it('blocks from the ISO instant onward, inclusive', () => {
    process.env.MIGRATION_LOGIN_BLOCK_AT = '  2026-06-01T00:00:00.000Z  ';
    expect(loginBlocked(new Date('2026-05-31T23:59:59.000Z'))).toBe(false);
    expect(loginBlocked(new Date('2026-06-01T00:00:00.000Z'))).toBe(true);
    expect(loginBlocked(new Date('2026-06-01T00:00:01.000Z'))).toBe(true);
  });
});

describe('zentroLoginUrl', () => {
  it('defaults to Zentro and appends email plus from=zuhma', () => {
    delete process.env.ZENTRO_LOGIN_URL;
    const url = new URL(zentroLoginUrl('ada@clinic.com'));
    expect(url.origin + url.pathname).toBe('https://med.zentrolabs.com/login');
    expect(url.searchParams.get('email')).toBe('ada@clinic.com');
    expect(url.searchParams.get('from')).toBe('zuhma');
    expect(url.search).toBe('?email=ada%40clinic.com&from=zuhma');
  });

  it('omits email when it is missing but still marks from=zuhma', () => {
    delete process.env.ZENTRO_LOGIN_URL;
    const url = new URL(zentroLoginUrl());
    expect(url.searchParams.get('email')).toBeNull();
    expect(url.searchParams.get('from')).toBe('zuhma');
    expect(url.search).toBe('?from=zuhma');
  });

  it('uses a configured base and keeps its existing query', () => {
    process.env.ZENTRO_LOGIN_URL = 'https://med.example.com/entrar?lang=es';
    const url = new URL(zentroLoginUrl('a b@c.com'));
    expect(url.origin + url.pathname).toBe('https://med.example.com/entrar');
    expect(url.searchParams.get('lang')).toBe('es');
    expect(url.searchParams.get('email')).toBe('a b@c.com');
    expect(url.searchParams.get('from')).toBe('zuhma');
  });

  it('falls back to the default when the configured URL is blank or invalid', () => {
    process.env.ZENTRO_LOGIN_URL = '   ';
    expect(new URL(zentroLoginUrl('a@b.co')).origin).toBe(
      'https://med.zentrolabs.com'
    );

    process.env.ZENTRO_LOGIN_URL = 'not a url';
    expect(new URL(zentroLoginUrl('a@b.co')).pathname).toBe('/login');
  });
});

describe('zentroAppUrl', () => {
  it('uses the Play Store listing when the variable is unset', () => {
    delete process.env.ZENTRO_APP_URL;
    expect(zentroAppUrl()).toBe(PLAY_STORE);
  });

  it('returns null when the variable is defined but empty', () => {
    process.env.ZENTRO_APP_URL = '';
    expect(zentroAppUrl()).toBeNull();

    process.env.ZENTRO_APP_URL = '   ';
    expect(zentroAppUrl()).toBeNull();
  });

  it('returns a trimmed custom URL', () => {
    process.env.ZENTRO_APP_URL = '  https://example.com/app  ';
    expect(zentroAppUrl()).toBe('https://example.com/app');
  });
});

describe('account lookup is a no-op when no accounts are listed', () => {
  it('does not query the database', async () => {
    delete process.env.MIGRATED_ACCOUNT_IDS;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await expect(accountIdForUser('user-1')).resolves.toBeNull();
    await expect(
      migrationInfoForUser('user-1', 'ada@clinic.com')
    ).resolves.toBeNull();
  });

  it('stays a no-op for a whitespace-only list', async () => {
    process.env.MIGRATED_ACCOUNT_IDS = '  ,  ';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await expect(accountIdForUser('user-1')).resolves.toBeNull();
    await expect(
      migrationInfoForUser('user-1', 'ada@clinic.com')
    ).resolves.toBeNull();
  });
});
