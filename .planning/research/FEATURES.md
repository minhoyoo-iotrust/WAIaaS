# Feature Landscape: Self-Hosted Secure Wallet Daemon (v0.2)

**Domain:** Self-hosted wallet daemon for AI agents with session-based auth, time-locks, and multi-channel notifications
**Researched:** 2026-02-05
**Overall Confidence:** MEDIUM-HIGH (WebSearch cross-verified with official docs and ecosystem analysis)
**Milestone:** v0.2 Self-Hosted Secure Wallet

---

## Overview

v0.2 shifts from v0.1's cloud WaaS research to a **self-hosted daemon** that runs locally under the owner's full control. The feature landscape is shaped by existing products in the space -- particularly Safe (Gnosis Safe) for time-lock/approval patterns, Frame.sh for desktop wallet daemon patterns, Rabby for approval UX, Bitcoin Core/Monero for daemon RPC auth patterns, and the broader ERC-4337/session key ecosystem for scoped permissions.

The critical distinction: this is **not** another browser wallet or cloud service. It is a **local daemon process** that an AI agent connects to via API, with a human owner maintaining oversight through sessions, time-locks, and notifications. This places it at the intersection of cryptocurrency daemon architecture (like `bitcoind`) and smart wallet permission systems (like Safe modules).

**Key design tension:** Maximizing agent autonomy within owner-defined safety boundaries, all without requiring on-chain smart contract dependencies (chain-agnostic by design).

---

## v0.1 Retained Concepts (Dependencies for v0.2 Features)

These v0.1 designs are **inputs** to v0.2 feature design, not features to re-implement:

| v0.1 Concept | v0.2 Dependency | How v0.2 Uses It |
|---|---|---|
| Dual Key (Owner + Agent) | Session auth, Owner approval | Owner key validates session creation; Agent key signs within session |
| IBlockchainAdapter | All transaction features | Chain-agnostic transaction submission |
| 4-level Escalation (ARCH-03) | Time-lock tiers | Maps directly to instant/notify/delay/approve tiers |
| Emergency Stop Triggers | Kill Switch | Multi-channel notification triggers emergency stop |
| Agent Lifecycle 5 stages | Session lifecycle | Session states map to CREATED->ACTIVE->SUSPENDED->TERMINATED |
| Budget Pool + Hub-and-Spoke | Session limits, per-tx limits | Session limits are the self-hosted equivalent of budget pools |

---

## Table Stakes (Must-Have Features)

Features that users absolutely expect from a self-hosted wallet daemon. Missing any of these makes the product incomplete or insecure.

### TS-1: Session Token System

**What:** Temporary, scoped authorization tokens that grant AI agents limited access to wallet operations for a defined period.

| Attribute | Value |
|---|---|
| Complexity | Medium |
| v0.1 Dependency | Dual Key architecture, Agent Lifecycle |
| Priority | CRITICAL -- Layer 1 security core |

**Expected Behavior (based on ecosystem research):**

Session keys are the dominant pattern for delegated wallet access in 2025-2026. Safe's ERC-7579 session key modules, MetaMask's Delegation Toolkit (ERC-7710), Argent's session key implementation, and thirdweb all converge on the same model:

1. **Issuance**: Owner signs a session configuration (expiry, limits, allowed ops) with their wallet. The daemon generates a session token bound to these constraints.
2. **Constraints**: Each session carries immutable constraints -- time expiry, cumulative spending limit, per-transaction limit, and an allowlist of permitted operations.
3. **Usage tracking**: Every API call deducts from session budgets. The daemon tracks cumulative usage in real-time.
4. **Expiry**: Tokens become invalid after the configured TTL (default: 24 hours). The daemon rejects all requests with expired tokens.
5. **Revocation**: Owner can instantly revoke any session. Revocation takes effect immediately -- no grace period.
6. **Multiple sessions**: Support concurrent sessions for different agents or purposes, each with independent limits.

**Real-world examples:**
- **Bitcoin Core cookie auth**: Auto-generated `.cookie` file at daemon start, deleted at exit. Read access controls RPC access. Simple but effective for single-process auth.
- **Monero wallet-rpc**: HTTP Digest auth with `--rpc-login` flag. Single wallet per RPC instance.
- **Safe session keys (ERC-7579)**: Time-bound, function-scoped, spending-limited delegations enforced at the smart contract level.
- **Argent sessions**: dApp generates session key, sends session request with expiry/allowed methods/spending limits; user signs in wallet; session remains active even when wallet is locked.

**WAIaaS adaptation**: Combine Bitcoin Core's daemon-local auth simplicity with Safe/Argent's rich constraint model. Sessions are enforced at the daemon level (not on-chain), keeping it chain-agnostic.

