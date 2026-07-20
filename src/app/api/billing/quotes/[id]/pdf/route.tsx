import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { QuotePdfDocument, type QuotePdfLineItem } from "@/lib/billing/quote-pdf-document";

const BUCKET = "chat-media";

/**
 * POST /api/billing/quotes/[id]/pdf — renders the quote as a branded
 * PDF (account logo/color/terms — see quote-pdf-document.tsx),
 * uploads it to the `chat-media` bucket (public, already account-
 * scoped by RLS — reused rather than a new bucket), and returns its
 * URL. The "Descargar PDF" and "Enviar por WhatsApp" buttons both
 * call this; WhatsApp send is then a plain POST to the existing
 * /api/whatsapp/send with that URL as media_url — no new send path.
 *
 * Re-generates on every call rather than caching — a quote's line
 * items or the account's branding can change between sends, and
 * these are small, infrequent documents (not worth the staleness
 * risk to save a sub-second render).
 */
export async function POST(
  request: Request,
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

    const path = `account-${accountId}/quote-${quote.quote_number}-${Date.now()}.pdf`;
    const admin = supabaseAdmin();
    const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

    if (uploadErr) {
      console.error("[POST /api/billing/quotes/[id]/pdf] upload error:", uploadErr);
      return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
    }

    // Signed, not public — see the identical comment on the invoice
    // PDF route (same BUCKET, same rationale).
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 48);
    if (signErr || !signed) {
      console.error("[POST /api/billing/quotes/[id]/pdf] sign error:", signErr);
      return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
    }

    return NextResponse.json({
      url: signed.signedUrl,
      filename: `Cotizacion-${quote.quote_number}.pdf`,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
