# Phase 269: DeFi 모니터링 프레임워크 설계 - Research

**Researched:** 2026-02-26
**Domain:** DeFi position monitoring framework (IDeFiMonitor interface, adaptive polling, notification integration, daemon lifecycle, config.toml)
**Confidence:** HIGH

## Summary

Phase 269 designs the monitoring framework that watches DeFi positions for risk conditions. It builds on Phase 268's `defi_positions` table and `PositionTracker` infrastructure by adding three specialized monitors: HealthFactorMonitor (lending liquidation risk), MaturityMonitor (yield token expiry), and MarginMonitor (perp margin/liquidation risk). The core deliverable is an `IDeFiMonitor` common interface that these three monitors implement, plus integration with the existing notification system and daemon lifecycle.

The codebase already provides strong patterns for every component this phase needs. The `BalanceMonitorService` (v1.6) is the primary blueprint for a polling monitor with setInterval, cooldown, per-wallet error isolation, start/stop lifecycle, and `updateConfig()` hot-reload. The `NotificationService` provides the `notify(eventType, walletId, vars)` interface that monitors will call. The `EVENT_CATEGORY_MAP` in `signing-protocol.ts` maps all 39 existing event types to 6 categories and needs to be extended with 4 new DeFi monitoring events. The `NOTIFICATION_EVENT_TYPES` array in `notification.ts` is the SSoT for event type enumeration. The `i18n/en.ts` messages template provides title/body templates for each event type.

The critical design challenge is the HealthFactorMonitor's **adaptive polling** -- changing poll frequency based on risk severity (safe: 5min, warning: 1min, danger: 15s, critical: 5s). This is a new pattern not present in any existing monitor. The design must define how risk zones are evaluated, how the polling interval dynamically adjusts, and how rapid-fire interval changes are bounded.

**Primary recommendation:** Design IDeFiMonitor as a minimal interface (`evaluate(position)`, `getInterval(state)`, `emitAlert(walletId, position, severity)`) that each monitor implements. Use the `BalanceMonitorService` pattern for lifecycle (start/stop/updateConfig). Place all threshold/interval config in the `[monitoring]` config.toml section with flat keys per CLAUDE.md rules, and register corresponding Admin Settings keys for hot-reload.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MON-01 | IDeFiMonitor 공통 인터페이스가 3개 모니터의 공통 패턴을 정의한다 | BalanceMonitorService pattern (start/stop/updateConfig lifecycle), IChainSubscriber 6-method interface pattern for consistent monitoring contracts |
| MON-02 | HealthFactorMonitor가 적응형 폴링(5s-5min, 위험도 기반)으로 설계된다 | BalanceMonitorService setInterval + clearInterval restart pattern, defi_positions.metadata LendingMetadata.healthFactor field from Phase 268 |
| MON-03 | MaturityMonitor가 1일 1회 폴링으로 설계된다 | BackgroundWorkers fixed-interval pattern (86,400,000ms), YieldMetadata.maturity field from Phase 268 |
| MON-04 | MarginMonitor가 1분 간격 폴링으로 설계된다 | PositionTracker PERP category 60,000ms interval pattern from Phase 268, PerpMetadata.margin/liquidationPrice fields |
| MON-05 | 알림 이벤트 4개(LIQUIDATION_WARNING, MATURITY_WARNING, MARGIN_WARNING, LIQUIDATION_IMMINENT)가 정의된다 | NOTIFICATION_EVENT_TYPES SSoT array, EVENT_CATEGORY_MAP, i18n en.ts message templates, NotificationService.notify() pattern |
| MON-06 | 모니터 라이프사이클이 데몬 시작/정지 시 등록/해제로 설계된다 | DaemonLifecycle Step 4c-4 (BalanceMonitor) and Step 4c-9 (IncomingTxMonitor) fail-soft patterns, shutdown sequence stop() calls |
| MON-07 | config.toml [monitoring] 섹션이 임계값과 폴링 주기를 정의한다 | DaemonConfigSchema flat-key Zod sections, KNOWN_SECTIONS validation, SettingsService hot-reload pattern (HotReloadOrchestrator.reloadBalanceMonitor) |
</phase_requirements>