**Sub-features:**
- [ ] Session token generation (cryptographically random, SHA-256 hashed storage)
- [ ] Owner wallet signature-based session approval
- [ ] Session constraint enforcement (expiry, cumulative limit, per-tx limit, allowed ops)
- [ ] Real-time usage tracking per session
- [ ] Immediate session revocation
- [ ] Active session listing and monitoring
- [ ] Session renewal flow (new session, not extension)
- [ ] Grace period for token rotation (configurable, default: 0 -- immediate cutover)

---

### TS-2: Time-Lock + Approval Tiers

**What:** Multi-tier transaction processing that applies different levels of scrutiny based on transaction amount, with time delays and owner approval for high-value operations.

| Attribute | Value |
|---|---|
| Complexity | High |
| v0.1 Dependency | 4-level Escalation framework (ARCH-03) |
| Priority | CRITICAL -- Layer 2 security core |

**Expected Behavior (based on ecosystem research):**

The Zodiac Delay Modifier for Safe provides the canonical model for on-chain time-locks. Its three-step process (propose -> cooldown -> execute/expire) is the pattern to replicate at the daemon level:

1. **Tier classification**: Each transaction is classified into a tier based on configurable amount thresholds.
2. **Instant tier** (< threshold A): Execute immediately. No notification delay.
3. **Notify tier** (threshold A to B): Execute immediately, send notification to owner. Owner can review post-hoc.
4. **Delay tier** (threshold B to C): Queue transaction, notify owner, wait cooldown period. Owner can cancel during cooldown. Auto-execute after cooldown if not canceled.
5. **Approve tier** (> threshold C): Queue transaction, notify owner, require explicit owner signature to execute. Auto-cancel after timeout if no approval.

**Zodiac Delay Modifier specifics (verified via GitHub):**
- Default cooldown: 24 hours (configurable)
- Default expiration: 7 days (configurable, or 0 = valid forever)
- Transactions execute in order (FIFO queue)
- The Safe can skip/invalidate queued transactions by advancing the nonce
- Events emitted for monitoring queued, executed, and invalidated transactions

**Transaction queue management:**
- Pending transactions stored locally (SQLite)
- Each queued tx has: ID, amount, destination, created_at, cooldown_expires_at, approval_expires_at, status
- Status states: `pending_cooldown` -> `ready_to_execute` -> `executed` | `canceled` | `expired`
- Owner can cancel any pending transaction
- Expired transactions are auto-cleaned

**Sub-features:**
- [ ] Configurable tier thresholds (amount-based)
- [ ] Transaction queue (SQLite-backed, persistent across daemon restarts)
- [ ] Cooldown timer engine (accurate to seconds)
- [ ] Owner approval request flow (notification -> signature -> execute)
- [ ] Owner cancel/reject flow
- [ ] Auto-expiration for unapproved transactions (configurable timeout, default: 1 hour)
- [ ] Queue inspection API (list pending, filter by status)
- [ ] Batch operations (approve/reject multiple)

---

### TS-3: Multi-Channel Notification System

**What:** Real-time alerts to the wallet owner across multiple communication channels for transaction events, security alerts, and approval requests.

| Attribute | Value |
|---|---|
| Complexity | Medium |
| v0.1 Dependency | Emergency Stop Triggers |
| Priority | CRITICAL -- Layer 3 security core |

**Expected Behavior (based on ecosystem research):**

Multi-channel notification is standard in the crypto monitoring space. The architecture consistently follows a **pipeline pattern**: Event Source -> Conditional Logic -> Formatting -> Parallel Multi-Channel Dispatch.

**Channel options (by ecosystem adoption):**

| Channel | Self-Hosted Friendly | Latency | Use Case |
|---|---|---|---|
| **Telegram Bot** | Yes (Bot API is free, self-hosted bot) | < 1s | Primary alert channel, interactive approval |
| **Discord Webhook** | Yes (simple HTTP POST) | < 2s | Team/community monitoring |
| **ntfy.sh** | Yes (fully self-hostable, open source) | < 1s | Push notifications without Apple/Google dependency |
| **Email (SMTP)** | Yes (any SMTP server) | 5-30s | Audit trail, formal notifications |
| **Desktop notification** | Yes (Tauri native plugin) | < 1s | Desktop app only, requires app running |
| **Pushover** | No (SaaS, $5 one-time) | < 1s | Polished mobile push notifications |

**Recommended primary channels:**
1. **Telegram Bot** -- Most crypto users already use Telegram. Interactive: owner can approve/reject transactions directly in chat. Free, self-hosted bot code.
2. **ntfy.sh** -- Fully self-hostable push notification service. No vendor dependency. Apache2/GPLv2 licensed. Simple HTTP pub-sub model.
3. **Discord Webhook** -- One-line HTTP POST integration. Good for teams. No bot hosting needed.

**Notification types and urgency:**

