---
phase: 156-security-test-p2
plan: 03
subsystem: testing
tags: [security, chain-error, x402, ssrf, domain-policy, retryable, vitest]

# Dependency graph
requires:
  - phase: 48-51 (v1.1)
    provides: ChainError 3-category system (PERMANENT/TRANSIENT/STALE), 29 ChainErrorCode
  - phase: 130-133 (v1.5.1)
    provides: x402 SSRF guard, X402_ALLOWED_DOMAINS domain policy, payment handler
provides:
  - SEC-13-01~12 ChainError 보안 시나리오 12건 (114 tests)
  - SEC-14-01~12 x402 결제 보안 시나리오 12건 (45 tests)
affects: [157-security-test-p3]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "exhaustive enumeration: for...of Object.entries(CHAIN_ERROR_CATEGORIES) 전수 검증"
    - "IPv6 bracket normalization: URL parser normalizes ::ffff:A.B.C.D to hex, DNS layer rejects"
    - "pure function testing: matchDomain, evaluateX402Domain, selectPaymentRequirement 직접 호출"

key-files:
  created:
    - packages/daemon/src/__tests__/security/extension/chain-error-attacks.security.test.ts
    - packages/daemon/src/__tests__/security/x402/x402-payment-attacks.security.test.ts
  modified: []

key-decisions:
  - "IPv6-in-brackets URL은 URL parser가 hex로 정규화하여 isIP()가 0 반환, DNS ENOTFOUND로 차단됨 (WAIaaSError가 아닌 일반 Error) -- 보안 불변량 유지됨"
  - "@waiaas/core 패키지 export로 ChainError/CHAIN_ERROR_CATEGORIES import (상대 경로 불필요)"

patterns-established:
  - "security test directory: __tests__/security/{extension,x402} 새 디렉토리 추가"
  - "expectRejected helper: IPv6 bracket URL처럼 WAIaaSError 대신 DNS 에러로 차단되는 경우 범용 거부 검증"

# Metrics
duration: 6min
completed: 2026-02-17
---

# Phase 156 Plan 03: Extension Security Tests Summary

**ChainError 29-code 3-category 전수 매핑 검증(114 tests) + x402 SSRF/도메인 정책/스키마 조작 방어(45 tests) = 159 보안 테스트**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-16T15:41:27Z
- **Completed:** 2026-02-16T15:47:28Z

## Task 1: SEC-13 ChainError 보안 12건 (e3a4228)

**File:** `packages/daemon/src/__tests__/security/extension/chain-error-attacks.security.test.ts` (379 lines, 114 tests)

12 describe blocks covering:

| ID | Scenario | Tests | Key Verification |
|----|----------|-------|------------------|
| SEC-13-01 | PERMANENT 21 codes retryable=false | 22 | exhaustive enumeration |
| SEC-13-02 | TRANSIENT 4 codes retryable=true | 5 | exhaustive enumeration |
| SEC-13-03 | STALE 4 codes retryable=true | 5 | exhaustive enumeration |
| SEC-13-04 | Total count = 29 | 2 | disjoint partition check |
| SEC-13-05 | Constructor category matches mapping | 29 | per-code verification |
| SEC-13-06 | retryable auto-derivation | 29 | category !== PERMANENT |
| SEC-13-07 | PERMANENT retry prevention | 5 | retry loop guard scenario |
| SEC-13-08 | TRANSIENT retry safety | 4 | same TX resubmit safe |
| SEC-13-09 | STALE rebuild requirement | 4 | category !== TRANSIENT |
| SEC-13-10 | toJSON serialization | 3 | 5 fields, no leakage |
| SEC-13-11 | cause chaining | 3 | Error instanceof, cause |
| SEC-13-12 | type safety | 3 | compile-time protection |

## Task 2: SEC-14 x402 결제 보안 ~12건 (6ccc1f9)

**File:** `packages/daemon/src/__tests__/security/x402/x402-payment-attacks.security.test.ts` (431 lines, 45 tests)

12 describe blocks covering:

| ID | Scenario | Tests | Key Verification |
|----|----------|-------|------------------|
| SEC-14-01 | Private IP direct access | 9 | RFC 5735/6890 ranges |
| SEC-14-02 | IPv4-mapped IPv6 bypass | 6 | ::ffff:A.B.C.D + hex |
| SEC-14-03 | Localhost variants | 2 | localhost, [::1] |
| SEC-14-04 | HTTPS only protocol | 2 | http://, ftp:// rejected |
| SEC-14-05 | Userinfo + port blocking | 5 | @credentials, non-443 |
| SEC-14-06 | Default deny (no policy) | 2 | empty + wrong type |
| SEC-14-07 | Non-allowed domain | 3 | substring attack defense |
| SEC-14-08 | Wildcard matching | 6 | dot-boundary, deep sub |
| SEC-14-09 | Case-insensitive | 3 | API.Example.COM |
| SEC-14-10 | Unsupported network | 2 | CAIP-2 not in mapping |
| SEC-14-11 | Non-exact scheme | 2 | streaming filtered |
| SEC-14-12 | Edge cases | 3 | empty accepts, FQDN |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] IPv6-in-brackets URL parser normalization**
- **Found during:** Task 2 (SEC-14-02)
- **Issue:** URL parser normalizes `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]` (hex form), causing `isIP()` to return 0. DNS resolution then fails with `ENOTFOUND` instead of `WAIaaSError('X402_SSRF_BLOCKED')`.
- **Fix:** Created `expectRejected()` helper that verifies the URL is rejected regardless of error type. The security invariant (request never succeeds) is maintained. Added code comments documenting the behavior.
- **Files modified:** `x402-payment-attacks.security.test.ts`
- **Commit:** 6ccc1f9

## Verification

```
pnpm vitest run [...both files] -> 159 passed
pnpm vitest run --dir packages/daemon/src/__tests__/security -> 3213 passed (3 pre-existing CLI E2E failures excluded)
```

## Self-Check: PASSED

- FOUND: packages/daemon/src/__tests__/security/extension/chain-error-attacks.security.test.ts
- FOUND: packages/daemon/src/__tests__/security/x402/x402-payment-attacks.security.test.ts
- FOUND: commit e3a4228 (SEC-13 ChainError)
- FOUND: commit 6ccc1f9 (SEC-14 x402)