## Standard Stack

### Core (Already in Project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.x | Schema validation SSoT for monitor config and alert payloads | Project rule: Zod SSoT |
| better-sqlite3 | Existing | Read defi_positions for monitoring evaluation | All DB access through this |
| @waiaas/core | Existing | Shared types (NotificationEventType, PositionCategory, EventBus) | SSoT for enums/interfaces |

### Supporting (Already in Project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| NotificationService | Existing | Alert delivery (notify method) | When monitors detect risk conditions |
| EventBus | Existing | Inter-service events (position changes) | Optional: monitors can also subscribe to POSITION_UPDATED events |
| SettingsService | Existing | Runtime config hot-reload | Admin UI threshold changes without restart |
| HotReloadOrchestrator | Existing | Orchestrates service config updates | Adds reloadDeFiMonitors() method |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-monitor setInterval | BackgroundWorkers registration | BackgroundWorkers uses single interval per worker; adaptive polling requires dynamic interval changes. Per-monitor internal timers (BalanceMonitorService pattern) are correct. |
| PositionTracker as data source | Direct on-chain queries | PositionTracker already polls positions into defi_positions table. Monitors should read the cached DB data, not make independent RPC calls. Decouples monitor timing from data freshness. |
| 4 new notification events | Reusing existing LOW_BALANCE event | DeFi alerts carry different context (healthFactor, maturity, margin) and require distinct message templates. Separate events enable per-event notification filtering. |
| New 'defi_monitoring' notification category | Extending 'system' category | DeFi monitoring events are semantically distinct from system alerts. A new `defi_monitoring` category enables targeted notification filtering in Admin UI. |

## Architecture Patterns

### Recommended Design Document Structure

```
설계 문서 (m29-00 섹션 9-12):
├── 9. 모니터링 프레임워크: IDeFiMonitor 인터페이스
│   ├── 9.1 IDeFiMonitor 인터페이스 정의
│   ├── 9.2 MonitorSeverity 타입 (SAFE/WARNING/DANGER/CRITICAL)
│   ├── 9.3 DeFiMonitorService 오케스트레이터
│   └── 9.4 모니터 등록 패턴
├── 10. 3개 모니터 상세 설계
│   ├── 10.1 HealthFactorMonitor (적응형 폴링)
│   ├── 10.2 MaturityMonitor (1일 폴링)
│   └── 10.3 MarginMonitor (1분 폴링)
├── 11. 알림 이벤트 통합
│   ├── 11.1 4개 신규 NotificationEventType
│   ├── 11.2 EVENT_CATEGORY_MAP 확장
│   ├── 11.3 i18n 메시지 템플릿
│   └── 11.4 알림 쿨다운 전략
└── 12. 설정 구조 + 라이프사이클
    ├── 12.1 config.toml [monitoring] 섹션
    ├── 12.2 Admin Settings 키 등록
    ├── 12.3 DaemonLifecycle 연동
    └── 12.4 HotReloadOrchestrator 확장
```

### Pattern 1: IDeFiMonitor Common Interface

**What:** A TypeScript interface that all three monitors implement, providing consistent lifecycle and evaluation contracts.

**When to use:** When multiple monitors share common behavior (polling, alert emission, lifecycle) but differ in evaluation logic and timing.

**Why this approach:** The `IChainSubscriber` interface (6 methods, 2 implementations) established the pattern for monitoring contracts. `IDeFiMonitor` follows the same principle -- a common interface enabling `DeFiMonitorService` to manage monitors generically.

