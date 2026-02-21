# Phase 226: Monitor Service + Resilience - Research

**Researched:** 2026-02-22
**Domain:** IncomingTxMonitorService orchestration, memory queue + batch flush, multiplexer, safety rules, lifecycle
**Confidence:** HIGH

## Summary

Phase 226 implements the central orchestration layer for incoming transaction monitoring. The prior phases (224, 225) established the foundation: IChainSubscriber interface, IncomingTransaction types, DB v21 (incoming_transactions + incoming_tx_cursors + wallets.monitor_incoming), SolanaIncomingSubscriber, EvmIncomingSubscriber, ConnectionState/reconnectLoop, and SolanaHeartbeat. Phase 226 builds the service layer that coordinates these components.

The implementation involves four major units: (1) IncomingTxQueue for Map-based dedup + batch flush to DB, (2) SubscriptionMultiplexer for sharing WebSocket connections per chain:network and managing reconnection with polling fallback, (3) gap recovery + confirmation upgrade + retention workers, and (4) IncomingTxMonitorService orchestrator with safety rules, KillSwitch integration, notification delivery, and lifecycle management.

All patterns follow established codebase conventions: BackgroundWorkers for periodic tasks, EventBus for typed events, SettingsService for hot-reload configuration, NotificationService.notify() for notification delivery, and DaemonLifecycle fail-soft initialization. The design document (doc 76) provides extremely detailed pseudo-code for every component.

**Primary recommendation:** Implement as 4 plans matching the roadmap split: queue, multiplexer, workers, and orchestrator. Each builds on the previous. Follow design doc 76 pseudo-code closely -- it maps precisely to existing codebase patterns.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUB-05 | Gap recovery via incoming_tx_cursors -- reconnection after blind spot recovers missed transactions | Doc 76 section 5.6 provides detailed recovery algorithm. Cursor tables already exist in DB v21. reconnectLoop from Phase 225 triggers gap recovery on successful reconnect. |
| SUB-06 | SubscriptionMultiplexer shares single WebSocket connection per chain:network combination | Doc 76 section 5.4 defines multiplexer with Map<connectionKey, connection> pattern. Solana needs per-wallet logsSubscribe on shared WS; EVM uses HTTP polling so multiplexer is simpler. |
| STO-02 | IncomingTxQueue memory queue with BackgroundWorkers 5-second batch flush prevents SQLITE_BUSY | Doc 76 section 2.6 provides IncomingTxQueue class with splice-based batch extraction, SQLite transaction wrapper, and ON CONFLICT DO NOTHING. BackgroundWorkers pattern verified in existing codebase (workers.ts). |
| STO-03 | 2-phase transaction status (DETECTED to CONFIRMED) with background confirmation upgrade worker | Doc 76 sections 3.6 (Solana) and 4.6 (EVM) define confirmation workers. Solana: getTransaction(finalized). EVM: block confirmation thresholds per network. Both registered as BackgroundWorkers at 30s interval. |
| STO-04 | tx_hash UNIQUE constraint and Map-based in-memory dedup prevent duplicate transaction records | DB v21 UNIQUE(tx_hash, wallet_id) already in place. In-memory dedup uses Map<compositeKey, IncomingTransaction> in IncomingTxQueue before flush. ON CONFLICT DO NOTHING for DB-level safety. |
| STO-05 | Retention policy worker auto-deletes records older than incoming_retention_days setting | Doc 76 section 2.5 defines retention worker: 1-hour interval, DELETE WHERE detected_at < cutoff. SettingsService provides incoming.retention_days with hot-reload. |
| EVT-01 | EventBus emits 'transaction:incoming' and 'transaction:incoming:suspicious' events | Event types already defined in event-types.ts (Phase 224). IncomingTxEvent and IncomingTxSuspiciousEvent payloads in WaiaasEventMap. Emit after flush inserts to DB. |
| EVT-03 | 3 IIncomingSafetyRule implementations detect dust attacks, unknown tokens, and large amounts | Doc 76 section 6.6 defines DustAttackRule, UnknownTokenRule, LargeAmountRule. Each implements check(tx, context) -> boolean. SafetyRuleContext provides thresholds from SettingsService. |
| EVT-04 | KillSwitch SUSPENDED/LOCKED state suppresses incoming TX notifications while maintaining DB records | KillSwitchService.getState() check before notification delivery. DB insertion proceeds regardless. Notification suppression is a simple state gate. |
| EVT-05 | Per-wallet per-event-type notification cooldown prevents spam | IncomingTxMonitorService maintains Map<walletId:eventType, lastNotifiedAt> for cooldown. Configurable cooldown window prevents repeated notifications for same wallet. |
| CFG-04 | DaemonLifecycle Step 4c-9 initializes IncomingTxMonitorService with fail-soft pattern | Follow existing Step 4c-4 (BalanceMonitorService) pattern exactly: try/catch wrapper, null fallback on failure, console.warn for errors, null assignment. Shutdown step adds stop() call before EventBus cleanup. |
</phase_requirements>

