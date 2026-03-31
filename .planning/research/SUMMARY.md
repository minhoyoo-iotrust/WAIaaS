# Project Research Summary

**Project:** WAIaaS Desktop App (m33-02 Implementation)
**Domain:** Tauri 2 desktop wrapper for existing Node.js daemon + Preact Admin Web UI
**Researched:** 2026-03-31
**Confidence:** MEDIUM-HIGH

## Executive Summary

WAIaaS Desktop is a daemon-management desktop app following a well-established pattern (IPFS Desktop, Docker Desktop): a native shell wraps a background service and exposes its web UI in an embedded WebView. The key architectural decision, locked in v33.0 design doc 39, is to reuse the existing Preact 10.x Admin Web UI directly in a Tauri 2 WebView instead of building a separate React UI. This is the correct call — IPFS Desktop proves it works in production, and it eliminates an entire UI maintenance surface. The Tauri 2 stack (Rust backend, system WebView, Node.js SEA sidecar) delivers a ~15-30MB binary versus Electron's 150MB+, which is a meaningful UX advantage for a self-hosted product.

The recommended implementation path is straightforward for everything except two areas. First, the Node.js SEA native addon packaging (sodium-native, better-sqlite3) is the highest technical risk: these C++ addons must be compiled on each target platform in CI and cannot be cross-compiled. This must be proven in Phase 1 before anything else proceeds. Second, WalletConnect (@reown/appkit) in a Tauri WebView has no confirmed production reports and requires a Phase 0 spike to determine Go/No-Go before committing to the implementation. All other components — Tauri sidecar management, IPC bridge, system tray, auto-updater — are well-documented with HIGH-confidence official sources.

The three risks that require deliberate mitigation are: (1) CSP conflict between the daemon's strict `connect-src 'self'` headers and Tauri's IPC protocols, which silently breaks all Desktop-specific features; (2) orphan sidecar processes from force-quit that cause SQLite contention on relaunch; and (3) macOS notarization requiring the `com.apple.security.cs.allow-jit` entitlement, which is a Tauri-specific trap that causes post-notarization crashes even when signing succeeds. These are all preventable with known countermeasures and must be addressed in the phases where they first appear.

## Key Findings

### Recommended Stack

Tauri 2.10.x is the correct and only desktop framework for this project. The stack is aligned around four plugins: `tauri-plugin-shell` for sidecar process management, `tauri-plugin-updater` for auto-update via GitHub Releases, `tauri-plugin-process` for app exit/relaunch, and `tauri-plugin-notification` for OS-native alerts. All Tauri crate and npm package versions must be kept synchronized at the same minor version — this is a hard operational rule enforced by `npm run tauri add`.

For the sidecar binary, Node.js 22 SEA with `--experimental-sea-config` + postject is the only viable approach (the newer `--build-sea` flag requires Node 25.5+). The CI build pipeline must compile native addons on each target platform (not cross-compile), using `prebuildify` prebuilds for better-sqlite3 and sodium-native. WalletConnect uses `@reown/appkit` vanilla JS (Web Components via Lit) — the React-specific modules must never be imported to avoid JSX conflicts with Preact. CI/CD uses `tauri-apps/tauri-action@v0` which handles multi-platform builds, code signing, notarization, and GitHub Release artifact generation.

**Core technologies:**
- Tauri 2.10.x + Rust stable: Desktop shell with Rust backend — only Tauri 2 provides system tray, IPC, sidecar, updater in a ~10MB binary; Electron was already rejected in v33.0
- `tauri-plugin-shell` ^2.3.5: Sidecar spawn/kill/stdout-parsing — essential for SidecarManager; the `Command.sidecar()` API is the only supported way to manage child processes
- Node.js 22 SEA + esbuild + postject: Daemon packaging as single binary — official Node.js approach; `@yao-pkg/pkg` and nexe are abandoned
- `@reown/appkit` ^1.8.19 (vanilla JS): WalletConnect QR pairing — framework-agnostic, Web Components render in Preact; Phase 0 spike required for Tauri WebView validation
- `tauri-apps/tauri-action@v0`: CI/CD multi-platform build matrix — handles Apple notarization, Windows signing, GitHub Release creation, `latest.json` for updater

### Expected Features

The feature set divides cleanly into table stakes (what a daemon-management desktop app must have), differentiators (what sets this apart), and anti-features (what explicitly not to build).