**Example:**
```typescript
// packages/core/src/interfaces/defi-monitor.types.ts

export type MonitorSeverity = 'SAFE' | 'WARNING' | 'DANGER' | 'CRITICAL';

export interface MonitorEvaluation {
  walletId: string;
  positionId: string;
  severity: MonitorSeverity;
  value: number;           // health factor, days to maturity, margin ratio
  threshold: number;       // threshold that was crossed
  message: string;         // human-readable description
}

export interface IDeFiMonitor {
  /** Monitor type identifier */
  readonly name: string;

  /** Evaluate a single position and return severity */
  evaluate(position: DefiPositionRow): MonitorEvaluation | null;

  /** Get current polling interval in ms (may be adaptive) */
  getInterval(): number;

  /** Start monitoring loop */
  start(): void;

  /** Stop monitoring loop */
  stop(): void;

  /** Update config at runtime (hot-reload) */
  updateConfig(config: Record<string, unknown>): void;
}
```

### Pattern 2: Adaptive Polling (HealthFactorMonitor)

**What:** A polling monitor that dynamically adjusts its interval based on the worst risk severity across all monitored positions.

**When to use:** When monitoring urgency varies by orders of magnitude based on risk level (e.g., safe: 5 min checks, near-liquidation: 5 sec checks).

**Why this is new:** No existing monitor in the codebase implements adaptive polling. BalanceMonitorService uses a fixed interval. IncomingTxMonitor uses fixed intervals. The HealthFactorMonitor must track the "worst" severity across all lending positions and adjust accordingly.

**Example:**
```typescript
// Severity -> polling interval mapping
const HEALTH_FACTOR_INTERVALS: Record<MonitorSeverity, number> = {
  SAFE: 300_000,      // 5 minutes (health > 2.0)
  WARNING: 60_000,    // 1 minute  (1.5 < health <= 2.0)
  DANGER: 15_000,     // 15 seconds (1.2 < health <= 1.5)
  CRITICAL: 5_000,    // 5 seconds  (health <= 1.2)
};

class HealthFactorMonitor implements IDeFiMonitor {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentSeverity: MonitorSeverity = 'SAFE';

  start(): void {
    this.scheduleNext();
  }

  private scheduleNext(): void {
    const interval = HEALTH_FACTOR_INTERVALS[this.currentSeverity];
    this.timer = setTimeout(async () => {
      const worstSeverity = await this.checkAllPositions();
      this.currentSeverity = worstSeverity;
      this.scheduleNext(); // re-schedule with potentially different interval
    }, interval);
    this.timer.unref();
  }
}
```

**Key difference from setInterval:** Uses recursive `setTimeout` instead of `setInterval` to allow the interval to change between each check. This naturally prevents overlap (next check starts only after previous completes) and allows adaptive timing.

### Pattern 3: Fixed-Interval Monitor (MaturityMonitor, MarginMonitor)

**What:** Standard polling monitors with fixed intervals, following the BalanceMonitorService pattern.

**When to use:** When monitoring frequency does not need to adapt based on results.

**Example:**
```typescript
class MaturityMonitor implements IDeFiMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private config = { intervalMs: 86_400_000, warningDays: [7, 1], unredeemed: true };

  start(): void {
    this.timer = setInterval(() => void this.checkAll(), this.config.intervalMs);
    this.timer.unref();
    void this.checkAll(); // immediate first run
  }
}
```

### Pattern 4: DeFiMonitorService Orchestrator

**What:** A service class that manages all IDeFiMonitor instances, providing start/stop/updateConfig for the collection.

**When to use:** When multiple monitors need coordinated lifecycle management and the daemon only needs one entry point.

**Rationale:** Similar to how `IncomingTxMonitorService` orchestrates queue + multiplexer + workers, `DeFiMonitorService` orchestrates HealthFactor + Maturity + Margin monitors.

**Example:**
```typescript
class DeFiMonitorService {
  private monitors: IDeFiMonitor[] = [];

  register(monitor: IDeFiMonitor): void {
    this.monitors.push(monitor);
  }

  start(): void {
    for (const monitor of this.monitors) {
      monitor.start();
    }
  }

  stop(): void {
    for (const monitor of this.monitors) {
      monitor.stop();
    }
  }
}
```

