/**
 * Shared password policy for signup and password reset — pure, no
 * I/O, so both client forms and (if ever needed) a server-side check
 * can call the same rule set without drift.
 *
 * Bar: 8+ chars, at least one uppercase, one lowercase, one digit.
 * Deliberately doesn't require a symbol — that tips into the
 * "users write it on a sticky note" failure mode for a marginal
 * strength gain; length + character-class mixing is the better
 * trade-off for a clinic-staff audience that isn't security-trained.
 */

export const MIN_PASSWORD_LENGTH = 8;

export type PasswordStrengthErrorCode =
  | "tooShort"
  | "needsUppercase"
  | "needsLowercase"
  | "needsNumber";

/**
 * Returns the first unmet rule, or null if the password passes every
 * rule. Checking one rule at a time (rather than returning a list)
 * keeps the UI message singular and actionable.
 */
export function getPasswordStrengthError(password: string): PasswordStrengthErrorCode | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "tooShort";
  if (!/[A-Z]/.test(password)) return "needsUppercase";
  if (!/[a-z]/.test(password)) return "needsLowercase";
  if (!/[0-9]/.test(password)) return "needsNumber";
  return null;
}

export function isStrongPassword(password: string): boolean {
  return getPasswordStrengthError(password) === null;
}
