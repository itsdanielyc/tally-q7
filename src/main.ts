import type { LedgerCommand, LedgerView, Transaction, UndoAction } from "../contracts/ledger";
import { localDate } from "../domain/calendar";
import { CURRENCIES, formatAmount, parseAmount } from "../domain/money";
import { api } from "./api";
import { element, field, messageOf, setFormError } from "./dom";
import { connectImport } from "./import-panel";
import { connectCategories } from "./category-panel";
import { connectSummary } from "./summary-panel";
import { connectFilters } from "./filter-panel";

const displayDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });
const addTransaction = element<HTMLButtonElement>("add-transaction");
const openSettings = element<HTMLButtonElement>("open-settings");
const exportCsv = element<HTMLButtonElement>("export-csv");
const undo = element<HTMLButtonElement>("undo-action");
const UNDO_LABELS: Record<UndoAction, string> = {
  deleteTransaction: "Undo transaction deletion", deleteCategory: "Undo category deletion",
  mergeCategories: "Undo category merge", deleteRule: "Undo rule removal", importCsv: "Undo import",
};
const transactionDialog = element<HTMLDialogElement>("transaction-dialog");
const transactionForm = element<HTMLFormElement>("transaction-form");
const deleteDialog = element<HTMLDialogElement>("delete-dialog");
const deleteForm = element<HTMLFormElement>("delete-form");
const settingsDialog = element<HTMLDialogElement>("settings-dialog");
const settingsForm = element<HTMLFormElement>("settings-form");
const transactionsBody = element<HTMLTableSectionElement>("transactions");
const navigation = document.querySelectorAll<HTMLButtonElement>("[data-page]");
const panels = document.querySelectorAll<HTMLElement>("[data-page-view]");
let ledger: LedgerView | undefined;
let editedId: string | undefined;
let deletedId: string | undefined;
let exporting = false;

function currentLedger(): LedgerView {
  if (!ledger) throw new Error("The ledger is still loading.");
  return ledger;
}

function actionButton(action: "edit" | "delete", transaction: Transaction): HTMLButtonElement {
  const button = document.createElement("button");
  const label = action === "edit" ? "Edit" : "Delete";
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-label", `${label} ${transaction.payee}`);
  button.dataset.action = action;
  button.dataset.id = transaction.id;
  return button;
}

function renderLedger(view: LedgerView): void {
  ledger = view;
  filters.update(view);
  renderRows(view);
  undo.hidden = view.undoAction === null;
  undo.title = view.undoAction ? UNDO_LABELS[view.undoAction] : "";
  addTransaction.disabled = false;
  openSettings.disabled = false;
  element<HTMLButtonElement>("import-csv").disabled = false;
  navigation.forEach((button) => { button.disabled = false; });
  renderActivePage(view);
}

function renderRows(view: LedgerView): void {
  const shown = filters.rows(view);
  const categories = new Map(view.categories.map(({ id, name }) => [id, name]));
  const rows = document.createDocumentFragment();
  for (const transaction of shown) {
    const row = document.createElement("tr");
    row.insertCell().textContent = displayDate.format(new Date(`${transaction.date}T00:00:00Z`));

    const payee = document.createElement("strong");
    payee.textContent = transaction.payee;
    const payeeCell = row.insertCell();
    payeeCell.append(payee);
    if (transaction.note) {
      const note = document.createElement("small");
      note.textContent = transaction.note;
      payeeCell.append(note);
    }
    row.insertCell().textContent = categories.get(transaction.categoryId ?? "") ?? "—";

    const amount = row.insertCell();
    amount.className = "amount";
    amount.classList.toggle("amount-income", transaction.amountMinor > 0);
    amount.textContent = formatAmount(transaction.amountMinor, view.currency);

    const actions = row.insertCell();
    actions.className = "row-actions";
    actions.append(actionButton("edit", transaction), actionButton("delete", transaction));
    rows.append(row);
  }
  transactionsBody.replaceChildren(rows);
  const total = view.transactions.length;
  const count = shown.length === total ? String(total) : `${shown.length} of ${total}`;
  element("entry-count").textContent = `${count} ${total === 1 ? "transaction" : "transactions"}`;
  element("amount-heading").textContent = `Amount (${view.currency})`;
  const empty = element("ledger-empty");
  empty.hidden = shown.length !== 0;
  empty.textContent = total ? "No transactions match these filters." : "No transactions yet.";
  exportCsv.disabled = exporting || shown.length === 0;
}

