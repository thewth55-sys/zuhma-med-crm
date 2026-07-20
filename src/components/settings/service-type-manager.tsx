'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Stethoscope, X } from 'lucide-react';
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
import type { Product, ServiceType } from '@/types';

const DEFAULT_DURATION = 30;

/**
 * Tratamientos (service types) card — same shape as RoomManager, plus
 * a duration-in-minutes field on the inline create row.
 */
export function ServiceTypeManager() {
  const t = useTranslations('Settings.scheduling.serviceTypes');
  const supabase = createClient();
  const { accountId, loading: authLoading } = useAuth();
  const canEdit = useCan('edit-settings');

  const [loading, setLoading] = useState(true);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newName, setNewName] = useState('');
  const [newDuration, setNewDuration] = useState(String(DEFAULT_DURATION));
  const [newProductId, setNewProductId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ServiceType | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!accountId) {
      setLoading(false);
      return;
    }
    fetchServiceTypes(accountId);
    fetchProducts(accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, accountId]);

  async function fetchServiceTypes(acctId: string) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('service_types')
        .select('*, product:products(*)')
        .eq('account_id', acctId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setServiceTypes(data || []);
    } catch (err) {
      console.error('Failed to fetch service types:', err);
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function fetchProducts(acctId: string) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('account_id', acctId)
      .eq('is_active', true)
      .order('name');
    setProducts(data || []);
  }

  async function handleCreate() {
    if (!newName.trim() || !accountId) return;
    const duration = Number(newDuration) || DEFAULT_DURATION;
    try {
      setSaving(true);
      const { error } = await supabase.from('service_types').insert({
        account_id: accountId,
        name: newName.trim(),
        duration_minutes: duration,
        product_id: newProductId || null,
      });
      if (error) throw error;
      toast.success(t('created'));
      setNewName('');
      setNewDuration(String(DEFAULT_DURATION));
      setNewProductId('');
      await fetchServiceTypes(accountId);
    } catch (err) {
      console.error('Create service type error:', err);
      toast.error(t('createFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function updateProductLink(st: ServiceType, productId: string) {
    try {
      const { error } = await supabase
        .from('service_types')
        .update({ product_id: productId || null })
        .eq('id', st.id);
      if (error) throw error;
      const product = products.find((p) => p.id === productId) ?? null;
      setServiceTypes((prev) =>
        prev.map((s) => (s.id === st.id ? { ...s, product_id: productId || null, product: product ?? undefined } : s))
      );
    } catch (err) {
      console.error('Link product to service type error:', err);
      toast.error(t('updateFailed'));
    }
  }

  async function toggleActive(st: ServiceType) {
    try {
      const { error } = await supabase
        .from('service_types')
        .update({ is_active: !st.is_active })
        .eq('id', st.id);
      if (error) throw error;
      setServiceTypes((prev) =>
        prev.map((s) => (s.id === st.id ? { ...s, is_active: !s.is_active } : s))
      );
    } catch (err) {
      console.error('Toggle service type error:', err);
      toast.error(t('updateFailed'));
    }
  }

  function confirmDelete(st: ServiceType) {
    setToDelete(st);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!toDelete) return;
    try {
      setDeleting(true);
      const { error } = await supabase.from('service_types').delete().eq('id', toDelete.id);
      if (error) throw error;
      toast.success(t('deleted'));
      setServiceTypes((prev) => prev.filter((s) => s.id !== toDelete.id));
      setDeleteDialogOpen(false);
      setToDelete(null);
    } catch (err) {
      console.error('Delete service type error:', err);
      toast.error(t('deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Stethoscope className="size-4 text-primary" />
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
            {serviceTypes.length > 0 ? (
              <div className="space-y-2">
                {serviceTypes.map((st) => (
                  <div
                    key={st.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
                  >
                    <span className="text-sm text-foreground">
                      {st.name} <span className="text-muted-foreground">· {t('minutes', { count: st.duration_minutes })}</span>
                    </span>
                    <div className="flex items-center gap-3">
                      <select
                        value={st.product_id ?? ''}
                        onChange={(e) => updateProductLink(st, e.target.value)}
                        disabled={!canEdit}
                        aria-label={t('linkedProduct')}
                        className="h-8 rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:border-primary disabled:opacity-60"
                      >
                        <option value="">{t('noLinkedProduct')}</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <Switch
                        checked={st.is_active}
                        onCheckedChange={() => toggleActive(st)}
                        disabled={!canEdit}
                      />
                      <button
                        type="button"
                        onClick={() => confirmDelete(st)}
                        aria-label={t('deleteAria', { name: st.name })}
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
                  min={1}
                  value={newDuration}
                  onChange={(e) => setNewDuration(e.target.value)}
                  disabled={saving}
                  className="w-24"
                  aria-label={t('durationLabel')}
                />
                <select
                  value={newProductId}
                  onChange={(e) => setNewProductId(e.target.value)}
                  disabled={saving}
                  aria-label={t('linkedProduct')}
                  className="h-9 rounded-md border border-border bg-muted px-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
                >
                  <option value="">{t('noLinkedProduct')}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
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
