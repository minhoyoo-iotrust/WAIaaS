---
phase: 238-compat-docs
plan: 01
subsystem: testing, api
tags: [policy-engine, token_limits, backward-compatibility, CAIP-19, skill-file]

# Dependency graph
requires:
  - phase: 236-policy-engine-token-tier
    provides: "evaluateTokenTier, evaluateSpendingLimit tokenContext, evaluateNativeTier guards"
  - phase: 235-schema-validation
    provides: "token_limits Zod schema in SpendingLimitRulesSchema"
provides:
  - "9 backward compatibility tests covering CMPT-01 (raw-only), CMPT-02 (token_limits priority), CMPT-03 (cumulative USD unaffected)"
  - "token_limits documentation in policies.skill.md with CAIP-19 key format, matching priority, and examples"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Backward compatibility tests as regression guards for new feature additions"

key-files:
  created: []
  modified:
    - "packages/daemon/src/__tests__/database-policy-engine.test.ts"
    - "skills/policies.skill.md"

key-decisions:
  - "CMPT-03a uses direct SQL to insert CONFIRMED transaction with amount_usd for cumulative limit testing"
  - "policies.skill.md raw fields (instant_max, notify_max, delay_max) marked as optional (No) since token_limits and USD thresholds can substitute"

patterns-established:
  - "Backward compatibility describe block naming: CMPT-XX prefix for traceability to requirements"

requirements-completed: [CMPT-01, CMPT-02, CMPT-03, CMPT-04]

# Metrics
duration: 3min
completed: 2026-02-22
---

# Phase 238 Plan 01: Backward Compatibility Tests + token_limits Documentation Summary

**9 backward compatibility tests for token_limits (CMPT-01/02/03) + policies.skill.md with CAIP-19 key format, matching priority, and workflow examples**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-22T10:23:37Z
- **Completed:** 2026-02-22T10:26:49Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- 9 backward compatibility tests pass covering raw-only policies (CMPT-01), token_limits priority (CMPT-02), and cumulative USD limits unaffected (CMPT-03)
- All 97 tests pass in database-policy-engine.test.ts (88 existing + 9 new, zero regressions)
- policies.skill.md updated with token_limits field documentation including CAIP-19 key format, matching priority, fallback behavior, scope, interaction with USD/cumulative limits, and curl example
- No production code changes -- tests and documentation only

## Task Commits

Each task was committed atomically:

1. **Task 1: Backward compatibility tests for token_limits** - `4c4b06a2` (test)
2. **Task 2: Document token_limits in policies.skill.md** - `b682b2c9` (docs)

## Files Created/Modified
- `packages/daemon/src/__tests__/database-policy-engine.test.ts` - 9 new backward compatibility tests in CMPT-01/02/03 describe block
- `skills/policies.skill.md` - token_limits in schema, field table, subsection, workflow example; version bumped to 2.6.0-rc

## Decisions Made
- CMPT-03a uses direct SQL (`conn.sqlite.prepare().run()`) to insert CONFIRMED transaction with `amount_usd` for cumulative limit testing -- consistent with existing TOCTOU test patterns
- policies.skill.md raw fields (`instant_max`, `notify_max`, `delay_max`) changed from Required=Yes to Required=No since token_limits and USD thresholds can substitute

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- This is the final plan of the final phase (238) in milestone v27.3
- All 4 phases complete: 235 (schema), 236 (engine), 237 (Admin UI), 238 (compat+docs)
- Ready for milestone completion PR

## Self-Check: PASSED

- FOUND: database-policy-engine.test.ts
- FOUND: policies.skill.md
- FOUND: 238-01-SUMMARY.md
- FOUND: commit 4c4b06a2 (Task 1)
- FOUND: commit b682b2c9 (Task 2)

---
*Phase: 238-compat-docs*
*Completed: 2026-02-22*
