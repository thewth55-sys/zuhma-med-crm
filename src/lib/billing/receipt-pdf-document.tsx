// ============================================================
// ReceiptPdfDocument — server-only, same rendering path and
// branding rules as QuotePdfDocument (see that file's header
// comment). Renders a proof-of-payment for one `payments` row
// against an invoice — full or partial, method and date included,
// with the invoice's running balance so the patient sees what (if
// anything) is still owed.
// ============================================================

import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { createPdfStyles, fmtMoney, ZUHMA_CORAL, ZUHMA_CORAL_DARK } from "./pdf-theme";

export interface ReceiptPdfProps {
  accountName: string;
  logoUrl: string | null;
  accentColor: string | null;
  address: string | null;
  taxId: string | null;
  invoiceNumber: string;
  contactName: string;
  contactPhone: string;
  paymentAmount: number;
  paymentMethod: string;
  paidAt: string;
  invoiceTotal: number;
  amountPaid: number;
  currency: string;
  notes: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  other: "Otro",
};

export function ReceiptPdfDocument(props: ReceiptPdfProps) {
  const accent = props.accentColor || ZUHMA_CORAL;
  const remaining = Math.max(0, props.invoiceTotal - props.amountPaid);
  const styles = createPdfStyles(accent);
  const receiptStyles = StyleSheet.create({
    amountBlock: {
      marginTop: 4,
      marginBottom: 18,
      alignItems: "center",
      paddingVertical: 24,
      borderRadius: 6,
      backgroundColor: "#f7f7f7",
    },
    amountLabel: { fontSize: 9, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 },
    amountValue: { fontSize: 30, fontWeight: 700, color: ZUHMA_CORAL_DARK, marginTop: 6 },
    amountMethod: { fontSize: 9, color: "#888", marginTop: 4 },
    summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
    summaryLabel: { color: "#666" },
  });

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
            <Text style={styles.title}>Recibo de pago</Text>
            <View style={styles.titleUnderline} />
            <Text style={styles.meta}>Factura {props.invoiceNumber}</Text>
            <Text style={styles.meta}>Fecha: {props.paidAt}</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.label}>Recibido de</Text>
          <Text style={styles.value}>{props.contactName}</Text>
          {props.contactPhone ? <Text style={styles.value}>{props.contactPhone}</Text> : null}
        </View>

        <View style={receiptStyles.amountBlock}>
          <Text style={receiptStyles.amountLabel}>Monto recibido</Text>
          <Text style={receiptStyles.amountValue}>{fmtMoney(props.paymentAmount, props.currency)}</Text>
          <Text style={receiptStyles.amountMethod}>
            {METHOD_LABELS[props.paymentMethod] ?? props.paymentMethod}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={receiptStyles.summaryRow}>
            <Text style={receiptStyles.summaryLabel}>Total de la factura</Text>
            <Text>{fmtMoney(props.invoiceTotal, props.currency)}</Text>
          </View>
          <View style={receiptStyles.summaryRow}>
            <Text style={receiptStyles.summaryLabel}>Pagado a la fecha</Text>
            <Text>{fmtMoney(props.amountPaid, props.currency)}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Saldo pendiente</Text>
            <Text style={[styles.grandTotalValue, { color: remaining > 0 ? "#b45309" : ZUHMA_CORAL_DARK }]}>
              {fmtMoney(remaining, props.currency)}
            </Text>
          </View>
        </View>

        {props.notes ? (
          <View style={styles.section}>
            <Text style={styles.label}>Notas</Text>
            <Text style={styles.value}>{props.notes}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
