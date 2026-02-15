---
phase: 131-ssrf-guard-x402-handler-payment-signing
plan: 01
subsystem: security
tags: [ssrf, dns, ipv4, ipv6, x402, fetch, redirect]

# Dependency graph
requires:
  - phase: 130-core-types-caip2-db-migration
    provides: "X402_SSRF_BLOCKED 에러 코드, WAIaaSError 기반 에러 처리"
provides:
  - "validateUrlSafety() -- DNS 사전 해석 + 사설 IP 차단 + URL 정규화"
  - "safeFetchWithRedirects() -- redirect: manual + 매 hop SSRF 재검증 + 최대 3회"
  - "RFC 5735/6890 전체 범위 사설 IPv4/IPv6 차단"
  - "IPv4-mapped IPv6 바이패스 벡터 방어"
affects: [131-02-x402-handler, 132-x402-domain-whitelist]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DNS pre-resolution SSRF defense (node:dns/promises lookup({all: true}))"
    - "IPv4-mapped IPv6 normalization (::ffff:A.B.C.D + ::ffff:HHHH:HHHH)"
    - "Manual redirect handling with per-hop SSRF re-validation"

key-files:
  created:
    - packages/daemon/src/services/x402/ssrf-guard.ts
    - packages/daemon/src/__tests__/ssrf-guard.test.ts
  modified: []

key-decisions:
  - "SSRF 가드 자체 구현 (node:dns + node:net) -- private-ip CVE, request-filtering-agent native fetch 비호환"
  - "RFC 5735/6890 전체 범위 차단 (CGNAT 100.64/10, 벤치마크 198.18/15, TEST-NET 3종, 멀티캐스트, 예약 포함)"
  - "최대 리다이렉트 3회, 리다이렉트 후 GET 메서드 변경 + body 제거"

patterns-established:
  - "SSRF guard pattern: validateUrlSafety() -> safeFetchWithRedirects() 2단계 방어"
  - "vi.mock('node:dns/promises') + vi.stubGlobal('fetch') DNS/fetch 이중 모킹 패턴"

# Metrics
duration: 4min
completed: 2026-02-15
---

# Phase 131 Plan 01: SSRF Guard Summary

**DNS 사전 해석 + RFC 5735/6890 사설 IP 전체 범위 차단 + IPv4-mapped IPv6 바이패스 방어 + 리다이렉트 hop별 재검증 SSRF 가드 TDD 구현**

## Performance

- **Duration:** 4min
- **Started:** 2026-02-15T12:04:05Z
- **Completed:** 2026-02-15T12:08:35Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- SSRF 가드 모듈 TDD 완성: 54개 테스트 전체 통과
- RFC 5735/6890 IPv4 사설 IP 22개 범위 + IPv6 6개 범위 차단
- IPv4-mapped IPv6 바이패스 벡터 4종 (dotted loopback/private, hex loopback/private) 차단
- URL 정규화 (trailing dot, lowercase, userinfo@, 포트 443 전용) 동작 확인
- safeFetchWithRedirects: 최대 3회 리다이렉트, 매 hop SSRF 재검증, AbortController 타임아웃
- 기존 1142개 daemon 테스트 전체 통과 (회귀 없음)

## Task Commits

Each task was committed atomically:

1. **Task 1: SSRF 가드 테스트 작성 (RED)** - `11c33ec` (test)
2. **Task 2: SSRF 가드 구현 (GREEN + REFACTOR)** - `e6fd24b` (feat)

## Files Created/Modified

- `packages/daemon/src/services/x402/ssrf-guard.ts` - SSRF 가드 모듈 (validateUrlSafety, safeFetchWithRedirects, assertPublicIP, normalizeIPv6Mapped, isPrivateIPv4, isPrivateIPv6)
- `packages/daemon/src/__tests__/ssrf-guard.test.ts` - SSRF 가드 포괄적 테스트 54개 (사설 IP, 우회 벡터, 리다이렉트, 프로토콜, URL 정규화)

## Decisions Made

- **SSRF 가드 자체 구현:** private-ip 라이브러리 CVE, request-filtering-agent native fetch 비호환으로 node:dns + node:net 직접 사용
- **RFC 5735/6890 전체 범위 차단:** CGNAT(100.64/10), 벤치마크(198.18/15), TEST-NET(192.0.2, 198.51.100, 203.0.113), 멀티캐스트(224-239), 예약(240+) 포함
- **리다이렉트 후 GET 변경:** POST/PUT 등 리다이렉트 후 method를 GET으로 전환하고 body 제거 (RFC 7231 Section 6.4)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 리다이렉트 테스트 모킹 순서 수정**
- **Found during:** Task 2 (GREEN 검증)
- **Issue:** safeFetchWithRedirects는 초기 URL을 검증하지 않으므로 (호출자가 이미 검증), "redirect to private IP" 테스트에서 DNS 모킹 2개가 아닌 1개만 필요. "max redirect" 테스트에서 단일 호출로 toThrow + toMatchObject 검증 필요.
- **Fix:** mockLookup 순서를 safeFetchWithRedirects 내부 흐름에 맞게 조정, 이중 호출 제거
- **Files modified:** packages/daemon/src/__tests__/ssrf-guard.test.ts
- **Verification:** 54개 테스트 전체 통과
- **Committed in:** e6fd24b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** 테스트 모킹 순서 수정. 구현 로직 변경 없음. 스코프 변동 없음.

## Issues Encountered

- `npx tsc --noEmit -p packages/daemon/tsconfig.json`에서 payment-signer.ts (131-03 플랜 소속) TypeScript 에러 발견. ssrf-guard.ts 자체에는 에러 없음. 기존 작업 중인 파일로 본 플랜과 무관.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- validateUrlSafety + safeFetchWithRedirects export 완료 -- x402-handler (131-02)에서 import 가능
- WAIaaSError('X402_SSRF_BLOCKED') 일관된 에러 반환 패턴 확립

## Self-Check: PASSED

- FOUND: packages/daemon/src/services/x402/ssrf-guard.ts
- FOUND: packages/daemon/src/__tests__/ssrf-guard.test.ts
- FOUND: .planning/phases/131-ssrf-guard-x402-handler-payment-signing/131-01-SUMMARY.md
- FOUND: 11c33ec (Task 1 commit)
- FOUND: e6fd24b (Task 2 commit)

---
*Phase: 131-ssrf-guard-x402-handler-payment-signing*
*Completed: 2026-02-15*
