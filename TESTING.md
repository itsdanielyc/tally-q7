# Testing strategy

<!-- keel:start -->

| Level | Harness | When and where |
|---|---|---|
| L0 | `npm run typecheck` | Each push, hosted CI |
| L1 | `npm run test:unit` | Each push, hosted CI |
| L2 | `npm run test:contracts` | Each push after the ledger seam is added, hosted CI |
| L3 | `npm run test:integration` | Each push after the file store is added, all Tier 1 systems |
| L4/L5 | `npm run test:ui` | Each PR, Chromium with the labelled mock, all Tier 1 systems |
| L6 | `npm run build` then `npm run test:e2e` | PR to main, Electron using real IPC and ledger files, all Tier 1 systems |
| L7 | Installers and release workflows | Main and release checks, all Tier 1 systems |

## Critical journeys

| Journey | Evidence |
|---|---|
| Add, edit, and delete an entry, then reopen the ledger | Validation at L1, adapter parity at L2, migration and interrupted writes at L3, entry flow at L4, persisted edit after restart at L6 |
| Preview a bank CSV, diagnose bad rows, commit once and skip duplicates | Parser and mapping at L1, all-or-none file write at L3, mapping and preview at L4, native file seam and reimport at L6 |
| Categorise by hand and by payee rule | Rule order and merge at L1, management and application at L4 |
| Compare a month with its budgets | Calendar and integer totals at L1, navigation and budgets at L4 |
| Export a filtered view and undo the last destructive action | Round trip and undo at L1/L3, filters at L4, real file export and undo at L6 |
| Install, launch and remove Tally | L7 on Windows NSIS, macOS DMG, and Linux DEB and AppImage |

The shared ARIA and geometry fixtures cover the primary ledger view. Geometry tolerance is 8 px. Hosted runners capture platform-specific screenshots at a 0.002 maximum differing pixel ratio. Capture intended changes through the snapshots workflow and inspect the Electron contact sheet on each visual change.

Budget under three minutes for L0–L2, five minutes per browser runner, fifteen minutes per Electron runner, twenty-five minutes per installer runner, and twenty minutes for a PR. The repository-local `keel-test` skill governs failure proofs and flaky checks. Record the date, level, platform and run in `VERIFICATION.md`.

The L6 dialog fixture proves file I/O behind a preset path. Human interaction with the OS picker, hardware power-loss behaviour, screen readers, unsigned download warnings, and platforms outside Tier 1 have separate verification status.

<!-- keel:end -->
