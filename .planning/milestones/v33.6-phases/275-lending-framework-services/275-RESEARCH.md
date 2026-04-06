# Phase 275: Lending Framework Services - Research

**Researched:** 2026-02-27
**Domain:** PositionTracker, HealthFactorMonitor, LendingPolicyEvaluator — protocol-agnostic DeFi lending services
**Confidence:** HIGH

## Summary

Phase 275 implements three protocol-agnostic services that form the runtime backbone of the lending framework: (1) PositionTracker for periodic position synchronization from IPositionProvider into the defi_positions table, (2) HealthFactorMonitor for adaptive polling of health factor thresholds with LIQUIDATION_WARNING/LIQUIDATION_IMMINENT notifications, and (3) LendingPolicyEvaluator for LTV-based borrow restrictions and non-spending classification of supply/repay transactions. All three services are internal to `packages/daemon/src/services/` and consume interfaces + DB schema established in Phase 274.

The codebase has mature precedents for every pattern needed: BalanceMonitorService demonstrates the setInterval + start/stop + NotificationService.notify() pattern, IncomingTxQueue demonstrates the batch write queue with ON CONFLICT upsert pattern, and DatabasePolicyEngine demonstrates policy evaluation step integration. The m29-00 design doc (sections 6, 9-10, 15) provides copy-ready TypeScript code for all three services. No external dependencies are required — all work uses existing libraries (better-sqlite3, drizzle-orm, @waiaas/core enums/interfaces).

One critical gap: the design doc assumes ContractCallRequest carries `actionName` for lending action identification (LEND-07/08), but the current schema only has `actionProvider` (no `actionName`). This field must be added to ContractCallRequestSchema and auto-tagged by ActionProviderRegistry alongside `actionProvider`.

**Primary recommendation:** Implement in 3 plans across 2 waves — (1) PositionTracker + PositionWriteQueue + daemon lifecycle integration, (2) HealthFactorMonitor with adaptive polling + DeFiMonitorService orchestrator, (3) LendingPolicyEvaluator with LENDING_LTV_LIMIT/LENDING_ASSET_WHITELIST policy types + non-spending classification + ContractCallRequestSchema.actionName extension.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LEND-03 | PositionTracker가 등록된 provider별로 5분 간격 포지션 동기화 수행 | m29-00 section 6.2: PositionTracker with category-specific intervals (LENDING=300s). BalanceMonitorService setInterval pattern. start()/stop() lifecycle. Provider registration via registerProvider(). overlap prevention with `running` flag per category. |
| LEND-04 | PositionTracker가 defi_positions 테이블에 batch upsert로 포지션 캐시 | m29-00 section 6.3: PositionWriteQueue with Map-based deduplication, ON CONFLICT(wallet_id, provider, asset_id, category) DO UPDATE. IncomingTxQueue pattern (MAX_BATCH=100, prepared statement, BEGIN IMMEDIATE transaction). Flush after syncCategory() completion. |
| LEND-05 | HealthFactorMonitor가 DB 캐시에서 HF < threshold(기본 1.2) 감지 시 LIQUIDATION_WARNING 발송 | m29-00 section 10.1: evaluate(position) reads metadata.healthFactor from defi_positions. Severity thresholds: safe(2.0), warning(1.5), danger(1.2). emitAlert() with cooldown map (4h). NotificationService.notify('LIQUIDATION_WARNING', walletId, vars) for WARNING/DANGER, 'LIQUIDATION_IMMINENT' for CRITICAL. |
| LEND-06 | HealthFactorMonitor가 HF < 1.5일 때 폴링 주기를 5분에서 1분으로 단축 (적응형) | m29-00 section 10.1: Recursive setTimeout (not setInterval). Severity-based intervals: SAFE=300s, WARNING=60s, DANGER=15s, CRITICAL=5s. currentSeverity tracks worst across all positions. scheduleNext() re-schedules with potentially different interval. |
| LEND-07 | LendingPolicyEvaluator가 max_ltv_pct 기반 차입 제한 평가 | m29-00 section 15.1: LENDING_LTV_LIMIT policy type in DatabasePolicyEngine step 4h-b. projectedLtv = (currentDebtUsd + newBorrowAmountUsd) / totalCollateralUsd. Deny if > maxLtv, DELAY tier if > warningLtv. Reads defi_positions cache. CRITICAL: Requires adding `actionName` field to ContractCallRequestSchema (currently absent). |
| LEND-08 | LendingPolicyEvaluator가 supply/repay를 비지출(non-spending)로 분류하여 SPENDING_LIMIT 미차감 | m29-00 section 15.3: Lending action identification via ContractCallRequest.actionName (supply/borrow/repay/withdraw). supply/repay → skip SPENDING_LIMIT step 5. Requires: (1) actionName field on ContractCallRequestSchema, (2) ActionProviderRegistry auto-tag actionName alongside actionProvider, (3) DatabasePolicyEngine recognizes lending non-spending actions in step 5. |
| LEND-09 | LendingPolicyEvaluator가 USD 기준 차입 한도 평가 | m29-00 section 15.1: LENDING_LTV_LIMIT rules include maxLtv which implicitly caps USD borrowing relative to collateral. Additional: LENDING_ASSET_WHITELIST (section 15.2) provides default-deny for lending assets. USD evaluation reuses existing IPriceOracle for amount conversion. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 11.x (existing) | Raw SQL queries in PositionWriteQueue batch upsert, HealthFactorMonitor position reads | Prepared statement + transaction pattern matches IncomingTxQueue |
| drizzle-orm | 0.36.x (existing) | ORM queries for policy evaluation, position reads in API routes | All daemon DB access uses Drizzle |
| zod | 3.x (existing) | Schema SSoT for LendingLtvLimitRules, LendingAssetWhitelistRules, ContractCallRequestSchema extension | Project convention (CLAUDE.md) |
| vitest | 3.x (existing) | Unit tests for all 3 services | Entire test suite uses vitest |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @waiaas/core | workspace | IPositionProvider, PositionUpdate, HealthFactor types, POSITION_CATEGORIES, POSITION_STATUSES, NotificationEventType, POLICY_TYPES, ContractCallRequestSchema | All interface/type imports |
| @waiaas/actions | workspace | IActionProvider implementations that also implement IPositionProvider | Provider registration in Phase 276+ |

