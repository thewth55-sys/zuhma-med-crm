'use client';

// ============================================================
// InlineFieldEditor — generic click-to-edit single field against
// PATCH /api/account. Same interaction shape as AccountNameEditor,
// generalized for optional fields (address, tax_id, …) that can be
// cleared back to empty, unlike the account name which can't be
// blank. Kept as a separate component rather than refactoring
// AccountNameEditor itself, to avoid touching already-working code
// for a cosmetic DRY win.
// ============================================================

import { useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';

interface InlineFieldEditorProps {
  /** JSON body key sent to PATCH /api/account, e.g. "address". */
  field: string;
  value: string | null;
  editable: boolean;
  placeholder: string;
  emptyLabel: string;
  maxLength?: number;
  onSaved: (value: string | null) => void;
}

export function InlineFieldEditor({
  field,
  value,
  editable,
  placeholder,
  emptyLabel,
  maxLength = 300,
  onSaved,
}: InlineFieldEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm text-muted-foreground">
          {value || <span className="italic">{emptyLabel}</span>}
        </span>
        {editable ? (
          <button
            type="button"
            onClick={() => {
              setDraft(value ?? '');
              setEditing(true);
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={placeholder}
          >
            <Pencil className="size-3.5" />
          </button>
        ) : null}
      </div>
    );
  }

  const cancel = () => {
    setEditing(false);
    setDraft(value ?? '');
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (trimmed === (value ?? '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: trimmed || null }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? 'No se pudo guardar');
        return;
      }
      onSaved(body.account[field] ?? null);
      toast.success('Guardado');
      setEditing(false);
    } catch (err) {
      console.error('[InlineFieldEditor] save failed:', err);
      toast.error('No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Input
        autoFocus
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') cancel();
        }}
        disabled={saving}
        className="h-7 max-w-64 text-sm"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="shrink-0 text-primary disabled:opacity-50"
        aria-label="Guardar"
      >
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={saving}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Cancelar"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