## Standard Stack

### Core

| Library/Module | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @waiaas/core | workspace | IChainSubscriber, IncomingTransaction, EventBus, ConnectionState, reconnectLoop | Already implemented in Phase 224-225 |
| @waiaas/adapters-solana | workspace | SolanaIncomingSubscriber, parseSOLTransfer, parseSPLTransfers | Phase 225 implementation |
| @waiaas/adapters-evm | workspace | EvmIncomingSubscriber | Phase 225 implementation |
| better-sqlite3 | ^11.0 | Direct SQLite access for flush (prepare/transaction) | Project standard -- used throughout daemon |
| drizzle-orm | ^0.38 | DB operations for cursor queries, retention | Project standard ORM |

### Supporting

| Library/Module | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| BackgroundWorkers | internal | Periodic task scheduling (flush, confirm, retain, poll) | 6 workers registered for this service |
| SettingsService | internal | Runtime configuration hot-reload | 7 incoming.* keys |
| NotificationService | internal | Notification delivery with priority routing | INCOMING_TX_DETECTED/SUSPICIOUS events |
| KillSwitchService | internal | State check for notification suppression | Gate before notification emission |
| HotReloadOrchestrator | internal | Settings change dispatch | incoming.* prefix detection |
| generateId | internal | UUID v7 generation | IncomingTransaction IDs |

### Alternatives Considered

None -- all components are internal codebase patterns with no external alternatives needed.

## Architecture Patterns

### Recommended File Structure

```
packages/daemon/src/services/incoming/
  incoming-tx-queue.ts          # IncomingTxQueue (Map dedup + batch flush)
  subscription-multiplexer.ts   # SubscriptionMultiplexer (connection sharing)
  incoming-tx-monitor-service.ts # Main orchestrator
  safety-rules.ts               # IIncomingSafetyRule implementations (3 rules)
  utils.ts                      # getDecimals() helper, confirmation thresholds
  index.ts                      # Re-exports

packages/daemon/src/services/incoming/__tests__/
  incoming-tx-queue.test.ts
  subscription-multiplexer.test.ts
  incoming-tx-monitor-service.test.ts
  safety-rules.test.ts
  utils.test.ts
```

### Pattern 1: Memory Queue + Batch Flush (SQLite Writer Protection)

**What:** Buffer incoming transactions in memory, flush to DB in 5-second batch intervals via BackgroundWorkers. Prevents SQLITE_BUSY contention from concurrent WebSocket callbacks.

**When to use:** Whenever multiple concurrent producers write to the same SQLite table.

