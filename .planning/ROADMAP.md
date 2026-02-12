# Roadmap: WAIaaS

## Milestones

- ✅ **v0.1 Research & Design** — Phases 1-5 (shipped 2026-02-05)
- ✅ **v0.2 Self-Hosted Secure Wallet Design** — Phases 6-9 (shipped 2026-02-05)
- ✅ **v0.3 설계 논리 일관성 확보** — Phases 10-13 (shipped 2026-02-06)
- ✅ **v0.4 테스트 전략 및 계획 수립** — Phases 14-18 (shipped 2026-02-07)
- ✅ **v0.5 인증 모델 재설계 + DX 개선** — Phases 19-21 (shipped 2026-02-07)
- ✅ **v0.6 블록체인 기능 확장 설계** — Phases 22-25 (shipped 2026-02-08)
- ✅ **v0.7 구현 장애 요소 해소** — Phases 26-30 (shipped 2026-02-08)
- ✅ **v0.8 Owner 선택적 등록 + 점진적 보안** — Phases 31-35 (shipped 2026-02-09)
- ✅ **v0.9 MCP 세션 관리 자동화 설계** — Phases 36-40 (shipped 2026-02-09)
- ✅ **v0.10 구현 전 설계 완결성 확보** — Phases 41-44 (shipped 2026-02-09)
- ✅ **v1.0 구현 계획 수립** — Phases 45-47 (shipped 2026-02-09)
- ✅ **v1.1 코어 인프라 + 기본 전송** — Phases 48-51 (shipped 2026-02-10, 281 tests, 10,925 LOC)
- ✅ **v1.2 인증 + 정책 엔진** — Phases 52-57 (shipped 2026-02-10, 457 tests, 25,526 LOC)
- ✅ **v1.3 SDK + MCP + 알림** — Phases 58-63 (shipped 2026-02-11, 784 tests, 33,929 LOC)
- ✅ **v1.3.1 Admin Web UI 설계** — Phases 64-65 (shipped 2026-02-11)
- ✅ **v1.3.2 Admin Web UI 구현** — Phases 66-70 (shipped 2026-02-11, 816 tests, 45,332 LOC)
- ✅ **v1.3.3 MCP 다중 에이전트 지원** — Phases 71-72 (shipped 2026-02-11, 847 tests, 44,639 LOC)
- ✅ **v1.3.4 알림 이벤트 트리거 연결 + 어드민 알림 패널** — Phases 73-75 (shipped 2026-02-12, 895 tests, 42,123 LOC)
- 🚧 **v1.4 토큰 + 컨트랙트 확장** — Phases 76-81 (in progress)

## Phases

<details>
<summary>v0.1 Research & Design (Phases 1-5) -- SHIPPED 2026-02-05</summary>

- [x] Phase 1: AI 에이전트 지갑 요구사항 분석 (3 plans)
- [x] Phase 2: 커스터디 모델 비교 연구 (3 plans)
- [x] Phase 3: Solana 기술 스택 조사 (3 plans)
- [x] Phase 4: 주인-에이전트 관계 모델 설계 (3 plans)
- [x] Phase 5: 오픈소스/기존 솔루션 조사 + 에이전트 프레임워크 통합 (3 plans)

</details>

<details>
<summary>v0.2 Self-Hosted Secure Wallet Design (Phases 6-9) -- SHIPPED 2026-02-05</summary>

- [x] Phase 6: 코어 지갑 서비스 설계 (4 plans)
- [x] Phase 7: 세션 + 체인 추상화 설계 (4 plans)
- [x] Phase 8: 보안 계층 설계 (4 plans)
- [x] Phase 9: 통합 + 배포 설계 (4 plans)

</details>

<details>
<summary>v0.3 설계 논리 일관성 확보 (Phases 10-13) -- SHIPPED 2026-02-06</summary>

- [x] Phase 10: v0.1 잔재 정리 + 변경 매핑 (2 plans)
- [x] Phase 11: CRITICAL 의사결정 확정 (2 plans)
- [x] Phase 12: Enum/상태값 통합 대응표 (2 plans)
- [x] Phase 13: REST API<>Framework 스펙 통일 (2 plans)

</details>

<details>
<summary>v0.4 테스트 전략 및 계획 수립 (Phases 14-18) -- SHIPPED 2026-02-07</summary>

