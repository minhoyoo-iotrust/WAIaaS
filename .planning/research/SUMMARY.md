# Project Research Summary

**Project:** WAIaaS Desktop App Architecture Redesign (m33-00)
**Domain:** Tauri 2 Desktop Shell + Preact Admin Web UI Reuse
**Researched:** 2026-03-31
**Confidence:** HIGH

## Executive Summary

The core insight of this research is that WAIaaS already has everything needed for a desktop app — a Preact 10.x Admin Web UI (19 pages) served via Hono, a Node.js daemon with REST API, and a hash-based router that works in any WebView. The architecture redesign eliminates the original plan of building a separate React 18 SPA and instead loads the existing Admin UI directly inside a Tauri 2 WebView via `http://127.0.0.1:{dynamic_port}/admin/`. Changes to the Admin Web UI package are additive only: a `packages/admin/src/desktop/` directory with `isDesktop()` detection, typed IPC bridge wrappers, and lazy-loaded desktop-only components (Setup Wizard, Sidecar Status). All 19 existing pages remain entirely unchanged.

The recommended stack is Tauri 2.10.x (Rust shell, OS WebView, capabilities security model), Node.js 22 SEA for the daemon sidecar binary (5 platform targets), `@tauri-apps/plugin-shell` for sidecar lifecycle, `@tauri-apps/plugin-updater` for GitHub Releases auto-update, and `@reown/appkit` in vanilla JavaScript mode (not React adapter) for WalletConnect QR pairing. The critical architectural pattern is `WebviewUrl::External` loading the daemon's HTTP server — not `tauri-plugin-localhost`, not Tauri custom protocol — which means the existing `apiCall()` relative-path fetch client, CSP `connect-src 'self'`, and hash routing all continue working without modification.

The top risks are: (1) CSP blocking Tauri IPC because `connect-src 'self'` does not cover `ipc:` and `http://ipc.localhost` protocols — must be designed before any IPC command is written; (2) Node.js SEA binary size (150-250MB) and startup delay (3-8 seconds) requiring a native splash screen and lazy daemon service initialization; (3) auto-update signing key mismanagement where losing the Ed25519 private key permanently breaks update delivery to existing installations. These risks are well-understood and have documented mitigations — the project can proceed with high confidence if the design phase addresses them explicitly.

## Key Findings

### Recommended Stack

Tauri 2.10.x is the unambiguous choice over Electron: OS WebView (not bundled Chromium) keeps the installer ~20MB vs 200MB+, the Rust backend is the right process manager for the Node.js sidecar, and the capabilities system enforces least-privilege IPC — consistent with WAIaaS security principles. All Tauri plugins needed (`plugin-shell`, `plugin-updater`, `plugin-notification`, `plugin-process`, `plugin-dialog`) are stable Tauri 2 releases. Node.js 22 SEA replaces the deprecated `pkg` (Vercel) as the official mechanism for single-binary daemon distribution, with native addons (sodium-native, better-sqlite3, argon2) bundled as SEA assets.

**Core technologies:**
- Tauri 2.10.x (Rust crate + `@tauri-apps/cli`): Desktop shell with OS WebView, sidecar management, system tray — Electron alternative with ~10x smaller binary and capabilities-based security
- `@tauri-apps/api` 2.10.x: WebView-side IPC bridge (`invoke()`) — version must stay in sync with Tauri Rust crate (major.minor)
- `@tauri-apps/plugin-shell` 2.x: Sidecar spawn/kill with stdout/stderr streaming — core of daemon lifecycle management
- `@tauri-apps/plugin-updater` 2.10.x: GitHub Releases auto-update with Ed25519 signature verification — integrates naturally with existing release-please pipeline
- Node.js 22 SEA: Single Executable Application for daemon binary — official replacement for deprecated pkg, supports native addon bundling via SEA assets
- `@reown/appkit` 1.8.x (vanilla JS mode): WalletConnect v2 QR pairing — React adapter explicitly avoided due to Preact JSX runtime conflicts

### Expected Features

The Admin Web UI reuse pattern means most features are already implemented and need only conditional exposure in desktop context.