**Example (from design doc 76 section 2.6):**
```typescript
class IncomingTxQueue {
  private queue = new Map<string, IncomingTransaction>(); // txHash:walletId -> tx (dedup)
  private readonly MAX_BATCH = 100;

  push(tx: IncomingTransaction): void {
    const key = `${tx.txHash}:${tx.walletId}`;
    if (!this.queue.has(key)) {
      this.queue.set(key, tx);
    }
  }

  flush(sqlite: Database): IncomingTransaction[] {
    if (this.queue.size === 0) return [];
    const batch = Array.from(this.queue.values()).slice(0, this.MAX_BATCH);
    // Remove flushed items from queue
    for (const tx of batch) {
      this.queue.delete(`${tx.txHash}:${tx.walletId}`);
    }
    // SQLite transaction with ON CONFLICT DO NOTHING
    const stmt = sqlite.prepare(`INSERT INTO incoming_transactions (...) VALUES (?, ...) ON CONFLICT(tx_hash, wallet_id) DO NOTHING`);
    const insertMany = sqlite.transaction((txs) => { /* ... */ });
    return insertMany(batch);
  }
}
```

**Key detail:** Design doc specifies array-based queue, but prior decisions state "Map-based dedup at queue level is required". Use Map<compositeKey, IncomingTransaction> instead of array.

### Pattern 2: BackgroundWorkers Registration (Existing Codebase Pattern)

**What:** Register periodic workers for flush, confirmation, retention, and polling.

**Example:**
```typescript
workers.register('incoming-tx-flush', {
  interval: 5_000,
  handler: () => {
    const inserted = queue.flush(sqlite);
    for (const tx of inserted) {
      eventBus.emit('transaction:incoming', { ...tx, timestamp: tx.detectedAt });
    }
  },
});
```

**6 workers total:**
1. `incoming-tx-flush` (5s) -- queue -> DB
2. `incoming-tx-retention` (1hr) -- old record cleanup
3. `incoming-tx-confirm-solana` (30s) -- DETECTED -> CONFIRMED
4. `incoming-tx-confirm-evm` (30s) -- DETECTED -> CONFIRMED
5. `incoming-tx-poll-solana` (configurable, default 30s) -- POLLING state only
6. `incoming-tx-poll-evm` (configurable, default 30s) -- POLLING state only

### Pattern 3: DaemonLifecycle Fail-Soft Initialization

**What:** Service initialization wrapped in try/catch, null fallback on failure.

**Example (following existing Step 4c-4 pattern):**
```typescript
// Step 4c-9: IncomingTxMonitorService initialization (fail-soft)
try {
  if (ss.get('incoming.enabled') === 'true') {
    this.incomingTxMonitorService = new IncomingTxMonitorService({ ... });
    await this.incomingTxMonitorService.start();
    console.debug('Step 4c-9: Incoming TX monitor started');
  } else {
    console.debug('Step 4c-9: Incoming TX monitor disabled');
  }
} catch (err) {
  console.warn('Step 4c-9 (fail-soft): Incoming TX monitor init warning:', err);
  this.incomingTxMonitorService = null;
}
```

### Pattern 4: KillSwitch Notification Suppression

**What:** Check KillSwitch state before emitting notifications. DB records always written.

**Example:**
```typescript
const killState = this.killSwitchService?.getState();
if (killState?.state === 'ACTIVE') {
  await this.notificationService?.notify(eventType, walletId, vars);
}
// DB insert always happens (in flush), regardless of kill switch state
```

### Pattern 5: SubscriptionMultiplexer Connection Sharing

**What:** Map<connectionKey, ConnectionEntry> where key = "chain:network". Multiple wallets share one WebSocket connection.

**Key design points:**
- Solana: single WS connection with multiple logsSubscribe calls (one per wallet)
- EVM: polling-first (D-06), no WS needed for multiplexer -- but multiplexer still tracks subscriptions for pollAll coordination
- ConnectionState (WS_ACTIVE/POLLING_FALLBACK/RECONNECTING) tracked per connection
- reconnectLoop from Phase 225 drives state transitions

### Anti-Patterns to Avoid