### Anti-Patterns to Avoid

- **Monitors making independent RPC calls:** Monitors should read from the `defi_positions` table (populated by PositionTracker), not query on-chain directly. This avoids RPC rate limits and ensures consistency with the data source.
- **Single monolithic monitor class:** Putting all three monitoring strategies in one class. Each monitor has distinct timing, thresholds, and alert types. Separate classes behind IDeFiMonitor enable independent testing and evolution.
- **Using setInterval for adaptive polling:** setInterval fires at fixed intervals. HealthFactorMonitor needs varying intervals. Use recursive setTimeout instead.
- **Blocking the monitoring loop with slow DB queries:** Use the same per-wallet error isolation pattern from BalanceMonitorService (try/catch per wallet, continue on error).
- **config.toml nesting:** CLAUDE.md prohibits nesting in config.toml (daemon). Use flat keys like `monitoring_health_factor_threshold` not `[monitoring.health_factor]`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Notification delivery | Custom alert sender | `NotificationService.notify(eventType, walletId, vars)` | Priority-based fallback, rate limiting, broadcast mode already implemented |
| Alert cooldown | Custom dedup timer | NotificationService per-event-type cooldown + SettingsService `monitoring.cooldown_hours` | BalanceMonitorService already uses 24h cooldown with recovery detection pattern |
| Position data access | Custom DB queries | Read `defi_positions` table via Drizzle ORM (Phase 268 schema) | PositionTracker keeps data fresh; monitors only need to read |
| Event type SSoT | Hardcoded string literals | Add to NOTIFICATION_EVENT_TYPES array in `core/enums/notification.ts` | SSoT pattern: array drives Zod enum, CHECK constraints, i18n keys |
| Hot-reload wiring | Manual settings watch | Extend `HotReloadOrchestrator.reloadBalanceMonitor` pattern with `reloadDeFiMonitors` | Existing infrastructure handles settings change detection and service update |
| Config validation | Manual parsing | Extend `DaemonConfigSchema` Zod section | Provides defaults, type coercion, validation with error messages |

**Key insight:** This phase is design-only. "Don't hand-roll" means the design document must reference these existing implementations as blueprints and specify how the new monitors integrate with them, rather than proposing new infrastructure.

## Common Pitfalls

### Pitfall 1: Config.toml Nesting Violation

**What goes wrong:** Defining `[monitoring.health_factor]` nested section in config.toml.
**Why it happens:** Natural instinct to group related config. But CLAUDE.md rule says "No nesting in config.toml (daemon)."
**How to avoid:** Use flat keys within a `[monitoring]` section: `health_factor_warning_threshold = 2.0`, `health_factor_danger_threshold = 1.5`, etc. The `detectNestedSections()` function will reject nested objects.
**Warning signs:** `Unknown config section` or `Nested TOML section detected` errors on daemon startup.

### Pitfall 2: KNOWN_SECTIONS Validation Failure

**What goes wrong:** Adding `[monitoring]` to config.toml without adding `'monitoring'` to `KNOWN_SECTIONS` in `loader.ts`.
**Why it happens:** The config loader validates all top-level TOML sections against a whitelist (currently 12 sections).
**How to avoid:** Design must specify adding `'monitoring'` to `KNOWN_SECTIONS` array and `DaemonConfigSchema` in the config loader.
**Warning signs:** `Unknown config section '[monitoring]'` error on startup.

### Pitfall 3: Notification Event SSoT Chain Incomplete

**What goes wrong:** Adding 4 new event types to `NOTIFICATION_EVENT_TYPES` but missing updates in one or more of: `EVENT_CATEGORY_MAP`, `EVENT_DESCRIPTIONS`, `i18n/en.ts` templates, `i18n/ko.ts` templates.
**Why it happens:** The notification SSoT chain has 5 files that must stay in sync: `notification.ts` (enum array), `signing-protocol.ts` (category map + descriptions), `en.ts` (English templates), `ko.ts` (Korean templates), and tests (`signing-protocol.test.ts` checks all events have categories).
**How to avoid:** Design document must list all 5 files that need updating and specify exact content for each. The existing test `signing-protocol.test.ts` verifies that every event type has a category mapping -- this test will catch incomplete updates.
**Warning signs:** Type errors (`NotificationEventType` mismatch) or test failures in `signing-protocol.test.ts`.

