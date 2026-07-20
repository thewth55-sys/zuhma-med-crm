"use client";

/**
 * Client-only "what's this in my currency, roughly" estimate for the
 * public /pricing page. Deliberately informational only — actual
 * billing always stays in USD via Stripe (see checkout route); a
 * dynamic real-money conversion here would risk a visitor being
 * charged a different amount than what they saw, which is a trust/
 * dispute problem, not just a display one.
 *
 * Two free, no-API-key services, chained:
 *   1. ipwho.is — resolves the visitor's IP to a country code.
 *   2. open.er-api.com — daily USD exchange rates.
 * Both are best-effort: any failure (network, rate limit, unmapped
 * country) just means no estimate renders — USD-only is always a
 * perfectly fine fallback, never a broken page.
 */

// Currencies for Zentro Med's actual target market (Spanish-speaking
// Latin America) plus a handful of other common ones. Not exhaustive
// ISO 4217 coverage on purpose — a country missing here just means no
// local-currency line, which is a safe, silent fallback.
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  MX: "MXN",
  CO: "COP",
  AR: "ARS",
  CL: "CLP",
  PE: "PEN",
  BR: "BRL",
  EC: "USD", // Ecuador is already USD — no conversion needed
  GT: "GTQ",
  CR: "CRC",
  PA: "USD", // Panama is already USD
  DO: "DOP",
  UY: "UYU",
  BO: "BOB",
  PY: "PYG",
  SV: "USD", // El Salvador is already USD
  HN: "HNL",
  NI: "NIO",
  VE: "VES",
  ES: "EUR",
  US: "USD",
  CA: "CAD",
}

const SESSION_KEY = "zentro_local_currency_estimate_v1"

interface CachedEstimate {
  currency: string
  rate: number
}

async function resolveLocalCurrencyAndRate(): Promise<CachedEstimate | null> {
  if (typeof window === "undefined") return null

  const cached = sessionStorage.getItem(SESSION_KEY)
  if (cached) {
    try {
      return JSON.parse(cached) as CachedEstimate
    } catch {
      sessionStorage.removeItem(SESSION_KEY)
    }
  }

  try {
    const geoController = new AbortController()
    const geoTimeout = setTimeout(() => geoController.abort(), 4000)
    const geoRes = await fetch("https://ipwho.is/", { signal: geoController.signal })
    clearTimeout(geoTimeout)
    const geo = await geoRes.json()
    const countryCode: string | undefined = geo?.country_code
    const currency = countryCode ? COUNTRY_TO_CURRENCY[countryCode] : undefined
    if (!currency || currency === "USD") return null

    const rateController = new AbortController()
    const rateTimeout = setTimeout(() => rateController.abort(), 4000)
    const rateRes = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: rateController.signal,
    })
    clearTimeout(rateTimeout)
    const rateData = await rateRes.json()
    const rate: number | undefined = rateData?.rates?.[currency]
    if (!rate) return null

    const result: CachedEstimate = { currency, rate }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(result))
    return result
  } catch {
    return null
  }
}

/**
 * Converts a USD amount to a formatted local-currency estimate
 * string, or null if detection/conversion isn't available (missing
 * country mapping, network failure, or the visitor is already in a
 * USD country). No decimals — this is a rough estimate, not an
 * invoice line.
 */
export async function estimateLocalPrice(usdAmount: number): Promise<string | null> {
  const resolved = await resolveLocalCurrencyAndRate()
  if (!resolved) return null

  const converted = usdAmount * resolved.rate
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: resolved.currency,
      maximumFractionDigits: 0,
    }).format(converted)
  } catch {
    // Intl throws on a currency code it doesn't recognize (unlikely
    // given our static map, but not worth crashing the pricing page
    // over) — fail silently, same as every other step here.
    return null
  }
}
