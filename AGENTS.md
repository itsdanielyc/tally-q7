# Tally

<!-- keel:start -->

Tally is a local, single-person expense ledger for Windows x64, macOS Apple silicon and Linux x64. The brief is in `PRODUCT.md`. The accepted decisions are in `docs/adr/`. `SLICES.md` fixes the scope and order. One agent owns the whole repository.

## Commands

- Types and production build use `npm run typecheck` and `npm run build`.
- Domain, contract and storage tests use `npm run test:unit`, `npm run test:contracts` and `npm run test:integration`.
- Browser checks use `npm run test:ui`. The browser runs the labelled mock.
- Real-shell checks use `npm run test:e2e` after `npm run build`.
- Triage CI with `npm run triage -- <run-id>`.

## Layout

- `src/` is the renderer. It uses the typed adapter in `src/api.ts` for backend operations.
- `contracts/` is shared TypeScript. `domain/` is platform-independent ledger logic.
- `electron/` owns native IPC, persistence and dialogs. `tests/` separates test levels.

## Keel rules

1. Every claim names the level, platforms and run that proved it. Append evidence to `VERIFICATION.md`.
2. Show each new check fail with the guarded behaviour broken, then restore it and record the result.
3. Commit shared contracts and mock conformance coverage with any seam change. For a role split, land contract changes through a dedicated PR.
4. Capture pixel baselines with the hosted snapshots workflow and commit via a PR.
5. Quarantine a flaky check, record its pattern, and retain it. Follow the repository-local `keel-test` policy for retries and fixes.
6. Use the Keel skills installed in this repository.

See `ARCHITECTURE.md` for boundaries, `TESTING.md` for strategy, `PLAN.md` for completion criteria, and `VERIFICATION.md` for evidence.

<!-- keel:end -->
