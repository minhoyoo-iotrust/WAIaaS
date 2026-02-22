# Feature Landscape: Incoming Transaction Monitoring Implementation

**Domain:** Crypto Wallet Incoming Transaction Monitoring (WAIaaS v27.1 Implementation)
**Researched:** 2026-02-21
**Confidence:** HIGH (design doc 76 verified against Solana RPC docs, viem docs, industry patterns)

---

## Context

WAIaaS v27.0 delivered design doc 76 (~2,300 lines). v27.1 implements it.

**Existing features (already built):**
- Outgoing TX pipeline (6-stage + sign-only, 8-state machine, 5 discriminated union types)
- EventBus with 28 notification event types, 4 notification channels + wallet app channel
- KillSwitch 3-state, AutoStop 4-rule, BalanceMonitor (fail-soft pattern)
- REST API 60+ endpoints with cursor pagination (UUID v7 cursor pattern established)
- TypeScript/Python SDK, MCP 18+ tools
- Admin UI with 7 functional menus, SettingsService hot-reload
- Token registry (5 EVM mainnet 24 built-in tokens + custom CRUD)
- BackgroundWorkers periodic scheduler (wal-checkpoint, session-cleanup, version-check)
- DaemonLifecycle Step 4c fail-soft initialization pattern

**Design doc 76 decisions already locked (19 decisions D-01 through D-19).**
This feature landscape covers the IMPLEMENTATION scope, complexity, and dependency ordering.

---

## Table Stakes

Features users expect from any incoming TX monitoring system. Missing = feature feels incomplete.

| Feature | Why Expected | Complexity | Depends On | Design Doc Section |
|---------|--------------|------------|------------|-------------------|
| Solana SOL native receive detection | Core use case -- agents receive SOL payments | Med | IChainSubscriber interface, SolanaIncomingSubscriber | SS3.2.1 |
| Solana SPL token receive detection | SPL tokens are primary Solana token standard | Med | SOL detection (shared parser), preTokenBalances/postTokenBalances | SS3.2.2 |
| Solana Token-2022 detection | Token-2022 is Solana's evolving token standard | Low | SPL detection (same mechanism, no separate code) | SS3.3 |
| EVM native ETH receive detection | Core use case -- agents receive ETH payments | Med | EvmIncomingSubscriber, getBlock(includeTransactions) | SS4.3 |
| EVM ERC-20 Transfer event detection | ERC-20 tokens are primary EVM token standard | Med | ETH detection (shared subscriber), getLogs + Transfer topic | SS4.2 |
| 2-phase status (DETECTED -> CONFIRMED) | Users need fast notification AND safe trigger semantics | Med | DB schema, confirmation background workers | SS1.3 |
| Wallet-level opt-in toggle | Users must control which wallets are monitored (RPC cost) | Low | wallets.monitor_incoming column, PATCH API | SS2.2, SS8.4 |
| Global enable/disable gate | Operator must control entire monitoring feature | Low | config.toml [incoming] section, SettingsService | SS8.1 |
| Incoming TX notification (DETECTED) | Users need to know when funds arrive | Low | Existing NotificationService.notify(), new event type | SS6.2 |
| Incoming TX history API | Users/agents query past incoming transactions | Med | incoming_transactions table, cursor pagination | SS7.1 |
| DB migration v21 | Required infrastructure for all features | Low | Existing migration framework, 3 DDL statements | SS2.7 |
| Config.toml [incoming] 7 keys | Operator configuration surface | Low | Existing config pattern, SettingsService registration | SS8.1-8.3 |

**Total table stakes: 12 features**

---

## Differentiators

Features that set WAIaaS apart from basic monitoring. Not expected, but high-value.

