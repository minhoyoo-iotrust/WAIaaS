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
- ✅ **v1.1 ~ v31.17** — (103 milestones shipped)
- 🚧 **v31.18** — Admin UI IA 재구조화 (in progress)

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

### 🚧 v31.18 Admin UI IA 재구조화 (In Progress)

**Milestone Goal:** Admin UI 사이드바의 17개 플랫 메뉴를 5개 섹션 헤더로 그룹화하고, 페이지 병합/분리, 지갑 상세 8탭→4탭 재구성, 레거시 파일 정리를 통해 일관된 정보 구조(IA) 확보.

- [x] **Phase 417: 사이드바 섹션 + 리네이밍 + 라우트 정리** - 섹션 그룹 사이드바, 메뉴 리네이밍, 경로 리다이렉트, TabNav 통일 -- completed 2026-03-15
- [ ] **Phase 418: 페이지 병합 + 레거시 정리** - Tokens/RPC Proxy 탭 병합, 레거시 파일 제거
- [ ] **Phase 419: Trading Settings 탭 제거** - Hyperliquid/Polymarket Settings 탭 제거 및 Providers 이관
- [ ] **Phase 420: 지갑 상세 탭 재구성** - 8탭을 4탭(Overview/Activity/Assets/Setup)으로 통합

## Phase Details

### Phase 417: 사이드바 섹션 + 리네이밍 + 라우트 정리
**Goal**: 사용자가 섹션별로 그룹화된 사이드바로 Admin UI를 탐색하고, 변경된 경로로 접근해도 올바른 페이지로 도달한다
**Depends on**: Nothing (first phase)
**Requirements**: SIDE-01, SIDE-02, SIDE-03, SIDE-04, SIDE-05, SIDE-06, SIDE-07, SIDE-08, ROUT-01, ROUT-02, ROUT-03, ROUT-04, ROUT-05, ROUT-06, ROUT-07, TNAV-01, TNAV-02, TNAV-03, TNAV-04
**Success Criteria** (what must be TRUE):
  1. 사이드바에 Wallets/Trading/Security/Channels/System 5개 섹션 헤더가 보이고 각 섹션 아래에 관련 메뉴가 그룹화되어 있다
  2. Dashboard는 섹션 밖 최상단에 위치하고, DeFi/Security/System 메뉴가 각각 Providers/Protection/Settings로 표시된다
  3. 이전 경로(#/defi, #/security, #/system, #/tokens, #/rpc-proxy)로 접근하면 새 경로로 리다이렉트되고, 기존 리다이렉트(erc8004 등)도 유지된다
  4. Ctrl+K 검색에서 변경된 페이지명과 경로가 반영되어 검색 결과가 정확하다
  5. Hyperliquid/Polymarket 페이지가 TabNav 공통 컴포넌트를 사용하고, Transactions/Policies 탭 라벨이 History/Rules로 변경되어 있다
**Plans**: 2 plans

Plans:
- [x] 417-01-PLAN.md — NAV_SECTIONS 섹션 그룹 구조 전환 + 사이드바 렌더링 + 리네이밍 + 리다이렉트 + Ctrl+K 검색 반영
- [x] 417-02-PLAN.md — Hyperliquid/Polymarket TabNav 전환 + Transactions/Policies 탭 라벨 변경

### Phase 418: 페이지 병합 + 레거시 정리
**Goal**: 관련 기능이 하나의 페이지 내 탭으로 통합되고, 불필요한 레거시 파일이 제거된다
**Depends on**: Phase 417
**Requirements**: MERG-01, MERG-02, MERG-03, MERG-04, MERG-05, MERG-06, LGCY-01, LGCY-02, LGCY-03, LGCY-04
**Success Criteria** (what must be TRUE):
  1. Wallets 페이지에서 Wallets/Tokens/RPC Endpoints/WalletConnect 4개 탭을 전환할 수 있다
  2. Settings 페이지에서 General/API Keys/RPC Proxy 3개 탭을 전환할 수 있다
  3. tokens.tsx, rpc-proxy.tsx, walletconnect.tsx, telegram-users.tsx의 독립 페이지 default export가 제거되고 콘텐츠가 적절한 탭 컴포넌트로 이동되었다
  4. layout.tsx에서 삭제된 페이지의 import가 제거되고, skills/admin.skill.md가 새 메뉴 구조를 반영한다
**Plans**: TBD

Plans:
- [ ] 418-01: Tokens + WalletConnect를 Wallets 탭으로 병합
- [ ] 418-02: RPC Proxy를 Settings 탭으로 병합 + 레거시 파일 정리 + 스킬 파일 업데이트

### Phase 419: Trading Settings 탭 제거
**Goal**: Hyperliquid/Polymarket의 중복 Settings 탭이 제거되고 모든 설정이 Providers 페이지에서 관리된다
**Depends on**: Phase 417
**Requirements**: TRAD-01, TRAD-02, TRAD-03, TRAD-04, TRAD-05
**Success Criteria** (what must be TRUE):
  1. Hyperliquid 페이지에 Overview/Orders/Spot/Sub-accounts 4개 탭만 있고 Settings 탭이 없다
  2. Polymarket 페이지에 Overview/Markets/Orders/Positions 4개 탭만 있고 Settings 탭이 없다
  3. 두 페이지 상단에 "Configure in Trading > Providers" 링크가 있고 클릭 시 Providers 페이지로 이동한다
  4. Providers 페이지에 Hyperliquid/Polymarket 설정 항목이 모두 존재한다
**Plans**: TBD

Plans:
- [ ] 419-01: Hyperliquid/Polymarket Settings 탭 제거 + Providers 설정 이관 + 검증

### Phase 420: 지갑 상세 탭 재구성
**Goal**: 지갑 상세 페이지가 4개 탭(Overview/Activity/Assets/Setup)으로 재구성되어 관련 기능이 논리적으로 그룹화된다
**Depends on**: Phase 418
**Requirements**: DETL-01, DETL-02, DETL-03, DETL-04, DETL-05, DETL-06, DETL-07, DETL-08, DETL-09
**Success Criteria** (what must be TRUE):
  1. 지갑 상세 페이지에 Overview/Activity/Assets/Setup 4개 탭만 존재한다
  2. Overview 탭에서 Wallet Info 아래에 Owner Protection 카드가 보이고, Owner 미등록 시 경고+CTA, 등록 시 상태 요약+Manage 버튼이 표시된다
  3. Activity 탭에서 Transactions와 External Actions를 필터로 구분하여 볼 수 있다
  4. Assets 탭에서 Staking Positions와 NFT Gallery가 섹션별로 통합 표시된다
  5. Setup 탭에서 Credentials와 MCP Setup이 섹션별로 통합 표시된다
**Plans**: TBD

Plans:
- [ ] 420-01: DETAIL_TABS 재정의 + Overview 탭 Owner Protection 카드 통합
- [ ] 420-02: Activity/Assets/Setup 탭 콘텐츠 통합

## Progress

**Execution Order:**
Phases execute in numeric order: 417 -> 418 -> 419 -> 420

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
| 417. 사이드바 섹션 + 리네이밍 + 라우트 정리 | v31.18 | Complete    | 2026-03-15 | 2026-03-15 |
| 418. 페이지 병합 + 레거시 정리 | v31.18 | 0/2 | Not started | - |
| 419. Trading Settings 탭 제거 | v31.18 | 0/1 | Not started | - |
| 420. 지갑 상세 탭 재구성 | v31.18 | 0/2 | Not started | - |
