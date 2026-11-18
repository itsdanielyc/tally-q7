# Tally

Tally is an offline expense ledger for Windows x64, macOS Apple silicon and Linux x64. Record transactions, import bank CSVs, manage categories and budgets, and export filtered entries. The desktop app stores its data in `ledger.json` in its Electron application data directory.

## Commands

```bash
npm ci
npm run dev            # Electron desktop window
npm run test:unit
npm run test:contracts
npm run test:integration
npx playwright install chromium
npm run test:ui        # Playwright, chromium, against the labelled mock
npm run build          # main, preload and renderer into out/ for the real-shell suite
npm run test:e2e       # Playwright's Electron launcher against the built app
```

The browser build uses an in-memory mock for tests. The [verification ledger](VERIFICATION.md) links the hosted runs that prove each slice. See the [changelog](CHANGELOG.md) for the supported bundles and signing status.
