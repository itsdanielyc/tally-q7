# Verification ledger

Append-only. Each row says what was proven, where, and by which run. "Built"
is never rounded up to "tested"; anything not listed here is unverified.

| Date | Level | Claim | Platforms | Evidence |
|---|---|---|---|---|
| 2026-11-18 | Scaffold L0–L2, L4–L6 | Template types, mock contract, Chromium behaviour, shared structure and geometry, per-OS pixels and sandboxed Electron IPC passed | Windows x64, Linux x64, macOS arm64 | [PR CI 44348663963](https://github.com/itsdanielyc/tally-q7/actions/runs/44348663963), green Windows and Linux jobs. [Consolidated macOS CI 44349555290](https://github.com/itsdanielyc/tally-q7/actions/runs/44349555290) includes a runner architecture assertion and the green browser and Electron suites. [Windows and Linux pixels](https://github.com/itsdanielyc/tally-q7/actions/runs/44346354987), [macOS pixels](https://github.com/itsdanielyc/tally-q7/actions/runs/44347901002) from successful capture jobs. |
| 2026-11-18 | L7 installers | Scaffold packages install, launch and remove through NSIS, DMG, DEB and AppImage checks | Windows x64, macOS arm64, Linux x64 | [Installers run 44346357063](https://github.com/itsdanielyc/tally-q7/actions/runs/44346357063), three green jobs. [Consolidated macOS CI](https://github.com/itsdanielyc/tally-q7/actions/runs/44349555290) also exercised the same DMG packaging and smoke test. |

## Unverified

- Product slices and the release candidate remain to be verified.
