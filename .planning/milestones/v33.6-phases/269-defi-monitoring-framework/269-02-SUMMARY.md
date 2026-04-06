---
phase: 269-defi-monitoring-framework
plan: 02
subsystem: monitoring
tags: [notification, config, lifecycle, hot-reload, broadcast, i18n, daemon]

requires:
  - phase: 269-defi-monitoring-framework
    provides: IDeFiMonitor interface, 3 monitor designs (sections 9-10), DeFiMonitorService orchestrator
provides:
  - 4 notification events SSoT chain (LIQUIDATION_WARNING, MATURITY_WARNING, MARGIN_WARNING, LIQUIDATION_IMMINENT)
  - New 'defi_monitoring' notification category
  - BROADCAST_EVENTS extension for LIQUIDATION_IMMINENT
  - Per-position cooldown strategy (walletId:positionId)
  - config.toml [monitoring] section with 17 flat keys
  - DaemonConfigSchema Zod extension with all defaults
  - Admin Settings 17 hot-reload keys
  - HotReloadOrchestrator.reloadDeFiMonitors()
  - DaemonLifecycle Step 4c-11 integration
  - 8 design decisions (DEC-MON-09 through DEC-MON-16)
affects: [270-lending, 271-yield, 272-perp, m29-02-implementation]

tech-stack:
  added: []
  patterns:
    - "SSoT chain 5-file update pattern for notification events"
    - "Per-position cooldown with composite walletId:positionId key"
    - "HotReloadOrchestrator extension for new monitoring service"

key-files:
  created: []
  modified:
    - internal/objectives/m29-00-defi-advanced-protocol-design.md

key-decisions:
  - "DEC-MON-09: LIQUIDATION_IMMINENT maps to security_alert + BROADCAST for maximum urgency"
  - "DEC-MON-10: New defi_monitoring category enables independent DeFi alert filtering"
  - "DEC-MON-11: Per-position cooldown (walletId:positionId) prevents cross-position alert blocking"
  - "DEC-MON-12: CRITICAL alerts have no cooldown — fund loss risk overrides notification fatigue"
  - "DEC-MON-13: 17 flat keys in [monitoring] section per CLAUDE.md no-nesting rule"
  - "DEC-MON-14: KNOWN_SECTIONS must include 'monitoring' for config validation"
  - "DEC-MON-15: All 17 keys hot-reloadable via Admin Settings"
  - "DEC-MON-16: Step 4c-11 placed after PositionTracker for data availability"

patterns-established:
  - "SSoT notification chain: enum array → category map → descriptions → i18n templates → broadcast set"
  - "Per-position cooldown: composite key walletId:positionId for DeFi alerts"
  - "DaemonLifecycle Step 4c-11: DeFi monitoring after PositionTracker, fail-soft"

requirements-completed: [MON-05, MON-06, MON-07]

duration: 15min
completed: 2026-02-26
---

# Plan 269-02 Summary

**4 notification events SSoT chain integrated, config.toml [monitoring] 17 flat keys defined, DaemonLifecycle Step 4c-11 with fail-soft start/stop designed in m29-00 sections 11-12**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-26
- **Completed:** 2026-02-26
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- 4 notification events fully specified across SSoT 5-file chain (notification.ts, signing-protocol.ts, en.ts, ko.ts, notification-service.ts)
- New 'defi_monitoring' category (6 -> 7) with LIQUIDATION_IMMINENT mapped to security_alert + BROADCAST
- config.toml [monitoring] section with 17 flat keys, full Zod validation, KNOWN_SECTIONS extension
- Admin Settings all 17 keys hot-reloadable via HotReloadOrchestrator.reloadDeFiMonitors()
- DaemonLifecycle Step 4c-11 integration (after PositionTracker, fail-soft pattern)
- 8 design decisions (DEC-MON-09 through DEC-MON-16)

## Task Commits

1. **Task 1: 4 notification events SSoT integration (section 11)** - `cac80a53` (docs)
2. **Task 2: Config structure + daemon lifecycle (section 12)** - included in same commit (both tasks modify same file)

## Files Created/Modified
- `internal/objectives/m29-00-defi-advanced-protocol-design.md` - Added sections 11 (notification event integration) and 12 (config + lifecycle)

## Decisions Made
- All 8 design decisions followed plan specifications exactly (DEC-MON-09 through DEC-MON-16)
- Updated event count from 39 (plan spec) to 44 (actual current codebase) for accuracy

## Deviations from Plan
- Minor: Plan referenced "기존 39개" notification events but actual count is 44. Updated design to reference correct count (44 → 48 after adding 4).

## Issues Encountered
None

## User Setup Required
None - design-only phase, no external service configuration required.

## Next Phase Readiness
- All 4 sections (9-12) of DeFi monitoring framework design complete
- 16 design decisions (DEC-MON-01 through DEC-MON-16) recorded
- Phase 270/271/272 can now proceed with knowledge of how their monitors integrate with IDeFiMonitor
- Implementation milestones have SSoT checklist (11.7) for notification chain updates

### Self-Check: PASSED
- [x] 4 notification events (LIQUIDATION_WARNING, MATURITY_WARNING, MARGIN_WARNING, LIQUIDATION_IMMINENT) fully specified
- [x] defi_monitoring category added to NOTIFICATION_CATEGORIES (6 → 7)
- [x] EVENT_CATEGORY_MAP: 3 events → defi_monitoring, LIQUIDATION_IMMINENT → security_alert
- [x] i18n templates: en (4 title+body) + ko (4 title+body)
- [x] BROADCAST_EVENTS: LIQUIDATION_IMMINENT added (4 → 5)
- [x] config.toml [monitoring]: 17 flat keys with Zod defaults
- [x] KNOWN_SECTIONS: 'monitoring' added (12 → 13)
- [x] Admin Settings: 17 hot-reload keys
- [x] HotReloadOrchestrator.reloadDeFiMonitors() specified
- [x] DaemonLifecycle Step 4c-11: start (after PositionTracker) + stop (before EventBus)
- [x] 8 design decisions (DEC-MON-09 through DEC-MON-16) recorded

---
*Phase: 269-defi-monitoring-framework*
*Completed: 2026-02-26*
