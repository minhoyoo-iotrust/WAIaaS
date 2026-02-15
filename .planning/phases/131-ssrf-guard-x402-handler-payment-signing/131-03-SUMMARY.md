---
phase: 131-ssrf-guard-x402-handler-payment-signing
plan: 03
subsystem: payments
tags: [eip-3009, eip-712, signTypedData, viem, solana, signBytes, spl-token, x402, payment-signing]

# Dependency graph
requires:
  - phase: 130
    provides: "x402 타입 시스템 (CAIP-2 매핑, PaymentRequirements, 에러 코드)"
  - phase: 131-01
    provides: "SSRF 가드 (validateUrlSafety)"
provides:
  - "signPayment -- 체인별 결제 서명 생성 엔트리포인트 (키 관리 포함)"
  - "signEip3009 -- EVM EIP-3009 transferWithAuthorization EIP-712 서명"
  - "signSolanaTransferChecked -- Solana SPL TransferChecked 부분 서명"
  - "USDC_DOMAINS -- 7개 체인의 USDC EIP-712 도메인 상수 테이블"
  - "PaymentKeyStore -- 결제 서명용 키스토어 최소 인터페이스"
affects: [131-02, x402-handler, x402-integration]

# Tech tracking
tech-stack:
  added: ["@solana/kit (daemon 직접 의존성)", "@solana-program/token (daemon 직접 의존성)"]
  patterns: ["EIP-3009 transferWithAuthorization EIP-712 서명", "Solana partial signing (noopSigner feePayer)", "decrypt->sign->finally release 키 관리 패턴 (sign-only.ts와 동일)"]

key-files:
  created:
    - "packages/daemon/src/services/x402/payment-signer.ts"
    - "packages/daemon/src/__tests__/payment-signer.test.ts"
  modified:
    - "packages/daemon/package.json"

key-decisions:
  - "IChainAdapter를 경유하지 않고 viem/solana-kit을 직접 사용 (EIP-3009는 트랜잭션이 아닌 typed data 서명)"
  - "@solana/kit, @solana-program/token을 daemon 직접 의존성으로 추가 (adapter-solana 경유 불가)"
  - "validBefore = now+5분 (300초) -- 보안 창구 최소화"
  - "USDC_DOMAINS 상수 테이블에 7개 EVM 체인 등록 (Base, Ethereum, Polygon, Arbitrum, Optimism + testnets)"
  - "Solana 테스트 키는 createKeyPairFromPrivateKeyBytes로 유효한 Ed25519 키페어 생성"

patterns-established:
  - "x402 결제 서명: signPayment(requirements, keyStore, walletId, walletAddress, masterPassword, rpc?) 인터페이스"
  - "EIP-3009 PaymentPayload 구조: { x402Version: 2, accepted, payload: { signature, authorization } }"
  - "Solana PaymentPayload 구조: { x402Version: 2, accepted, payload: { transaction: base64 } }"

# Metrics
duration: 9min
completed: 2026-02-15
---

# Phase 131 Plan 03: Payment Signer Summary

**EVM EIP-3009 + Solana TransferChecked 결제 서명 모듈을 TDD로 구현, viem signTypedData와 @solana/kit signBytes로 체인별 서명 생성**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-15T12:04:17Z
- **Completed:** 2026-02-15T12:12:52Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 3

## Accomplishments
- EVM EIP-3009 transferWithAuthorization EIP-712 서명을 viem signTypedData로 생성하고 recoverTypedDataAddress로 검증
- Solana SPL TransferChecked 부분 서명을 @solana/kit signBytes로 생성하고 base64 직렬화
- decrypt->sign->finally release 키 관리 패턴 구현 (에러 시에도 키 해제 보장)
- USDC_DOMAINS 상수 테이블에 7개 EVM 체인의 USDC v2 컨트랙트 도메인 등록
- 23개 테스트 전체 통과 (EIP-712 구조, Solana 부분 서명, 키 관리, 체인 전략 선택, 도메인 상수)

## Task Commits

Each task was committed atomically:

1. **Task 1: 결제 서명 테스트 작성 (RED)** - `807a408` (test)
2. **Task 2: 결제 서명 구현 (GREEN)** - `d9d4311` (feat)