| Event | Urgency | Channels | Action Required |
|---|---|---|---|
| Transaction executed (instant tier) | Info | Configured channels | No |
| Transaction executed (notify tier) | Normal | All channels | Review |
| Transaction queued (delay tier) | Important | All channels + push | Cancel window open |
| Transaction pending approval | Urgent | All channels + push + repeated | Must approve/reject |
| Session created | Normal | Primary channel | Review |
| Session near expiry (90%) | Warning | All channels | Consider renewal |
| Kill switch triggered | Critical | ALL channels, repeated | Immediate attention |
| Consecutive failures threshold | Critical | ALL channels | Investigate |
| Abnormal time activity | Warning | All channels + push | Review |

**Sub-features:**
- [ ] Channel adapter interface (pluggable architecture)
- [ ] Telegram Bot adapter (inline keyboard for approve/reject)
- [ ] Discord Webhook adapter
- [ ] ntfy.sh adapter (self-hosted push)
- [ ] Email/SMTP adapter
- [ ] Desktop native notification (Tauri plugin)
- [ ] Notification priority/urgency levels
- [ ] Rate limiting (prevent notification spam)
- [ ] Delivery confirmation tracking
- [ ] Fallback chain (if primary fails, try secondary)
- [ ] Channel health monitoring

---

### TS-4: Owner Wallet Connection

**What:** Mechanism for the wallet owner to connect their personal wallet (browser extension, mobile, or hardware) to sign session approvals, transaction approvals, and configuration changes.

| Attribute | Value |
|---|---|
| Complexity | High |
| v0.1 Dependency | Dual Key architecture |
| Priority | CRITICAL -- Owner authentication foundation |

**Expected Behavior (based on ecosystem research):**

Owner wallet connection for a self-hosted daemon differs fundamentally from dApp wallet connection. The daemon runs locally (not in a browser), so the standard "inject provider into webpage" flow does not apply. Instead, the daemon needs to **receive** signatures from the owner's wallet through an intermediary.

**Connection approaches (by feasibility for self-hosted daemon):**

| Approach | How It Works | Pros | Cons |
|---|---|---|---|
| **Desktop App (Tauri) + Wallet Adapter** | Tauri app embeds a WebView that connects to browser extension wallets via standard Wallet Adapter | Most familiar UX, works with Phantom/MetaMask/etc. | Requires desktop app running |
| **WalletConnect v2** | QR code or deep link connects mobile wallet to daemon; session persists across pairings | Works with any WC-compatible wallet, no browser needed | Requires relay server (default: WalletConnect Cloud), session management complexity |
| **Hardware Wallet Direct (USB/BLE)** | Daemon communicates directly with Ledger/Trezor via USB HID or Bluetooth | Most secure, no intermediary | Requires physical device, driver compatibility, complex integration |
| **CLI Signature** | Owner signs a message offline (e.g., with `solana` CLI) and pastes the signature | Zero dependency, works everywhere | Poor UX, error-prone |

**Recommended approach (opinionated):**

For v0.2, implement in order of priority:
1. **Desktop App + Solana Wallet Adapter** (primary) -- Most users have Phantom installed. The Tauri desktop app can host a React WebView with `@solana/wallet-adapter-react` that handles the full connection and signing flow. Wallet Standard-compatible wallets (Backpack, Solflare) are auto-detected.
2. **WalletConnect v2** (secondary) -- For mobile wallet users. The daemon generates a pairing URI, desktop app displays QR code, mobile wallet scans and approves.
3. **CLI signature paste** (fallback) -- For headless server deployments where no GUI is available.
4. **Hardware wallet direct** (future) -- Defer to post-v0.2 due to driver complexity.

**Signing flow (verified from Ledger/WalletConnect docs):**
1. Daemon generates a signing request (session approval, tx approval, config change)
2. Request is displayed in desktop app or sent via notification
3. Owner opens their connected wallet
4. Wallet shows transaction details for review
5. Owner confirms/signs on wallet (or hardware device)
6. Signature returned to daemon
7. Daemon verifies signature matches owner's registered public key
8. Action proceeds

**Sub-features:**
- [ ] Solana Wallet Adapter integration (Phantom, Backpack, Solflare auto-detect)
- [ ] WalletConnect v2 pairing and session management
- [ ] Owner public key registration and verification
- [ ] Signing request queue (daemon-side)
- [ ] Signature verification
- [ ] Connection state management and reconnection
- [ ] Multiple owner addresses support (for key rotation)
- [ ] CLI-based offline signing fallback

---

### TS-5: CLI Daemon Management

**What:** Command-line interface for initializing, configuring, starting, stopping, and monitoring the wallet daemon process.

| Attribute | Value |
|---|---|
| Complexity | Medium |
| v0.1 Dependency | None (new in v0.2) |
| Priority | HIGH -- Primary deployment interface |

**Expected Behavior (based on ecosystem research):**

Cryptocurrency daemons have well-established CLI patterns. Bitcoin Core (`bitcoind`), Monero (`monero-wallet-rpc`), and Frame.sh all inform the expected UX:

