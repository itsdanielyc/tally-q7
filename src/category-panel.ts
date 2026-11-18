import type { Category, CategoryCommand, LedgerView } from "../contracts/ledger";
import { api } from "./api";
import { element, field, messageOf, setFormError } from "./dom";

type CategoryMode = "add" | "rename" | "merge" | "delete";
const CATEGORY_LABELS: Record<CategoryMode, { title: string; submit: string }> = {
  add: { title: "Add category", submit: "Save category" },
  rename: { title: "Rename category", submit: "Save category" },
  merge: { title: "Merge category", submit: "Merge category" },
  delete: { title: "Delete category?", submit: "Delete category" },
};

function action(label: string, name: string, run: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-label", `${label} ${name}`);
  button.addEventListener("click", run);
  return button;
}

/** Renders category and rule management using the shared ledger operations. */
export function connectCategories(currentLedger: () => LedgerView, renderLedger: (ledger: LedgerView) => void, setStatus: (message: string, error?: boolean) => void) {
  const dialog = element<HTMLDialogElement>("category-dialog");
  const form = element<HTMLFormElement>("category-form");
  const ruleDialog = element<HTMLDialogElement>("rule-dialog");
  const ruleForm = element<HTMLFormElement>("rule-form");
  const apply = element<HTMLButtonElement>("apply-rules");
  const addRule = element<HTMLButtonElement>("add-rule");
  let selectedCategory: Category | undefined;
  let mode: CategoryMode = "add";

  async function commit(command: CategoryCommand): Promise<LedgerView> {
    const updated = await api.commit(command);
    renderLedger(updated);
    return updated;
  }

  function openCategory(nextMode: CategoryMode, category?: Category): void {
    selectedCategory = category;
    mode = nextMode;
    const labels = CATEGORY_LABELS[mode];
    element("category-dialog-title").textContent = labels.title;
    const submit = element<HTMLButtonElement>("save-category");
    submit.textContent = labels.submit;
    submit.className = mode === "delete" ? "danger" : "primary";
    const needsName = mode === "add" || mode === "rename";
    const name = field<HTMLInputElement>(form, "name");
    name.value = category?.name ?? "";
    name.required = needsName;
    element("category-name-field").hidden = !needsName;
    const target = field<HTMLSelectElement>(form, "target");
    target.required = mode === "merge";
    target.replaceChildren(...currentLedger().categories.filter((item) => item.id !== category?.id).map(({ id, name }) => new Option(name, id)));
    element("merge-target-field").hidden = mode !== "merge";
    const description = element("category-description");
    description.hidden = needsName;
    description.textContent = mode === "delete" ? `Transactions in ${category?.name} will become uncategorised. Rules for it will be removed.` : `Move transactions and rules from ${category?.name} into another category.`;
    setFormError(form, "");
    dialog.showModal();
  }

  function categoryCommand(): CategoryCommand {
    const id = selectedCategory?.id ?? "";
    if (mode === "merge") return { type: "mergeCategories", id, targetId: field(form, "target").value };
    if (mode === "delete") return { type: "deleteCategory", id };
    return { type: "saveCategory", id: selectedCategory?.id, name: field(form, "name").value };
  }

  function bindForm(activeForm: HTMLFormElement, activeDialog: HTMLDialogElement, request: () => CategoryCommand, success: () => string): void {
    const submit = activeForm.querySelector<HTMLButtonElement>("button[type=submit]")!;
    activeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      setFormError(activeForm, "");
      try { await commit(request()); activeDialog.close(); setStatus(success()); }
      catch (error) { setFormError(activeForm, messageOf(error)); }
      finally { submit.disabled = false; }
    });
  }

  element("add-category").addEventListener("click", () => openCategory("add"));
  addRule.addEventListener("click", () => {
    ruleForm.reset();
    field<HTMLSelectElement>(ruleForm, "category").replaceChildren(...currentLedger().categories.map(({ id, name }) => new Option(name, id)));
    setFormError(ruleForm, "");
    ruleDialog.showModal();
  });
  apply.addEventListener("click", async () => {
    apply.disabled = true;
    try {
      const before = uncategorised(currentLedger());
      const updated = await commit({ type: "applyRules" });
      const changed = before - uncategorised(updated);
      setStatus(`Categorised ${changed} ${changed === 1 ? "transaction" : "transactions"}.`);
    } catch (error) { setStatus(messageOf(error), true); }
    finally { apply.disabled = !currentLedger().rules.length || !uncategorised(currentLedger()); }
  });
  bindForm(form, dialog, categoryCommand, () => mode === "delete" ? "Category deleted." : mode === "merge" ? "Categories merged." : "Category saved.");
  bindForm(ruleForm, ruleDialog, () => ({ type: "addRule", contains: field(ruleForm, "contains").value, categoryId: field(ruleForm, "category").value }), () => "Rule saved.");

  return (ledger: LedgerView): void => {
    const names = new Map(ledger.categories.map(({ id, name }) => [id, name]));
    const counts = new Map<string, number>();
    for (const { categoryId } of ledger.transactions) {
      if (categoryId !== null) counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
    }
    const categoryRows = document.createDocumentFragment();
    for (const category of ledger.categories) {
      const row = document.createElement("tr");
      row.insertCell().textContent = category.name;
      row.insertCell().textContent = String(counts.get(category.id) ?? 0);
      const buttons = row.insertCell();
      buttons.className = "row-actions";
      const merge = action("Merge", category.name, () => openCategory("merge", category));
      merge.disabled = ledger.categories.length < 2;
      buttons.append(action("Rename", category.name, () => openCategory("rename", category)), merge, action("Delete", category.name, () => openCategory("delete", category)));
      categoryRows.append(row);
    }
    element("category-rows").replaceChildren(categoryRows);
    element("categories-empty").hidden = ledger.categories.length > 0;
    const ruleRows = document.createDocumentFragment();
    for (const rule of ledger.rules) {
      const row = document.createElement("tr");
      row.insertCell().textContent = rule.contains;
      row.insertCell().textContent = names.get(rule.categoryId) ?? "—";
      const buttons = row.insertCell();
      buttons.className = "row-actions";
      buttons.append(action("Remove", rule.contains, () => {
        void commit({ type: "deleteRule", id: rule.id }).then(() => setStatus("Rule removed."), (error: unknown) => setStatus(messageOf(error), true));
      }));
      ruleRows.append(row);
    }
    element("rule-rows").replaceChildren(ruleRows);
    element("rules-empty").hidden = ledger.rules.length > 0;
    addRule.disabled = ledger.categories.length === 0;
    apply.disabled = ledger.rules.length === 0 || uncategorised(ledger) === 0;
  };
}

function uncategorised(ledger: LedgerView): number {
  return ledger.transactions.reduce((count, transaction) => count + Number(transaction.categoryId === null), 0);
}
