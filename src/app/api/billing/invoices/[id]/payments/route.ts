import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { notifyAccountTeam } from '@/lib/email/notify-team';
import { escapeHtml } from '@/lib/email/branded-template';
import { fmtMoney } from '@/lib/billing/pdf-theme';

const VALID_METHODS = ['cash', 'card', 'transfer', 'other'] as const;

/**
 * GET  /api/billing/invoices/[id]/payments — list payments for an invoice.
 * POST /api/billing/invoices/[id]/payments — record a payment. The DB
 *      trigger (recompute_invoice_amount_paid, migration 039) updates
 *      invoices.amount_paid and status automatically — this route
 *      never touches those columns.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('viewer');
    const { id } = await params;

    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('invoice_id', id)
      .eq('account_id', accountId)
      .order('paid_at', { ascending: false });

    if (error) {
      console.error('[payments GET] error:', error);
      return NextResponse.json({ error: 'Failed to load payments' }, { status: 500 });
    }

    return NextResponse.json({ payments: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const amount = Number(body.amount);
    if (!(amount > 0)) {
      return NextResponse.json({ error: 'amount must be greater than zero' }, { status: 400 });
    }
    const method = VALID_METHODS.includes(body.method) ? body.method : 'other';

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, status, invoice_number, currency, contact:contacts(name, phone)')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    if (invoice.status === 'void') {
      return NextResponse.json({ error: 'Cannot record a payment on a void invoice' }, { status: 400 });
    }

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        account_id: accountId,
        invoice_id: id,
        amount,
        method,
        paid_at: body.paid_at || new Date().toISOString(),
        notes: body.notes || null,
        created_by: userId,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[payments POST] error:', error);
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
    }

    const contact = Array.isArray(invoice.contact) ? invoice.contact[0] : invoice.contact;
    void notifyAccountTeam(supabase, {
      accountId,
      subject: `Pago recibido — Factura ${invoice.invoice_number}`,
      heading: 'Pago recibido',
      bodyHtml: `<p>Se registró un pago de <strong>${fmtMoney(amount, invoice.currency)}</strong> en la factura <strong>${escapeHtml(invoice.invoice_number)}</strong>${contact?.name ? ` de ${escapeHtml(contact.name)}` : ''}.</p>`,
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
