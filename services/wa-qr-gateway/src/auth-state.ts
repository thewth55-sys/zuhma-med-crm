import {
  BufferJSON,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from 'baileys';
import type { Logger } from 'pino';
import { supabaseAdmin } from './supabase.js';
import { encrypt, decrypt } from './encryption.js';

// Baileys ships `useMultiFileAuthState`, which persists creds + every
// signal key as one file per key under a folder — fine for a bot, not for
// a multi-tenant service whose whole point is to survive container
// recreation without depending on a disk volume. This stores the
// equivalent state as ONE encrypted JSON blob per account in
// whatsapp_config.qr_auth_state instead (see migration 115), matching the
// plan's decision to keep all QR session state in Postgres.
//
// Trade-off accepted deliberately: every key mutation rewrites the whole
// blob, not just the changed key. Baileys' own multi-file implementation
// has the same "rewrite on every set()" behavior per-file; the only
// difference here is the unit of writing is one row instead of many
// files. A single WhatsApp Web session's key material stays small enough
// (tens of KB) that this is not a real cost at Phase 1's scale — revisit
// if/when a single account's blob grows large enough to matter.

interface StoredAuthBlob {
  creds: AuthenticationCreds;
  keys: Record<string, Record<string, unknown>>;
}

async function loadBlob(accountId: string): Promise<StoredAuthBlob | null> {
  const { data, error } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('qr_auth_state')
    .eq('account_id', accountId)
    .eq('provider', 'qr')
    .maybeSingle();
  if (error || !data?.qr_auth_state) return null;
  try {
    const json = decrypt(data.qr_auth_state as string);
    return JSON.parse(json, BufferJSON.reviver) as StoredAuthBlob;
  } catch (err) {
    console.error(`[auth-state] failed to decrypt/parse stored state for ${accountId}:`, err);
    return null;
  }
}

async function persistBlob(accountId: string, blob: StoredAuthBlob): Promise<void> {
  const json = JSON.stringify(blob, BufferJSON.replacer);
  const encrypted = encrypt(json);
  const { error } = await supabaseAdmin()
    .from('whatsapp_config')
    .update({ qr_auth_state: encrypted })
    .eq('account_id', accountId)
    .eq('provider', 'qr');
  if (error) {
    console.error(`[auth-state] failed to persist state for ${accountId}:`, error.message);
  }
}

export interface SupabaseAuthState {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}

/** Loads (or initializes) an account's Baileys auth state from Postgres,
 *  and returns Baileys' expected `{ state, saveCreds }` shape. Every
 *  `keys.set()` and every `saveCreds()` call serializes the CURRENT
 *  in-memory blob (creds + keys) and writes it back in full — writes are
 *  chained through `writeQueue` so concurrent key updates during initial
 *  pairing can't race and clobber each other. */
export async function loadSupabaseAuthState(
  accountId: string,
  logger: Logger
): Promise<SupabaseAuthState> {
  const existing = await loadBlob(accountId);
  const creds: AuthenticationCreds = existing?.creds ?? initAuthCreds();
  const keys: Record<string, Record<string, unknown>> = existing?.keys ?? {};

  let writeQueue: Promise<void> = Promise.resolve();
  const persist = () => {
    writeQueue = writeQueue
      .then(() => persistBlob(accountId, { creds, keys }))
      .catch((err) => console.error(`[auth-state] write queue error for ${accountId}:`, err));
    return writeQueue;
  };

  const baseStore = {
    get: async <T extends keyof SignalDataTypeMap>(
      type: T,
      ids: string[]
    ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
      const result: { [id: string]: SignalDataTypeMap[T] } = {};
      const bucket = keys[type] ?? {};
      for (const id of ids) {
        let value = bucket[id];
        if (type === 'app-state-sync-key' && value) {
          value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
        }
        if (value !== undefined) {
          result[id] = value as SignalDataTypeMap[T];
        }
      }
      return result;
    },
    set: async (data: { [T in keyof SignalDataTypeMap]?: Record<string, SignalDataTypeMap[T] | null> }) => {
      for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
        const bucket = (keys[category] ??= {});
        const entries = data[category];
        if (!entries) continue;
        for (const id of Object.keys(entries)) {
          const value = entries[id];
          if (value) {
            bucket[id] = value;
          } else {
            delete bucket[id];
          }
        }
      }
      await persist();
    },
  };

  return {
    state: {
      creds,
      keys: makeCacheableSignalKeyStore(baseStore, logger),
    },
    saveCreds: () => persist(),
  };
}
