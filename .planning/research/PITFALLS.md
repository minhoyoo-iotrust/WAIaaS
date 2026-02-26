# Domain Pitfalls: Advanced DeFi Protocol Integration (Lending/Yield/Perp + PositionTracker + Intent)

**Domain:** Advanced DeFi position management for AI agent wallet system
**Researched:** 2026-02-26
**Overall confidence:** MEDIUM-HIGH (system-specific pitfalls HIGH from codebase analysis; DeFi protocol-specific pitfalls MEDIUM from web research + training data)

---

## Critical Pitfalls

Mistakes that cause data loss, security breaches, fund loss, or require architecture-level rewrites.

---

### Pitfall C1: Stale Position Data Leading to Phantom Health Factor Safety

**What goes wrong:** The system reports a health factor of 1.5 (safe) while the actual on-chain health factor is 1.02 (near liquidation). The AI agent, trusting the cached value, does not act. Liquidation occurs, and the user loses collateral + penalty.

**Why it happens:** Health factor depends on (collateral_value * liquidation_threshold) / debt_value. Both collateral and debt values change continuously with oracle price feeds. A position cached 60 seconds ago can be dangerously stale during high volatility. The existing system's BalanceMonitorService polls every 5 minutes -- this interval is acceptable for balance alerts but catastrophic for health factor monitoring.

**Consequences:**
- Liquidation with 5-15% penalty (protocol-dependent)
- Loss of user trust in autonomous agent
- No recovery possible once liquidated

**Prevention:**
1. Never cache health factor as a single value. Cache the *components* (collateral amounts, debt amounts, oracle prices) and recompute on every query.
2. Implement a tiered polling frequency: safe (HF > 2.0) = 5 min, warning (1.5-2.0) = 1 min, danger (1.0-1.5) = 15 sec, critical (< 1.2) = 5 sec.
3. Use on-chain `getUserAccountData()` (Aave) or equivalent for authoritative values -- never rely solely on off-chain computation.
4. Add `positionLastSyncedAt` timestamp to every API response so the AI agent knows data age.

**Detection:** Monitor the delta between cached HF and on-chain HF during position sync. If delta > 0.1 at any sync point, the polling interval is too long.

**Phase to address:** Monitoring design phase (ILendingMonitor interface + PositionSyncService)

---

### Pitfall C2: SQLite Write Contention Under Position Tracking Load

**What goes wrong:** Adding a `positions` table with frequent UPDATE operations (health factor, margin ratio, yield APY) creates write contention with the existing transaction pipeline. SQLite uses database-level locking, not row-level locks. During high-activity periods, the 6-stage pipeline's Stage 1 INSERT and Stage 5/6 UPDATE compete with position tracker UPDATEs, causing `SQLITE_BUSY` errors or noticeable latency spikes.

**Why it happens:** The existing system already has 17 tables with multiple background workers (WAL checkpoint, session cleanup, version check, async-polling, balance-monitor, incoming-tx-monitor). Adding position tracking creates a new high-frequency write pattern. SQLite WAL mode allows concurrent reads but still serializes writes. Each position update (especially across multiple wallets) holds the write lock.

**Consequences:**
- Pipeline Stage 1 INSERT delayed or fails with SQLITE_BUSY
- AsyncPollingService `pollAll()` conflicts with PositionTracker updates
- Under load, cascade of timeouts across background workers

**Prevention:**
1. **Never update position data inline with the pipeline.** Position tracking must be a separate background worker with its own write cadence, not triggered by individual transactions.
2. **Batch position updates.** Instead of N individual UPDATEs (one per position), use a single prepared statement in a transaction: `BEGIN; UPDATE positions SET ... WHERE id = ?; ... COMMIT;` This holds the write lock once, not N times.
3. **Use `busy_timeout` pragma.** The existing system should already have this set, but position tracking adds load that may require increasing it to 5000ms.
4. **Keep position data granularity low.** Store last-known health factor + last synced timestamp. Do NOT store every historical price point in SQLite -- use in-memory ring buffers for trend data.
5. **Consider a separate SQLite database file** for position-tracking if write contention becomes measurable. Drizzle supports multiple database connections.