**Must have (table stakes, ship as v0.1.0):**
- Sidecar lifecycle (start/stop/crash-detect/auto-restart) — core value proposition of the wrapper
- System tray with 3-color status indicator — every daemon-management app provides this (IPFS Desktop, Docker Desktop)
- Dynamic port allocation with splash-then-navigate — prevents port conflicts; already designed in doc 39
- Admin Web UI in WebView — zero new UI code; all existing admin features available immediately
- IPC bridge (7 typed commands) — enables all Desktop-specific features
- Orphan process cleanup on launch — prevents SQLite contention from previous force-quits
- Desktop environment detection (`isDesktop()`) — gates all Desktop-only code paths

**Should have (phase 3, v0.2.0):**
- Setup Wizard (5 steps) — non-technical users need guided first-run onboarding
- WalletConnect QR pairing — high-value differentiator, contingent on Phase 0 spike result
- Sidecar status card on dashboard — low-cost IPC-backed health display

**Must have for public distribution (phase 4):**
- Auto-update with Tauri updater + GitHub Releases — security requirement for a crypto app
- Cross-platform CI + code signing — macOS notarization is mandatory (Gatekeeper blocks unsigned apps)

**Defer to post-v33.2:**
- Native OS notifications (D2), launch at startup (D4), log viewer (D5), universal macOS binary (D6)

### Architecture Approach

