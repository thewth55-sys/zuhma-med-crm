import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { resolveBillingLines } from '@/lib/billing/resolve-items';

const HEADER_PATCHABLE_FIELDS = ['status', 'notes', 'expiry_date', 'deal_id'] as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('viewer');
    const { id } = await params;

    const { data: quote, error } = await supabase
      .from('quotes')
      .select('*, contact:contacts(*)')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (error || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const { data: items } = await supabase
      .from('quote_items')
      .select('*, product:products(*), tax:taxes(*)')
      .eq('quote_id', id)
      .order('position', { ascending: true });

    return NextResponse.json({ quote: { ...quote, items: items ?? [] } });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PATCH accepts either header-only fields, or a full replace of
 * `items` (which recomputes totals and replaces every line — simpler
 * and safer than diffing individual line edits for v1).
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
      .from('quotes')
      .select('id, status')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }
    if (existing.status === 'converted') {
      return NextResponse.json({ error: 'A converted quote cannot be edited' }, { status: 400 });
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

      const { error: deleteError } = await supabase.from('quote_items').delete().eq('quote_id', id);
      if (deleteError) {
        console.error('[quotes PATCH] items delete error:', deleteError);
        return NextResponse.json({ error: 'Failed to update line items' }, { status: 500 });
      }
      const { error: itemsError } = await supabase
        .from('quote_items')
        .insert(resolved.items.map((item) => ({ ...item, account_id: accountId, quote_id: id })));
      if (itemsError) {
        console.error('[quotes PATCH] items insert error:', itemsError);
        return NextResponse.json({ error: 'Failed to update line items' }, { status: 500 });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: quote, error } = await supabase
      .from('quotes')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select('*, contact:contacts(*)')
      .single();

    if (error) {
      console.error('[quotes PATCH] error:', error);
      return NextResponse.json({ error: 'Failed to update quote' }, { status: 500 });
    }

    const { data: items } = await supabase
      .from('quote_items')
      .select('*, product:products(*), tax:taxes(*)')
      .eq('quote_id', id)
      .order('position', { ascending: true });

    return NextResponse.json({ quote: { ...quote, items: items ?? [] } });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id } = await params;

    const { error } = await supabase.from('quotes').delete().eq('id', id).eq('account_id', accountId);
    if (error) {
      console.error('[quotes DELETE] error:', error);
      return NextResponse.json({ error: 'Failed to delete quote' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
