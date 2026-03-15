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
- ✅ **v1.1 ~ v31.18** — (104 milestones shipped)

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

<details>
<summary>✅ v31.16 CAIP 표준 식별자 승격 (Phases 407-411) — SHIPPED 2026-03-15</summary>

- [x] Phase 407: CAIP-2 Network Input (1/1 plan) — completed 2026-03-14
- [x] Phase 408: CAIP-19 Asset Input + Resolve (2/2 plans) — completed 2026-03-14
- [x] Phase 409: Response CAIP Enrichment + OpenAPI (2/2 plans) — completed 2026-03-14
- [x] Phase 410: SDK + MCP CAIP Extension (2/2 plans) — completed 2026-03-14
- [x] Phase 411: Skill Files Sync (1/1 plan) — completed 2026-03-14

</details>

<details>
<summary>✅ v31.17 OpenAPI 기반 프론트엔드 타입 자동 생성 (Phases 412-416) — SHIPPED 2026-03-15</summary>

- [x] Phase 412: Spec 추출 파이프라인 및 CI 게이트 (2/2 plans) — completed 2026-03-15
- [x] Phase 413: 타입 안전 클라이언트 및 첫 페이지 마이그레이션 (2/2 plans) — completed 2026-03-15
- [x] Phase 414: 인터페이스 점진적 마이그레이션 (3/3 plans) — completed 2026-03-14
- [x] Phase 415: 백엔드 API 확장 및 상수 통합 (3/3 plans) — completed 2026-03-14
- [x] Phase 416: Contract Test 및 검증 (1/1 plan) — completed 2026-03-15

</details>

<details>
<summary>✅ v31.18 Admin UI IA 재구조화 (Phases 417-420) — SHIPPED 2026-03-15</summary>

- [x] Phase 417: 사이드바 섹션 + 리네이밍 + 라우트 정리 (2/2 plans) — completed 2026-03-15
- [x] Phase 418: 페이지 병합 + 레거시 정리 (2/2 plans) — completed 2026-03-15
- [x] Phase 419: Trading Settings 탭 제거 (1/1 plan) — completed 2026-03-15
- [x] Phase 420: 지갑 상세 탭 재구성 (2/2 plans) — completed 2026-03-15

</details>

### v32.0 Contract Name Resolution (In Progress)

- [x] **Phase 421: Registry Core + Well-Known Data** - ContractNameRegistry service with 4-tier resolution, well-known static data, and Action Provider displayName (completed 2026-03-15)
- [x] **Phase 422: Notification Pipeline Integration** - CONTRACT_CALL notifications display resolved contract names at all 4 lifecycle events (completed 2026-03-15)
- [ ] **Phase 423: API + Admin UI Contract Names** - TxDetailResponse enrichment and Admin UI display of contract names

## Phase Details

### Phase 421: Registry Core + Well-Known Data
**Goal**: A synchronous in-memory ContractNameRegistry resolves contract addresses to human-readable names using a 4-tier priority cascade, backed by 300+ well-known entries and Action Provider displayName metadata
**Depends on**: Nothing (first phase)
**Requirements**: REG-01, REG-02, REG-03, REG-04, REG-05, REG-06, WKD-01, WKD-02, WKD-03, WKD-04, WKD-05, APR-01, APR-02, APR-03
**Success Criteria** (what must be TRUE):
  1. Calling `ContractNameRegistry.resolve(address, network)` returns a human-readable name with source attribution for any registered contract address
  2. EVM addresses resolve identically regardless of checksum/lowercase/uppercase input
  3. The same address on different networks resolves to the correct per-network name (no cross-chain misidentification)
  4. Unregistered addresses return a truncated fallback format (0xabcd...1234)
  5. All 20+ Action Providers have a displayName (explicit or auto-converted from snake_case) that the registry can consume
**Plans**: 2 plans

Plans:
- [ ] 421-01-PLAN.md — Well-known contract data (300+ entries) + ActionProviderMetadata displayName + provider updates
- [ ] 421-02-PLAN.md — ContractNameRegistry 4-tier resolution service (TDD)

### Phase 422: Notification Pipeline Integration
**Goal**: Owner receives human-readable contract names instead of raw hex addresses in all CONTRACT_CALL notification events
**Depends on**: Phase 421
**Requirements**: NTF-01, NTF-02, NTF-03, NTF-04, NTF-05, NTF-06
**Success Criteria** (what must be TRUE):
  1. TX_REQUESTED, TX_APPROVAL_REQUIRED, TX_SUBMITTED, and TX_CONFIRMED notifications for CONTRACT_CALL display "Protocol Name (0xabcd...1234)" format
  2. TRANSFER and TOKEN_TRANSFER notifications continue to show the raw `{to}` address without modification
  3. Notifications for unregistered contracts show the abbreviated address fallback (same as before this milestone)
**Plans**: 1 plan

Plans:
- [ ] 422-01-PLAN.md — Pipeline ContractNameRegistry wiring + notification {to} resolution + i18n template updates

### Phase 423: API + Admin UI Contract Names
**Goal**: Admin UI transaction views display resolved contract names sourced from the API response enrichment
**Depends on**: Phase 421, Phase 422
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04
**Success Criteria** (what must be TRUE):
  1. GET transaction detail API returns `contractName` and `contractNameSource` fields for CONTRACT_CALL transactions
  2. Admin UI transaction list shows the resolved contract name on CONTRACT_CALL rows
  3. Admin UI wallet detail Activity tab shows the resolved contract name on CONTRACT_CALL rows
**Plans**: TBD

Plans:
- [ ] 423-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 421 → 422 → 423

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
| 407. CAIP-2 Network Input | v31.16 | 1/1 | Complete | 2026-03-14 |
| 408. CAIP-19 Asset Input + Resolve | v31.16 | 2/2 | Complete | 2026-03-14 |
| 409. Response CAIP Enrichment + OpenAPI | v31.16 | 2/2 | Complete | 2026-03-14 |
| 410. SDK + MCP CAIP Extension | v31.16 | 2/2 | Complete | 2026-03-14 |
| 411. Skill Files Sync | v31.16 | 1/1 | Complete | 2026-03-14 |
| 412. Spec 추출 파이프라인 및 CI 게이트 | v31.17 | 2/2 | Complete | 2026-03-15 |
| 413. 타입 안전 클라이언트 및 첫 페이지 마이그레이션 | v31.17 | 2/2 | Complete | 2026-03-15 |
| 414. 인터페이스 점진적 마이그레이션 | v31.17 | 3/3 | Complete | 2026-03-14 |
| 415. 백엔드 API 확장 및 상수 통합 | v31.17 | 3/3 | Complete | 2026-03-14 |
| 416. Contract Test 및 검증 | v31.17 | 1/1 | Complete | 2026-03-15 |
| 417. 사이드바 섹션 + 리네이밍 + 라우트 정리 | v31.18 | 2/2 | Complete | 2026-03-15 |
| 418. 페이지 병합 + 레거시 정리 | v31.18 | 2/2 | Complete | 2026-03-15 |
| 419. Trading Settings 탭 제거 | v31.18 | 1/1 | Complete | 2026-03-15 |
| 420. 지갑 상세 탭 재구성 | v31.18 | 2/2 | Complete | 2026-03-15 |
| 421. Registry Core + Well-Known Data | v32.0 | 2/2 | Complete | 2026-03-15 |
| 422. Notification Pipeline Integration | v32.0 | 1/1 | Complete | 2026-03-15 |
| 423. API + Admin UI Contract Names | v32.0 | 0/1 | Not started | - |