### Alternatives Considered

None. This phase uses only existing project libraries. No new dependencies needed.

## Architecture Patterns

### Recommended File Structure

```
packages/daemon/src/
  services/
    defi/                                   # NEW directory
      position-tracker.ts                   # PositionTracker (LEND-03)
      position-write-queue.ts               # PositionWriteQueue (LEND-04)
    monitoring/
      health-factor-monitor.ts              # HealthFactorMonitor (LEND-05, LEND-06)
      defi-monitor-service.ts               # DeFiMonitorService orchestrator
  pipeline/
    database-policy-engine.ts               # MODIFY: +step 4h-a LENDING_ASSET_WHITELIST, +step 4h-b LENDING_LTV_LIMIT, +step 5 non-spending skip
  lifecycle/
    daemon.ts                               # MODIFY: +Step 4c-10.5 PositionTracker, +Step 4c-11 DeFiMonitorService

packages/core/src/
  schemas/
    transaction.schema.ts                   # MODIFY: +actionName field on ContractCallRequestSchema
  enums/
    policy.ts                               # MODIFY: +LENDING_LTV_LIMIT, +LENDING_ASSET_WHITELIST to POLICY_TYPES
  interfaces/
    defi-monitor.types.ts                   # NEW: IDeFiMonitor, MonitorSeverity, MonitorEvaluation

packages/daemon/src/infrastructure/action/
  action-provider-registry.ts               # MODIFY: auto-tag actionName alongside actionProvider
```

### Pattern 1: PositionTracker (Category-Specific setInterval + PositionWriteQueue)

**What:** Service that maintains per-category timers to periodically sync positions from IPositionProvider implementations into defi_positions via a batch write queue.
**When to use:** Any periodic sync of external data into a DB cache table.
**Key characteristics:**
- Per-category overlap prevention (`running` Map<PositionCategory, boolean>)
- Per-wallet error isolation (try/catch inside loops, BalanceMonitorService pattern)
- Immediate flush after syncCategory() (not on separate timer)
- start()/stop() lifecycle with timer.unref()
- registerProvider()/unregisterProvider() for dynamic provider management

