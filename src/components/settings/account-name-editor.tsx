'use client';

// ============================================================
// AccountNameEditor — inline rename for `accounts.name`.
//
// This is the "brand name" every invited teammate inherits: sidebar
// account strip, invite emails, the platform-admin accounts list.
// Signup seeds it from the founder's own full_name (handle_new_user,
// 017_account_sharing.sql) so a brand-new account isn't nameless, but
// nothing let anyone change it afterward — PATCH /api/account already
// existed to do exactly that, just with no UI calling it. This is
// that UI, surfaced on the Settings landing page since it's the
// first thing an admin sees.
// ============================================================

import { useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';

interface AccountNameEditorProps {
  name: string;
  /** Mirrors PATCH /api/account's own requireRole("admin") gate. */
  editable: boolean;
  onSaved: (name: string) => void;
}

const MAX_LEN = 80;

export function AccountNameEditor({ name, editable, onSaved }: AccountNameEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm text-muted-foreground">{name}</span>
        {editable ? (
          <button
            type="button"
            onClick={() => {
              setValue(name);
              setEditing(true);
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Editar nombre de la cuenta"
          >
            <Pencil className="size-3.5" />
          </button>
        ) : null}
      </div>
    );
  }

  const cancel = () => {
    setEditing(false);
    setValue(name);
  };

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed === name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? 'No se pudo actualizar el nombre de la cuenta');
        return;
      }
      onSaved(body.account.name);
      toast.success('Nombre de la cuenta actualizado');
      setEditing(false);
    } catch (err) {
      console.error('[AccountNameEditor] save failed:', err);
      toast.error('No se pudo actualizar el nombre de la cuenta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Input
        autoFocus
        value={value}
        maxLength={MAX_LEN}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') cancel();
        }}
        disabled={saving}
        className="h-7 max-w-56 text-sm"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving || !value.trim()}
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
