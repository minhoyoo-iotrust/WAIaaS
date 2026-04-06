---
phase: 273-intent-signing-pattern
plan: 02
subsystem: design
tags: [eip-712, intent, signTypedData, chain-adapter, security, cow-protocol, async-polling]

requires:
  - phase: 273-intent-signing-pattern
    plan: 01
    provides: "Section 24: SignableOrder Zod schema + ActionProviderRegistry extension"
provides:
  - "Section 25: EIP-712 signing pipeline + IntentOrderTracker + bifurcation architecture"
  - "Section 26: 4-layer security model + IntentSecurityValidator + attack vector analysis"
  - "IChainAdapter.signTypedData() method design (method 23, EVM-only)"
  - "10-step intent pipeline with component mapping"
  - "IntentOrderTracker (IAsyncStatusTracker, 10s/180 attempts)"
  - "IntentSecurityValidator with 4 ordered validation rules"
  - "14 design decisions (DEC-INTENT-08 through DEC-INTENT-21)"
affects: [m29-14-cow-protocol]

tech-stack:
  added: []
  patterns: ["Intent pipeline 10-step", "IntentSecurityValidator fail-fast ordering", "signTypedData EVM-only adapter extension"]

key-files:
  created: []
  modified:
    - "internal/objectives/m29-00-defi-advanced-protocol-design.md"

key-decisions:
  - "DEC-INTENT-08: signTypedData is new IChainAdapter method (method 23), separate from signExternalTransaction"
  - "DEC-INTENT-09: Intent pipeline is 10 steps, completely separate from 6-stage pipeline"
  - "DEC-INTENT-10: IntentOrderTracker 10s polling (CoW orders fill in 1-2 minutes)"
  - "DEC-INTENT-11: maxAttempts=180 (30min timeout, consistent with validTo deadline)"
  - "DEC-INTENT-12: executeResolve returns homogeneous results only"
  - "DEC-INTENT-15: IntentSecurityValidator is separate from PolicyEngine (security before policy)"
  - "DEC-INTENT-16: INTENT_VERIFYING_CONTRACT_WHITELIST is default-deny"
  - "DEC-INTENT-17: MAX_DEADLINE_SECONDS=300 (5 min)"
  - "DEC-INTENT-18: Validation order is fail-fast: deadline → chainId → whitelist → duplicate"

patterns-established:
  - "10-step intent pipeline as alternative to 6-stage pipeline"
  - "IntentSecurityValidator: independent security validation before PolicyEngine"
  - "4-layer EIP-712 binding: chainId + verifyingContract + nonce + deadline"

requirements-completed: [INTENT-03, INTENT-04, INTENT-05, INTENT-06]

duration: 10min
completed: 2026-02-26
---

# Plan 273-02: EIP-712 Pipeline + Status Tracking + Security Design Summary

**IChainAdapter.signTypedData extension, 10-step intent pipeline, IntentOrderTracker async polling, 4-layer security model with attack vector analysis (21 design decisions total for Phase 273)**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-26
- **Completed:** 2026-02-26
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Designed IChainAdapter.signTypedData() as method 23 with TypedDataParams/TypedDataSignature types and EvmAdapter/SolanaAdapter implementations
- Specified 10-step intent pipeline with component mapping (6 existing, 4 new) and comparison to 6-stage pipeline
- Designed IntentOrderTracker (IAsyncStatusTracker) with CoW Protocol 5-state mapping, INTENT_ORDER_FILLED notification
- Defined pipeline bifurcation point at actions.ts with homogeneous result constraint
- Designed 4-layer security model (chainId + verifyingContract + nonce + deadline) with IntentSecurityValidator
- Analyzed 7 attack vectors with mitigations and 3 residual risks

## Task Commits

1. **Task 1+2: Sections 25-26 (pipeline + security)** - `738a45c4` (docs)

## Files Created/Modified
- `internal/objectives/m29-00-defi-advanced-protocol-design.md` - Added sections 25 (25.1-25.5) and 26 (26.1-26.4) with pipeline and security design

## Decisions Made
- DEC-INTENT-08~21: 14 design decisions across sections 25 and 26
- Phase 273 total: 21 design decisions (DEC-INTENT-01 through DEC-INTENT-21)

## Deviations from Plan

None - plan executed exactly as written. Tasks 1 and 2 were combined into a single commit since both modify the same file and are tightly coupled.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 273 complete: all 3 sections (24, 25, 26) of intent signing pattern design are finished
- m29-14 (CoW Protocol implementation) has complete design specification
- Design covers: type system (section 24), pipeline (section 25), security (section 26)
- 21 design decisions provide implementation guidance without ambiguity

---
*Phase: 273-intent-signing-pattern*
*Completed: 2026-02-26*
