import type { LedgerView } from "../contracts/ledger";
import { localDate } from "../domain/calendar";
import { formatAmount, parseAmount } from "../domain/money";
import { monthSummary, moveMonth, requireMonth } from "../domain/summary";
import { api } from "./api";
import { element, field, messageOf, setFormError } from "./dom";

const MAX_PROGRESS = 100n;
const MONTH_LABEL = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });

function addMoneyCell(row: HTMLTableRowElement, amount: bigint | number | null, currency: string): void {
  const cell = row.insertCell();
  cell.className = "amount";
  cell.textContent = amount === null ? "—" : formatAmount(amount, currency);
}

function addRemaining(cell: HTMLTableCellElement, remaining: bigint | null, spent: bigint, budget: number | null, currency: string, category: string): void {
  if (remaining === null || budget === null) { cell.textContent = "—"; return; }
  const status = document.createElement("span");
  status.textContent = remaining < 0n ? `${formatAmount(-remaining, currency)} over` : `${formatAmount(remaining, currency)} left`;
  status.classList.toggle("over-budget", remaining < 0n);
  const progress = document.createElement("progress");
  progress.max = Number(MAX_PROGRESS);
  progress.value = Number(remaining < 0n ? MAX_PROGRESS : budget === 0 ? 0n : spent * MAX_PROGRESS / BigInt(budget));
  progress.classList.toggle("over-budget", remaining < 0n);
  progress.setAttribute("aria-label", `${category} budget used`);
  cell.append(status, progress);
}

/** Keeps the selected month while the user moves between workspace tabs. */
export function connectSummary(currentLedger: () => LedgerView, renderLedger: (ledger: LedgerView) => void, setStatus: (message: string, error?: boolean) => void) {
  const monthControl = element<HTMLInputElement>("summary-month");
  const previous = element<HTMLButtonElement>("previous-month");
  const next = element<HTMLButtonElement>("next-month");
  const dialog = element<HTMLDialogElement>("budget-dialog");
  const form = element<HTMLFormElement>("budget-form");
  let month = localDate().slice(0, 7);
  let editing: { categoryId: string; month: string } | undefined;

  function openBudget(categoryId: string, name: string, budget: number | null, currency: string): void {
    editing = { categoryId, month };
    const label = MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`));
    element("budget-description").textContent = `${name} · ${label}`;
    element("budget-amount-label").textContent = `Monthly budget (${currency})`;
    field(form, "budget").value = budget === null ? "" : formatAmount(budget, currency);
    setFormError(form, "");
    dialog.showModal();
  }

  function render(view: LedgerView): void {
    const summary = monthSummary(view, month);
    monthControl.value = month;
    previous.disabled = moveMonth(month, -1) === month;
    next.disabled = moveMonth(month, 1) === month;
    for (const [elementId, total] of [["month-income", summary.income], ["month-spending", summary.spending], ["month-balance", summary.balance]] as const) {
      element(elementId).textContent = `${formatAmount(total, view.currency)} ${view.currency}`;
    }
    element("budget-currency").textContent = view.currency;
    const rows = document.createDocumentFragment();
    for (const { id, name, income, spending, budget, remaining } of summary.categories) {
      const row = document.createElement("tr");
      row.insertCell().textContent = name;
      addMoneyCell(row, income, view.currency);
      addMoneyCell(row, spending, view.currency);
      addMoneyCell(row, budget, view.currency);
      addRemaining(row.insertCell(), remaining, spending, budget, view.currency, name);
      const actions = row.insertCell();
      actions.className = "row-actions";
      if (id !== null) {
        const button = document.createElement("button");
        button.type = "button";
        const verb = budget === null ? "Set budget" : "Edit budget";
        button.textContent = verb;
        button.setAttribute("aria-label", `${verb} for ${name}`);
        button.addEventListener("click", () => openBudget(id, name, budget, view.currency));
        actions.append(button);
      }
      rows.append(row);
    }
    element("budget-rows").replaceChildren(rows);
    element("budget-empty").hidden = summary.categories.length > 0;
  }

  previous.addEventListener("click", () => { month = moveMonth(month, -1); render(currentLedger()); });
  next.addEventListener("click", () => { month = moveMonth(month, 1); render(currentLedger()); });
  monthControl.addEventListener("change", () => {
    try { month = requireMonth(monthControl.value); render(currentLedger()); setStatus(""); }
    catch (error) { monthControl.value = month; setStatus(messageOf(error), true); }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    if (!editing || submit.disabled) return;
    submit.disabled = true;
    setFormError(form, "");
    try {
      const input = field(form, "budget").value.trim();
      const amountMinor = input ? parseAmount(input, currentLedger().currency) : null;
      renderLedger(await api.commit({ type: "setBudget", ...editing, amountMinor }));
      dialog.close();
      setStatus(amountMinor === null ? "Budget cleared." : "Budget saved.");
    } catch (error) { setFormError(form, messageOf(error)); }
    finally { submit.disabled = false; }
  });
  return render;
}
