---
phase: 386-type-system-errors-db
plan: 01
subsystem: core
tags: [zod, discriminatedUnion, error-codes, signing-scheme, typescript]

requires:
  - phase: none
    provides: first phase in milestone

provides:
  - ResolvedAction 3-kind Zod discriminatedUnion (contractCall/signedData/signedHttp)
  - SigningSchemeEnum 7-value Zod enum
  - normalizeResolvedAction/normalizeResolvedActions utilities
  - 6 new error codes (CREDENTIAL + ACTION + POLICY domains)

affects: [386-02, 386-03, 387, 388, 389, 390]

tech-stack:
  added: []
  patterns: [resolved-action-normalization, 3-kind-action-dispatch]

key-files:
  created:
    - packages/core/src/enums/signing-scheme.ts
    - packages/core/src/schemas/resolved-action.schema.ts
    - packages/core/src/__tests__/resolved-action.test.ts
  modified:
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/enums/index.ts
    - packages/core/src/index.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts

key-decisions:
  - "SignedHttpActionSchema.signingScheme restricted to erc8128/hmac-sha256 subset (only HTTP-applicable schemes)"
  - "NormalizedContractCallSchema extends ContractCallRequestSchema with kind field, not modifying original (backward compat)"
  - "CREDENTIAL domain added as new ErrorDomain (separate from ACTION for credential-specific errors)"

patterns-established:
  - "3-kind dispatch: ResolvedActionSchema.parse() auto-discriminates on kind field"
  - "Normalization pattern: legacy ContractCallRequest (no kind) auto-upgraded to kind:'contractCall'"

requirements-completed: [RTYPE-01, RTYPE-02, RTYPE-03, RTYPE-04, RTYPE-06, ERR-01, ERR-02, ERR-03]

duration: 8min
completed: 2026-03-12
---

# Phase 386 Plan 01: ResolvedAction Zod Type System + Error Codes Summary

**ResolvedAction 3-kind discriminatedUnion (contractCall/signedData/signedHttp) with SigningSchemeEnum 7-value and 6 External Action error codes**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-11T17:39:15Z
- **Completed:** 2026-03-11T17:47:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- ResolvedAction 3-kind Zod discriminatedUnion dispatching on `kind` field
- SigningSchemeEnum with 7 signing schemes for ISignerCapability registry
- normalizeResolvedAction() for backward-compatible ContractCallRequest normalization
- 6 new error codes across CREDENTIAL, ACTION, POLICY domains
- 25 unit tests covering schema parsing, normalization, and edge cases

## Task Commits

1. **Task 1: SigningSchemeEnum + ResolvedAction Zod schemas + normalize utilities** - `7f6a32b3` (feat)
2. **Task 2: External Action error codes 6 types** - `5b57f2dd` (feat)
3. **Test fixes: error code count assertions** - `96c73f65` (test)

## Files Created/Modified
- `packages/core/src/enums/signing-scheme.ts` - SigningSchemeEnum 7-value Zod enum
- `packages/core/src/schemas/resolved-action.schema.ts` - ResolvedAction 3-kind discriminatedUnion + normalize utilities
- `packages/core/src/__tests__/resolved-action.test.ts` - 25 unit tests
- `packages/core/src/errors/error-codes.ts` - 6 new error codes (CREDENTIAL_NOT_FOUND, CREDENTIAL_EXPIRED, SIGNING_SCHEME_UNSUPPORTED, CAPABILITY_NOT_FOUND, VENUE_NOT_ALLOWED, EXTERNAL_ACTION_FAILED)
- `packages/core/src/i18n/en.ts` + `ko.ts` - i18n translations for new codes

## Decisions Made
- SignedHttpActionSchema restricts signingScheme to erc8128/hmac-sha256 (only HTTP-applicable schemes)
- NormalizedContractCallSchema extends (not modifies) ContractCallRequestSchema for backward compat
- CREDENTIAL as new ErrorDomain separate from ACTION for credential-specific errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing test assertions for error code counts**
- **Found during:** Task 2 verification
- **Issue:** errors.test.ts, i18n.test.ts, package-exports.test.ts had hardcoded error code counts (137) that did not account for new codes
- **Fix:** Updated counts to 143 (137 + 6), domain count to 17, ACTION domain count to 11
- **Files modified:** errors.test.ts, i18n.test.ts, package-exports.test.ts
- **Committed in:** 96c73f65

**2. [Rule 1 - Bug] Added i18n translations for new error codes**
- **Found during:** Task 2 typecheck
- **Issue:** Messages interface requires all ErrorCode keys to have translations; 6 new codes were missing
- **Fix:** Added en/ko translations for all 6 new error codes
- **Files modified:** en.ts, ko.ts
- **Committed in:** 5b57f2dd

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both essential for existing test suite and type safety. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ResolvedAction types ready for Plan 386-02 (DB migration) and Plan 386-03 (IActionProvider extension)
- All 781 core tests pass

---
*Phase: 386-type-system-errors-db*
*Completed: 2026-03-12*