**Bitcoin Core patterns (verified):**
- `bitcoind` runs as a background daemon with `-daemon` flag
- Configuration via `bitcoin.conf` file (not just CLI flags)
- Auto-generated `.cookie` file for RPC authentication
- `bitcoin-cli` as a separate client for interacting with the running daemon
- Multi-wallet support via `/wallet/<name>` RPC endpoints
- Data directory at `~/.bitcoin/`

**PM2 patterns for Node.js daemons:**
- Central daemon process manages all child processes
- IPC for CLI-to-daemon communication
- Automatic restart on crash
- Log management and rotation
- `pm2 startup` generates systemd service for boot persistence
- Ecosystem config file for complex setups

**Expected CLI commands:**

```bash
# Initialization
waiaas init                          # Interactive setup wizard
waiaas init --non-interactive        # Headless setup with env vars

# Daemon lifecycle
waiaas start                         # Start daemon (foreground)
waiaas start --daemon                # Start as background process
waiaas stop                          # Graceful shutdown
waiaas restart                       # Restart daemon

# Status & monitoring
waiaas status                        # Daemon health, active sessions, pending txs
waiaas logs                          # Tail daemon logs
waiaas logs --follow                 # Stream logs

# Owner operations
waiaas link-owner --address <ADDR>   # Register owner wallet address
waiaas sessions                      # List active sessions
waiaas sessions revoke <ID>          # Revoke a session
waiaas pending                       # List pending transactions
waiaas approve <TX_ID>               # Approve pending transaction (CLI signing)
waiaas reject <TX_ID>                # Reject pending transaction
waiaas kill-switch                   # Emergency stop all operations

# Configuration
waiaas config                        # Show current config
waiaas config set <key> <value>      # Update config
waiaas config reset                  # Reset to defaults

# Diagnostics
waiaas health                        # Health check (RPC, chain connection, storage)
waiaas version                       # Show version
```

**Sub-features:**
- [ ] `waiaas init` interactive wizard (creates config, generates agent key, prompts for owner address)
- [ ] `waiaas start` with foreground and daemon modes
- [ ] `waiaas stop` with graceful shutdown (complete pending operations)
- [ ] `waiaas status` dashboard (uptime, sessions, pending txs, balance)
- [ ] `waiaas kill-switch` emergency stop
- [ ] Configuration file management (`~/.waiaas/config.toml` or `config.yaml`)
- [ ] PID file management for daemon mode
- [ ] Signal handling (SIGTERM for graceful shutdown, SIGINT for force stop)
- [ ] Log rotation and level configuration
- [ ] Health check endpoint (for Docker/Kubernetes)

---

### TS-6: REST API for Agent Access

**What:** HTTP API that AI agents use to interact with the daemon -- send transactions, check balances, manage sessions.

| Attribute | Value |
|---|---|
| Complexity | Medium |
| v0.1 Dependency | API design (OpenAPI spec from v0.1), Authentication model |
| Priority | HIGH -- Agent integration surface |

**Expected behavior:** This was extensively designed in v0.1 (deliverables 18-22). The v0.2 adaptation replaces cloud-hosted endpoints with local daemon endpoints. Session token replaces API key as the primary auth mechanism.

Key adaptation: v0.1's `wai_live_xxx` API keys become session tokens. The daemon validates session tokens locally (no external auth server). All endpoints run on `localhost:PORT` by default.

**Sub-features:**
- [ ] Session token authentication middleware
- [ ] Wallet endpoints (balance, address)
- [ ] Transaction endpoints (send, list, get, pending)
- [ ] Session management endpoints (create, list, revoke)
- [ ] Owner approval endpoints (approve, reject, kill-switch)
- [ ] OpenAPI 3.0 specification
- [ ] Rate limiting (per-session)
- [ ] CORS configuration (localhost by default, configurable)
- [ ] Health check endpoint

---

### TS-7: Encrypted Local Storage

**What:** All sensitive data (private keys, session tokens, configuration) encrypted at rest using the owner's passphrase.

| Attribute | Value |
|---|---|
| Complexity | Medium |
| v0.1 Dependency | ARCH-01 (libsodium sealed box + Argon2id) |
| Priority | HIGH -- Security foundation |

**Expected behavior:** Agent private key encrypted with AES-256-GCM, key derived from owner passphrase via Argon2id. SQLite database for transaction history, session records, and configuration. All stored under `~/.waiaas/data/`.

**Sub-features:**
- [ ] Agent key encryption (AES-256-GCM + Argon2id key derivation)
- [ ] SQLite database for operational data
- [ ] Encrypted backup/restore
- [ ] Data directory structure (`~/.waiaas/`)
- [ ] Key-in-memory only (never written to disk in plaintext)

---

## Differentiators (Competitive Advantage Features)

Features that set WAIaaS apart. Not expected, but significantly valued for the AI agent use case.

### D-1: MCP Server Integration

**What:** Model Context Protocol server that allows Claude, GPT, and other LLM-based agents to directly interact with the wallet through the standardized MCP tool interface.

