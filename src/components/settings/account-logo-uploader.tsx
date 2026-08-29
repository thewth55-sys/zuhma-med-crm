'use client';

// ============================================================
// AccountLogoUploader — sets accounts.logo_url.
//
// Two consumers of this one field: the sidebar app mark for this
// account's own users (white-labeling — see sidebar.tsx) and the
// header image on generated quote PDFs (quote-pdf-document.tsx).
// Upload reuses the same account-scoped Storage helper the inbox
// composer and Flows builder already use, pointed at the `chat-media`
// bucket (already public, already allows image/png|jpeg|webp).
// ============================================================

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Upload, X } from 'lucide-react';

import { uploadAccountMedia, MEDIA_MAX_BYTES_BY_KIND } from '@/lib/storage/upload-media';

interface AccountLogoUploaderProps {
  logoUrl: string | null;
  editable: boolean;
  onSaved: (logoUrl: string | null) => void;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

async function patchLogo(logoUrl: string | null): Promise<boolean> {
  const res = await fetch('/api/account', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logo_url: logoUrl }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    toast.error(body?.error ?? 'No se pudo actualizar el logo');
    return false;
  }
  return true;
}

export function AccountLogoUploader({ logoUrl, editable, onSaved }: AccountLogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Usa una imagen PNG, JPEG o WebP');
      return;
    }
    if (file.size > MEDIA_MAX_BYTES_BY_KIND.image) {
      toast.error('La imagen debe pesar 5 MB o menos');
      return;
    }
    setBusy(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      const ok = await patchLogo(publicUrl);
      if (ok) {
        onSaved(publicUrl);
        toast.success('Logo actualizado');
      }
    } catch (err) {
      console.error('[AccountLogoUploader] upload failed:', err);
      toast.error(err instanceof Error ? err.message : 'No se pudo subir el logo');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      const ok = await patchLogo(null);
      if (ok) {
        onSaved(null);
        toast.success('Logo eliminado');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!editable && !logoUrl) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- account-controlled upload, arbitrary remote host
          <img src={logoUrl} alt="" className="size-full object-contain" />
        ) : (
          <Upload className="size-4 text-muted-foreground" />
        )}
      </div>
      {editable ? (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            {busy ? <Loader2 className="inline size-3.5 animate-spin" /> : logoUrl ? 'Cambiar logo' : 'Subir logo'}
          </button>
          {logoUrl ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleRemove}
              className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              aria-label="Quitar logo"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