**Must have (table stakes):**
- WebView loading `http://127.0.0.1:{dynamic_port}/admin/` — the entire Admin UI works in WebView with zero changes to existing pages
- Dynamic port allocation via ephemeral bind (port 0) — prevents conflict with standalone daemon instances; port must be resolved before WebView navigates
- `isDesktop()` environment detection via `window.__TAURI__` — single utility function gates all desktop-only code paths
- IPC bridge for 6 daemon lifecycle commands (start, stop, restart, status, quit app, send OS notification) — typed wrappers with `isDesktop()` guard; no raw invoke in components
- Tauri capability configuration with `remote.urls: ["http://127.0.0.1:*/*"]` — required for IPC to work from HTTP-loaded WebView
- CORS additions in daemon Hono server: `tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost` — safety measure for platform-specific WebView origins

**Should have (competitive differentiators):**
- Setup Wizard (first-run UX): lazy-loaded, desktop-only page at hash route `/wizard` — browser Admin UI has no onboarding; wizard calls IPC to init daemon config
- WalletConnect QR in Desktop: `@reown/appkit` vanilla JS mode, dynamic import only when `isDesktop() && route === '/walletconnect'` — ~200KB+, must never enter browser bundle
- Sidecar Status Panel: daemon process health, uptime, log viewer — uses IPC not HTTP (available when daemon is down), pairs with 3-color system tray icon
- System Tray: 3-color icon (green/yellow/red) + context menu (Open/Pause/Resume/Quit) — pure Rust, no WebView interaction
- Auto-Update: GitHub Releases + `tauri-plugin-updater`, integrated with release-please CI — requires Ed25519 key setup and backup before first release
- Native splash screen during sidecar startup: critical UX mitigation for 3-8 second SEA init time

**Defer indefinitely:**
- OS Native Notifications Bridge via Tauri `plugin-notification` — Push Relay (v32.9) already handles notification delivery via HTTP POST; desktop OS notifications are supplementary
- Multi-window WebView — all 19 pages + desktop extensions fit in single WebView with hash router
- Master password caching in platform keychain — store session token (time-limited JWT) only; re-auth for sensitive operations

### Architecture Approach

The architecture centers on two clean communication boundaries: (1) HTTP fetch for all wallet/transaction/policy API calls, unchanged from browser mode, since the WebView loads from the daemon's own HTTP origin; (2) Tauri IPC `invoke()` exclusively for operations impossible via HTTP — daemon process lifecycle, OS native features. Desktop-specific TypeScript lives in `packages/admin/src/desktop/` (detect.ts, ipc-bridge.ts, setup-wizard.tsx, sidecar-status.tsx), all behind dynamic imports and `isDesktop()` guards that Vite tree-shakes out of the browser build. The Tauri Rust shell lives in a new `apps/desktop/` monorepo package — Rust-only, no duplicate frontend code.

**Major components:**
1. **Sidecar Manager** (`apps/desktop/src-tauri/src/sidecar.rs`) — allocates ephemeral port, spawns daemon SEA binary, polls `/health`, passes port to WebView URL; handles crash recovery
2. **IPC Commands** (`apps/desktop/src-tauri/src/commands.rs`) — 6 typed Rust handlers exposed via capabilities; validates all input via Serde deserialization before execution
3. **System Tray** (`apps/desktop/src-tauri/src/tray.rs`) — 3-color status icon driven by daemon state events; context menu for quick actions
4. **Auto Updater** (`apps/desktop/src-tauri/src/updater.rs`) — polls GitHub Releases `latest.json`; Ed25519 signature verification embedded at compile time
5. **IPC Bridge (TS)** (`packages/admin/src/desktop/ipc-bridge.ts`) — typed `invoke()` wrappers with `isDesktop()` guard; dynamic import ensures no Tauri deps in browser bundle
6. **Desktop Extensions (TSX)** (`packages/admin/src/desktop/`) — Setup Wizard, Sidecar Status; lazy-loaded, extend existing `@preact/signals` state model
7. **Existing Admin Web UI** (`packages/admin/src/pages/*.tsx`, 19 pages) — **entirely unchanged**; loads same-origin in WebView, CSP works without modification

### Critical Pitfalls

1. **CSP blocks Tauri IPC in production build** — `connect-src 'self'` does not cover `ipc:` and `http://ipc.localhost`; `invoke()` fails silently. Design CSP exception for desktop mode in Phase 1, before any IPC command is implemented. Verify with `tauri build` + production install, not just `tauri dev` (which may bypass CSP).

