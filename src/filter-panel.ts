import type { Category, LedgerView, Transaction, TransactionFilters } from "../contracts/ledger";
import { filterTransactions } from "../domain/find";
import { parseAmount } from "../domain/money";
import { element, field, messageOf, setFormError } from "./dom";

const ALL_CATEGORIES = "";
const UNCATEGORISED = "uncategorised";
const CATEGORY_PREFIX = "category:";

/** Keeps the table and export on the latest valid filter values. */
export function connectFilters(currentLedger: () => LedgerView | undefined, refreshRows: (ledger: LedgerView) => void) {
  const form = element<HTMLFormElement>("transaction-filters");
  const categories = field<HTMLSelectElement>(form, "category");
  let categoryOptions: readonly Category[] | undefined;
  let currency: string | undefined;
  let selected: TransactionFilters = {};

  function amountOrNone(name: string, currency: string): number | undefined {
    const value = field(form, name).value.trim();
    return value ? parseAmount(value, currency) : undefined;
  }

  function refresh(): void {
    const view = currentLedger();
    if (!view) return;
    const selectedCategory = categories.value;
    const previous = selected;
    try {
      selected = {
        query: field(form, "query").value,
        categoryId: selectedCategory === ALL_CATEGORIES ? undefined : selectedCategory === UNCATEGORISED ? null : selectedCategory.slice(CATEGORY_PREFIX.length),
        from: field(form, "from").value || undefined,
        to: field(form, "to").value || undefined,
        minMinor: amountOrNone("minimum", view.currency),
        maxMinor: amountOrNone("maximum", view.currency),
      };
      refreshRows(view);
      setFormError(form, "");
    } catch (error) { selected = previous; setFormError(form, messageOf(error)); }
  }

  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", refresh);
  form.addEventListener("reset", () => queueMicrotask(refresh));

  return {
    update(view: LedgerView): void {
      if (categoryOptions !== view.categories) {
        const previous = categories.value;
        categories.replaceChildren(new Option("All categories", ALL_CATEGORIES), new Option("Uncategorised", UNCATEGORISED),
          ...view.categories.map(({ id, name }) => new Option(name, `${CATEGORY_PREFIX}${id}`)));
        if (Array.from(categories.options).some((option) => option.value === previous)) categories.value = previous;
        else selected = { ...selected, categoryId: undefined };
        categoryOptions = view.categories;
      }
      if (currency !== view.currency) {
        field(form, "minimum").value = "";
        field(form, "maximum").value = "";
        selected = { ...selected, minMinor: undefined, maxMinor: undefined };
        currency = view.currency;
      }
    },
    rows(view: LedgerView): readonly Transaction[] { return filterTransactions(view, selected); },
    snapshot(): TransactionFilters { return selected; },
  };
}
