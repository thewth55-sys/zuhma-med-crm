'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, UserRound, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { fetchAccountMembers, memberLabel } from '@/lib/account/members';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';
import type { AccountMember, Doctor } from '@/types';

/**
 * Doctors card. Same fetch/inline-create/confirm-delete shape as
 * RoomManager, plus a "linked account member" select — inviting a
 * doctor happens through the normal Members flow (any role, typically
 * viewer), then an admin links that member's user_id here. Deliberately
 * two separate steps: `account_role` is privilege level, `doctors` is
 * a domain entity (see migration 037's doc comment) — merging them
 * into one invite-a-doctor flow would conflate the two concepts.
 */
export function DoctorManager() {
  const t = useTranslations('Settings.scheduling.doctors');
  const supabase = createClient();
  const { accountId, loading: authLoading } = useAuth();
  const canEdit = useCan('edit-settings');

  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [newName, setNewName] = useState('');
  const [newSpecialty, setNewSpecialty] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Doctor | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!accountId) {
      setLoading(false);
      return;
    }
    fetchDoctors(accountId);
    fetchAccountMembers().then(setMembers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, accountId]);

  async function fetchDoctors(acctId: string) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('doctors')
        .select('*')
        .eq('account_id', acctId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setDoctors(data || []);
    } catch (err) {
      console.error('Failed to fetch doctors:', err);
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim() || !accountId) return;
    try {
      setSaving(true);
      const { error } = await supabase.from('doctors').insert({
        account_id: accountId,
        name: newName.trim(),
        specialty: newSpecialty.trim() || null,
      });
      if (error) throw error;
      toast.success(t('created'));
      setNewName('');
      setNewSpecialty('');
      await fetchDoctors(accountId);
    } catch (err) {
      console.error('Create doctor error:', err);
      toast.error(t('createFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(doctor: Doctor) {
    try {
      const { error } = await supabase
        .from('doctors')
        .update({ is_active: !doctor.is_active })
        .eq('id', doctor.id);
      if (error) throw error;
      setDoctors((prev) =>
        prev.map((d) => (d.id === doctor.id ? { ...d, is_active: !d.is_active } : d))
      );
    } catch (err) {
      console.error('Toggle doctor error:', err);
      toast.error(t('updateFailed'));
    }
  }

  async function linkMember(doctor: Doctor, userId: string) {
    try {
      const { error } = await supabase
        .from('doctors')
        .update({ user_id: userId || null })
        .eq('id', doctor.id);
      if (error) throw error;
      setDoctors((prev) =>
        prev.map((d) => (d.id === doctor.id ? { ...d, user_id: userId || null } : d))
      );
      toast.success(t('linked'));
    } catch (err) {
      console.error('Link doctor error:', err);
      toast.error(t('updateFailed'));
    }
  }

  function confirmDelete(doctor: Doctor) {
    setToDelete(doctor);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!toDelete) return;
    try {
      setDeleting(true);
      const { error } = await supabase.from('doctors').delete().eq('id', toDelete.id);
      if (error) throw error;
      toast.success(t('deleted'));
      setDoctors((prev) => prev.filter((d) => d.id !== toDelete.id));
      setDeleteDialogOpen(false);
      setToDelete(null);
    } catch (err) {
      console.error('Delete doctor error:', err);
      toast.error(t('deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }

  // A member already linked to another doctor shouldn't show as
  // pickable for this one — doctors.user_id is unique per account.
  const linkedUserIds = new Set(doctors.map((d) => d.user_id).filter(Boolean));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <UserRound className="size-4 text-primary" />
          {t('title')}
        </CardTitle>
        <CardDescription className="text-muted-foreground">{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {doctors.length > 0 ? (
              <div className="space-y-2">
                {doctors.map((doctor) => (
                  <div
                    key={doctor.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
                  >
                    <div className="min-w-[140px]">
                      <p className="text-sm text-foreground">{doctor.name}</p>
                      {doctor.specialty && (
                        <p className="text-xs text-muted-foreground">{doctor.specialty}</p>
                      )}
                    </div>
                    <div className="flex flex-1 items-center justify-end gap-3">
                      <select
                        value={doctor.user_id ?? ''}
                        onChange={(e) => linkMember(doctor, e.target.value)}
                        disabled={!canEdit}
                        className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground disabled:opacity-50"
                      >
                        <option value="">{t('noLogin')}</option>
                        {members
                          .filter((m) => m.user_id === doctor.user_id || !linkedUserIds.has(m.user_id))
                          .map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {memberLabel(m)}
                            </option>
                          ))}
                      </select>
                      <Switch
                        checked={doctor.is_active}
                        onCheckedChange={() => toggleActive(doctor)}
                        disabled={!canEdit}
                      />
                      <button
                        type="button"
                        onClick={() => confirmDelete(doctor)}
                        aria-label={t('deleteAria', { name: doctor.name })}
                        disabled={!canEdit}
                        className="rounded-full p-1 text-muted-foreground opacity-60 transition-opacity hover:bg-black/10 hover:opacity-100 disabled:pointer-events-none dark:hover:bg-white/10"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('empty')}</p>
            )}

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2.5">
                <Input
                  placeholder={t('namePlaceholder')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={saving}
                  maxLength={80}
                  className="min-w-[160px] flex-1"
                />
                <Input
                  placeholder={t('specialtyPlaceholder')}
                  value={newSpecialty}
                  onChange={(e) => setNewSpecialty(e.target.value)}
                  disabled={saving}
                  maxLength={80}
                  className="min-w-[160px] flex-1"
                />
                <Button variant="outline" size="sm" onClick={handleCreate} disabled={saving || !newName.trim()}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {t('add')}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {toDelete ? t('deleteConfirm', { name: toDelete.name }) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('deleting')}
                </>
              ) : (
                t('deleteTitle')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