**Example:**
```typescript
// Source: m29-00 design doc section 6.2 + BalanceMonitorService pattern
class PositionTracker {
  private timers = new Map<PositionCategory, NodeJS.Timeout>();
  private providers = new Map<string, IPositionProvider>();
  private running = new Map<PositionCategory, boolean>();
  private writeQueue: PositionWriteQueue;

  private intervals: Record<PositionCategory, number> = {
    PERP: 60_000,
    LENDING: 300_000,
    STAKING: 900_000,
    YIELD: 3_600_000,
  };

  start(): void {
    for (const [category, intervalMs] of Object.entries(this.intervals)) {
      const cat = category as PositionCategory;
      this.running.set(cat, false);
      const timer = setInterval(() => void this.syncCategory(cat), intervalMs);
      timer.unref();
      this.timers.set(cat, timer);
    }
  }
}
```

### Pattern 2: PositionWriteQueue (Map-Based Batch Upsert)

**What:** Memory buffer that deduplicates position updates by composite key and batch-flushes them to SQLite with ON CONFLICT DO UPDATE.
**When to use:** Batch writing to SQLite from periodic sync operations to prevent SQLITE_BUSY contention.
**Key differences from IncomingTxQueue:**
- Upsert (DO UPDATE) instead of insert-only (DO NOTHING)
- Key: `walletId:provider:assetId:category` (4-part composite)
- No MAX_QUEUE_SIZE needed (positions << transactions)
- Flush triggered by syncCategory() completion, not separate timer

**Example:**
```typescript
// Source: m29-00 design doc section 6.3
class PositionWriteQueue {
  private queue = new Map<string, PositionUpsert>();
  private static MAX_BATCH = 100;

  enqueue(update: PositionUpdate): void {
    const key = `${update.walletId}:${update.provider}:${update.assetId ?? 'null'}:${update.category}`;
    this.queue.set(key, this.toUpsert(update));
  }

  flush(sqlite: Database): number {
    if (this.queue.size === 0) return 0;
    const batch = [...this.queue.values()].slice(0, PositionWriteQueue.MAX_BATCH);
    const stmt = sqlite.prepare(`INSERT INTO defi_positions (...) VALUES (?, ?, ...) ON CONFLICT(...) DO UPDATE SET ...`);
    const runBatch = sqlite.transaction((items) => { /* ... */ });
    const inserted = runBatch(batch);
    // Remove flushed items
    return inserted;
  }
}
```

### Pattern 3: HealthFactorMonitor (Adaptive setTimeout)

**What:** Monitor that reads LENDING positions from defi_positions, evaluates health factor severity, and adjusts its own polling interval based on worst severity.
**When to use:** Monitoring where polling frequency must adapt to risk level.
**Key characteristics:**
- Recursive setTimeout (NOT setInterval) — interval changes dynamically
- 4-level severity: SAFE(5min) → WARNING(1min) → DANGER(15s) → CRITICAL(5s)
- Cooldown map for WARNING/DANGER alerts (4h per walletId:positionId)
- No cooldown for CRITICAL (LIQUIDATION_IMMINENT every evaluation)
- On-demand sync request to PositionTracker when entering DANGER/CRITICAL
- implements IDeFiMonitor interface

**Example:**
```typescript
// Source: m29-00 design doc section 10.1
class HealthFactorMonitor implements IDeFiMonitor {
  readonly name = 'health-factor';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentSeverity: MonitorSeverity = 'SAFE';

  private intervals: Record<MonitorSeverity, number> = {
    SAFE: 300_000, WARNING: 60_000, DANGER: 15_000, CRITICAL: 5_000,
  };

  private scheduleNext(): void {
    const interval = this.intervals[this.currentSeverity];
    this.timer = setTimeout(async () => {
      await this.checkAllPositions();
      this.scheduleNext();
    }, interval);
    this.timer.unref();
  }
}
```

### Pattern 4: LendingPolicyEvaluator (DatabasePolicyEngine Step Integration)

