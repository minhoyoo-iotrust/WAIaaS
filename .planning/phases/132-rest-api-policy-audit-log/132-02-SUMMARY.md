---
phase: 132-rest-api-policy-audit-log
plan: 02
subsystem: payments
tags: [x402, usdc, price-oracle, usd-conversion, tdd]

# Dependency graph
requires:
  - phase: 131-ssrf-guard-x402-handler-payment-signing
    provides: USDC_DOMAINS 상수 (payment-signer.ts), parseCaip2 함수
  - phase: 125-price-oracle
    provides: IPriceOracle 인터페이스 (getPrice 메서드)
provides:
  - resolveX402UsdAmount 함수 (USDC 직접 환산 + Oracle 폴백)
  - SOLANA_USDC_ADDRESSES 상수 (Solana USDC 민트 주소)
affects: [132-03-PLAN, x402-route, spending-limit-policy]

# Tech tracking
tech-stack:
  added: []
  patterns: [USDC $1 직접 환산 패턴, Solana USDC 별도 주소 테이블, Oracle 미제공 시 0 안전 폴백]

key-files:
  created:
    - packages/daemon/src/services/x402/x402-usd-resolver.ts
    - packages/daemon/src/__tests__/x402-usd-resolver.test.ts
  modified: []

key-decisions:
  - "SOLANA_USDC_ADDRESSES 별도 테이블 추가 -- USDC_DOMAINS는 EVM EIP-712 전용이므로 Solana USDC 민트 주소를 별도 Record로 관리"
  - "Oracle 에러/미제공 시 0 반환 -- SPENDING_LIMIT INSTANT 티어 통과 허용 (안전 폴백)"
  - "비-USDC 토큰 기본 decimals: EVM=18, Solana=9 -- x402 PaymentRequirements에 decimals 없으므로 체인별 기본값 사용"

patterns-established:
  - "USDC 직접 환산: USDC_DOMAINS(EVM) + SOLANA_USDC_ADDRESSES(Solana) -> 6 decimals -> /1_000_000"
  - "비-USDC Oracle 폴백: IPriceOracle?.getPrice() -> catch -> 0"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 132 Plan 02: x402 USD Resolver Summary

**USDC $1 직접 환산 + IPriceOracle 폴백으로 x402 결제 금액 USD 변환 모듈 TDD 구현 (7개 EVM 체인 + Solana)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T12:45:23Z
- **Completed:** 2026-02-15T12:48:36Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments

- resolveX402UsdAmount 함수 구현: USDC 직접 환산(Oracle 불필요) + 비-USDC IPriceOracle 사용
- 7개 EVM 체인 USDC 지원 (USDC_DOMAINS에서 verifyingContract 대소문자 무시 비교)
- Solana USDC 지원 (SOLANA_USDC_ADDRESSES 별도 테이블: mainnet + devnet)
- Oracle 미제공/에러 시 0 반환 안전 폴백 (SPENDING_LIMIT INSTANT 통과)
- 18개 단위 테스트 전체 통과, 기존 1,227개 daemon 테스트 회귀 없음

## Task Commits

Each task was committed atomically (TDD workflow):

1. **RED: 실패 테스트 작성** - `2ab8596` (test)
2. **GREEN: 구현하여 테스트 통과** - `cd24aca` (feat)

## Files Created/Modified

- `packages/daemon/src/services/x402/x402-usd-resolver.ts` - resolveX402UsdAmount 함수. USDC 직접 환산 + IPriceOracle 폴백 + 안전 폴백(0)
- `packages/daemon/src/__tests__/x402-usd-resolver.test.ts` - 18개 단위 테스트. USDC 7개 EVM 체인, Solana USDC, 비-USDC Oracle, 에러 폴백 커버리지

## Decisions Made

1. **SOLANA_USDC_ADDRESSES 별도 테이블 추가** -- USDC_DOMAINS는 EIP-712 domain separator(name, version, chainId, verifyingContract) 구조로 EVM 전용이다. Solana USDC는 SPL Token 민트 주소만 필요하므로 `Record<string, string>` 형태의 별도 상수로 관리한다. CAIP-2 키 형식은 동일하게 유지.
2. **비-USDC 토큰 기본 decimals** -- x402 PaymentRequirements에는 decimals 필드가 없으므로 체인별 가장 일반적인 기본값 사용 (EVM: 18, Solana: 9). 이는 resolve-effective-amount-usd.ts의 NATIVE_DECIMALS 패턴과 동일.
3. **Oracle 에러 시 0 반환** -- "unknown price != price of 0" 원칙(resolve-effective-amount-usd.ts)과 다른 접근이지만, x402 맥락에서는 Oracle 에러 시 결제를 허용하는 것이 사용자 경험상 바람직하다. SPENDING_LIMIT가 없거나 금액이 0이면 INSTANT 통과.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Solana USDC 별도 주소 테이블 추가**
- **Found during:** GREEN 구현 시
- **Issue:** 플랜의 구현 코드가 USDC_DOMAINS만 확인하지만, USDC_DOMAINS에는 Solana 항목이 없다 (EVM EIP-712 전용). 플랜의 behavior spec에 Solana USDC 테스트 케이스(`"solana:5eykt4..."` -> 1.0)가 포함되어 있어 Solana USDC 지원이 필수이다.
- **Fix:** `SOLANA_USDC_ADDRESSES` Record<string, string> 상수를 x402-usd-resolver.ts에 추가 (mainnet + devnet). USDC_DOMAINS 확인 후 Solana USDC 주소도 확인하는 2단계 매칭.
- **Files modified:** packages/daemon/src/services/x402/x402-usd-resolver.ts
- **Verification:** Solana USDC 테스트 3개 통과
- **Committed in:** cd24aca (GREEN 커밋)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Solana USDC 지원은 플랜의 behavior spec에 명시된 요구사항이었으나 구현 코드에서 누락됨. USDC_DOMAINS가 EVM 전용이라는 사실을 반영하여 별도 테이블로 해결. 스코프 변경 없음.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- resolveX402UsdAmount이 132-03(REST API 라우트)에서 SPENDING_LIMIT 정책 평가 전 USD 환산에 사용될 준비 완료
- USDC_DOMAINS(EVM) + SOLANA_USDC_ADDRESSES(Solana) 양쪽 모두 커버
- Oracle 폴백 패턴이 기존 resolve-effective-amount-usd.ts와 일관성 유지

## Self-Check: PASSED

- [x] x402-usd-resolver.ts exists
- [x] x402-usd-resolver.test.ts exists
- [x] 132-02-SUMMARY.md exists
- [x] Commit 2ab8596 (RED) exists
- [x] Commit cd24aca (GREEN) exists

---
*Phase: 132-rest-api-policy-audit-log*
*Completed: 2026-02-15*
