---
phase: 26-chain-adapter-stabilization
plan: 01
subsystem: chain-adapter
tags: [solana, evm, blockhash, nonce, chain-adapter, freshness-guard, transaction-safety]

# Dependency graph
requires:
  - phase: 06-core-architecture-design
    provides: IChainAdapter 인터페이스 + SolanaAdapter/EVMAdapter 기본 설계
  - phase: 22-token-extension
    provides: IChainAdapter 17개 메서드 확장 (v0.6)
provides:
  - Solana blockhash freshness guard (checkBlockhashFreshness + refreshBlockhash)
  - IChainAdapter 19개 메서드 (getCurrentNonce, resetNonceTracker 추가)
  - UnsignedTransaction.nonce 명시적 optional 필드
  - SOLANA_BLOCKHASH_STALE 에러 코드 (EXPIRED와 복구 전략 분리)
affects:
  - 26-02 (키스토어 nonce 수정 + priority fee 전략)
  - 27-pipeline-stabilization (파이프라인에서 nonce 접근 패턴 변경)
  - 28-security-policy-stabilization (정책 엔진에서 STALE 복구 플로우 활용)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "2단계 blockhash 검증: 1차 expiresAt(wall-clock) + 2차 getBlockHeight()(on-chain)"
    - "refreshBlockhash Option A: transactionMessage 객체를 metadata._compiledMessage에 캐싱"
    - "nonce 필드 승격: metadata에서 UnsignedTransaction 명시적 optional 필드로"
    - "Nonce 관리 인터페이스: getCurrentNonce(max onchain/local) + resetNonceTracker"

key-files:
  created: []
  modified:
    - ".planning/deliverables/31-solana-adapter-detail.md"
    - ".planning/deliverables/27-chain-adapter-interface.md"

key-decisions:
  - "getBlockHeight() 사용 (getSlot() 아님): slot과 block height는 다르며, skipped 슬롯으로 인한 차이 방지"
  - "FRESHNESS_THRESHOLD_SECONDS = 20초: sign(1s) + submit(2s) + 대기(2s) + 안전마진(15s)"
  - "refreshBlockhash Option A 채택: 메시지 객체 캐싱으로 instruction 보존, RPC 1회로 복구"
  - "BLOCKHASH_STALE vs EXPIRED 분리: STALE은 refreshBlockhash로 빠른 복구, EXPIRED는 buildTransaction 재실행"
  - "nonce 필드 승격: metadata.nonce -> tx.nonce (타입 안전성 + 파이프라인 접근 용이)"
  - "getCurrentNonce: max(onchainPending, localTracker) 전략 유지, viem nonceManager 참고만"

patterns-established:
  - "체인 무관 nonce 가드: tx.nonce !== undefined 체크로 EVM/Solana 분기"
  - "STALE 복구 플로우: refreshBlockhash -> re-sign -> submit (buildTransaction 재실행 불필요)"
  - "[v0.7 보완] 태그로 기존 설계 보완 추적"

# Metrics
duration: 6min
completed: 2026-02-08
---

# Phase 26 Plan 01: Blockhash/Nonce 안정화 Summary

**Solana blockhash freshness guard(getBlockHeight 기반 20초 임계값) + refreshBlockhash(Option A 메시지 캐싱) + IChainAdapter 19개 메서드 확장(getCurrentNonce/resetNonceTracker) + UnsignedTransaction.nonce 승격**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-08T07:32:44Z
- **Completed:** 2026-02-08T07:38:43Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments
- Solana signTransaction 직전 getBlockHeight() 기반 blockhash freshness guard 설계 완료 (CHAIN-01 CRITICAL 해소)
- refreshBlockhash() 유틸리티: Option A(메시지 캐싱) 방식으로 instruction 보존하면서 blockhash만 교체
- IChainAdapter 17 -> 19개 메서드 확장: getCurrentNonce, resetNonceTracker (CHAIN-02 CRITICAL 해소)
- UnsignedTransaction.nonce를 명시적 optional 필드로 승격하여 EVM nonce 타입 안전성 확보
- BLOCKHASH_STALE 에러 코드 양쪽 문서에 반영, EXPIRED와 복구 전략 명확히 분리

## Task Commits

Each task was committed atomically:

1. **Task 1: Solana blockhash freshness guard + refreshBlockhash 설계 추가** - `58f3fb7` (feat)
2. **Task 2: IChainAdapter EVM nonce 인터페이스 확장 + UnsignedTransaction.nonce 승격** - `a4c2957` (feat)

## Files Created/Modified
- `.planning/deliverables/31-solana-adapter-detail.md` - checkBlockhashFreshness, refreshBlockhash, BLOCKHASH_STALE 에러 코드, FRESHNESS_THRESHOLD_SECONDS 상수, 섹션 11.3 STALE 복구 플로우 다이어그램 추가 (+280줄)
- `.planning/deliverables/27-chain-adapter-interface.md` - getCurrentNonce/resetNonceTracker 메서드, UnsignedTransaction.nonce 필드, BLOCKHASH_STALE 에러 코드, Solana no-op 구현, EVM 구현 설계 추가 (+195줄)

## Decisions Made
1. **getBlockHeight() 사용 (getSlot() 아님):** slot과 block height는 다르며, skipped 슬롯 존재 시 slot > blockHeight이 된다. lastValidBlockHeight는 block height 기준이므로 반드시 getBlockHeight()로 비교해야 한다.
2. **FRESHNESS_THRESHOLD_SECONDS = 20초:** blockhash 수명 60초에서 sign(1초) + submit(2초) + 대기(2초) + 안전마진(15초)을 빼면 약 20초가 최소 필요 잔여 수명이다.
3. **refreshBlockhash Option A 채택:** transactionMessage 객체를 metadata._compiledMessage에 캐싱하여 instruction을 재구성하지 않고 blockhash만 교체. RPC 1회로 빠른 복구 가능.
4. **BLOCKHASH_STALE vs EXPIRED 분리:** STALE(잔여 수명 부족)은 refreshBlockhash로 O(1) RPC 호출로 복구, EXPIRED(이미 만료)는 buildTransaction 완전 재실행. 복구 비용 차이를 에러 코드로 명시.
5. **nonce 필드 승격:** metadata.nonce(Record<string, unknown> 타입 불안전) -> tx.nonce(number | undefined 타입 안전). 파이프라인에서 `tx.nonce !== undefined` 가드로 체인 분기.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CHAIN-01(blockhash 경쟁 조건)과 CHAIN-02(EVM nonce 인터페이스) 해소 완료
- 26-02-PLAN (키스토어 nonce 수정 + priority fee 전략) 실행 준비 완료
- 두 문서 모두 기존 설계를 파괴하지 않고 [v0.7 보완] 태그로 보완만 수행

## Self-Check: PASSED

---
*Phase: 26-chain-adapter-stabilization*
*Completed: 2026-02-08*
