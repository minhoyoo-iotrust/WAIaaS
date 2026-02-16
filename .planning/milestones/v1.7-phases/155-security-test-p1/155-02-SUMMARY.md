---
phase: 155-security-test-p1
plan: 02
subsystem: testing
tags: [security, kill-switch, keystore, boundary-value, e2e-attack-chain, vitest, sodium-native]

# Dependency graph
requires:
  - phase: 155-security-test-p1-01
    provides: security test helpers, SEC-01 session auth tests, SEC-02 policy bypass tests
provides:
  - SEC-03 Kill Switch attack tests (8 scenarios)
  - SEC-04 Keystore + external security tests (10 scenarios)
  - SEC-05 boundary value tests (19 scenarios)
  - SEC-05 E2E attack chain tests (5 scenarios)
  - Complete 42-scenario security attack test suite (combined with 155-01)
affects: [security-audit, ci-cd, kill-switch, keystore, policy-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "E2E attack chain testing: multi-layer security traversal (Layer 1->2->3)"
    - "Boundary value testing with BigInt +/-1 lamport precision"
    - "Kill Switch 3-state transition validation (ACTIVE/SUSPENDED/LOCKED)"
    - "TOCTOU prevention via evaluateAndReserve + BEGIN IMMEDIATE"
    - "Real filesystem keystore integration tests (mkdtempSync)"

key-files:
  created:
    - packages/daemon/src/__tests__/security/layer3-killswitch/killswitch-attacks.security.test.ts
    - packages/daemon/src/__tests__/security/keystore-external/keystore-external-attacks.security.test.ts
    - packages/daemon/src/__tests__/security/boundary-chain/boundary-values.security.test.ts
    - packages/daemon/src/__tests__/security/boundary-chain/e2e-attack-chains.security.test.ts
  modified: []

key-decisions:
  - "JwtSecretManager requires conn.db parameter (not standalone) -- 155-01 패턴 일관"
  - "WAIaaSError 응답은 body.code 최상위 접근 (body.error.code 아닌)"
  - "seedSecurityTestData는 wallet+session 동시 생성 -- 중복 삽입 방지 필요"
  - "Chain 5 JWT 만료 테스트에 실제 1.5s sleep 사용 (FakeTimer 대신 실제 토큰 검증)"
  - "SEC-04-EX-04 Rate Limit은 describe.skip (미구현 기능)"

patterns-established:
  - "Kill Switch cascade test: activate -> verify 503 -> recover -> verify old sessions revoked"
  - "Boundary value test: exact threshold, threshold+1 lamport, threshold-1 lamport with BigInt"
  - "E2E attack chain: seed near-limit state -> execute boundary action -> verify defense response"
  - "TOCTOU test: evaluateAndReserve with reserved_amount SUM verification"

# Metrics
duration: 8min
completed: 2026-02-17
---

# Phase 155 Plan 02: Kill Switch/Keystore/Boundary/E2E Security Tests Summary

**42 security attack scenarios across Kill Switch 3-state, keystore AES-256-GCM tamper, BigInt boundary values, and 5 multi-layer E2E attack chains**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-17
- **Completed:** 2026-02-17
- **Tasks:** 2
- **Files created:** 4

## Accomplishments

- SEC-03 Kill Switch 공격 8건: SUSPENDED/LOCKED 상태 API 차단, CAS 복구 검증, 서명 위조, AutoStop 연동, 이중 활성화, 세션 비복원, cascade best-effort, LOCKED 동일 차단
- SEC-04 키스토어 + 외부 보안 10건: 잠금 상태 서명, authTag/ciphertext 변조, 오답 비밀번호, 경로 순회, 메모리 해제, 미존재 키, Host 헤더 위조, 파일 권한, 비밀 노출 방지, Rate Limit(skip)
- SEC-05 경계값 19건: BigInt +/-1 lamport 금액 경계 6건, JWT/DELAY/APPROVAL/세션 시간 경계 8건, TOCTOU reserved_amount 3건, 세션 한도 2건
- SEC-05 E2E 연쇄 공격 5건: 세션 한도 소진, TOCTOU 동시성, 금액 에스컬레이션 -> AutoStop, Kill Switch 세션 폐기+복구, JWT 만료 -> 재세션 -> DELAY -> 연속실패 정지
- 155-01 + 155-02 합산 전체 보안 테스트: 131 passed, 1 skipped (132 total across 7 files)

## Task Commits

Each task was committed atomically:

1. **Task 1: SEC-03 Kill Switch 공격 8건 + SEC-04 키스토어/외부 보안 10건** - `15cf05a` (test)
2. **Task 2: SEC-05 경계값 19건 + E2E 연쇄 공격 5건** - `21a3350` (test)

## Files Created

- `packages/daemon/src/__tests__/security/layer3-killswitch/killswitch-attacks.security.test.ts` - SEC-03-01~08 Kill Switch 3-state 공격 시나리오 (27 tests in 8 describes)
- `packages/daemon/src/__tests__/security/keystore-external/keystore-external-attacks.security.test.ts` - SEC-04-01~06 + EX-01~04 키스토어/외부 보안 (18 tests, 1 skipped)
- `packages/daemon/src/__tests__/security/boundary-chain/boundary-values.security.test.ts` - SEC-05 Part 1 금액/시간/TOCTOU/세션 경계값 (21 tests in 4 describes)
- `packages/daemon/src/__tests__/security/boundary-chain/e2e-attack-chains.security.test.ts` - SEC-05 Part 2 E2E 다층 연쇄 공격 (5 tests in 5 describes)

## Decisions Made

1. **JwtSecretManager requires conn.db**: 155-01 헬퍼 패턴과 동일하게 `new JwtSecretManager(conn.db)` 사용. 독립 생성 불가.
2. **WAIaaSError 응답 형식**: errorHandler는 `{ code, message, requestId, retryable }` 최상위 구조. `body.error.code` 아닌 `body.code` 접근.
3. **seedSecurityTestData 중복 삽입 방지**: wallet+session을 동시 생성하므로, 동일 walletId로 insertTestWallet + seedSecurityTestData 호출 시 UNIQUE 제약 위반. 한쪽만 사용.
4. **Chain 5 실제 sleep**: JWT 만료 검증에 FakeTimer 대신 실제 1.5s 대기. jose 라이브러리의 실제 시간 기반 exp 검증을 테스트하기 위함.
5. **Rate Limit skip**: SEC-04-EX-04는 미구현 기능이므로 describe.skip 처리. 구현 시 활성화 예정.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JwtSecretManager 초기화 파라미터 누락**
- **Found during:** Task 1 (killswitch-attacks.security.test.ts)
- **Issue:** `new JwtSecretManager()` 호출 시 TypeError -- DB 파라미터 필수
- **Fix:** `new JwtSecretManager(conn.db)`로 변경
- **Files modified:** killswitch-attacks.security.test.ts
- **Verification:** 전체 테스트 통과
- **Committed in:** 15cf05a

**2. [Rule 1 - Bug] WAIaaSError 응답 접근 경로 수정**
- **Found during:** Task 1 (killswitch-attacks.security.test.ts)
- **Issue:** `body.error.code` 접근 시 undefined -- 실제 응답은 `body.code` 최상위
- **Fix:** 모든 `body.error.code` -> `body.code`, `body.error` -> `body.code` 존재 확인으로 변경
- **Files modified:** killswitch-attacks.security.test.ts
- **Verification:** 전체 테스트 통과
- **Committed in:** 15cf05a

**3. [Rule 1 - Bug] wallets UNIQUE 제약 위반 수정**
- **Found during:** Task 2 (e2e-attack-chains.security.test.ts)
- **Issue:** Chain 1,4,5에서 insertTestWallet + seedSecurityTestData 동시 호출 시 동일 walletId UNIQUE 위반
- **Fix:** seedSecurityTestData만 사용하거나, 두 번째 세션 생성 시 직접 SQL INSERT 사용
- **Files modified:** e2e-attack-chains.security.test.ts
- **Verification:** 26 tests 전체 통과
- **Committed in:** 21a3350

---

**Total deviations:** 3 auto-fixed (3 Rule 1 - Bug)
**Impact on plan:** 모두 테스트 코드 내 API 사용 패턴 수정. 테스트 대상 프로덕션 코드 변경 없음. 스코프 확대 없음.

## Issues Encountered

- GSD tools 모듈 미발견 (`get-shit-done/bin/gsd-tools.js init`) -- 파일 직접 읽기로 대체 진행

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 155 보안 테스트 P1 완료: 7개 테스트 파일, 131 passed + 1 skipped
- SEC-01~05 전체 42 시나리오 커버리지 확보
- Phase 156+ CI/CD 파이프라인 통합 준비 완료
- Rate Limit (SEC-04-EX-04) 구현 시 skip 해제 필요

## Self-Check: PASSED

- All 4 test files: FOUND
- SUMMARY.md: FOUND
- Commit 15cf05a: FOUND
- Commit 21a3350: FOUND

---
*Phase: 155-security-test-p1*
*Completed: 2026-02-17*