| Feature | Value Proposition | Complexity | Depends On | Design Doc Section |
|---------|-------------------|------------|------------|-------------------|
| Suspicious deposit detection (3 rules) | Proactive security -- dust attacks, unknown tokens, large amounts | Med | IIncomingSafetyRule interface, PriceOracle integration, token_registry | SS6.5-6.6 |
| WebSocket -> polling auto-fallback | Resilient monitoring even with unreliable WebSocket RPCs | High | SubscriptionMultiplexer, 3-state connection machine, reconnectLoop | SS5.1-5.2 |
| Blind gap recovery | Zero TX loss during WebSocket disconnections | High | incoming_tx_cursors table, per-chain recovery logic | SS5.6 |
| WebSocket multiplexer (shared connections) | Same chain+network wallets share one WS connection | Med | SubscriptionMultiplexer class, per-wallet subscription management | SS5.4 |
| Summary aggregation API | Daily/weekly/monthly incoming TX summaries with USD values | Med | SQL aggregation, PriceOracle USD conversion, BigInt app-layer sum | SS7.6 |
| Memory queue + batch flush | SQLite single-writer protection, high throughput | Med | IncomingTxQueue class, BackgroundWorkers flush worker | SS2.6 |
| Heartbeat (Solana 60s ping) | Prevents 10-minute inactivity timeout on RPC providers | Low | SolanaHeartbeat class, timer.unref() | SS5.3 |
| Dynamic subscription sync | Runtime add/remove wallets without restart | Med | IncomingTxMonitorService.syncSubscriptions(), eventBus wallet:activity | SS5.5 |
| Hot-reload all 7 config keys | Change monitoring config without daemon restart | Low | HotReloadOrchestrator extension, existing pattern | SS8.5 |
| MCP tools (2 new) | AI agents query incoming TX via MCP protocol | Low | Existing MCP tool pattern, REST API delegation | SS7.5 |
| SDK methods (TS + Python) | Programmatic access to incoming TX data | Low | Existing SDK client pattern, REST API delegation | SS7.4 |
| Retention policy (auto-delete) | Prevent unbounded DB growth | Low | BackgroundWorkers 1-hour task, configurable days | SS2.5 |
| i18n message templates (en/ko) | Bilingual notification messages | Low | Existing message-templates.ts pattern | SS6.7 |

**Total differentiators: 13 features**

---

## Anti-Features

Features to explicitly NOT build in v27.1.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Historical backfill on first subscribe | Unbounded RPC cost, unclear value for AI agents | Start monitoring from current block/slot forward. Log "no backfill" clearly. |
| Per-token subscription filters | Overcomplicates the interface, RPC APIs don't support it natively | Monitor all tokens, filter in application layer. Token registry whitelist for legitimacy. |
| Real-time WebSocket push to API clients | Adds WebSocket server complexity to REST daemon | Use polling via GET /v1/wallet/incoming. Notifications handle urgency. |
| Automatic token claiming/sweeping on receive | Security risk -- auto-spending received funds without approval | Agent explicitly decides actions via existing outgoing TX pipeline. |
| Cross-wallet incoming TX deduplication | Same TX to multiple wallets is legitimate (batch sends) | UNIQUE(tx_hash, wallet_id) allows same TX for different wallets. |
| EVM internal transaction (trace) detection | Requires trace API (debug_traceTransaction), not available on most public RPCs | Detect only direct transfers and ERC-20 events. Document limitation. |
| Geyser plugin integration for Solana | Requires custom validator plugin infrastructure, not suitable for self-hosted | Use standard RPC logsSubscribe + getSignaturesForAddress polling. |
| NFT receive detection | Different data model, different user expectations | Future milestone if needed. Focus on fungible token monitoring. |
| Token auto-registration on receive | Unknown tokens should be flagged, not auto-trusted | Mark as unknownToken suspicious. User explicitly registers via token registry. |

---

## Feature Dependencies

