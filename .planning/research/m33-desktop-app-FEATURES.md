# Feature Landscape: Tauri Desktop App

**Domain:** Desktop wrapper for wallet daemon management (self-hosted WAIaaS)
**Researched:** 2026-03-31
**Comparable Products:** IPFS Desktop (Electron + Kubo daemon), Docker Desktop (daemon GUI), Ledger Live (desktop wallet), Exodus (desktop wallet)

---

## Table Stakes

Features users expect from a desktop daemon-management app. Missing = product feels incomplete or untrustworthy.

| # | Feature | Why Expected | Complexity | Dependencies | Notes |
|---|---------|--------------|------------|--------------|-------|
| T1 | Sidecar lifecycle (start/stop/restart) | Core purpose of the desktop wrapper. IPFS Desktop, Docker Desktop all do this. Users expect the daemon to start automatically and be controllable | Med | Node.js SEA build pipeline | Crash detection + auto-restart + graceful shutdown (SIGTERM 5s -> SIGKILL). Already specified in m33-02 |
| T2 | System tray icon with status | Every daemon management app (IPFS Desktop, Docker Desktop, Syncthing) lives in the tray. Users expect at-a-glance daemon health | Low | Tauri tray-icon feature | 3-color (green/amber/red) + context menu (Open/Pause/Resume/Quit). Standard pattern |
| T3 | Dynamic port allocation | Avoids port conflicts when users run multiple services. IPFS Desktop handles this transparently | Med | TCP bind(0) + stdout/tempfile protocol | Already designed in doc 39. Splash -> navigate() transition essential |
| T4 | Admin Web UI in WebView | The entire reason for the desktop app -- full admin functionality without opening a browser | Low | Existing Admin Web UI (Preact 10.x) | WebView loads `http://localhost:{port}/admin`. Zero new UI code for existing pages |
| T5 | Setup Wizard (first-run) | Non-technical users need guided onboarding. Crypto wallets (Exodus, Phantom desktop) all have first-run wizards. Without one, users face a blank dashboard with no wallets | Med | Master auth API, wallet creation API, chain adapters | 5 steps: master password -> chain selection -> wallet creation -> owner (skippable) -> done. Keep minimal -- research shows 5 steps is the upper bound before user drop-off |
| T6 | Auto-update mechanism | Desktop apps that don't auto-update become security liabilities. Every modern desktop app (VS Code, Brave, Docker Desktop) does this | Med | Tauri updater plugin, GitHub Releases, signing keys | Tauri built-in updater with mandatory signature verification. `latest.json` from GitHub Releases. Check on launch + periodic |
| T7 | Cross-platform distribution (macOS/Win/Linux) | Users expect native installers for their OS. DMG+notarized for macOS, MSI/NSIS for Windows, AppImage/deb for Linux | High | tauri-action CI, Apple Developer ID, Windows code signing (optional) | macOS notarization is mandatory (Gatekeeper blocks unsigned apps). Windows signing is optional but reduces SmartScreen warnings |
| T8 | IPC bridge (WebView <-> Rust backend) | Desktop-specific features (sidecar status, native notifications) require communication between WebView and native layer | Med | Tauri invoke() API | 7 commands: start/stop/restart_daemon, get_sidecar_status, get_daemon_logs, send_notification, quit_app |
| T9 | Orphan process cleanup | Users will force-kill the app. Orphaned daemon processes waste resources and lock ports | Med | Process management in Rust | IPFS Desktop and Docker Desktop both handle this. PID file + port-based detection + cleanup on launch |
| T10 | Desktop environment detection | Admin Web UI must know it's running in Desktop (vs browser) to show/hide features | Low | `window.__TAURI_INTERNALS__` | Module-level caching, SSR-safe. Already designed |

---

## Differentiators

Features that set product apart. Not expected by default, but make the product notably better.

| # | Feature | Value Proposition | Complexity | Dependencies | Notes |
|---|---------|-------------------|------------|--------------|-------|
| D1 | WalletConnect QR pairing in Desktop | Owner approval without Telegram or external browser. Scan QR from mobile wallet (MetaMask/Phantom) directly in the app. No comparable daemon-management tool offers this | High | @reown/appkit (Plan A) or WC Relay WebSocket (Plan B) | Phase 0 spike needed for Go/No-Go. Tauri WebView compatibility is the primary risk. This is the only feature requiring a spike |
| D2 | Native OS notifications for daemon events | Toast/banner notifications for pending approvals, kill switch triggers, low balance alerts -- without keeping the app open | Low | Tauri notification plugin | Bridges existing daemon notification events to OS-level notifications. Much better than relying on Telegram |
| D3 | Sidecar status card on Dashboard | At-a-glance daemon health (uptime, memory, port, version) integrated into the familiar dashboard UI | Low | IPC get_sidecar_status | Small but noticeable quality-of-life improvement over browser-only admin |
| D4 | Launch at system startup | Daemon always running without user intervention. IPFS Desktop and Docker Desktop both offer this | Low | Tauri autostart plugin | OS-specific (launchd on macOS, registry on Windows, systemd/XDG on Linux) |
| D5 | Log viewer (daemon stdout/stderr) | Troubleshoot without terminal. See real-time daemon output in the UI | Med | IPC get_daemon_logs, streaming | Useful for debugging. IPFS Desktop exposes logs via web UI. Could pipe sidecar stdout to a ring buffer in Rust |
| D6 | Universal binary for macOS (arm64+x64) | Single download works on both Apple Silicon and Intel Macs | Low | tauri-action target config | User-facing simplicity. Apple strongly encourages universal binaries |