| Attribute | Value |
|---|---|
| Complexity | Medium |
| v0.1 Dependency | MCP spec (API-06) |
| Priority | HIGH -- Core AI agent integration |

**Why this differentiates:**
MCP has become the de facto standard for AI agent-tool integration as of 2025-2026, with 97M+ monthly SDK downloads and adoption by Anthropic, OpenAI, Google, and Microsoft. Having a native MCP server means any MCP-compatible AI framework can use the wallet without custom integration code.

**Expected behavior (from v0.1 design + MCP ecosystem research):**

The v0.1 MCP design (API-06) is directly applicable. For v0.2, the MCP server runs as part of the daemon process (not a separate service), connecting via stdio for local use or SSE for remote.

Key adaptation for v0.2:
- MCP server authenticates using the same session token system (not separate API keys)
- Tools are limited to agent operations (execute_transaction, get_balance, etc.)
- Owner management tools (suspend, resume) available only with owner-level auth
- Resources expose real-time wallet state (balance, policy, status)

**Unique differentiator:** Most crypto MCP integrations (SkyAI, Dark Eclipse) are SaaS. A **self-hosted** MCP wallet server running locally gives the user full custody and privacy.

**Sub-features:**
- [ ] MCP Server package (`@waiaas/mcp`)
- [ ] stdio transport (Claude Desktop integration)
- [ ] SSE transport (remote agents)
- [ ] 7-9 core tools (from API-06 design)
- [ ] 4 resources (balance, policy, status, recent transactions)
- [ ] Session token auth in MCP context
- [ ] Error handling with LLM-friendly suggestions

---

### D-2: Interactive Telegram Approval Bot

**What:** Telegram bot that not only sends notifications but allows the owner to approve/reject transactions and manage sessions directly from Telegram using inline keyboards.

| Attribute | Value |
|---|---|
| Complexity | Medium-High |
| v0.1 Dependency | Notification system (TS-3), Approval flow (TS-2) |
| Priority | MEDIUM -- Major UX improvement |

**Why this differentiates:**
Most wallet notification systems are one-way (send alert). An interactive bot that allows approve/reject directly in Telegram eliminates the need to open a desktop app for routine approvals. This is especially valuable for owners managing agents remotely.

**Expected behavior:**
1. Agent submits high-value transaction
2. Daemon queues transaction, sends Telegram message with inline keyboard buttons: [Approve] [Reject] [Details]
3. Owner taps [Approve] in Telegram
4. Bot verifies owner identity (Telegram user ID pre-registered)
5. For high-value: bot requests additional confirmation ("Type CONFIRM to approve 5 SOL transfer")
6. Transaction executes

**Security consideration:** Telegram approval must be treated as a secondary factor, not a replacement for wallet signature. For the "approve" tier (highest), wallet signature should still be required. Telegram approval is appropriate for the "delay" tier.

**Sub-features:**
- [ ] Telegram Bot setup wizard (BotFather token configuration)
- [ ] Owner Telegram ID registration and verification
- [ ] Inline keyboard for approve/reject
- [ ] Transaction detail display in chat
- [ ] Session management commands (/sessions, /revoke)
- [ ] Kill switch command (/killswitch with confirmation)
- [ ] Status command (/status -- balance, active sessions, pending txs)

---

### D-3: Desktop App with System Tray

**What:** Tauri-based desktop application that provides a GUI for owner operations, displays real-time daemon status, and lives in the system tray for persistent monitoring.

| Attribute | Value |
|---|---|
| Complexity | High |
| v0.1 Dependency | None (new in v0.2) |
| Priority | MEDIUM -- Non-developer accessibility |

**Why this differentiates:**
Frame.sh proves the value of a system-wide desktop wallet. For WAIaaS, the desktop app serves as the primary owner interface -- session approval, transaction monitoring, and wallet connection all happen here.

**Tauri vs Electron (verified, 2025 data):**
- Tauri apps: < 10 MB, ~30-40 MB RAM idle
- Electron apps: > 100 MB, hundreds of MB RAM
- Tauri 2.0: Native system tray, notification plugin, auto-update, single instance enforcement
- Recommendation: **Tauri** for its security model (narrow OS boundary, Rust backend) and resource efficiency

**Expected behavior (from Tauri docs + Frame.sh + Rabby UX patterns):**

**System tray features:**
- Tray icon with status indicator (green = running, yellow = pending approval, red = stopped/error)
- Quick menu: Open dashboard, Kill switch, Quit
- Native OS notifications for transaction events

**Dashboard screens (from Rabby UX patterns):**
- **Overview**: Balance, today's transactions, active sessions, daemon uptime
- **Pending Approvals**: List of transactions awaiting approval with [Approve] [Reject] buttons. Balance change preview (Rabby pattern).
- **Transaction History**: Filterable, searchable, with blockchain explorer links
- **Sessions**: Active sessions with usage bars, [Revoke] buttons
- **Settings**: Notification channels, tier thresholds, owner wallet connection
- **Wallet Connection**: Connect Phantom/Ledger for signing approvals

