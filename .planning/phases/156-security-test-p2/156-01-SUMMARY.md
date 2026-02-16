---
phase: 156-security-test-p2
plan: 01
subsystem: testing
tags: [security, ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE, policy-engine, BigInt, vitest]

# Dependency graph
requires:
  - phase: 155-security-test-p1
    provides: security-test-helpers, insertPolicy, createInMemoryDb
  - phase: 76-81 (v1.4)
    provides: ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE
provides:
  - SEC-06-01~32 토큰 정책 보안 시나리오 32건
  - SEC-07-01~28 컨트랙트 화이트리스트 보안 시나리오 28건
  - SEC-08-01~24 Approve 관리 보안 시나리오 24건
affects: [156-02-PLAN, 157-security-test-p3]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "extension policy security test: SEC-{06,07,08}-NN describe 블록 + 공격 벡터별 it 케이스"
    - "UNLIMITED_THRESHOLD boundary: (2n**256n-1n)/2n 기준 경계값 테스트"
    - "default deny verification: 정책 미설정 시 TOKEN_TRANSFER/CONTRACT_CALL/APPROVE 모두 거부 확인"

key-files:
  created:
    - packages/daemon/src/__tests__/security/extension/token-policy-attacks.security.test.ts
    - packages/daemon/src/__tests__/security/extension/contract-whitelist-attacks.security.test.ts
    - packages/daemon/src/__tests__/security/extension/approve-attacks.security.test.ts
  modified: []

key-decisions:
  - "SEC-06-05 APPROVE_DISABLED PolicyType 미존재 -> no APPROVED_SPENDERS policy = 전면 거부로 동일 효과 검증"
  - "SEC-08-05 Solana u64.max < UNLIMITED_THRESHOLD -> Solana에서는 무제한 차단 미적용 (EVM 전용)"
  - "contract-whitelist 테스트 defaultNetwork 'sepolia' -> 'ethereum-sepolia' (DB CHECK 제약 준수)"
  - "SEC-06-32 대량 토큰 리스트 주소 생성 시 padStart(40, '0') 동적 생성 (하드코딩 길이 오류 방지)"

patterns-established:
  - "extension security test directory: __tests__/security/extension/"
  - "각 정책 유형별 독립 테스트 파일: {policy}-attacks.security.test.ts"
  - "트랜잭션 헬퍼 패턴: tokenTx(), contractTx(), approveTx() 함수로 타입별 트랜잭션 생성"

# Metrics
duration: 8min
completed: 2026-02-17
---

# Phase 156 Plan 01: Extension Security Tests Summary

**ALLOWED_TOKENS 기본 거부 32건 + CONTRACT_WHITELIST/METHOD_WHITELIST 기본 거부 28건 + APPROVED_SPENDERS/APPROVE_AMOUNT_LIMIT/APPROVE_TIER_OVERRIDE 24건 = 84개 확장 정책 보안 시나리오 (대소문자 우회, 네트워크 스코핑, UNLIMITED_THRESHOLD 경계값, 특수문자 삽입)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-16T15:41:21Z
- **Completed:** 2026-02-16T15:49:26Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments

- SEC-06-01~32 토큰 정책 보안 32건: ALLOWED_TOKENS 기본 거부, 대소문자 우회(EVM/Solana), 빈 토큰 배열, 비활성 정책, 글로벌/월렛 오버라이드, 네트워크 스코핑, uint256 BigInt 범위, 공백/null/유니코드/탭/개행 삽입, 부분 매칭, 0x 접두사 조작, 100개 대량 리스트
- SEC-07-01~28 컨트랙트 화이트리스트 보안 28건: CONTRACT_WHITELIST 기본 거부, METHOD_WHITELIST 셀렉터 제한, 대소문자 우회, 빈 배열, 비활성 정책, 글로벌/월렛 오버라이드, 네트워크 스코핑, 악의적 문자 삽입, 다중 컨트랙트/셀렉터, 크로스 컨트랙트 METHOD_WHITELIST 비적용
- SEC-08-01~24 Approve 관리 보안 24건: APPROVED_SPENDERS 기본 거부, uint256.max 무제한 차단, u64.max Solana 비적용, blockUnlimited=false 허용, APPROVE_AMOUNT_LIMIT maxAmount 초과, APPROVE_TIER_OVERRIDE 4-tier 강제, UNLIMITED_THRESHOLD 경계값 3건, approve 0 리셋 허용
- 타입 비적용 검증: TRANSFER에 ALLOWED_TOKENS 비적용, TOKEN_TRANSFER에 CONTRACT_WHITELIST 비적용, TRANSFER에 APPROVED_SPENDERS 비적용
- 전체 보안 테스트 459건 통과 (기존 Phase 155 + 이전 확장 테스트 + Phase 156-01 84건 신규)

