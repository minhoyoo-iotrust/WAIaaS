---
phase: 382-signer-capabilities
plan: 02
subsystem: signing
tags: [hmac-sha256, rsa-pss, signer-registry, node-crypto, connect-info, cex-api]

requires:
  - phase: 380-resolved-action-type-system
    provides: ISignerCapability interface, ISignerCapabilityRegistry interface, SigningSchemeEnum
  - phase: 382-signer-capabilities
    provides: 기존 4종 어댑터 + signBytes 2종 설계 (Plan 01)
provides:
  - "HmacSignerCapability 상세 설계 (node:crypto createHmac, hex/base64 encoding)"
  - "RsaPssSignerCapability 상세 설계 (node:crypto sign RSA-PSS, PKCS#1/PKCS#8 PEM)"
  - "SignerCapabilityRegistry 상세 설계 (register/get/resolve/listSchemes)"
  - "daemon 부팅 시 7종 capability 자동 등록 절차"
  - "connect-info capabilities.signing 확장"
  - "SigningErrorCode CAPABILITY_NOT_FOUND 추가"
affects: [383-pipeline-routing, 385-design-integration]

tech-stack:
  added: [node:crypto]
  patterns: [singleton-registry, bootstrap-registration, connect-info-capability-discovery]

key-files:
  created:
    - .planning/phases/382-signer-capabilities/design/hmac-rsapss-registry.md
  modified: []

key-decisions:
  - "D1: node:crypto 사용 (외부 라이브러리 불필요)"
  - "D2: HMAC signing target 조합은 ActionProvider 책임"
  - "D3: Base64 인코딩은 encoding 옵션으로 지원"
  - "D4: SignerCapabilityRegistry는 singleton"
  - "D5: resolve()에서 canSign() 미호출 (credential 미주입 시점)"
  - "D6: CAPABILITY_NOT_FOUND 에러 코드 추가"

patterns-established:
  - "singleton registry: daemon 전역 1개 인스턴스"
  - "bootstrap registration: 부팅 시 7종 자동 등록"
  - "connect-info capability discovery: listSchemes() 결과를 API로 노출"

requirements-completed: [SIGN-04, SIGN-06]

duration: 5min
completed: 2026-03-11
---

# Phase 382 Plan 02: HMAC/RSA-PSS + Registry Summary

**HMAC-SHA256/RSA-PSS 서명 capability + SignerCapabilityRegistry(7종 자동 등록) + connect-info signing 노출 + CAPABILITY_NOT_FOUND 에러 코드**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T15:07:00Z
- **Completed:** 2026-03-11T15:12:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- HmacSignerCapability 상세 설계: node:crypto createHmac, hex/base64 encoding, CEX API 인증 패턴 지원
- RsaPssSignerCapability 상세 설계: node:crypto sign RSA-PSS, PKCS#1/PKCS#8 PEM, saltLength 기본값 32
- SignerCapabilityRegistry 상세 설계: resolve() 흐름(canSign 미호출 결정), listSchemes()
- daemon 부팅 7종 자동 등록 + connect-info capabilities.signing 확장

## Task Commits

1. **Task 1: HMAC/RSA-PSS capability + SignerCapabilityRegistry 상세 설계** - `926b98ff` (feat)

## Files Created/Modified
- `.planning/phases/382-signer-capabilities/design/hmac-rsapss-registry.md` - HMAC/RSA-PSS + Registry 상세 설계

## Decisions Made
- node:crypto 사용 (sodium-native가 아닌 표준 내장 모듈로 충분)
- HMAC signing target 조합은 각 CEX ActionProvider 책임 (Binance/OKX/Bybit 등 패턴 상이)
- resolve()에서 canSign() 미호출: credential 주입 전이므로 secret/privateKey가 없어 canSign false 반환 문제
- SignerCapabilityRegistry singleton: DI container에 등록하여 전역 공유
- CAPABILITY_NOT_FOUND: 기존 5종 SigningErrorCode에 1종 추가

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 382 전체 완료: 7종 capability 설계 확정 (기존 4종 + HMAC + RSA-PSS + signBytes 2종)
- Phase 383 (파이프라인 라우팅)에서 registry.resolve() 활용하는 3-way routing 설계 진행
- Phase 385 (설계 문서 통합)에서 doc-77에 전체 capability 설계 통합

---
*Phase: 382-signer-capabilities*
*Completed: 2026-03-11*
