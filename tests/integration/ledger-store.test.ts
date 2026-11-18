import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createLedgerService } from "../../domain/ledger";
import { openLedgerStore } from "../../electron/ledger-store";
import { transactionDraft } from "../fixtures/ledger";
import type { CsvImportRequest } from "../../contracts/csv";

let directory: string;
const output = resolve("artifacts", "integration");

beforeEach(async () => {
  await mkdir(output, { recursive: true });
  directory = await mkdtemp(join(output, "tally-ledger-"));
});

afterEach(async () => {
  if (dirname(directory) !== output) throw new Error("Test ledger is outside the test output directory.");
  await rm(directory, { recursive: true, force: true });
});

it("preserves the previous file and view if replacement is interrupted", async () => {
  const original = await createLedgerService(openLedgerStore(directory)).commit({ type: "saveTransaction", transaction: transactionDraft() });
  const file = join(directory, "ledger.json");
  const before = await readFile(file, "utf8");
  const interrupted = createLedgerService(openLedgerStore(directory, async () => { throw new Error("simulated replace interruption"); }));

  await expect(interrupted.commit({ type: "saveTransaction", transaction: transactionDraft({ payee: "Interrupted" }) })).rejects.toThrow(/interruption/);
  expect(await interrupted.read()).toEqual(original);
  expect(await readFile(file, "utf8")).toBe(before);
  expect(await readdir(directory)).toEqual(["ledger.json"]);
  expect(await createLedgerService(openLedgerStore(directory)).read()).toEqual(original);
});

it("opens a version-zero ledger and upgrades it on a successful edit", async () => {
  const file = join(directory, "ledger.json");
  const legacy = JSON.stringify({ schemaVersion: 0, currency: "GBP", transactions: [
    { id: "saved-entry", date: "2024-02-29", payee: "Train", amount: -1240, category: "Travel" },
  ] });
  await writeFile(file, legacy);
  const ledger = createLedgerService(openLedgerStore(directory));
  const view = await ledger.read();
  expect(view.transactions[0]).toMatchObject({ id: "saved-entry", date: "2024-02-29", amountMinor: -1240, note: "" });
  expect(view.categories).toEqual([{ id: view.transactions[0].categoryId, name: "Travel" }]);
  expect(await readFile(file, "utf8")).toBe(legacy);
  await ledger.commit({ type: "saveTransaction", transaction: transactionDraft() });
  expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ schemaVersion: 1, currency: "GBP" });
});

it("protects unreadable and future-version files from replacement", async () => {
  const file = join(directory, "ledger.json");
  for (const contents of ["{ incomplete", '{"schemaVersion":999}']) {
    await writeFile(file, contents);
    const ledger = createLedgerService(openLedgerStore(directory));
    await expect(ledger.commit({ type: "saveTransaction", transaction: transactionDraft() })).rejects.toThrow(/ledger/i);
    expect(await readFile(file, "utf8")).toBe(contents);
  }
});

it("writes a 2,000-row import within five seconds as one transaction and nothing on repeat", async () => {
  const count = 2_000;
  const csv: CsvImportRequest = {
    text: "Date,Payee,Amount\n" + Array.from({ length: count }, (_, index) => `2026-11-18,Merchant ${index},-1.25`).join("\n"),
    delimiter: ",", headerLine: 1, dateOrder: "YMD", mapping: { date: 0, payee: 1, amount: { kind: "signed", column: 2 } },
  };
  let replacements = 0;
  const { rename } = await import("node:fs/promises");
  const store = openLedgerStore(directory, async (staged, target) => { replacements++; await rename(staged, target); });
  const ledger = createLedgerService(store);
  const start = performance.now();
  const result = await ledger.commit({ type: "importCsv", csv });
  expect(performance.now() - start).toBeLessThan(5_000);
  expect(result.transactions).toHaveLength(count);
  expect((await ledger.commit({ type: "importCsv", csv })).transactions).toHaveLength(count);
  expect(replacements).toBe(1);
  const before = await readFile(join(directory, "ledger.json"), "utf8");
  const failure = createLedgerService(openLedgerStore(directory, async () => { throw new Error("disk unavailable"); }));
  await expect(failure.commit({ type: "importCsv", csv: { ...csv, text: csv.text.replaceAll("Merchant", "Other") } })).rejects.toThrow("disk unavailable");
  expect((await failure.read()).transactions).toHaveLength(count);
  expect(await readFile(join(directory, "ledger.json"), "utf8")).toBe(before);
});

it("restores the month-specific budget from disk in a new service", async () => {
  const store = openLedgerStore(directory);
  const ledger = createLedgerService(store);
  const { categories: [food] } = await ledger.commit({ type: "saveCategory", name: "Food" });
  await ledger.commit({ type: "setBudget", categoryId: food.id, month: "2026-11", amountMinor: 12_345 });
  expect((await createLedgerService(openLedgerStore(directory)).read()).budgets).toEqual([{ categoryId: food.id, month: "2026-11", amountMinor: 12_345 }]);
});

it("restores a merged or deleted category, including dependent rules and budgets, through restart", async () => {
  const ledger = createLedgerService(openLedgerStore(directory));
  const source = (await ledger.commit({ type: "saveTransaction", transaction: transactionDraft() })).categories[0];
  const target = (await ledger.commit({ type: "saveCategory", name: "Essentials" })).categories[1];
  await ledger.commit({ type: "addRule", contains: "Market", categoryId: source.id });
  const before = await ledger.commit({ type: "setBudget", categoryId: source.id, month: "2026-11", amountMinor: 4500 });
  await ledger.commit({ type: "mergeCategories", id: source.id, targetId: target.id });
  const reopened = createLedgerService(openLedgerStore(directory));
  expect((await reopened.read()).undoAction).toBe("mergeCategories");
  expect(await reopened.commit({ type: "undo" })).toEqual(before);
  await reopened.commit({ type: "deleteCategory", id: source.id });
  expect(await createLedgerService(openLedgerStore(directory)).commit({ type: "undo" })).toEqual(before);
});
