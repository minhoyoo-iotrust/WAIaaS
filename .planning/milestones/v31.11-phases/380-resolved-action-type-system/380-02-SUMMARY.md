---
phase: 380-resolved-action-type-system
plan: 02
subsystem: api
tags: [signer, capability, signing-scheme, interface, eip712, hmac, rsa-pss, ed25519]

requires:
  - phase: 380-resolved-action-type-system/01
    provides: ResolvedAction Zod union with signingScheme field
provides:
  - ISignerCapability interface (scheme, canSign, sign)
  - SigningSchemeEnum (7 schemes)
  - SigningParams discriminated union (7 variants)
  - SigningResult and SigningError types
  - SignerCapabilityRegistry interface
  - Existing 4 signer adapter mapping
affects: [phase-382, phase-383, phase-385]

tech-stack:
  added: []
  patterns: [capability-based-signing, discriminated-union-params, registry-pattern]

key-files:
  created:
    - .planning/phases/380-resolved-action-type-system/design/signer-capability-interface.md
  modified: []

key-decisions:
  - "SigningParams는 scheme별 discriminated union (타입 안전성 보장)"
  - "credential 주입 시점: sign() 직전에 CredentialVault에서 주입 (노출 최소화)"
  - "TransactionSignerCapability는 registry에 등록하지 않음 (기존 6-stage pipeline 사용)"
  - "canSign()은 동기 메서드 (키 타입/payload 구조 검사만)"
  - "SigningResult.signature를 string | Uint8Array (scheme별 형태 상이)"

patterns-established:
  - "ISignerCapability: scheme-specific signing abstraction with canSign/sign methods"
  - "SignerCapabilityRegistry: signingScheme -> ISignerCapability automatic mapping"
  - "Existing pipeline isolation: ISignerCapability only used in new ActionProvider path"

requirements-completed: [SIGN-01, SIGN-02]

duration: 7min
completed: 2026-03-11
---

# Phase 380 Plan 02: ISignerCapability Interface Summary

**ISignerCapability unified signer abstraction with 7-scheme SigningSchemeEnum, discriminated union SigningParams, and SignerCapabilityRegistry for ActionProvider signing delegation**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-11T14:43:00Z
- **Completed:** 2026-03-11T14:50:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- ISignerCapability interface designed with scheme/canSign/sign triple
- SigningSchemeEnum covering 7 signing methods: eip712, personal, hmac-sha256, rsa-pss, ecdsa-secp256k1, ed25519, erc8128
- SigningParams discriminated union with scheme-specific typed variants for type safety
- SignerCapabilityRegistry interface with register/get/resolve/listSchemes
- Clear mapping of existing 4 signers to ISignerCapability adapters (Phase 382 detail)
- Existing pipeline non-modification principle documented with architecture diagram

## Task Commits

Each task was committed atomically:

1. **Task 1: ISignerCapability 인터페이스 + SigningSchemeEnum 설계** - `b2309123` (feat)

## Files Created/Modified
- `.planning/phases/380-resolved-action-type-system/design/signer-capability-interface.md` - ISignerCapability interface + SigningSchemeEnum + SigningParams/Result types

## Decisions Made
- SigningParams uses discriminated union (not generic object) for compile-time type safety
- Credential injection at sign() time, not resolve() time, to minimize exposure
- TransactionSignerCapability excluded from registry (contractCall uses existing pipeline)
- canSign() is synchronous (no I/O needed for key type / payload structure checks)
- SigningResult.signature is string | Uint8Array to accommodate scheme-specific formats

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ISignerCapability interface ready as input for Phase 382 (Signer Capabilities detailed design)
- SignerCapabilityRegistry interface ready for Phase 383 (Pipeline Routing)
- SigningSchemeEnum shared between ResolvedAction types (Plan 01) and ISignerCapability (Plan 02)

---
*Phase: 380-resolved-action-type-system*
*Completed: 2026-03-11*
