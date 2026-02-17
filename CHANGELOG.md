# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- User-facing documentation: README, CONTRIBUTING, deployment guide, API reference
- OpenAPI spec validation in CI (swagger-parser)
- Security test suite verification (460 tests)
- Coverage gate for CI pipeline
- Platform compatibility tests (macOS + Linux)

---

## [1.8.0] - 2026-02-17

Upgrade infrastructure and release automation.

### Added
- `waiaas upgrade` CLI command with 7-step upgrade process (backup, download, migrate, restart)
- `BackupService` for automatic pre-upgrade backups with restore support
- `VersionCheckService` with npm registry polling (24h cache)
- Compatibility matrix enforcement (schema version, Node.js version, breaking changes)
- release-please 2-gate release model (Release PR merge + deploy approval)
- GitHub Actions CI/CD: lint, typecheck, test, coverage, build, Docker publish
- GHCR 3-tier Docker image tagging (latest, semver, sha)

### Changed
- Deprecated `tag-release.sh` in favor of release-please automation
- Conventional Commits enforced for automated changelog generation

## [1.7.0] - 2026-02-17

Quality hardening and CI/CD pipeline.

### Added
- Coverage gate script with per-package threshold enforcement
- Security test suite (460 tests covering auth, policy, crypto, injection)
- Platform compatibility tests for macOS and Linux
- OpenAPI schema validation (swagger-parser, CI stage2)
- ESLint + Prettier configuration with strict rules
- Turborepo pipeline optimization (build, test, lint parallel)
- Pre-commit hooks via Husky (lint-staged)

### Fixed
- EVM Sepolia test `getAssets()` signature and `AssetInfo.mint` field name
- bash 3.x compatibility in coverage-gate.sh (parallel arrays instead of associative)

## [1.6.1] - 2026-02-16

WalletConnect v2 owner approval channel.

### Added
- WalletConnect v2 QR pairing and session management
- WC signing bridge for owner approval via external wallet (MetaMask, Phantom)
- Dual WC route sets: masterAuth (`/v1/wallets/:id/wc/*`) and sessionAuth (`/v1/wallet/wc/*`)
- Pairing status polling endpoint for UI integration
- Telegram fallback when WC session unavailable
- 3-channel owner approval priority: WalletConnect > Telegram > REST

### Changed
- Owner approval flow now supports WalletConnect as primary signing channel

## [1.6.0] - 2026-02-16

Operational infrastructure and balance monitoring.

### Added
- Kill Switch 3-state machine (ACTIVE/SUSPENDED/LOCKED) with CAS ACID transitions
- 6-step cascade on kill switch activation (sessions, pending tx, keystore, notifications)
- Dual-auth recovery (masterAuth + ownerAuth required to deactivate)
- AutoStop engine with 4 rules (consecutive failures, anomalous hours, threshold proximity, velocity)
- BalanceMonitor service (5-minute polling cycle, low balance alerts)
- Telegram Bot with long polling (10 commands, 2-tier auth, i18n en/ko)
- 4 notification channels: Telegram, Discord, ntfy, Slack
- EventBus `wallet:activity` events for real-time monitoring
- Docker deployment: multi-stage Dockerfile, docker-compose, non-root user, Watchtower labels
- `display_currency` support with forex rate service (43 fiat currencies via CoinGecko)

### Security
- Kill switch prevents all operations when active (middleware guard)
- Rate limiting: global IP RPM, per-session RPM, transaction RPM

## [1.5.3] - 2026-02-16

USD policy evaluation enhancements.

### Added
- Cumulative USD spending limits (daily/monthly rolling windows)
- APPROVAL tier escalation at cumulative threshold
- 80% cumulative spend warning notifications
- `CUMULATIVE_SPENDING_LIMIT` and `DISPLAY_CURRENCY` policy types

### Changed
- Spending limit evaluation now considers cumulative USD spend alongside per-transaction limits

## [1.5.2] - 2026-02-16

Admin UI policy form UX improvements.

### Added
- 12 PolicyType-specific forms with tailored input fields
- PolicyRulesSummary visualization component
- Edit modal with pre-fill from existing policy rules
- Form validation with inline error messages

## [1.5.1] - 2026-02-15

x402 protocol client support.

### Added
- `POST /v1/x402/fetch` endpoint for x402 auto-payment flow
- SSRF guard with IP validation and redirect following
- `X402_ALLOWED_DOMAINS` policy type (default deny)
- x402 payment signing: EIP-3009 (EVM) and TransferChecked (Solana)
- USD amount resolution via price oracle for policy evaluation
- DELAY/APPROVAL tier handling for high-value x402 payments
- 8 x402-specific error codes

## [1.5.0] - 2026-02-15

DeFi price oracle and Action Provider framework.

