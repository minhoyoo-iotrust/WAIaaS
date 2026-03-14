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
- ✅ **v1.1 ~ v31.15** — (101 milestones shipped)

## Phases

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

<details>
<summary>✅ v31.15 Amount 단위 표준화 및 AI 에이전트 DX 개선 (Phases 402-406) — SHIPPED 2026-03-14</summary>

- [x] Phase 402: Schema Hardening (1/1 plan) — completed 2026-03-14
- [x] Phase 403: Provider Unit Migration (2/2 plans) — completed 2026-03-14
- [x] Phase 404: Typed MCP Schemas + Response Enrichment (2/2 plans) — completed 2026-03-14
- [x] Phase 405: humanAmount Parameter (2/2 plans) — completed 2026-03-14
- [x] Phase 406: SDK + Skill File Sync + E2E (2/2 plans) — completed 2026-03-14

</details>

### v31.16 CAIP 표준 식별자 승격 (Phases 407-411)

- [x] **Phase 407: CAIP-2 Network Input** - normalizeNetworkInput CAIP-2 dual-accept 확장 + 전 인터페이스 자동 적용 (completed 2026-03-14)
- [x] **Phase 408: CAIP-19 Asset Input + Resolve** - assetId-only 토큰 특정 + 레지스트리 자동 resolve + 네트워크 추론 (completed 2026-03-14)
- [x] **Phase 409: Response CAIP Enrichment + OpenAPI** - 모든 응답에 chainId/assetId 동적 생성 + OpenAPI 스펙 반영 (completed 2026-03-14)
- [x] **Phase 410: SDK + MCP CAIP Extension** - SDK CAIP 타입 확장 + MCP 도구 CAIP 지원 + resolve_asset 신규 도구 (completed 2026-03-14)
- [ ] **Phase 411: Skill Files Sync** - 스킬 파일 CAIP-2/19 사용법 추가 + 예시 병기

## Phase Details

### Phase 407: CAIP-2 Network Input
**Goal**: 모든 네트워크 파라미터에서 CAIP-2 문자열을 plain string과 동일하게 수용
**Depends on**: Nothing (first phase)
**Requirements**: NET-01, NET-02, NET-03, NET-04, NET-05, TST-01, TST-02
**Success Criteria** (what must be TRUE):
  1. `eip155:1`을 network 파라미터에 전달하면 `ethereum-mainnet`과 동일하게 동작한다
  2. `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` 등 15개 네트워크 CAIP-2 매핑이 전수 검증된다
  3. 기존 plain string(`ethereum-mainnet`)과 legacy(`mainnet`) 입력은 변경 없이 동작한다
  4. 미등록 CAIP-2 문자열(`eip155:99999`)은 validation error를 반환한다
**Plans**: 1 plan

Plans:
- [ ] 407-01-PLAN.md — normalizeNetworkInput CAIP-2 확장 + z.preprocess 통합 + 테스트

### Phase 408: CAIP-19 Asset Input + Resolve
**Goal**: assetId 하나만으로 토큰을 특정하고 address/decimals/symbol을 자동 resolve
**Depends on**: Phase 407
**Requirements**: AST-01, AST-02, AST-03, AST-04, AST-05, AST-06, AST-07, TST-03, TST-04, TST-05, TST-06
**Success Criteria** (what must be TRUE):
  1. `{ assetId: "eip155:1/erc20:0xA0b8..." }`만 전달하면 레지스트리에서 address/decimals/symbol이 자동 resolve되어 토큰 전송이 성공한다
  2. 레지스트리 미등록 assetId는 CAIP-19에서 chainId+address를 파싱하여 네트워크와 주소를 추출하고, decimals/symbol만 추가 요구한다
  3. assetId의 네트워크와 요청의 network 파라미터가 불일치하면 validation error를 반환한다
  4. assetId가 제공되고 network가 미제공이면 assetId에서 네트워크를 자동 추론한다
  5. 기존 address+decimals+symbol 직접 전달 방식은 변경 없이 동작한다
**Plans**: 2 plans

Plans:
- [ ] 408-01-PLAN.md — CAIP-19 asset resolve 유틸리티 + TokenInfo superRefine cross-field validation
- [ ] 408-02-PLAN.md — 레지스트리 resolve 미들웨어 + 네트워크 추론 + transactions 통합

### Phase 409: Response CAIP Enrichment + OpenAPI
**Goal**: 모든 응답에 chainId(CAIP-2)와 assetId(CAIP-19)를 런타임 동적 생성하여 항상 포함
**Depends on**: Phase 407
**Requirements**: RSP-01, RSP-02, RSP-03, RSP-04, RSP-05, RSP-06, TST-07, DOC-01, DOC-02, DOC-03, DOC-04
**Success Criteria** (what must be TRUE):
  1. 잔액/자산/트랜잭션/NFT/DeFi/수신TX 응답에 `chainId` (CAIP-2) 필드가 항상 포함된다
  2. 토큰/자산 응답에 `assetId` (CAIP-19) 필드가 항상 포함되며, 네이티브 토큰은 `slip44` namespace를 사용한다
  3. NFT 응답에도 `assetId`가 포함된다
  4. `connect-info` 응답에 `supportedChainIds` (CAIP-2 배열)가 포함된다
  5. 기존 `network`, `chain`, `address`, `mint` 필드는 그대로 유지된다 (additive only)
