# Research Summary: Tauri 2 Desktop App (m33-02)

**Domain:** Desktop App wrapping WAIaaS daemon + Admin Web UI
**Researched:** 2026-03-31
**Overall confidence:** HIGH

## Executive Summary

Tauri 2 provides a well-documented, production-ready framework for the WAIaaS Desktop App architecture. The core approach -- loading the existing Admin Web UI from a sidecar-managed daemon via WebView -- is technically sound but requires careful handling of one critical integration point: IPC availability on external localhost URLs.

The `remote.urls` capability in Tauri 2's ACL system enables `invoke()` from pages served by `http://localhost:{port}`, which is the exact pattern needed for the splash-then-navigate architecture. This was verified through official Tauri docs, the plugin-localhost implementation, and GitHub issue discussions. The pattern `"http://localhost:*"` with wildcard port accommodates dynamic port allocation.

The Sidecar Manager is the most complex new component. It needs a proper state machine (7 states) to handle process lifecycle, port discovery via stdout parsing, health check polling, crash detection with auto-restart, and graceful shutdown. Tauri's `tauri-plugin-shell` provides the low-level primitives (`sidecar()`, `spawn()`, `CommandEvent::Stdout/Terminated`), but the state machine and retry logic must be custom-built in Rust.

The highest-risk item is the Node.js SEA binary with native addons (sodium-native, better-sqlite3). These addons cannot be bundled into the SEA blob and must be shipped as separate .node files with correct path resolution. This should be validated very early in Phase 1. The second risk is WalletConnect (@reown/appkit) compatibility in Tauri's WebView, which the existing design correctly addresses with a Phase 0 spike.

## Key Findings

**Stack:** Tauri 2 (Rust) + tauri-plugin-shell (sidecar) + Node.js SEA (daemon binary) + existing Admin Web UI (Preact 10.x). No framework changes needed for existing code.

**Architecture:** Three-layer: Rust backend (SidecarManager + IPC + Tray) -> WebView (Admin UI + desktop/ extensions) -> Sidecar (daemon SEA binary). Communication: IPC for desktop features, HTTP for daemon API.

**Critical pitfall:** IPC loss when navigating to external localhost URL. Must configure `remote.urls: ["http://localhost:*"]` in capabilities. Without this, `isDesktop()` returns false and all desktop features break silently.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Phase 0: WalletConnect Spike** - Validate @reown/appkit in Tauri WebView
   - Addresses: WalletConnect QR pairing feature
   - Avoids: Pitfall #5 (WebView incompatibility)
   - Can run in parallel with Phase 1

2. **Phase 1: Tauri Shell + Sidecar Manager** - Core desktop infrastructure
   - Addresses: App launch, daemon management, WebView loading
   - Avoids: Pitfall #1 (IPC loss), #2 (native addons), #3 (port race)
   - Most complex phase, highest risk

3. **Phase 2: IPC Bridge + System Tray** - Desktop control layer
   - Addresses: 7 IPC commands, tray status, daemon control from UI
   - Avoids: Pitfall #7 (zombie processes)
   - Depends on Phase 1 (sidecar must exist)

4. **Phase 3: Setup Wizard + WalletConnect + Admin UI Extensions** - Desktop UX
   - Addresses: First-run experience, Owner registration, desktop status card
   - Avoids: Pitfall #9 (bundle bloat via 4-layer tree-shaking)
   - Depends on Phase 2 (IPC must work) + Phase 0 result (WC plan)

5. **Phase 4: GitHub Releases CI + Auto-Update** - Distribution
   - Addresses: Cross-platform builds, code signing, auto-update
   - Avoids: Pitfall #8 (binary naming), #11 (macOS signing)
   - Depends on Phase 1-3 complete

**Phase ordering rationale:**
- Phase 0 is a spike (parallel-safe) because its result only affects Phase 3, not earlier phases
- Phase 1 must come first because all other phases depend on the sidecar + WebView working
- Phase 2 before Phase 3 because desktop UI extensions need IPC bridge to function
- Phase 4 last because it's packaging/distribution -- needs everything else working first

**Research flags for phases:**
- Phase 0: Needs spike execution (cannot be resolved by research alone)
- Phase 1: Likely needs deeper research on SEA native addon path resolution
- Phase 2: Standard patterns, unlikely to need research
- Phase 3: WalletConnect Plan B may need research if Plan A fails
- Phase 4: Standard Tauri CI patterns, well-documented

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies are official/stable. Tauri 2, Node.js SEA, Preact -- all production-ready |
| Features | HIGH | Feature scope is well-defined in m33-02 objective. No ambiguity |
| Architecture | HIGH | Splash-then-navigate + IPC capability pattern verified via multiple official sources |
| Pitfalls | HIGH | IPC loss is the #1 risk, confirmed via GitHub issues and docs. Native addon risk is well-known |
| WalletConnect | LOW | WebView compatibility unverified. Phase 0 spike is the correct approach |
| SEA + native addons | MEDIUM | Pattern exists but specific WAIaaS deps (sodium-native, better-sqlite3) not tested in SEA |

## Gaps to Address

- **SEA native addon resolution:** Need to test sodium-native and better-sqlite3 loading from SEA binary context. May need custom `--sea-config` with explicit addon paths.
- **WalletConnect WebView compat:** Cannot be resolved by research. Phase 0 spike is the answer.
- **WebView2 version on Windows:** Older Windows machines may have outdated WebView2. Tauri bundles a bootstrapper but edge cases exist.
- **Linux WebKitGTK CSS compat:** Admin UI should be tested on Ubuntu/Fedora early. WebKitGTK lags behind Safari WebKit.
- **Daemon stdout protocol:** The daemon currently does not print `WAIAAS_PORT={port}` to stdout. This is a small code change needed in Phase 1.

## Sources

- [Tauri 2 Official Documentation](https://v2.tauri.app/) -- primary reference
- [Tauri 2 Sidecar](https://v2.tauri.app/develop/sidecar/) -- sidecar patterns
- [Tauri 2 IPC](https://v2.tauri.app/develop/calling-rust/) -- command patterns
- [Tauri 2 Capabilities](https://v2.tauri.app/reference/acl/capability/) -- remote URL IPC
- [Tauri 2 System Tray](https://v2.tauri.app/learn/system-tray/) -- tray patterns
- [Tauri 2 Node.js Sidecar](https://v2.tauri.app/learn/sidecar-nodejs/) -- SEA guide
- [GitHub #5088](https://github.com/tauri-apps/tauri/issues/5088) -- IPC on remote URLs
- [GitHub #1974](https://github.com/tauri-apps/plugins-workspace/issues/1974) -- plugin-localhost + v2
