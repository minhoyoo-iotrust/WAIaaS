# Roadmap: WAIaaS

## Milestones

- ✅ **v0.1** — Research & Design (shipped 2026-02-05)
- ✅ **v0.2** — Self-Hosted Secure Wallet Design (shipped 2026-02-05)
- ✅ **v0.3** — 설계 논리 일관성 확보 (shipped 2026-02-06)
- ✅ **v0.4** — 테스트 전략 및 계획 수립 (shipped 2026-02-07)
- ✅ **v0.5** — 인증 모델 재설계 + DX 개선 (shipped 2026-02-07)
- ✅ **v0.6** — 블록체인 기능 확장 설계 (shipped 2026-02-08)
- ✅ **v0.7** — 구현 장애 요소 해소 (shipped 2026-02-08)
- ✅ **v0.8** — Owner 선택적 등록 + 점진적 보안 모델 (shipped 2026-02-09)
- ✅ **v0.9** — MCP 세션 관리 자동화 설계 (shipped 2026-02-09)
- ✅ **v0.10** — 구현 전 설계 완결성 확보 (shipped 2026-02-09)
- ✅ **v1.0** — 구현 계획 수립 (shipped 2026-02-09)
- ✅ **v1.1 ~ v31.13** — (98 milestones shipped)
- 🚧 **v31.14** — EVM RPC 프록시 모드 (in progress)

## Phases

<details>
<summary>✅ v31.12 External Action 프레임워크 구현 (Phases 386-392) — SHIPPED 2026-03-12</summary>

- [x] Phase 386: 타입 시스템 + 에러 코드 + DB 마이그레이션 (3/3 plans) — completed 2026-03-11
- [x] Phase 387: Signer Capability 레지스트리 (2/2 plans) — completed 2026-03-11
- [x] Phase 388: Credential Vault (2/2 plans) — completed 2026-03-11
- [x] Phase 389: 추적 + 정책 확장 (2/2 plans) — completed 2026-03-11
- [x] Phase 390: 파이프라인 라우팅 + 조회 API (2/2 plans) — completed 2026-03-12
- [x] Phase 391: Admin UI (2/2 plans) — completed 2026-03-12
- [x] Phase 392: MCP + SDK + 스킬 파일 (2/2 plans) — completed 2026-03-12

</details>

<details>
<summary>✅ v31.13 DeFi 포지션 대시보드 완성 (Phases 393-397) — SHIPPED 2026-03-12</summary>

- [x] Phase 393: Staking Positions (Lido + Jito) (2/2 plans) — completed 2026-03-12
- [x] Phase 394: Lending Positions (Aave V3) (1/1 plan) — completed 2026-03-12
- [x] Phase 395: Yield Positions (Pendle) (1/1 plan) — completed 2026-03-12
- [x] Phase 396: Perp/Spot Positions (Hyperliquid) (2/2 plans) — completed 2026-03-12
- [x] Phase 397: Admin Dashboard UX (2/2 plans) — completed 2026-03-12

</details>

### 🚧 v31.14 EVM RPC 프록시 모드 (In Progress)

**Milestone Goal:** WAIaaS 데몬이 EVM JSON-RPC 프록시로 동작하여, Forge/Hardhat/ethers.js/viem 등 기존 EVM 개발 도구가 `--rpc-url`만 변경하면 WAIaaS 정책 엔진 + 서명 파이프라인 아래에서 컨트랙트 배포 및 온체인 인터랙션을 수행할 수 있도록 한다.

- [x] **Phase 398: Type System + Infrastructure Foundation** - CONTRACT_DEPLOY 9-type SSoT 확장, DB v58, keepAliveTimeout, EVM_CHAIN_MAP 역방향 조회
- [x] **Phase 399: Core RPC Proxy Engine** - 서명 메서드 핸들러, RpcPassthrough, RpcTransactionAdapter, CompletionWaiter, JSON-RPC 프로토콜 유틸
- [x] **Phase 400: Route Assembly + Async Approval** - Hono 라우트, RpcDispatcher, 배치 처리, Long-poll 비동기 승인, 보안 검증
- [ ] **Phase 401: DX Integration + Testing** - Admin Settings/UI, MCP 도구, SDK 메서드, connect-info, 테스트 스위트

