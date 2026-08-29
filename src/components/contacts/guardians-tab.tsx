'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Star, UserPlus, X, Link2, Pencil } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';
import type { Guardian, PatientGuardian } from '@/types';

/** Opciones de relación (pediatría + veterinaria). Los valores son
 *  estables; la etiqueta visible sale de i18n. */
const RELATIONSHIPS = ['madre', 'padre', 'tutor_legal', 'abuelo', 'hermano', 'conyuge', 'dueno', 'otro'];
const DOC_TYPES = ['ine', 'curp', 'rfc', 'pasaporte', 'cedula', 'otro'];

interface LinkedGuardian extends PatientGuardian {
  guardian: Guardian;
}

interface BlankForm {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  document_type: string;
  document_number: string;
  address: string;
  notes: string;
  is_primary: boolean;
}

const EMPTY: BlankForm = {
  name: '',
  relationship: '',
  phone: '',
  email: '',
  document_type: '',
  document_number: '',
  address: '',
  notes: '',
  is_primary: false,
};

/**
 * Pestaña "Responsable" de la ficha del paciente. Los responsables son
 * una entidad reutilizable (tabla `guardians`); un mismo responsable
 * puede vincularse a varios pacientes (padre/madre/tutor en pediatría,
 * dueño en veterinaria). Aquí se listan, crean, vinculan y desvinculan.
 */
