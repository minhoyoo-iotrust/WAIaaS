---
phase: 06-core-architecture-design
plan: 03
subsystem: chain-adapter, blockchain
tags: [chain-adapter, solana, evm, viem, solana-kit, pipe-api, eip-1559, nonce-management, adapter-registry]

requires:
  - phase: 06-01
    provides: 모노레포 패키지 구조 (adapters/solana, adapters/evm), SQLite 스키마 (agents.chain 컬럼), config.toml [rpc] 섹션
  - phase: v0.1 (03-system-architecture)
    provides: ARCH-05 IBlockchainAdapter 원본 (Squads 메서드 제거 대상)
provides:
  - IChainAdapter 인터페이스 (13 메서드, TypeScript 타입 수준 설계)
  - 공통 타입 8개 (ChainType, NetworkType, TokenAmount, TransferRequest, UnsignedTransaction, SimulationResult, SubmitResult, BalanceInfo)
  - ChainError 에러 체계 (공통 7 + Solana 2 + EVM 3)
  - AdapterRegistry 설계 (팩토리 패턴 + 인스턴스 캐싱 + 플러그인 인터페이스)
  - SolanaAdapter 상세 구현 명세 (@solana/kit 3.x pipe API)
  - EVMAdapter 상세 구현 명세 (viem Client/Action, EIP-1559, nonce 관리)
  - 체인 간 차이점 비교 매트릭스 (6개 비교 테이블)
affects: [06-04 (데몬 라이프사이클 -- AdapterRegistry 초기화/종료), 06-05 (API 프레임워크 -- 트랜잭션 라우트가 IChainAdapter 사용), Phase 7 (트랜잭션 파이프라인 -- 4단계 분리 활용), Phase 8 (정책 엔진 -- simulate 결과 기반 정책 검증)]

tech-stack:
  added: [@solana/kit 3.x, @solana-program/system, viem]
  patterns: [pipe 기반 함수형 트랜잭션 빌드, Client/Action 패턴, EIP-1559 수수료 모델, 팩토리 패턴 어댑터 등록, 로컬 nonce 트래커]

key-files:
  created:
    - .planning/deliverables/27-chain-adapter-interface.md
  modified: []

key-decisions:
  - "IChainAdapter 4단계 트랜잭션 분리 (build/simulate/sign/submit) -- 정책 엔진이 simulate 후 approve/reject 가능"
  - "signTransaction(tx, Uint8Array) -- sodium guarded memory 호환, Node.js Buffer GC 문제 회피"
  - "AdapterRegistry 팩토리 패턴 -- (chain, network) 조합당 인스턴스 1개 캐싱"
  - "EVM nonce: max(onchain, local) 전략 -- 빠른 연속 제출과 외부 제출 모두 안전"
  - "Solana expiresAt 필수, EVM undefined -- 체인별 트랜잭션 수명 차이 반영"
  - "EVM 기본 RPC 비어있음(ethereum) -- 공용 RPC rate limit 문제로 사용자 설정 강제"

patterns-established:
  - "IChainAdapter: 명령형 인터페이스 + 내부 라이브러리 패턴 캡슐화"
  - "4단계 트랜잭션 파이프라인: build -> simulate -> [정책 검증] -> sign -> submit"
  - "ChainError: 공통 코드(ChainErrorCode) + 체인 고유 코드(SolanaErrorCode, EVMErrorCode)"
  - "AdapterRegistry: register(chain, factory) + get(chain, network) + disconnectAll()"
  - "Nonce 관리: max(onchainNonce, localNonce) + 실패 시 tracker clear"

duration: 8min
completed: 2026-02-05
---

# Phase 6 Plan 3: ChainAdapter 인터페이스 설계 Summary

**IChainAdapter 13 메서드(4단계 tx 파이프라인) + 공통 타입 8개 + ChainError 12 코드 + AdapterRegistry + Solana(@solana/kit 3.x pipe)/EVM(viem EIP-1559) 어댑터 상세 명세**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-05T08:46:37Z
- **Completed:** 2026-02-05T08:54:30Z
- **Tasks:** 2
- **Files created:** 1