## Phase Details

### Phase 398: Type System + Infrastructure Foundation
**Goal**: CONTRACT_DEPLOY가 9번째 트랜잭션 타입으로 Zod SSoT 전체 체인에 전파되고, 인프라 전제 조건(keepAliveTimeout, chainId 역방향 조회)이 준비된다
**Depends on**: Nothing (first phase)
**Requirements**: DEPL-01, DEPL-02, DEPL-03, DEPL-04, DEPL-05, DEPL-06, ASYNC-05, RPC-07
**Success Criteria** (what must be TRUE):
  1. `eth_sendTransaction`에 `to=null`을 보내면 tx-parser가 CONTRACT_DEPLOY로 분류한다
  2. DB v58 마이그레이션이 tx_history type CHECK에 CONTRACT_DEPLOY를 포함하고, toAddress nullable로 저장된다
  3. CONTRACT_DEPLOY 트랜잭션이 기본 APPROVAL 티어 정책으로 처리된다
  4. Node.js keepAliveTimeout이 600초 이상으로 설정되어 Long-poll 연결이 유지된다
  5. 존재하지 않는 chainId로 요청 시 JSON-RPC `-32602` 에러가 반환된다
**Plans:** 2/2 plans complete

Plans:
- [x] 398-01: CONTRACT_DEPLOY Zod SSoT 확장 (enum, discriminatedUnion, switch/case, tx-parser)
- [x] 398-02: DB v58 마이그레이션 + 인프라 전제 조건 (toAddress nullable, keepAliveTimeout, EVM_CHAIN_MAP reverse)

### Phase 399: Core RPC Proxy Engine
**Goal**: RPC 프록시의 핵심 컴포넌트(서명 인터셉트, 패스스루, 트랜잭션 변환, 완료 대기)가 독립적으로 동작한다
**Depends on**: Phase 398
**Requirements**: SIGN-01, SIGN-02, SIGN-03, SIGN-04, SIGN-05, SIGN-06, SIGN-07, PASS-01, PASS-02, RPC-03, RPC-04
**Success Criteria** (what must be TRUE):
  1. `eth_sendTransaction` 파라미터가 WAIaaS TransactionRequest로 변환되어 6-stage 파이프라인을 통과한다
  2. `eth_signTransaction`이 sign-only 파이프라인을 통과하여 서명된 트랜잭션을 반환한다(broadcast 없음)
  3. `eth_accounts`가 세션 지갑 주소를 반환하고, `eth_chainId`가 URL chainId에서 파생된 hex 값을 반환한다
  4. `personal_sign`, `eth_signTypedData_v4`가 각각 적절한 서명 파이프라인을 통과한다
  5. 읽기 메서드가 RPC Pool을 통해 프록시되고, 미지원 메서드는 `-32601` 에러를 반환한다
**Plans:** 3/3 plans complete

Plans:
- [x] 399-01-PLAN.md — JSON-RPC 2.0 프로토콜 유틸 + RpcTransactionAdapter
- [x] 399-02-PLAN.md — CompletionWaiter + SyncPipelineExecutor + NonceTracker
- [x] 399-03-PLAN.md — RpcPassthrough + 서명 메서드 핸들러 (personal_sign, signTypedData, signTransaction)

### Phase 400: Route Assembly + Async Approval
**Goal**: `/v1/rpc-evm/:walletId/:chainId` 엔드포인트가 완전히 동작하여 세션 인증된 JSON-RPC 요청을 정책 티어에 따라 동기/비동기로 처리한다
**Depends on**: Phase 399
**Requirements**: RPC-01, RPC-02, RPC-05, RPC-06, ASYNC-01, ASYNC-02, ASYNC-03, ASYNC-04, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06
**Success Criteria** (what must be TRUE):
  1. 인증된 세션으로 `POST /v1/rpc-evm/:walletId/:chainId`에 JSON-RPC 요청을 보내면 응답을 받는다
  2. IMMEDIATE 티어 트랜잭션은 즉시 서명 후 txHash를 JSON-RPC 응답으로 반환한다
  3. DELAY/APPROVAL 티어 트랜잭션은 Long-poll로 대기하다가 완료 시 txHash를, 타임아웃 시 `-32000` 에러를 반환한다
  4. 인증 없는 요청은 거부되고, `from` 필드가 세션 지갑과 불일치하면 거부된다
  5. 배치 JSON-RPC 요청(배열)이 처리되고, 모든 서명 트랜잭션이 `source: 'rpc-proxy'`로 감사 로그에 기록된다