```
DB Migration v21 (tables + columns)
  |
  +---> IChainSubscriber interface (core types)
  |       |
  |       +---> SolanaIncomingSubscriber
  |       |       +---> SOL native detection (preBalances/postBalances)
  |       |       +---> SPL token detection (preTokenBalances/postTokenBalances)
  |       |       +---> Token-2022 detection (same mechanism as SPL)
  |       |       +---> logsSubscribe WebSocket mode
  |       |       +---> getSignaturesForAddress polling mode
  |       |
  |       +---> EvmIncomingSubscriber
  |               +---> ERC-20 Transfer event detection (getLogs)
  |               +---> Native ETH detection (getBlock + filter)
  |               +---> Polling cursor management
  |
  +---> IncomingTxQueue (memory queue + batch flush)
  |       |
  |       +---> BackgroundWorkers: incoming-tx-flush (5s)
  |
  +---> IncomingTxMonitorService (orchestrator)
  |       |
  |       +---> SubscriptionMultiplexer
  |       |       +---> WebSocket connection sharing
  |       |       +---> 3-state connection machine
  |       |       +---> Reconnect loop + exponential backoff
  |       |       +---> Heartbeat (Solana)
  |       |
  |       +---> Dynamic subscription sync (syncSubscriptions)
  |       +---> Blind gap recovery
  |       +---> IIncomingSafetyRule evaluation
  |               +---> DustAttackRule (needs PriceOracle)
  |               +---> UnknownTokenRule (needs token_registry)
  |               +---> LargeAmountRule (needs PriceOracle + history avg)
  |
  +---> Notification integration
  |       +---> INCOMING_TX_DETECTED event type (28 -> 29)
  |       +---> INCOMING_TX_SUSPICIOUS event type (29 -> 30)
  |       +---> Message templates (en/ko)
  |       +---> Channel priority routing (ntfy, WalletNotificationChannel)
  |
  +---> Config + Settings
  |       +---> config.toml [incoming] 7 keys
  |       +---> SettingsService registration
  |       +---> HotReloadOrchestrator extension
  |       +---> Environment variable mapping (WAIAAS_INCOMING_*)
  |
  +---> Confirmation workers
  |       +---> incoming-tx-confirm-solana (30s, finalized check)
  |       +---> incoming-tx-confirm-evm (30s, confirmation threshold)
  |
  +---> Polling workers (active in POLLING state only)
  |       +---> incoming-tx-poll-solana (configurable interval)
  |       +---> incoming-tx-poll-evm (configurable interval)
  |
  +---> Retention worker
  |       +---> incoming-tx-retention (1h, configurable days)
  |
  +---> REST API
  |       +---> GET /v1/wallet/incoming (cursor pagination)
  |       +---> GET /v1/wallet/incoming/summary (aggregation)
  |       +---> PATCH /v1/wallet/:id (monitorIncoming field)
  |       +---> Zod SSoT schemas
  |
  +---> SDK/MCP
  |       +---> TypeScript SDK: listIncomingTransactions, getIncomingTransactionSummary
  |       +---> Python SDK: list_incoming_transactions, get_incoming_transaction_summary
  |       +---> MCP tools: list_incoming_transactions, get_incoming_summary
  |
  +---> DaemonLifecycle integration (Step 4c-9, fail-soft)
  |
  +---> Admin UI
          +---> Wallet detail: monitor_incoming toggle
          +---> Settings page: [incoming] section
          +---> (Optional) Incoming TX list panel
```

---

## Complexity Assessment by Implementation Area

### Low Complexity (follow existing patterns)

| Area | LOC Estimate | Rationale |
|------|-------------|-----------|
| DB migration v21 | ~50 | 3 DDL statements, existing migration framework |
| config.toml + env vars | ~40 | Copy existing [balance_monitor] pattern |
| SettingsService registration | ~30 | Add 7 keys to SETTING_KEYS |
| HotReloadOrchestrator extension | ~30 | Copy BalanceMonitor hot-reload pattern |
| Notification event types (2 new) | ~20 | Add to NOTIFICATION_EVENT_TYPES array |
| Message templates (en/ko) | ~20 | Add 2 entries to MESSAGE_TEMPLATES |
| Channel priority routing | ~15 | Extend mapPriority() pattern match |
| Retention worker | ~20 | Simple DELETE WHERE detected_at < cutoff |
| MCP tools (2 new) | ~60 | Copy existing MCP tool pattern |
| SDK methods (TS) | ~40 | URLSearchParams + GET delegation |
| SDK methods (Python) | ~30 | params dict + _get delegation |
| Zod SSoT schemas | ~60 | Query + Response + Summary schemas |
| wallets.monitor_incoming toggle | ~15 | PATCH handler extension, one column |

### Medium Complexity (chain-specific logic)

| Area | LOC Estimate | Rationale |
|------|-------------|-----------|
| IChainSubscriber interface + types | ~80 | New interface file, IncomingTransaction type, enums |
| SolanaIncomingSubscriber | ~250 | logsSubscribe, TX parsing (SOL + SPL), polling fallback |
| EvmIncomingSubscriber | ~200 | getLogs (ERC-20), getBlock (ETH), polling cursor |
| IncomingTxQueue | ~60 | Array queue, splice batch, ON CONFLICT insert |
| IncomingTxMonitorService | ~200 | Orchestrator: subscribe/unsubscribe, safety rules, notify |
| Suspicious detection (3 rules) | ~100 | IIncomingSafetyRule, DustAttack, UnknownToken, LargeAmount |
| REST API endpoints (2 routes) | ~150 | Cursor pagination, summary aggregation, Zod validation |
| Dynamic subscription sync | ~80 | DB query + Set comparison + add/remove delta |
| Confirmation workers (2 chains) | ~80 | Solana finalized check, EVM block confirmation count |
| DaemonLifecycle Step 4c-9 | ~40 | Fail-soft initialization, dependency injection |
| Admin UI toggle + settings | ~100 | Preact component, settings form section |

