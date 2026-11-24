// Phone helpers for the restricted WhatsApp test mode (pure, browser-safe).

/** Keeps only digits; returns null when the result is not a plausible E.164 number. */
export function normalizeWhatsAppDigits(input: string): string | null {
  const digits = input.replace(/\D/g, "").replace(/^00/, "");
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}

/**
 * Brazilian mobiles may arrive from WhatsApp without the 9th digit
 * (556299998888 instead of 5562999998888). Both forms identify the same phone.
 */
export function phoneVariants(digits: string): string[] {
  const out = new Set([digits]);
  const withNine = digits.match(/^55(\d{2})9(\d{8})$/);
  if (withNine) out.add(`55${withNine[1]}${withNine[2]}`);
  const withoutNine = digits.match(/^55(\d{2})([6-9]\d{7})$/);
  if (withoutNine) out.add(`55${withoutNine[1]}9${withoutNine[2]}`);
  return [...out];
}

/** True only when the sender/recipient matches a number on the allowlist. */
export function isAllowedNumber(raw: unknown, allowlist: readonly string[]): boolean {
  if (typeof raw !== "string") return false;
  const digits = normalizeWhatsAppDigits(raw);
  if (!digits || allowlist.length === 0) return false;
  const allowed = new Set(allowlist.flatMap(phoneVariants));
  return phoneVariants(digits).some((v) => allowed.has(v));
}

export function formatWhatsAppDigits(digits: string): string {
  const br = digits.match(/^55(\d{2})(9?\d{4})(\d{4})$/);
  if (br) return `+55 (${br[1]}) ${br[2]}-${br[3]}`;
  return `+${digits}`;
}
