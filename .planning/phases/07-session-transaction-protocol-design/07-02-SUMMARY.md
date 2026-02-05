---
phase: 07-session-transaction-protocol-design
plan: 02
subsystem: api
tags: [solana, chain-adapter, solana-kit, pipe, rpc, transaction, ed25519, priority-fee]

# Dependency graph
requires:
  - phase: 06-core-architecture-design
    provides: IChainAdapter 13개 메서드 인터페이스, 공통 타입, ChainError, AdapterRegistry
  - phase: 06-core-architecture-design
    provides: sodium guarded memory 키스토어, 64바이트 Ed25519 키, Argon2id KDF
  - phase: 06-core-architecture-design
    provides: config.toml [rpc.solana] 설정, packages/adapters/solana 경로
provides:
  - SolanaAdapter 상세 설계 (CHAIN-SOL) -- IChainAdapter 13개 메서드의 @solana/kit 구현 명세
  - SOL 전송 + SPL 토큰 전송 instruction 빌드 패턴 (pipe API)
  - 트랜잭션 시뮬레이션/서명/제출/확인 대기 코드 패턴
  - Solana RPC 에러 -> WAIaaS ChainError 매핑 테이블
  - blockhash 만료 대응 전략 + 캐시 전략
affects: [07-03-transaction-pipeline, 08-security-layers, 09-integration]

# Tech tracking
tech-stack:
  added: ["@solana/kit", "@solana-program/system", "@solana-program/token", "@solana-program/associated-token-account", "@solana-program/compute-budget", "@solana/addresses"]
  patterns: ["pipe 기반 함수형 트랜잭션 빌드", "createSolanaRpc/createSolanaRpcSubscriptions", "Web Crypto Ed25519 서명", "blockhash 5초 캐시 + priority fee 30초 캐시", "exponential backoff 재시도"]

key-files:
  created: [".planning/deliverables/31-solana-adapter-detail.md"]
  modified: []

key-decisions:
  - "expiresAt = now + 50초 (blockhash ~60초에서 10초 안전 마진)"
  - "폴링 기반 확인 대기 (WebSocket 구독은 v0.3으로 이연)"
  - "skipPreflight: false 기본 (이중 안전 우선)"
  - "SOL 전송만 v0.2 공식 지원 (SPL 토큰은 설계만 포함, v0.3 구현)"
  - "Compute Unit 최적화: simulate 결과 CU * 1.2를 CU limit으로 재설정"
  - "Priority fee: getRecentPrioritizationFees 중간값 사용, 30초 캐시"

patterns-established:
  - "Pattern: @solana/kit pipe 트랜잭션 빌드 -- createTransactionMessage -> setFeePayer -> setLifetime -> appendInstruction"
  - "Pattern: Solana 에러 매핑 -- RPC 에러 문자열 파싱 -> ChainError(code, retryable) 변환"
  - "Pattern: 키 수명주기 분리 -- adapter는 서명만, 키 복호화/소거는 호출자 책임"

# Metrics
duration: 7min
completed: 2026-02-05
---

# Phase 7 Plan 02: Solana Adapter Detail Summary

**@solana/kit pipe API 기반 SolanaAdapter 13개 메서드 상세 설계 -- SOL/SPL 전송, 시뮬레이션, Ed25519 서명, 확인 대기, 에러 매핑**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-05T10:26:36Z
- **Completed:** 2026-02-05T10:33:43Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- IChainAdapter 13개 메서드 모두 @solana/kit API 수준으로 Solana 구현 설계 완료
- @solana/kit pipe 패턴 기반 SOL 전송 + SPL 토큰 전송(ATA 관리 포함) instruction 빌드 코드 패턴 정의
- 트랜잭션 4단계(build/simulate/sign/submit) + 확인 대기(waitForConfirmation) 완전한 코드 수준 설계
- Solana RPC 에러 11개를 WAIaaS ChainError 코드로 매핑하는 테이블 및 구현 패턴 정의
- blockhash 만료 대응 전략 + 캐시 전략(blockhash 5초, priority fee 30초) 문서화

## Task Commits

Each task was committed atomically:

1. **Task 1: SolanaAdapter 클래스 구조 + RPC 연결 + 조회 메서드 설계** - `b5b409c` (feat)
2. **Task 2: 트랜잭션 4단계 + 확인 대기 + 에러 매핑 설계** - `770f73e` (feat)

## Files Created/Modified

- `.planning/deliverables/31-solana-adapter-detail.md` - Solana Adapter 상세 설계 (CHAIN-SOL), 11개 섹션, ~1700줄

## Decisions Made

1. **expiresAt 안전 마진 10초:** blockhash 수명 ~60초에서 10초를 빼고 50초로 설정. signTransaction/submitTransaction 단계에서의 처리 시간을 고려.
2. **폴링 기반 확인 대기:** WebSocket 구독(`rpcSubscriptions`)은 v0.3으로 이연. 폴링이 더 단순하고 안정적이며, 2초 간격이 RPC rate limit에도 안전.
3. **skipPreflight 기본값 false:** 이중 안전 우선. 시뮬레이션을 이미 통과했더라도 제출 시점에 상태가 변경되었을 수 있으므로 preflight 재실행.
4. **SPL 토큰 설계만 포함:** v0.2는 네이티브 SOL만 공식 지원. SPL 토큰 전송(ATA 조회/생성, getTransferInstruction)은 설계를 포함하되 구현은 v0.3.
5. **Compute Unit 최적화 2단계:** 1차 빌드에서 안전값(300 CU) 설정, 시뮬레이션 후 실측 CU * 1.2로 재조정. 과대 priority fee 지불 방지.
6. **Priority fee 중간값 사용:** getRecentPrioritizationFees의 150 슬롯 통계에서 중간값을 사용. 극단적 혼잡 시에도 합리적인 수수료 설정.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SolanaAdapter 설계가 완료되어 07-03 트랜잭션 파이프라인 Execute 단계의 Solana 구현 기반이 확보됨
- CORE-04 IChainAdapter 13개 메서드가 모두 Solana-specific 코드 패턴으로 매핑됨
- blockhash 만료 대응 전략이 07-03 파이프라인 타이밍 설계에 직접 활용 가능
- 에러 매핑 테이블이 CORE-06 API 에러 응답 설계와 통합 가능

---
*Phase: 07-session-transaction-protocol-design*
*Completed: 2026-02-05*