**Rabby-inspired UX patterns:**
- **Balance change preview**: Show what will change before approving
- **Transaction simulation**: Preview effect before execution
- **Risk scanning**: Flag suspicious destinations
- **Whitelist feature**: Extra confirmation for non-whitelisted addresses

**Sub-features:**
- [ ] Tauri 2.0 app scaffold (React + Tailwind)
- [ ] System tray with status icon and quick menu
- [ ] Overview dashboard
- [ ] Pending approval screen with approve/reject
- [ ] Transaction history with filters
- [ ] Session management screen
- [ ] Settings and configuration
- [ ] Wallet connection integration (Wallet Adapter)
- [ ] Native OS notifications
- [ ] Auto-update mechanism
- [ ] macOS / Windows / Linux builds

---

### D-4: Docker Deployment

**What:** Docker image and docker-compose template for server deployment without native installation.

| Attribute | Value |
|---|---|
| Complexity | Low-Medium |
| v0.1 Dependency | None |
| Priority | MEDIUM -- Server deployment |

**Expected behavior:**
```yaml
services:
  waiaas:
    image: waiaas/daemon:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - WAIAAS_OWNER_ADDRESS=...
      - WAIAAS_PASSPHRASE=...
```

**Sub-features:**
- [ ] Dockerfile (Node.js Alpine base)
- [ ] docker-compose.yml template
- [ ] Volume mapping for persistent data
- [ ] Health check endpoint
- [ ] Environment variable configuration

---

### D-5: Auto-Stop Rules Engine

**What:** Configurable rules that automatically trigger emergency stop (kill switch) when suspicious patterns are detected.

| Attribute | Value |
|---|---|
| Complexity | Medium |
| v0.1 Dependency | Emergency Stop Triggers, Rule-based anomaly detection (ARCH-04) |
| Priority | MEDIUM -- Autonomous security |

**Expected behavior (from v0.1 design):**

| Rule | Default Threshold | Action |
|---|---|---|
| Consecutive transaction failures | 5 in 10 minutes | Suspend agent, notify owner |
| Abnormal time activity | Outside configured hours | Block transaction, notify owner |
| Session limit near exhaustion | 90% of session limit used | Warning notification |
| Rapid transaction rate | > 10 txs per minute | Throttle, then suspend if continues |
| Unusual destination | Non-whitelisted address | Escalate to approval tier |

**Sub-features:**
- [ ] Rule definition format (YAML/JSON config)
- [ ] Rule evaluation engine (event-driven)
- [ ] Automatic SUSPENDED state transition
- [ ] Owner notification on auto-stop
- [ ] Rule enable/disable toggles
- [ ] Custom rule creation (advanced users)

---

### D-6: SDK Libraries (TypeScript + Python)

**What:** Client libraries for programmatic daemon interaction, simplifying agent integration.

| Attribute | Value |
|---|---|
| Complexity | Medium |
| v0.1 Dependency | SDK Interface (API-05) |
| Priority | MEDIUM -- Developer experience |

**Sub-features:**
- [ ] TypeScript SDK (`@waiaas/sdk`) with full type definitions
- [ ] Python SDK (`waiaas`) for Python-based agents
- [ ] Auto-retry logic
- [ ] Session token management (auto-refresh prompts)
- [ ] Error type definitions

---

## Anti-Features (Deliberately NOT Building)

Features to explicitly avoid. Common mistakes in this domain.

### AF-1: On-Chain Smart Contract Dependencies

| Anti-Feature | Why Avoid | What to Do Instead |
|---|---|---|
| **Squads/Safe on-chain policy enforcement** | Violates chain-agnostic principle. Ties security to a single chain. Adds deployment complexity for self-hosted users. | Enforce all policies at the daemon level. The daemon is the trust boundary, not the blockchain. |
| **On-chain time-locks** | Zodiac Delay Modifier is elegant but requires Ethereum smart contracts. Not chain-agnostic. | Implement time-lock queue locally in SQLite. Same security model, works on any chain. |
| **On-chain session key delegation** | ERC-7579/ERC-7710 session keys require EVM smart accounts. Not available on Solana native. | Session tokens are daemon-issued and daemon-enforced. Chain-agnostic by design. |

**Rationale:** v0.2's core principle is chain-agnostic security. The daemon IS the security layer. On-chain mechanisms can be added as optional hardening in future milestones.

### AF-2: Cloud Service Dependencies

