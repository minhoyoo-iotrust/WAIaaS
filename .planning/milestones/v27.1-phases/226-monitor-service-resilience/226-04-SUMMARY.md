---
phase: 226-monitor-service-resilience
plan: 04
subsystem: incoming-tx
tags: [safety-rules, monitor-service, killswitch, eventbus, cooldown, hot-reload, lifecycle]

# Dependency graph
requires:
  - phase: 226-01
    provides: IncomingTxQueue with push/flush/drain
  - phase: 226-02
    provides: SubscriptionMultiplexer with addWallet/removeWallet/stopAll
  - phase: 226-03
    provides: Worker handlers (confirmation, retention, gap recovery, cursor)
provides:
  - IIncomingSafetyRule interface + 3 implementations (DustAttackRule, UnknownTokenRule, LargeAmountRule)
  - IncomingTxMonitorService orchestrator with start/stop/updateConfig/syncSubscriptions
  - DaemonLifecycle Step 4c-9 fail-soft initialization
  - Graceful shutdown with queue drain before connection teardown
  - HotReloadOrchestrator incoming.* key detection and config reload
  - 7 incoming.* setting keys registered in setting-keys.ts
affects: [227-api-admin-config, 228-monitoring-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [fail-soft-lifecycle, notification-cooldown, kill-switch-suppression, duck-typed-hot-reload-deps]

key-files:
  created:
    - packages/daemon/src/services/incoming/safety-rules.ts
    - packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts
    - packages/daemon/src/services/incoming/__tests__/safety-rules.test.ts
    - packages/daemon/src/services/incoming/__tests__/incoming-tx-monitor-service.test.ts
  modified:
    - packages/daemon/src/services/incoming/index.ts
    - packages/daemon/src/services/incoming/subscription-multiplexer.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/infrastructure/settings/hot-reload.ts

key-decisions:
  - "SubscriberFactory type broadened to return IChainSubscriber | Promise<IChainSubscriber> for async dynamic imports"
  - "Safety rules return false (safe default) when price/average data is unavailable"
  - "KillSwitch null check treats missing killSwitchService same as ACTIVE state for notifications"
  - "Duck-typed incomingTxMonitorService in HotReloadDeps to avoid circular imports"

patterns-established:
  - "IIncomingSafetyRule: check(tx, context) returns boolean for suspicious flagging"
  - "Notification cooldown: per-wallet per-event-type Map<string, number> with configurable minutes"

requirements-completed: [EVT-01, EVT-03, EVT-04, EVT-05, CFG-04]

# Metrics
duration: 11min
completed: 2026-02-22
---

# Phase 226 Plan 04: Monitor Service + Safety Rules Summary

**3 safety rules (dust/unknownToken/largeAmount) + IncomingTxMonitorService orchestrator with EventBus events, KillSwitch suppression, notification cooldown, and DaemonLifecycle fail-soft integration**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-21T16:20:12Z
- **Completed:** 2026-02-21T16:31:25Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- 3 safety rules correctly flag dust attacks, unknown token transfers, and large amounts
- IncomingTxMonitorService orchestrates queue + multiplexer + 6 workers + events + notifications
- EventBus emits transaction:incoming and transaction:incoming:suspicious on every flush
- KillSwitch SUSPENDED/LOCKED suppresses notifications but never DB writes or event emission
- Per-wallet per-event-type notification cooldown prevents notification spam
- DaemonLifecycle Step 4c-9 fail-soft pattern with graceful shutdown drain
- 7 incoming.* setting keys registered for SettingsService hot-reload support

## Task Commits

Each task was committed atomically:

1. **Task 1: Safety rules + IncomingTxMonitorService + tests** - `2223283b` (feat)
2. **Task 2: DaemonLifecycle + setting-keys + hot-reload integration** - `c4ce706e` (feat)

## Files Created/Modified
- `packages/daemon/src/services/incoming/safety-rules.ts` - IIncomingSafetyRule interface + DustAttackRule, UnknownTokenRule, LargeAmountRule
- `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` - Top-level orchestrator with start/stop/updateConfig/syncSubscriptions
- `packages/daemon/src/services/incoming/__tests__/safety-rules.test.ts` - 16 tests for all 3 rules with edge cases
- `packages/daemon/src/services/incoming/__tests__/incoming-tx-monitor-service.test.ts` - 15 tests for lifecycle, events, KillSwitch, cooldown
- `packages/daemon/src/services/incoming/index.ts` - Re-exports for safety rules and monitor service
- `packages/daemon/src/services/incoming/subscription-multiplexer.ts` - SubscriberFactory type broadened for async
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - 7 incoming.* setting definitions added
- `packages/daemon/src/lifecycle/daemon.ts` - Step 4c-9 init + shutdown drain
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` - incoming.* key detection + reloadIncomingMonitor()

## Decisions Made
- Broadened SubscriptionMultiplexer's SubscriberFactory type to `IChainSubscriber | Promise<IChainSubscriber>` to support dynamic import in DaemonLifecycle (awaited in addWallet which is already async)
- Safety rules use null-safe defaults: when price data is unavailable (usdPrice/avgIncomingUsd null), rules return false (not suspicious) to avoid false positives
- Notification service is called when killSwitchService is null (no kill switch) OR when state is ACTIVE; only SUSPENDED/LOCKED suppress notifications
- HotReloadDeps uses duck-typed `{ updateConfig: (config: Partial<any>) => void }` instead of importing IncomingTxMonitorService directly to avoid circular dependencies
- Fixed plan's package names from `@waiaas/adapters-solana/adapters-evm` to correct `@waiaas/adapter-solana/adapter-evm`
- Fixed plan's constructor calls from positional args to config object pattern matching actual SolanaIncomingSubscriber/EvmIncomingSubscriber constructors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Broadened SubscriberFactory type for async support**
- **Found during:** Task 1 (IncomingTxMonitorService creation)
- **Issue:** SubscriptionMultiplexer's SubscriberFactory was sync-only but DaemonLifecycle needs async factory (dynamic imports)
- **Fix:** Changed type to `IChainSubscriber | Promise<IChainSubscriber>`, added `await` in addWallet
- **Files modified:** packages/daemon/src/services/incoming/subscription-multiplexer.ts
- **Verification:** All 19 existing multiplexer tests still pass (backward compatible)
- **Committed in:** 2223283b (Task 1 commit)

**2. [Rule 1 - Bug] Fixed package names in subscriber factory**
- **Found during:** Task 2 (DaemonLifecycle typecheck)
- **Issue:** Plan used `@waiaas/adapters-solana` and `@waiaas/adapters-evm` but actual packages are `@waiaas/adapter-solana` and `@waiaas/adapter-evm`
- **Fix:** Corrected import paths
- **Files modified:** packages/daemon/src/lifecycle/daemon.ts
- **Committed in:** c4ce706e (Task 2 commit)

**3. [Rule 1 - Bug] Fixed subscriber constructor signatures**
- **Found during:** Task 2 (DaemonLifecycle typecheck)
- **Issue:** Plan used positional args `new SolanaIncomingSubscriber(rpcUrl, wssUrl)` but actual constructors use config objects
- **Fix:** Changed to `new SolanaIncomingSubscriber({ rpcUrl, wsUrl: wssUrl })` and `new EvmIncomingSubscriber({ rpcUrl })`
- **Files modified:** packages/daemon/src/lifecycle/daemon.ts
- **Committed in:** c4ce706e (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All incoming TX monitoring components are wired and tested
- Phase 226 complete: queue + multiplexer + workers + safety rules + orchestrator + lifecycle integration
- Ready for Phase 227 (API + Admin UI for incoming TX settings and monitoring)

## Self-Check: PASSED

- All 4 created files exist on disk
- Both task commits (2223283b, c4ce706e) found in git history
- Typecheck: 0 errors
- Lint: 0 errors (268 pre-existing warnings)
- Tests: 106/106 passed (5 test files in incoming/__tests__/)

---
*Phase: 226-monitor-service-resilience*
*Completed: 2026-02-22*