### Added
- `IPriceOracle` interface with CoinGecko and Pyth Network implementations
- Price oracle cross-validation (2-source agreement within threshold)
- USD-based policy evaluation (token-agnostic spending limits)
- Action Provider plugin architecture (ESM dynamic loading)
- Jupiter Swap action provider for Solana DeFi
- `POST /v1/actions/:provider/:action` endpoint
- `GET /v1/actions/providers` endpoint
- API key management for action providers (`/v1/admin/api-keys`)
- Oracle status admin endpoint (`/v1/admin/oracle-status`)

## [1.4.8] - 2026-02-15

Admin DX and notification improvements.

### Added
- Admin Settings API (`GET/PUT /v1/admin/settings`) for runtime configuration
- Forex rates admin endpoint (`/v1/admin/forex/rates`)
- Telegram user management endpoints (list, update role, delete)
- Notification log pagination and filtering

### Changed
- Settings hot-reload without daemon restart for non-infrastructure values

## [1.4.7] - 2026-02-15

Arbitrary transaction signing API.

### Added
- `POST /v1/transactions/sign` endpoint for external unsigned transaction signing
- Sign-only pipeline (parse, policy evaluate, sign -- no broadcast)
- EVM raw transaction parsing and chain ID validation
- Solana versioned transaction parsing and signer verification
- Nonce route (`GET /v1/nonce`) for ownerAuth signature construction

## [1.4.6] - 2026-02-14

Multi-chain wallet model implementation.

### Added
- `EnvironmentType` SSoT (testnet/mainnet) as wallet property
- `resolveNetwork()` 3-stage priority (request > wallet default > environment default)
- Per-wallet default network with `PUT /v1/wallets/:id/default-network`
- Multi-network balance/assets queries (`?network=all`)
- DB migration v12-v14 (environment column, default_network, network constraints)

### Changed
- Wallet creation uses `environment` instead of `network` parameter
- Network is resolved dynamically rather than stored as fixed wallet property

## [1.4.5] - 2026-02-14

Multi-chain wallet model design.

### Added
- Design documents 68-72 (environment/network model, DB migration strategy, pipeline resolver, policy engine extension, API interface DX)

## [1.4.4] - 2026-02-14

Admin settings, MCP 5-type support, and skill files.

### Added
- SettingsService for runtime configuration override (hot-reload)
- MCP tools updated for 5-type transaction model
- 7 API skill files served at `GET /v1/skills/:name`
- `DISPLAY_CURRENCY` policy type for per-wallet currency preference

## [1.4.3] - 2026-02-13

EVM token registry, MCP/Admin DX, and bug fixes.

### Added
- Token registry service (builtin + custom tokens per network)
- `GET/POST/DELETE /v1/tokens` endpoints
- EVM adapter `setAllowedTokens()` for ERC-20 balance queries

### Fixed
- MCP token provisioning one-click flow (BUG-013)
- Admin UI session list display issues
- Various type safety improvements

## [1.4.2] - 2026-02-13

Terminology migration from "agent" to "wallet".

### Changed
- All API endpoints, database columns, SDK methods, and documentation updated: agent -> wallet
- DB migration v10-v11 (rename `agents` table to `wallets`, update foreign keys)

## [1.4.1] - 2026-02-12

EVM wallet infrastructure and Owner Auth via SIWE.

### Added
- EVM adapter (`viem 2.x`) with full IChainAdapter implementation
- ERC-20 token support (transfer, balance, approve, getAssets)
- SIWE (Sign-In with Ethereum) for ownerAuth on EVM wallets
- 5-type discriminatedUnion transaction model (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH)
- OpenAPI schema registration for all 5 transaction request types

## [1.4.0] - 2026-02-12

Token transfers, contract calls, and batch transactions.

### Added
- SPL token transfer support (Token + Token-2022 programs)
- `CONTRACT_CALL` transaction type with ABI encoding
- `APPROVE` transaction type for token allowance management
- `BATCH` transaction type (up to 20 instructions per tx)
- `ALLOWED_TOKENS` policy type (default deny)
- `CONTRACT_WHITELIST` policy type with method selector filtering
- `APPROVED_SPENDERS` policy type with amount limits
- `sweepAll()` adapter method for owner withdrawal
- `POST /v1/wallets/:id/withdraw` endpoint

### Security
- Default deny for tokens, contracts, and spenders (opt-in whitelists)
- Unlimited approve blocking by default

## [1.3.4] - 2026-02-12

Notification event triggers and Admin notification panel.

### Added
- 8 notification event types (TX_SENT, TX_CONFIRMED, TX_FAILED, APPROVAL_REQUIRED, KILL_SWITCH, SESSION_CREATED, OWNER_SET, LOW_BALANCE)
- Notification log database table with query API
- Admin notification panel (channel status, test send, log viewer)

