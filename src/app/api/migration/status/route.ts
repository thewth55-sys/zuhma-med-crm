import { NextResponse } from 'next/server';

import { migrationInfoForUser } from '@/lib/migration/zentro';
import { createClient } from '@/lib/supabase/server';

/**
 * Estado de migración de la sesión actual. Sin
 * `MIGRATED_ACCOUNT_IDS` responde `{ migrated: false }` y no consulta
 * `profiles`.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const info = await migrationInfoForUser(user.id, user.email);
  return NextResponse.json(info ?? { migrated: false });
}
