'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Percent, X, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
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
import type { Tax } from '@/types';

/**
 * Tax rates card. `is_default` is enforced unique per account by a
 * partial index (migration 039) — the client does a two-step
 * unset-then-set instead of a transaction (same non-atomic-but-safe
 * pattern already used elsewhere in this codebase, e.g. ContactForm's
 * sequential tag sync); the DB index is the real backstop against a
 * race leaving two rows marked default.
 */
export function TaxManager() {
  const t = useTranslations('Settings.billing.taxes');
  const supabase = createClient();
  const { accountId, loading: authLoading } = useAuth();
  const canEdit = useCan('edit-settings');

  const [loading, setLoading] = useState(true);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [newName, setNewName] = useState('');
  const [newRate, setNewRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taxToDelete, setTaxToDelete] = useState<Tax | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!accountId) {
      setLoading(false);
      return;
    }
    fetchTaxes(accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, accountId]);

  async function fetchTaxes(acctId: string) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('taxes')
        .select('*')
        .eq('account_id', acctId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setTaxes(data || []);
    } catch (err) {
      console.error('Failed to fetch taxes:', err);
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim() || !accountId) return;
    try {
      setSaving(true);
      const { error } = await supabase.from('taxes').insert({
        account_id: accountId,
        name: newName.trim(),
        rate: Number(newRate) || 0,
      });
      if (error) throw error;
      toast.success(t('created'));
      setNewName('');
      setNewRate('');
      await fetchTaxes(accountId);
    } catch (err) {
      console.error('Create tax error:', err);
      toast.error(t('createFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(tax: Tax) {
    try {
      const { error } = await supabase
        .from('taxes')
        .update({ is_active: !tax.is_active })
        .eq('id', tax.id);
      if (error) throw error;
      setTaxes((prev) => prev.map((x) => (x.id === tax.id ? { ...x, is_active: !x.is_active } : x)));
    } catch (err) {
      console.error('Toggle tax error:', err);
      toast.error(t('updateFailed'));
    }
  }

  async function makeDefault(tax: Tax) {
    if (!accountId || tax.is_default) return;
    try {
      await supabase.from('taxes').update({ is_default: false }).eq('account_id', accountId).eq('is_default', true);
      const { error } = await supabase.from('taxes').update({ is_default: true }).eq('id', tax.id);
      if (error) throw error;
      await fetchTaxes(accountId);
    } catch (err) {
      console.error('Set default tax error:', err);
      toast.error(t('updateFailed'));
    }
  }

  function confirmDelete(tax: Tax) {
    setTaxToDelete(tax);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!taxToDelete) return;
    try {
      setDeleting(true);
      const { error } = await supabase.from('taxes').delete().eq('id', taxToDelete.id);
      if (error) throw error;
      toast.success(t('deleted'));
      setTaxes((prev) => prev.filter((x) => x.id !== taxToDelete.id));
      setDeleteDialogOpen(false);
      setTaxToDelete(null);
    } catch (err) {
      console.error('Delete tax error:', err);
      toast.error(t('deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Percent className="size-4 text-primary" />
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
            {taxes.length > 0 ? (
              <div className="space-y-2">
                {taxes.map((tax) => (
                  <div
                    key={tax.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-foreground">{tax.name}</span>
                      <span className="text-xs text-muted-foreground">{tax.rate}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => makeDefault(tax)}
                        disabled={!canEdit || tax.is_default}
                        aria-label={t('makeDefaultAria', { name: tax.name })}
                        title={tax.is_default ? t('isDefault') : t('makeDefault')}
                        className="rounded-full p-1 text-muted-foreground opacity-60 transition-opacity hover:bg-black/10 hover:opacity-100 disabled:pointer-events-none dark:hover:bg-white/10"
                      >
                        <Star className={`size-3.5 ${tax.is_default ? 'fill-primary text-primary' : ''}`} />
                      </button>
                      <Switch
                        checked={tax.is_active}
                        onCheckedChange={() => toggleActive(tax)}
                        disabled={!canEdit}
                      />
                      <button
                        type="button"
                        onClick={() => confirmDelete(tax)}
                        aria-label={t('deleteAria', { name: tax.name })}
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
                  maxLength={60}
                  className="min-w-[180px] flex-1"
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={t('ratePlaceholder')}
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                  disabled={saving}
                  className="w-24"
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
              {taxToDelete ? t('deleteConfirm', { name: taxToDelete.name }) : null}
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
