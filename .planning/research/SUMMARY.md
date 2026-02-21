# Project Research Summary

**Project:** WAIaaS v27.1 — Incoming Transaction Monitoring Implementation
**Domain:** Real-time blockchain incoming transaction monitoring for self-hosted wallet daemon
**Researched:** 2026-02-21
**Confidence:** HIGH

## Executive Summary

WAIaaS v27.1 implements the incoming transaction monitoring system fully specified in design doc 76 (~2,441 lines, 19 locked decisions). This is an implementation milestone, not a design milestone — the architecture is fully determined and the only remaining question is execution order. The recommended approach adds a parallel subsystem to the existing daemon without touching the outgoing TX pipeline (IChainAdapter, AdapterPool, 6-stage pipeline). The new subsystem introduces IChainSubscriber (a stateful counterpart to the stateless IChainAdapter), two chain-specific subscriber implementations, a memory queue with batch flush, and a central orchestration service. No new npm dependencies are required: @solana/kit ^6.0.1 already provides `createSolanaRpcSubscriptions` with `logsNotifications` AsyncIterables, and viem ^2.21.0 provides `watchEvent`/`getLogs`/`watchBlocks`.

The recommended implementation strategy is polling-first for EVM (HTTP `getLogs` for ERC-20, `getBlock(includeTransactions: true)` for native ETH) and WebSocket-first for Solana (`logsSubscribe` with per-wallet subscriptions sharing one WebSocket connection via SubscriptionMultiplexer). This asymmetry is intentional: EVM's 12-second block time makes polling economical and removes WebSocket dependency in self-hosted environments where WS RPC is often unavailable, while Solana's 400ms slot time makes polling impractical at scale. Resilience is achieved via a 3-state connection machine (WEBSOCKET -> POLLING -> DISABLED), exponential backoff reconnection with jitter, blind gap recovery using per-chain cursors in `incoming_tx_cursors` table, and a memory queue that decouples high-frequency WebSocket callbacks from SQLite writes via BackgroundWorkers.

The key risks are concentrated in the WebSocket lifecycle and data consistency layers. Six critical pitfalls (C-01 through C-06) have been identified that cause data loss or incorrect financial behavior: WebSocket listener leaks on reconnection, SQLite event loop starvation from large batch flushes, agents acting on unfinalized Solana `confirmed` transactions, duplicate events from concurrent gap recovery and polling, data loss from unflushed memory queues on shutdown, and EVM reorg producing false CONFIRMED status. All six have concrete prevention strategies mapped to specific implementation phases. The single most important non-obvious rule: queue-level dedup via `Map<txHash:walletId, tx>` is **mandatory**, not optional — the "optional optimization" label in design doc 76 section 2.4 is incorrect.

## Key Findings

### Recommended Stack

No new packages are needed. All required capabilities exist in the current dependency set. @solana/kit's `createSolanaRpcSubscriptions` exposes `logsNotifications` as an AsyncIterable — subscribe via `for await` loop, cancel via AbortController. viem's `watchEvent(poll: false)` uses `eth_subscribe("logs")` over WebSocket, while `getLogs` uses standard HTTP RPC — the polling-first design defaults to HTTP. SQLite writes use raw `better-sqlite3` prepared statements inside `sqlite.transaction()` for batch INSERT (50x faster than individual inserts), with Drizzle ORM reserved for read queries. The existing `BackgroundWorkers` timer scheduler handles all periodic tasks (flush, poll, confirm, retention) without modification. See STACK.md for full API surface details and code examples.

