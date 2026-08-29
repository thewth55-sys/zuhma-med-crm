import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Lowercase, dash-separated slug for public URL segments (booking
 * pages, landing pages). Strips accents so "Clínica José" becomes
 * "clinica-jose" rather than dropping the whole word.
 */
const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g")

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