- **Direct DB writes in callbacks:** Never call sqlite.prepare() inside onTransaction callbacks. Always buffer to IncomingTxQueue.
- **Blocking queue.push():** The push() method must be synchronous and O(1). No await, no DB, no network.
- **Unbounded queue growth:** MAX_BATCH + splash guard. If queue exceeds a threshold (e.g., 10000), drop oldest entries with a warning log.
- **Ignoring per-wallet isolation:** One wallet's pollAll failure must not block other wallets. Always wrap per-wallet operations in try/catch.
- **Skipping final flush on shutdown:** stop() must flush remaining queue entries before returning.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential backoff + jitter | Custom delay calculation | calculateDelay() from connection-state.ts | Already implemented and tested in Phase 225 |
| Reconnection state machine | Custom state tracking | reconnectLoop() from connection-state.ts | Already handles WS_ACTIVE/POLLING_FALLBACK/RECONNECTING transitions |
| Periodic task execution | Custom setInterval | BackgroundWorkers.register() | Overlap prevention, unref, error isolation built-in |
| Event-driven notifications | Custom event system | EventBus.emit() + NotificationService.notify() | Typed events, listener isolation, priority routing |
| UUID v7 generation | Custom UUID | generateId() from database/id.ts | Project-standard, ms-precision ordering |
| DB migration | Manual schema changes | MIGRATIONS.push() in migrate.ts | Version tracking, incremental, chain-tested |
| Configuration hot-reload | Custom config watcher | HotReloadOrchestrator + SettingsService | Fire-and-forget pattern, subsystem isolation |

**Key insight:** Phase 226 is pure orchestration over existing infrastructure. Every building block (workers, events, notifications, settings, reconnection) already exists. The value is in correct wiring, not novel implementation.

## Common Pitfalls

### Pitfall 1: Queue Memory Leak Under Sustained Load

**What goes wrong:** If flush rate cannot keep up with push rate (e.g., flood of dust transactions), queue grows unbounded.
**Why it happens:** WebSocket subscriptions can deliver hundreds of events per second during token airdrops.
**How to avoid:** Implement MAX_QUEUE_SIZE constant (e.g., 10000). When exceeded, drop oldest entries and log a warning. The ON CONFLICT DO NOTHING at DB level provides a safety net for any duplicates from the dropped + re-detected scenario.
**Warning signs:** Queue size growing monotonically across multiple flush cycles.

### Pitfall 2: Race Condition Between Flush and Safety Rule Evaluation

**What goes wrong:** Design doc 76 section 2.6 note says is_suspicious is set to 0 at push time, then updated after flush. If safety rule evaluation happens between flush and UPDATE, there's a window where the record exists without the correct flag.
**Why it happens:** Safety rule evaluation (DustAttackRule etc.) requires context (PriceOracle USD price, token registry, 30-day average) that may involve async lookups.
**How to avoid:** Run safety rule evaluation inline during flush, before the DB transaction. Set is_suspicious in the INSERT statement directly. If context lookup fails (PriceOracle down), default to is_suspicious = 0 (safe default).
**Warning signs:** Records in DB with is_suspicious = 0 that should be flagged.

### Pitfall 3: Shutdown Without Final Flush

**What goes wrong:** Queue has unflushed transactions when process exits. Those transactions are lost.
**Why it happens:** DaemonLifecycle shutdown calls workers.stopAll() which clears intervals, but doesn't trigger a final flush.
**How to avoid:** IncomingTxMonitorService.stop() must explicitly call queue.flush(sqlite) as its first operation before destroying subscriptions.
**Warning signs:** Queue.size > 0 at shutdown time.

### Pitfall 4: SettingsService Hot-Reload Triggering Multiple reconnectLoop Restarts

**What goes wrong:** Changing incoming.wss_url via Admin Settings should restart the WebSocket connection. If handled carelessly, multiple reconnection attempts overlap.
**Why it happens:** HotReloadOrchestrator fires for each changed key in a batch. Multiple incoming.* keys changed simultaneously could trigger multiple reload calls.
**How to avoid:** IncomingTxMonitorService.updateConfig() should debounce -- tear down once, rebuild once. Use a single async operation that cancels the old reconnect loop before starting a new one.
**Warning signs:** Multiple active reconnectLoop promises for the same chain:network.

