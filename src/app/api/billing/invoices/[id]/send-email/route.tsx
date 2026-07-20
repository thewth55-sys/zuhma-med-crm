import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { InvoicePdfDocument, type InvoicePdfLineItem } from "@/lib/billing/invoice-pdf-document";
import { fmtMoney } from "@/lib/billing/pdf-theme";
import { sendEmail } from "@/lib/email/resend-client";
import { renderBrandedEmail, escapeHtml } from "@/lib/email/branded-template";

/**
 * POST /api/billing/invoices/[id]/send-email — same PDF render as
 * the .../pdf route (kept separate rather than sharing a helper, same
 * "each route owns its own render" precedent as quotes/invoices pdf
 * routes already follow), but attaches the buffer directly to a
 * Resend email instead of uploading it to storage for a WhatsApp
 * media_url. Requires the contact to have an email on file.
 */
export async function POST(
  _request: Request,
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
    if (!invoice.contact?.email) {
      return NextResponse.json({ error: "This patient has no email on file" }, { status: 400 });
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

    const balanceDue = Math.max(0, invoice.total - invoice.amount_paid);
    const balanceLine = balanceDue > 0
      ? `<p>Saldo pendiente: <strong>${fmtMoney(balanceDue, invoice.currency)}</strong></p>`
      : `<p>Esta factura ya está pagada en su totalidad. ¡Gracias!</p>`;

    const html = renderBrandedEmail({
      heading: `Factura ${invoice.invoice_number}`,
      bodyHtml: `<p>Hola ${escapeHtml(invoice.contact.name || "")},</p><p>Adjuntamos tu factura por un total de <strong>${fmtMoney(invoice.total, invoice.currency)}</strong>.</p>${balanceLine}`,
      brandName: account.name,
      logoUrl: account.logoUrl,
      accentColor: account.quoteAccentColor,
      footerNote: `Enviado por ${account.name} vía Zentro Med.`,
    });

    await sendEmail({
      to: invoice.contact.email,
      subject: `Factura ${invoice.invoice_number} — ${account.name}`,
      html,
      attachments: [{ filename: `Factura-${invoice.invoice_number}.pdf`, content: buffer }],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
