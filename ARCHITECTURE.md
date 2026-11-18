# Architecture

<!-- keel:start -->

| Module | Owns | May call |
|---|---|---|
| `src/` | Ledger screens, form state, the browser adapter and its labelled mock | The typed ledger interface and pure domain functions |
| `contracts/` | Shared request, response, and data types | Nothing |
| `domain/` | Validation, minor-unit arithmetic, CSV and ledger operations | Shared contracts |
| `electron/` | Sandboxed preload bridge, command handlers, local file store and native dialogs | Shared contracts and domain, with Electron and file I/O isolated from the domain |

The renderer uses one typed adapter. Electron injects the preload implementation. The browser starts a fresh in-memory ledger and visibly identifies it as a mock. Both adapters use the same types. Strict type checking and an L2 suite exercise the same observable operations against the mock and the main-process service. L6 drives the adapter over real IPC.

The main process owns a versioned JSON document in Electron's application data directory. It serialises mutations, validates on load, migrates supported older versions, and publishes a change only after writing a complete replacement in the same directory. A single instance owns the production ledger. The renderer rebuilds its views from the current state and keeps draft form values in memory.

Opening a version-zero file preserves it until the next successful write. The single undo record stores the affected transaction IDs and the previous values needed to restore them. A later successful ledger edit clears or replaces that record.

Transaction amounts use safe integer minor units. Import and entry parse the decimal digits directly. Monthly totals use integer arithmetic that can sum beyond the range of a single transaction. Category IDs remain stable through renames. ISO calendar dates make newest-first sorting, ranges and month comparisons independent of time zone.

The main process handles opening and saving CSV files. L6 uses a temporary user-data directory and preset file paths through the development build, while the packaged app uses native dialogs and its application data directory.

CSV preview and confirmation share the same parser. Filtering and export share inclusive date and amount predicates. Tally's CSV carries category, note and currency so a filtered export can be restored in an empty ledger.

Keep the ledger in one file. Revisit indexing if measured ledger load or filtering becomes slow for years of transactions. Keep a single undo record until the product requests undo history. All modules have one owner, `solo`.

<!-- keel:end -->
