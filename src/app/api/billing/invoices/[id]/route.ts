import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { resolveBillingLines } from '@/lib/billing/resolve-items';

const HEADER_PATCHABLE_FIELDS = ['status', 'notes', 'due_date', 'deal_id'] as const;
const NON_MANUAL_STATUSES = ['paid', 'partial'] as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('viewer');
    const { id } = await params;

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*, contact:contacts(*)')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (error || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const [{ data: items }, { data: payments }] = await Promise.all([
      supabase
        .from('invoice_items')
        .select('*, product:products(*), tax:taxes(*)')
        .eq('invoice_id', id)
        .order('position', { ascending: true }),
      supabase.from('payments').select('*').eq('invoice_id', id).order('paid_at', { ascending: false }),
    ]);

    return NextResponse.json({ invoice: { ...invoice, items: items ?? [], payments: payments ?? [] } });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PATCH accepts header fields or a full replace of `items` (same
 * "delete all, reinsert" approach as the quote PATCH). `status`
 * cannot be set to 'paid'/'partial' by hand — those are derived by
 * the payments trigger; setting them directly would desync from
 * `amount_paid`.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (
      'status' in body &&
      (NON_MANUAL_STATUSES as readonly string[]).includes(body.status)
    ) {
      return NextResponse.json(
        { error: 'paid/partial are set automatically from payments, not editable directly' },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    for (const field of HEADER_PATCHABLE_FIELDS) {
      if (field in body) updates[field] = body[field] ?? null;
    }

    if (Array.isArray(body.items)) {
      let resolved;
      try {
        resolved = await resolveBillingLines(supabase, accountId, body.items, body.discount_type, body.discount_value);
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid line items' }, { status: 400 });
      }
      updates.subtotal = resolved.subtotal;
      updates.tax_total = resolved.taxTotal;
      updates.discount_type = resolved.discountType;
      updates.discount_value = resolved.discountValue;
      updates.discount_amount = resolved.discountAmount;
      updates.total = resolved.total;

      const { error: deleteError } = await supabase.from('invoice_items').delete().eq('invoice_id', id);
      if (deleteError) {
        console.error('[invoices PATCH] items delete error:', deleteError);
        return NextResponse.json({ error: 'Failed to update line items' }, { status: 500 });
      }
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(resolved.items.map((item) => ({ ...item, account_id: accountId, invoice_id: id })));
      if (itemsError) {
        console.error('[invoices PATCH] items insert error:', itemsError);
        return NextResponse.json({ error: 'Failed to update line items' }, { status: 500 });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: invoice, error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select('*, contact:contacts(*)')
      .single();

    if (error) {
      console.error('[invoices PATCH] error:', error);
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
    }

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*, product:products(*), tax:taxes(*)')
      .eq('invoice_id', id)
      .order('position', { ascending: true });

    return NextResponse.json({ invoice: { ...invoice, items: items ?? [] } });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Admin-only, matching the RLS `invoices_delete` policy exactly. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const { id } = await params;

    const { error } = await supabase.from('invoices').delete().eq('id', id).eq('account_id', accountId);
    if (error) {
      console.error('[invoices DELETE] error:', error);
      return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
