import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { InvoicePdfDocument, type InvoicePdfLineItem } from "@/lib/billing/invoice-pdf-document";

const BUCKET = "chat-media";

/**
 * POST /api/billing/invoices/[id]/pdf — same branded-PDF pattern as
 * the quote PDF route (see that file's header comment), plus the
 * payment status (amount_paid / balance due) that only makes sense
 * on an invoice.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId, account } = await requireRole("viewer");
    const { id } = await params;

    const { data: invoice, error: invoiceErr } = await supabase
      .from("invoices")
      .select("*, contact:contacts(*)")
      .eq("id", id)
      .eq("account_id", accountId)
      .maybeSingle();

    if (invoiceErr || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const { data: itemRows } = await supabase
      .from("invoice_items")
      .select("description, quantity, unit_price, line_total")
      .eq("invoice_id", id)
      .order("position", { ascending: true });

    const items: InvoicePdfLineItem[] = (itemRows ?? []).map((row) => ({
      description: row.description,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      lineTotal: row.line_total,
    }));

    const buffer = await renderToBuffer(
      <InvoicePdfDocument
        accountName={account.name}
        logoUrl={account.logoUrl}
        accentColor={account.quoteAccentColor}
        address={account.address}
        taxId={account.taxId}
        quoteTerms={account.quoteTerms}
        invoiceNumber={invoice.invoice_number}
        status={invoice.status}
        issueDate={invoice.issue_date}
        dueDate={invoice.due_date ?? null}
        contactName={invoice.contact?.name || invoice.contact?.phone || "—"}
        contactPhone={invoice.contact?.phone ?? ""}
        items={items}
        subtotal={invoice.subtotal}
        taxTotal={invoice.tax_total}
        discountAmount={invoice.discount_amount ?? 0}
        discountLabel={invoice.discount_type === "percent" ? `${invoice.discount_value}%` : null}
        total={invoice.total}
        amountPaid={invoice.amount_paid}
        currency={invoice.currency}
        notes={invoice.notes ?? null}
      />,
    );

    const path = `account-${accountId}/invoice-${invoice.invoice_number}-${Date.now()}.pdf`;
    const admin = supabaseAdmin();
    const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

    if (uploadErr) {
      console.error("[POST /api/billing/invoices/[id]/pdf] upload error:", uploadErr);
      return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
    }

    // Signed, not public — `chat-media` is a public bucket (Meta needs
    // to fetch WhatsApp attachments with no auth), but this file is a
    // financial document with a patient's name/phone/pricing. A public
    // URL never expires and this link gets sent to the patient
    // directly (see "Enviar por WhatsApp"/"Enviar por correo"), so
    // anyone who ever sees that message would otherwise have permanent,
    // unauthenticated access to it. 48h covers immediate download plus
    // Meta's WhatsApp media fetch with room to spare.
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 48);
    if (signErr || !signed) {
      console.error("[POST /api/billing/invoices/[id]/pdf] sign error:", signErr);
      return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
    }

    return NextResponse.json({
      url: signed.signedUrl,
      filename: `Factura-${invoice.invoice_number}.pdf`,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
