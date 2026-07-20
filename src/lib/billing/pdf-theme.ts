// ============================================================
// Shared @react-pdf/renderer styling for quote/invoice/receipt PDFs.
// Server-only, same posture as the documents that import it.
//
// ZUHMA_CORAL/ZUHMA_CORAL_DARK/ZUHMA_CORAL_FOREGROUND are the real
// Zuhma brand colors, matching globals.css's `html[data-theme="zuhma"]`
// OKLCH values (from zuhma.com's primary coral, #F94B5A). They're the
// fallback ONLY: every document actually branding-drives off
// `accounts.quote_accent_color` when the account has set one (this
// is the CLINIC's document to ITS patient, not a Zuhma marketing
// asset), same as before this redesign.
// ============================================================

import { StyleSheet } from "@react-pdf/renderer";

export const ZUHMA_CORAL = "#f94b5a";
export const ZUHMA_CORAL_DARK = "#a83240";
export const ZUHMA_CORAL_FOREGROUND = "#ffffff";

export function fmtMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/**
 * Builds the shared style set for one document, parameterized by the
 * resolved accent color (account's own color, or the Zuhma green
 * fallback). Kept as a function (not a static StyleSheet) because
 * several styles depend on the runtime accent value.
 */
export function createPdfStyles(accent: string) {
  return StyleSheet.create({
    page: { paddingTop: 0, paddingBottom: 40, paddingHorizontal: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
    topBar: { height: 6, backgroundColor: accent, marginBottom: 32 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
    logo: { width: 60, height: 60, objectFit: "contain" },
    accountName: { fontSize: 15, fontWeight: 700, color: ZUHMA_CORAL_DARK },
    issuerMeta: { fontSize: 8, color: "#888", marginTop: 2 },
    title: { fontSize: 22, fontWeight: 700, textAlign: "right", letterSpacing: 0.3 },
    titleUnderline: { height: 2, width: 48, backgroundColor: accent, alignSelf: "flex-end", marginTop: 4, marginBottom: 6 },
    meta: { fontSize: 9, color: "#666", textAlign: "right", marginTop: 2 },
    statusBadge: {
      alignSelf: "flex-end",
      marginTop: 8,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 3,
    },
    statusBadgeText: { fontSize: 8, fontWeight: 700 },
    infoBox: {
      marginBottom: 18,
      padding: 10,
      borderRadius: 4,
      backgroundColor: "#f7f7f7",
    },
    label: { fontSize: 8, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
    value: { fontSize: 11, lineHeight: 1.4 },
    table: { marginTop: 4, borderRadius: 4, overflow: "hidden" },
    tableHeaderRow: { flexDirection: "row", backgroundColor: accent, paddingVertical: 7, paddingHorizontal: 8 },
    tableHeaderCell: { fontSize: 8, color: ZUHMA_CORAL_FOREGROUND, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.3 },
    tableRow: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 8, borderBottom: "1 solid #eee" },
    tableRowAlt: { backgroundColor: "#fafafa" },
    tableCell: { fontSize: 9 },
    totalsCard: {
      marginTop: 16,
      alignSelf: "flex-end",
      width: 240,
      padding: 12,
      borderRadius: 4,
      backgroundColor: "#f7f7f7",
    },
    totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
    totalsRowLabel: { color: "#666" },
    grandTotalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 8,
      marginTop: 6,
      borderTop: `1 solid ${accent}`,
    },
    grandTotalLabel: { fontSize: 11, fontWeight: 700 },
    grandTotalValue: { fontSize: 15, fontWeight: 700, color: ZUHMA_CORAL_DARK },
    balanceRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 8,
      marginTop: 6,
      borderTop: "1 solid #ddd",
    },
    balanceLabel: { fontSize: 11, fontWeight: 700 },
    section: { marginBottom: 16 },
    terms: { marginTop: 28, paddingTop: 12, borderTop: "1 solid #ddd", fontSize: 8, color: "#888", lineHeight: 1.5 },
  });
}
