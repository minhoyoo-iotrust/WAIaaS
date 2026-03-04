---
phase: 317-foundation
plan: 02
subsystem: core
tags: [erc-8004, zod, policy-schema, notification, admin-settings, i18n]

requires:
  - phase: 317-foundation
    provides: DB v39 migration with REPUTATION_THRESHOLD in POLICY_TYPES
provides:
  - 5 ERC-8004 notification events (AGENT_REGISTERED, AGENT_WALLET_LINKED, AGENT_WALLET_UNLINKED, REPUTATION_FEEDBACK_RECEIVED, REPUTATION_THRESHOLD_TRIGGERED)
  - NOTIFICATION_CATEGORIES 'identity' (8th category)
  - ReputationThresholdRulesSchema (min_score, below_threshold_tier, unrated_tier, tag1, tag2, check_counterparty)
  - 9 Admin Settings keys for ERC-8004 (feature gate, registry addresses, cache, timeout)
affects: [318, 319, 320, 321, 322, 323]

tech-stack:
  added: []
  patterns: [ReputationThresholdRulesSchema superRefine validation via POLICY_RULES_SCHEMAS]

key-files:
  created: []
  modified:
    - packages/core/src/enums/notification.ts
    - packages/core/src/schemas/signing-protocol.ts
    - packages/core/src/schemas/policy.schema.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/core/src/__tests__/enums.test.ts
    - packages/core/src/__tests__/signing-protocol.test.ts
    - packages/core/src/__tests__/policy-superrefine.test.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/src/__tests__/settings-service.test.ts

key-decisions:
  - "REPUTATION_THRESHOLD_TRIGGERED mapped to 'policy' category (policy evaluation result) while other 4 ERC-8004 events mapped to 'identity'"
  - "ReputationThresholdRulesSchema uses PolicyTierEnum for below_threshold_tier/unrated_tier with APPROVAL defaults"
  - "ERC-8004 feature gate (erc8004_agent_enabled) defaults to false for safe opt-in"
  - "Registry addresses use placeholder mainnet addresses (0x8004...) as defaults"

patterns-established:
  - "ERC-8004 identity/reputation notification events use 'identity' category"
  - "Policy rules schema registration pattern extended to 13 entries in POLICY_RULES_SCHEMAS"

requirements-completed: [PKG-03, NOTIF-01]

duration: 12min
completed: 2026-03-04
---

# Phase 317 Plan 02: Core Enum Extension + Admin Settings Summary

**5 ERC-8004 notification events, 'identity' category, ReputationThresholdRulesSchema with 6-field validation, and 9 Admin Settings keys (feature gate + registry addresses + cache config)**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-04T07:50:00Z
- **Completed:** 2026-03-04T08:02:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- NOTIFICATION_EVENT_TYPES extended from 49 to 54 entries (5 ERC-8004 events)
- NOTIFICATION_CATEGORIES extended from 7 to 8 with 'identity' category
- EVENT_CATEGORY_MAP and EVENT_DESCRIPTIONS fully mapped for all 54 events
- ReputationThresholdRulesSchema with min_score (0-100), below_threshold_tier, unrated_tier, tag1/tag2 filters, check_counterparty
- POLICY_RULES_SCHEMAS extended to 13 entries with REPUTATION_THRESHOLD
- 9 ERC-8004 Admin Settings: feature gate, 3 registry addresses, auto-publish, cache TTL, min score, RPC timeout
- i18n templates (en + ko) for all 5 new notification events
- 10 REPUTATION_THRESHOLD policy superRefine tests + 8 ERC-8004 settings tests

## Task Commits

1. **Task 1: Core Enum extension + ReputationThreshold policy schema + notification events** - `280a9ede` (feat)
2. **Task 2: Admin Settings 9 keys + ko.ts i18n fix** - `8ea95d4e` (feat)

## Files Created/Modified
- `packages/core/src/enums/notification.ts` - 5 ERC-8004 events added (54 total)
- `packages/core/src/schemas/signing-protocol.ts` - 'identity' category, EVENT_CATEGORY_MAP + EVENT_DESCRIPTIONS for 5 events
- `packages/core/src/schemas/policy.schema.ts` - ReputationThresholdRulesSchema + POLICY_RULES_SCHEMAS registration
- `packages/core/src/i18n/en.ts` - 5 English notification templates
- `packages/core/src/i18n/ko.ts` - 5 Korean notification templates
- `packages/core/src/__tests__/enums.test.ts` - PolicyType 17->18, NotificationEventType 49->54, new assertions
- `packages/core/src/__tests__/signing-protocol.test.ts` - NOTIFICATION_CATEGORIES 7->8, identity assertion
- `packages/core/src/__tests__/policy-superrefine.test.ts` - 10 REPUTATION_THRESHOLD validation tests
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - 9 ERC-8004 settings (actions category)
- `packages/daemon/src/__tests__/settings-service.test.ts` - 171->180, 43->52, 8 ERC-8004 tests

## Decisions Made
- REPUTATION_THRESHOLD_TRIGGERED maps to 'policy' category (outcome of policy evaluation), while AGENT_REGISTERED/WALLET_LINKED/UNLINKED/REPUTATION_FEEDBACK_RECEIVED map to 'identity'
- ReputationThresholdRulesSchema uses PolicyTierEnum for tier fields, with APPROVAL as the safe default
- Feature gate pattern: erc8004_agent_enabled defaults to 'false' for safe opt-in
- Validation Registry address defaults to empty string (standard not yet deployed)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing ko.ts notification templates**
- **Found during:** Task 2 (verification build)
- **Issue:** ko.ts was missing the 5 new ERC-8004 notification event templates, causing TypeScript compilation error (Record<NotificationEventType, ...> requires all 54 keys)
- **Fix:** Added 5 Korean notification templates matching the English ones
- **Files modified:** packages/core/src/i18n/ko.ts
- **Verification:** `pnpm --filter @waiaas/core run build` passes
- **Committed in:** 8ea95d4e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for TypeScript compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Core types ready for Phase 318-323 ERC-8004 features
- ReputationThresholdRulesSchema ready for policy engine integration
- Admin Settings ready for ERC-8004 ActionProvider configuration
- All 629 core tests + 60 settings tests pass
- Full typecheck passes across all packages

---
*Phase: 317-foundation*
*Completed: 2026-03-04*