**What:** Two new policy types (LENDING_LTV_LIMIT, LENDING_ASSET_WHITELIST) integrated into DatabasePolicyEngine at step 4h, plus non-spending classification at step 5.
**When to use:** Adding new policy types to the existing evaluation chain.
**Key characteristics:**
- Follows existing policy evaluation pattern (load policies → resolve overrides → evaluate step by step)
- Lending action identification via `actionName` field on ContractCallRequest (supply/borrow/repay/withdraw)
- LENDING_ASSET_WHITELIST: default-deny (CLAUDE.md compliance)
- LENDING_LTV_LIMIT: projected LTV calculation from defi_positions cache
- Non-spending: supply/repay/withdraw skip SPENDING_LIMIT step 5; only borrow counts as spending

**Example:**
```typescript
// Step 4h-b: LENDING_LTV_LIMIT evaluation
private evaluateLendingLtvLimit(
  resolved: PolicyRow[],
  transaction: TransactionParam,
): PolicyEvaluation | null {
  const ltvPolicy = resolved.find(p => p.type === 'LENDING_LTV_LIMIT');
  if (!ltvPolicy || transaction.actionName !== 'borrow') return null;

  const rules = JSON.parse(ltvPolicy.rules) as LendingLtvLimitRules;
  const positions = /* read from defi_positions */;
  const projectedLtv = (currentDebtUsd + newBorrowUsd) / totalCollateralUsd;

  if (projectedLtv > rules.maxLtv) return { allowed: false, reason: `Borrow exceeds max LTV` };
  if (projectedLtv > rules.warningLtv) return { tier: 'DELAY', ... };
  return null; // pass through
}
```

### Pattern 5: DeFiMonitorService Orchestrator

**What:** Lifecycle orchestrator that registers, starts, stops, and propagates config updates to multiple IDeFiMonitor implementations.
**When to use:** Managing multiple monitors as a unit with a single entry point for DaemonLifecycle.
**Key characteristics:**
- register() / start() / stop() / updateConfig()
- Per-monitor error isolation (try/catch in start/stop/updateConfig loops)
- Fail-soft: one monitor failure does not block others
- DaemonLifecycle Step 4c-11 (after PositionTracker Step 4c-10.5)

### Anti-Patterns to Avoid

- **Direct RPC calls from monitors:** Monitors MUST read from defi_positions (DB cache), never call RPC directly. PositionTracker handles data freshness (DEC-MON-03).
- **setInterval for adaptive polling:** HealthFactorMonitor uses recursive setTimeout because the interval changes dynamically. setInterval would use the stale interval.
- **Separate flush timer for PositionWriteQueue:** Flush immediately after syncCategory() — separate timer adds unnecessary delay and management complexity.
- **Adding new discriminatedUnion type for lending:** Use ContractCallRequest with actionName metadata instead of creating a new pipeline type. 5-type pipeline integrity must be preserved (DEC-LEND-09).
- **Number-based health factor comparison:** HF from Aave is 18-decimal bigint. If converting to Number for display, use bigint arithmetic for safety-critical threshold comparisons (research flag C2).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Batch DB writes with dedup | Custom write loop | PositionWriteQueue (IncomingTxQueue pattern) | ON CONFLICT upsert, Map-based dedup, prepared statement reuse, BEGIN IMMEDIATE atomicity |
| Notification dispatch | Custom event emission | NotificationService.notify(eventType, walletId, vars) | Existing priority-based delivery, broadcast mode, per-channel rate limiting, category filtering, audit logging |
| Policy evaluation chain | Custom policy logic | DatabasePolicyEngine step integration | Existing 4-level priority resolution, network scoping, TOCTOU prevention |
| Timer management for monitors | Custom timer logic | BalanceMonitorService start/stop pattern | timer.unref(), clearInterval cleanup, error isolation |
| UUID generation for positions | Custom ID | generateId() from database/id.ts | UUID v7 with ms-precision time ordering, project standard |

**Key insight:** Every service in this phase follows an established codebase pattern. PositionTracker = BalanceMonitorService + IncomingTxQueue hybrid, HealthFactorMonitor = adaptive BalanceMonitorService variant, LendingPolicyEvaluator = DatabasePolicyEngine policy step extension. No novel architecture is needed.

## Common Pitfalls

