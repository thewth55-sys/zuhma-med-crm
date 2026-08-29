import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';

/**
 * POST /api/billing/quotes/[id]/convert — create an invoice from an
 * accepted quote, copying its line items and totals verbatim (the
 * quote's totals were already server-computed at creation/edit time,
 * no need to recompute here). Marks the quote 'converted' so it can't
 * be converted again or edited further.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const { id } = await params;

    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (quoteError || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }
    if (quote.status === 'converted') {
      return NextResponse.json({ error: 'This quote was already converted' }, { status: 400 });
    }
    if (quote.status !== 'accepted') {
      return NextResponse.json({ error: 'Only an accepted quote can be converted' }, { status: 400 });
    }

    const { data: quoteItems, error: itemsError } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', id)
      .order('position', { ascending: true });
    if (itemsError) {
      console.error('[quote convert] items fetch error:', itemsError);
      return NextResponse.json({ error: 'Failed to load quote items' }, { status: 500 });
    }

    const { data: invoiceNumber, error: numberError } = await supabase.rpc('next_billing_number', {
      p_account_id: accountId,
      p_doc_type: 'invoice',
    });
    if (numberError || !invoiceNumber) {
      console.error('[quote convert] numbering error:', numberError);
      return NextResponse.json({ error: 'Failed to generate invoice number' }, { status: 500 });
    }

    const { data: invoice, error: insertError } = await supabase
      .from('invoices')
      .insert({
        account_id: accountId,
        contact_id: quote.contact_id,
        deal_id: quote.deal_id,
        quote_id: quote.id,
        invoice_number: invoiceNumber,
        subtotal: quote.subtotal,
        tax_total: quote.tax_total,
        discount_type: quote.discount_type,
        discount_value: quote.discount_value,
        discount_amount: quote.discount_amount,
        total: quote.total,
        currency: quote.currency,
        notes: quote.notes,
        created_by: userId,
      })
      .select('*, contact:contacts(*)')
      .single();

    if (insertError) {
      console.error('[quote convert] invoice insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
    }

    if (quoteItems && quoteItems.length > 0) {
      const { error: invoiceItemsError } = await supabase.from('invoice_items').insert(
        quoteItems.map((item) => ({
          account_id: accountId,
          invoice_id: invoice.id,
          product_id: item.product_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_id: item.tax_id,
          tax_rate_snapshot: item.tax_rate_snapshot,
          discount_type: item.discount_type,
          discount_value: item.discount_value,
          line_total: item.line_total,
          position: item.position,
        }))
      );
      if (invoiceItemsError) {
        console.error('[quote convert] invoice items insert error:', invoiceItemsError);
        await supabase.from('invoices').delete().eq('id', invoice.id);
        return NextResponse.json({ error: 'Failed to copy line items' }, { status: 500 });
      }
    }

    await supabase.from('quotes').update({ status: 'converted' }).eq('id', id);

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*, product:products(*), tax:taxes(*)')
      .eq('invoice_id', invoice.id)
      .order('position', { ascending: true });

    return NextResponse.json({ invoice: { ...invoice, items: items ?? [] } }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