---

## Anti-Features

Features to explicitly NOT build. Tempting but wrong for this project.

| # | Anti-Feature | Why Avoid | What to Do Instead |
|---|--------------|-----------|-------------------|
| A1 | Separate React/Vue UI for Desktop | Doubles maintenance, breaks feature parity, introduces desync bugs. This was the original doc 39 v0.5 design -- correctly abandoned in v33.0 | Reuse Admin Web UI (Preact 10.x) via WebView. Desktop-only modules in `packages/admin/src/desktop/` with dynamic import + tree-shaking |
| A2 | Embedded database viewer/editor | SQLite direct manipulation bypasses the API layer, creates data corruption risk, and violates the security model | Existing Admin Web UI pages for all CRUD operations. If debugging is needed, export backup via CLI |
| A3 | Built-in terminal/CLI emulator | Scope creep. Desktop app is for GUI users. CLI users already have the terminal | Document CLI commands in admin manual. Link to docs from Settings page |
| A4 | Custom window chrome / frameless window | Breaks OS conventions, accessibility, and platform-specific behaviors (traffic lights on macOS, snap on Windows). Tauri's default native chrome is correct | Use Tauri default window decorations. Consistent with OS expectations |
| A5 | Multi-instance management | Managing multiple daemon instances adds enormous complexity for a niche use case | Single instance per app. Advanced users use Docker/CLI for multi-instance |
| A6 | Mobile companion app | Mobile is an entirely different platform with different patterns (push notifications, biometrics, background services). Telegram Bot + Push Relay already handle mobile Owner approval | Continue using Telegram Bot and Wallet Apps (via Push Relay) for mobile Owner interactions |
| A7 | P2P networking / direct wallet-to-wallet | Out of scope for a daemon management wrapper. This is a different product category | Stay focused: Desktop = GUI wrapper for the daemon's existing REST API |
| A8 | Browser extension | Different distribution channel, different security model, different codebase. Don't conflate | Desktop app talks to localhost daemon. Browser extension would require a separate project |

---

## Feature Dependencies

```
T10 (Desktop detection) ---|
                           |--> T4 (Admin WebView load)
T3 (Dynamic port)---------|
                           |--> T1 (Sidecar lifecycle)

T1 (Sidecar lifecycle) --> T2 (System tray)
T1 (Sidecar lifecycle) --> T8 (IPC bridge)
T8 (IPC bridge) ---------> D3 (Sidecar status card)
T8 (IPC bridge) ---------> D5 (Log viewer)

T5 (Setup Wizard) depends on:
  - T4 (Admin WebView) -- renders inside WebView
  - T8 (IPC bridge) -- detects first-run state
  - D1 (WalletConnect) -- step 4 Owner connection (optional, skippable)

D1 (WalletConnect) depends on:
  - Phase 0 spike result (Go/No-Go)
  - T10 (Desktop detection) -- only shown in Desktop

T6 (Auto-update) depends on:
  - T7 (Cross-platform distribution) -- needs CI pipeline first
  - Tauri updater signing keys generated

T7 (Distribution) depends on:
  - T1 (Sidecar) -- binary must be built
  - macOS Developer ID certificate
```

---

## MVP Recommendation

### Must Have (Phase 1-2, ship as "Desktop App v0.1.0")

1. **T1** Sidecar lifecycle -- the core value proposition
2. **T2** System tray -- minimum viable daemon management UX
3. **T3** Dynamic port -- prevents user-facing port conflicts
4. **T4** Admin WebView load -- access all existing features
5. **T8** IPC bridge -- enables all Desktop-specific features
6. **T9** Orphan process cleanup -- prevents port leaks
7. **T10** Desktop detection -- gates Desktop-only code paths

### Should Have (Phase 3, "v0.2.0")

8. **T5** Setup Wizard -- critical for non-technical users
9. **D1** WalletConnect QR -- high-value differentiator (contingent on Phase 0 spike)
10. **D3** Sidecar status card -- low-cost, visible improvement

### Must Have for Public Distribution (Phase 4)

11. **T6** Auto-update -- security requirement for any desktop app managing crypto
12. **T7** Cross-platform CI + code signing -- macOS notarization is mandatory

### Defer to Post-v33.2