### Pitfall 5: EVM Confirmation Worker Checking Every Block

**What goes wrong:** The confirmation worker queries all DETECTED EVM transactions and checks each against current block number. For many pending transactions, this could be slow.
**Why it happens:** Simple implementation queries all DETECTED records without batching.
**How to avoid:** Use SQL index idx_incoming_tx_status (partial index on status='DETECTED') and batch by chain for a single getBlockNumber() call. The EVM confirmation threshold is per-network, so group queries by network.
**Warning signs:** Confirmation worker taking > 5s per cycle.

### Pitfall 6: NOTIFICATION_EVENT_TYPES Array Not Updated

**What goes wrong:** Adding INCOMING_TX_DETECTED and INCOMING_TX_SUSPICIOUS to WaiaasEventMap events but forgetting to update the NOTIFICATION_EVENT_TYPES array in core/src/enums/notification.ts. This causes NotificationService.notify() to fail type checking.
**Why it happens:** Two separate SSoT arrays that need to stay in sync.
**How to avoid:** Update NOTIFICATION_EVENT_TYPES in the same PR. Add a type-level check or test that verifies all eventBus event types that map to notifications are listed in NOTIFICATION_EVENT_TYPES.
**Warning signs:** TypeScript error on NotificationService.notify('INCOMING_TX_DETECTED', ...).

### Pitfall 7: i18n Messages Missing for New Event Types

**What goes wrong:** NotificationService.getNotificationMessage() looks up eventType in messages.notifications[eventType]. If INCOMING_TX_DETECTED/INCOMING_TX_SUSPICIOUS entries are missing from en.ts/ko.ts, it will throw at runtime.
**Why it happens:** New notification event types need corresponding i18n message entries.
**How to avoid:** Add entries to both en.ts and ko.ts in @waiaas/core/src/i18n/ for INCOMING_TX_DETECTED and INCOMING_TX_SUSPICIOUS.
**Warning signs:** Runtime error "Cannot read properties of undefined" from message-templates.ts.

## Code Examples

### IncomingTxQueue with Map-Based Dedup

```typescript
// packages/daemon/src/services/incoming/incoming-tx-queue.ts
import type { Database } from 'better-sqlite3';
import type { IncomingTransaction } from '@waiaas/core';

export class IncomingTxQueue {
  private queue = new Map<string, IncomingTransaction>();
  private readonly MAX_BATCH = 100;
  private readonly MAX_QUEUE_SIZE = 10_000;

  get size(): number { return this.queue.size; }

  push(tx: IncomingTransaction): void {
    if (this.queue.size >= this.MAX_QUEUE_SIZE) {
      // Drop oldest entry to prevent memory leak
      const firstKey = this.queue.keys().next().value;
      if (firstKey) this.queue.delete(firstKey);
    }
    const key = `${tx.txHash}:${tx.walletId}`;
    if (!this.queue.has(key)) {
      this.queue.set(key, tx);
    }
  }

  flush(sqlite: Database): IncomingTransaction[] {
    if (this.queue.size === 0) return [];
    const batch: IncomingTransaction[] = [];
    for (const [key, tx] of this.queue) {
      batch.push(tx);
      this.queue.delete(key);
      if (batch.length >= this.MAX_BATCH) break;
    }
    // ... SQLite transaction with ON CONFLICT DO NOTHING
    return insertedTxs;
  }
}
```

### Safety Rule Implementation