### Pitfall 4: Adaptive Polling Spin Loop

**What goes wrong:** HealthFactorMonitor in CRITICAL mode (5s interval) keeps firing even when no lending positions exist or when all positions are healthy again.
**Why it happens:** Adaptive polling doesn't have a "step-back" mechanism when conditions improve.
**How to avoid:** Design must specify severity downgrade logic: if all positions evaluate to SAFE, immediately step back to SAFE interval (5min). Include a minimum evaluation set: if no LENDING positions exist in defi_positions, severity stays SAFE (no polling at all, or max interval only).
**Warning signs:** Excessive CPU/DB usage from a monitor with no active positions.

### Pitfall 5: Missing BalanceMonitor vs DeFiMonitor Delineation

**What goes wrong:** Confusion about whether DeFi monitors replace or complement the existing BalanceMonitorService.
**Why it happens:** Both BalanceMonitorService and DeFi monitors poll and send alerts. They are independent systems monitoring different things.
**How to avoid:** Design document must explicitly state that BalanceMonitorService (LOW_BALANCE for native token) continues to operate independently. DeFi monitors are new, separate services for DeFi position risk. They share the same NotificationService but are different daemon lifecycle entries.
**Warning signs:** BalanceMonitorService removal proposals, or confusion about overlapping responsibilities.

### Pitfall 6: Cooldown Scope Confusion

**What goes wrong:** Alert cooldown applied globally instead of per-wallet-per-position.
**Why it happens:** BalanceMonitorService uses per-wallet cooldown. DeFi monitors need per-wallet-per-position cooldown because the same wallet can have multiple positions with different risk levels.
**How to avoid:** Cooldown key must be `walletId:positionId` (or `walletId:provider:assetId:category`), not just `walletId`. Design the cooldown map with composite keys.
**Warning signs:** Missing alerts for a second at-risk position because the first position's alert triggered cooldown.

## Code Examples

### Notification Event Type Addition Pattern

```typescript
// Source: packages/core/src/enums/notification.ts -- existing pattern
// Add 4 new events at the end of the array (before the closing ] as const)
export const NOTIFICATION_EVENT_TYPES = [
  // ... existing 39 events ...
  'LIQUIDATION_WARNING',      // DeFi: lending health factor below threshold
  'MATURITY_WARNING',         // DeFi: yield position approaching maturity
  'MARGIN_WARNING',           // DeFi: perp margin below maintenance level
  'LIQUIDATION_IMMINENT',     // DeFi: perp/lending at immediate liquidation risk
] as const;
```

### EVENT_CATEGORY_MAP Extension Pattern

```typescript
// Source: packages/core/src/schemas/signing-protocol.ts -- existing 39 entries
// Add to EVENT_CATEGORY_MAP:
export const EVENT_CATEGORY_MAP: Record<NotificationEventType, NotificationCategory> = {
  // ... existing 39 mappings ...
  LIQUIDATION_WARNING: 'defi_monitoring',     // new category
  MATURITY_WARNING: 'defi_monitoring',
  MARGIN_WARNING: 'defi_monitoring',
  LIQUIDATION_IMMINENT: 'security_alert',     // critical: goes to security_alert for broadcast
};
```

**Category decision:** Three events map to a new `defi_monitoring` category. `LIQUIDATION_IMMINENT` maps to `security_alert` because it represents imminent fund loss and should trigger broadcast to ALL notification channels (same as KILL_SWITCH_ACTIVATED).

### NOTIFICATION_CATEGORIES Extension

