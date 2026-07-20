import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { resolveBillingLines } from '@/lib/billing/resolve-items';

/**
 * GET  /api/billing/quotes  — list quotes (filtered by contact/deal/status).
 * POST /api/billing/quotes  — create a quote with line items.
 *
 * Totals and tax rates are always recomputed server-side from the
 * submitted line items (see resolveBillingLines) — never trusted from
 * the client. Currency is fixed to the account's default_currency,
 * no selector in v1 (see plan notes on currency conversion).
 */
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('viewer');
    const url = new URL(request.url);
    const contactId = url.searchParams.get('contact_id');
    const dealId = url.searchParams.get('deal_id');
    const status = url.searchParams.get('status');

    let query = supabase
      .from('quotes')
      .select('*, contact:contacts(*)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (contactId) query = query.eq('contact_id', contactId);
    if (dealId) query = query.eq('deal_id', dealId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      console.error('[quotes GET] error:', error);
      return NextResponse.json({ error: 'Failed to load quotes' }, { status: 500 });
    }

    return NextResponse.json({ quotes: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const body = await request.json().catch(() => ({}));

    if (!body.contact_id) {
      return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
    }

    let resolved;
    try {
      resolved = await resolveBillingLines(supabase, accountId, body.items ?? [], body.discount_type, body.discount_value);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid line items' }, { status: 400 });
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('default_currency')
      .eq('id', accountId)
      .maybeSingle();

    const { data: quoteNumber, error: numberError } = await supabase.rpc('next_billing_number', {
      p_account_id: accountId,
      p_doc_type: 'quote',
    });
    if (numberError || !quoteNumber) {
      console.error('[quotes POST] numbering error:', numberError);
      return NextResponse.json({ error: 'Failed to generate quote number' }, { status: 500 });
    }

    const { data: quote, error: insertError } = await supabase
      .from('quotes')
      .insert({
        account_id: accountId,
        contact_id: body.contact_id,
        deal_id: body.deal_id || null,
        quote_number: quoteNumber,
        expiry_date: body.expiry_date || null,
        subtotal: resolved.subtotal,
        tax_total: resolved.taxTotal,
        discount_type: resolved.discountType,
        discount_value: resolved.discountValue,
        discount_amount: resolved.discountAmount,
        total: resolved.total,
        currency: account?.default_currency ?? 'USD',
        notes: body.notes || null,
        created_by: userId,
      })
      .select('*, contact:contacts(*)')
      .single();

    if (insertError) {
      console.error('[quotes POST] insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create quote' }, { status: 500 });
    }

    const { data: items, error: itemsError } = await supabase
      .from('quote_items')
      .insert(resolved.items.map((item) => ({ ...item, account_id: accountId, quote_id: quote.id })))
      .select('*, product:products(*), tax:taxes(*)');

    if (itemsError) {
      console.error('[quotes POST] items insert error:', itemsError);
      await supabase.from('quotes').delete().eq('id', quote.id);
      return NextResponse.json({ error: 'Failed to save line items' }, { status: 500 });
    }

    return NextResponse.json({ quote: { ...quote, items: items ?? [] } }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