| Anti-Feature | Why Avoid | What to Do Instead |
|---|---|---|
| **WalletConnect Cloud relay as hard dependency** | Introduces vendor dependency for self-hosted tool | Support WalletConnect but also support direct wallet adapter and CLI signing. WC is optional, not required. |
| **SaaS notification providers as hard dependency** | ntfy.sh can be self-hosted. Pushover is SaaS. | Use ntfy.sh (self-hostable) as primary push channel. Telegram Bot API is free. |
| **Cloud database** | PostgreSQL/Redis require separate servers | SQLite for everything. Single file, zero config. |
| **External auth service** | OAuth servers, Auth0, etc. | All auth is local. Session tokens issued and validated by the daemon itself. |

### AF-3: Over-Engineered Security for MVP

| Anti-Feature | Why Avoid | What to Do Instead |
|---|---|---|
| **ML-based anomaly detection** | Requires training data, complex infrastructure, high false positive rates | Rule-based detection with configurable thresholds. Simple, predictable, debuggable. |
| **Multi-party computation (MPC) for signing** | Adds massive complexity, not needed for single-owner scenario | Single Agent Key, encrypted locally. Owner Key stays in owner's wallet. |
| **Hardware Security Module (HSM) integration** | Requires specialized hardware, over-kill for self-hosted | Software encryption (AES-256-GCM + Argon2id) is sufficient for self-hosted. |
| **Formal verification of policy engine** | Massive effort, diminishing returns for v0.2 | Comprehensive test suite with property-based testing. |

### AF-4: Premature Scaling Features

| Anti-Feature | Why Avoid | What to Do Instead |
|---|---|---|
| **Multi-chain support in v0.2** | Spreading thin. Solana first. | IBlockchainAdapter interface is ready (v0.1). Implement Solana adapter only. EVM adapter as v0.3. |
| **Multi-agent fleet management** | Single agent per daemon is simpler and more secure for v0.2 | Each agent gets its own daemon instance. Fleet management deferred. |
| **Kubernetes Helm charts** | Over-engineering for initial release | Docker Compose is sufficient. K8s for v0.3+. |
| **Mobile app** | Massive additional platform, Tauri desktop + Telegram bot cover mobile owner UX | Telegram bot for mobile owner interactions. Desktop app for full management. |

### AF-5: UX Anti-Patterns (from Rabby/Safe Research)

| Anti-Feature | Why Avoid | What to Do Instead |
|---|---|---|
| **Silent transaction execution without any logging** | No audit trail, impossible to debug issues | Log every transaction with full details. Immutable append-only log. |
| **Agent self-modifying permissions** | Prompt injection could escalate agent privileges | Only owner wallet signature can change policies, limits, or session parameters. |
| **Auto-increasing limits based on "trust score"** | Gameable by attacker building up small successful txs before large theft | Limits can only increase via explicit owner action. Never automatic. |
| **Raw hex data in approval screens** | Users cannot understand hex data, leads to blind signing | Decode and display human-readable transaction details (Rabby pattern). |

---

## Feature Dependencies

```
                    [Encrypted Local Storage (TS-7)]
                              |
                    [CLI Daemon Management (TS-5)]
                              |
                    [REST API (TS-6)]
                        /         \
                       /           \
    [Session Token System (TS-1)]   [Owner Wallet Connection (TS-4)]
              |                              |
              |                              |
    [Time-Lock + Approval (TS-2)] ----------+
              |                              |
              |                              |
    [Multi-Channel Notifications (TS-3)]     |
              |                              |
              +------+-----------+-----------+
                     |           |           |
              [MCP Server]  [Telegram   [Desktop App
               (D-1)         Bot (D-2)]   (D-3)]
                                    |
                            [Auto-Stop Rules
                              Engine (D-5)]
```

**Critical path:**
1. TS-7 (Storage) -> TS-5 (CLI) -> TS-6 (API) -- Foundation must exist first
2. TS-1 (Sessions) + TS-4 (Owner Wallet) -- Can be built in parallel, both feed into TS-2
3. TS-2 (Time-locks) -- Requires both sessions and owner wallet connection
4. TS-3 (Notifications) -- Depends on time-lock events to have something to notify about
5. D-1/D-2/D-3 -- Integration layers, can be built once core is stable

---

## MVP Recommendation

### Phase 1: Core Daemon

Build the foundation that everything depends on.

| Feature | Scope |
|---|---|
| TS-7: Encrypted Storage | Agent key encryption, SQLite, data directory |
| TS-5: CLI Daemon | `init`, `start`, `stop`, `status` commands |
| TS-6: REST API | Core endpoints, session auth middleware |
| TS-1: Session System | Token generation, constraints, expiry, revocation |

### Phase 2: Security Layers

Add the multi-tier security model.

| Feature | Scope |
|---|---|
| TS-4: Owner Wallet | Solana Wallet Adapter in Tauri app, CLI signing fallback |
| TS-2: Time-Lock + Approval | 4-tier system, transaction queue, cooldown timers |
| TS-3: Notifications | Telegram Bot (primary), ntfy.sh, Discord Webhook |

### Phase 3: Integration & Polish

AI agent integration and owner UX.