The architecture is a three-layer sandwich: Rust backend (SidecarManager + IPC Commands + SystemTray), WebView (Admin Web UI from daemon's localhost), and Sidecar process (Node.js SEA binary). The critical integration point is that the WebView loads an external URL (`http://localhost:{dynamic_port}/admin`) — not Tauri-served assets — which requires explicit `remote.urls` capability configuration to enable IPC `invoke()`. Desktop-only frontend code lives in `packages/admin/src/desktop/` and is gated by four independent tree-shaking layers (dynamic import, optional peer deps, build constant, CI bundle check) to keep WalletConnect's ~200KB+ out of browser builds.

**Major components:**
1. `SidecarManager` (Rust, `sidecar/manager.rs`) — 7-state machine (Starting/PortDiscovery/HealthCheck/Running/Stopping/Stopped/Crashed) that spawns the SEA binary, parses stdout for `WAIAAS_PORT={port}`, polls `/health` every 5s, and implements exponential-backoff crash restart
2. IPC Commands (`commands/mod.rs`) — 7 typed Tauri commands (`start_daemon`, `stop_daemon`, `restart_daemon`, `get_sidecar_status`, `get_daemon_logs`, `send_notification`, `quit_app`); boundary rule: IPC is only for native-only operations, all wallet/tx/policy ops use the existing HTTP API
3. Desktop Extensions (`packages/admin/src/desktop/`) — `tauri-bridge.ts` typed invoke wrappers, `setup-wizard.tsx`, `wallet-connect.tsx`, `desktop-status.tsx`, `useDaemon` hook; all conditionally loaded via `isDesktop()` guard
4. SEA Build Pipeline (`scripts/build-sea.ts`) — esbuild bundles daemon to `.cjs` (native addons external), SEA config with assets, postject injection, per-platform target-triple suffix for Tauri sidecar resolution
5. CI/CD (`desktop-release.yml`) — `tauri-action@v0` 5-target matrix (macOS arm64/x64, Linux x64, Windows x64), `desktop-v*` tag trigger independent from npm release tags

### Critical Pitfalls

1. **SEA native addon binary mismatch** — sodium-native and better-sqlite3 `.node` files must be compiled on each target platform in CI; never cross-compile. Set `useCodeCache: false` and `useSnapshot: false`. Smoke-test `./waiaas-daemon --version` per platform before Tauri packaging. Pin Node.js version across all CI runners to prevent ABI mismatch.

2. **Orphan sidecar processes on force-quit** — implement PID lockfile + port file health check in SidecarManager startup sequence (`check_existing() -> kill_stale() -> spawn_new()`). On Windows, use `CreateJobObject` with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` — this is the only reliable cleanup mechanism on Windows since SIGKILL does not propagate to child processes.

3. **CSP conflict blocking Tauri IPC** — the daemon's existing `connect-src 'self'` blocks Tauri's `ipc:` protocol. Define Desktop CSP override in `tauri.conf.json` `security.csp` (not in HTTP response headers) to add `ipc: http://ipc.localhost` to `connect-src` and `script-src`. HTTP CSP headers remain strict for browser users. Never disable CSP globally.

4. **macOS notarization crash from missing JIT entitlement** — Tauri WKWebView requires JIT compilation. Without `com.apple.security.cs.allow-jit` in `entitlements.plist`, the app passes notarization but crashes on launch. Include all three entitlements: `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`. Use App Store Connect API key (not Apple ID password) for CI notarization.

5. **Tauri updater Ed25519 key loss** — private key loss permanently bricks the auto-update channel with no recovery path. Generate with `tauri signer generate`, store in two independent locations (GitHub Secrets + encrypted backup), and verify a complete update cycle (check/download/verify/install) before first release.

## Implications for Roadmap

Based on research, dependencies, and risk ordering, 5 phases are recommended:

### Phase 0: WalletConnect Spike (Go/No-Go)
**Rationale:** @reown/appkit in a Tauri WebView has zero confirmed production reports (LOW confidence). A spike run in Phase 0 gates the entire Phase 3 WalletConnect feature. If it fails, Phase 3 scope shrinks to Plan B (raw WebSocket) or defers WC entirely. Running the spike first prevents wasted implementation effort and avoids late-phase replanning. This is the only feature requiring a spike.
**Delivers:** Go/No-Go decision on `@reown/appkit` in WebKit/WebView2 Tauri WebView. Spike validates: (1) `<w3m-modal>` Web Component renders, (2) WebSocket to `wss://relay.walletconnect.com` connects through CSP, (3) QR scan + SIWS/SIWE flow completes.
**Addresses:** D1 (WalletConnect QR pairing)
**Avoids:** IG-2 (WebSocket CSP blocking), TD-1 (localStorage loss on port change — must be evaluated during spike)

### Phase 1: Tauri Shell + Sidecar Manager
**Rationale:** This is the dependency foundation for everything else. Admin Web UI cannot load until the sidecar is running. System tray cannot reflect status until the state machine exists. IPC bridge cannot function until Tauri project structure exists. The SEA build pipeline and native addon packaging are the highest-risk technical unknowns and must be proven before any UI work begins. This phase also establishes the security baseline (minimal capabilities, localhost bind, sidecar hash verification) from the start.
**Delivers:** Working Tauri app that spawns WAIaaS daemon SEA binary, discovers dynamic port from stdout, navigates WebView to `http://localhost:{port}/admin`, shows 3-color system tray, and handles orphan process cleanup on launch.
**Addresses:** T1 (sidecar lifecycle), T2 (system tray), T3 (dynamic port), T9 (orphan cleanup)
**Uses:** Tauri 2.10.x, tauri-plugin-shell, Node.js SEA + esbuild + postject, CI platform matrix
**Avoids:** Pitfall 1 (SEA native addon mismatch — CI matrix per platform), Pitfall 2 (orphan processes — PID lockfile + Windows Job Objects), SM-4 (IPC over-exposure — minimal capabilities from day 1), SM-5 (daemon binds 0.0.0.0 — force `--host=127.0.0.1` in sidecar spawn args)

### Phase 2: IPC Bridge + Admin Web UI Integration
**Rationale:** IPC bridge depends on Phase 1 (Tauri structure exists). CSP adjustment, tree-shaking layers, and `isDesktop()` detection depend on the WebView loading. Desktop extensions directory must be established before Phase 3 adds WalletConnect and the wizard. This phase sets the architectural boundary: IPC is native-only, HTTP API handles everything else. The 4-layer tree-shaking CI gate must be in place before any desktop module is added.
**Delivers:** Type-safe `tauri-bridge.ts` with 7 IPC commands, `isDesktop()` detection, 4-layer tree-shaking (dynamic import + optional deps + build constant + CI bundle check), CSP corrected for Tauri IPC, sidecar status card on dashboard.
**Addresses:** T4 (Admin WebView), T8 (IPC bridge), T10 (desktop detection), D3 (status card)
**Implements:** Desktop Extensions architecture (`packages/admin/src/desktop/`), IPC Commands (`commands/mod.rs`), `remote.urls` capability config
**Avoids:** Pitfall 3 (CSP conflict — tauri.conf.json override), PT-1 (desktop code leaking — CI bundle check), IG-3 (invoke() error swallowing — typed tauriInvoke wrapper), IG-4 (IPC/HTTP boundary — establish rule in this phase), SM-3 (CSP relaxation not affecting browser users)

### Phase 3: Setup Wizard + WalletConnect
**Rationale:** Depends on Phase 0 spike result (WC Go/No-Go) and Phase 2 IPC bridge (wizard uses IPC for first-run detection). The wizard is the onboarding surface for non-technical users — it must come before distribution CI because it affects the install experience. WalletConnect scope is conditional: if Phase 0 returns Go, implement Plan A (@reown/appkit); if No-Go, implement Plan B (raw WC Relay WebSocket) or defer.
**Delivers:** 5-step Setup Wizard (master password / chain selection / wallet creation / owner / done), WalletConnect QR pairing page (Plan A or B), port pinning strategy for localStorage stability.
**Addresses:** T5 (setup wizard), D1 (WalletConnect) — contingent on Phase 0
**Avoids:** TD-1 (localStorage wiped on port change — implement port pinning in this phase)

### Phase 4: CI/CD + Distribution + Auto-Update
**Rationale:** Distribution must come last because it requires all prior phases to be testable. Signing keys and notarization entitlements must be proven against a complete app, not a stub. Auto-updater must be tested end-to-end (check/download/verify/install/relaunch) before any public release. macOS notarization pipeline typically requires iteration — it should not be the final task on a deadline.
**Delivers:** `desktop-release.yml` with tauri-action@v0 5-target build matrix, Ed25519 updater keypair generated and backed up, macOS notarization with correct entitlements, HTTPS-only updater endpoint, Windows OV signing (optional), update check on launch + periodic check, `latest.json` endpoint from GitHub Releases.
**Addresses:** T6 (auto-update), T7 (cross-platform distribution)
**Uses:** tauri-apps/tauri-action@v0, Apple Developer ID certificate, App Store Connect API key
**Avoids:** Pitfall 4 (notarization JIT crash — entitlements.plist), Pitfall 5 (updater key loss — dual backup + cycle test), SM-1 (updater MITM — HTTPS-only URL + downgrade protection), TD-3 (SmartScreen cold start — OV cert + manual portal submission)

### Phase Ordering Rationale

- Phase 0 before Phase 3 eliminates the highest-uncertainty feature before committing to its implementation.
- Phase 1 before Phase 2 because IPC bridge requires the Tauri project structure to exist and the SEA pipeline to be proven.
- Phase 2 before Phase 3 because the 4-layer tree-shaking architecture and `packages/admin/src/desktop/` directory must exist before adding WalletConnect (~200KB) and the wizard.
- Phase 4 last because notarization requires a shippable binary, and the updater requires a complete app to test against.
- Security baseline (minimal capabilities, localhost bind, sidecar hash) is established in Phase 1, not deferred — this is intentional to avoid retrofitting security into a working system.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Node.js SEA + native addon asset extraction via `process.dlopen()` from temp files — few production reports with complex addons (sodium-native + better-sqlite3 simultaneously). Needs CI matrix validation per platform before declaring done.
- **Phase 4:** Apple Developer ID / notarization workflow for CI — certificate import into temporary keychain, App Store Connect API key setup, test-the-signed-artifact step. Community guides exist but this is environment-specific.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Tauri shell + sidecar):** Official Tauri 2 sidecar docs are comprehensive. State machine and stdout-parsing patterns are well-documented. Confidence HIGH.
- **Phase 2 (IPC bridge):** Tauri 2 IPC (`invoke()`) is well-documented. `remote.urls` capability pattern confirmed via GitHub issues. Confidence HIGH.
- **Phase 4 (CI matrix, tauri-action):** `tauri-apps/tauri-action@v0` is the official CI action with comprehensive docs and community guides. Confidence HIGH.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Tauri 2.10.x, tauri-action, SEA basics — all verified from official docs. Only postject (alpha) and @reown/appkit in WebView are MEDIUM/LOW |
| Features | HIGH | Feature set is clear and directly modeled on IPFS Desktop + Docker Desktop patterns. No ambiguity in what to build |
| Architecture | HIGH | Official Tauri 2 docs cover every component. `remote.urls` capability for external URL IPC confirmed via GitHub issues. State machine patterns standard |
| Pitfalls | HIGH | SEA native addon mismatch, zombie processes, CSP conflict, macOS entitlements — all confirmed from official docs and community issue trackers with specific issue numbers |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **@reown/appkit in Tauri WebView:** No confirmed production reports. Must be validated in Phase 0 spike before any implementation commitment. Fallback plan (raw WebSocket to WC Relay) must be specified in Phase 3 planning.
- **postject stability on macOS ARM64 CI:** postject is marked going-unmaintained (replaced by `--build-sea` in Node 25.5+, still alpha at 1.0.0-alpha.6). Should monitor for issues on `macos-latest` (ARM) runners. If postject fails, upgrading CI to Node 25.5+ and switching to `--build-sea` is the clean exit path — document this as a contingency.
- **SEA assets + dlopen for all three addons:** Few reports of simultaneously loading sodium-native + better-sqlite3 via SEA assets. CI smoke test (`./waiaas-daemon --version` + basic DB write) per platform is the validation gate. Approach B (ship `.node` files alongside binary) is the documented fallback.
- **WalletConnect localStorage stability across port changes:** TD-1 confirmed as real issue. Port-pinning strategy (save preferred port on first launch, try it on restart) must be designed in Phase 3. Evaluate `tauri-plugin-store` as alternative WC session storage if port changes prove unavoidable.
- **Windows code signing with OV certificate HSM requirement:** Since June 2023, OV certificates require HSM (Azure Key Vault minimum). EV certificates avoid SmartScreen cold-start but cost $300-500/year. Decision on Windows signing tier should be made before Phase 4.