```typescript
// Source: packages/core/src/schemas/signing-protocol.ts
export const NOTIFICATION_CATEGORIES = [
  'transaction',
  'policy',
  'security_alert',
  'session',
  'owner',
  'system',
  'defi_monitoring',   // NEW: DeFi position monitoring alerts
] as const;
```

### i18n Message Template Pattern

```typescript
// Source: packages/core/src/i18n/en.ts -- notification templates section
LIQUIDATION_WARNING: {
  title: 'Liquidation Risk Warning',
  body: '{walletName} lending position on {provider} has health factor {healthFactor} (threshold: {threshold}). Consider adding collateral or repaying debt.'
},
MATURITY_WARNING: {
  title: 'Maturity Warning',
  body: '{walletName} yield position on {provider} matures in {daysRemaining} days (maturity: {maturityDate}). Redeem before maturity to avoid penalties.'
},
MARGIN_WARNING: {
  title: 'Margin Warning',
  body: '{walletName} perp position on {provider} margin ratio at {marginRatio}% (maintenance: {maintenanceMargin}%). Add margin to avoid liquidation.'
},
LIQUIDATION_IMMINENT: {
  title: 'LIQUIDATION IMMINENT',
  body: '{walletName} position on {provider} at immediate liquidation risk. Health factor: {healthFactor}, Liquidation price: {liquidationPrice}. Take action NOW.'
},
```

### Config.toml [monitoring] Section (Flat Keys)

```toml
# Source: config.toml pattern -- NO NESTING per CLAUDE.md
[monitoring]
enabled = true

# HealthFactorMonitor
health_factor_safe_threshold = 2.0         # above this = SAFE (5min poll)
health_factor_warning_threshold = 1.5      # above this = WARNING (1min poll)
health_factor_danger_threshold = 1.2       # above this = DANGER (15s poll)
# below danger = CRITICAL (5s poll)

health_factor_safe_interval = 300          # seconds (5min)
health_factor_warning_interval = 60        # seconds (1min)
health_factor_danger_interval = 15         # seconds (15s)
health_factor_critical_interval = 5        # seconds (5s)

# MaturityMonitor
maturity_check_interval = 86400            # seconds (24h)
maturity_warning_days_first = 7            # first alert at 7 days
maturity_warning_days_final = 1            # final alert at 1 day
maturity_unredeemed_alert = true           # alert if position not redeemed after maturity

# MarginMonitor
margin_check_interval = 60                 # seconds (1min)
margin_warning_ratio = 0.3                 # warn when margin ratio < 30%
margin_critical_ratio = 0.15              # LIQUIDATION_IMMINENT when margin ratio < 15%

# Shared
cooldown_hours = 4                         # duplicate alert suppression window
```

### DaemonConfigSchema Extension Pattern

```typescript
// Source: packages/daemon/src/infrastructure/config/loader.ts
// Add to DaemonConfigSchema:
monitoring: z
  .object({
    enabled: z.boolean().default(true),
    health_factor_safe_threshold: z.number().min(1).max(10).default(2.0),
    health_factor_warning_threshold: z.number().min(1).max(10).default(1.5),
    health_factor_danger_threshold: z.number().min(1).max(10).default(1.2),
    health_factor_safe_interval: z.number().int().min(10).max(3600).default(300),
    health_factor_warning_interval: z.number().int().min(5).max(300).default(60),
    health_factor_danger_interval: z.number().int().min(3).max(60).default(15),
    health_factor_critical_interval: z.number().int().min(1).max(30).default(5),
    maturity_check_interval: z.number().int().min(3600).max(604800).default(86400),
    maturity_warning_days_first: z.number().int().min(1).max(30).default(7),
    maturity_warning_days_final: z.number().int().min(1).max(7).default(1),
    maturity_unredeemed_alert: z.boolean().default(true),
    margin_check_interval: z.number().int().min(10).max(3600).default(60),
    margin_warning_ratio: z.number().min(0.05).max(0.5).default(0.3),
    margin_critical_ratio: z.number().min(0.01).max(0.3).default(0.15),
    cooldown_hours: z.number().int().min(1).max(48).default(4),
  })
  .default({}),
```

