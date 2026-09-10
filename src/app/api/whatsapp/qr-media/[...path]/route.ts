import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/whatsapp/admin-client'

// Serves media received over the unofficial QR/Baileys connection.
// Counterpart to src/app/api/whatsapp/media/[mediaId]/route.ts (the
// Meta equivalent), but backed by our own private Supabase Storage
// bucket (qr-inbound-media, migration 117) instead of proxying Meta's
// CDN live — see services/wa-qr-gateway/src/media.ts for why QR media
// has to be persisted once, up front, instead of re-fetched on demand.
//
// `path` is the object's full storage path, e.g.
// "account-<uuid>/<message-id>.jpg" (see sessions.ts's
// `mediaUrl: \`/api/whatsapp/qr-media/${media.storagePath}\``) — the
// leading "account-<uuid>" segment is checked against the caller's own
// account before anything is served, same access boundary the Meta
// proxy enforces via its own account resolution.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params
    if (!path || path.length < 2) {
      return NextResponse.json({ error: 'Invalid media path' }, { status: 400 })
    }
    const storagePath = path.join('/')
    const accountSegment = path[0]

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 }
      )
    }

    if (accountSegment !== `account-${accountId}`) {
      // Not this account's media — same as a 404 from the caller's
      // point of view, but logged distinctly for our own visibility.
      console.warn(`[qr-media] account ${accountId} requested media outside its own scope: ${storagePath}`)
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { data: signed, error: signError } = await supabaseAdmin()
      .storage.from('qr-inbound-media')
      .createSignedUrl(storagePath, 3600)

    if (signError || !signed?.signedUrl) {
      console.error('[qr-media] failed to sign URL:', signError?.message)
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    return NextResponse.redirect(signed.signedUrl)
  } catch (error) {
    console.error('Error in qr-media GET:', error)
    return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 })
  }
}
