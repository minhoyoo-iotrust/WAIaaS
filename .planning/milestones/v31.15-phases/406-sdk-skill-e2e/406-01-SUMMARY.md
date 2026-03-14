---
phase: 406-sdk-skill-e2e
plan: 01
subsystem: sdk
tags: [sdk, typescript, validation, humanAmount, skill-files, dx]

requires:
  - phase: 405-human-amount-parameter
    provides: REST API and provider humanAmount XOR support
provides:
  - SDK SendTokenParams humanAmount field with XOR pre-validation
  - 4 skill files with unit guide sections and humanAmount-first examples
affects: [406-02, sdk-consumers, ai-agent-onboarding]

tech-stack:
  added: []
  patterns: [validateAmountOrHumanAmount XOR pattern in SDK pre-validation]

key-files:
  created: []
  modified:
    - packages/sdk/src/types.ts
    - packages/sdk/src/validation.ts
    - packages/sdk/src/__tests__/validation.test.ts
    - skills/transactions.skill.md
    - skills/actions.skill.md
    - skills/wallet.skill.md
    - skills/quickstart.skill.md

key-decisions:
  - "SDK humanAmount validates non-empty string only; server handles decimal-to-smallest-unit conversion"
  - "validateAmount replaced with validateAmountOrHumanAmount; CONTRACT_CALL and BATCH exempt from XOR requirement"

patterns-established:
  - "XOR validation: amount and humanAmount mutually exclusive at SDK pre-validation layer"

requirements-completed: [SDK-01, SDK-02, SDK-03, SDK-04]

duration: 4min
completed: 2026-03-14
---

# Phase 406 Plan 01: SDK humanAmount + Skill File Sync Summary

**SDK SendTokenParams humanAmount with XOR pre-validation (9 new tests) and 4 skill files updated with unit guide sections prioritizing humanAmount usage**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-14T10:27:53Z
- **Completed:** 2026-03-14T10:31:53Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- SendTokenParams.humanAmount field with JSDoc documentation
- validateAmountOrHumanAmount function implementing XOR logic (both=error, neither=error, amount=digit check, humanAmount=non-empty check)
- 9 new validation tests covering all humanAmount scenarios (37 total pass)
- 4 skill files with "Amount Units" guide sections showing humanAmount as preferred approach

## Task Commits

Each task was committed atomically:

1. **Task 1: SDK SendTokenParams humanAmount type + XOR pre-validation** - `4353113e` (feat)
2. **Task 2: Skill file unit guide sections** - `5794371d` (docs)

## Files Created/Modified
- `packages/sdk/src/types.ts` - Added humanAmount?: string to SendTokenParams
- `packages/sdk/src/validation.ts` - Replaced validateAmount with validateAmountOrHumanAmount XOR logic
- `packages/sdk/src/__tests__/validation.test.ts` - 9 new humanAmount tests
- `skills/transactions.skill.md` - Amount Units section with examples, XOR rule, CLOB exception
- `skills/actions.skill.md` - Amount Units for Actions with per-provider field name table
- `skills/wallet.skill.md` - Cross-reference to transactions.skill.md Amount Units
- `skills/quickstart.skill.md` - humanAmount as preferred in Step 6 with rules table

## Decisions Made
- SDK humanAmount validates non-empty string only; server handles decimal conversion (no SDK dependency on token registry)
- CONTRACT_CALL and BATCH types exempt from amount/humanAmount requirement (existing behavior preserved)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SDK types and validation ready for E2E testing in Plan 406-02
- All 242 SDK tests pass, typecheck clean

---
*Phase: 406-sdk-skill-e2e*
*Completed: 2026-03-14*
