'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Megaphone, X } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type { PlatformAnnouncement } from '@/types'

const AUTO_ROTATE_MS = 7000

/**
 * Platform-admin-controlled promo/announcement slider. Reads directly
 * from `platform_announcements` via the browser client — RLS itself
 * (migration 082) already restricts rows to "active and currently
 * live", so no dedicated API route is needed, same as how
 * bank-account-detail.tsx reads payments/expenses directly.
 *
 * Dismissal is per-browser (localStorage), not server-side — an admin
 * un-dismissing a promo for everyone isn't a real need here, and this
 * avoids a write-endpoint for something purely cosmetic.
 */
function readDismissed(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('dismissedAnnouncements')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function AnnouncementsCarousel() {
  const [items, setItems] = useState<PlatformAnnouncement[]>([])
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('platform_announcements')
      .select('*')
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error('[dashboard] announcements failed:', error)
          return
        }
        setItems(data ?? [])
      })
  }, [])

  const visible = items.filter((a) => !dismissed.includes(a.id))

  useEffect(() => {
    if (visible.length < 2) return
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % visible.length)
    }, AUTO_ROTATE_MS)
    return () => clearInterval(timer)
  }, [visible.length])

  if (visible.length === 0) return null

  const current = visible[index % visible.length]

  function dismiss(id: string) {
    const next = [...dismissed, id]
    setDismissed(next)
    try {
      localStorage.setItem('dismissedAnnouncements', JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  const content = (
    <div className="flex items-center gap-3 min-w-0">
      {current.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={current.image_url}
          alt=""
          className="hidden size-10 shrink-0 rounded-lg object-cover sm:block"
        />
      ) : (
        <div className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:flex">
          <Megaphone className="size-5 text-primary" />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{current.title}</p>
        <p className="truncate text-xs text-muted-foreground">{current.body}</p>
      </div>
    </div>
  )

  return (
    <section className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      {visible.length > 1 && (
        <button
          type="button"
          aria-label="Anterior"
          onClick={() => setIndex((i) => (i - 1 + visible.length) % visible.length)}
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        {current.link_url ? (
          <Link href={current.link_url} className="block hover:opacity-90">
            {content}
          </Link>
        ) : (
          content
        )}
      </div>

      {current.link_url && current.link_label && (
        <Link
          href={current.link_url}
          className="hidden shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 sm:block"
        >
          {current.link_label}
        </Link>
      )}

      {visible.length > 1 && (
        <button
          type="button"
          aria-label="Siguiente"
          onClick={() => setIndex((i) => (i + 1) % visible.length)}
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
        >
          <ChevronRight className="size-4" />
        </button>
      )}

      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => dismiss(current.id)}
        className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
      >
        <X className="size-3.5" />
      </button>
    </section>
  )
}