- [x] Phase 14: 테스트 레벨/매트릭스/커버리지 정의 (2 plans)
- [x] Phase 15: 보안 공격 시나리오 71건 (2 plans)
- [x] Phase 16: 블록체인 3단계 테스트 환경 (2 plans)
- [x] Phase 17: CI/CD 4단계 파이프라인 (1 plan)
- [x] Phase 18: 배포 타겟별 테스트 시나리오 (2 plans)

</details>

<details>
<summary>v0.5 인증 모델 재설계 + DX 개선 (Phases 19-21) -- SHIPPED 2026-02-07</summary>

- [x] Phase 19: 3-Tier 인증 모델 재설계 (3 plans)
- [x] Phase 20: 세션 낙관적 갱신 + CLI DX (3 plans)
- [x] Phase 21: 기존 설계 문서 11개 v0.5 통합 (3 plans)

</details>

<details>
<summary>v0.6 블록체인 기능 확장 설계 (Phases 22-25) -- SHIPPED 2026-02-08</summary>

- [x] Phase 22: 토큰 확장 + 정책 (3 plans)
- [x] Phase 23: 트랜잭션 타입 확장 (3 plans)
- [x] Phase 24: 상위 추상화 레이어 (3 plans)
- [x] Phase 25: 테스트 전략 통합 + 문서 통합 (2 plans)

</details>

<details>
<summary>v0.7 구현 장애 요소 해소 (Phases 26-30) -- SHIPPED 2026-02-08</summary>

- [x] Phase 26: 체인 어댑터 안정화 (2 plans)
- [x] Phase 27: 데몬 보안 기반 확립 (3 plans)
- [x] Phase 28: 의존성 빌드 환경 해소 (2 plans)
- [x] Phase 29: API 통합 프로토콜 완성 (2 plans)
- [x] Phase 30: 스키마 설정 확정 (2 plans)

</details>

<details>
<summary>v0.8 Owner 선택적 등록 + 점진적 보안 (Phases 31-35) -- SHIPPED 2026-02-09</summary>

- [x] Phase 31: Owner 선택적 데이터 모델 (2 plans)
- [x] Phase 32: Owner 생명주기 상태 머신 (3 plans)
- [x] Phase 33: 정책 다운그레이드 메커니즘 (2 plans)
- [x] Phase 34: 자금 회수 프로토콜 (2 plans)
- [x] Phase 35: DX + 설계 문서 통합 (2 plans)

</details>

<details>
<summary>v0.9 MCP 세션 관리 자동화 설계 (Phases 36-40) -- SHIPPED 2026-02-09</summary>

- [x] Phase 36: 토큰 파일 인프라 (2 plans)
- [x] Phase 37: SessionManager 핵심 설계 (2 plans)
- [x] Phase 38: MCP 통합 설계 (2 plans)
- [x] Phase 39: CLI + Telegram 연동 (2 plans)
- [x] Phase 40: 테스트 설계 + 문서 통합 (2 plans)

</details>

<details>
<summary>v0.10 구현 전 설계 완결성 확보 (Phases 41-44) -- SHIPPED 2026-02-09</summary>

- [x] Phase 41: 정책 엔진 완결 (2 plans)
- [x] Phase 42: 에러 처리 체계 완결 (2 plans)
- [x] Phase 43: 동시성 + 실행 로직 완결 (3 plans)
- [x] Phase 44: 운영 로직 완결 (3 plans)

</details>

<details>
<summary>v1.0 구현 계획 수립 (Phases 45-47) -- SHIPPED 2026-02-09</summary>

- [x] Phase 45: 코어 구현 objective 문서 생성 (2 plans)
- [x] Phase 46: 확장 + 릴리스 objective 문서 생성 (2 plans)
- [x] Phase 47: 설계 부채 + 로드맵 최종 검증 (1 plan)

</details>

<details>
<summary>✅ v1.1 코어 인프라 + 기본 전송 (Phases 48-51) — SHIPPED 2026-02-10</summary>

- [x] Phase 48: 모노레포 스캐폴드 + @waiaas/core (3/3 plans) — completed 2026-02-10
- [x] Phase 49: 데몬 인프라 (3/3 plans) — completed 2026-02-10
- [x] Phase 50: API 서버 + SolanaAdapter + 파이프라인 (4/4 plans) — completed 2026-02-10
- [x] Phase 51: CLI + E2E 통합 검증 (2/2 plans) — completed 2026-02-10