```typescript
// packages/daemon/src/services/incoming/safety-rules.ts
import type { IncomingTransaction } from '@waiaas/core';

export type SuspiciousReason = 'dust' | 'unknownToken' | 'largeAmount';

export interface SafetyRuleContext {
  dustThresholdUsd: number;
  amountMultiplier: number;
  isRegisteredToken: boolean;
  usdPrice: number | null;
  avgIncomingUsd: number | null;
  decimals: number;
}

export interface IIncomingSafetyRule {
  readonly name: SuspiciousReason;
  check(tx: IncomingTransaction, context: SafetyRuleContext): boolean;
}

export class DustAttackRule implements IIncomingSafetyRule {
  readonly name = 'dust' as const;
  check(tx: IncomingTransaction, ctx: SafetyRuleContext): boolean {
    if (ctx.usdPrice === null) return false;
    const amountUsd = Number(tx.amount) * ctx.usdPrice / Math.pow(10, ctx.decimals);
    return amountUsd < ctx.dustThresholdUsd;
  }
}

export class UnknownTokenRule implements IIncomingSafetyRule {
  readonly name = 'unknownToken' as const;
  check(tx: IncomingTransaction, ctx: SafetyRuleContext): boolean {
    if (tx.tokenAddress === null) return false;
    return !ctx.isRegisteredToken;
  }
}

export class LargeAmountRule implements IIncomingSafetyRule {
  readonly name = 'largeAmount' as const;
  check(tx: IncomingTransaction, ctx: SafetyRuleContext): boolean {
    if (ctx.avgIncomingUsd === null || ctx.usdPrice === null) return false;
    const amountUsd = Number(tx.amount) * ctx.usdPrice / Math.pow(10, ctx.decimals);
    return amountUsd > ctx.avgIncomingUsd * ctx.amountMultiplier;
  }
}
```

### HotReloadOrchestrator Extension

