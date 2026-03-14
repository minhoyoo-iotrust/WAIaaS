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
- ✅ **v1.1 ~ v31.14** — (100 milestones shipped)

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

<details>
<summary>✅ v31.14 EVM RPC 프록시 모드 (Phases 398-401) — SHIPPED 2026-03-13</summary>

- [x] Phase 398: Type System + Infrastructure Foundation (2/2 plans) — completed 2026-03-13
- [x] Phase 399: Core RPC Proxy Engine (3/3 plans) — completed 2026-03-13
- [x] Phase 400: Route Assembly + Async Approval (3/3 plans) — completed 2026-03-13
- [x] Phase 401: DX Integration + Testing (3/3 plans) — completed 2026-03-13

</details>

### v31.15 Amount 단위 표준화 및 AI 에이전트 DX 개선 (Phases 402-406)

**Milestone Goal:** AI 에이전트가 일관된 단위 규칙으로 안전하게 온체인 거래를 수행하고, typed MCP 스키마와 humanAmount 파라미터로 DX 향상

- [x] **Phase 402: Schema Hardening** - 모든 provider 스키마에 단위 설명 추가 및 CLOB 예외 문서화
- [ ] **Phase 403: Provider Unit Migration** - 4개 provider smallest-unit 전환 + migrateAmount 하위 호환성
- [ ] **Phase 404: Typed MCP Schemas + Response Enrichment** - MCP typed 스키마 + amountFormatted/decimals/symbol 응답 보강
- [ ] **Phase 405: humanAmount Parameter** - REST API/Action Provider/MCP에 humanAmount XOR 파라미터 추가
- [ ] **Phase 406: SDK + Skill File Sync + E2E** - SDK humanAmount 옵션 + 스킬 파일 단위 가이드 + E2E 검증

## Phase Details

### Phase 402: Schema Hardening
**Goal**: AI 에이전트가 모든 provider 스키마에서 명시적 단위 정보를 읽을 수 있다
**Depends on**: Nothing (first phase)
**Requirements**: UNIT-04, UNIT-06, MCP-04, MCP-05
**Success Criteria** (what must be TRUE):
  1. 14개 non-CLOB provider의 모든 amount 필드에 단위 타입과 예시값이 포함된 .describe()가 존재한다
  2. 3개 CLOB provider(Hyperliquid, Drift, Polymarket) 스키마에 exchange-native 단위 사용이 명시되어 있다
  3. 빌트인 MCP 도구(send-token, transfer-nft 등)의 amount 파라미터에 단위 정보가 포함되어 있다
**Plans:** 1/1 plans complete

Plans:
- [ ] 402-01-PLAN.md — Provider schema description hardening + CLOB 예외 문서화 + MCP 빌트인 도구 description 업데이트

### Phase 403: Provider Unit Migration
**Goal**: 모든 14개 non-CLOB provider가 smallest-unit 입력을 일관되게 수용하며, 4개 레거시 provider는 하위 호환성을 유지한다
**Depends on**: Phase 402
**Requirements**: UNIT-01, UNIT-02, UNIT-03, UNIT-05, TEST-01, TEST-02, TEST-07
**Success Criteria** (what must be TRUE):
  1. Aave V3, Kamino, Lido, Jito provider가 smallest-unit 입력(wei/lamports)을 정상 처리하며 parseTokenAmount() 호출이 제거되어 있다
  2. 소수점 포함 레거시 입력이 migrateAmount()를 통해 자동 변환되고 deprecation 경고가 로그에 출력된다
  3. aave/kamino repay/withdraw에서 max 키워드가 단위 변환과 독립적으로 정상 동작한다
  4. 4개 마이그레이션 provider에 대해 smallest-unit 입력, 하위호환 소수점 입력, max 키워드 테스트가 통과한다
**Plans:** 2 plans

Plans:
- [ ] 403-01: migrateAmount() 공유 헬퍼 + Aave V3 마이그레이션
- [ ] 403-02: Kamino + Lido + Jito 마이그레이션 + 하위호환 + max 키워드 테스트