### Pitfall 1: ContractCallRequestSchema Missing actionName Field

**What goes wrong:** LendingPolicyEvaluator cannot identify lending actions (supply/borrow/repay/withdraw) because ContractCallRequest only has `actionProvider` (provider name) but not `actionName` (specific action). Without this field, the policy engine cannot distinguish borrow from supply for LTV evaluation or non-spending classification.
**Why it happens:** The m29-00 design doc references `metadata.actionName` but the current ContractCallRequestSchema does not include this field.
**How to avoid:** Add `actionName: z.string().optional()` to ContractCallRequestSchema. Update ActionProviderRegistry.resolveAction() to auto-tag `parsed.actionName = actionName` alongside the existing `parsed.actionProvider = entry.provider.metadata.name`.
**Warning signs:** LendingPolicyEvaluator always returns null (no lending action detected), supply/repay incorrectly counted as spending.

### Pitfall 2: POLICY_TYPES SSoT Array + DB CHECK Constraint

**What goes wrong:** Adding LENDING_LTV_LIMIT and LENDING_ASSET_WHITELIST to `POLICY_TYPES` array in `packages/core/src/enums/policy.ts` causes DB CHECK constraint violations on existing databases because the `policies` table CHECK was created with the old values.
**Why it happens:** The CHECK constraint in policies table was hardcoded at migration time with the old POLICY_TYPES values.
**How to avoid:** Add a v26 migration that ALTERs the policies table CHECK constraint to include the new policy types. Or, if the existing CHECK is derived from SSoT arrays at runtime (via `buildCheckSql()`), verify that fresh DB creation picks up the new values. For existing DBs, a migration is needed.
**Warning signs:** INSERT into policies with type='LENDING_LTV_LIMIT' fails with CHECK constraint violation.

### Pitfall 3: PositionTracker Timer Overlap

**What goes wrong:** If syncCategory() takes longer than the polling interval, multiple sync operations run concurrently for the same category, causing duplicate DB writes and RPC rate limit issues.
**Why it happens:** setInterval fires regardless of whether the previous handler is still running.
**How to avoid:** Use the `running` Map<PositionCategory, boolean> flag. Skip syncCategory() if `running.get(category)` is true. Set to true at start, false in finally block.
**Warning signs:** DB constraint violations, excessive RPC calls, SQLITE_BUSY errors.

### Pitfall 4: HealthFactorMonitor Reading Stale Data During CRITICAL

**What goes wrong:** HealthFactorMonitor polls every 5 seconds in CRITICAL, but defi_positions data is only refreshed every 5 minutes (LENDING interval). The monitor evaluates the same stale health factor repeatedly.
**Why it happens:** Monitor reads DB cache, PositionTracker has its own interval for refreshing it.
**How to avoid:** When entering DANGER/CRITICAL, HealthFactorMonitor should request an on-demand sync from PositionTracker via `positionTracker.syncCategory('LENDING')`. The PositionTracker's overlap prevention (running flag) already protects against concurrent syncs. Design decision DEC-MON-04.
**Warning signs:** Multiple identical LIQUIDATION_WARNING notifications with the same health factor value.

### Pitfall 5: Non-Spending Classification Scope

**What goes wrong:** Only supply/repay are classified as non-spending, but withdraw is also non-spending (returning your own collateral). Incorrectly including withdraw in spending limit evaluation.
**Why it happens:** Unclear specification. Research flag M6 states "supply/repay/withdraw are non-spending; only borrow counts."
**How to avoid:** supply, repay, AND withdraw are all non-spending. Only borrow is spending. The SPENDING_LIMIT step 5 should check `actionName` and skip for ['supply', 'repay', 'withdraw']. Only 'borrow' goes through SPENDING_LIMIT evaluation.
**Warning signs:** Wallet hitting spending limit when withdrawing its own collateral.

### Pitfall 6: Test Assertion Counts for POLICY_TYPES

**What goes wrong:** Existing tests assert POLICY_TYPES has a specific length. Adding 2 new types breaks these assertions.
**Why it happens:** Snapshot-style length assertions in policy enum tests.
**How to avoid:** Update the length assertion in `packages/core/src/__tests__/enums.test.ts` for POLICY_TYPES (e.g., 10 → 12) and any related tests in `database-policy-engine.test.ts`.
**Warning signs:** Test failure: "expected 10 to be 12"

