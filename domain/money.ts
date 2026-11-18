import { LedgerError } from "./validation";

export const DEFAULT_CURRENCY = "USD";
export const CURRENCIES: readonly string[] = Intl.supportedValuesOf("currency");
const SUPPORTED_CURRENCIES = new Set(CURRENCIES);
const FRACTION_DIGITS = new Map<string, number>();
const DECIMAL_AMOUNT = /^([+-]?)(\d+)(?:\.(\d+))?$/;
const MAX_MINOR_UNITS = BigInt(Number.MAX_SAFE_INTEGER);

export function requireCurrency(value: unknown): string {
  if (typeof value !== "string" || !SUPPORTED_CURRENCIES.has(value)) {
    throw new LedgerError("Choose a supported currency.");
  }
  return value;
}

export function minorDigits(currency: string): number {
  const cached = FRACTION_DIGITS.get(currency);
  if (cached !== undefined) return cached;
  const { maximumFractionDigits = 0 } = new Intl.NumberFormat("en", {
    style: "currency",
    currency: requireCurrency(currency),
  }).resolvedOptions();
  FRACTION_DIGITS.set(currency, maximumFractionDigits);
  return maximumFractionDigits;
}

/** Converts decimal digits directly to a signed safe integer in the ledger currency. */
export function parseAmount(value: string, currency: string): number {
  const match = DECIMAL_AMOUNT.exec(value.trim());
  if (!match) throw new LedgerError("Enter an amount such as -12.50.");
  const [, sign, whole, fraction = ""] = match;
  const digits = minorDigits(currency);
  if (fraction.length > digits) {
    throw new LedgerError(digits === 0 ? `${currency} uses whole amounts.` : `Enter at most ${digits} decimal places for ${currency}.`);
  }
  const significantDigits = `${whole}${fraction.padEnd(digits, "0")}`.replace(/^0+/, "");
  if (significantDigits.length > MAX_MINOR_UNITS.toString().length) throw new LedgerError("The amount is too large.");
  const amount = BigInt(significantDigits);
  if (amount > MAX_MINOR_UNITS) throw new LedgerError("The amount is too large.");
  return Number(sign === "-" ? -amount : amount);
}

/** Formats minor units without converting them through a floating-point decimal. */
export function formatAmount(amountMinor: number | bigint, currency: string): string {
  const amount = BigInt(amountMinor);
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  const digits = minorDigits(currency);
  const text = absolute.toString().padStart(digits + 1, "0");
  return digits === 0 ? `${sign}${text}` : `${sign}${text.slice(0, -digits)}.${text.slice(-digits)}`;
}