### Phase 404: Typed MCP Schemas + Response Enrichment
**Goal**: MCP 도구가 typed 파라미터 스키마를 노출하고, 모든 트랜잭션/잔액 응답에 사람이 읽을 수 있는 금액 정보가 포함된다
**Depends on**: Phase 403
**Requirements**: MCP-01, MCP-02, MCP-03, RESP-01, RESP-02, RESP-03, RESP-04, RESP-05, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. MCP 도구 등록 시 ActionDefinition.inputSchema의 typed Zod 스키마가 사용되며, 변환 불가 시 z.record(z.unknown()) fallback이 유지된다
  2. GET /v1/actions/providers가 각 action의 inputSchema JSON을 반환한다
  3. 트랜잭션 상세 응답에 amountFormatted, decimals, symbol 필드가 포함된다 (토큰 메타데이터 미확인 시 null)
  4. 잔액 조회 API 응답에 balanceFormatted 필드가 포함된다
  5. amountFormatted 값은 token registry/chain config에서 런타임 계산된다 (DB 저장 없음)
**Plans:** 2 plans

Plans:
- [ ] 404-01: Typed MCP 스키마 등록 + provider 메타데이터 inputSchema API
- [ ] 404-02: TxDetailResponseSchema 보강 + balanceFormatted + 테스트

### Phase 405: humanAmount Parameter
**Goal**: AI 에이전트와 API 소비자가 human-readable 형식(예: "1.5" ETH)으로 금액을 지정할 수 있으며, amount와의 XOR 검증이 보장된다
**Depends on**: Phase 404
**Requirements**: HAMNT-01, HAMNT-02, HAMNT-03, HAMNT-04, HAMNT-05, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. REST API 트랜잭션 요청(TRANSFER, TOKEN_TRANSFER, APPROVE)에서 humanAmount를 amount 대안으로 수용하며, 동시 지정 시 에러를 반환한다
  2. humanAmount는 토큰 decimals 조회(native: chain config, ERC-20/SPL: registry)를 통해 smallest-unit으로 변환되며, 미등록 토큰에 대해 명확한 에러를 반환한다
  3. 10개 smallest-unit provider(CLOB 제외)에서 per-provider humanAmount 변형(humanAmount, humanSellAmount 등)이 동작한다
  4. MCP 도구가 provider 스키마에 맞는 humanAmount 파라미터를 노출한다
**Plans:** 2 plans

Plans:
- [ ] 405-01: Core XOR Zod refinement + REST API humanAmount (TRANSFER/TOKEN_TRANSFER/APPROVE)
- [ ] 405-02: Action Provider humanAmount + MCP humanAmount + 테스트

### Phase 406: SDK + Skill File Sync + E2E
**Goal**: SDK와 스킬 파일이 완성된 stable API 표면을 반영하며, E2E 시나리오로 전체 흐름이 검증된다
**Depends on**: Phase 405
**Requirements**: SDK-01, SDK-02, SDK-03, SDK-04, TEST-08
**Success Criteria** (what must be TRUE):
  1. SDK 메서드가 discriminated union 타입 시그니처로 humanAmount 옵션을 수용한다 ({ amount: string } | { humanAmount: string })
  2. 스킬 파일(transactions, actions, wallet, quickstart)에 단위 규칙 가이드 섹션이 포함되며 humanAmount 사용 예시가 우선 안내된다
  3. E2E 시나리오가 통과한다: AI 에이전트가 humanAmount로 swap/transfer/supply를 실행한다
**Plans:** 2 plans

Plans:
- [ ] 406-01: SDK humanAmount 옵션 + 스킬 파일 단위 가이드 섹션
- [ ] 406-02: E2E humanAmount 시나리오 테스트

## Progress

**Execution Order:**
Phases execute in numeric order: 402 -> 403 -> 404 -> 405 -> 406

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
| 398. Type System + Infrastructure Foundation | v31.14 | 2/2 | Complete | 2026-03-13 |
| 399. Core RPC Proxy Engine | v31.14 | 3/3 | Complete | 2026-03-13 |
| 400. Route Assembly + Async Approval | v31.14 | 3/3 | Complete | 2026-03-13 |
| 401. DX Integration + Testing | v31.14 | 3/3 | Complete | 2026-03-13 |
| 402. Schema Hardening | v31.15 | Complete    | 2026-03-14 | 2026-03-14 |
| 403. Provider Unit Migration | v31.15 | 0/2 | Not started | - |
| 404. Typed MCP Schemas + Response Enrichment | v31.15 | 0/2 | Not started | - |
| 405. humanAmount Parameter | v31.15 | 0/2 | Not started | - |
| 406. SDK + Skill File Sync + E2E | v31.15 | 0/2 | Not started | - |
