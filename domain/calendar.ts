import { LedgerError } from "./validation";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Validates a calendar date independently of the machine's time zone. */
export function requireDate(value: unknown): string {
  const match = typeof value === "string" ? ISO_DATE.exec(value) : null;
  if (match) {
    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = month === 2 && leap ? 29 : DAYS_PER_MONTH[month - 1];
    if (year > 0 && days !== undefined && day >= 1 && day <= days) return match[0];
  }
  throw new LedgerError("Enter a valid date.");
}

export function localDate(today = new Date()): string {
  return [today.getFullYear().toString().padStart(4, "0"), today.getMonth() + 1, today.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}