| Feature | Scope |
|---|---|
| D-1: MCP Server | stdio + SSE transports, core tools |
| D-2: Telegram Bot | Interactive approval (inline keyboards) |
| D-3: Desktop App | System tray, dashboard, approval flow |
| D-5: Auto-Stop Rules | Rule engine, configurable thresholds |

### Deferred to v0.3+:

| Feature | Reason |
|---|---|
| EVM Adapter | Solana-first. Interface is ready, implementation deferred. |
| Multi-agent fleet | Each agent gets own daemon in v0.2. Fleet management later. |
| D-6: SDK Libraries | REST API + MCP server are sufficient for v0.2 integration. |
| D-4: Docker | CLI installation is primary for v0.2. Docker for v0.3. |
| Hardware wallet direct connection | WalletConnect + browser extension cover most users. |
| Mobile app | Telegram bot covers mobile owner UX. |

---

## Comparison with Existing Products

| Feature | Safe (Gnosis) | Frame.sh | Rabby | Bitcoin Core | WAIaaS v0.2 |
|---|---|---|---|---|---|
| **Self-hosted** | No (on-chain) | Yes (desktop) | No (extension) | Yes (daemon) | Yes (daemon + desktop) |
| **Session keys** | Via ERC-7579 modules | No | No | Cookie auth | Daemon-level session tokens |
| **Time-lock** | Zodiac Delay Module | No | No | No | Local queue-based time-lock |
| **Multi-channel notify** | No (webhook only) | No | Browser alerts | No | Telegram + ntfy + Discord + Desktop |
| **AI agent integration** | No | No | No | No | MCP Server (native) |
| **Chain-agnostic** | EVM only | EVM only | EVM only | Bitcoin only | Yes (adapter pattern) |
| **Owner approval** | Multisig on-chain | Hardware wallet | In-extension | N/A | Wallet signature + Telegram + Desktop |
| **Transaction preview** | Yes | Yes | Yes (best in class) | No | Yes (Rabby-inspired) |

---

## Sources

### HIGH Confidence (Official Documentation)
- [Safe Docs: ERC-4337 Integration](https://docs.safe.global/advanced/erc-4337/4337-safe) -- Session key module architecture
- [Zodiac Delay Modifier (GitHub)](https://github.com/gnosisguild/zodiac-modifier-delay) -- Time-lock implementation details, cooldown/expiration defaults
- [Tauri 2.0 System Tray](https://v2.tauri.app/learn/system-tray/) -- Desktop tray implementation
- [Tauri Notification Plugin](https://v2.tauri.app/plugin/notification/) -- Native OS notifications
- [ntfy.sh](https://ntfy.sh/) -- Self-hosted push notification architecture
- [Solana Wallet Adapter (Cookbook)](https://solana.com/developers/cookbook/wallets/connect-wallet-react) -- Wallet connection patterns
- [PM2 Process Manager](https://pm2.keymetrics.io/) -- Node.js daemon management patterns
- [Bitcoin Core RPC Auth](https://markaicode.com/bitcoin-core-rpc-authentication-secure-api-access-2025/) -- Cookie-based daemon auth
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25) -- Protocol standard

### MEDIUM Confidence (WebSearch + Cross-Verification)
- [ERC-4337 Session Keys Documentation](https://docs.erc4337.io/smart-accounts/session-keys-and-delegation.html) -- Session key delegation patterns
- [MetaMask Delegation Toolkit](https://metamask.io/developer/delegation-toolkit) -- ERC-7710 delegation framework
- [Argent Session Keys Blog](https://www.ready.co/blog/session-keys-with-argent-technical) -- dApp-to-wallet session flow
- [thirdweb Session Keys Guide](https://blog.thirdweb.com/what-are-session-keys-the-complete-guide-to-building-invisible-blockchain-experiences-with-account-abstraction/) -- Complete session key patterns
- [Frame.sh (Official)](https://frame.sh/) -- Desktop wallet daemon patterns
- [WalletConnect Sign API Specs](https://specs.walletconnect.com/2.0/specs/clients/sign) -- v2 pairing/session protocol
- [Rabby Wallet Security](https://support.rabby.io/hc/en-us/articles/11495710873359-Is-Rabby-Wallet-safe) -- Transaction preview/approval UX
- [Zodiac Wiki](https://www.zodiac.wiki/documentation/delay-modifier) -- Delay modifier documentation
- [Web3 UX Design Handbook: Transaction Flows](https://web3ux.design/transaction-flows) -- Approval UX patterns
- [Pento: A Year of MCP](https://www.pento.ai/blog/a-year-of-mcp-2025-review) -- MCP ecosystem status 2025

### LOW Confidence (WebSearch Only, Needs Validation)
- Castle wallet tool -- Could not find a specific product called "Castle" for wallet security. Wallet Guard was sunset March 2025.
- Specific PM2 AGPL licensing implications for commercial use -- Needs legal review if PM2 is bundled.