## [1.3.3] - 2026-02-11

MCP multi-agent support.

### Added
- Per-wallet MCP token isolation
- `POST /v1/mcp/tokens` for MCP session provisioning
- Claude Desktop config snippet generation

## [1.3.2] - 2026-02-11

Admin Web UI implementation.

### Added
- Admin Web UI (Preact 10.x + @preact/signals + Vite 6.x)
- 6 pages: Dashboard, Wallets, Sessions, Policies, Notifications, Settings
- CSP headers (default-src 'none', strict policy)
- masterAuth login with session timeout

## [1.3.0] - 2026-02-11

SDK, MCP server, and notification system.

### Added
- TypeScript SDK (`@waiaas/sdk`) with zero external dependencies
- Python SDK (`waiaas`) with httpx + Pydantic v2
- MCP server with 6 tools + 3 resources (stdio transport)
- `waiaas mcp setup` CLI command for Claude Desktop auto-configuration
- Notification system with Telegram, Discord, and ntfy channels
- Session renewal with 5 safety checks (CAS, absolute lifetime, 50% TTL elapsed)

## [1.2.0] - 2026-02-10

Authentication and policy engine.

### Added
- masterAuth middleware (Argon2id password verification)
- sessionAuth middleware (JWT HS256 with token hash CAS)
- ownerAuth middleware (SIWS Ed25519 signature verification)
- 4-tier policy engine (INSTANT/NOTIFY/DELAY/APPROVAL)
- `SPENDING_LIMIT` and `WHITELIST` policy types
- Policy CRUD API (`/v1/policies`)
- Session CRUD API (`/v1/sessions`) with JWT issuance
- 6-stage transaction pipeline (validate, auth, policy, wait, execute, confirm)
- Delay queue for DELAY tier (configurable wait with cancellation)
- Approval workflow for APPROVAL tier (owner signature required)

### Security
- Argon2id KDF (64MiB memory, 3 iterations) for master password
- JWT token hash stored in DB (never raw token)
- Rate limiting middleware (global IP, per-session, per-transaction)

## [1.1.0] - 2026-02-10

Core infrastructure and basic SOL transfer.

### Added
- Monorepo structure (7 packages: core, daemon, adapter-solana, cli, sdk, mcp, admin)
- SQLite database with Drizzle ORM (WAL mode, UUID v7, 7 PRAGMA settings)
- Encrypted keystore (AES-256-GCM, sodium guarded memory)
- Hono OpenAPIHono HTTP server with middleware stack
- `IChainAdapter` interface (10 methods) with Solana implementation
- Native SOL transfer (build, simulate, sign, submit, confirm)
- CLI: `waiaas init`, `waiaas start`, `waiaas stop`, `waiaas status`
- config.toml parser with environment variable override (`WAIAAS_{SECTION}_{KEY}`)
- Daemon lifecycle: 6-stage startup, 10-step shutdown, PID file, flock locking
- `GET /health` endpoint with version info

[Unreleased]: https://github.com/minho-yoo/waiaas/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/minho-yoo/waiaas/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/minho-yoo/waiaas/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/minho-yoo/waiaas/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/minho-yoo/waiaas/compare/v1.5.3...v1.6.0
[1.5.3]: https://github.com/minho-yoo/waiaas/compare/v1.5.2...v1.5.3
[1.5.2]: https://github.com/minho-yoo/waiaas/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/minho-yoo/waiaas/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/minho-yoo/waiaas/compare/v1.4.8...v1.5.0
[1.4.8]: https://github.com/minho-yoo/waiaas/compare/v1.4.7...v1.4.8
[1.4.7]: https://github.com/minho-yoo/waiaas/compare/v1.4.6...v1.4.7
[1.4.6]: https://github.com/minho-yoo/waiaas/compare/v1.4.5...v1.4.6
[1.4.5]: https://github.com/minho-yoo/waiaas/compare/v1.4.4...v1.4.5
[1.4.4]: https://github.com/minho-yoo/waiaas/compare/v1.4.3...v1.4.4
[1.4.3]: https://github.com/minho-yoo/waiaas/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/minho-yoo/waiaas/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/minho-yoo/waiaas/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/minho-yoo/waiaas/compare/v1.3.4...v1.4.0
[1.3.4]: https://github.com/minho-yoo/waiaas/compare/v1.3.3...v1.3.4
[1.3.3]: https://github.com/minho-yoo/waiaas/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/minho-yoo/waiaas/compare/v1.3.0...v1.3.2
[1.3.0]: https://github.com/minho-yoo/waiaas/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/minho-yoo/waiaas/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/minho-yoo/waiaas/releases/tag/v1.1.0
