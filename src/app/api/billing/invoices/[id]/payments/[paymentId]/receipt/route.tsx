import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { ReceiptPdfDocument } from "@/lib/billing/receipt-pdf-document";

const BUCKET = "chat-media";

/**
 * POST /api/billing/invoices/[id]/payments/[paymentId]/receipt —
 * renders a proof-of-payment PDF for one payment (full or partial),
 * same upload/PDF pattern as the quote PDF route. "Amount paid to
 * date" / "balance" on the receipt are snapshotted as of THIS
 * payment's paid_at (sum of payments up to and including it) rather
 * than the invoice's live amount_paid — a receipt shouldn't shift its
 * own numbers because a later, unrelated payment was recorded.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    const { supabase, accountId, account } = await requireRole("viewer");
    const { id, paymentId } = await params;

    const { data: invoice, error: invoiceErr } = await supabase
      .from("invoices")
      .select("*, contact:contacts(*)")
      .eq("id", id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (invoiceErr || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const { data: payments, error: paymentsErr } = await supabase
      .from("payments")
      .select("*")
      .eq("invoice_id", id)
      .order("paid_at", { ascending: true });
    if (paymentsErr || !payments) {
      return NextResponse.json({ error: "Failed to load payments" }, { status: 500 });
    }

    const payment = payments.find((p) => p.id === paymentId);
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const amountPaidToDate = payments
      .filter((p) => new Date(p.paid_at).getTime() <= new Date(payment.paid_at).getTime())
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const buffer = await renderToBuffer(
      <ReceiptPdfDocument
        accountName={account.name}
        logoUrl={account.logoUrl}
        accentColor={account.quoteAccentColor}
        address={account.address}
        taxId={account.taxId}
        invoiceNumber={invoice.invoice_number}
        contactName={invoice.contact?.name || invoice.contact?.phone || "—"}
        contactPhone={invoice.contact?.phone ?? ""}
        paymentAmount={payment.amount}
        paymentMethod={payment.method}
        paidAt={new Date(payment.paid_at).toLocaleDateString("es-MX")}
        invoiceTotal={invoice.total}
        amountPaid={amountPaidToDate}
        currency={invoice.currency}
        notes={payment.notes ?? null}
      />,
    );

    const path = `account-${accountId}/receipt-${invoice.invoice_number}-${payment.id}.pdf`;
    const admin = supabaseAdmin();
    const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

    if (uploadErr) {
      console.error("[POST /payments/[paymentId]/receipt] upload error:", uploadErr);
      return NextResponse.json({ error: "Failed to generate receipt" }, { status: 500 });
    }

    // Signed, not public — same rationale as the invoice/quote PDF
    // routes (identical BUCKET, same financial-document exposure).
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 48);
    if (signErr || !signed) {
      console.error("[POST /payments/[paymentId]/receipt] sign error:", signErr);
      return NextResponse.json({ error: "Failed to generate receipt" }, { status: 500 });
    }

    return NextResponse.json({
      url: signed.signedUrl,
      filename: `Recibo-${invoice.invoice_number}.pdf`,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
