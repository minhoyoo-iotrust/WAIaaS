# Phase 230: Integration Wiring Fixes - Research

**Researched:** 2026-02-22
**Domain:** Daemon lifecycle wiring, background worker orchestration, chain subscriber polling integration
**Confidence:** HIGH

## Summary

Phase 230 addresses three cross-phase integration bugs discovered during the v27.1 milestone audit. All individual components (subscribers, multiplexer, queue, workers, gap recovery handler) are fully implemented and unit-tested. The bugs are exclusively **wiring issues** -- the components are not connected to each other correctly at the daemon lifecycle level.

The three bugs are:

1. **BUG-1 (Critical):** `BackgroundWorkers` instance separation -- `IncomingTxMonitorService` registers its 6 workers into an orphaned `BackgroundWorkers` instance because `this.workers` is null at Step 4c-9 (it's created at Step 6). The fallback `this.workers ?? new BackgroundWorkers()` creates a disposable instance whose `startAll()` is never called.

2. **BUG-2 (Critical):** Polling workers 5 and 6 (Solana/EVM) have empty handlers -- they contain only comments. The `pollAll()` method exists on both subscriber classes but is never called. This is especially critical for EVM where `connect()` is a no-op and polling is the **only** detection mechanism.

3. **BUG-3 (High):** The `onGapRecovery` callback in `SubscriptionMultiplexer` is a `console.debug()` stub. The `createGapRecoveryHandler` factory function exists and is tested, but it needs access to the multiplexer's internal `connections` Map to retrieve subscriber instances.

**Primary recommendation:** Fix the three wiring bugs with minimal changes to existing code. Use Option A (move monitor init after Step 6) for BUG-1. Add a `getSubscribers()` accessor to `SubscriptionMultiplexer` for BUG-2 and BUG-3. Wire `createGapRecoveryHandler` into the `onGapRecovery` callback. All fixes are pure wiring -- no new algorithms or data structures needed.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUB-02 | SolanaIncomingSubscriber pollAll() for SOL/SPL/Token-2022 detection | BUG-2 fix: wire Worker 5 handler to call subscriber.pollAll() via multiplexer accessor |
| SUB-03 | EvmIncomingSubscriber getLogs/getBlock for ERC-20/native ETH detection | BUG-2 fix: wire Worker 6 handler to call subscriber.pollAll() -- this is the ONLY detection path for EVM |
| SUB-04 | WebSocket-to-polling automatic fallback with 3-state connection machine | BUG-2 fix: POLLING_FALLBACK state now triggers actual polling via workers 5/6 |
| SUB-05 | Gap recovery via incoming_tx_cursors -- reconnection recovers missed transactions | BUG-3 fix: wire onGapRecovery to createGapRecoveryHandler with multiplexer subscriber access |
| STO-02 | IncomingTxQueue memory queue with BackgroundWorkers 5-second batch flush | BUG-1 fix: workers registered to daemon's shared BackgroundWorkers instance, startAll() executes them |
| STO-03 | 2-phase transaction status (DETECTED to CONFIRMED) with background confirmation worker | BUG-1 fix: confirmation workers start via shared BackgroundWorkers.startAll() |
| STO-05 | Retention policy worker auto-deletes records older than incoming_retention_days | BUG-1 fix: retention worker starts via shared BackgroundWorkers.startAll() |
| CFG-04 | DaemonLifecycle Step 4c-9 initializes IncomingTxMonitorService with fail-soft pattern | BUG-1 fix: monitor service receives the actual shared BackgroundWorkers instance |

</phase_requirements>

## Standard Stack

### Core

No new libraries needed. All fixes use existing codebase components.

| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| BackgroundWorkers | `packages/daemon/src/lifecycle/workers.ts` | Periodic task scheduler (register + startAll) | Exists, works correctly |
| IncomingTxMonitorService | `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` | Orchestrator for 6 workers | Exists, needs wiring fixes |
| SubscriptionMultiplexer | `packages/daemon/src/services/incoming/subscription-multiplexer.ts` | Shared chain connections per chain:network | Exists, needs accessor method |
| createGapRecoveryHandler | `packages/daemon/src/services/incoming/incoming-tx-workers.ts` | Factory for gap recovery callback | Exists, fully tested |
| DaemonLifecycle | `packages/daemon/src/lifecycle/daemon.ts` | 6-step startup, 10-step shutdown | Exists, needs init order fix |

### Supporting

| Component | Location | Purpose | Relevance |
|-----------|----------|---------|-----------|
| SolanaIncomingSubscriber | `packages/adapters/solana/src/solana-incoming-subscriber.ts` | Solana subscriber with pollAll() | Target of Worker 5 |
| EvmIncomingSubscriber | `packages/adapters/evm/src/evm-incoming-subscriber.ts` | EVM subscriber with pollAll() | Target of Worker 6 (critical -- only detection path) |
| reconnectLoop | `packages/core/src/interfaces/connection-state.ts` | 3-state connection machine | Drives gap recovery trigger |
| IncomingTxQueue | `packages/daemon/src/services/incoming/incoming-tx-queue.ts` | Memory buffer with Map dedup | Queue for flush worker |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Option A: Move init after Step 6 | Option B: self-startAll() in monitor | B adds complexity; monitor should not own worker lifecycle |
| Option A: Move init after Step 6 | Option C: deferred injection (lazy ref) | C adds indirection; init order fix is simpler and sufficient |
| getSubscribers() accessor | Exposing connections Map directly | Accessor preserves encapsulation |

## Architecture Patterns

### Pattern 1: Daemon Initialization Order Fix (BUG-1)

**What:** Move IncomingTxMonitorService initialization from Step 4c-9 (before workers exist) to after Step 6 (after `this.workers` is created and `startAll()` is called).

**When to use:** When a service depends on BackgroundWorkers but is currently initialized before BackgroundWorkers exists.

**Current Code (daemon.ts line 791):**
```typescript
// Step 4c-9 (line ~788-798):
this.incomingTxMonitorService = new IncomingTxMonitorCls({
  sqlite: this.sqlite,
  db: this._db!,
  workers: this.workers ?? new BackgroundWorkers(),  // BUG: this.workers is null here
  eventBus: this.eventBus,
  // ...
});
await this.incomingTxMonitorService.start();  // Registers 6 workers to orphaned instance
```

**Fix Approach:**

The cleanest fix is to split the monitor service initialization:
1. Keep the IncomingTxMonitorService **construction** at Step 4c-9 but defer worker registration.
2. After Step 6 creates `this.workers` and calls `startAll()`, have the monitor service register its workers to the shared instance.

However, the simpler approach is:
- Move the entire Step 4c-9 block to execute **after** Step 6 (line 1076) where `this.workers = new BackgroundWorkers()` and `this.workers.startAll()` happen.
- Then the monitor service's workers get registered to the real instance.
- BUT: `startAll()` at line 1076 has already been called, so workers registered after `startAll()` won't be started.

**Critical Insight:** `BackgroundWorkers.startAll()` iterates `this.registrations` at call time. Workers registered AFTER `startAll()` are NOT started. This means we can't simply move init after Step 6 without also calling `startAll()` again or using a different approach.

**Best Approach (Option B variant):** Pass the real `this.workers` to the monitor service. The monitor service calls `this.workers.register()` during `start()`. Then in Step 6, `this.workers.startAll()` starts all workers including the monitor's 6.

Wait -- this still doesn't work because Step 4c-9 runs BEFORE Step 6. The core problem is temporal: the monitor registers workers to the BackgroundWorkers instance, but `startAll()` runs later. This is actually the **correct** flow IF the monitor uses the same instance.

**Corrected Best Approach:**
1. Create `this.workers = new BackgroundWorkers()` BEFORE Step 4c-9 (move the creation earlier).
2. Step 4c-9 passes `this.workers` to the monitor service. Monitor registers its 6 workers.
3. Step 6 registers its own workers (WAL, session, delay, etc.) to the same instance.
4. Step 6 calls `this.workers.startAll()` which starts ALL registered workers (both daemon's and monitor's).

This requires moving `this.workers = new BackgroundWorkers()` from Step 6 to earlier (e.g., before Step 4c-9). The rest of Step 6 (register daemon workers + startAll + PID) stays where it is.

```typescript
// Before Step 4c-9 (new):
this.workers = new BackgroundWorkers();

// Step 4c-9 (existing, line ~788-798):
this.incomingTxMonitorService = new IncomingTxMonitorCls({
  // ...
  workers: this.workers,  // FIX: now uses the real shared instance
  // ...
});
await this.incomingTxMonitorService.start();  // Registers 6 workers to shared instance

// Step 6 (existing, line ~996-1076):
// REMOVE: this.workers = new BackgroundWorkers();  // No longer needed here
// Keep: register daemon's own workers to this.workers
// Keep: this.workers.startAll();  // Now starts ALL workers (daemon + monitor)
```

### Pattern 2: Multiplexer Subscriber Accessor (BUG-2 + BUG-3)

**What:** Add public accessor methods to `SubscriptionMultiplexer` to expose subscriber instances for polling and gap recovery, without exposing the internal `connections` Map directly.

**Why needed:** Both BUG-2 (polling workers need to call `subscriber.pollAll()`) and BUG-3 (gap recovery needs subscriber access) require the multiplexer to expose its internal subscriber references.

**Key Type Challenge:** `pollAll()` is NOT part of the `IChainSubscriber` interface. It's an extra method on both `SolanaIncomingSubscriber` and `EvmIncomingSubscriber`. The multiplexer stores subscribers as `IChainSubscriber` which doesn't include `pollAll()`.

**Solution:** The `createGapRecoveryHandler` deps type is already:
```typescript
interface GapRecoveryDeps {
  subscribers: Map<string, { subscriber: { pollAll: () => Promise<void> } }>;
}
```

So the accessor should return a compatible type. Add to `SubscriptionMultiplexer`:

```typescript
/**
 * Get the connections Map for external access (polling workers, gap recovery).
 * Returns a read-only view of the internal connections as subscriber entries
 * with pollAll() typed via duck-typing (the actual subscriber classes have it).
 */
getSubscriberEntries(): Map<string, { subscriber: { pollAll: () => Promise<void> } }> {
  // Cast is safe: both SolanaIncomingSubscriber and EvmIncomingSubscriber
  // implement pollAll() even though IChainSubscriber doesn't declare it.
  return this.connections as unknown as Map<string, { subscriber: { pollAll: () => Promise<void> } }>;
}
```

Alternatively, add a more targeted accessor:

```typescript
/**
 * Get subscribers for a specific chain (for polling workers).
 */
getSubscribersForChain(chain: string): Array<{ key: string; subscriber: IChainSubscriber }> {
  const result: Array<{ key: string; subscriber: IChainSubscriber }> = [];
  for (const [key, entry] of this.connections) {
    if (key.startsWith(`${chain}:`)) {
      result.push({ key, subscriber: entry.subscriber });
    }
  }
  return result;
}
```

### Pattern 3: Polling Worker Implementation (BUG-2)

**What:** Fill the empty Worker 5 and Worker 6 handlers with actual polling logic.

**Current (empty):**
```typescript
// Worker 5 (Solana polling):
this.workers.register('incoming-tx-poll-solana', {
  interval: this.config.pollIntervalSec * 1000,
  handler: async () => {
    // Poll for POLLING_FALLBACK state Solana connections
    // (empty -- BUG-2)
  },
});
```

**Fix:**
```typescript
// Worker 5 (Solana polling):
this.workers.register('incoming-tx-poll-solana', {
  interval: this.config.pollIntervalSec * 1000,
  handler: async () => {
    const entries = this.multiplexer.getSubscribersForChain('solana');
    for (const { subscriber } of entries) {
      try {
        await (subscriber as any).pollAll();
      } catch (err) {
        console.warn('Solana polling worker error:', err);
      }
    }
  },
});
```

**EVM-specific consideration:** EVM is polling-first -- `pollAll()` is the ONLY detection mechanism. Worker 6 should ALWAYS poll for EVM, regardless of connection state (since EVM's `connect()` is a no-op and it stays in `WS_ACTIVE` permanently).

For Solana, Worker 5 should ideally only poll when in `POLLING_FALLBACK` state (WebSocket handles normal detection). However, the simpler approach is to always poll -- `pollAll()` is idempotent and cheap when there are no new transactions. The subscriber's internal `lastBlock`/last-signature tracking prevents duplicate detection.

### Pattern 4: Gap Recovery Wiring (BUG-3)

**What:** Replace the `console.debug()` stub in `onGapRecovery` with a call to `createGapRecoveryHandler`.

**Current (stub):**
```typescript
this.multiplexer = new SubscriptionMultiplexer({
  // ...
  onGapRecovery: async (chain, network, _walletIds) => {
    console.debug(`Gap recovery triggered for ${chain}:${network}`);
  },
});
```

**Fix:** Wire `createGapRecoveryHandler` using the multiplexer's subscriber accessor:

```typescript
this.multiplexer = new SubscriptionMultiplexer({
  // ...
  onGapRecovery: async (chain, network, walletIds) => {
    const handler = createGapRecoveryHandler({
      subscribers: this.multiplexer.getSubscriberEntries(),
    });
    await handler(chain, network, walletIds);
  },
});
```

Or more efficiently, create the handler once after multiplexer creation:

```typescript
this.multiplexer = new SubscriptionMultiplexer({
  subscriberFactory: this.subscriberFactory,
  onTransaction: (tx) => this.queue.push(tx),
  // onGapRecovery wired below after multiplexer is available
});

// Wire gap recovery using the multiplexer's own connections
const gapHandler = createGapRecoveryHandler({
  subscribers: this.multiplexer.getSubscriberEntries(),
});
// Need to set onGapRecovery after construction...
```

**Problem:** The `onGapRecovery` callback is set in the constructor and stored as `this.deps.onGapRecovery`. There's no setter. Options:
1. Add a `setGapRecoveryCallback()` method to `SubscriptionMultiplexer`.
2. Use a closure that captures `this.multiplexer` (which is assigned after `new SubscriptionMultiplexer()`).
3. Make the callback reference `this.multiplexer` lazily in the closure.

**Best option:** The closure approach works because `this.multiplexer` is a class field on `IncomingTxMonitorService`. By the time `onGapRecovery` is actually called (on reconnection), `this.multiplexer` is already set:

```typescript
this.multiplexer = new SubscriptionMultiplexer({
  subscriberFactory: this.subscriberFactory,
  onTransaction: (tx) => this.queue.push(tx),
  onGapRecovery: async (chain, network, walletIds) => {
    // 'this.multiplexer' is captured in closure and is set by the time this executes
    const handler = createGapRecoveryHandler({
      subscribers: this.multiplexer.getSubscriberEntries(),
    });
    await handler(chain, network, walletIds);
  },
});
```

This works because:
- `this.multiplexer` is assigned the result of `new SubscriptionMultiplexer(...)` on the same line.
- `onGapRecovery` is never called during construction -- it's only called by `reconnectLoop` after a disconnect+reconnect cycle.
- The closure captures `this` (the `IncomingTxMonitorService` instance), not `this.multiplexer` directly.

### Anti-Patterns to Avoid

- **Exposing internal Map directly:** Don't return `this.connections` from the multiplexer. Use an accessor that returns a compatible but narrowed type.
- **Calling startAll() multiple times:** `BackgroundWorkers.startAll()` iterates all registrations. Calling it twice would create duplicate timers. Ensure it's called exactly once.
- **Adding pollAll() to IChainSubscriber interface:** This would be a breaking change across all adapter packages. Use duck-typing / type assertion instead.
- **Conditionally polling based on connection state in Worker 5:** While theoretically correct (only poll Solana in POLLING_FALLBACK), unconditional polling is simpler, idempotent, and safer. The subscriber handles dedup internally.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gap recovery | Custom recovery logic | `createGapRecoveryHandler` from incoming-tx-workers.ts | Already implemented and tested (8 tests) |
| Polling orchestration | New polling scheduler | `BackgroundWorkers.register()` interval pattern | Prevents overlap, handles errors, unref'd timers |
| Subscriber access | Custom registry | `SubscriptionMultiplexer` with accessor method | Already manages subscriber lifecycle |
| Reconnection logic | Custom reconnect | `reconnectLoop` from @waiaas/core | 3-state machine already handles all transitions |

**Key insight:** Every component needed for these fixes already exists. The task is purely wiring -- connecting existing, tested pieces. No new algorithms, data structures, or external dependencies are needed.

## Common Pitfalls

### Pitfall 1: Double startAll()

**What goes wrong:** If `BackgroundWorkers.startAll()` is called twice, every registered worker gets two `setInterval` timers, causing double execution.
**Why it happens:** Moving `this.workers = new BackgroundWorkers()` earlier might lead to `startAll()` being called in multiple places.
**How to avoid:** Ensure `startAll()` is called exactly once, at Step 6, after ALL worker registrations (both daemon's and monitor's) are complete.
**Warning signs:** Workers running at 2x expected frequency; duplicate DB writes.

### Pitfall 2: Circular Reference in onGapRecovery Closure

**What goes wrong:** The `onGapRecovery` callback references `this.multiplexer`, but `this.multiplexer` is being assigned in the same statement.
**Why it happens:** JavaScript closure semantics -- the callback captures `this`, not the value of `this.multiplexer` at closure creation time.
**How to avoid:** This actually works correctly in JavaScript. The closure captures `this` and reads `this.multiplexer` lazily when invoked. By that time, the assignment is long complete.
**Warning signs:** Only a problem if `onGapRecovery` were called synchronously during construction (it's not).

### Pitfall 3: pollAll() Type Mismatch

**What goes wrong:** Compiler error when calling `subscriber.pollAll()` because `IChainSubscriber` doesn't define `pollAll()`.
**Why it happens:** The interface has 6 methods; `pollAll()` is an extra method on concrete classes.
**How to avoid:** Use duck-typing in the accessor return type: `{ subscriber: { pollAll: () => Promise<void> } }`. Or use type assertion `(subscriber as any).pollAll()`.
**Warning signs:** TypeScript compilation errors on `pollAll` property access.

### Pitfall 4: Worker Registration After startAll()

**What goes wrong:** If the monitor service's `start()` (which calls `registerWorkers()`) runs after `this.workers.startAll()`, the 6 incoming workers won't have timers.
**Why it happens:** `startAll()` only processes workers that are registered at the time it's called.
**How to avoid:** Ensure the startup sequence is: (1) create BackgroundWorkers, (2) IncomingTxMonitorService.start() registers its 6 workers, (3) daemon registers its own workers, (4) startAll().
**Warning signs:** Monitor workers registered but not running; `isRunning()` always returns false for incoming workers.

### Pitfall 5: Shutdown Order

**What goes wrong:** `IncomingTxMonitorService.stop()` is called (drains queue, destroys subscribers) but `BackgroundWorkers.stopAll()` is called later, potentially executing polling handlers after subscribers are destroyed.
**Why it happens:** Shutdown steps 6b and 7 run after monitor service stop.
**How to avoid:** The current shutdown order is actually correct: monitor stop (line 1170-1177) happens before worker stop (line 1183-1186). Monitor's `stop()` calls `queue.drain()` and `multiplexer.stopAll()`, then workers stop. Since workers use the same `this.multiplexer` reference, their next tick will find the multiplexer stopped and exit gracefully.
**Warning signs:** None -- the existing shutdown order handles this correctly.

## Code Examples

### Example 1: BackgroundWorkers Init Order Fix (BUG-1)

```typescript
// daemon.ts - Create workers instance before Step 4c-9
// NEW: Move this.workers creation before Step 4c-9
this.workers = new BackgroundWorkers();

// Step 4c-9 (existing location):
try {
  if (this._settingsService?.get('incoming.enabled') === 'true') {
    // ...config construction...
    this.incomingTxMonitorService = new IncomingTxMonitorCls({
      sqlite: this.sqlite,
      db: this._db!,
      workers: this.workers,  // FIX: uses the shared instance (no longer null)
      eventBus: this.eventBus,
      killSwitchService: this.killSwitchService,
      notificationService: this.notificationService,
      subscriberFactory,
      config: monitorConfig,
    });
    await this.incomingTxMonitorService.start(); // Registers 6 workers to shared instance
  }
} catch (err) {
  console.warn('Step 4c-9 (fail-soft):', err);
}

// Step 6 (existing location, line ~996):
// REMOVE: this.workers = new BackgroundWorkers();  // Already created above
// Keep all daemon worker registrations (WAL, session, delay, approval, version)
// Keep: this.workers.startAll();  // Starts ALL workers (daemon + monitor's 6)
```

### Example 2: SubscriptionMultiplexer Accessor (BUG-2 + BUG-3)

```typescript
// subscription-multiplexer.ts - Add accessor method
export class SubscriptionMultiplexer {
  // ... existing code ...

  /**
   * Get subscriber entries for polling and gap recovery.
   * Returns a Map compatible with createGapRecoveryHandler deps.
   *
   * Note: pollAll() is not part of IChainSubscriber interface but
   * exists on both SolanaIncomingSubscriber and EvmIncomingSubscriber.
   * The returned type uses structural typing to express this.
   */
  getSubscriberEntries(): Map<string, { subscriber: { pollAll: () => Promise<void> } }> {
    return this.connections as unknown as Map<
      string,
      { subscriber: { pollAll: () => Promise<void> } }
    >;
  }

  /**
   * Get subscribers for a specific chain prefix (e.g., "solana", "ethereum").
   */
  getSubscribersForChain(chainPrefix: string): Array<{
    key: string;
    subscriber: IChainSubscriber;
    state: ConnectionState;
  }> {
    const result: Array<{
      key: string;
      subscriber: IChainSubscriber;
      state: ConnectionState;
    }> = [];
    for (const [key, entry] of this.connections) {
      if (key.startsWith(`${chainPrefix}:`)) {
        result.push({ key, subscriber: entry.subscriber, state: entry.state });
      }
    }
    return result;
  }
}
```

### Example 3: Polling Worker Handlers (BUG-2)

```typescript
// incoming-tx-monitor-service.ts - Fill polling worker handlers

// Worker 5 (Solana polling):
this.workers.register('incoming-tx-poll-solana', {
  interval: this.config.pollIntervalSec * 1000,
  handler: async () => {
    const entries = this.multiplexer.getSubscribersForChain('solana');
    for (const { subscriber } of entries) {
      try {
        // pollAll() exists on SolanaIncomingSubscriber but not on IChainSubscriber
        await (subscriber as unknown as { pollAll(): Promise<void> }).pollAll();
      } catch (err) {
        console.warn('Solana polling worker error:', err);
      }
    }
  },
});

// Worker 6 (EVM polling):
this.workers.register('incoming-tx-poll-evm', {
  interval: this.config.pollIntervalSec * 1000,
  handler: async () => {
    const entries = this.multiplexer.getSubscribersForChain('ethereum');
    for (const { subscriber } of entries) {
      try {
        await (subscriber as unknown as { pollAll(): Promise<void> }).pollAll();
      } catch (err) {
        console.warn('EVM polling worker error:', err);
      }
    }
  },
});
```

### Example 4: Gap Recovery Wiring (BUG-3)

```typescript
// incoming-tx-monitor-service.ts - Wire createGapRecoveryHandler

import { createGapRecoveryHandler } from './incoming-tx-workers.js';

// In start():
this.multiplexer = new SubscriptionMultiplexer({
  subscriberFactory: this.subscriberFactory,
  onTransaction: (tx: IncomingTransaction) => {
    this.queue.push(tx);
  },
  onGapRecovery: async (chain: string, network: string, walletIds: string[]) => {
    // Wire to createGapRecoveryHandler using multiplexer's subscriber access
    const handler = createGapRecoveryHandler({
      subscribers: this.multiplexer.getSubscriberEntries(),
    });
    await handler(chain, network, walletIds);
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Orphaned BackgroundWorkers | Shared instance pre-created before Step 4c-9 | Phase 230 | All 6 incoming workers start via startAll() |
| Empty polling handlers | Workers call subscriber.pollAll() via multiplexer | Phase 230 | EVM detection works; Solana fallback works |
| console.debug() gap stub | createGapRecoveryHandler wired via multiplexer | Phase 230 | Post-reconnect transaction recovery works |

## Open Questions

1. **Should Worker 5 (Solana) only poll in POLLING_FALLBACK state?**
   - What we know: Solana uses WebSocket-first; polling is fallback. The multiplexer tracks connection state per chain:network.
   - What's unclear: Performance impact of unconditional polling vs. conditional polling. Solana's `getSignaturesForAddress` RPC call has rate limits.
   - Recommendation: Start with unconditional polling (simpler, idempotent). If RPC rate limiting becomes an issue, add connection state check later. The subscriber already tracks last-seen signatures, so duplicate detection is handled.

2. **Should the multiplexer accessor return a live reference or snapshot?**
   - What we know: `getSubscriberEntries()` returns the live Map reference. The Map may change during iteration if wallets are added/removed concurrently.
   - What's unclear: Whether concurrent modification during polling could cause issues.
   - Recommendation: Return live reference. Worker handlers run sequentially (BackgroundWorkers prevents overlap for the same worker). Concurrent addWallet/removeWallet is unlikely to cause issues since Map iteration is fail-safe in JS (new entries may or may not appear, deleted entries are skipped).

## Sources

### Primary (HIGH confidence)

- Codebase inspection: `packages/daemon/src/lifecycle/daemon.ts` (lines 122, 753-807, 992-1089) -- daemon initialization order, workers lifecycle
- Codebase inspection: `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` -- full service with 6 worker registrations, empty handlers at lines 438-454, gap recovery stub at lines 124-136
- Codebase inspection: `packages/daemon/src/services/incoming/subscription-multiplexer.ts` -- connections Map is private, no public accessor for subscribers
- Codebase inspection: `packages/daemon/src/services/incoming/incoming-tx-workers.ts` -- `createGapRecoveryHandler` factory with `GapRecoveryDeps` type (lines 60-63, 183-206)
- Codebase inspection: `packages/daemon/src/lifecycle/workers.ts` -- `startAll()` iterates `this.registrations` at call time (lines 51-88)
- Codebase inspection: `packages/core/src/interfaces/IChainSubscriber.ts` -- 6-method interface, `pollAll()` not included
- Codebase inspection: `packages/adapters/evm/src/evm-incoming-subscriber.ts` -- `pollAll()` at line 102, `connect()` is no-op
- Codebase inspection: `packages/adapters/solana/src/solana-incoming-subscriber.ts` -- `pollAll()` at line 196
- Audit report: `.planning/v27.1-MILESTONE-AUDIT.md` -- BUG-1, BUG-2, BUG-3 descriptions with line numbers

### Secondary (MEDIUM confidence)

- Existing test patterns: `__tests__/incoming-tx-monitor-service.test.ts`, `__tests__/integration-resilience.test.ts`, `__tests__/integration-pitfall.test.ts` -- mock patterns for workers, subscribers, SQLite

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components exist in the codebase and are verified by inspection
- Architecture: HIGH -- the fix approaches are straightforward wiring changes with no new components
- Pitfalls: HIGH -- identified from direct code analysis (e.g., startAll() timing, pollAll() typing)

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable -- internal codebase fixes)