**Plans**: 2 plans

Plans:
- [ ] 409-01-PLAN.md — 응답 스키마 chainId/assetId 동적 생성 유틸리티 + connect-info 확장
- [ ] 409-02-PLAN.md — 전체 응답 포인트 적용 + OpenAPI 스펙 업데이트 + 응답 검증 테스트

### Phase 410: SDK + MCP CAIP Extension
**Goal**: SDK와 MCP 클라이언트에서 CAIP-2/19를 네이티브로 사용 가능
**Depends on**: Phase 408, Phase 409
**Requirements**: SDK-01, SDK-02, SDK-03, SDK-04, SDK-05, MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06, TST-08, TST-09, TST-10
**Success Criteria** (what must be TRUE):
  1. SDK에서 `network: 'eip155:1'` 형태로 CAIP-2 문자열을 전달할 수 있다
  2. SDK `sendToken()`에 `{ assetId }` 단독 전달이 가능하며 기존 시그니처도 유지된다
  3. MCP `resolve_asset` 도구에 CAIP-19 assetId를 전달하면 address/decimals/symbol/name/network/chainId/isNative/isRegistered를 반환한다
  4. MCP 토큰 도구(`send_token`, `approve_token` 등)에서 `assetId` 단독 전달이 가능하다
  5. SDK 타입 export에 `Caip2ChainId`, `Caip19AssetId` 타입 alias가 포함된다
**Plans**: 2 plans

Plans:
- [ ] 410-01-PLAN.md — SDK CAIP 타입 확장 + TokenInfo union + validation 완화 + 테스트
- [ ] 410-02-PLAN.md — MCP resolve_asset 신규 도구 + send_token/approve_token assetId-only + 테스트

### Phase 411: Skill Files Sync
**Goal**: 스킬 파일에 CAIP-2/19 사용법과 예시를 반영하여 AI 에이전트가 CAIP 경로를 인지
**Depends on**: Phase 410
**Requirements**: DOC-05, DOC-06, DOC-07
**Success Criteria** (what must be TRUE):
  1. `skills/*.skill.md` 파일에 CAIP-2 네트워크 지정 형식과 예시가 포함된다
  2. 토큰 전송 예시에 `assetId` 단독 사용 패턴이 문서화된다
  3. 네트워크 지정 예시에 CAIP-2 형식이 기존 plain string과 병기된다
**Plans**: 2 plans

Plans:
- [ ] 411-01: 스킬 파일 4종 CAIP-2/19 사용법 추가

## Progress

**Execution Order:**
Phases execute in numeric order: 407 → 408 → 409 → 410 → 411

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 393. Staking Positions (Lido + Jito) | v31.13 | 2/2 | Complete | 2026-03-12 |
| 394. Lending Positions (Aave V3) | v31.13 | 1/1 | Complete | 2026-03-12 |
| 395. Yield Positions (Pendle) | v31.13 | 1/1 | Complete | 2026-03-12 |
| 396. Perp/Spot Positions (Hyperliquid) | v31.13 | 2/2 | Complete | 2026-03-12 |
| 397. Admin Dashboard UX | v31.13 | 2/2 | Complete | 2026-03-12 |
| 398. Type System + Infrastructure Foundation | v31.14 | 2/2 | Complete | 2026-03-13 |
| 399. Core RPC Proxy Engine | v31.14 | 3/3 | Complete | 2026-03-13 |
| 400. Route Assembly + Async Approval | v31.14 | 3/3 | Complete | 2026-03-13 |
| 401. DX Integration + Testing | v31.14 | 3/3 | Complete | 2026-03-13 |
| 402. Schema Hardening | v31.15 | 1/1 | Complete | 2026-03-14 |
| 403. Provider Unit Migration | v31.15 | 2/2 | Complete | 2026-03-14 |
| 404. Typed MCP Schemas + Response Enrichment | v31.15 | 2/2 | Complete | 2026-03-14 |
| 405. humanAmount Parameter | v31.15 | 2/2 | Complete | 2026-03-14 |
| 406. SDK + Skill File Sync + E2E | v31.15 | 2/2 | Complete | 2026-03-14 |
| 407. CAIP-2 Network Input | 1/1 | Complete    | 2026-03-14 | - |
| 408. CAIP-19 Asset Input + Resolve | v31.16 | Complete    | 2026-03-14 | 2026-03-14 |
| 409. Response CAIP Enrichment + OpenAPI | 2/2 | Complete    | 2026-03-14 | - |
| 410. SDK + MCP CAIP Extension | 2/2 | Complete    | 2026-03-14 | - |
| 411. Skill Files Sync | v31.16 | 0/1 | Not started | - |
