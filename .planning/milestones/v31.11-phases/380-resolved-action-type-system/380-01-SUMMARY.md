---
phase: 380-resolved-action-type-system
plan: 01
subsystem: api
tags: [zod, discriminated-union, action-provider, type-system, off-chain]

requires:
  - phase: none
    provides: first phase of milestone
provides:
  - ResolvedAction Zod discriminatedUnion (3-kind: contractCall/signedData/signedHttp)
  - SignedDataAction schema (signingScheme, payload, venue, operation, credentialRef, tracking, policyContext)
  - SignedHttpAction schema integrating SignHttpMessageParams with venue/operation
  - normalizeResolvedAction() normalization strategy
  - 13 ActionProvider backward compatibility analysis
affects: [phase-381, phase-382, phase-383, phase-384, phase-385]

tech-stack:
  added: []
  patterns: [kind-based-pipeline-routing, registry-normalization, raw-vs-normalized-type-split]

key-files:
  created:
    - .planning/phases/380-resolved-action-type-system/design/resolved-action-types.md
  modified: []

key-decisions:
  - "kind 필드를 optional로 추가하여 기존 13개 provider 코드 변경 0줄 보장"
  - "정규화를 ActionProviderRegistry에서만 수행 (단일 정규화 지점)"
  - "ApiDirectResult는 ResolvedAction union 밖으로 분리 (의미론적 차이: 실행 완료 vs 서명 대기)"
  - "SignedHttpAction.signingScheme을 3종으로 제한 (erc8128, hmac-sha256, rsa-pss)"
  - "payload를 Record<string, unknown>으로 두고 scheme별 런타임 검증 위임"
  - "tracking/policyContext를 optional로 하여 동기/비동기 액션 모두 수용"

patterns-established:
  - "kind field for pipeline routing (distinct from type field for transaction classification)"
  - "Registry-level normalization: providers return raw, registry normalizes before pipeline entry"
  - "RawResolvedAction vs ResolvedAction type split for pre/post normalization"

requirements-completed: [TYPE-01, TYPE-02, TYPE-03, TYPE-04, TYPE-05, TYPE-06]

duration: 8min
completed: 2026-03-11
---

# Phase 380 Plan 01: ResolvedAction 타입 시스템 Summary

**ResolvedAction 3-kind Zod discriminatedUnion with SignedDataAction/SignedHttpAction schemas and registry normalization strategy for 13-provider backward compatibility**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-11T14:34:56Z
- **Completed:** 2026-03-11T14:42:56Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- ResolvedAction Zod discriminatedUnion designed with 3 kinds: contractCall, signedData, signedHttp
- SignedDataAction schema covering EIP-712, HMAC, RSA-PSS, Ed25519 signing with venue/operation/credentialRef/tracking/policyContext
- SignedHttpAction schema integrating existing SignHttpMessageParams (minus privateKey/chainId/address) with venue/operation
- normalizeResolvedAction() function design for backward-compatible kind injection
- Complete backward compatibility analysis for all 13 existing ActionProviders

## Task Commits

Each task was committed atomically:

1. **Task 1: ResolvedAction 3종 Zod 스키마 초안 설계** - `94e5dba9` (feat)

## Files Created/Modified
- `.planning/phases/380-resolved-action-type-system/design/resolved-action-types.md` - ResolvedAction union + normalization strategy + backward compatibility analysis

## Decisions Made
- kind field is optional on ContractCallRequest (zero changes to existing providers)
- Normalization happens only at ActionProviderRegistry (single normalization point)
- ApiDirectResult kept separate from ResolvedAction union (semantically different: executed vs awaiting-signature)
- SignedHttpAction restricts signingScheme to 3 HTTP-compatible schemes
- payload uses Record<string, unknown> with runtime scheme-specific validation
- tracking and policyContext are optional to support both sync and async actions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ResolvedAction type system ready as input for Phase 382 (Signer Capabilities) and Phase 383 (Pipeline Routing)
- SigningSchemeEnum referenced by SignedDataAction.signingScheme -- detailed in Plan 380-02

---
*Phase: 380-resolved-action-type-system*
*Completed: 2026-03-11*
