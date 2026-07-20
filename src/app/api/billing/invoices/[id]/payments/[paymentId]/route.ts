import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';

/**
 * DELETE /api/billing/invoices/[id]/payments/[paymentId] — correcting
 * a payment means deleting and recreating it (no UPDATE policy on
 * `payments`, see migration 039). The recompute trigger fires on
 * delete and adjusts invoices.amount_paid/status automatically.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { id, paymentId } = await params;

    const { error } = await supabase
      .from('payments')
      .delete()
      .eq('id', paymentId)
      .eq('invoice_id', id)
      .eq('account_id', accountId);

    if (error) {
      console.error('[payments DELETE] error:', error);
      return NextResponse.json({ error: 'Failed to delete payment' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