### High Complexity (stateful connection management)

| Area | LOC Estimate | Rationale |
|------|-------------|-----------|
| SubscriptionMultiplexer | ~200 | WebSocket connection sharing, per-chain connection map |
| 3-state connection machine | ~80 | WEBSOCKET/POLLING/DISABLED state transitions |
| Reconnect loop + exponential backoff | ~80 | calculateDelay, jitter, attempt counter, state callbacks |
| Blind gap recovery | ~120 | Per-chain cursor-based recovery, idempotent re-processing |
| SolanaHeartbeat | ~30 | 60s ping interval, timer.unref() |
| Polling workers (conditional) | ~40 | connectionState check, pollAll() delegation |

**Estimated total: ~2,400 LOC implementation + ~1,200 LOC tests = ~3,600 LOC**

---

## Critical Implementation Patterns (from design doc 76)

### Pattern 1: Solana logsSubscribe Detection

**What:** Subscribe to `logsSubscribe({ mentions: [walletAddress] })` with `confirmed` commitment. The subscription returns only the transaction signature -- full TX details require a subsequent `getTransaction(signature, { encoding: 'jsonParsed' })` call.

**Why this approach:** `mentions` with a wallet address catches ALL transactions involving that address -- SOL transfers, SPL transfers, ATA creation, Token-2022. One subscription per wallet covers everything. (Verified: Solana official docs confirm `mentions` accepts only ONE Pubkey per call.)

**Key constraint (HIGH confidence):** Solana RPC `logsSubscribe` `mentions` field accepts a single Pubkey only. Multiple addresses in the array cause an RPC error. Each wallet requires a separate subscription, but subscriptions share the same WebSocket connection via the multiplexer.

**Implementation note:** @solana/kit provides `createSolanaRpcSubscriptions` with `logsNotifications` returning an AsyncIterable. The `for await` loop is consumed until the AbortController signal fires.

### Pattern 2: EVM Polling-First Strategy

**What:** Use `getLogs` (HTTP RPC) for ERC-20 Transfer event detection + `getBlock(includeTransactions: true)` for native ETH detection. Polling-first, no WebSocket dependency by default.

**Why this approach:**
1. HTTP RPC universally available (self-hosted environments often lack WebSocket endpoints)
2. EVM block interval (~12s) naturally aligns with polling intervals
3. viem `watchEvent` behavior depends on transport type (HTTP -> polls, WS -> subscribes) -- unpredictable
4. `getLogs` supports efficient block range queries with indexed topic filtering

**Key constraint:** Native ETH transfers do NOT emit events. They must be detected by inspecting block transactions where `tx.to === walletAddress && tx.value > 0n`. This requires fetching full blocks, which is RPC-intensive. Design limits to 10 blocks per poll cycle.

### Pattern 3: Memory Queue + Batch Flush

**What:** WebSocket/polling callbacks push to in-memory array. BackgroundWorkers flush every 5 seconds with `INSERT ... ON CONFLICT DO NOTHING` in a SQLite transaction.

**Why this approach:** SQLite better-sqlite3 single-writer protection. Concurrent WebSocket events writing directly to DB would cause WAL contention. Batching amortizes write overhead and keeps the callback synchronous (no async in onTransaction).

### Pattern 4: 2-Phase Status with Separate Confirmation Workers

**What:** TX enters as DETECTED (confirmed/1+ confirmations). Background worker promotes to CONFIRMED (finalized/12+ confirmations) on 30-second interval.

**Why this approach:** Fast notification at DETECTED (user experience) vs safe trigger at CONFIRMED (agent logic). Decouples detection latency from confirmation latency. Agents should only act on CONFIRMED to avoid reorg/rollback losses.

### Pattern 5: Wallet-Level Opt-In with Global Gate

**What:** Two-level gate: `incoming_enabled` (global) AND `monitor_incoming` (per-wallet). Both must be true for monitoring to activate.

**Why this approach:** RPC subscriptions have cost. Default-off prevents surprise RPC bills. Global gate lets operators disable everything instantly. Per-wallet toggle gives granular control.

---

## MVP Recommendation

Build in this order, each phase independently testable:

### Phase 1: Core Infrastructure
Prioritize:
1. **DB migration v21** -- foundation for everything
2. **IChainSubscriber interface + IncomingTransaction type** -- contracts first
3. **IncomingTxQueue + flush worker** -- write path
4. **Config.toml [incoming] + SettingsService** -- configuration surface
5. **Notification event types (2) + message templates** -- event infrastructure