2. **Node.js SEA binary size (150-250MB) + 3-8 second startup** — acceptable trade-off, but requires native splash screen from Tauri Rust backend, sidecar stdout progress indicators, and lazy DeFi provider initialization after core HTTP server passes health check. Prototype binary size and startup time in Phase 2 before committing to SEA strategy.

3. **Auto-update signing key loss = permanent update breakage** — Ed25519 key embedded at compile time; if lost, users must manually reinstall. Generate offline, back up to 2+ locations, integrate `TAURI_SIGNING_PRIVATE_KEY` as GitHub Secret before first release. Test full update cycle (check → download → verify → install → restart) in CI.

4. **Desktop-only deps leaking into browser bundle** — `@reown/appkit` alone is 500KB+ minified; static imports from any shared component will include it in the browser build. Enforce `packages/admin/src/desktop/` as a dynamic-import-only boundary; add CI bundle analyzer step that fails if `@tauri-apps` strings appear in browser build output.

5. **WebView rendering differences across platforms** — WKWebView (macOS), WebView2 (Windows), WebKitGTK (Linux) diverge on CSS features; Admin UI was tested in Chromium only. Set minimum WebKitGTK 2.42+, audit CSS for `:has()`, `backdrop-filter`, `container-query` usage, add cross-platform visual regression testing before beta.

## Implications for Roadmap

Based on combined research, the architecture splits naturally into 5 phases with clear dependency ordering. This is a design-first milestone (m33-00); implementation phases belong to m33-02+.

### Phase 1: IPC Security + Bundle Boundary Design

**Rationale:** Three pitfalls (CSP blocking IPC, bundle bloat, IPC over-exposure) must be designed before any code is written — they are architectural decisions that cannot be retrofitted cheaply. Port allocation design is also a hard dependency for all subsequent phases.

**Delivers:** Design doc update (doc 39) covering: CSP exception strategy for desktop mode, Tauri capabilities minimal set (6 commands only), dynamic port allocation protocol (ephemeral bind → health poll → WebView URL), `packages/admin/src/desktop/` module boundary rules, dev workflow (3-process startup order), and CI bundle analyzer gate spec.

**Addresses:** Table stakes features — dynamic port allocation, IPC bridge design, CORS additions design, Tauri capabilities configuration

**Avoids:** Pitfall 1 (CSP/IPC), Pitfall 3 (bundle bloat), Pitfall 6 (IPC over-exposure), Pitfall 7 (dev workflow friction), Pitfall 2 (port collision)

### Phase 2: Tauri Shell Scaffold + Sidecar Manager

**Rationale:** Rust backend is independent of Admin UI code — can be built and validated before any TypeScript changes. Creates working proof of concept (Tauri opens Admin UI in WebView via sidecar) that validates architecture assumptions before investing in desktop extensions.

**Delivers:** `apps/desktop/` with working Rust backend: sidecar spawn/kill with ephemeral port, `/health` polling, WebView pointing to daemon's HTTP server, 3-color system tray, 6 IPC command stubs. Admin UI loads unchanged in WebView on all 3 platforms.

**Uses:** Tauri 2.10.x, `@tauri-apps/plugin-shell`, Tauri `tray-icon` core feature, Node.js 22 SEA prototype (measure binary size + startup time here)

**Implements:** Sidecar Manager, System Tray, IPC Commands (stub) components

### Phase 3: Desktop Environment Detection + IPC Bridge (TypeScript)

**Rationale:** After Rust backend proves sidecar loading works, add the TypeScript layer: `isDesktop()` utility and typed IPC bridge wrappers. Verify all 19 existing pages render unchanged in WebView (zero regression). Configure Tauri capabilities (`remote.urls`) and CORS additions. Validate CSP compatibility with production build.

**Delivers:** `packages/admin/src/desktop/detect.ts` + `ipc-bridge.ts`, Tauri capabilities configured, CORS allowlist updated, zero regression on 19 existing pages verified on macOS/Windows/Linux, IPC invoke working from HTTP-loaded WebView, CSP verified with `tauri build` production install.

**Avoids:** Pitfall 4 (WebView rendering — cross-platform test at this phase), Pitfall 1 (CSP — verify production build not just dev)