Also add `'monitoring'` to `KNOWN_SECTIONS`:
```typescript
const KNOWN_SECTIONS = [
  // ... existing 12 ...
  'monitoring',
] as const;
```

### DaemonLifecycle Integration Pattern

```typescript
// Source: packages/daemon/src/lifecycle/daemon.ts
// Step 4c-11 (new): DeFiMonitorService initialization (fail-soft)
// Placed AFTER Step 4c-10 (AsyncPollingService) and AFTER PositionTracker

try {
  if (this.sqlite && this._settingsService) {
    const monitoringEnabled = this._settingsService.get('monitoring.enabled');
    if (monitoringEnabled !== 'false') {
      const { DeFiMonitorService } = await import(
        '../services/monitoring/defi-monitor-service.js'
      );
      this.defiMonitorService = new DeFiMonitorService({
        sqlite: this.sqlite,
        notificationService: this.notificationService,
        settingsService: this._settingsService,
        config: this._config!.monitoring,
      });
      this.defiMonitorService.start();
      console.debug('Step 4c-11: DeFi monitor service started');
    }
  }
} catch (err) {
  console.warn('Step 4c-11 (fail-soft): DeFi monitor init warning:', err);
  this.defiMonitorService = null;
}

// Shutdown (before EventBus cleanup):
if (this.defiMonitorService) {
  this.defiMonitorService.stop();
  this.defiMonitorService = null;
}
```

### BROADCAST_EVENTS Extension

