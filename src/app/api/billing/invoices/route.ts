import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { resolveBillingLines } from '@/lib/billing/resolve-items';

/**
 * GET  /api/billing/invoices  — list invoices (filtered by contact/deal/status).
 * POST /api/billing/invoices  — create a standalone invoice with line
 *                                items (not from a quote — see
 *                                /api/billing/quotes/[id]/convert for
 *                                that path).
 */
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('viewer');
    const url = new URL(request.url);
    const contactId = url.searchParams.get('contact_id');
    const dealId = url.searchParams.get('deal_id');
    const status = url.searchParams.get('status');

    let query = supabase
      .from('invoices')
      .select('*, contact:contacts(*)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (contactId) query = query.eq('contact_id', contactId);
    if (dealId) query = query.eq('deal_id', dealId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      console.error('[invoices GET] error:', error);
      return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 });
    }

    return NextResponse.json({ invoices: data ?? [] });
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

    const { data: invoiceNumber, error: numberError } = await supabase.rpc('next_billing_number', {
      p_account_id: accountId,
      p_doc_type: 'invoice',
    });
    if (numberError || !invoiceNumber) {
      console.error('[invoices POST] numbering error:', numberError);
      return NextResponse.json({ error: 'Failed to generate invoice number' }, { status: 500 });
    }

    const { data: invoice, error: insertError } = await supabase
      .from('invoices')
      .insert({
        account_id: accountId,
        contact_id: body.contact_id,
        deal_id: body.deal_id || null,
        invoice_number: invoiceNumber,
        due_date: body.due_date || null,
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
      console.error('[invoices POST] insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
    }

    const { data: items, error: itemsError } = await supabase
      .from('invoice_items')
      .insert(resolved.items.map((item) => ({ ...item, account_id: accountId, invoice_id: invoice.id })))
      .select('*, product:products(*), tax:taxes(*)');

    if (itemsError) {
      console.error('[invoices POST] items insert error:', itemsError);
      await supabase.from('invoices').delete().eq('id', invoice.id);
      return NextResponse.json({ error: 'Failed to save line items' }, { status: 500 });
    }

    return NextResponse.json({ invoice: { ...invoice, items: items ?? [] } }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
