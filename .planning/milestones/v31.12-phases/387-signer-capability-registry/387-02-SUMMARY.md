---
phase: 387-signer-capability-registry
plan: 02
subsystem: signing
tags: [registry, bootstrap, backward-compat, tdd]

requires:
  - phase: 387-01
    provides: ISignerCapability interface, 7 capability implementations

provides:
  - SignerCapabilityRegistry (ISignerCapabilityRegistry implementation)
  - bootstrapSignerCapabilities() factory function
  - Backward compatibility proof (existing pipelines independent)

affects: [390-pipeline-routing]

tech-stack:
  added: []
  patterns: [SignerCapabilityRegistry Map-based lookup, WAIaaSError for resolve failures]

key-files:
  created:
    - packages/daemon/src/signing/registry.ts
    - packages/daemon/src/signing/bootstrap.ts
    - packages/daemon/src/__tests__/signer-registry.test.ts
    - packages/daemon/src/__tests__/signer-backward-compat.test.ts
  modified:
    - packages/daemon/src/signing/index.ts

key-decisions:
  - "resolve() does NOT call canSign() -- credential not yet injected at resolve time (doc-81 D2.5)"
  - "resolve() throws WAIaaSError CAPABILITY_NOT_FOUND (not SigningError) since this is API-facing"
  - "Static analysis backward compat tests read source files to prove independence"

patterns-established:
  - "SignerCapabilityRegistry: resolve(action) extracts signingScheme, throws WAIaaSError if missing"
  - "bootstrap pattern: single function registers all capabilities at startup"

requirements-completed: [SIGN-07, SIGN-08]

duration: 3min
completed: 2026-03-12
---

# Phase 387 Plan 02: SignerCapabilityRegistry + Bootstrap + Backward Compat Summary

**SignerCapabilityRegistry auto-resolves signingScheme to ISignerCapability, bootstrapSignerCapabilities registers all 7, static analysis proves existing pipelines independent**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-11T18:23:30Z
- **Completed:** 2026-03-11T18:26:30Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- SignerCapabilityRegistry with Map-based register/get/resolve/listSchemes
- bootstrapSignerCapabilities() factory that registers all 7 capabilities in one call
- resolve() auto-selects signer from SignedDataAction/SignedHttpAction signingScheme field
- Static analysis backward compat tests prove sign-message/sign-only/erc8128 routes are independent
- 22 TDD tests + 19 regression tests all pass

## Task Commits

Each task was committed atomically:

1. **Task 1: SignerCapabilityRegistry + bootstrap + backward compat** - `3a41267c` (feat)

## Files Created/Modified
- `packages/daemon/src/signing/registry.ts` - ISignerCapabilityRegistry interface + SignerCapabilityRegistry class
- `packages/daemon/src/signing/bootstrap.ts` - bootstrapSignerCapabilities() factory
- `packages/daemon/src/signing/index.ts` - Added registry + bootstrap re-exports
- `packages/daemon/src/__tests__/signer-registry.test.ts` - 13 registry tests
- `packages/daemon/src/__tests__/signer-backward-compat.test.ts` - 9 static analysis independence tests

## Decisions Made
- resolve() does NOT call canSign() since credential is not yet injected at resolve time (per doc-81 D2.5)
- resolve() throws WAIaaSError CAPABILITY_NOT_FOUND (API-facing error) rather than SigningError (internal error)
- Backward compat tests use source file static analysis (readFileSync + string match) to prove import independence

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SignerCapabilityRegistry ready for pipeline wiring in Phase 390
- bootstrapSignerCapabilities() ready for server.ts integration in Phase 390
- All 61 new tests + existing tests pass, no regressions

---
*Phase: 387-signer-capability-registry*
*Completed: 2026-03-12*