```typescript
// Addition to hot-reload.ts
const INCOMING_KEYS_PREFIX = 'incoming.';

// In HotReloadDeps interface:
incomingTxMonitorService?: IncomingTxMonitorService | null;

// In handleChangedKeys():
const hasIncomingChanges = changedKeys.some((k) => k.startsWith(INCOMING_KEYS_PREFIX));
if (hasIncomingChanges) {
  try { this.reloadIncomingMonitor(); }
  catch (err) { console.warn('Hot-reload incoming monitor failed:', err); }
}

private reloadIncomingMonitor(): void {
  const svc = this.deps.incomingTxMonitorService;
  if (!svc) return;
  const ss = this.deps.settingsService;
  svc.updateConfig({
    enabled: ss.get('incoming.enabled') === 'true',
    mode: ss.get('incoming.mode') as 'polling' | 'websocket' | 'auto',
    pollIntervalSec: parseInt(ss.get('incoming.poll_interval'), 10),
    retentionDays: parseInt(ss.get('incoming.retention_days'), 10),
    suspiciousDustUsd: parseFloat(ss.get('incoming.suspicious_dust_usd')),
    suspiciousAmountMultiplier: parseFloat(ss.get('incoming.suspicious_amount_multiplier')),
    wssUrl: ss.get('incoming.wss_url') || '',
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct DB write in callbacks | Memory queue + batch flush | Design doc 76 (v27.0) | Prevents SQLITE_BUSY, enables dedup |
| Per-wallet WebSocket connections | Shared connection per chain:network | Design doc 76 section 5.4 | Reduced resource usage |
| Manual reconnection | reconnectLoop state machine | Phase 225 | 3-state model with automatic fallback |

## Open Questions

1. **NtfyChannel.mapPriority() Update Scope**
   - What we know: Design doc 76 section 6.4 specifies adding SUSPICIOUS pattern matching and INCOMING_TX_DETECTED mapping to mapPriority()
   - What's unclear: The current mapPriority() in ntfy.ts does not have SUSPICIOUS or INCOMING patterns. The doc says to add them.
   - Recommendation: Add as specified in doc 76. Current mapPriority returns 2 for anything not matching KILL_SWITCH/SUSPENDED/FAILED/VIOLATION/APPROVAL/EXPIR. Add SUSPICIOUS -> 4 and INCOMING_TX_DETECTED -> 3.

2. **WalletNotificationChannel Priority Branching**
   - What we know: Doc 76 specifies eventType === 'INCOMING_TX_SUSPICIOUS' -> priority 5
   - What's unclear: Need to verify exact location in WalletNotificationChannel.notify() where priority is determined
   - Recommendation: Check wallet-notification-channel.ts and add the eventType-based branching as specified

3. **PriceOracle Availability for Safety Rules**
   - What we know: DustAttackRule and LargeAmountRule require USD prices from PriceOracle
   - What's unclear: PriceOracle may not have prices for all tokens. How to handle?
   - Recommendation: If usdPrice is null, return false (don't flag as suspicious). This is the documented behavior in doc 76.

4. **Config Schema Extension Timing**
   - What we know: Design doc specifies [incoming] section in config.toml with 7 keys
   - What's unclear: Whether to add DaemonConfigSchema.incoming section or keep all keys in security section like monitoring_*
   - Recommendation: Follow the monitoring_* pattern -- add incoming_* keys to the security section of DaemonConfigSchema. The SettingsService keys use 'incoming.*' prefix regardless of where the config.toml keys live.

5. **NOTIFICATION_EVENT_TYPES Extension**
   - What we know: 28 event types exist. Need to add INCOMING_TX_DETECTED and INCOMING_TX_SUSPICIOUS (-> 30)
   - What's unclear: Whether this was already done in Phase 224
   - Recommendation: Check and update. The current notification.ts has 28 types without incoming events. Must add them.

## Sources

### Primary (HIGH confidence)

- Design doc 76 (`internal/design/76-incoming-transaction-monitoring.md`) -- 2300+ lines, sections 1-8
- Existing codebase files (verified by direct reading):
  - `packages/core/src/interfaces/IChainSubscriber.ts` -- 6-method interface
  - `packages/core/src/interfaces/chain-subscriber.types.ts` -- IncomingTransaction type
  - `packages/core/src/interfaces/connection-state.ts` -- ConnectionState, ReconnectConfig, reconnectLoop
  - `packages/core/src/enums/incoming-tx.ts` -- IncomingTxStatus enum
  - `packages/core/src/events/event-types.ts` -- IncomingTxEvent, IncomingTxSuspiciousEvent, WaiaasEventMap
  - `packages/adapters/solana/src/solana-incoming-subscriber.ts` -- SolanaIncomingSubscriber
  - `packages/adapters/solana/src/incoming-tx-parser.ts` -- parseSOLTransfer, parseSPLTransfers
  - `packages/adapters/evm/src/evm-incoming-subscriber.ts` -- EvmIncomingSubscriber
  - `packages/daemon/src/lifecycle/workers.ts` -- BackgroundWorkers
  - `packages/daemon/src/lifecycle/daemon.ts` -- DaemonLifecycle (startup + shutdown)
  - `packages/daemon/src/infrastructure/settings/hot-reload.ts` -- HotReloadOrchestrator
  - `packages/daemon/src/infrastructure/settings/setting-keys.ts` -- SETTING_DEFINITIONS
  - `packages/daemon/src/infrastructure/config/loader.ts` -- DaemonConfigSchema
  - `packages/daemon/src/notifications/notification-service.ts` -- NotificationService.notify()
  - `packages/daemon/src/notifications/channels/ntfy.ts` -- NtfyChannel.mapPriority()
  - `packages/daemon/src/services/kill-switch-service.ts` -- KillSwitchService.getState()
  - `packages/daemon/src/services/monitoring/balance-monitor-service.ts` -- BalanceMonitorService pattern
  - `packages/daemon/src/infrastructure/database/migrate.ts` -- DB v21 migration (confirmed)
  - `packages/core/src/enums/notification.ts` -- NOTIFICATION_EVENT_TYPES (28 entries, no incoming yet)
  - `packages/core/src/i18n/en.ts`, `ko.ts` -- notification message templates

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` -- 11 requirement IDs mapped to Phase 226
- `.planning/ROADMAP.md` -- Phase 226 description and plan list

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all internal codebase components, verified by direct file reads
- Architecture: HIGH -- design doc 76 provides detailed pseudo-code, verified against existing patterns
- Pitfalls: HIGH -- identified from real code analysis (queue memory, shutdown flush, hot-reload race, notification type sync)

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable -- internal codebase patterns)
