---
phase: 382-signer-capabilities
plan: 01
subsystem: signing
tags: [isignercapability, eip712, personal, erc8128, signbytes, ecdsa, ed25519, viem]

requires:
  - phase: 380-resolved-action-type-system
    provides: ISignerCapability interface, SigningSchemeEnum, SigningParams variants
provides:
  - "6종 capability 상세 설계 (기존 4종 어댑터 + signBytes 2종)"
  - "canSign/sign/metadata/에러매핑 명세"
  - "기존 파이프라인 무변경 원칙 확인"
affects: [382-02, 383-pipeline-routing, 385-design-integration]

tech-stack:
  added: []
  patterns: [adapter-delegation, canSign-narrowing, privateKey-memory-clear]

key-files:
  created:
    - .planning/phases/382-signer-capabilities/design/existing-adapters-signbytes.md
  modified: []

key-decisions:
  - "D1: Erc8128만 기존 모듈 import 허용 (RFC 9421 복잡도)"
  - "D2: Eip712/Personal은 viem 함수 직접 호출 (sign-message.ts import 없음)"
  - "D3: EcdsaSignBytes는 hashData 옵션으로 hash 여부 제어 (기본값 true)"
  - "D4: Ed25519는 외부 해시 불필요 (내부 SHA-512)"
  - "D5: TransactionSignerCapability는 설계만, registry 미등록"

patterns-established:
  - "canSign narrowing: scheme discriminant -> type assertion -> field check"
  - "에러 매핑: 외부 에러 -> SigningError(scheme, code, cause)"

requirements-completed: [SIGN-03, SIGN-05]

duration: 5min
completed: 2026-03-11
---

# Phase 382 Plan 01: Existing Adapters + signBytes Summary

**6종 ISignerCapability 구현체(Eip712/Personal/Erc8128/Transaction + EcdsaSignBytes/Ed25519SignBytes) 상세 설계 — canSign/sign 위임 흐름, metadata, 에러 매핑, hashData 옵션**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T15:01:54Z
- **Completed:** 2026-03-11T15:07:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- 기존 4종 signer(Eip712, Personal, Erc8128, Transaction)의 ISignerCapability 어댑터 위임 설계 완성
- signBytes 2종(EcdsaSignBytes, Ed25519SignBytes)의 상세 설계 완성
- canSign narrowing + privateKey 메모리 클리어 + 에러 매핑 공통 패턴 문서화

## Task Commits

1. **Task 1: 기존 4종 어댑터 + signBytes 2종 상세 설계 문서 작성** - `43be8009` (feat)

## Files Created/Modified
- `.planning/phases/382-signer-capabilities/design/existing-adapters-signbytes.md` - 6종 capability 상세 설계

## Decisions Made
- Erc8128만 기존 모듈 import 허용 (RFC 9421 ~200줄 복잡도)
- Eip712/Personal은 viem 함수 직접 호출 (기존 sign-message.ts와 결합 방지)
- EcdsaSignBytes hashData 옵션: 기본값 true(keccak256), false면 이미 해시된 데이터 직접 서명
- Ed25519는 내부 SHA-512 수행하므로 외부 해시 불필요
- TransactionSignerCapability는 참조용 설계만, registry 미등록 (기존 pipeline 사용)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 382-02에서 HMAC/RSA-PSS capability + SignerCapabilityRegistry 설계 진행
- 기존 4종 + signBytes 2종 설계 완료로 registry 등록 대상 5종 확정

---
*Phase: 382-signer-capabilities*
*Completed: 2026-03-11*
