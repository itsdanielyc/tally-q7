# Plan

<!-- keel:start -->

| # | Slice | Done when | Levels | Owner | Status |
|---|---|---|---|---|---|
| 0 | Scaffold | The `electron-web` template is green on every Tier 1 runner, including browser visuals, Electron and installers, with hosted runs recorded in the ledger. | L0–L2, L4–L7 | solo | Done |
| 1 | Record transactions | Validation, newest-first ordering and currency checks pass. Mock and native contracts agree. File migration and interrupted saves preserve data. Browser editing and deletion pass. Real Electron saves an entry and reopens the unchanged values after restart. Hosted evidence covers Tier 1. | L0–L6 | solo | Done |
| 2 | Import a bank CSV | CSV fixture tests prove detection, all mapping modes, dirty-row diagnosis, duplicate counts and 2,000 rows within five seconds. A failed write commits no rows. Browser preview and real Electron import through a preset file path pass on Tier 1. | L0–L6 | solo | Done |
| 3 | Categories and rules | Category lifecycle and rule precedence pass domain and contract checks. Import, manual category assignment and applying rules to uncategorised entries pass browser journeys. Tier 1 stays green. | L0–L6 | solo | Done |
| 4 | Monthly summary and budgets | Month boundaries, sign handling, uncategorised totals, and precise budgets pass domain checks. Changing month and persisting a category budget pass browser journeys. Tier 1 stays green. | L0–L6 | solo | Done |
| 5 | Find, export, undo | Combined filters, lossless CSV round trip, and one-step undo of deletes, merges and imports pass domain and store checks. Browser filtering and real-shell file export, reimport and undo pass on Tier 1. | L0–L6 | solo | Open |
| 6 | Release readiness | Version 0.1.0, dated changelog, matching release assets and SHA-256 checksums, green candidate CI and installer tests on every Tier 1 runner, and signing status are recorded before tagging. | L0–L7 | solo | Open |

## Rulings

- Slice 0. Ruling: use the generated scaffold as the first merge and keep solo contract changes inside their corresponding fixed slice — a single owner can land the seam and its callers together while proving conformance — cost if wrong is splitting a slice into smaller PRs without changing the slice list.
- Slice 0. Ruling: use `com.itsdanielyc.tally` and stage the local generator inside the checkout — the origin supplies the namespace and staging keeps the generator's rename pass away from the installed skills and Git metadata — cost if wrong is a bundle identifier migration.
- Slice 0. Ruling: open the baseline PR with the authenticated CLI — workflow tokens in this repository cannot open pull requests — cost if wrong is one manual CLI operation per baseline update.
- Slice 0. Ruling: pin the macOS workflow jobs to `macos-15` — `macos-latest` remained queued while the pinned runner completed its capture — cost if wrong is updating the runner label when macOS 15 is retired.
- Slice 0. Ruling: begin local slice work while macOS hosted checks wait in the queue — the scaffold is isolated on its own branch and stays open until its hosted evidence arrives — cost if wrong is rebasing the feature if the scaffold needs a fix.
- Slice 1. Ruling: use USD initially and permit currency changes on an empty ledger — a currency change must preserve the meaning of stored amounts — cost if wrong is adding an explicit migration policy later.
- Slice 1. Ruling: run browser, domain, store and Electron checks in the same hosted job as each snapshot capture — the macOS queue delayed separate jobs for the scaffold — cost if wrong is a longer snapshot workflow. Use the successful `macos-26` Apple silicon image for capture and comparison.
- Slice 1. Ruling: use the recurring macOS transaction checks in the green CSV run and merge the first three slices together — the exact transaction-only macOS job is queued and the saved-entry journey ran unchanged in the combined application — cost if wrong is a visual regression in the intermediate layout, which never reaches main.
- Slice 2. Ruling: match duplicate payees by exact stored text after trimming input and check duplicates within the incoming file — format cleanup is predictable while distinct payees remain distinct — cost if wrong is needing a user-visible duplicate policy later.
- Slice 2. Ruling: interpret two-digit years with a 1970–2069 window and report the resulting date in preview — bank exports sometimes omit the century — cost if wrong is selecting or exporting a four-digit-year column.
- Slice 3. Ruling: the first matching payee rule in creation order wins, with case-insensitive substring matching — a predictable order makes overlapping rules understandable — cost if wrong is providing rule ordering later.
- Slice 4. Ruling: use the signed amount to classify income and spending and compare budgets with category spending — the budget is a spending ceiling — cost if wrong is introducing explicit transfer or credit handling in a later version.
- Slice 4. Ruling: on category merge, keep the destination's existing budget for each month and move the source's budget for other months — a destination budget already states the user's intent for that month — cost if wrong is editing overlapping budgets after the merge.
- Slice 4. Ruling: combine the Windows/Linux captures with the separate macOS proof, copying each runner's own PNG — the old merge step could overwrite earlier captures with old PNGs from a different runner's checkout — cost if wrong is an immediately visible pixel failure in normal CI.
- Slice 5. Ruling: retain the latest undoable operation until any subsequent successful ledger edit and preserve it across restarts — undo remains immediate while reads and failed saves leave it available — cost if wrong is extending undo history and storage.
- Slice 6. Ruling: use the unsigned artifacts permitted by ADR 001 and run release checks without publishing — the owner fixed the signing policy and requested a stop before the tag — cost if wrong is a later signing or publishing run.

<!-- keel:end -->