**Detection:** Log write duration for position updates. If p99 > 50ms, contention is becoming a problem. Monitor `SQLITE_BUSY` retry counts.

**Phase to address:** PositionTracker DB schema design phase + implementation phase (DB migration v25+)

---

### Pitfall C3: Intent Signature Replay / Cross-Chain Replay

**What goes wrong:** An EIP-712 signed intent is replayed on a different chain or at a different time, executing an unwanted trade. OR a signed intent is captured and submitted by a different party (front-running).

**Why it happens:** EIP-712 domain separators require `chainId` + `verifyingContract` to prevent cross-chain replay. But over 40 wallet vendors were found to have EIP-712 implementation issues where they don't alert users when signing for a different chainId. If the WAIaaS system generates intents without strict domain binding, or if nonce management has gaps, replays become possible.

**Consequences:**
- Funds drained through replayed intents
- Unauthorized trades executed on different networks
- Silent exploitation (user may not notice immediately)

**Prevention:**
1. **Mandatory fields in every intent signature:** `chainId` (from wallet's resolved network), `verifyingContract` (protocol router address), `nonce` (monotonically increasing per-wallet), `deadline` (Unix timestamp, max 5 minutes from creation for AI agents).
2. **Short deadlines for AI agents.** Human traders might want 30-minute deadlines. AI agents should use 2-5 minute deadlines since they can regenerate intents quickly.
3. **Server-side nonce tracking.** Maintain `intent_nonces` table (wallet_id, chain, nonce INTEGER). Increment atomically on intent creation. Validate that submitted nonce matches expected next nonce.
4. **Never sign intents for a chainId that doesn't match the wallet's current resolved network.** Enforce this in the signing pipeline before the private key is accessed.
5. **Intent content display.** Before signing, log the full decoded intent (token, amount, recipient, deadline) in the audit log. AI agents should include intent details in their transaction request.

**Detection:** Monitor for intent submissions with nonce gaps (indicates potential replay attempt or lost intents). Alert on any intent submission after deadline expiry.

**Phase to address:** Intent pattern design phase (IntentBuilder + IntentSigner)

---

### Pitfall C4: Liquidation Alert Timing -- Notification Arrives After Liquidation

**What goes wrong:** The system detects a health factor drop to 1.05, sends a LIQUIDATION_WARNING notification via Telegram/ntfy/Slack. By the time the owner reads the notification and acts (or the AI agent processes it), the health factor has already dropped below 1.0 and liquidation has occurred.

**Why it happens:** The existing notification pipeline has inherent latency: EventBus emit -> NotificationService -> channel delivery -> user reads. For Telegram, this can be 2-10 seconds. For email/Slack, 5-30 seconds. During a flash crash, ETH can drop 5% in 30 seconds, making a 1.05 health factor meaningless by the time the alert arrives.

**Consequences:**
- False sense of security ("I have alerts, I'm safe")
- Owner frustration and trust loss
- System appears defective even when it's working as designed

**Prevention:**
1. **Alert thresholds must be aggressive.** Default warning at HF < 1.5 (not 1.1). Default critical at HF < 1.3 (not 1.05). Users should have time to act.
2. **Automated protective actions for AI agents.** When HF < configurable threshold (e.g., 1.2), the agent can auto-repay partial debt or add collateral WITHOUT waiting for owner approval. This is the key differentiator for AI agents vs human users.
3. **Never promise "liquidation protection."** Documentation and skill files must clearly state that monitoring is informational/best-effort. On-chain liquidation bots operate at block-level speed; no polling-based system can compete.
4. **Pre-compute "liquidation price" and show it.** Instead of only monitoring HF, compute and display the exact price at which liquidation would occur. This is more actionable than a dynamic ratio.
5. **Use the existing ApprovalChannelRouter priority for urgency.** Liquidation warnings should bypass DELAY tier and go directly to NOTIFY or APPROVAL depending on severity.

**Detection:** Track time-to-liquidation from last warning. If any liquidation occurs within 60s of warning, the threshold is too tight.

**Phase to address:** DeFi monitoring design phase (new notification event types + threshold configuration)

---

### Pitfall C5: Over-Engineering Position Management for AI Agent Use Case

**What goes wrong:** The system builds a full-featured DeFi position management dashboard with real-time P&L, historical charts, impermanent loss calculators, yield comparison matrices, funding rate history -- features designed for human DeFi power users. The AI agent uses none of these. Instead, it needs a simple API: "What is my health factor?" "Is this position safe?" "Should I rebalance?"

**Why it happens:** DeFi position management is inherently complex, and developers (or design documents) import the complexity of existing DeFi dashboards (Zapper, DeBank, DeFi Llama) into the system. The WAIaaS system serves AI agents that need structured, actionable data -- not visual dashboards.

**Consequences:**
- 3-5x development time for features the primary user (AI agent) never uses
- Increased SQLite write load for data only humans would consume
- Maintenance burden for rarely-used visualization features in Admin UI
- Delayed delivery of the features AI agents actually need

**Prevention:**
1. **Design API responses for AI consumption first.** Each endpoint should return a structured assessment: `{ healthFactor: 1.45, risk: 'moderate', suggestedAction: 'none', liquidationPrice: 2850.00 }`. NOT raw position data that requires the AI to compute risk.
2. **Admin UI position views are Phase 2.** Phase 1 is API + MCP tools only. Add Admin UI position panels later as a separate milestone.
3. **Three questions per protocol maximum.** For Lending: "health factor?", "can I borrow more?", "repay how much to reach HF X?". For Yield: "current APY?", "pending rewards?", "time to maturity?". For Perp: "margin ratio?", "unrealized P&L?", "liquidation price?".
4. **No historical data storage in Phase 1.** Position snapshots are ephemeral (current state only). Add position history tracking in a future milestone if there's demand.
5. **Resist the urge to build portfolio aggregation.** "Total DeFi value across all protocols" is a nice-to-have, not a requirement for AI agent operation.

**Detection:** During design review, count the number of API fields. If any endpoint returns > 15 fields, it's likely over-engineered for AI consumption.

**Phase to address:** Provider interface design phase (ILendingProvider/IYieldProvider/IPerpProvider method signatures)

---

## Moderate Pitfalls

Issues that cause significant rework, poor UX, or operational problems but don't risk fund loss.

---

### Pitfall M1: Monitoring Polling Frequency vs Resource Exhaustion

**What goes wrong:** The PositionMonitor polls every protocol every 15 seconds for every wallet with an open position. With 10 wallets, 3 protocols each, that's 30 RPC calls per cycle = 120 RPC calls/minute. The existing RPC Pool rotates endpoints, but each call costs latency and potentially rate limits.

**Why it happens:** The temptation to poll frequently ("more frequent = safer") ignores the resource cost curve. The existing system already has: AsyncPollingService (30s), BalanceMonitorService (5min), IncomingTxMonitorService (WebSocket subscription). Adding position monitoring creates a fourth concurrent poller competing for the same RPC endpoints.

**Prevention:**
1. **Adaptive polling based on position state.** No open positions = no polling. Safe positions (HF > 2.0) = 5 min. At-risk positions = 30s. This is critical for resource efficiency.
2. **Aggregate calls where possible.** Aave's `getUserAccountData()` returns all positions in a single call. Don't call per-asset. For Solana DeFi (e.g., Marginfi), batch account fetches via `getMultipleAccounts()`.
3. **Share the RPC pool budget.** Implement a global RPC call counter. If position monitoring is consuming > 50% of available RPC budget, automatically reduce its polling frequency.
4. **Register with existing BackgroundWorkers.** Don't create a separate setInterval. Use the BackgroundWorkers framework which already handles overlap prevention and graceful shutdown.

**Phase to address:** PositionMonitor implementation phase

---

### Pitfall M2: AsyncPollingService Overload From Position Trackers

**What goes wrong:** The existing AsyncPollingService queries transactions with `bridge_status IN ('PENDING', 'BRIDGE_MONITORING') OR status = 'GAS_WAITING'`. Adding position tracking reuses this service, and suddenly `pollAll()` is processing 50+ items per cycle (original bridge/gas items + new position items). Sequential processing (by design, to avoid rate limits) means a single cycle takes 50+ seconds, exceeding the 30-second interval.

**Why it happens:** The AsyncPollingService was designed for low-volume async operations (bridge completions, gas conditions). It processes items sequentially. Position tracking is fundamentally different -- it's periodic monitoring, not event-driven status tracking.

**Prevention:**
1. **Do NOT reuse AsyncPollingService for position monitoring.** AsyncPollingService tracks *transaction completion* (finite lifecycle). Position monitoring tracks *ongoing state* (indefinite lifecycle). These are different patterns.
2. **Create a dedicated PositionMonitorService** as a separate BackgroundWorker. It polls positions independently from transaction status tracking.
3. **If position-related async tracking is needed** (e.g., waiting for a lending deposit to confirm), THAT goes into AsyncPollingService. But ongoing health factor monitoring does NOT.
4. **Rename clearly.** The IAsyncStatusTracker interface is for lifecycle tracking (start -> poll -> terminal state). Position monitoring is for continuous observation (start -> observe forever -> stop).

**Phase to address:** Architecture/interface design phase (clear separation of concerns)

---

### Pitfall M3: Policy Engine Expansion Explosion

**What goes wrong:** Adding 3 new provider types (lending/yield/perp) seems to require 3+ new PolicyType values: `LENDING_LIMIT`, `YIELD_STRATEGY_WHITELIST`, `PERP_LEVERAGE_LIMIT`, `POSITION_SIZE_LIMIT`, `PROTOCOL_WHITELIST`, etc. The existing 12 PolicyTypes already have complex Admin UI forms, and each new type requires a Zod schema, DatabasePolicyEngine evaluation branch, Admin UI form component, MCP tool parameter, and SDK type.

**Why it happens:** Each DeFi protocol has unique risk parameters. Lending has collateral ratios and borrow limits. Yield has strategy risk tiers. Perps have leverage limits and position size caps. The natural instinct is to model each as a separate policy type.

**Prevention:**
1. **Reuse existing policy types where possible.** `SPENDING_LIMIT` already works for lending deposits. `CONTRACT_WHITELIST` already gates which protocols can be called. `METHOD_WHITELIST` can restrict to specific methods (supply, borrow, repay).
2. **Add at most 2 new PolicyTypes** for the entire DeFi expansion: `POSITION_SIZE_LIMIT` (max value in any single position) and `PROTOCOL_WHITELIST` (which DeFi protocols are allowed). Other controls come from provider configuration, not policy.
3. **Provider-level safety parameters belong in Admin Settings, not in PolicyEngine.** Max leverage, min health factor thresholds, allowed yield strategies -- these are provider configuration, not per-wallet policy.
4. **The discriminatedUnion stays at 5 types.** Lending/Yield/Perp actions all resolve to `ContractCallRequest` via IActionProvider. No new transaction types needed.

**Phase to address:** Policy integration design phase

---

### Pitfall M4: Yield Maturity/Lock-up Period Mismanagement

**What goes wrong:** An AI agent deposits into a yield vault with a 30-day lock-up period. The agent doesn't track this and attempts early withdrawal, which either fails (reverting transaction, wasting gas) or incurs a penalty (e.g., 0.1% early withdrawal fee on Yearn). The system has no concept of "this position cannot be modified until date X."

**Why it happens:** Yield protocols have varied lock-up mechanics: Lido has 1-5 day withdrawal queues (already partially handled by LidoWithdrawalTracker), but other protocols have fixed-term vaults, epoch-based lock-ups (like Jito's Solana epochs), or no lock-ups at all. The system has no generic abstraction for "this position has a time constraint."

**Prevention:**
1. **Add `earliestWithdrawAt` to position metadata.** When a deposit is made into a locked vault, record the unlock timestamp. The IYieldProvider must return this from its `deposit()` result.
2. **Enforce lock-up in provider's `withdraw()` resolve method.** Before building the withdrawal transaction, check if the lock-up period has elapsed. Return a descriptive error: `POSITION_LOCKED: Withdrawal available after 2026-03-15T12:00:00Z (5 days remaining)`.
3. **Include lock-up info in position query responses.** `{ locked: true, unlocksAt: "2026-03-15T12:00:00Z", earlyWithdrawalPenalty: "0.1%" }`.
4. **Reuse the existing AsyncPollingService for maturity tracking.** Register a `YieldMaturityTracker` that transitions from PENDING to COMPLETED when the lock-up period expires, emitting a `YIELD_MATURED` notification.

**Phase to address:** IYieldProvider interface design + PositionTracker schema

---

### Pitfall M5: Margin Call / Funding Rate Compounding in Perp Positions

**What goes wrong:** A perpetual futures position accrues negative funding rates over time. The AI agent opened a long position paying 0.01% per 8 hours, which seems small. After 30 days, the cumulative funding cost is ~0.9% of position value. Combined with maintenance margin requirements, the effective margin ratio has silently degraded, and the position gets liquidated without the agent understanding why.

**Why it happens:** Funding rates are continuous micro-payments between longs and shorts. They don't trigger discrete events -- they compound silently. The system's event-driven architecture (EventBus + notifications) has no natural trigger for "your margin has been slowly eroded."

**Prevention:**
1. **Track cumulative funding costs per position.** Store `cumulativeFundingCost` in position metadata. Update on each monitoring cycle by fetching the position's funding history from the protocol.
2. **Alert on cumulative funding exceeding threshold.** If cumulative funding cost exceeds X% of initial margin (e.g., 5%), emit a `PERP_FUNDING_WARNING` notification.
3. **Include effective margin (margin - cumulative_funding) in position queries.** Not just the nominal margin. This shows the real liquidation buffer.
4. **For AI agents: include funding rate in position risk assessment.** `{ marginRatio: 0.15, effectiveMarginRatio: 0.12, cumulativeFundingCostPct: 2.1, dailyFundingRatePct: 0.03 }`.

**Phase to address:** IPerpProvider interface design + monitoring implementation

---

### Pitfall M6: Notification Event Type Explosion

**What goes wrong:** Adding lending, yield, and perp monitoring generates many new notification event types: `HEALTH_FACTOR_WARNING`, `HEALTH_FACTOR_CRITICAL`, `HEALTH_FACTOR_RECOVERED`, `LENDING_LIQUIDATED`, `YIELD_MATURED`, `YIELD_APY_DROPPED`, `PERP_MARGIN_WARNING`, `PERP_MARGIN_CRITICAL`, `PERP_FUNDING_HIGH`, `PERP_LIQUIDATED`, `POSITION_OPENED`, `POSITION_CLOSED`, `POSITION_VALUE_CHANGED`... The existing NOTIFICATION_EVENT_TYPES enum has 40 values. Adding 10-15 more creates maintenance burden, notification channel formatting work, and i18n entries.

**Why it happens:** Each DeFi concept has its own lifecycle events. The natural modeling is one event type per state transition.

**Prevention:**
1. **Use a hierarchical event pattern.** Instead of 15 specific types, add 4-5 generic types with `details` discriminator: `POSITION_WARNING` (with `details.type: 'health_factor' | 'margin' | 'funding'`), `POSITION_CRITICAL`, `POSITION_RESOLVED`, `POSITION_LIFECYCLE` (opened/closed/matured).
2. **Leverage the existing notification priority system.** The WalletNotificationChannel already has priority levels. Map warning severity to priority, not to different event types.
3. **Maximum 6 new event types** for the entire DeFi expansion. Not 15.

**Phase to address:** Notification integration design phase

---

### Pitfall M7: IActionProvider Interface Strain -- Resolve Returns ContractCallRequest but DeFi Needs Richer Context

**What goes wrong:** The existing IActionProvider.resolve() returns `ContractCallRequest | ContractCallRequest[]`. For simple swaps, this works. But lending operations need to return position metadata (new health factor after operation, required collateral ratio). Yield operations need to return expected APY and lock-up period. Perps need to return margin requirements and liquidation price. The resolved ContractCallRequest has no field for this provider-specific context.

**Why it happens:** IActionProvider was designed for one-shot operations (swap, bridge, stake). Position-modifying operations need both the transaction AND information about the resulting position state.

**Prevention:**
1. **Extend resolve() return type.** Instead of just `ContractCallRequest`, return `{ request: ContractCallRequest | ContractCallRequest[], positionImpact?: PositionImpact }`. The `positionImpact` is optional (backward compatible) and contains protocol-specific metadata about how the position will change.
2. **Alternatively, use the existing `metadata` field on ContractCallRequest.** Store provider context as `{ metadata: { estimatedHealthFactor: 1.8, lockUpDays: 5 } }`. This flows through the pipeline and is stored in the transaction record.
3. **DO NOT create ILendingProvider/IYieldProvider/IPerpProvider as replacements for IActionProvider.** They should be *extensions* that add position-query methods while reusing IActionProvider for transaction resolution.

**Phase to address:** Provider interface design phase (ILendingProvider extends IActionProvider pattern)

---

## Minor Pitfalls

Issues that cause inconvenience or suboptimal behavior but are easily fixable.

---

### Pitfall N1: DB Migration Complexity -- positions Table Interactions

**What goes wrong:** The positions table needs foreign keys to wallets and potentially to transactions (the transaction that opened the position). Adding a new table with FK relationships to existing tables in a migration that also modifies existing table behavior creates a complex migration step. The existing migration chain (v1-v24) is already long.

**Prevention:**
1. **Single-purpose migration.** Migration v25: add `positions` table (and `position_snapshots` if needed). Do NOT combine with other schema changes.
2. **Test the full migration chain** from v1 to v25. The existing chain test pattern covers this.
3. **positions.tx_id FK is optional** (nullable). Some positions are discovered by scanning, not created by our pipeline.

**Phase to address:** DB schema design phase

---

### Pitfall N2: Admin Settings Bloat From Provider Configuration

**What goes wrong:** Each new provider (lending/yield/perp) adds 5-10 settings to Admin Settings. With 3 providers per protocol and 3 protocol types, that's potentially 45-90 new settings. The Admin UI Settings page becomes unwieldy.

**Prevention:**
1. **Group settings by provider** in the Admin UI, collapsible sections.
2. **Use sensible defaults aggressively.** Most settings should never need changing. Only expose `enabled` and critical thresholds in the primary view.
3. **Defer provider-specific tuning to Phase 2.** Phase 1: enabled/disabled + critical safety thresholds only.

**Phase to address:** Admin Settings integration phase

---

### Pitfall N3: Intent Pattern Scope Creep

**What goes wrong:** "Intent-based trading" is a broad concept. The team starts implementing a general-purpose intent system that handles arbitrary user intents (swap, lend, bridge, anything). This becomes an intent DSL, an intent solver network, and suddenly the system is rebuilding 1inch Fusion / CoW Protocol.

**Prevention:**
1. **Scope intents narrowly.** Intents in WAIaaS are EIP-712 signed messages for specific supported operations (swap via specific DEX, supply to specific lending pool). NOT arbitrary intent resolution.
2. **No solver network.** WAIaaS doesn't run solvers. It signs intents that are submitted to existing solver networks (1inch Fusion, CoW Protocol, UniswapX).
3. **Intent = "signed off-chain message that a protocol's smart contract verifies on-chain."** Nothing more. Keep this definition strict.

**Phase to address:** Intent pattern design phase

---

### Pitfall N4: Solana DeFi Program Incompatibility with ContractCallRequest Model

**What goes wrong:** Solana DeFi programs (Marginfi, Kamino, Drift) use a different interaction model than EVM. They require specific account layouts, program-derived addresses (PDAs), and instruction-level composability that doesn't map cleanly to the ContractCallRequest model designed for EVM calldata.

**Prevention:**
1. **Already partially solved.** The existing system handles Solana programs via `instructionData` + `accounts` fields in ContractCallRequest (see Jupiter implementation). Ensure this pattern extends to DeFi programs.
2. **PDA derivation is provider responsibility.** The provider resolves PDAs during `resolve()`. The pipeline doesn't need to know about PDAs.
3. **Multi-instruction Solana DeFi operations** (e.g., create account + deposit) use the existing BATCH type or resolve() returning `ContractCallRequest[]`.

**Phase to address:** Solana DeFi provider implementation

---

### Pitfall N5: Testing DeFi Monitoring Without Mainnet Positions

**What goes wrong:** Unit tests mock position data, but integration tests need real positions on testnets. Aave has testnet deployments (Sepolia), but not all DeFi protocols have testnets (e.g., many Solana DeFi protocols are mainnet-only). This creates a testing gap for monitoring logic.

**Prevention:**
1. **Use the existing 3-tier test strategy:** Unit tests with mocked positions (health factor scenarios), integration tests with testnet protocols where available, fixtures for mainnet-only protocols.
2. **Create a `MockPositionProvider`** that simulates position state changes for monitoring tests. Include scenarios: gradual HF degradation, sudden price crash, funding rate accumulation.
3. **Position monitoring logic should be protocol-agnostic.** Test the monitoring loop independently of specific protocol data fetching.

**Phase to address:** Test strategy design phase

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| ILendingProvider interface design | C5 over-engineering + M7 resolve return type | Extend IActionProvider, add only query methods. Max 3 query methods. |
| IYieldProvider interface design | M4 lock-up mismanagement | `earliestWithdrawAt` mandatory in deposit result. |
| IPerpProvider interface design | M5 funding rate blindness + C5 over-engineering | Include cumulative funding in position query. Max 3 query methods. |
| PositionTracker DB schema | C2 SQLite contention + N1 migration | Batch writes, separate worker, single-purpose migration v25. |
| Position monitoring service | C1 stale data + M1 resource exhaustion + M2 AsyncPolling overload | Adaptive polling, dedicated worker (not AsyncPollingService), tiered intervals. |
| Liquidation alerting | C4 timing problem | Aggressive thresholds, auto-protective actions for agents, never promise protection. |
| Intent pattern implementation | C3 replay attack + N3 scope creep | Strict domain binding, short deadlines, narrow scope. |
| Policy integration | M3 policy explosion | Reuse existing types, max 2 new PolicyTypes. |
| Notification integration | M6 event type explosion | Hierarchical events, max 6 new types. |
| Admin UI integration | N2 settings bloat + C5 over-engineering | Phase 2 for Admin UI views. Phase 1 = API/MCP only. |
| Solana DeFi providers | N4 program incompatibility | Reuse existing instructionData + accounts pattern. |
| Testing | N5 mainnet-only protocols | MockPositionProvider, protocol-agnostic monitoring tests. |

---

## Integration Pitfalls (Specific to Existing WAIaaS System)

These pitfalls arise specifically from the interaction between new DeFi features and the existing codebase.

---

### Integration I1: BackgroundWorker Accumulation

**Current state:** 6+ registered workers (wal-checkpoint, session-cleanup, version-check, async-polling, balance-monitor, incoming-tx-monitor). Adding position-monitor + any protocol-specific workers = 8+ workers all sharing setInterval timers.

**Risk:** Timer drift, CPU spike when multiple workers fire simultaneously, and the 5-second `stopAll()` timeout may not be enough for position monitoring to complete its polling cycle.

**Prevention:** Stagger worker intervals (don't use round numbers for all: use 47s instead of 45s, 307s instead of 300s). Increase `stopAll()` timeout proportionally. Audit total worker count before adding new ones.

---

### Integration I2: EventBus Listener Leak

**Current state:** EventBus (Node.js EventEmitter) has listeners for notifications, kill switch, auto-stop, approval workflow. Adding position monitoring events + DeFi-specific events may exceed the default maxListeners (10).

**Risk:** Node.js warnings about potential memory leak, or worse, silent event dropping.

**Prevention:** Audit listener count after adding position monitoring. Set maxListeners explicitly if needed. Consider using a single DeFi position listener that delegates internally.

---

### Integration I3: RPC Pool Budget Contention

**Current state:** RPC Pool with multi-endpoint rotation (v28.6). Used by: pipeline Stage 5, balance monitor, incoming TX subscribers, async polling service. Position monitoring adds another consumer.

**Risk:** Hitting rate limits on RPC endpoints, causing pipeline failures (higher priority than monitoring).

**Prevention:** Implement RPC call budgeting with priority: pipeline > incoming TX > position monitoring > balance monitoring. Position monitoring should back off when RPC errors increase.

---

### Integration I4: Transaction `metadata` JSON Field Overload

**Current state:** The `transactions.metadata` column (TEXT, JSON) stores provider-specific data. The `bridgeMetadata` column stores async tracking data. Adding position-related metadata (health factor impact, lock-up info, intent signature) to these JSON blobs makes them harder to query and index.

**Risk:** No efficient way to query "all transactions that affected lending positions" without parsing JSON.

**Prevention:** Use the separate `positions` table for position state. Transaction metadata stores only the transaction's provider context. Link via FK: `positions.last_tx_id -> transactions.id`.

---

## Sources

- Aave Health Factor & Liquidations documentation: https://aave.com/help/borrowing/liquidations
- Aave V3 Pool documentation: https://aave.com/docs/aave-v3/smart-contracts/pool
- Aave V3 Oracle Sentinel: https://aave.com/docs/aave-v3/smart-contracts/view-contracts
- EIP-712 implementation issues affecting 40+ wallets: https://www.coinspect.com/blog/chainid-eip-712-implementation-issue/
- EIP-712 risks (Auditor's Digest): https://medium.com/@chinmayf/auditors-digest-the-risks-of-eip712-5a0fc57e3837
- EIP-712 normalization phishing: https://coinpaper.com/3546/wallet-drainers-can-bypass-security-by-exploiting-eip-712-normalization
- SQLite concurrency limitations: https://dev.to/lovestaco/sqlite-limitations-and-internal-architecture-4o62
- SQLite high-performance optimizations: https://www.powersync.com/blog/sqlite-optimizations-for-ultra-high-performance
- AI agent DeFi trading mistakes ($450K incident): https://www.cryptotimes.io/2026/02/23/ai-agent-accidentally-sends-450k-sparks-autonomous-trading-debate/
- AI agent pilot failure patterns: https://composio.dev/blog/why-ai-agent-pilots-fail-2026-integration-roadmap
- DeFi auto-deleveraging pitfalls: https://fastercapital.com/content/Auto-Deleveraging--ADL---Avoiding-the-Pitfalls--The-Importance-of-Auto-Deleveraging-in-Perpetual-Futures.html
- Polling vs event-driven architecture: https://www.designgurus.io/course-play/grokking-system-design-fundamentals/doc/eventdriven-vs-polling-architecture
- ERC-2612 Permit nonce management: https://eips.ethereum.org/EIPS/eip-2612
- WAIaaS codebase: `packages/daemon/src/services/async-polling-service.ts`, `packages/core/src/enums/policy.ts`, `packages/actions/src/common/async-status-tracker.ts`, `packages/daemon/src/lifecycle/workers.ts`, `packages/daemon/src/infrastructure/database/schema.ts`