function openTransaction(transaction?: Transaction): void {
  const view = currentLedger();
  editedId = transaction?.id;
  element("transaction-title").textContent = transaction ? "Edit transaction" : "Add transaction";
  element("amount-label").textContent = `Amount (${view.currency})`;
  field(transactionForm, "date").value = transaction?.date ?? localDate();
  field(transactionForm, "payee").value = transaction?.payee ?? "";
  field(transactionForm, "amount").value = transaction ? formatAmount(transaction.amountMinor, view.currency) : "";
  field(transactionForm, "category").value = view.categories.find(({ id }) => id === transaction?.categoryId)?.name ?? "";
  field(transactionForm, "note").value = transaction?.note ?? "";
  element("category-options").replaceChildren(...view.categories.map(({ name }) => new Option(name, name)));
  setFormError(transactionForm, "");
  transactionDialog.showModal();
  field(transactionForm, "payee").focus();
}

function openDeleteConfirmation(transaction: Transaction): void {
  deletedId = transaction.id;
  element("delete-description").textContent = `Remove the transaction for ${transaction.payee}?`;
  setFormError(deleteForm, "");
  deleteDialog.showModal();
}

function bindMutation(form: HTMLFormElement, dialog: HTMLDialogElement, command: () => LedgerCommand, success: string): void {
  const submit = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    setFormError(form, "");
    try {
      renderLedger(await api.commit(command()));
      dialog.close();
      setStatus(success);
    } catch (error) {
      setFormError(form, messageOf(error));
    } finally {
      submit.disabled = false;
    }
  });
}

function setStatus(message: string, isError = false): void {
  const status = element("app-status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

const badge = document.querySelector<HTMLElement>("[data-testid=backend-badge]")!;
badge.textContent = api.kind;
badge.hidden = api.kind !== "mock";

addTransaction.addEventListener("click", () => openTransaction());
transactionsBody.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-id]");
  if (!button) return;
  const transaction = currentLedger().transactions.find(({ id }) => id === button.dataset.id);
  if (!transaction) return;
  if (button.dataset.action === "edit") openTransaction(transaction);
  else openDeleteConfirmation(transaction);
});
openSettings.addEventListener("click", () => {
  const view = currentLedger();
  const select = field<HTMLSelectElement>(settingsForm, "currency");
  select.replaceChildren(...CURRENCIES.map((currency) => new Option(`${currency} · ${currencyNames.of(currency)}`, currency)));
  select.value = view.currency;
  select.disabled = view.transactions.length !== 0 || view.budgets.length !== 0;
  setFormError(settingsForm, "");
  settingsDialog.showModal();
});
document.querySelectorAll<HTMLButtonElement>("[data-close]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog")?.close());
});
bindMutation(transactionForm, transactionDialog, () => ({
  type: "saveTransaction",
  id: editedId,
  transaction: {
    date: field(transactionForm, "date").value,
    payee: field(transactionForm, "payee").value,
    amountMinor: parseAmount(field(transactionForm, "amount").value, currentLedger().currency),
    category: field(transactionForm, "category").value,
    note: field(transactionForm, "note").value,
  },
}), "Transaction saved.");
bindMutation(deleteForm, deleteDialog, () => ({ type: "deleteTransaction", id: deletedId ?? "" }), "Transaction deleted.");
bindMutation(settingsForm, settingsDialog, () => ({ type: "setCurrency", currency: field(settingsForm, "currency").value }), "Settings saved.");
connectImport(currentLedger, renderLedger, setStatus);
const renderCategories = connectCategories(currentLedger, renderLedger, setStatus);
const renderSummary = connectSummary(currentLedger, renderLedger, setStatus);
const filters = connectFilters(() => ledger, renderRows);

undo.addEventListener("click", async () => {
  undo.disabled = true;
  try { renderLedger(await api.commit({ type: "undo" })); setStatus("Change undone."); }
  catch (error) { setStatus(messageOf(error), true); }
  finally { undo.disabled = false; }
});
exportCsv.addEventListener("click", async () => {
  exporting = true;
  exportCsv.disabled = true;
  try {
    const count = await api.exportCsv(filters.snapshot());
    if (count !== null) setStatus(`Exported ${count} ${count === 1 ? "transaction" : "transactions"}.`);
  } catch (error) { setStatus(messageOf(error), true); }
  finally { exporting = false; exportCsv.disabled = filters.rows(currentLedger()).length === 0; }
});

function renderActivePage(view: LedgerView): void {
  const active = document.querySelector<HTMLButtonElement>("[data-page][aria-current=page]")?.dataset.page;
  if (active === "categories") renderCategories(view);
  if (active === "summary") renderSummary(view);
}

navigation.forEach((button) => button.addEventListener("click", () => {
  navigation.forEach((item) => {
    if (item === button) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  panels.forEach((panel) => { panel.hidden = panel.dataset.pageView !== button.dataset.page; });
  renderActivePage(currentLedger());
}));

void api.read().then(renderLedger).catch((error: unknown) => {
  element("entry-count").textContent = "Ledger unavailable";
  setStatus(messageOf(error), true);
});
