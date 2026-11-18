import type { LedgerView, MonthlyBudget, Transaction } from "../contracts/ledger";
import { requireDate } from "./calendar";
import type { LedgerDocument } from "./ledger";
import { LedgerError, requireMinorUnits } from "./validation";

const MONTHS_PER_YEAR = 12;
const FIRST_YEAR = 1;
const LAST_YEAR = 9999;

interface Totals {
  income: bigint;
  spending: bigint;
}

interface CategoryTotals extends Totals {
  readonly id: string | null;
  readonly name: string;
  readonly budget: number | null;
  readonly remaining: bigint | null;
}

export interface MonthSummary extends Totals {
  readonly balance: bigint;
  readonly categories: readonly CategoryTotals[];
}

export function requireMonth(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) {
    requireDate(`${value}-01`);
    return value;
  }
  throw new LedgerError("Choose a valid month.");
}

export function moveMonth(month: string, direction: -1 | 1): string {
  const [year, number] = requireMonth(month).split("-").map(Number);
  const next = year * MONTHS_PER_YEAR + number - 1 + direction;
  const nextYear = Math.floor(next / MONTHS_PER_YEAR);
  if (nextYear < FIRST_YEAR || nextYear > LAST_YEAR) return month;
  return `${String(nextYear).padStart(4, "0")}-${String(next % MONTHS_PER_YEAR + 1).padStart(2, "0")}`;
}

export function setBudget(document: LedgerDocument, budget: Omit<MonthlyBudget, "amountMinor"> & { amountMinor: number | null }): LedgerDocument {
  const month = requireMonth(budget.month);
  const categoryId = budget.categoryId;
  if (!document.categories.some(({ id }) => id === categoryId)) throw new LedgerError("Choose a budget category.");
  const amountMinor = budget.amountMinor === null ? null : requireMinorUnits(budget.amountMinor);
  if (amountMinor !== null && amountMinor < 0) throw new LedgerError("A budget cannot be negative.");
  const index = document.budgets.findIndex((item) => item.month === month && item.categoryId === categoryId);
  if (index < 0 && amountMinor === null || document.budgets[index]?.amountMinor === amountMinor) return document;
  const budgets = document.budgets.slice();
  if (amountMinor === null) budgets.splice(index, 1);
  else budgets.splice(index < 0 ? budgets.length : index, index < 0 ? 0 : 1, { month, categoryId, amountMinor });
  return { ...document, budgets };
}

// Time O(log n), space O(1), over a newest-first transaction list.
function findMonthStart(transactions: readonly Transaction[], latest: string): number {
  let lower = 0;
  let upper = transactions.length;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (transactions[middle].date > latest) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}

// Time O(log n + t + c + b), space O(c), for all transactions n, this month's transactions t, categories c and budgets b.
/** Computes the same minor-unit totals as the matching transaction rows, without range loss. */
export function monthSummary(ledger: LedgerView, selectedMonth: string): MonthSummary {
  const month = requireMonth(selectedMonth);
  const firstDay = `${month}-01`;
  const totals = new Map<string | null, Totals>();
  let income = 0n;
  let spending = 0n;
  for (let index = findMonthStart(ledger.transactions, `${month}-31`); index < ledger.transactions.length; index++) {
    const { date, amountMinor, categoryId } = ledger.transactions[index];
    if (date < firstDay) break;
    const category = totals.get(categoryId) ?? { income: 0n, spending: 0n };
    const amount = BigInt(amountMinor);
    if (amount >= 0n) { income += amount; category.income += amount; }
    else { spending -= amount; category.spending -= amount; }
    totals.set(categoryId, category);
  }
  const budgets = new Map<string, number>();
  for (const budget of ledger.budgets) {
    if (budget.month === month) budgets.set(budget.categoryId, budget.amountMinor);
  }
  const categories: CategoryTotals[] = ledger.categories.map(({ id, name }) => {
    const { income, spending } = totals.get(id) ?? { income: 0n, spending: 0n };
    const budget = budgets.get(id) ?? null;
    return { id, name, income, spending, budget, remaining: budget === null ? null : BigInt(budget) - spending };
  });
  const uncategorised = totals.get(null);
  if (uncategorised) categories.push({ id: null, name: "Uncategorised", ...uncategorised, budget: null, remaining: null });
  return { income, spending, balance: income - spending, categories };
}