### Pitfall 7: HealthFactorMonitor Cooldown Key Cleanup on Recovery

**What goes wrong:** Position recovers to SAFE but cooldown map retains the key. If position re-deteriorates, the cooldown prevents immediate re-alert.
**Why it happens:** cooldownMap entry not deleted on recovery.
**How to avoid:** When severity returns to SAFE for a position, delete `cooldownMap.delete(cooldownKey)` so that re-deterioration triggers an immediate alert.
**Warning signs:** No alert when a position that previously recovered drops to WARNING again within 4 hours.

## Code Examples

### PositionTracker Lifecycle (daemon.ts Integration)

```typescript
// Source: m29-00 design doc section 12.5, adapted for step numbering
// packages/daemon/src/lifecycle/daemon.ts Step 4c-10.5

try {
  if (this.sqlite && this._settingsService) {
    const trackerEnabled = this._settingsService.get('position_tracker.enabled');
    if (trackerEnabled !== 'false') {
      const { PositionTracker } = await import('../services/defi/position-tracker.js');
      this.positionTracker = new PositionTracker({
        sqlite: this.sqlite,
        settingsService: this._settingsService,
      });
      this.positionTracker.start();
      console.debug('Step 4c-10.5: Position tracker started');
    }
  }
} catch (err) {
  console.warn('Step 4c-10.5 (fail-soft): Position tracker init warning:', err);
  this.positionTracker = null;
}
```

### HealthFactorMonitor Alert Emission

```typescript
// Source: m29-00 design doc section 10.1
private emitAlert(evaluation: MonitorEvaluation): void {
  const cooldownKey = `${evaluation.walletId}:${evaluation.positionId}`;

  if (evaluation.severity === 'CRITICAL') {
    // No cooldown for CRITICAL
    void this.notificationService.notify('LIQUIDATION_IMMINENT', evaluation.walletId, {
      healthFactor: evaluation.value.toFixed(2),
      threshold: evaluation.threshold.toFixed(2),
    });
  } else {
    // WARNING/DANGER: apply cooldown (4 hours)
    const lastAlert = this.cooldownMap.get(cooldownKey) ?? 0;
    const cooldownMs = this.cooldownHours * 3600 * 1000;
    if (Date.now() - lastAlert >= cooldownMs) {
      void this.notificationService.notify('LIQUIDATION_WARNING', evaluation.walletId, {
        healthFactor: evaluation.value.toFixed(2),
        threshold: evaluation.threshold.toFixed(2),
      });
      this.cooldownMap.set(cooldownKey, Date.now());
    }
  }
}
```

### ContractCallRequestSchema actionName Extension

```typescript
// Source: Research finding — required but absent from current schema
// packages/core/src/schemas/transaction.schema.ts

export const ContractCallRequestSchema = z.object({
  type: z.literal('CONTRACT_CALL'),
  to: z.string().min(1),
  calldata: z.string().optional(),
  abi: z.array(z.record(z.unknown())).optional(),
  value: z.string().regex(numericStringPattern).optional(),
  programId: z.string().optional(),
  instructionData: z.string().optional(),
  accounts: z.array(z.object({
    pubkey: z.string(), isSigner: z.boolean(), isWritable: z.boolean(),
  })).optional(),
  network: NetworkTypeEnum.optional(),
  /** Provider name tag for provider-trust policy bypass. Set by ActionProviderRegistry. */
  actionProvider: z.string().optional(),
  /** Action name for lending policy evaluation. Set by ActionProviderRegistry. */
  actionName: z.string().optional(),  // <-- NEW
  ...gasConditionField,
});
```

### ActionProviderRegistry Auto-Tag

```typescript
// Source: packages/daemon/src/infrastructure/action/action-provider-registry.ts line 200-206
// MODIFY: Add actionName alongside actionProvider

// 5. Re-validate each element + auto-tag with actionProvider + actionName
for (const item of results) {
  const parsed = ContractCallRequestSchema.parse(item);
  parsed.actionProvider = entry.provider.metadata.name;
  parsed.actionName = actionName;  // <-- NEW: auto-tag action name
  validated.push(parsed);
}
```