### Phase 4: Desktop-Only UI Extensions

**Rationale:** With environment detection and IPC bridge proven stable, add user-facing desktop features as additive components behind `isDesktop()` guards and dynamic imports. All additive, no existing page modifications.

**Delivers:** Setup Wizard (first-run, lazy-loaded, hash route `/wizard`), Sidecar Status Panel, WalletConnect QR integration (`@reown/appkit` vanilla JS, dynamic import), Desktop sidebar extensions, auto-update banner, quit/restart controls in System page.

**Addresses:** All differentiator features from FEATURES.md

**Avoids:** Pitfall 3 (bundle bloat — verify browser bundle size after each addition with bundle analyzer), Anti-Pattern 1 (no dual frontend codebase)

### Phase 5: Build Pipeline + Distribution

**Rationale:** Cross-platform SEA binary bundling and Tauri signing are independent of feature development and gated on finalized architecture. Must come last because binary targets and capabilities affect signing and update manifest structure.

**Delivers:** Node.js 22 SEA daemon binaries (5 targets: macOS aarch64/x86_64, Windows x86_64, Linux x86_64/aarch64), Tauri cross-platform builds (`.dmg`, `.msi`, `.AppImage`), CI matrix via `tauri-action@v1`, GitHub Releases auto-update pipeline, Ed25519 signing key provisioned and backed up to 2+ locations.

**Avoids:** Pitfall 5 (SEA binary size — add native splash/lazy init here), Pitfall 8 (signing key loss — key backup procedure mandated before first publish)

### Phase Ordering Rationale

- Phase 1 before all others: CSP + bundle boundary decisions are architectural foundations. Getting these wrong requires expensive refactoring of all subsequent phases.
- Phase 2 before Phase 3: Rust Sidecar Manager proves dynamic port allocation works before TypeScript code depends on it. Fail fast on Rust-side assumptions.
- Phase 3 before Phase 4: `isDesktop()` and IPC bridge must exist and be verified (including cross-platform) before desktop UI components build on them.
- Phase 4 before Phase 5: WalletConnect lazy import boundary must be validated (bundle size check) before shipping distribution builds.
- Phase 5 last: signing key and binary targets are immutable once published — must be decided with full architecture knowledge.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 2 (SEA Sidecar):** sodium-native uses `libsodium` dynamic linking — behavior inside SEA bundle is not fully documented for all platforms. Prototype to discover whether `process.dlopen()` from SEA assets works reliably for sodium-native, better-sqlite3, and argon2. May need per-platform workarounds or fall back to shipping `.node` files alongside the binary.
- **Phase 3 (CORS/Capability on Windows):** WebView2 on Windows uses `http://tauri.localhost` origin for some internal navigation. Behavior with `remote.urls: ["http://127.0.0.1:*/*"]` capability pattern needs verification against actual Windows WebView2. Platform-specific origin behavior is the highest-uncertainty area in the entire architecture.
- **Phase 5 (SEA binary size):** 150-250MB estimate is based on comparable Node.js SEA projects. Measure actual binary size in Phase 2 prototype. If >250MB, evaluate `bun build --compile` as SEA alternative before Phase 5 commits to the strategy.

Phases with standard patterns (skip additional research):

