---
phase: 273-intent-signing-pattern
plan: 01
subsystem: design
tags: [eip-712, intent, signable-order, zod, cow-protocol, action-provider]

requires:
  - phase: 272-perp-framework-design
    provides: "IPerpProvider framework + sections 21-23 in m29-00"
provides:
  - "Section 24 in m29-00: SignableOrder Zod schema + ActionProviderRegistry extension"
  - "SignableOrderSchema with type='INTENT', EIP-712 domain, intentMetadata"
  - "ResolveResult union type design (ContractCallRequest | SignableOrder)"
  - "TRANSACTION_TYPES extended to 8 values"
  - "7 design decisions (DEC-INTENT-01 through DEC-INTENT-07)"
affects: [273-02-PLAN, m29-14-cow-protocol]

tech-stack:
  added: []
  patterns: ["SignableOrder discriminatedUnion pattern", "ResolveResult union return type"]

key-files:
  created: []
  modified:
    - "internal/objectives/m29-00-defi-advanced-protocol-design.md"

key-decisions:
  - "DEC-INTENT-01: SignableOrder uses type='INTENT' literal for discriminatedUnion branching"
  - "DEC-INTENT-02: SignableOrder fields map 1:1 to viem signTypedData params"
  - "DEC-INTENT-03: intentMetadata carries off-chain API URLs and trade details"
  - "DEC-INTENT-04: ActionProviderRegistry.executeResolve() returns union (Option A recommended)"
  - "DEC-INTENT-05: TRANSACTION_TYPES extended to 8 values, TransactionRequestSchema unchanged"
  - "DEC-INTENT-06: Amount fields use string for bigint serialization"
  - "DEC-INTENT-07: Only CoW Protocol domain fully specified"

patterns-established:
  - "SignableOrder as protocol-agnostic intent type: any EIP-712-based intent protocol fits this schema"
  - "ResolveResult union: ActionProviderRegistry returns ContractCallRequest | SignableOrder discriminated by type field"

requirements-completed: [INTENT-01, INTENT-02]

duration: 8min
completed: 2026-02-26
---

# Plan 273-01: SignableOrder Type + ActionProviderRegistry Extension Summary

**SignableOrder Zod schema with EIP-712 domain + intentMetadata, ActionProviderRegistry union return type extension, and TRANSACTION_TYPES 8th value 'INTENT'**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-26
- **Completed:** 2026-02-26
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Defined SignableOrderSchema (Zod SSoT) with type='INTENT', EIP-712 domain/types/primaryType/message, and intentMetadata (protocol, orderApiUrl, statusApiUrl, sellToken, buyToken, sellAmount, buyAmount, validTo)
- Documented EIP-712 standard structure and known protocol domains (CoW Protocol fully specified)
- Designed ActionProviderRegistry extension with two options (Option A: union return recommended, Option B: separate method documented)
- Extended TRANSACTION_TYPES to 8 values while keeping TransactionRequestSchema (5-type) unchanged

## Task Commits

1. **Task 1: SignableOrder Zod schema + EIP-712 domain/types (section 24.1-24.2)** - `fc7dfb7c` (docs)
2. **Task 2: ActionProviderRegistry extension + TRANSACTION_TYPES + design decisions (section 24.3-24.4)** - `58cdfd65` (docs)

## Files Created/Modified
- `internal/objectives/m29-00-defi-advanced-protocol-design.md` - Added section 24 (24.1-24.4) with SignableOrder type system and registry extension

## Decisions Made
- DEC-INTENT-01~07: 7 design decisions documented in section 24.4
- Key: Option A (union return type) recommended over Option B (separate method) for ActionProviderRegistry extension

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Section 24 provides the complete type foundation for Plan 273-02 (sections 25-26: pipeline + security)
- SignableOrder schema ready for IChainAdapter.signTypedData() integration
- ResolveResult union ready for bifurcation point design

---
*Phase: 273-intent-signing-pattern*
*Completed: 2026-02-26*
