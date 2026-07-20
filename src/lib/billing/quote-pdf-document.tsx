// ============================================================
// QuotePdfDocument — server-only. Rendered via
// @react-pdf/renderer's renderToBuffer() from the pdf route, never
// imported by a client component (it pulls in @react-pdf/renderer's
// Node-side layout engine).
//
// Branding is entirely account-driven: accounts.logo_url (falls back
// to no image — NOT the Zentro Med isotipo, since this document
// represents the CLINIC's brand to ITS patient, not Zentro Med's),
// accounts.quote_accent_color (falls back to Zentro's real brand
// green — see pdf-theme.ts), accounts.quote_terms (omitted entirely
// when blank).
// ============================================================

import { Document, Page, View, Text, Image } from "@react-pdf/renderer";
import { createPdfStyles, fmtMoney, ZENTRO_GREEN } from "./pdf-theme";

export interface QuotePdfLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface QuotePdfProps {
  accountName: string;
  logoUrl: string | null;
  accentColor: string | null;
  address: string | null;
  taxId: string | null;
  quoteTerms: string | null;
  quoteNumber: string;
  status: string;
  issueDate: string;
  expiryDate: string | null;
  contactName: string;
  contactPhone: string;
  items: QuotePdfLineItem[];
  subtotal: number;
  taxTotal: number;
  discountAmount: number;
  discountLabel: string | null;
  total: number;
  currency: string;
  notes: string | null;
}

export function QuotePdfDocument(props: QuotePdfProps) {
  const accent = props.accentColor || ZENTRO_GREEN;
  const styles = createPdfStyles(accent);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.topBar} fixed />
        <View style={styles.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML <img>; has no alt prop */}
            {props.logoUrl ? <Image src={props.logoUrl} style={styles.logo} /> : null}
            <Text style={[styles.accountName, { marginTop: props.logoUrl ? 8 : 0 }]}>
              {props.accountName}
            </Text>
            {props.address ? <Text style={styles.issuerMeta}>{props.address}</Text> : null}
            {props.taxId ? <Text style={styles.issuerMeta}>RFC: {props.taxId}</Text> : null}
          </View>
          <View>
            <Text style={styles.title}>Cotización</Text>
            <View style={styles.titleUnderline} />
            <Text style={styles.meta}>{props.quoteNumber}</Text>
            <Text style={styles.meta}>Fecha: {props.issueDate}</Text>
            {props.expiryDate ? <Text style={styles.meta}>Vence: {props.expiryDate}</Text> : null}
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Para</Text>
          <Text style={styles.value}>{props.contactName}</Text>
          {props.contactPhone ? <Text style={styles.value}>{props.contactPhone}</Text> : null}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, { width: "46%" }]}>Descripción</Text>
            <Text style={[styles.tableHeaderCell, { width: "14%", textAlign: "right" }]}>Cant.</Text>
            <Text style={[styles.tableHeaderCell, { width: "20%", textAlign: "right" }]}>P. unitario</Text>
            <Text style={[styles.tableHeaderCell, { width: "20%", textAlign: "right" }]}>Total</Text>
          </View>
          {props.items.map((item, i) => (
            <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={[styles.tableCell, { width: "46%" }]}>{item.description}</Text>
              <Text style={[styles.tableCell, { width: "14%", textAlign: "right" }]}>{item.quantity}</Text>
              <Text style={[styles.tableCell, { width: "20%", textAlign: "right" }]}>
                {fmtMoney(item.unitPrice, props.currency)}
              </Text>
              <Text style={[styles.tableCell, { width: "20%", textAlign: "right" }]}>
                {fmtMoney(item.lineTotal, props.currency)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsCard}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsRowLabel}>Subtotal</Text>
            <Text>{fmtMoney(props.subtotal, props.currency)}</Text>
          </View>
          {props.discountAmount > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsRowLabel}>
                Descuento{props.discountLabel ? ` (${props.discountLabel})` : ""}
              </Text>
              <Text>-{fmtMoney(props.discountAmount, props.currency)}</Text>
            </View>
          ) : null}
          <View style={styles.totalsRow}>
            <Text style={styles.totalsRowLabel}>Impuestos</Text>
            <Text>{fmtMoney(props.taxTotal, props.currency)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{fmtMoney(props.total, props.currency)}</Text>
          </View>
        </View>

        {props.notes ? (
          <View style={styles.section}>
            <Text style={styles.label}>Notas</Text>
            <Text style={styles.value}>{props.notes}</Text>
          </View>
        ) : null}

        {props.quoteTerms ? (
          <View style={styles.terms}>
            <Text>{props.quoteTerms}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