</details>

<details>
<summary>✅ v1.2 인증 + 정책 엔진 (Phases 52-57) — SHIPPED 2026-02-10</summary>

- [x] Phase 52: 인증 기반 (2/2 plans) — completed 2026-02-10
- [x] Phase 53: 세션 관리 (2/2 plans) — completed 2026-02-10
- [x] Phase 54: 정책 엔진 (2/2 plans) — completed 2026-02-10
- [x] Phase 55: 워크플로우 + Owner 상태 (3/3 plans) — completed 2026-02-10
- [x] Phase 56: 파이프라인 통합 (2/2 plans) — completed 2026-02-10
- [x] Phase 57: 통합 테스트 (2/2 plans) — completed 2026-02-10

</details>

<details>
<summary>✅ v1.3 SDK + MCP + 알림 (Phases 58-63) — SHIPPED 2026-02-11</summary>

- [x] Phase 58: OpenAPIHono 전환 + getAssets() (2/2 plans) — completed 2026-02-10
- [x] Phase 59: REST API 확장 (2/2 plans) — completed 2026-02-11
- [x] Phase 60: 알림 시스템 (2/2 plans) — completed 2026-02-11
- [x] Phase 61: TypeScript SDK (2/2 plans) — completed 2026-02-11
- [x] Phase 62: Python SDK (1/1 plan) — completed 2026-02-11
- [x] Phase 63: MCP Server (2/2 plans) — completed 2026-02-11

</details>

<details>
<summary>✅ v1.3.1 Admin Web UI 설계 (Phases 64-65) — SHIPPED 2026-02-11</summary>

- [x] Phase 64: 인프라 + 인증 + 보안 기반 설계 (1/1 plan) — completed 2026-02-11
- [x] Phase 65: 페이지 + 컴포넌트 + API 연동 설계 (1/1 plan) — completed 2026-02-11

</details>

<details>
<summary>✅ v1.3.2 Admin Web UI 구현 (Phases 66-70) — SHIPPED 2026-02-11</summary>

- [x] Phase 66: 인프라 + 빌드 파이프라인 (2/2 plans) — completed 2026-02-11
- [x] Phase 67: 인증 + API Client + 공통 컴포넌트 (2/2 plans) — completed 2026-02-11
- [x] Phase 68: Dashboard + Agents + Sessions 페이지 (2/2 plans) — completed 2026-02-11
- [x] Phase 69: Policies + Settings 페이지 (2/2 plans) — completed 2026-02-11
- [x] Phase 70: 통합 테스트 (2/2 plans) — completed 2026-02-11

</details>

<details>
<summary>✅ v1.3.3 MCP 다중 에이전트 지원 (Phases 71-72) — SHIPPED 2026-02-11</summary>

- [x] Phase 71: MCP 토큰 경로 분리 + 에이전트 식별 (1/1 plan) — completed 2026-02-11
- [x] Phase 72: CLI mcp setup 다중 에이전트 (1/1 plan) — completed 2026-02-11

</details>

<details>
<summary>✅ v1.3.4 알림 이벤트 트리거 연결 + 어드민 알림 패널 (Phases 73-75) — SHIPPED 2026-02-12</summary>

- [x] Phase 73: 알림 로그 인프라 (1/1 plan) — completed 2026-02-11
- [x] Phase 74: 파이프라인 이벤트 트리거 연결 (2/2 plans) — completed 2026-02-11
- [x] Phase 75: 어드민 알림 API + UI (2/2 plans) — completed 2026-02-12

</details>

### 🚧 v1.4 토큰 + 컨트랙트 확장 (In Progress)

**Milestone Goal:** SPL/ERC-20 토큰 전송, 컨트랙트 호출, Approve 관리, 배치 트랜잭션, EVM 어댑터가 동작하는 상태