export function GuardiansTab({ contactId }: { contactId: string }) {
  const t = useTranslations('Contacts.guardians');
  const supabase = createClient();
  const { accountId } = useAuth();
  const canEdit = useCan('send-messages'); // agente+

  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState<LinkedGuardian[]>([]);
  const [existing, setExisting] = useState<Guardian[]>([]);
  const [saving, setSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<BlankForm>(EMPTY);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [linkExistingId, setLinkExistingId] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    const [linkedRes, guardiansRes] = await Promise.all([
      supabase
        .from('patient_guardians')
        .select('*, guardian:guardians(*)')
        .eq('contact_id', contactId)
        .order('is_primary', { ascending: false }),
      supabase.from('guardians').select('*').order('name'),
    ]);
    setLinked((linkedRes.data ?? []) as LinkedGuardian[]);
    setExisting((guardiansRes.data ?? []) as Guardian[]);
    setLoading(false);
  }, [contactId, supabase]);

  useEffect(() => {
    if (contactId) fetch();
  }, [contactId, fetch]);

  function resetForm() {
    setForm(EMPTY);
    setEditingLinkId(null);
    setLinkExistingId('');
    setFormOpen(false);
  }

  async function handleCreateAndLink() {
    if (!accountId || !form.name.trim()) {
      toast.error(t('nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const { data: guardian, error: gErr } = await supabase
        .from('guardians')
        .insert({
          account_id: accountId,
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          document_type: form.document_type || null,
          document_number: form.document_number.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
        })
        .select('*')
        .single();
      if (gErr || !guardian) throw gErr;

      await linkGuardian(guardian.id, form.relationship, form.is_primary);
      toast.success(t('added'));
      resetForm();
      await fetch();
    } catch (err) {
      console.error('Create guardian error:', err);
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function linkGuardian(guardianId: string, relationship: string, isPrimary: boolean) {
    if (!accountId) return;
    // Solo un principal por paciente.
    if (isPrimary) {
      await supabase
        .from('patient_guardians')
        .update({ is_primary: false })
        .eq('contact_id', contactId);
    }
    const { error } = await supabase.from('patient_guardians').insert({
      account_id: accountId,
      contact_id: contactId,
      guardian_id: guardianId,
      relationship: relationship || null,
      is_primary: isPrimary,
    });
    if (error) throw error;
  }

  async function handleLinkExisting() {
    if (!linkExistingId) return;
    setSaving(true);
    try {
      await linkGuardian(linkExistingId, form.relationship, form.is_primary);
      toast.success(t('linked'));
      resetForm();
      await fetch();
    } catch (err) {
      console.error('Link guardian error:', err);
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function saveLinkEdit(link: LinkedGuardian) {
    setSaving(true);
    try {
      if (form.is_primary) {
        await supabase
          .from('patient_guardians')
          .update({ is_primary: false })
          .eq('contact_id', contactId);
      }
      await supabase
        .from('patient_guardians')
        .update({ relationship: form.relationship || null, is_primary: form.is_primary })
        .eq('id', link.id);
      // También refresca datos de contacto del responsable.
      await supabase
        .from('guardians')
        .update({
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          document_type: form.document_type || null,
          document_number: form.document_number.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
        })
        .eq('id', link.guardian_id);
      toast.success(t('updated'));
      resetForm();
      await fetch();
    } catch (err) {
      console.error('Update guardian link error:', err);
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function unlink(link: LinkedGuardian) {
    try {
      await supabase.from('patient_guardians').delete().eq('id', link.id);
      setLinked((prev) => prev.filter((l) => l.id !== link.id));
      toast.success(t('unlinked'));
    } catch (err) {
      console.error('Unlink guardian error:', err);
      toast.error(t('saveFailed'));
    }
  }

  function openEdit(link: LinkedGuardian) {
    setEditingLinkId(link.id);
    setFormOpen(false);
    setForm({
      name: link.guardian.name,
      relationship: link.relationship ?? '',
      phone: link.guardian.phone ?? '',
      email: link.guardian.email ?? '',
      document_type: link.guardian.document_type ?? '',
      document_number: link.guardian.document_number ?? '',
      address: link.guardian.address ?? '',
      notes: link.guardian.notes ?? '',
      is_primary: link.is_primary,
    });
  }

  const linkedGuardianIds = new Set(linked.map((l) => l.guardian_id));
  const linkableExisting = existing.filter((g) => !linkedGuardianIds.has(g.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('description')}</p>

      {/* Lista de responsables vinculados */}
      {linked.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="space-y-2">
          {linked.map((link) => {
            const g = link.guardian;
            const isEditing = editingLinkId === link.id;
            return (
              <div key={link.id} className="rounded-lg border border-border bg-muted/40 p-3">
                {!isEditing ? (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        {g.name}
                        {link.is_primary && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                            <Star className="size-2.5" /> {t('primary')}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {link.relationship ? t(`relationships.${link.relationship}`) : t('noRelationship')}
                        {g.phone ? ` · ${g.phone}` : ''}
                        {g.email ? ` · ${g.email}` : ''}
                      </p>
                      {(g.document_number || g.address) && (
                        <p className="text-xs text-muted-foreground">
                          {g.document_type ? `${t(`docTypes.${g.document_type}`)} ` : ''}
                          {g.document_number ?? ''}
                          {g.address ? ` · ${g.address}` : ''}
                        </p>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(link)}
                          className="rounded-full p-1 text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10"
                          aria-label={t('edit')}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => unlink(link)}
                          className="rounded-full p-1 text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10"
                          aria-label={t('unlink')}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <GuardianForm
                    t={t}
                    form={form}
                    setForm={setForm}
                    saving={saving}
                    onSave={() => saveLinkEdit(link)}
                    onCancel={resetForm}
                    nameLocked
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Acciones para agregar */}
      {canEdit && !editingLinkId && (
        <div className="space-y-3 border-t border-border pt-3">
          {/* Vincular existente */}
          {linkableExisting.length > 0 && !formOpen && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('linkExisting')}</Label>
                <select
                  value={linkExistingId}
                  onChange={(e) => setLinkExistingId(e.target.value)}
                  className="h-9 min-w-[200px] rounded-md border border-border bg-muted px-2 text-sm text-foreground"
                >
                  <option value="">{t('selectExisting')}</option>
                  {linkableExisting.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.phone ? ` — ${g.phone}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('relationship')}</Label>
                <select
                  value={form.relationship}
                  onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value }))}
                  className="h-9 rounded-md border border-border bg-muted px-2 text-sm text-foreground"
                >
                  <option value="">{t('selectRelationship')}</option>
                  {RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>
                      {t(`relationships.${r}`)}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.is_primary}
                  onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
                />
                {t('primary')}
              </label>
              <Button size="sm" variant="outline" onClick={handleLinkExisting} disabled={saving || !linkExistingId}>
                <Link2 className="size-4" /> {t('link')}
              </Button>
            </div>
          )}

          {/* Crear nuevo */}
          {!formOpen ? (
            <Button size="sm" variant="outline" onClick={() => { setForm(EMPTY); setFormOpen(true); }}>
              <UserPlus className="size-4" /> {t('newGuardian')}
            </Button>
          ) : (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <GuardianForm
                t={t}
                form={form}
                setForm={setForm}
                saving={saving}
                onSave={handleCreateAndLink}
                onCancel={resetForm}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Formulario compartido para crear/editar un responsable. */
function GuardianForm({
  t,
  form,
  setForm,
  saving,
  onSave,
  onCancel,
  nameLocked = false,
}: {
  t: (k: string) => string;
  form: BlankForm;
  setForm: React.Dispatch<React.SetStateAction<BlankForm>>;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  nameLocked?: boolean;
}) {
  const set = (patch: Partial<BlankForm>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('name')}</Label>
          <Input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            disabled={nameLocked}
            className="h-8 bg-card text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('relationship')}</Label>
          <select
            value={form.relationship}
            onChange={(e) => set({ relationship: e.target.value })}
            className="h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground"
          >
            <option value="">{t('selectRelationship')}</option>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {t(`relationships.${r}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('phone')}</Label>
          <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} className="h-8 bg-card text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('email')}</Label>
          <Input value={form.email} onChange={(e) => set({ email: e.target.value })} className="h-8 bg-card text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('documentType')}</Label>
          <select
            value={form.document_type}
            onChange={(e) => set({ document_type: e.target.value })}
            className="h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground"
          >
            <option value="">{t('selectDocType')}</option>
            {DOC_TYPES.map((d) => (
              <option key={d} value={d}>
                {t(`docTypes.${d}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t('documentNumber')}</Label>
          <Input
            value={form.document_number}
            onChange={(e) => set({ document_number: e.target.value })}
            className="h-8 bg-card text-sm"
          />
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label className="text-xs text-muted-foreground">{t('address')}</Label>
          <Input value={form.address} onChange={(e) => set({ address: e.target.value })} className="h-8 bg-card text-sm" />
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <Label className="text-xs text-muted-foreground">{t('notes')}</Label>
          <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="min-h-[44px] bg-card text-sm" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={form.is_primary} onChange={(e) => set({ is_primary: e.target.checked })} />
          {t('primary')}
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving || !form.name.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {t('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