## Accomplishments

- v0.1 ARCH-05의 IBlockchainAdapter(Squads/KMS 의존)를 Self-Hosted 모델의 IChainAdapter로 전면 리팩터링. Squads 관련 6개 메서드 제거, 로컬 서명/연결 관리 8개 메서드 추가
- 4단계 트랜잭션 파이프라인(build->simulate->sign->submit) 설계 -- Phase 7 정책 엔진이 simulate 후 approve/reject할 수 있는 핵심 후크
- Solana Adapter를 @solana/kit 3.x pipe API 기반으로 모든 메서드의 내부 구현 전략까지 설계 (connect, buildTransaction 등 13개 메서드)
- EVM Adapter를 viem Client/Action 패턴 기반으로 동일 수준 설계. EIP-1559 수수료 모델, nonce 관리 전략, Graceful Shutdown 시 미전송 tx 처리까지 포함
- 체인 간 차이점 비교 매트릭스 6개 테이블 (수수료, 트랜잭션 수명, 확정성, 서명 알고리즘, 주소 포맷, 인터페이스 영향)

## Task Commits

Each task was committed atomically:

1. **Task 1: ChainAdapter 인터페이스 + 공통 타입 설계** - `18905ba` (docs)
2. **Task 2: Solana + EVM 어댑터 상세 구현 명세** - `96bd525` (docs)

## Files Created/Modified

- `.planning/deliverables/27-chain-adapter-interface.md` - CORE-04: IChainAdapter 인터페이스 + 공통 타입 + 에러 체계 + AdapterRegistry + Solana/EVM 어댑터 상세 명세 + 체인 비교 매트릭스

## Decisions Made

1. **4단계 트랜잭션 분리:** build->simulate->sign->submit 각각 독립 메서드. 시뮬레이션 후 정책 엔진이 개입할 수 있는 구조. 서명은 정책 승인된 트랜잭션에만 수행하여 guarded memory 접근 최소화
2. **signTransaction(tx, Uint8Array):** privateKey를 Uint8Array로 전달. sodium_malloc() SecureBuffer 호환성, Node.js Buffer GC 복사 문제(C-03) 회피
3. **AdapterRegistry 팩토리 패턴:** register(chain, factory) + get(chain, network). (chain, network) 조합당 인스턴스 1개만 생성하여 캐싱. disconnectAll()로 Graceful Shutdown 지원
4. **EVM nonce 전략:** max(onchainNonce, localNonce) 사용. onchain만 사용하면 빠른 연속 제출 시 충돌, local만 사용하면 외부 제출 시 gap 발생. 제출 실패 시 tracker clear로 복구
5. **expiresAt 선택적:** Solana는 blockhash ~60초 수명으로 필수, EVM은 nonce 기반으로 undefined. UnsignedTransaction.expiresAt를 optional로 설계
6. **Ethereum RPC 기본값 비어있음:** 공용 RPC의 rate limit이 트랜잭션 제출에 부적합. config.toml 미설정 시 에이전트 생성 에러 발생하도록 강제

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 06-04 (데몬 라이프사이클): AdapterRegistry 초기화(registerBuiltinAdapters) 및 종료(disconnectAll) 통합 필요. Graceful Shutdown 시 진행 중 트랜잭션 완료 보장 설계 가능
- 06-05 (API 프레임워크): /v1/transactions 라우트가 IChainAdapter의 4단계 파이프라인 사용. Zod 스키마에 TransferRequest/SubmitResult 타입 반영 필요
- Phase 7 (세션 & 트랜잭션): 4단계 파이프라인의 simulate->approve->sign 흐름 상세 설계. EVM nonce Graceful Shutdown 시나리오 상세화
- Phase 8 (보안 계층): simulateTransaction() 결과를 정책 엔진에 전달하는 통합 지점 설계
- 차단 요소 없음

---
*Phase: 06-core-architecture-design*
*Completed: 2026-02-05*