### Non-Spending Classification in DatabasePolicyEngine

```typescript
// Source: m29-00 section 15.3, research flag M6
// packages/daemon/src/pipeline/database-policy-engine.ts Step 5 modification

// Step 5: Evaluate SPENDING_LIMIT (tier classification)
// Skip for non-spending lending actions (supply/repay/withdraw)
const NON_SPENDING_ACTIONS = new Set(['supply', 'repay', 'withdraw']);
if (transaction.actionName && NON_SPENDING_ACTIONS.has(transaction.actionName)) {
  // Non-spending action — bypass SPENDING_LIMIT entirely
  return { allowed: true, tier: 'INSTANT', reason: `Non-spending lending action: ${transaction.actionName}` };
}
const spendingPolicy = resolved.find((p) => p.type === 'SPENDING_LIMIT');
// ... existing logic ...
```

### LENDING_LTV_LIMIT Policy Evaluation

```typescript
// Source: m29-00 section 15.1
// Step 4h-b: LENDING_LTV_LIMIT
private evaluateLendingLtvLimit(
  resolved: PolicyRow[],
  transaction: TransactionParam,
  walletId: string,
): PolicyEvaluation | null {
  if (transaction.actionName !== 'borrow') return null; // Only applies to borrow

  const ltvPolicy = resolved.find(p => p.type === 'LENDING_LTV_LIMIT');
  if (!ltvPolicy) return null;

  const rules = JSON.parse(ltvPolicy.rules) as { maxLtv: number; warningLtv: number };

  // Read cached position data from defi_positions
  const positions = this.sqlite?.prepare(
    "SELECT * FROM defi_positions WHERE wallet_id = ? AND category = 'LENDING' AND status = 'ACTIVE'"
  ).all(walletId);

  // Calculate projected LTV
  const { totalCollateralUsd, totalDebtUsd } = aggregatePositions(positions);
  const newBorrowUsd = transaction.usdAmount ?? 0;
  const projectedLtv = totalCollateralUsd > 0 ? (totalDebtUsd + newBorrowUsd) / totalCollateralUsd : Infinity;

  if (projectedLtv > rules.maxLtv) {
    return { allowed: false, reason: `Borrow would exceed max LTV (${(projectedLtv * 100).toFixed(1)}% > ${(rules.maxLtv * 100).toFixed(1)}%)` };
  }
  if (projectedLtv > rules.warningLtv) {
    return { allowed: true, tier: 'DELAY', reason: `LTV approaching limit (${(projectedLtv * 100).toFixed(1)}%)` };
  }
  return null; // pass through to next step
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No DeFi position tracking | PositionTracker + defi_positions table | v29.0 design (Phase 274 DB) | Category-discriminated positions table supports LENDING/YIELD/PERP/STAKING |
| No health factor monitoring | Adaptive HealthFactorMonitor | v29.0 design | 4-level severity with dynamic polling intervals |
| SPENDING_LIMIT evaluates all CONTRACT_CALL | Non-spending classification for lending | v29.0 design (Phase 275) | supply/repay/withdraw skip SPENDING_LIMIT |
| 9 policy types | 11 policy types (+LENDING_LTV_LIMIT, +LENDING_ASSET_WHITELIST) | v29.2 (this phase) | Lending-specific policy evaluation steps 4h-a and 4h-b |
| ContractCallRequest has actionProvider only | +actionName field | v29.2 (this phase) | Enables lending action identification without new pipeline type |

## Open Questions

1. **DB Migration for POLICY_TYPES CHECK Constraint**
   - What we know: Adding LENDING_LTV_LIMIT and LENDING_ASSET_WHITELIST to POLICY_TYPES SSoT array updates the Zod enum and TypeScript type. Fresh DB DDL picks up new values via `buildCheckSql()`.
   - What's unclear: Whether existing DB's policies table CHECK constraint needs a migration to add the new values, or if the CHECK is dynamically derived.
   - Recommendation: Verify if `getCreateTableStatements()` uses SSoT arrays for CHECK in policies table. If CHECK was hardcoded at v1 migration time, add v26 migration to ALTER the CHECK. If derived from SSoT, only fresh DDL needs updating.

2. **PositionTracker getWalletsForProvider**
   - What we know: PositionTracker needs to iterate all active wallets for each provider to call getPositions().
   - What's unclear: How to determine which wallets are relevant for each provider (chain/network filtering).
   - Recommendation: Query wallets table for ACTIVE wallets where chain matches provider's supported chains. The IPositionProvider interface does not filter by chain, so PositionTracker should filter wallet list based on provider metadata.

3. **IDeFiMonitor Interface Location — Phase 275 or Core Interface in Phase 274?**
   - What we know: IDeFiMonitor, MonitorSeverity, and MonitorEvaluation types are defined in design doc section 9.1 as `packages/core/src/interfaces/defi-monitor.types.ts`. They were not created in Phase 274.
   - What's unclear: Whether to create them in Phase 275 (consumed here) or retroactively as part of Phase 274.
   - Recommendation: Create in Phase 275. IDeFiMonitor is consumed only by daemon services (not by external packages), so it can live in daemon or core. Placing in core follows the existing interface pattern but is not strictly required. Core is cleaner for future extensibility.

## Sources

### Primary (HIGH confidence)

- **m29-00 design doc** (`internal/objectives/m29-00-defi-advanced-protocol-design.md`) — complete design for:
  - Section 6: PositionTracker scheduler + PositionWriteQueue + daemon lifecycle integration
  - Section 9: IDeFiMonitor interface + DeFiMonitorService orchestrator
  - Section 10.1: HealthFactorMonitor adaptive polling + severity thresholds + alert emission
  - Section 12.5: DaemonLifecycle Step 4c-11 integration
  - Section 15: LendingPolicyEvaluator (LENDING_LTV_LIMIT + LENDING_ASSET_WHITELIST + non-spending classification)

- **Codebase inspection** — all patterns verified from existing implementation:
  - `packages/daemon/src/services/monitoring/balance-monitor-service.ts` — setInterval + start/stop + NotificationService.notify() pattern
  - `packages/daemon/src/services/incoming/incoming-tx-queue.ts` — Map-based batch write queue with ON CONFLICT pattern
  - `packages/daemon/src/pipeline/database-policy-engine.ts` — policy evaluation step chain (9 types, step 4a-4g + step 5)
  - `packages/daemon/src/lifecycle/daemon.ts` — fail-soft service init pattern (Step 4c-4 BalanceMonitor, Step 4c-9 IncomingTxMonitor)
  - `packages/daemon/src/lifecycle/workers.ts` — BackgroundWorkers register + startAll pattern
  - `packages/daemon/src/infrastructure/action/action-provider-registry.ts` — actionProvider auto-tagging (line 200-206)
  - `packages/core/src/schemas/transaction.schema.ts` — ContractCallRequestSchema (actionProvider present, actionName absent)
  - `packages/core/src/enums/policy.ts` — POLICY_TYPES SSoT array (10 types currently)
  - `packages/core/src/interfaces/position-provider.types.ts` — IPositionProvider interface (Phase 274 output)
  - `packages/daemon/src/infrastructure/database/schema.ts` — defiPositions Drizzle table (Phase 274 output)
  - `packages/daemon/src/notifications/notification-service.ts` — notify(eventType, walletId, vars) API

### Secondary (HIGH confidence)

- **m29-02 objective** (`internal/objectives/m29-02-aave-evm-lending.md`) — requirements, technical decisions, file structure
- **REQUIREMENTS.md** (`.planning/REQUIREMENTS.md`) — LEND-03 through LEND-09 definitions
- **STATE.md** (`.planning/STATE.md`) — research flags C1-C4, M6 for lending-specific concerns
- **Phase 274 research** (`.planning/phases/274-ssot-enums-db-migration-core-interfaces/274-RESEARCH.md`) — foundation established

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — all 3 services have direct codebase precedents (BalanceMonitorService, IncomingTxQueue, DatabasePolicyEngine); m29-00 provides copy-ready designs
- Pitfalls: HIGH — identified from actual codebase inspection (missing actionName field, CHECK constraint, timer overlap, cooldown cleanup, non-spending scope)

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable patterns, internal codebase)