#### Phase 76: 기반 인프라 + 파이프라인 기초 — completed 2026-02-12
**Goal**: 모든 토큰/컨트랙트/배치 기능이 의존하는 기반 인프라가 준비되어, ChainError 카테고리 분기, DB 스키마 증분 마이그레이션, 5-type discriminatedUnion 파싱, IChainAdapter 20 메서드 인터페이스, 6개 신규 PolicyType 검증이 동작한다
**Depends on**: Nothing (v1.4 첫 번째 phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-04, INFRA-05, PIPE-05, PIPE-06
**Plans**: 3/3 plans complete

Plans:
- [x] 76-01-PLAN.md — ChainError 클래스 + 3-카테고리 시스템 + INFRA-05 에러 코드 이동 (Wave 1, TDD)
- [x] 76-02-PLAN.md — DB 마이그레이션 러너 + discriminatedUnion 5-type 스키마 (Wave 1)
- [x] 76-03-PLAN.md — IChainAdapter 20 메서드 확장 + 6개 PolicyType superRefine (Wave 2)

#### Phase 77: EVM 어댑터 — completed 2026-02-12
**Goal**: @waiaas/adapter-evm 패키지가 viem 2.x 기반으로 IChainAdapter 20개 메서드를 구현하여, EVM 네이티브 전송/ERC-20 전송/approve/gas 추정/nonce 관리가 동작한다
**Depends on**: Phase 76 (IChainAdapter 인터페이스 20 메서드 정의)
**Requirements**: INFRA-03, EVM-01, EVM-02, EVM-03, EVM-04, EVM-05, EVM-06
**Plans**: 2/2 plans complete

Plans:
- [x] 77-01-PLAN.md — @waiaas/adapter-evm 패키지 스캐폴딩 + viem 연결/헬스 기본 메서드 + ERC20 ABI
- [x] 77-02-PLAN.md — EVM 네이티브 전송 파이프라인 + gas 추정 1.2x + nonce 관리 + ERC-20 approve + getTokenInfo

#### Phase 78: 토큰 전송 + 자산 조회 — completed 2026-02-12
**Goal**: 에이전트가 SPL/ERC-20 토큰을 전송하고, ALLOWED_TOKENS 정책으로 허용 토큰을 제한하며, getAssets()가 토큰 잔액을 포함하고, estimateFee()가 토큰 전송 수수료를 추정한다
**Depends on**: Phase 76 (discriminatedUnion TOKEN_TRANSFER type, IChainAdapter buildTokenTransfer), Phase 77 (EVM adapter)
**Requirements**: TOKEN-01, TOKEN-02, TOKEN-03, TOKEN-04, TOKEN-05, TOKEN-06
**Plans**: 2/2 plans complete

Plans:
- [x] 78-01-PLAN.md — SolanaAdapter buildTokenTransfer + Token-2022 분기 + getTokenInfo/estimateFee/getTransactionFee + getAssets Token-2022 + ALLOWED_TOKENS 정책 평가 (Wave 1, TDD)
- [x] 78-02-PLAN.md — EvmAdapter buildTokenTransfer ERC-20 + getAssets ERC-20 multicall 확장 (Wave 2, TDD)

#### Phase 79: 컨트랙트 호출 + Approve 관리 — completed 2026-02-12
**Goal**: 에이전트가 화이트리스트된 스마트 컨트랙트를 호출하고, Approve를 요청할 수 있으며, CONTRACT_WHITELIST/METHOD_WHITELIST/APPROVED_SPENDERS/APPROVE_AMOUNT_LIMIT 정책이 기본 거부 원칙으로 동작한다
**Depends on**: Phase 76 (discriminatedUnion CONTRACT_CALL/APPROVE type, PolicyType), Phase 77 (EVM buildContractCall/buildApprove)
**Requirements**: CONTRACT-01, CONTRACT-02, CONTRACT-03, CONTRACT-04, APPROVE-01, APPROVE-02, APPROVE-03, APPROVE-04
**Plans**: 2/2 plans complete

Plans:
- [x] 79-01-PLAN.md — buildContractCall (EVM + Solana) + CONTRACT_WHITELIST + METHOD_WHITELIST 정책 평가 (Wave 1, TDD)
- [x] 79-02-PLAN.md — SolanaAdapter buildApprove (SPL ApproveChecked) + APPROVED_SPENDERS + APPROVE_AMOUNT_LIMIT + APPROVE_TIER_OVERRIDE 정책 평가 (Wave 2, TDD)

#### Phase 80: 배치 트랜잭션 — completed 2026-02-12
**Goal**: 에이전트가 Solana에서 원자적 배치 트랜잭션을 실행하고, 2단계 합산 정책으로 소액 분할 우회를 방지하며, 부모-자식 DB 구조로 배치 상태를 추적한다
**Depends on**: Phase 76 (discriminatedUnion BATCH type, IChainAdapter buildBatch), Phase 78 (토큰 전송 -- 배치 내 토큰 instruction)
**Requirements**: BATCH-01, BATCH-02, BATCH-03, BATCH-04
**Plans**: 1/1 plans complete

Plans:
- [x] 80-01-PLAN.md — SolanaAdapter.buildBatch 원자적 빌드 + DatabasePolicyEngine.evaluateBatch 2단계 합산 정책

#### Phase 81: 파이프라인 통합 + Stage 5
**Goal**: 5가지 트랜잭션 타입(TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH)이 6-stage 파이프라인을 완주하고, Stage 5가 ChainError 카테고리별 재시도/실패 분기를 수행한다
**Depends on**: Phase 76 (ChainError, discriminatedUnion), Phase 77 (EVM adapter), Phase 78 (토큰), Phase 79 (컨트랙트/Approve), Phase 80 (배치)
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04
**Success Criteria** (what must be TRUE):
  1. Stage 1이 discriminatedUnion으로 5-type 요청을 자동 식별하고, 잘못된 type은 즉시 거부한다
  2. Stage 3이 트랜잭션 type별로 적용 가능한 정책만 필터링하여 평가한다 (TOKEN_TRANSFER에 ALLOWED_TOKENS, CONTRACT_CALL에 CONTRACT_WHITELIST 등)
  3. Stage 5가 build->simulate->sign->submit 완전 의사코드를 구현하고, PERMANENT 즉시 실패/TRANSIENT 지수 백오프/STALE 재빌드 분기가 동작한다
  4. Stage 5가 type별로 올바른 adapter 메서드를 호출한다 (TRANSFER->buildTransaction, TOKEN_TRANSFER->buildTokenTransfer, CONTRACT_CALL->buildContractCall 등)
**Plans**: 2 plans

Plans:
- [ ] 81-01: Stage 1 discriminatedUnion 파싱 + Stage 3 type별 정책 필터링
- [ ] 81-02: Stage 5 완전 의사코드 구현 (CONC-01) + type별 adapter 라우팅 + 통합 테스트

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v0.1 Research & Design | 1-5 | 15 | Complete | 2026-02-05 |
| v0.2 Self-Hosted Design | 6-9 | 16 | Complete | 2026-02-05 |
| v0.3 설계 일관성 | 10-13 | 8 | Complete | 2026-02-06 |
| v0.4 테스트 전략 | 14-18 | 9 | Complete | 2026-02-07 |
| v0.5 인증 재설계 | 19-21 | 9 | Complete | 2026-02-07 |
| v0.6 블록체인 확장 | 22-25 | 11 | Complete | 2026-02-08 |
| v0.7 장애 요소 해소 | 26-30 | 11 | Complete | 2026-02-08 |
| v0.8 Owner 선택적 등록 | 31-35 | 11 | Complete | 2026-02-09 |
| v0.9 MCP 세션 자동화 | 36-40 | 10 | Complete | 2026-02-09 |
| v0.10 설계 완결성 | 41-44 | 10 | Complete | 2026-02-09 |
| v1.0 구현 계획 수립 | 45-47 | 5 | Complete | 2026-02-09 |
| v1.1 코어 인프라 | 48-51 | 12 | Complete | 2026-02-10 |
| v1.2 인증 + 정책 엔진 | 52-57 | 13 | Complete | 2026-02-10 |
| v1.3 SDK + MCP + 알림 | 58-63 | 11 | Complete | 2026-02-11 |
| v1.3.1 Admin Web UI 설계 | 64-65 | 2 | Complete | 2026-02-11 |
| v1.3.2 Admin Web UI 구현 | 66-70 | 10 | Complete | 2026-02-11 |
| v1.3.3 MCP 다중 에이전트 | 71-72 | 2 | Complete | 2026-02-11 |
| v1.3.4 알림 트리거 + 어드민 | 73-75 | 5 | Complete | 2026-02-12 |
| **v1.4 토큰 + 컨트랙트** | **76-81** | **10/12** | **In progress** | - |

**Total:** 18 milestones shipped, 80 phases completed, 180 plans completed, 19 new tests, 44,205+ LOC
**v1.4:** 6 phases (5 complete), 12 plans (10 complete), 35 requirements

---

*Last updated: 2026-02-12 after Phase 80 completed*
