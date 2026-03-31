# Feature Landscape: Tauri 2 Desktop App

**Domain:** Desktop App for WAIaaS daemon management
**Researched:** 2026-03-31

## Table Stakes

Features users expect from a desktop daemon manager. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| One-click launch (daemon auto-start) | Desktop app that doesn't start its service is useless | Med | Sidecar Manager spawn on setup() |
| System tray with status | Users expect background daemon to show in tray | Low | 3-color icon + context menu |
| Graceful quit (tray menu) | Must cleanly stop daemon before exit | Low | SIGTERM -> 5s -> SIGKILL |
| Admin UI in desktop window | Core reason for the app | Med | WebView loads existing Admin UI |
| First-run setup wizard | New users need guided onboarding | Med | 5 steps: password, chain, wallet, owner, done |
| Crash recovery | Daemon crash should auto-restart, not leave app broken | Med | SidecarManager state machine with retry |
| Cross-platform (macOS/Windows/Linux) | Desktop app must work on user's OS | High | Tauri handles this, but SEA binaries per platform |

## Differentiators

Features that set the desktop app apart from browser-only admin.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| WalletConnect QR pairing | Desktop-only Owner registration via mobile wallet scan | High | @reown/appkit in WebView, Phase 0 spike needed |
| Auto-update | App updates itself without user re-downloading | Low | Tauri built-in updater plugin |
| OS native notifications | System-level alerts for tx approvals, warnings | Low | tauri-plugin-notification |
| Sidecar status dashboard card | Visual daemon health in Admin UI | Low | IPC-based, not HTTP-based |
| Dynamic port (no config needed) | Zero-config daemon startup | Med | bind(0) + stdout port protocol |

## Anti-Features

Features to explicitly NOT build in the desktop app.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Separate UI from Admin Web UI | Duplicates 6+ pages, doubles maintenance | Reuse Admin Web UI via WebView |
| Embedded database viewer | Admin UI already has full data management | Use existing Admin UI pages |
| Custom window chrome / frameless | OS-native title bar is more reliable, less work | Use default Tauri window decoration |
| Multi-daemon management | Overcomplicates UX for rare use case | One daemon per app instance |
| Auto-start on OS login | Intrusive, daemon should be explicitly started | Provide docs for OS-native autostart if wanted |
| Bundled RPC node | Massively increases bundle size, out of scope | User provides RPC endpoint in setup |

## Feature Dependencies

```
Sidecar Manager -> Dynamic Port -> WebView Navigate (sequential, Phase 1)
IPC Commands -> Sidecar Manager (Phase 2 depends on Phase 1)
System Tray -> IPC Commands (tray actions invoke IPC)
Setup Wizard -> Admin Web UI loaded + isDesktop() (Phase 3 depends on Phase 2)
WalletConnect -> Phase 0 spike result (determines Plan A vs Plan B)
Auto-update -> GitHub Releases CI (Phase 4 depends on Phase 1-3)
Desktop Status Card -> IPC get_sidecar_status (Phase 3 depends on Phase 2)
```

## MVP Recommendation

Prioritize (Phase 1-2):
1. Sidecar Manager + dynamic port (core value: daemon management)
2. System tray + IPC bridge (core value: background daemon control)
3. Splash -> navigate (core value: zero-config startup)

Defer:
- WalletConnect: High risk (WebView compat), needs spike first. Not blocking for MVP.
- Auto-update: Nice-to-have, can ship first version without it.
- Setup Wizard: Can use existing Admin UI for initial setup. Wizard is UX polish.

## Sources

- [m33-02 objective doc](internal/objectives/m33-02-desktop-app.md) -- project requirements
- [Tauri 2 features overview](https://v2.tauri.app/) -- capability reference