### Phase 2: Chain Detection
Prioritize:
1. **SolanaIncomingSubscriber** -- logsSubscribe + TX parsing (SOL + SPL)
2. **EvmIncomingSubscriber** -- getLogs (ERC-20) + getBlock (ETH)
3. **Confirmation workers** -- DETECTED -> CONFIRMED promotion

### Phase 3: Resilience + Safety
Prioritize:
1. **SubscriptionMultiplexer** -- WebSocket connection sharing
2. **3-state connection machine + reconnect loop** -- auto-fallback
3. **Blind gap recovery** -- zero TX loss
4. **IIncomingSafetyRule 3 rules** -- suspicious detection

### Phase 4: Service Integration
Prioritize:
1. **IncomingTxMonitorService** -- orchestrator with notification integration
2. **Dynamic subscription sync** -- runtime wallet management
3. **DaemonLifecycle Step 4c-9** -- fail-soft startup
4. **HotReloadOrchestrator extension** -- config hot-reload

### Phase 5: API + SDK + MCP
Prioritize:
1. **REST API: GET /v1/wallet/incoming** -- cursor pagination
2. **REST API: GET /v1/wallet/incoming/summary** -- aggregation
3. **PATCH /v1/wallet/:id monitorIncoming** -- opt-in toggle
4. **SDK methods (TS + Python)** -- client libraries
5. **MCP tools (2 new)** -- AI agent access

### Phase 6: Admin UI + Polish
Prioritize:
1. **Admin UI: wallet detail monitor toggle** -- visual opt-in
2. **Admin UI: incoming settings section** -- configuration panel
3. **Retention worker** -- auto-cleanup
4. **Skills file sync** -- documentation update

**Defer:**
- Admin UI incoming TX list panel: Nice-to-have but agents use API directly. Build if time permits.
- WebSocket mode for EVM: Polling-first covers all use cases. WebSocket optimization is future work.
- Summary USD conversion with multi-token breakdown: Start with count + suspicious count. Full USD breakdown is complex (multiple tokens, multiple price lookups per summary entry).

---

## Sources

### Official Documentation
- [Solana logsSubscribe RPC Method](https://solana.com/docs/rpc/websocket/logssubscribe) -- mentions filter, commitment levels
- [Solana RPC WebSocket Methods](https://solana.com/docs/rpc/websocket) -- full WebSocket subscription catalog
- [viem watchEvent](https://viem.sh/docs/actions/public/watchEvent) -- polling vs WebSocket behavior
- [viem watchBlocks](https://viem.sh/docs/actions/public/watchBlocks) -- includeTransactions option

### RPC Provider Guides
- [QuickNode: Solana WebSocket Subscriptions](https://www.quicknode.com/guides/solana-development/getting-started/how-to-create-websocket-subscriptions-to-solana-blockchain-using-typescript) -- 10-minute inactivity timeout, ping requirement
- [Helius: logsSubscribe](https://www.helius.dev/docs/api-reference/rpc/websocket/logssubscribe) -- single Pubkey mentions constraint
- [Alchemy: eth_getLogs Deep Dive](https://www.alchemy.com/docs/deep-dive-into-eth_getlogs) -- block range best practices, indexed topic filtering

### Security Patterns
- [Gate.com: Understanding Dusting Attacks](https://web3.gate.com/crypto-wiki/article/understanding-dusting-attacks-in-cryptocurrency-security-20251203) -- detection patterns, micro-quantity thresholds
- [BitGo: Dust Attacks in Crypto](https://www.bitgo.com/resources/blog/dust-attacks-in-crypto/) -- common-input-ownership heuristic
- [OKX: Crypto Dusting Attack Guide](https://www.okx.com/en-us/learn/crypto-dusting-attack-guide) -- platform monitoring approaches

### API Design
- [Speakeasy: Pagination Best Practices](https://www.speakeasy.com/api-design/pagination) -- cursor-based pagination for real-time data
- [Stainless: REST API Pagination](https://www.stainless.com/sdk-api-best-practices/how-to-implement-rest-api-pagination-offset-cursor-keyset) -- keyset vs cursor comparison

### WebSocket Reliability
- [OneUptime: WebSocket Reconnection Logic](https://oneuptime.com/blog/post/2026-01-27-websocket-reconnection/view) -- exponential backoff, jitter, gap recovery patterns
- [DevToolbox: WebSockets Complete Guide 2026](https://devtoolbox.dedyn.io/blog/websocket-complete-guide) -- heartbeat, state management