## Files Created/Modified
- `packages/daemon/src/services/x402/payment-signer.ts` - 결제 서명 모듈 (signPayment, signEip3009, signSolanaTransferChecked, USDC_DOMAINS)
- `packages/daemon/src/__tests__/payment-signer.test.ts` - 23개 테스트 (EIP-712 서명 검증, Solana 부분 서명, 키 관리 finally, 체인 전략, 도메인 상수)
- `packages/daemon/package.json` - @solana/kit, @solana-program/token 직접 의존성 추가

## Decisions Made
- IChainAdapter를 경유하지 않고 viem/solana-kit을 직접 사용: EIP-3009는 트랜잭션이 아닌 EIP-712 typed data 서명이고, Solana 부분 서명은 feePayer가 facilitator인 특수 트랜잭션이므로 기존 signTransaction 인터페이스에 맞지 않음
- @solana/kit, @solana-program/token을 daemon의 직접 의존성으로 추가: payment-signer가 adapter-solana를 경유하지 않고 직접 Solana 서명을 생성하므로 필수
- USDC_DOMAINS에 Base + Base Sepolia + Ethereum + Ethereum Sepolia + Polygon + Arbitrum + Optimism 등록: Circle 네이티브 USDC v2 컨트랙트 기준

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] daemon에 @solana/kit, @solana-program/token 직접 의존성 추가**
- **Found during:** Task 2 (GREEN 구현)
- **Issue:** daemon 패키지에서 @solana/kit을 import할 수 없음 (adapter-solana의 의존성이 pnpm 격리로 접근 불가)
- **Fix:** daemon/package.json에 @solana/kit ^6.0.1, @solana-program/token ^0.10.0 추가
- **Files modified:** packages/daemon/package.json
- **Verification:** pnpm install 성공, TypeScript 컴파일 통과, 23개 테스트 통과
- **Committed in:** d9d4311 (Task 2 commit)

**2. [Rule 1 - Bug] Solana 테스트 키 생성 방식 수정**
- **Found during:** Task 2 (GREEN 구현)
- **Issue:** crypto.randomBytes(64)로 생성한 바이트가 유효한 Ed25519 키페어가 아님 (createKeyPairFromBytes는 private+public 쌍 검증)
- **Fix:** 32-byte seed로 createKeyPairFromPrivateKeyBytes를 사용하여 유효한 키페어 생성
- **Files modified:** packages/daemon/src/__tests__/payment-signer.test.ts
- **Verification:** 23개 테스트 전체 통과
- **Committed in:** d9d4311 (Task 2 commit)

**3. [Rule 1 - Bug] PaymentRequirements import 경로 수정**
- **Found during:** Task 2 (GREEN 구현)
- **Issue:** @x402/core/types subpath를 daemon tsconfig에서 해석할 수 없음
- **Fix:** @waiaas/core에서 re-export된 PaymentRequirements 타입 사용
- **Files modified:** packages/daemon/src/services/x402/payment-signer.ts
- **Verification:** npx tsc --noEmit 통과
- **Committed in:** d9d4311 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** 모든 자동 수정이 구현에 필수적. 범위 변경 없음.

## Issues Encountered
- Solana blockhash 브랜드 타입 호환성: @solana/kit의 Blockhash 타입이 nominal branding을 사용하여 mock RPC에서 반환하는 string과 호환되지 않음. `as any` 캐스트로 해결 (런타임에는 string이므로 안전).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- payment-signer.ts가 x402-handler.ts에서 import 가능한 상태
- signPayment 인터페이스가 확정: requirements, keyStore, walletId, walletAddress, masterPassword, rpc?
- USDC_DOMAINS에 7개 EVM 체인 등록 완료
- Phase 131 Plan 02 (x402-handler) 구현 시 payment-signer를 직접 호출하여 결제 서명 생성 가능

## Self-Check: PASSED

- All 3 created files exist (payment-signer.ts, payment-signer.test.ts, 131-03-SUMMARY.md)
- Both commits verified (807a408, d9d4311)
- All 4 exports verified (signPayment, signEip3009, signSolanaTransferChecked, USDC_DOMAINS)
- 23/23 tests passing
- 1165/1165 daemon tests passing (no regressions)
- TypeScript compilation clean

---
*Phase: 131-ssrf-guard-x402-handler-payment-signing*
*Completed: 2026-02-15*