- **Phase 1 (Design):** All design decisions are derived from Tauri 2 official docs and existing design doc 39. No new research needed.
- **Phase 4 (Desktop UI Extensions):** Standard Preact component work behind `isDesktop()` guards. `@reown/appkit` vanilla JS API is documented. No external research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Tauri 2.10.x stable since Oct 2024. All plugins have official docs. Node.js 22 SEA stable in 22.x. `@reown/appkit` vanilla JS + Preact is MEDIUM (no official Preact test cases; vanilla JS mode is framework-agnostic by design so inferred to work) |
| Features | HIGH | Feature scope is well-bounded: 6 IPC commands, 3 new desktop-only pages, no new REST API surface. Existing 19 pages are unchanged. Feature complexity is low except WalletConnect QR (MEDIUM — 200KB+ lazy load, Preact modal rendering in WebView) |
| Architecture | HIGH | HTTP-over-localhost + IPC-for-native-only is the correct Tauri pattern; verified against official docs and multiple community references. No custom protocol, no tauri-plugin-localhost. Zero ambiguity on the approach |
| Pitfalls | HIGH | All 8 pitfalls sourced from official Tauri GitHub issues + official docs (CSP bug #8476, dev server bug #8362, WebKitGTK discussion #12311). CSP/IPC interaction is the highest-certainty risk with documented mitigation |

**Overall confidence:** HIGH

### Gaps to Address

- **SEA native addon loading (sodium-native):** sodium-native dynamically links `libsodium.so/.dylib/.dll`. SEA bundling of a shared library alongside the `.node` addon file is not covered in official Node.js 22 SEA docs. Must prototype this specifically in Phase 2 before committing to SEA strategy. Fallback: ship addon files alongside the binary in a sidecar-adjacent directory.
- **`@reown/appkit` Preact modal rendering in WebView:** `createAppKit()` in vanilla JS mode creates its own DOM elements (QR modal). On Tauri WebView, iframe sandboxing and CSP `frame-src` may block this. Must test the full WalletConnect pairing flow in WebView, not just in browser.
- **Linux system tray on Wayland:** Tauri tray icon requires a tray-compatible desktop environment. On Wayland sessions (common in Ubuntu 22.04+), tray icon may be invisible. Needs explicit fallback design (window-based status indicator when tray unavailable). Address in Phase 1 design doc update.
- **masterAuth session persistence across app restarts:** Current Admin UI re-authenticates on every browser open (session token in memory). Desktop users expect not to re-enter master password on every app restart. Research `tauri-plugin-keychain` as session token cache (not master password). Security boundary: store session token (time-limited JWT) only, never the master password.

## Sources

### Primary (HIGH confidence)
- [Tauri 2.0 Stable Release](https://v2.tauri.app/blog/tauri-20/) — v2.10.x stability, features
- [Tauri Configuration Reference](https://v2.tauri.app/reference/config/) — tauri.conf.json, capabilities schema
- [Tauri Sidecar Documentation](https://v2.tauri.app/develop/sidecar/) — externalBin, target triple naming
- [Tauri Node.js Sidecar Guide](https://v2.tauri.app/learn/sidecar-nodejs/) — SEA binary sidecar pattern
- [Tauri System Tray](https://v2.tauri.app/learn/system-tray/) — tray-icon feature, event handling
- [Tauri Updater Plugin](https://v2.tauri.app/plugin/updater/) — Ed25519 signing, GitHub Releases endpoints
- [Tauri Capabilities](https://v2.tauri.app/security/capabilities/) — remote URL IPC access
- [Tauri v2 CSP Documentation](https://v2.tauri.app/security/csp/) — IPC protocol requirements
- [Tauri Shell Plugin](https://v2.tauri.app/plugin/shell/) — sidecar spawn/kill API
- [Tauri GitHub Pipelines](https://v2.tauri.app/distribute/pipelines/github/) — CI build matrix

### Secondary (MEDIUM confidence)
- [Tauri CSP IPC bug #8476](https://github.com/tauri-apps/tauri/issues/8476) — external URL CSP/IPC interaction
- [Tauri CSP pagehide bug #14707](https://github.com/tauri-apps/tauri/issues/14707) — IPC blocked during page lifecycle
- [Vite watching src-tauri bug #8362](https://github.com/tauri-apps/tauri/issues/8362) — 45s dev startup from watching Rust build artifacts
- [WebKitGTK cross-platform discussion #12311](https://github.com/tauri-apps/tauri/discussions/12311) — Linux rendering differences
- [Reown AppKit Overview](https://docs.reown.com/appkit/overview) — vanilla JS (framework-agnostic) mode support confirmed
- [Tauri IPC Protocol Implementation (DeepWiki)](https://deepwiki.com/tauri-apps/tauri/3.1-ipc-protocol-and-invoke()-system) — internal IPC mechanism

### Tertiary (LOW confidence — needs implementation validation)
- Node.js 22 SEA + sodium-native native addon bundling — `process.dlopen()` from SEA assets with dynamic library dependency; no official coverage
- `@reown/appkit` vanilla JS mode in Tauri WebView — no documented test cases; inferred from framework-agnostic design

---
*Research completed: 2026-03-31*
*Ready for roadmap: yes*
