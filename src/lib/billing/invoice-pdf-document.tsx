// ============================================================
// InvoicePdfDocument — server-only, same rendering path and
// branding rules as QuotePdfDocument (see that file's header
// comment). Adds a payment-status block (paid/balance due) that
// quotes don't need, since an invoice's whole point is tracking
// money owed.
// ============================================================

import { Document, Page, View, Text, Image } from "@react-pdf/renderer";
import { createPdfStyles, fmtMoney, ZENTRO_GREEN, ZENTRO_GREEN_DARK } from "./pdf-theme";

export interface InvoicePdfLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InvoicePdfProps {
  accountName: string;
  logoUrl: string | null;
  accentColor: string | null;
  address: string | null;
  taxId: string | null;
  quoteTerms: string | null;
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  contactName: string;
  contactPhone: string;
  items: InvoicePdfLineItem[];
  subtotal: number;
  taxTotal: number;
  discountAmount: number;
  discountLabel: string | null;
  total: number;
  amountPaid: number;
  currency: string;
  notes: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  paid: "Pagada",
  partial: "Pago parcial",
  overdue: "Vencida",
  void: "Anulada",
};

export function InvoicePdfDocument(props: InvoicePdfProps) {
  const accent = props.accentColor || ZENTRO_GREEN;
  const balanceDue = Math.max(0, props.total - props.amountPaid);
  const styles = createPdfStyles(accent);
  const statusBg = balanceDue > 0 ? "#fef3c7" : "#d1fae5";
  const statusColor = balanceDue > 0 ? "#92400e" : "#065f46";
  const balanceColor = balanceDue > 0 ? "#b45309" : ZENTRO_GREEN_DARK;

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
            <Text style={styles.title}>Factura</Text>
            <View style={styles.titleUnderline} />
            <Text style={styles.meta}>{props.invoiceNumber}</Text>
            <Text style={styles.meta}>Fecha: {props.issueDate}</Text>
            {props.dueDate ? <Text style={styles.meta}>Vence: {props.dueDate}</Text> : null}
            <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {(STATUS_LABEL[props.status] ?? props.status).toUpperCase()}
              </Text>
            </View>
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
          <View style={styles.totalsRow}>
            <Text style={styles.totalsRowLabel}>Pagado</Text>
            <Text>{fmtMoney(props.amountPaid, props.currency)}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Saldo pendiente</Text>
            <Text style={[styles.grandTotalValue, { color: balanceColor }]}>
              {fmtMoney(balanceDue, props.currency)}
            </Text>
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
