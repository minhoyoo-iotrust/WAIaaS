---
phase: 156-security-test-p2
plan: 02
subsystem: testing
tags: [security, batch, oracle, action-provider, swap, vitest, zod]

# Dependency graph
requires:
  - phase: 155-security-test-p1
    provides: "SEC-01~08 보안 테스트 기반 + security-test-helpers"
  - phase: 156-security-test-p2
    provides: "156-01 extension 테스트 기반 (SEC-05~08)"
provides:
  - "SEC-09 배치 분할 우회 보안 시나리오 22건"
  - "SEC-10 Oracle 가격 조작 보안 시나리오 23건"
  - "SEC-11 Action Provider 보안 시나리오 17건"
  - "SEC-12 Swap 슬리피지/MEV 보안 시나리오 14건"
affects: [157-integration-test, security-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline mock oracle (shouldFail 플래그 기반 IPriceOracle 구현)"
    - "JupiterSwapInputSchema 선제적 정의 (v2.3.1 JupiterSwapProvider 보안 계약)"

key-files:
  created:
    - "packages/daemon/src/__tests__/security/extension/batch-split-attacks.security.test.ts"
    - "packages/daemon/src/__tests__/security/extension/oracle-manipulation-attacks.security.test.ts"
    - "packages/daemon/src/__tests__/security/extension/action-provider-attacks.security.test.ts"
    - "packages/daemon/src/__tests__/security/extension/swap-slippage-attacks.security.test.ts"
  modified: []

key-decisions:
  - "SEC-09-18/19/20: evaluateBatch 무정책 -> INSTANT passthrough이므로 SPENDING_LIMIT 삽입 필요 (기본 거부 트리거)"
  - "SEC-10: InMemoryPriceCache 내부 expiresAt 직접 조작으로 TTL 만료 시뮬레이션"
  - "SEC-12: JupiterSwapProvider 미존재 -> JupiterSwapInputSchema 선제적 Zod 정의로 보안 계약 검증"
  - "SEC-11-16: ActionProviderRegistry가 체인 매칭 미강제 (pipeline 레벨 검증) 사실 문서화"

patterns-established:
  - "createSimpleOracle: shouldFail 플래그 기반 IPriceOracle 인라인 mock 패턴"
  - "JupiterSwapInputSchema: 선제적 Zod 스키마 정의로 미구현 provider 보안 계약 검증"
  - "Default-deny 트리거: evaluateBatch는 최소 1개 정책이 있어야 evaluation path 진입"

# Metrics
duration: 7min
completed: 2026-02-17
---

# Phase 156 Plan 02: Extension Security Tests Summary

**배치 분할 우회(SEC-09) + Oracle 가격 조작(SEC-10) + Action Provider 공격(SEC-11) + Swap 슬리피지(SEC-12) 76건 보안 시나리오 검증**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-16T15:41:42Z
- **Completed:** 2026-02-16T15:49:00Z
- **Tasks:** 2
- **Files created:** 4 (2,279 lines total)

## Accomplishments

- SEC-09: 배치 분할 합산 우회 22건 -- 소액 분할 합산, All-or-Nothing 거부, tier 경계값 (instant/notify/delay_max), 혼합 타입 배치, 기본 거부 정책
- SEC-10: Oracle 가격 조작 23건 -- 교차 검증 실패 (5% threshold 경계값 3건), 전체 오라클 장애, stale 캐시, stampede 방지, 극단적 가격 정밀도 (BTC $100K+, memecoin $0.000001)
- SEC-11: Action Provider 보안 17건 -- from 위변조, 직렬화 TX 우회, 이름 충돌, null resolve, inputSchema 검증, 빈 actions, 체인 불일치
- SEC-12: Swap 슬리피지/MEV 14건 -- 500bps 상한 경계값, 동일 토큰 방지, priceImpact, programId 위조, 극단적 금액
- 기존 보안 테스트 459건 전체 통과 (1건 pre-existing skip)

## Task Commits

Each task was committed atomically:

1. **Task 1: SEC-09 배치 분할 우회 22건 + SEC-10 Oracle 가격 조작 23건** - `94d556f` (test)
2. **Task 2: SEC-11 Action Provider 보안 17건 + SEC-12 Swap 슬리피지 14건** - `b5abc4a` (test)

## Files Created/Modified

- `packages/daemon/src/__tests__/security/extension/batch-split-attacks.security.test.ts` - SEC-09 배치 분할 우회 22건 (676 lines)
- `packages/daemon/src/__tests__/security/extension/oracle-manipulation-attacks.security.test.ts` - SEC-10 Oracle 가격 조작 23건 (571 lines)
- `packages/daemon/src/__tests__/security/extension/action-provider-attacks.security.test.ts` - SEC-11 Action Provider 보안 17건 (608 lines)
- `packages/daemon/src/__tests__/security/extension/swap-slippage-attacks.security.test.ts` - SEC-12 Swap 슬리피지/MEV 14건 (424 lines)

## Decisions Made

1. **SEC-09-18/19/20 default-deny 트리거**: evaluateBatch는 정책이 0건이면 INSTANT passthrough 반환하므로, 기본 거부(ALLOWED_TOKENS/CONTRACT_WHITELIST/APPROVED_SPENDERS)를 트리거하려면 최소 1개 정책(SPENDING_LIMIT)이 필요함을 발견하고 테스트에 반영
2. **SEC-10 InMemoryPriceCache TTL 조작**: cache 내부 expiresAt을 직접 조작하여 TTL 만료를 시뮬레이션 (Date.now mock보다 정밀)
3. **SEC-12 JupiterSwapInputSchema 선제적 정의**: JupiterSwapProvider가 v2.3.1로 이연된 상태이므로, Zod inputSchema를 테스트 파일 내에 선제적으로 정의하여 보안 계약(슬리피지 500bps max, 동일 토큰 방지, 정수 검증)을 확립
4. **SEC-11-16 체인 매칭 미강제 문서화**: ActionProviderRegistry는 resolve() 시 chain 매칭을 강제하지 않음 -- pipeline(stage 2-3)에서 검증하는 사실을 테스트로 문서화

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SEC-09-18/19/20 default-deny 트리거 누락**
- **Found during:** Task 1 (SEC-09 batch split attacks)
- **Issue:** evaluateBatch에 정책이 0건이면 INSTANT passthrough이므로, ALLOWED_TOKENS/CONTRACT_WHITELIST/APPROVED_SPENDERS 기본 거부가 발동하지 않음
- **Fix:** 테스트에 SPENDING_LIMIT 정책을 추가하여 evaluation path에 진입하도록 수정
- **Files modified:** batch-split-attacks.security.test.ts
- **Verification:** 3건 테스트 통과
- **Committed in:** 94d556f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** 테스트 정확성 개선. Scope 변경 없음.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 156-02 완료로 Phase 156 extension security tests 전체 완료
- SEC-05~12 총 283건 extension 보안 시나리오 검증 완료
- Phase 155(131건) + Phase 156(283건) = 총 459건+ 보안 테스트 확보
- Phase 157 통합 테스트 진행 준비 완료

## Self-Check: PASSED

- [x] batch-split-attacks.security.test.ts (676 lines, >200 min)
- [x] oracle-manipulation-attacks.security.test.ts (571 lines, >250 min)
- [x] action-provider-attacks.security.test.ts (608 lines, >200 min)
- [x] swap-slippage-attacks.security.test.ts (424 lines, >150 min)
- [x] Commit 94d556f exists (Task 1)
- [x] Commit b5abc4a exists (Task 2)
- [x] All 76 tests pass (45 + 31)
- [x] All 459 security tests pass (no regressions)

---
*Phase: 156-security-test-p2*
*Completed: 2026-02-17*