**Plans:** 3/3 plans complete

Plans:
- [x] 400-01-PLAN.md — RpcDispatcher + Hono 라우트 등록 + sessionAuth 미들웨어
- [x] 400-02-PLAN.md — Long-poll 비동기 승인 + 배치 처리 + from 검증
- [x] 400-03-PLAN.md — 보안 검증 (bytecodeSize, rate limiting, audit log source)

### Phase 401: DX Integration + Testing
**Goal**: RPC 프록시가 Admin Settings로 런타임 제어되고, MCP/SDK/connect-info를 통해 AI 에이전트가 프록시 URL을 자동 발견하며, 포괄적 테스트가 프로토콜 준수를 검증한다
**Depends on**: Phase 400
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-06, INTG-01, INTG-02, INTG-03, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07
**Success Criteria** (what must be TRUE):
  1. Admin Settings에서 `rpc_proxy.enabled` 토글로 프록시를 활성화/비활성화할 수 있다
  2. Admin UI에 RPC Proxy 섹션이 표시되어 상태와 요청 로그를 확인할 수 있다
  3. MCP `get_rpc_proxy_url` 도구와 SDK `getRpcProxyUrl()` 메서드가 프록시 URL을 반환한다
  4. `connect-info` 응답에 `rpcProxyBaseUrl`이 포함되어 에이전트가 자동 발견한다
  5. JSON-RPC 프로토콜 준수, 서명 인터셉트, 패스스루, CONTRACT_DEPLOY, 비동기 승인, 배치, 보안 테스트가 모두 통과한다
**Plans:** TBD

Plans:
- [ ] 401-01: Admin Settings 6키 + Admin UI RPC Proxy 섹션
- [ ] 401-02: MCP 도구 + SDK 메서드 + connect-info 확장
- [ ] 401-03: 포괄적 테스트 스위트 (7개 TEST 요구사항)

## Progress

**Execution Order:**
Phases execute in numeric order: 398 → 399 → 400 → 401

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 386. 타입 시스템 + 에러 코드 + DB | v31.12 | 3/3 | Complete | 2026-03-11 |
| 387. Signer Capability 레지스트리 | v31.12 | 2/2 | Complete | 2026-03-11 |
| 388. Credential Vault | v31.12 | 2/2 | Complete | 2026-03-11 |
| 389. 추적 + 정책 확장 | v31.12 | 2/2 | Complete | 2026-03-11 |
| 390. 파이프라인 라우팅 + 조회 API | v31.12 | 2/2 | Complete | 2026-03-12 |
| 391. Admin UI | v31.12 | 2/2 | Complete | 2026-03-12 |
| 392. MCP + SDK + 스킬 파일 | v31.12 | 2/2 | Complete | 2026-03-12 |
| 393. Staking Positions (Lido + Jito) | v31.13 | 2/2 | Complete | 2026-03-12 |
| 394. Lending Positions (Aave V3) | v31.13 | 1/1 | Complete | 2026-03-12 |
| 395. Yield Positions (Pendle) | v31.13 | 1/1 | Complete | 2026-03-12 |
| 396. Perp/Spot Positions (Hyperliquid) | v31.13 | 2/2 | Complete | 2026-03-12 |
| 397. Admin Dashboard UX | v31.13 | 2/2 | Complete | 2026-03-12 |
| 398. Type System + Infrastructure Foundation | v31.14 | Complete    | 2026-03-13 | 2026-03-13 |
| 399. Core RPC Proxy Engine | v31.14 | Complete    | 2026-03-13 | 2026-03-13 |
| 400. Route Assembly + Async Approval | v31.14 | 3/3 | Complete | 2026-03-13 |
| 401. DX Integration + Testing | v31.14 | 0/3 | Not started | - |
