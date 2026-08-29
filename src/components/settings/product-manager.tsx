'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Package, X } from 'lucide-react';
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
import type { Product } from '@/types';

/**
 * Billing catalog (products/services) — same fetch/inline-create/
 * confirm-delete shape as RoomManager, plus a unit_price field.
 */
export function ProductManager() {
  const t = useTranslations('Settings.billing.products');
  const supabase = createClient();
  const { accountId, loading: authLoading } = useAuth();
  const canEdit = useCan('edit-settings');

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!accountId) {
      setLoading(false);
      return;
    }
    fetchProducts(accountId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, accountId]);

  async function fetchProducts(acctId: string) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('account_id', acctId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Failed to fetch products:', err);
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim() || !accountId) return;
    try {
      setSaving(true);
      const { error } = await supabase.from('products').insert({
        account_id: accountId,
        name: newName.trim(),
        unit_price: Number(newPrice) || 0,
      });
      if (error) throw error;
      toast.success(t('created'));
      setNewName('');
      setNewPrice('');
      await fetchProducts(accountId);
    } catch (err) {
      console.error('Create product error:', err);
      toast.error(t('createFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id);
      if (error) throw error;
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_active: !p.is_active } : p))
      );
    } catch (err) {
      console.error('Toggle product error:', err);
      toast.error(t('updateFailed'));
    }
  }

  function confirmDelete(product: Product) {
    setProductToDelete(product);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!productToDelete) return;
    try {
      setDeleting(true);
      const { error } = await supabase.from('products').delete().eq('id', productToDelete.id);
      if (error) throw error;
      toast.success(t('deleted'));
      setProducts((prev) => prev.filter((p) => p.id !== productToDelete.id));
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    } catch (err) {
      console.error('Delete product error:', err);
      toast.error(t('deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }

  const priceFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Package className="size-4 text-primary" />
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
            {products.length > 0 ? (
              <div className="space-y-2">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-foreground">{product.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {priceFormatter.format(product.unit_price)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={product.is_active}
                        onCheckedChange={() => toggleActive(product)}
                        disabled={!canEdit}
                      />
                      <button
                        type="button"
                        onClick={() => confirmDelete(product)}
                        aria-label={t('deleteAria', { name: product.name })}
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
                  maxLength={120}
                  className="min-w-[180px] flex-1"
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={t('pricePlaceholder')}
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                  disabled={saving}
                  className="w-28"
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
              {productToDelete ? t('deleteConfirm', { name: productToDelete.name }) : null}
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