13. **D2** Native OS notifications -- nice-to-have, Telegram already covers alerts
14. **D4** Launch at system startup -- low priority, manual launch is acceptable initially
15. **D5** Log viewer -- debugging aid, not essential for v1
16. **D6** Universal macOS binary -- can start with separate arm64/x64, merge later

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Risk | Complexity | Priority |
|---------|-----------|-------------------|------------|----------|
| T1 Sidecar lifecycle | Critical | Med (SEA cross-compile) | Med | P0 |
| T2 System tray | High | Low | Low | P0 |
| T3 Dynamic port | High | Low (designed) | Med | P0 |
| T4 Admin WebView | Critical | Low (reuse) | Low | P0 |
| T5 Setup Wizard | High | Low | Med | P1 |
| T6 Auto-update | Critical | Med (signing keys) | Med | P1 |
| T7 Distribution CI | Critical | High (code signing) | High | P1 |
| T8 IPC bridge | High | Low | Med | P0 |
| T9 Orphan cleanup | High | Med | Med | P0 |
| T10 Desktop detection | High | Low | Low | P0 |
| D1 WalletConnect | Med-High | **High** (WebView compat) | High | P1 (spike first) |
| D2 Native notifications | Med | Low | Low | P2 |
| D3 Status card | Med | Low | Low | P1 |
| D4 Auto-start | Low | Low | Low | P2 |
| D5 Log viewer | Low | Med | Med | P2 |
| D6 Universal binary | Low | Low | Low | P2 |

---

## Competitor Analysis: Desktop Daemon Wrappers

| Feature | IPFS Desktop | Docker Desktop | Ledger Live | WAIaaS Desktop (planned) |
|---------|-------------|---------------|-------------|-------------------------|
| Framework | Electron | Electron | Electron | Tauri 2 (Rust) |
| Daemon management | Yes (Kubo) | Yes (Docker Engine) | N/A (direct USB) | Yes (Node.js SEA sidecar) |
| System tray | Yes (menubar) | Yes (whale icon) | No | Yes (3-color status) |
| Setup wizard | Auto-config | Yes (4 steps) | Yes (3 steps) | Yes (5 steps) |
| Auto-update | Yes (electron-updater) | Yes | Yes | Yes (Tauri updater) |
| WalletConnect | N/A | N/A | Yes (built-in) | Yes (Desktop-only) |
| Code signing | Yes (notarized) | Yes (notarized) | Yes (notarized) | Planned (macOS + optional Win) |
| Bundle size | ~120MB | ~600MB | ~200MB | ~15-30MB (Tauri advantage) |
| Web UI reuse | Yes (IPFS Web UI) | No (custom UI) | No (custom UI) | Yes (Admin Web UI) |

**Key insight from IPFS Desktop:** Reusing an existing web UI (IPFS Web UI) inside a desktop wrapper is a proven, production-validated pattern. IPFS Desktop bundles the web UI as a separate dependency and loads it in Electron. WAIaaS does the same via WebView loading localhost, which is architecturally cleaner (single source of truth for UI code).

---

## Sources

- [Tauri 2 Node.js Sidecar Guide](https://v2.tauri.app/learn/sidecar-nodejs/) -- HIGH confidence (official docs)
- [Tauri 2 Embedding External Binaries](https://v2.tauri.app/develop/sidecar/) -- HIGH confidence (official docs)
- [Tauri 2 Updater Plugin](https://v2.tauri.app/plugin/updater/) -- HIGH confidence (official docs)
- [Tauri 2 System Tray](https://v2.tauri.app/learn/system-tray/) -- HIGH confidence (official docs)
- [Tauri 2 macOS Code Signing](https://v2.tauri.app/distribute/sign/macos/) -- HIGH confidence (official docs)
- [Tauri 2 GitHub Pipelines](https://v2.tauri.app/distribute/pipelines/github/) -- HIGH confidence (official docs)
- [tauri-action GitHub Repository](https://github.com/tauri-apps/tauri-action) -- HIGH confidence (official)
- [IPFS Desktop](https://github.com/ipfs/ipfs-desktop) -- HIGH confidence (comparable product, 5.8k stars)
- [Sidecar Lifecycle Management Plugin Request](https://github.com/tauri-apps/plugins-workspace/issues/3062) -- MEDIUM confidence (community request, not shipped)
- [Ship Tauri v2: Code Signing](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-code-signing-for-macos-and-windows-part-12-3o9n) -- MEDIUM confidence (community guide)
- [Ship Tauri v2: GitHub Actions](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-github-actions-and-release-automation-part-22-2ef7) -- MEDIUM confidence (community guide)
- [Evil Martians: Tauri + Sidecar](https://evilmartians.com/chronicles/making-desktop-apps-with-revved-up-potential-rust-tauri-sidecar) -- MEDIUM confidence (production experience)
- [Reown AppKit Overview](https://reown.com/blog/walletconnect-modal-vs-web3modal-differences-for-d) -- MEDIUM confidence (official Reown blog, but no Tauri-specific info)
- [Wizard UI Pattern Guide](https://www.eleken.co/blog-posts/wizard-ui-pattern-explained) -- MEDIUM confidence (UX patterns)
- [Tauri Updater GitHub Discussion](https://github.com/orgs/tauri-apps/discussions/10206) -- MEDIUM confidence (community discussion)