## Task Commits

Each task was committed atomically:

1. **Task 1: SEC-06 토큰 정책 보안 32건 + SEC-07 컨트랙트 화이트리스트 보안 28건** - `fd889e4` (test)
2. **Task 2: SEC-08 Approve 관리 보안 24건** - `0252dcd` (test)

## Files Created/Modified

- `packages/daemon/src/__tests__/security/extension/token-policy-attacks.security.test.ts` (921 lines) - SEC-06-01~32 토큰 정책 공격 시나리오 36 it-blocks
- `packages/daemon/src/__tests__/security/extension/contract-whitelist-attacks.security.test.ts` (1011 lines) - SEC-07-01~28 컨트랙트 화이트리스트 공격 시나리오 30 it-blocks
- `packages/daemon/src/__tests__/security/extension/approve-attacks.security.test.ts` (881 lines) - SEC-08-01~24 Approve 관리 공격 시나리오 27 it-blocks

## Decisions Made

- APPROVE_DISABLED PolicyType이 존재하지 않으므로 (12개 PolicyType에 미포함) SEC-08-22를 "no APPROVED_SPENDERS policy = 전면 거부"로 검증
- Solana u64.max (2^64-1) < UNLIMITED_THRESHOLD (2^255) 이므로 Solana에서는 blockUnlimited이 트리거되지 않음 (SEC-08-05)
- contract-whitelist 테스트의 insertTestWallet에서 defaultNetwork를 'sepolia' -> 'ethereum-sepolia'로 수정 (DB CHECK 제약 준수)
- SEC-06-32 대량 토큰 리스트 테스트에서 하드코딩 주소 대신 동적 생성 사용 (padStart 길이 불일치 방지)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] contract-whitelist 테스트 defaultNetwork CHECK 제약 위반**
- **Found during:** Task 1 (SEC-07 전체)
- **Issue:** insertTestWallet에서 `defaultNetwork: 'sepolia'`이 DB CHECK 제약(`ethereum-sepolia`)에 위반
- **Fix:** `defaultNetwork: 'ethereum-sepolia'`로 수정
- **Files modified:** contract-whitelist-attacks.security.test.ts
- **Commit:** fd889e4

**2. [Rule 1 - Bug] SEC-06-32 하드코딩 토큰 주소 길이 불일치**
- **Found during:** Task 1 (SEC-06-32 large token list)
- **Issue:** 하드코딩된 `Token0000000000000000000000000000000000050`이 실제 생성된 주소와 길이 불일치
- **Fix:** `Token${String(50).padStart(40, '0')}`으로 동적 생성
- **Files modified:** token-policy-attacks.security.test.ts
- **Commit:** fd889e4

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** 테스트 assertion 정확도 수정. 기능 변경 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- extension/ 디렉토리에 SEC-06/07/08 테스트가 추가되어 156-02 (SEC-09+ 추가 보안 시나리오)에서 동일 패턴 재사용 가능
- `pnpm test:security` 스크립트가 security/ 디렉토리 전체를 실행하여 회귀 방지

## Self-Check: PASSED

All 3 created files exist. Both task commits (fd889e4, 0252dcd) verified. 93 new tests passing (36+30+27). Total security suite: 459 tests.

---
*Phase: 156-security-test-p2*
*Completed: 2026-02-17*