**Core technologies:**
- `@solana/kit ^6.0.1`: Solana WebSocket subscriptions via `createSolanaRpcSubscriptions` + `logsNotifications` AsyncIterable; TX parsing via `getTransaction(jsonParsed)`; polling fallback via `getSignaturesForAddress` — already installed, no additional WebSocket library needed
- `viem ^2.21.0`: EVM polling via `getLogs` + `getBlock(includeTransactions: true)`; optional WebSocket via `watchEvent(poll: false)`; viem issues #2325 and #2563 (WebSocket reconnect) both fixed in installed version ^2.21.0
- `better-sqlite3 ^12.6.0`: Batch INSERT with `sqlite.transaction()` + prepared statements for the hot write path; existing 7 PRAGMA configuration (WAL, synchronous=NORMAL, busy_timeout=5000) already optimal
- `drizzle-orm ^0.45.0`: Query builder for read paths (list, summary, admin queries); avoid for batch write path (Drizzle issue #2474: returning + onConflictDoNothing limitation)
- `BackgroundWorkers` (internal): Existing timer scheduler; handles overlap prevention via `running` Map and uses `unref()` timers; 6 new workers needed (flush/confirm/poll/retention)
- Node.js 22 native WebSocket: Used internally by @solana/kit; no `ws` package needed; NOTE: lacks `ws.ping()` — application-level heartbeat via `getSlot()` RPC call is required for Solana 10-minute inactivity timeout prevention

**What NOT to add:**
- `ws` npm package, `reconnecting-websocket`, `buffered-queue`, `bull`/`bullmq`, Helius/Alchemy webhook SDKs — all violate self-hosted principle or duplicate existing functionality

### Expected Features

Research (via design doc 76) identifies 12 table-stakes features and 13 differentiators. The implementation scope is fully bounded.

**Must have (table stakes):**
- Solana SOL native receive detection — core use case; `preBalances`/`postBalances` delta from `getTransaction(jsonParsed)`
- Solana SPL token + Token-2022 detection — `preTokenBalances`/`postTokenBalances` delta; same mechanism, no separate code
- EVM native ETH receive detection — `getBlock(includeTransactions: true)` + `tx.to === walletAddress && tx.value > 0n` filter
- EVM ERC-20 Transfer event detection — `getLogs` with indexed `to` parameter filter on Transfer topic
- 2-phase status (DETECTED -> CONFIRMED) — fast notification at detection, safe action threshold at confirmation
- Wallet-level opt-in toggle (`wallets.monitor_incoming` column) — RPC cost control; default OFF
- Global enable/disable gate (`incoming.enabled` config key) — operator-level control
- Incoming TX history REST API with cursor pagination — `GET /v1/wallet/incoming`
- DB migration v21 (3 DDL statements: 2 new tables + 1 ALTER TABLE) — foundation for all other features
- Notification events `INCOMING_TX_DETECTED` and `INCOMING_TX_SUSPICIOUS` (28 -> 30 event types)
- Config.toml `[incoming]` section with 7 keys — operator configuration surface
- SettingsService hot-reload for all 7 keys — no daemon restart required

**Should have (differentiators):**
- Suspicious deposit detection (3 rules: DustAttackRule, UnknownTokenRule, LargeAmountRule) — proactive security for AI agents
- WebSocket -> polling auto-fallback (3-state connection machine) — resilience for unreliable self-hosted RPC
- Blind gap recovery via `incoming_tx_cursors` table — zero TX loss during disconnections
- SubscriptionMultiplexer (shared WebSocket per chain:network) — N wallet subscriptions on 1 connection
- Dynamic subscription sync at runtime (`syncSubscriptions()`) — add/remove monitored wallets without restart
- Notification cooldown + batch aggregation — prevents notification storm on token spam/airdrops (50 dust TXs -> max 5 notifications)
- TypeScript SDK 2 methods + Python SDK 2 methods + MCP 2 new tools (21 -> 23 total) — AI agent programmatic access
- `GET /v1/wallet/incoming/summary` aggregation endpoint
- i18n message templates (en/ko) — bilingual notifications

**Defer (not in v27.1 scope per design doc 76):**
- Admin UI incoming TX list panel — agents use API directly; nice-to-have
- EVM WebSocket mode (`incoming_mode = 'websocket'`) — polling-first covers all cases; WS is opt-in future optimization
- Historical backfill on first subscribe — unbounded RPC cost, unclear value for AI agents
- NFT receive detection — different data model, separate milestone
- Geyser plugin (Solana) — requires custom validator infrastructure, violates self-hosted principle
- Real-time WebSocket push to API clients — adds WebSocket server complexity; polling REST API + notifications covers urgency

### Architecture Approach

The incoming TX subsystem is a parallel data path that does NOT modify the existing outgoing TX pipeline. The key architectural decision (from design doc 76, confirmed by codebase analysis) is to keep `IChainSubscriber` strictly separate from `IChainAdapter`: the adapter is stateless request-response while the subscriber is stateful with WebSocket connections, subscription registries, and reconnection state. Mixing them would break AdapterPool's eviction logic and violate SRP. All writes go through a memory queue -> batch flush -> SQLite path, never directly from WebSocket callbacks, to avoid SQLITE_BUSY errors from concurrent async contexts. The SubscriptionMultiplexer pools WebSocket connections by `chain:network` key so N wallets share 1 connection per network. See ARCHITECTURE.md for full integration point specifications against the actual codebase.

**Major components:**
1. `IChainSubscriber` (@waiaas/core) — 6-method interface (subscribe, unsubscribe, subscribedWallets, connect, waitForDisconnect, destroy); stateful counterpart to IChainAdapter; `onTransaction` callback injected by IncomingTxMonitorService pushes synchronously to memory queue — no DB writes in callback
2. `SolanaIncomingSubscriber` (@waiaas/adapter-solana) — `logsNotifications({ mentions: [walletAddress] })` per wallet; `getTransaction(jsonParsed)` for SOL/SPL parsing; `getSignaturesForAddress` polling fallback; creates its OWN RPC connections (does not share SolanaAdapter's HTTP client)
3. `EvmIncomingSubscriber` (@waiaas/adapter-evm) — `getLogs` polling (ERC-20); `getBlock(includeTransactions: true)` polling (native ETH); `connect()`/`waitForDisconnect()` are no-ops in polling mode; creates its OWN viem PublicClient
4. `IncomingTxQueue` (@waiaas/daemon) — `Map<txHash:walletId, tx>` for mandatory dedup (not array); `splice(0, MAX_BATCH)` flush; `ON CONFLICT(tx_hash, wallet_id) DO NOTHING` INSERT; `MAX_BATCH=50`, `MAX_QUEUE_SIZE=1000`
5. `SubscriptionMultiplexer` (@waiaas/daemon) — per `chain:network` WebSocket connection sharing; 3-state machine (WEBSOCKET/POLLING/DISABLED); `reconnectLoop` with `calculateDelay(attempt)` exponential backoff + jitter; Solana 60s `getSlot()` heartbeat
6. `IncomingTxMonitorService` (@waiaas/daemon) — orchestrator; registered at DaemonLifecycle Step 4c-9 fail-soft; `syncSubscriptions()` for dynamic wallet management; `IIncomingSafetyRule[]` evaluation post-flush; notification emission after DB write
7. Safety rules (@waiaas/daemon) — `DustAttackRule` (USD threshold via PriceOracle), `UnknownTokenRule` (token_registry check), `LargeAmountRule` (10x historical average)

**Data flow:**
```
Chain event (WS/Poll) -> onTransaction callback (sync push) -> IncomingTxQueue (Map dedup)
  -> BackgroundWorker 'incoming-tx-flush' (5s interval)
  -> sqlite.transaction(): INSERT incoming_transactions ON CONFLICT DO NOTHING + UPDATE cursor
  -> For each inserted row: IIncomingSafetyRule.check() -> EventBus emit -> NotificationService.notify()
```

**DB additions (v21 migration):**
- `incoming_transactions` table: 12 columns, 4 indexes (wallet_id, status, detected_at, UNIQUE(tx_hash, wallet_id))
- `incoming_tx_cursors` table: per-chain/network cursor state for gap recovery
- `wallets.monitor_incoming INTEGER NOT NULL DEFAULT 0`: per-wallet opt-in column

**Package modifications summary:** 3 new files in @waiaas/core, 1 new file per adapter, 6+ new files in @waiaas/daemon, 2 modified files in @waiaas/sdk, 2 new + 1 modified in @waiaas/mcp, 14 modified existing files across all packages.

### Critical Pitfalls

1. **WebSocket listener leak on reconnection (C-01)** — Each reconnect cycle creates new WebSocket but old listeners are never removed. Memory grows linearly with reconnections; MaxListenersExceededWarning floods logs. Prevention: AbortController per connection generation + `connectionGeneration` counter to short-circuit stale handler execution; call `removeAllListeners()` before creating new WebSocket. Test: connect 10 times, assert listener count stays constant.

2. **Shutdown data loss — memory queue not flushed (C-05)** — BackgroundWorkers.stopAll() does NOT run one final iteration. Up to 5 seconds of queued TXs are lost on every restart. Prevention: `IncomingTxMonitorService.stop()` must call `queue.flush(sqlite)` as its LAST step BEFORE returning; cursor update MUST be inside the same `sqlite.transaction()` as TX inserts (atomic consistency); call `incomingTxMonitorService.stop()` BEFORE `workers.stopAll()` in DaemonLifecycle shutdown sequence.

3. **Agents acting on Solana `confirmed` (unfinalized) transactions (C-03)** — Solana `confirmed` blocks have ~5% rollback probability. Agents acting on DETECTED events can trigger actions on phantom deposits. Prevention: REST API MUST default to `status=CONFIRMED` filter; add `INCOMING_TX_CONFIRMED` notification event; document in skill files: "Do NOT initiate transfers based on DETECTED status"; add stale DETECTED cleanup (> 1 hour without CONFIRMED = rollback, mark EXPIRED).

4. **Duplicate events from gap recovery + polling running concurrently (C-04)** — Gap recovery + polling fallback + WebSocket reconnect can all detect the same TX simultaneously. Without queue-level dedup, flush handler processes duplicates (wasted DB writes, memory pressure during large gap recovery). Prevention: `Map<txHash:walletId, tx>` dedup in IncomingTxQueue is MANDATORY (design doc labels it "optional" — that is wrong); DB-level `ON CONFLICT DO NOTHING` is the safety net, not the primary defense; pause polling for affected wallets during gap recovery.

5. **SQLite event loop starvation from large flush batch (C-02)** — 100-row INSERT in a `sqlite.transaction()` can block the Node.js event loop for 50ms+, causing API latency spikes that correlate with flush schedule. Prevention: `MAX_BATCH = 50` (not 100); gap recovery must use micro-batches of 20 with `setImmediate()` yield between iterations; log flush worker execution time, alert if > 50ms.

6. **EVM reorg causing false CONFIRMED status (C-06)** — EVM confirmation worker checks only `currentBlock - tx.block_number >= 12` without re-verifying the TX still exists. A reorg can invalidate the TX while the DB shows CONFIRMED. Prevention: confirmation worker must re-fetch `eth_getTransactionReceipt(txHash)` and verify receipt exists; if null, mark TX as EXPIRED; if `receipt.blockNumber` differs from stored value, update and reset to DETECTED. Critical for L2s where CONFIRMATION_THRESHOLDS = 1.

## Implications for Roadmap

Based on research, the dependency graph mandates 6 phases. Core types must precede adapters, adapters must precede the orchestration service, the service must precede REST API, and integration testing comes last. The design is fully specified — no research-phase iterations are needed during implementation.

### Phase 1: Core Types + DB Foundation
**Rationale:** Everything else has compile-time dependency on the IChainSubscriber interface and IncomingTransaction types. The DB schema must exist before any INSERT can be tested. This is the root dependency node.
**Delivers:** IChainSubscriber interface (6 methods), IIncomingSafetyRule interface, IncomingTransaction type + IncomingTxStatus enum, WaiaasEventMap extension (5 -> 8 events: transaction:incoming, transaction:incoming:suspicious, incoming:flush:complete), NotificationEventType extension (28 -> 30: INCOMING_TX_DETECTED, INCOMING_TX_SUSPICIOUS), DB migration v21 (incoming_transactions + incoming_tx_cursors tables + wallets.monitor_incoming column, 4 indexes), Drizzle schema for new tables, pushSchema DDL update, LATEST_SCHEMA_VERSION 20 -> 21, core barrel exports
**Addresses:** DB migration v21 (table stake), IChainSubscriber interface (foundation for all detection)
**Avoids:** L-03 EventBus type collision — TypeScript's typed WaiaasEventMap prevents mismatched handlers at compile time
**Research flag:** None — DB migration framework and TypeScript interface patterns are fully established in this codebase

### Phase 2: Chain Subscriber Implementations
**Rationale:** SolanaIncomingSubscriber and EvmIncomingSubscriber are independent of each other and can be built in parallel. Both depend only on Phase 1 types. This is where the bulk of chain-specific complexity lives.
**Delivers:** `SolanaIncomingSubscriber` (logsSubscribe via `logsNotifications` AsyncIterable, `getTransaction(jsonParsed)` parsing for SOL native via preBalances/postBalances delta + SPL/Token-2022 via preTokenBalances/postTokenBalances delta, polling fallback via `getSignaturesForAddress`, AbortController-based cancellation, connection independence from SolanaAdapter), `EvmIncomingSubscriber` (getLogs polling for ERC-20 Transfer events with indexed `to` filter, getBlock polling for native ETH, token_registry whitelist filter, 100-block chunk cap per getLogs call, connection independence from EvmAdapter), unit tests for both with mock RPC
**Uses:** @solana/kit `createSolanaRpcSubscriptions` + `logsNotifications`; viem `getLogs` + `getBlock` + `parseAbiItem`
**Avoids:** M-01 Solana heartbeat (dual mechanism: 60s `getSlot()` RPC call + WebSocket transport keepAlive); M-02 `getSignaturesForAddress` ordering gotcha (process ALL signatures returned, use ON CONFLICT for idempotency, consider slot-based fallback); M-05 getBlock performance (early `tx.to`/`tx.value` filter, max 10 blocks per cycle); L-06 getLogs block range limits (100-block chunks with error handling for "range too large"); L-07 single-address logsSubscribe constraint (one subscription per wallet address — multiple addresses in `mentions` array is unsupported)
**Research flag:** MEDIUM — @solana/kit `logsNotifications` TypeScript generics and exact method names should be verified against installed package type definitions before writing the subscriber. The QuickNode guide confirms the pattern but package-level TypeScript types need code-level verification.

### Phase 3: Monitor Service + Resilience
**Rationale:** IncomingTxMonitorService depends on both subscribers (Phase 2) and the DB schema (Phase 1). This phase contains the highest-complexity components: SubscriptionMultiplexer (3-state machine, reconnectLoop) and blind gap recovery. Build IncomingTxQueue before the service so the queue contract is stable during service development.
**Delivers:** `IncomingTxQueue` (Map-based mandatory dedup keyed by `txHash:walletId`, `MAX_BATCH=50`, `MAX_QUEUE_SIZE=1000`, streaming gap recovery at 100-signatures-at-a-time), `SubscriptionMultiplexer` (per chain:network WebSocket sharing, 3-state machine WEBSOCKET/POLLING/DISABLED, `reconnectLoop` with `calculateDelay` exponential backoff 1s->60s + jitter, Solana 60s heartbeat via `getSlot()`, fallback to POLLING after 3 failed reconnect attempts), `IncomingTxMonitorService` (orchestrator with IIncomingSafetyRule evaluation), `syncSubscriptions()` dynamic wallet management, blind gap recovery via cursor-based `getSignaturesForAddress`/`getLogs` fetching, 3 safety rule implementations (DustAttackRule, UnknownTokenRule, LargeAmountRule), DaemonLifecycle Step 4c-9 fail-soft integration, shutdown final flush in `stop()`, BackgroundWorkers registration (6 workers: incoming-tx-flush 5s, incoming-tx-confirm-solana 30s, incoming-tx-confirm-evm 30s, incoming-tx-poll-solana configurable, incoming-tx-poll-evm configurable, incoming-tx-retention 1h), HotReloadOrchestrator extension for incoming config
**Avoids:** C-01 listener leak (AbortController per generation + connectionGeneration counter + removeAllListeners before reconnect); C-02 SQLite starvation (MAX_BATCH=50, gap recovery micro-batches with setImmediate yield); C-04 duplicate events (Map-based mandatory dedup in queue, pause polling during gap recovery); C-05 shutdown data loss (final flush in stop(), cursor inside flush transaction — single sqlite.transaction() for both); C-06 EVM false CONFIRMED (re-fetch getTransactionReceipt before promoting, mark EXPIRED if null); M-03 KillSwitch race (check KillSwitch state != ACTIVE before EventBus emit, DB writes continue for audit trail); M-04 unbounded queue growth (MAX_QUEUE_SIZE=1000, streaming gap recovery with backpressure); M-06 HotReload WSS URL leak (SubscriptionMultiplexer.destroyAll() + re-subscribe when wssUrl changes, compare before destroying); M-07 notification storm (per-wallet cooldown 60s, batch aggregation: > 3 suspicious TXs per flush cycle -> single summary notification)
**Research flag:** HIGH — SubscriptionMultiplexer and reconnect loop are the highest-complexity components. @solana/kit reconnection behavior (what happens mid-`for await` when WebSocket drops) has MEDIUM confidence — no official documentation. Verify empirically early in Phase 3 with a minimal test: drop the WebSocket, confirm the iterator throws/completes, confirm reconnect loop catches it. Keep all state transitions observable via debug logging.

### Phase 4: Config + Settings + Notifications
**Rationale:** Can be built in parallel with Phase 3 logically. Message templates and SettingsService keys must be committed before the Phase 3 service emits notifications. Group here to keep config concerns cohesive and avoid cross-phase merge conflicts.
**Delivers:** DaemonConfig `[incoming]` section with Zod schema (7 keys: incoming_enabled, incoming_mode, incoming_poll_interval, incoming_retention_days, incoming_suspicious_dust_usd, incoming_suspicious_amount_multiplier, incoming_wss_url), SETTING_DEFINITIONS (7 new entries), SETTING_CATEGORIES (add 'incoming' as 12th category), HotReloadOrchestrator extension (HotReloadDeps + reloadIncomingMonitor with destroyAll on wssUrl change), 2 notification message templates (en/ko for INCOMING_TX_DETECTED and INCOMING_TX_SUSPICIOUS), `mapPriority()` extension for new event types, NOTIFICATION_EVENT_TYPES SSoT array update (28 -> 30)
**Addresses:** Global enable/disable gate (table stake), config.toml [incoming] 7 keys (table stake), hot-reload all 7 keys (differentiator), bilingual templates (differentiator)
**Avoids:** M-06 HotReload WSS URL subscription leak (destroyAll + re-subscribe on URL change, compare old vs new URL first)
**Research flag:** None — follows established [balance_monitor] config pattern exactly; SettingsService registration pattern is well-documented

### Phase 5: REST API + SDK + MCP
**Rationale:** REST API depends on DB tables (Phase 1) and types (Phase 1). SDK and MCP depend on the API contract being defined. This phase is lower complexity than Phase 3 because it follows established codebase patterns throughout.
**Delivers:** `GET /v1/wallet/incoming` (cursor pagination via UUID v7, sessionAuth via existing wildcard `/v1/wallet/*`, resolveWalletId), `GET /v1/wallet/incoming/summary` (SQL aggregation with USD conversion via PriceOracle + ForexRateService), PATCH `/v1/wallet/:id` extension (monitorIncoming field + `void syncSubscriptions()` fire-and-forget), Zod SSoT schemas (IncomingTransactionQuerySchema, IncomingTransactionSchema, IncomingTransactionListResponseSchema, IncomingTransactionSummarySchema), OpenAPI spec update, TypeScript SDK 2 methods (listIncomingTransactions, getIncomingTransactionSummary) + types, Python SDK 2 methods (list_incoming_transactions, get_incoming_transaction_summary), MCP tools 2 new (list_incoming_transactions, get_incoming_summary) registered in server.ts (21 -> 23 tools total), skills file update (wallet.skill.md incoming TX section with endpoints, MCP tools, SDK methods, notification category, status semantics)
**Addresses:** Incoming TX history API (table stake), PATCH monitorIncoming opt-in toggle (table stake), SDK/MCP access (differentiator)
**Avoids:** C-03 consumer confusion — REST API MUST default to `status=CONFIRMED` filter, not DETECTED; document DETECTED vs CONFIRMED semantics prominently in skill files with explicit warning; L-05 toggle timing — `syncSubscriptions()` MUST be fire-and-forget (not awaited) from PATCH handler to avoid 2-3s response delay
**Research flag:** None — cursor pagination (UUID v7 cursor pattern), SDK delegation via URLSearchParams, MCP tool registration all follow existing patterns with no novel elements

### Phase 6: Integration Testing
**Rationale:** Integration tests require all components in place. Unit tests belong to each phase (built alongside the code). E2E tests require the full system: WebSocket -> polling fallback, blind gap recovery, notification storm prevention, shutdown flush, KillSwitch + incoming TX race.
**Delivers:** T-01 through T-17 (design doc 76 core verification tests), S-01 through S-04 (security verification), WebSocket -> polling E2E test, blind gap recovery E2E test (simulate 50-block gap, verify all TXs recovered), shutdown data loss prevention test (push 10 TXs to queue, call stop(), verify all 10 in DB), KillSwitch + incoming TX race test (activate KillSwitch, push TX, flush, verify DB has TX but no EventBus event emitted), notification storm test (push 50 dust TXs, verify <= 5 notifications sent), EVM reorg mock test (mock getTransactionReceipt returning null, verify TX marked EXPIRED not CONFIRMED), cursor atomicity test (crash between TX insert and cursor update, verify gap recovery catches on restart)
**Addresses:** All 6 critical pitfalls each have a specific test scenario from PITFALLS.md
**Avoids:** L-01 WebSocket mock flakiness — use `vitest-websocket-mock` (NOT raw mock WebSocket); use `vi.useFakeTimers()` for BackgroundWorkers timing; wrap all WS event assertions in `await expect(async () => ...).resolves` or explicit Promise sync; set `{ timeout: 5000 }` per WS test; NEVER use immediate assertions after emitting WS events
**Research flag:** None — vitest and BackgroundWorkers test patterns are established; vitest-websocket-mock has a clear, documented API

### Phase Ordering Rationale

- **Phases 1 -> 2 -> 3 -> 5** is a strict compile-time dependency chain: types before subscribers, subscribers before service, service before API
- **Phase 4 (Config)** can run in parallel with Phase 3 but message templates must be committed before Phase 3 notification emission is tested
- **Phase 3 is the highest-risk phase** — it contains 5 of the 6 critical pitfalls (C-01, C-02, C-04, C-05, C-06) and the highest-complexity component (SubscriptionMultiplexer). Allocate extra time and build incrementally: IncomingTxQueue first, then SubscriptionMultiplexer with extensive logging, then IncomingTxMonitorService
- **Phase 6 (Tests)** is non-optional — the 6 critical pitfalls each have test scenarios that must pass. Ship without these tests and the first production deployment will find them the hard way
- Within Phase 2, SolanaIncomingSubscriber and EvmIncomingSubscriber are independent and can be parallelized across implementers
- The Admin UI monitor_incoming toggle and settings panel (mentioned in design doc 76 Phase 6) can be deferred — the Admin Settings page already renders settings categories dynamically, so adding the 'incoming' category generates the form automatically

### Research Flags

Phases needing attention during implementation:

- **Phase 3 (SubscriptionMultiplexer / reconnect loop):** @solana/kit reconnection behavior when the WebSocket drops mid-`for await` is MEDIUM confidence — no official documentation. Verify early with a minimal empirical test: create a `logsNotifications` subscription, forcibly close the WebSocket, confirm whether the iterator throws or silently completes. The entire reconnect loop design depends on this behavior. Keep all state transitions observable with debug logging.
- **Phase 2 (SolanaIncomingSubscriber):** `logsNotifications` TypeScript generics in @solana/kit ^6.0.1 should be verified by reading the installed package's type definitions (`node_modules/@solana/rpc-subscriptions-api/dist/index.d.ts`) before writing the subscriber. The QuickNode guide confirms the general pattern but exact TypeScript types need code-level verification.
- **Phase 2 (Solana heartbeat):** The dual heartbeat strategy (WebSocket ping + 60s `getSlot()` RPC call) should be validated against the actual RPC provider (Helius or QuickNode) in staging. Different providers track "inactivity" at different layers (transport vs application). Log WebSocket connection duration to detect if connections consistently last exactly 10 minutes (heartbeat not working).

Phases with well-established patterns (no additional research needed):

- **Phase 1 (Core Types + DB):** DB migration framework, TypeScript interface patterns, and barrel export conventions are fully established. Migration v21 follows identical structure to v19 and v20.
- **Phase 4 (Config + Settings):** Identical to [balance_monitor] config pattern already implemented. Copy-and-modify.
- **Phase 5 (REST API + SDK + MCP):** UUID v7 cursor pagination, SDK URLSearchParams delegation, and MCP tool registration with ApiClient all follow existing patterns with zero novel elements.
- **Phase 6 (Integration Testing):** vitest patterns, BackgroundWorkers timer testing with vi.useFakeTimers(), and vitest-websocket-mock usage are established. Design doc 76 section 9 provides the full T-01 through T-17 test specification.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies needed. viem API surfaces verified via GitHub source code. better-sqlite3 batch patterns confirmed via performance docs + existing codebase. Node.js 22 WS limitations confirmed via official docs. One MEDIUM item: @solana/kit `logsNotifications` exact TypeScript generics need code-level verification. |
| Features | HIGH | Design doc 76 provides complete specification with 19 locked decisions. Feature scope is fully bounded. LOC estimates (~2,400 implementation + ~1,200 tests) based on code-level complexity analysis per file. Anti-features are explicitly listed and rationale is sound. |
| Architecture | HIGH | All 14 integration points verified against actual source files: daemon.ts (1,309 lines), workers.ts, connection.ts, migrate.ts, setting-keys.ts, hot-reload.ts, server.ts, event-types.ts, notification.ts. Component boundaries are non-overlapping. IChainSubscriber vs IChainAdapter separation rationale is fully verified. |
| Pitfalls | HIGH (C-01, C-02, C-04, C-05, M-03, M-07) / MEDIUM (C-03, C-06, M-01, M-02) | C-01 through C-05 derived from codebase analysis of BackgroundWorkers.stopAll(), workers.ts, and official SQLite/viem docs. C-06 is real but statistically rare on Ethereum mainnet post-Merge. M-01 (inactivity timeout) and M-02 (getSignaturesForAddress ordering) are MEDIUM due to RPC provider variability and Solana validator internals. |

**Overall confidence:** HIGH

### Gaps to Address

- **@solana/kit `logsNotifications` reconnection behavior (MEDIUM):** Official docs do not specify what happens to the `for await` iterator when the underlying WebSocket disconnects. Expected behavior (iterator throws, reconnect loop catches) needs empirical verification in Phase 3. Implement observable state transitions with debug logging before building the full reconnect loop.
- **Solana RPC provider heartbeat policy (MEDIUM):** The dual heartbeat (WebSocket ping + 60s `getSlot()`) should prevent 10-minute inactivity timeouts but different providers implement this differently. Validate in staging with actual provider before declaring Phase 2 complete. Log WebSocket connection duration as an observable metric.
- **EVM native ETH via `getBlock(includeTransactions: true)` RPC cost at scale:** Full block deserialization (~150 TXs per block on mainnet, most irrelevant) is inherently expensive. The 10-block-per-cycle cap mitigates this. If RPC credit consumption at scale (100 wallets, 30s polling) proves excessive, `eth_getBlockReceipts` or provider-specific enhanced APIs (Alchemy `alchemy_getAssetTransfers`) may be needed. Measure in Phase 6 integration tests.
- **Design doc 76 "optional optimization" label on queue dedup (confirmed wrong):** The design doc section 2.4 labels `Set`-based dedup as "optional optimization." Research confirms this is incorrect — it is mandatory to prevent memory pressure and wasted DB operations during gap recovery. The Map-based dedup must be implemented as a first-class requirement, not an optimization. Address this discrepancy when starting Phase 3.

## Sources

### Primary (HIGH confidence)
- WAIaaS Design Doc 76 (internal: `internal/design/76-incoming-transaction-monitoring.md`) — 2,441 lines, 19 design decisions, complete specification
- WAIaaS codebase direct analysis: `packages/daemon/src/lifecycle/daemon.ts` (1,309 lines, Step 4c integration points), `packages/daemon/src/lifecycle/workers.ts` (BackgroundWorkers.stopAll behavior), `packages/daemon/src/infrastructure/database/connection.ts` (7 PRAGMA configuration), `packages/daemon/src/infrastructure/database/migrate.ts` (LATEST_SCHEMA_VERSION=20), `packages/core/src/events/event-types.ts` (5 current events), `packages/core/src/enums/notification.ts` (28 current types)
- [Solana logsSubscribe RPC docs](https://solana.com/docs/rpc/websocket/logssubscribe) — mentions filter single-address constraint, commitment levels, response format
- [viem watchEvent source](https://github.com/wevm/viem/blob/main/src/actions/public/watchEvent.ts) — function signature, transport mode selection, poll vs subscription behavior
- [viem watchBlocks source](https://github.com/wevm/viem/blob/main/src/actions/public/watchBlocks.ts) — includeTransactions option, WebSocket vs polling
- [viem WebSocket transport source](https://github.com/wevm/viem/blob/main/src/clients/transports/webSocket.ts) — reconnect/keepAlive/timeout config options and defaults
- [viem Issue #2325](https://github.com/wevm/viem/issues/2325) — Socket CLOSED recovery fix confirmed in 2.13.1
- [viem Issue #2563](https://github.com/wevm/viem/issues/2563) — Reconnect after 1h fix confirmed in PR #3313
- [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) — WAL mode, transaction batching, 50x speedup with prepared statements
- [Node.js WebSocket docs](https://nodejs.org/en/learn/getting-started/websocket) — stable since v22.4.0, W3C API, no `ws.ping()` method

### Secondary (MEDIUM confidence)
- [QuickNode @solana/kit subscriptions guide](https://www.quicknode.com/guides/solana-development/tooling/web3-2/subscriptions) — `createSolanaRpcSubscriptions` API, async iterator pattern, `logsNotifications` method name
- [@solana/rpc-subscriptions-api npm](https://www.npmjs.com/package/@solana/rpc-subscriptions-api) — package exports, Notifications suffix convention
- [Helius Solana commitment levels](https://www.helius.dev/blog/solana-commitment-levels) — confirmed vs finalized semantics, ~5% rollback probability for confirmed
- [Solana getSignaturesForAddress ordering issue #35521](https://github.com/solana-labs/solana/issues/35521) — intra-slot ordering inconsistency between blockstore and bigtable backends
- [Drizzle Issue #2474](https://github.com/drizzle-team/drizzle-orm/issues/2474) — returning + onConflictDoNothing limitation, justifies raw better-sqlite3 for write path
- [ws library memory leak issue #804](https://github.com/websockets/ws/issues/804) — event listener accumulation pattern on reconnect
- [SQLite WAL documentation](https://sqlite.org/wal.html) — WAL checkpoint behavior, single writer, SQLITE_BUSY conditions

### Tertiary (informational)
- [OneUptime WebSocket reconnection guide](https://oneuptime.com/blog/post/2026-01-27-websocket-reconnection/view) — exponential backoff patterns, jitter rationale
- [Gate.com dusting attack guide](https://web3.gate.com/crypto-wiki/article/understanding-dusting-attacks-in-cryptocurrency-security-20251203) — dust detection thresholds, micro-quantity patterns
- [Alchemy eth_getLogs deep dive](https://www.alchemy.com/docs/deep-dive-into-eth_getlogs) — block range best practices, indexed topic filtering
- [vitest-websocket-mock](https://github.com/akiomik/vitest-websocket-mock) — structured WS mock assertions for testing

---
*Research completed: 2026-02-21*
*Ready for roadmap: yes*
