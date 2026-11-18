import { CSV_DELIMITERS, DATE_ORDERS, type CsvDelimiter, type CsvFile, type CsvImportRequest } from "../contracts/csv";
import type { LedgerView } from "../contracts/ledger";
import { detectCsv, parseCsv, suggestColumns } from "../domain/csv";
import { previewImport, type ImportPreview } from "../domain/import-ledger";
import { formatAmount } from "../domain/money";
import { api } from "./api";
import { element, field, messageOf, setFormError } from "./dom";

const PREVIEW_ROW_LIMIT = 8;
const COLUMN_FIELDS = ["date", "payee", "amount", "debit", "credit"] as const;

/** Coordinates file selection, mapping and confirmation for one import at a time. */
export function connectImport(currentLedger: () => LedgerView, renderLedger: (ledger: LedgerView) => void, setStatus: (message: string, error?: boolean) => void): void {
  const pick = element<HTMLButtonElement>("import-csv");
  const dialog = element<HTMLDialogElement>("import-dialog");
  const form = element<HTMLFormElement>("import-form");
  const confirm = element<HTMLButtonElement>("confirm-import");
  let selectedFile: CsvFile | null = null;
  let pending: { request: CsvImportRequest; preview: ImportPreview } | null = null;

  function delimiter(): CsvDelimiter {
    const selected = field(form, "delimiter").value;
    const actual = selected === "tab" ? "\t" : selected as CsvDelimiter;
    if (!CSV_DELIMITERS.includes(actual)) throw new Error("Choose a separator.");
    return actual;
  }

  function setColumns(columns: readonly string[]): void {
    const suggested = suggestColumns(columns);
    const options = columns.map((heading, index) => ({ title: `${heading || "Untitled"} (${index + 1})`, value: String(index) }));
    for (const name of COLUMN_FIELDS) {
      const select = field<HTMLSelectElement>(form, name);
      select.replaceChildren(new Option("Choose a column", ""), ...options.map(({ title, value }) => new Option(title, value)));
      if (suggested[name] >= 0) select.value = String(suggested[name]);
    }
    field(form, "amountFormat").value = suggested.amount < 0 && suggested.debit >= 0 && suggested.credit >= 0 ? "split" : "signed";
  }

  function showPreview(result: ImportPreview | null): void {
    element("import-count").textContent = result ? `${result.rows.length} ready to import.` : "";
    const duplicates = result?.duplicates ?? 0;
    element("import-duplicates").textContent = result ? `${duplicates} ${duplicates === 1 ? "duplicate" : "duplicates"} skipped.` : "";
    const rows = document.createDocumentFragment();
    for (const { line, transaction } of result?.rows.slice(0, PREVIEW_ROW_LIMIT) ?? []) {
      const row = document.createElement("tr");
      row.insertCell().textContent = String(line);
      row.insertCell().textContent = transaction.date;
      row.insertCell().textContent = transaction.payee;
      const amount = row.insertCell();
      amount.className = "amount";
      amount.textContent = formatAmount(transaction.amountMinor, currentLedger().currency);
      rows.append(row);
    }
    element("preview-rows").replaceChildren(rows);
    element("preview-table").hidden = !result?.rows.length;
    const issues = document.createDocumentFragment();
    for (const { line, reason } of result?.errors ?? []) {
      const issue = document.createElement("li");
      issue.textContent = `Line ${line}: ${reason}`;
      issues.append(issue);
    }
    element("import-errors").replaceChildren(issues);
    element("import-rejected").hidden = !result?.errors.length;
    confirm.disabled = !result?.rows.length;
  }

  function refreshPreview(): void {
    if (!selectedFile) return;
    pending = null;
    const split = field(form, "amountFormat").value === "split";
    element("signed-mapping").hidden = split;
    element("split-mapping").hidden = !split;
    const column = (name: string) => Number.parseInt(field(form, name).value, 10);
    try {
      const request: CsvImportRequest = {
        text: selectedFile.text,
        delimiter: delimiter(),
        headerLine: field<HTMLInputElement>(form, "header").valueAsNumber,
        dateOrder: DATE_ORDERS.find((order) => order === field(form, "dateOrder").value) ?? "MDY",
        mapping: {
          date: column("date"), payee: column("payee"),
          amount: split ? { kind: "split", debit: column("debit"), credit: column("credit") } : { kind: "signed", column: column("amount") },
        },
      };
      const preview = previewImport(currentLedger(), request);
      pending = { request, preview };
      showPreview(preview);
      setFormError(form, "");
    } catch (error) {
      showPreview(null);
      setFormError(form, messageOf(error));
    }
  }

  pick.addEventListener("click", async () => {
    pick.disabled = true;
    try {
      selectedFile = await api.pickCsv();
      if (!selectedFile) return;
      const detected = detectCsv(selectedFile.text);
      field(form, "delimiter").value = detected.delimiter === "\t" ? "tab" : detected.delimiter;
      field(form, "header").value = String(detected.headerLine);
      field(form, "dateOrder").value = "MDY";
      element("import-filename").textContent = selectedFile.name;
      setColumns(detected.columns);
      refreshPreview();
      dialog.showModal();
    } catch (error) { setStatus(messageOf(error), true); }
    finally { pick.disabled = false; }
  });

  form.addEventListener("change", (event) => {
    if (!selectedFile) return;
    const name = (event.target as HTMLInputElement).name;
    if (name === "delimiter" || name === "header") {
      try {
        const row = name === "delimiter"
          ? detectCsv(selectedFile.text, delimiter())
          : { headerLine: field<HTMLInputElement>(form, "header").valueAsNumber, columns: [] };
        const columns = name === "delimiter" ? row.columns : parseCsv(selectedFile.text, delimiter()).find(({ line, error }) => line === row.headerLine && !error)?.fields;
        if (!columns?.length) throw new Error("Choose a valid header line.");
        field(form, "header").value = String(row.headerLine);
        setColumns(columns);
      } catch (error) {
        pending = null;
        showPreview(null);
        setFormError(form, messageOf(error));
        return;
      }
    }
    refreshPreview();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pending || confirm.disabled) return;
    const { request, preview } = pending;
    confirm.disabled = true;
    try {
      const before = currentLedger().transactions.length;
      const updated = await api.commit({ type: "importCsv", csv: request });
      const added = updated.transactions.length - before;
      renderLedger(updated);
      dialog.close();
      setStatus(`Imported ${added} ${added === 1 ? "transaction" : "transactions"}. ${preview.duplicates} duplicates skipped.`);
    } catch (error) {
      setFormError(form, messageOf(error));
      confirm.disabled = false;
    }
  });
  dialog.addEventListener("close", () => { selectedFile = null; pending = null; });
}