```typescript
// Source: packages/daemon/src/notifications/notification-service.ts
const BROADCAST_EVENTS: Set<string> = new Set([
  'KILL_SWITCH_ACTIVATED',
  'KILL_SWITCH_RECOVERED',
  'AUTO_STOP_TRIGGERED',
  'TX_INCOMING_SUSPICIOUS',
  'LIQUIDATION_IMMINENT',     // NEW: critical DeFi risk, broadcast to all channels
]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No DeFi position monitoring | To be: IDeFiMonitor + 3 specialized monitors | Phase 269 (this phase) | Enables proactive risk alerts for lending/yield/perp positions |
| BalanceMonitorService (LOW_BALANCE only) | BalanceMonitor + DeFi monitors | Phase 269 (this phase) | Monitoring expanded from native balance to DeFi position risk |
| 6 notification categories | 7 categories (+defi_monitoring) | Phase 269 (this phase) | AI agents and Admin UI can filter DeFi-specific alerts |
| 39 notification event types | 43 event types (+4 DeFi events) | Phase 269 (this phase) | Complete coverage of DeFi risk conditions |
| 12 config.toml sections | 13 sections (+monitoring) | Phase 269 (this phase) | Runtime-configurable monitoring thresholds |

## Open Questions

1. **LIQUIDATION_IMMINENT category: defi_monitoring vs security_alert**
   - What we know: LIQUIDATION_IMMINENT represents imminent fund loss (critical severity). `security_alert` events are broadcast to ALL channels. Other DeFi events (WARNING level) should use normal priority delivery.
   - What's unclear: Whether LIQUIDATION_IMMINENT should be in the new `defi_monitoring` category (consistent) or `security_alert` (broadcast behavior).
   - Recommendation: Map to `security_alert` AND add to `BROADCAST_EVENTS`. This ensures broadcast delivery without changing the category system. Design document should explicitly justify this choice.

2. **Cooldown duration: 4 hours vs 24 hours**
   - What we know: BalanceMonitorService uses 24h cooldown. DeFi positions can change rapidly (especially perp). A 24h cooldown would miss important re-alerts.
   - What's unclear: Optimal cooldown for each monitor type.
   - Recommendation: Default 4h cooldown for WARNING-level alerts, NO cooldown for CRITICAL-level alerts (LIQUIDATION_IMMINENT). Design document should specify per-severity cooldown rules.

3. **Monitor data source: defi_positions table vs direct PositionTracker access**
   - What we know: PositionTracker populates defi_positions at category-specific intervals. Monitors need current data.
   - What's unclear: Whether monitors should read defi_positions (stale by up to pollingInterval) or request fresh data from IPositionProvider.
   - Recommendation: Read from defi_positions table. Monitors are complementary to PositionTracker -- they evaluate what PositionTracker has already synced. For HealthFactorMonitor in CRITICAL mode (5s), the PositionTracker LENDING interval (5min) means stale data. Design must address this: **option A** -- HealthFactorMonitor triggers an on-demand PositionTracker sync for LENDING category when entering DANGER/CRITICAL mode; **option B** -- accept staleness and note that critical mode catches the transition quickly enough. Recommend option A.

4. **EventBus vs direct NotificationService for alert emission**
   - What we know: IncomingTxMonitorService uses EventBus (`transaction:incoming` event) which NotificationService then processes. BalanceMonitorService calls `notificationService.notify()` directly.
   - What's unclear: Which pattern is better for DeFi monitors.
   - Recommendation: Direct `notificationService.notify()` (BalanceMonitorService pattern). DeFi monitors have a 1:1 relationship between evaluation and alert. EventBus adds indirection without benefit here. Reserve EventBus for cross-service communication patterns.

## Sources

### Primary (HIGH confidence)
- `/packages/daemon/src/services/monitoring/balance-monitor-service.ts` - BalanceMonitorService: complete monitor lifecycle (start/stop/updateConfig), cooldown, per-wallet isolation, notification integration
- `/packages/core/src/enums/notification.ts` - NOTIFICATION_EVENT_TYPES SSoT array (39 events), NotificationEventTypeEnum
- `/packages/core/src/schemas/signing-protocol.ts` - EVENT_CATEGORY_MAP (39 entries -> 6 categories), NOTIFICATION_CATEGORIES, EVENT_DESCRIPTIONS
- `/packages/daemon/src/notifications/notification-service.ts` - NotificationService.notify(), BROADCAST_EVENTS, priority-based delivery + fallback
- `/packages/daemon/src/lifecycle/daemon.ts` - DaemonLifecycle startup/shutdown sequence (Step 4c-4 BalanceMonitor, Step 4c-9 IncomingTxMonitor)
- `/packages/daemon/src/lifecycle/workers.ts` - BackgroundWorkers: overlap prevention, unref, stopAll
- `/packages/daemon/src/infrastructure/config/loader.ts` - DaemonConfigSchema (12 Zod sections), KNOWN_SECTIONS validation, flat-key rule
- `/packages/daemon/src/infrastructure/settings/hot-reload.ts` - HotReloadOrchestrator: reloadBalanceMonitor() pattern, duck-typed service deps
- `/packages/core/src/i18n/en.ts` - Notification message templates (title/body format with {variable} interpolation)
- `/packages/core/src/events/event-types.ts` - WaiaasEventMap typed events (7 event types)
- `/internal/objectives/m29-00-defi-advanced-protocol-design.md` - Phase 268 design output: defi_positions schema, PositionTracker, PositionWriteQueue, Zod schemas

### Secondary (MEDIUM confidence)
- `/packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` - IncomingTxMonitorService: orchestrator pattern (queue + multiplexer + workers), start/stop lifecycle
- `/.planning/phases/268-position-infra-design/268-RESEARCH.md` - Phase 268 research: established patterns, pitfalls, PositionTracker design rationale
- `/.planning/REQUIREMENTS.md` - MON-01 through MON-07 requirement definitions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries and patterns already exist in the codebase; no new dependencies needed
- Architecture: HIGH - Direct extensions of BalanceMonitorService, NotificationService, DaemonLifecycle patterns; only adaptive polling is a new pattern (but straightforward setTimeout-based design)
- Pitfalls: HIGH - Based on actual codebase constraints (KNOWN_SECTIONS validation, flat config rule, SSoT notification chain, cooldown patterns)

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (stable patterns, internal project)
