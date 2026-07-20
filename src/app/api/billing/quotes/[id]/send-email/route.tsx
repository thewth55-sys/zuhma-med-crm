import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { QuotePdfDocument, type QuotePdfLineItem } from "@/lib/billing/quote-pdf-document";
import { fmtMoney } from "@/lib/billing/pdf-theme";
import { sendEmail } from "@/lib/email/resend-client";
import { renderBrandedEmail, escapeHtml } from "@/lib/email/branded-template";

/**
 * POST /api/billing/quotes/[id]/send-email — same PDF render as the
 * .../pdf route, attached directly to a Resend email instead of
 * uploaded to storage for a WhatsApp media_url. Requires the contact
 * to have an email on file.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId, account } = await requireRole("viewer");
    const { id } = await params;

    const { data: quote, error: quoteErr } = await supabase
      .from("quotes")
      .select("*, contact:contacts(*)")
      .eq("id", id)
      .eq("account_id", accountId)
      .maybeSingle();

    if (quoteErr || !quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }
    if (!quote.contact?.email) {
      return NextResponse.json({ error: "This patient has no email on file" }, { status: 400 });
    }

    const { data: itemRows } = await supabase
      .from("quote_items")
      .select("description, quantity, unit_price, line_total")
      .eq("quote_id", id)
      .order("position", { ascending: true });

    const items: QuotePdfLineItem[] = (itemRows ?? []).map((row) => ({
      description: row.description,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      lineTotal: row.line_total,
    }));

    const buffer = await renderToBuffer(
      <QuotePdfDocument
        accountName={account.name}
        logoUrl={account.logoUrl}
        accentColor={account.quoteAccentColor}
        address={account.address}
        taxId={account.taxId}
        quoteTerms={account.quoteTerms}
        quoteNumber={quote.quote_number}
        status={quote.status}
        issueDate={quote.issue_date}
        expiryDate={quote.expiry_date ?? null}
        contactName={quote.contact?.name || quote.contact?.phone || "—"}
        contactPhone={quote.contact?.phone ?? ""}
        items={items}
        subtotal={quote.subtotal}
        taxTotal={quote.tax_total}
        discountAmount={quote.discount_amount ?? 0}
        discountLabel={quote.discount_type === "percent" ? `${quote.discount_value}%` : null}
        total={quote.total}
        currency={quote.currency}
        notes={quote.notes ?? null}
      />,
    );

    const expiryLine = quote.expiry_date ? `<p>Vigente hasta el ${quote.expiry_date}.</p>` : "";

    const html = renderBrandedEmail({
      heading: `Cotización ${quote.quote_number}`,
      bodyHtml: `<p>Hola ${escapeHtml(quote.contact.name || "")},</p><p>Adjuntamos tu cotización por un total de <strong>${fmtMoney(quote.total, quote.currency)}</strong>.</p>${expiryLine}`,
      brandName: account.name,
      logoUrl: account.logoUrl,
      accentColor: account.quoteAccentColor,
      footerNote: `Enviado por ${account.name} vía Zentro Med.`,
    });

    await sendEmail({
      to: quote.contact.email,
      subject: `Cotización ${quote.quote_number} — ${account.name}`,
      html,
      attachments: [{ filename: `Cotizacion-${quote.quote_number}.pdf`, content: buffer }],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