## Sources

### Primary (HIGH confidence — official documentation)
- [Tauri 2.0 Stable Release](https://v2.tauri.app/blog/tauri-20/) — stability baseline, Oct 2024
- [Tauri Node.js Sidecar Guide](https://v2.tauri.app/learn/sidecar-nodejs/) — SEA binary tutorial, sidecar spawn
- [Tauri Shell Plugin](https://v2.tauri.app/plugin/shell/) — `Command.sidecar()`, stdout parsing, permissions
- [Tauri Updater Plugin](https://v2.tauri.app/plugin/updater/) — key management, latest.json, update cycle
- [Tauri GitHub Actions Guide](https://v2.tauri.app/distribute/pipelines/github/) — tauri-action@v0 workflow
- [Tauri macOS Code Signing Docs](https://v2.tauri.app/distribute/sign/macos/) — notarization, entitlements, JIT crash
- [Tauri 2 Calling Rust](https://v2.tauri.app/develop/calling-rust/) — IPC command patterns
- [Tauri 2 Capability Reference](https://v2.tauri.app/reference/acl/capability/) — remote.urls for external URL IPC
- [Node.js SEA Documentation](https://nodejs.org/api/single-executable-applications.html) — assets, dlopen, caveats
- [GitHub Issue #5088: __TAURI__ injection on remote URLs](https://github.com/tauri-apps/tauri/issues/5088) — confirms IPC on localhost URL
- [@tauri-apps/cli npm v2.10.1](https://www.npmjs.com/package/@tauri-apps/cli) — version confirmation
- [tauri-apps/tauri-action GitHub](https://github.com/tauri-apps/tauri-action) — CI action reference

### Secondary (MEDIUM confidence — community, validated patterns)
- [Reown AppKit Overview](https://docs.reown.com/appkit/overview) — vanilla JS mode, Web Components
- [Reown AppKit Web Examples](https://github.com/reown-com/appkit-web-examples) — vanilla JS initialization patterns
- [Evil Martians: Rust + Tauri + Sidecar](https://evilmartians.com/chronicles/making-desktop-apps-with-revved-up-potential-rust-tauri-sidecar) — production sidecar patterns
- [Ship Tauri v2 Code Signing Guide](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-code-signing-for-macos-and-windows-part-12-3o9n) — CI signing workflow
- [Ship Tauri v2 GitHub Actions Guide](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-github-actions-and-release-automation-part-22-2ef7) — release automation
- [Improving SEA Building (Joyee Cheung)](https://joyeecheung.github.io/blog/2026/01/26/improving-single-executable-application-building-for-node-js/) — postject deprecation context
- [IPFS Desktop](https://github.com/ipfs/ipfs-desktop) — comparable daemon-wrapper architecture (5.8k stars)
- [Tauri issue #5611](https://github.com/tauri-apps/tauri/issues/5611), [#1896](https://github.com/tauri-apps/tauri/issues/1896) — zombie process documentation
- [Tauri issue #896](https://github.com/tauri-apps/tauri/issues/896), [#10981](https://github.com/tauri-apps/tauri/issues/10981) — localStorage port-origin loss

### Tertiary (LOW confidence — needs Phase 0 validation)
- @reown/appkit rendering in Tauri WebKit/WebView2 — no confirmed production reports; Phase 0 spike required
- SEA assets + simultaneous dlopen for sodium-native + better-sqlite3 — limited real-world reports; CI matrix validation required

---
*Research completed: 2026-03-31*
*Ready for roadmap: yes*
