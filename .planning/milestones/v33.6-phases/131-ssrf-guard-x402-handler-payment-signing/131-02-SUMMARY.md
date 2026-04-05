---
phase: 131-ssrf-guard-x402-handler-payment-signing
plan: 02
subsystem: x402
tags: [x402, handler, ssrf, payment-signing, tdd, base64, zod]

# Dependency graph
requires:
  - phase: 131-01
    provides: "SSRF guard (validateUrlSafety, safeFetchWithRedirects)"
  - phase: 131-03
    provides: "Payment signer (signPayment)"
  - phase: 130
    provides: "X402FetchRequest/Response 스키마, resolveX402Network, X402 에러 코드 8개"
provides:
  - "handleX402Fetch: x402 전체 파이프라인 오케스트레이션 (SSRF -> HTTP -> 402 파싱 -> scheme 선택 -> 결제 서명 -> 재요청)"
  - "parse402Response: PAYMENT-REQUIRED 헤더/JSON body에서 PaymentRequired V2 파싱 + Zod 검증"
  - "selectPaymentRequirement: scheme=exact + 지원 네트워크 필터 + 최저 amount 선택"
  - "X402HandlerDeps 인터페이스 (keyStore, walletId, walletAddress, masterPassword, supportedNetworks)"
affects: ["phase-132-x402-rest-api", "phase-133-x402-mcp-tool"]

# Tech tracking
tech-stack:
  added: []
  patterns: ["base64 JSON encode/decode 자체 구현 (daemon에서 @x402/core/http 직접 접근 불가)"]

key-files:
  created:
    - "packages/daemon/src/services/x402/x402-handler.ts"
    - "packages/daemon/src/__tests__/x402-handler.test.ts"
  modified: []

key-decisions:
  - "base64 encode/decode 자체 구현: @x402/core가 @waiaas/core의 의존성이라 daemon에서 직접 접근 불가. encodePaymentSignatureHeader/decodePaymentRequiredHeader를 Buffer.from(JSON.stringify()).toString('base64') 패턴으로 구현"
  - "Response.headers.forEach 패턴: Object.fromEntries(response.headers)가 런타임에서 불안정할 수 있어 forEach로 명시적 변환"

patterns-established:
  - "x402 독립 파이프라인: 기존 6-stage pipeline 미확장, handleX402Fetch가 별도 진입점"
  - "1회 재시도 제한: 결제 후 다시 402이면 X402_PAYMENT_REJECTED, 무한 루프 방지"
  - "SSRF -> fetch -> parse -> select -> sign -> retry 순차 오케스트레이션"

# Metrics
duration: 5min
completed: 2026-02-15
---

# Phase 131 Plan 02: x402 Handler TDD Summary

**x402 전체 파이프라인 오케스트레이션 핸들러 -- SSRF 가드 + 402 파싱 + scheme 자동 선택 + 결제 서명 + 재요청을 조합하는 독립 파이프라인 (25 테스트)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-15T12:16:30Z
- **Completed:** 2026-02-15T12:21:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- 25개 테스트로 7개 테스트 그룹(패스스루/402 파싱/scheme 선택/결제 재요청/재시도 제한/에러 처리/SSRF 연동) 전체 커버리지 확보
- handleX402Fetch가 SSRF guard -> HTTP request -> 402 parsing -> scheme selection -> payment signing -> retry를 올바르게 오케스트레이션
- base64 JSON encode/decode를 자체 구현하여 @x402/core/http 직접 의존성 없이 PAYMENT-REQUIRED/PAYMENT-SIGNATURE 헤더 처리
- 기존 Plan 01 (54 tests) + Plan 03 (23 tests) + 전체 daemon (1190 tests) 미파괴

## Task Commits

Each task was committed atomically:

1. **Task 1: x402 핸들러 테스트 작성 (RED)** - `f42ec11` (test)
2. **Task 2: x402 핸들러 구현 (GREEN)** - `0681e3f` (feat)

## Files Created/Modified
- `packages/daemon/src/services/x402/x402-handler.ts` - x402 핸들러 오케스트레이션 모듈 (handleX402Fetch, parse402Response, selectPaymentRequirement, X402HandlerDeps, base64 encode/decode)
- `packages/daemon/src/__tests__/x402-handler.test.ts` - x402 핸들러 테스트 25개 (7 그룹: 패스스루, 402 파싱, scheme 선택, 결제 재요청, 재시도 제한, 에러 처리, SSRF 연동)

## Decisions Made
1. **base64 encode/decode 자체 구현** -- `@x402/core`는 `@waiaas/core`의 의존성이라 daemon 패키지에서 직접 import 불가. `encodePaymentSignatureHeader`와 `decodePaymentRequiredHeader`를 `Buffer.from(JSON.stringify(obj)).toString('base64')` / `JSON.parse(Buffer.from(str, 'base64').toString('utf-8'))` 패턴으로 구현. `@x402/core/http` 원본과 동일한 동작.
2. **Response.headers.forEach 사용** -- `Object.fromEntries(response.headers)`가 일부 런타임에서 불안정할 수 있어, `response.headers.forEach((value, key) => { headers[key] = value })` 패턴으로 명시적 변환.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @x402/core/http 직접 접근 불가**
- **Found during:** Task 2 (GREEN 구현)
- **Issue:** Plan에서 `import { encodePaymentSignatureHeader, decodePaymentRequiredHeader } from '@x402/core/http'` 사용을 지시했으나, `@x402/core`는 `@waiaas/core`의 의존성이라 daemon에서 직접 resolve 불가
- **Fix:** base64 JSON encode/decode를 x402-handler.ts 내에서 자체 구현 (Plan에서 이미 fallback으로 언급)
- **Files modified:** packages/daemon/src/services/x402/x402-handler.ts
- **Verification:** 25개 테스트 전체 통과, TypeScript 컴파일 에러 없음
- **Committed in:** 0681e3f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Plan에서 이미 대안으로 제시된 방법. 동작은 동일하며 외부 의존성이 줄어듦.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- x402 핸들러가 Phase 132 (REST API 라우터)에서 import 가능: `import { handleX402Fetch, type X402HandlerDeps } from '../services/x402/x402-handler.js'`
- 3개 export: handleX402Fetch (메인 진입점), parse402Response (테스트/디버깅), selectPaymentRequirement (테스트/디버깅)
- Phase 131의 3개 Plan 모두 완료: SSRF guard (Plan 01) + x402 handler (Plan 02) + Payment signer (Plan 03)

## Self-Check: PASSED

- [x] packages/daemon/src/services/x402/x402-handler.ts -- FOUND
- [x] packages/daemon/src/__tests__/x402-handler.test.ts -- FOUND
- [x] .planning/phases/131-ssrf-guard-x402-handler-payment-signing/131-02-SUMMARY.md -- FOUND
- [x] Commit f42ec11 (RED) -- FOUND
- [x] Commit 0681e3f (GREEN) -- FOUND
- [x] 25 tests pass, 1190 daemon tests pass, 0 TypeScript errors

---
*Phase: 131-ssrf-guard-x402-handler-payment-signing*
*Completed: 2026-02-15*
