---
phase: 223-design-completeness
plan: 01
subsystem: design
tags: [notification-priority, ntfy, wallet-notification, safety-rules, decimals, getDecimals, incoming-tx]

# Dependency graph
requires:
  - phase: 222-design-critical-fix
    provides: GAP-1~4 + FLOW-2 critical/high fix completed in doc 76
provides:
  - "NOTIFY-1 resolved: INCOMING_TX_SUSPICIOUS priority:high routing mechanism specified per channel (NtfyChannel mapPriority + WalletNotificationChannel eventType branch)"
  - "getDecimals resolved: SafetyRuleContext.decimals field + getDecimals() helper function + DustAttackRule/LargeAmountRule ctx.decimals usage"
affects: [223-02-PLAN, m27-01-implementation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Channel-internal priority determination: each notification channel determines priority from eventType/category internally, no NotificationService interface change"
    - "SafetyRuleContext as external data carrier: decimals joins usdPrice, isRegisteredToken, avgIncomingUsd as context fields"
    - "getDecimals() DI pattern: tokenRegistryLookup callback separates DB dependency from pure logic"

key-files:
  created: []
  modified:
    - internal/design/76-incoming-transaction-monitoring.md

key-decisions:
  - "SUSPICIOUS priority routing via channel-internal eventType matching, no NotificationPayload interface change"
  - "SafetyRuleContext.decimals instead of IncomingTransaction type change (avoids DDL/INSERT/migration 4-site modification)"
  - "getDecimals() fallback 18 for unknown tokens (EVM standard; Solana unknowns caught by UnknownTokenRule first)"

patterns-established:
  - "Priority routing pattern: NtfyChannel uses string pattern matching (eventType.includes), WalletNotificationChannel uses exact eventType equality check"

requirements-completed: [EVT-02, EVT-05]

# Metrics
duration: 4min
completed: 2026-02-21
---

# Phase 223 Plan 01: SUSPICIOUS Priority Routing + getDecimals Helper Summary

**INCOMING_TX_SUSPICIOUS priority:high routing per channel (NtfyChannel mapPriority + WalletNotificationChannel) and SafetyRuleContext.decimals with getDecimals() helper replacing inline calls**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-21T12:37:40Z
- **Completed:** 2026-02-21T12:41:49Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- INCOMING_TX_SUSPICIOUS event routes to priority 4 (high) in NtfyChannel via SUSPICIOUS pattern matching in mapPriority()
- INCOMING_TX_SUSPICIOUS event routes to priority 5 (high) in WalletNotificationChannel via individual eventType check
- SafetyRuleContext extended with `decimals: number` field for token decimal precision
- getDecimals() helper function defined with NATIVE_DECIMALS map, tokenRegistryLookup callback, and fallback 18
- DustAttackRule and LargeAmountRule updated from `getDecimals(tx)` to `ctx.decimals`

## Task Commits

Each task was committed atomically:

1. **Task 1: SUSPICIOUS priority routing mechanism (section 6.3-6.4)** - `3ad25f6` (docs) -- previously committed
2. **Task 2: getDecimals() helper + SafetyRuleContext decimals (section 6.5-6.6)** - `5ef6965` (docs)

## Files Created/Modified
- `internal/design/76-incoming-transaction-monitoring.md` - sections 6.3 (SUSPICIOUS priority description), 6.4 (NtfyChannel.mapPriority extension, WalletNotificationChannel priority branch, NOTIFICATION_CATEGORIES comment update), 6.5 (SafetyRuleContext.decimals + getDecimals() helper definition), 6.6 (DustAttackRule/LargeAmountRule ctx.decimals)

## Decisions Made
- Used channel-internal priority determination (existing pattern) instead of adding priority field to NotificationPayload -- avoids breaking INotificationChannel interface across 4 channel implementations
- Added decimals to SafetyRuleContext instead of IncomingTransaction type -- avoids DDL, INSERT, migration, and type definition changes (4-site modification)
- getDecimals() uses fallback 18 for unknown tokens: EVM standard decimals, and Solana SPL unknowns are caught by UnknownTokenRule before decimals matters

## Deviations from Plan

### Partial Pre-completion

Task 1 (SUSPICIOUS priority routing, sections 6.3-6.4) was already completed in a previous session (commit `3ad25f6`, labeled as `223-02`). This task's work was verified as present and correct, so only Task 2 required new execution.

---

**Total deviations:** 0 auto-fixed
**Impact on plan:** Task 1 was pre-completed. Task 2 executed exactly as planned. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- NOTIFY-1 and getDecimals gaps fully resolved
- doc 76 sections 6.3-6.6 are now complete and consistent
- Ready for Plan 223-02 (doc 31 PATCH impact + skills/ update requirements) -- already completed in commit 3ad25f6

## Self-Check: PASSED

- FOUND: internal/design/76-incoming-transaction-monitoring.md
- FOUND: .planning/phases/223-design-completeness/223-01-SUMMARY.md
- FOUND: 3ad25f6 (Task 1 commit)
- FOUND: 5ef6965 (Task 2 commit)

---
*Phase: 223-design-completeness*
*Completed: 2026-02-21*
