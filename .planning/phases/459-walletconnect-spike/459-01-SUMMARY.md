---
phase: 459-walletconnect-spike
plan: 01
subsystem: infra
tags: [tauri, walletconnect, reown-appkit, webview, spike, desktop]

# Dependency graph
requires: []
provides:
  - "Tauri 2 spike project with @reown/appkit QR pairing setup"
  - "CSP configuration for WalletConnect relay domains"
  - "Go/No-Go decision document (PENDING manual verification)"
affects: [462-setup-wizard-walletconnect]

# Tech tracking
tech-stack:
  added: ["@tauri-apps/cli 2.10.1", "@tauri-apps/api 2.10.1", "@reown/appkit 1.7.x", "@reown/appkit-adapter-solana", "@reown/appkit-adapter-wagmi", "vite 6.x"]
  patterns: ["Tauri 2 minimal scaffold for spike testing", "CSP-first WebView security"]

key-files:
  created:
    - packages/desktop-spike/package.json
    - packages/desktop-spike/index.html
    - packages/desktop-spike/src/main.ts
    - packages/desktop-spike/vite.config.ts
    - packages/desktop-spike/src-tauri/tauri.conf.json
    - packages/desktop-spike/src-tauri/Cargo.toml
    - packages/desktop-spike/src-tauri/src/lib.rs
    - packages/desktop-spike/src-tauri/src/main.rs
    - packages/desktop-spike/src-tauri/capabilities/default.json
    - .planning/phases/459-walletconnect-spike/SPIKE-RESULT.md
  modified: []

key-decisions:
  - "Vanilla TS (no framework) since @reown/appkit uses lit Web Components"
  - "CSP includes web3modal.org/com domains for Reown Cloud APIs"
  - "SPIKE-RESULT.md left as PENDING — requires manual pnpm tauri dev verification"

patterns-established:
  - "Spike projects go in packages/desktop-spike/ as private packages"
  - "CSP for WalletConnect: relay + rpc + pulse + web3modal + infura + alchemy domains"

requirements-completed: [WCON-01]

# Metrics
duration: 4min
completed: 2026-03-31
---

# Phase 459 Plan 01: WalletConnect Spike Summary

**Tauri 2 spike project with @reown/appkit QR pairing, Solana/EVM dual adapters, and WalletConnect CSP ready for manual Go/No-Go verification**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-31T15:15:41Z
- **Completed:** 2026-03-31T15:19:41Z
- **Tasks:** 3 (Task 1: auto, Task 2: auto-approved checkpoint, Task 3: auto)
- **Files created:** 11

## Accomplishments
- Minimal Tauri 2 project scaffolded at `packages/desktop-spike/` with Rust backend and Vite frontend
- @reown/appkit integrated with both SolanaAdapter (Phantom/Solflare) and WagmiAdapter (EVM chains)
- CSP in `tauri.conf.json` pre-configured for all WalletConnect relay and Reown Cloud domains
- Sign message button for SIWS/SIWE testing with connected wallets
- SPIKE-RESULT.md created with verification checklist and Phase 462 impact analysis

## Task Commits

Each task was committed atomically:

1. **Task 1: Tauri spike project + @reown/appkit integration** - `a924e7a8` (feat)
2. **Task 2: Human verification checkpoint** - auto-approved (no commit)
3. **Task 3: Go/No-Go decision document** - `2b9b05ad` (docs)

## Files Created/Modified
- `packages/desktop-spike/package.json` - Spike package with Tauri + AppKit deps
- `packages/desktop-spike/index.html` - Minimal HTML with w3m-button and sign controls
- `packages/desktop-spike/src/main.ts` - AppKit init, event subscriptions, sign message handler
- `packages/desktop-spike/vite.config.ts` - Vite config for Tauri dev (port 1420)
- `packages/desktop-spike/tsconfig.json` - TypeScript config
- `packages/desktop-spike/src-tauri/tauri.conf.json` - Tauri config with WalletConnect CSP
- `packages/desktop-spike/src-tauri/Cargo.toml` - Rust dependencies (tauri 2.x)
- `packages/desktop-spike/src-tauri/src/lib.rs` - Minimal Tauri run
- `packages/desktop-spike/src-tauri/src/main.rs` - Binary entry point
- `packages/desktop-spike/src-tauri/build.rs` - Tauri build script
- `packages/desktop-spike/src-tauri/capabilities/default.json` - Core permissions
- `.planning/phases/459-walletconnect-spike/SPIKE-RESULT.md` - Go/No-Go decision document

## Decisions Made
- Used vanilla TypeScript instead of Preact/React since @reown/appkit provides its own lit-based Web Components
- Added `https://api.web3modal.org` and `https://api.web3modal.com` to CSP (Reown Cloud API endpoints discovered during research)
- SPIKE-RESULT.md has PENDING status because actual Tauri WebView rendering requires manual `pnpm tauri dev` with a valid Reown Cloud projectId

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - spike project is complete and ready for manual testing.

## Issues Encountered
- Peer dependency warnings for `@wagmi/core` version mismatch (wagmi adapter expects 3.4.1, got 2.22.1) - non-blocking for spike
- `react-dom` peer conflict from appkit-adapter-wagmi - harmless since we use vanilla TS

## User Setup Required

Manual verification required before Phase 462:
1. Get projectId from https://cloud.reown.com/
2. Create `packages/desktop-spike/.env` with `VITE_WC_PROJECT_ID=xxx`
3. Run `cd packages/desktop-spike && pnpm tauri dev`
4. Follow verification steps in SPIKE-RESULT.md
5. Update SPIKE-RESULT.md Decision field based on results

## Next Phase Readiness
- Spike infrastructure ready for manual Go/No-Go testing
- Phase 460 (Tauri Shell + Sidecar Manager) can proceed in parallel (no dependency)
- Phase 462 (WalletConnect integration) must wait for SPIKE-RESULT.md decision

## Self-Check: PASSED

- All 10 key files verified present on disk
- Commits a924e7a8 and 2b9b05ad verified in git log

---
*Phase: 459-walletconnect-spike*
*Completed: 2026-03-31*
