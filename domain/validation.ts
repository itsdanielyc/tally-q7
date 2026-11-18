export class LedgerError extends Error {}

/** Protects the file and IPC boundaries from non-record values. */
export function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new LedgerError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function requireText(value: unknown, label: string, optional = false): string {
  if (typeof value !== "string") throw new LedgerError(`${label} must be text.`);
  if (!optional && value.trim() === "") throw new LedgerError(`Enter ${label.toLowerCase()}.`);
  return value;
}

export function requireMinorUnits(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new LedgerError("The amount must be a whole number of minor units in range.");
  }
  return value === 0 ? 0 : value;
}
