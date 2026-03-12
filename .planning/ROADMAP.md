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
- ✅ **v1.1 ~ v31.12** — (97 milestones shipped)
- 🚧 **v31.13** — DeFi 포지션 대시보드 완성 (Phases 393-397)

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

### 🚧 v31.13 DeFi 포지션 대시보드 완성 (In Progress)

**Milestone Goal:** 미구현 5개 DeFi 프로바이더의 getPositions() 구현 + Admin Dashboard UX 개선

- [ ] **Phase 393: Staking Positions (Lido + Jito)** - stETH/wstETH, jitoSOL 잔액 기반 STAKING 포지션 추적 구현
- [ ] **Phase 394: Lending Positions (Aave V3)** - Supply/Borrow 포지션 + Health Factor 추출 구현
- [ ] **Phase 395: Yield Positions (Pendle)** - PT/YT 잔액 기반 YIELD 포지션 + 만기 상태 구현
- [ ] **Phase 396: Perp/Spot Positions (Hyperliquid)** - Perp 오픈 포지션 + Spot 잔액 신규 구현
- [ ] **Phase 397: Admin Dashboard UX** - 카테고리 필터, 프로바이더 그룹핑, HF 경고, 지갑 필터

## Phase Details

### Phase 393: Staking Positions (Lido + Jito)
**Goal**: Lido stETH/wstETH와 Jito jitoSOL의 스테이킹 포지션이 PositionTracker를 통해 자동 추적된다
**Depends on**: Nothing (first phase)
**Requirements**: STAK-01, STAK-02, STAK-03, STAK-04, STAK-05, TEST-01 (staking), TEST-02 (staking)
**Success Criteria** (what must be TRUE):
  1. Lido 프로바이더가 stETH/wstETH 잔액을 STAKING 포지션으로 반환하며, wstETH는 stETH 환산 비율이 적용된 수량을 포함한다
  2. Jito 프로바이더가 jitoSOL 잔액을 STAKING 포지션으로 반환하며, SOL 환산 비율이 적용된 수량을 포함한다
  3. Lido/Jito 프로바이더가 daemon 부팅 시 duck-type 감지로 PositionTracker에 자동 등록된다
  4. 각 프로바이더의 getPositions() 단위 테스트와 PositionTracker 통합 테스트가 통과한다
**Plans**: 2 plans

Plans:
- [ ] 393-01: Lido IPositionProvider 구현 (stETH/wstETH 잔액 조회, wstETH 환산, CAIP-19 assetId, USD 환산)
- [ ] 393-02: Jito IPositionProvider 구현 (jitoSOL 잔액 조회, SOL 환산) + duck-type 자동 등록 + 테스트

### Phase 394: Lending Positions (Aave V3)
**Goal**: Aave V3의 Supply/Borrow 포지션과 Health Factor가 정확하게 추적된다
**Depends on**: Nothing (independent)
**Requirements**: LEND-01, LEND-02, LEND-03, LEND-04, TEST-01 (lending), TEST-02 (lending)
**Success Criteria** (what must be TRUE):
  1. Aave V3 프로바이더가 aToken 잔액 기반 Supply 포지션을 positionType SUPPLY로 반환하며 APY를 포함한다
  2. Aave V3 프로바이더가 debtToken 잔액 기반 Borrow 포지션을 positionType BORROW로 반환하며 interestRateMode를 포함한다
  3. getUserAccountData() 호출로 Health Factor가 계산되어 metadata.healthFactor에 포함된다
  4. Aave Oracle getAssetPrice()를 사용하여 USD 환산이 수행된다
**Plans**: TBD

Plans:
- [ ] 394-01: Aave V3 getPositions() 완성 (Supply/Borrow 추출, Health Factor, Oracle 가격) + 테스트

### Phase 395: Yield Positions (Pendle)
**Goal**: Pendle PT/YT 포지션이 만기 상태 포함하여 정확하게 추적된다
**Depends on**: Nothing (independent)
**Requirements**: YIELD-01, YIELD-02, YIELD-03, TEST-01 (yield), TEST-02 (yield)
**Success Criteria** (what must be TRUE):
  1. Pendle 프로바이더가 PT 잔액을 YIELD 포지션으로 반환하며 maturity, underlyingAsset, impliedApy를 포함한다
  2. Pendle 프로바이더가 YT 잔액을 YIELD 포지션으로 반환하며 maturity, underlyingAsset, impliedApy를 포함한다
  3. 만기일이 경과한 포지션은 status가 MATURED로 자동 전환된다
**Plans**: TBD

Plans:
- [ ] 395-01: Pendle getPositions() 완성 (PT/YT 잔액 조회, 만기 상태 전환, implied APY) + 테스트

### Phase 396: Perp/Spot Positions (Hyperliquid)
**Goal**: Hyperliquid Perp 오픈 포지션과 Spot 잔액이 신규 구현되어 추적된다
**Depends on**: Nothing (independent)
**Requirements**: PERP-01, PERP-02, PERP-03, PERP-04, TEST-01 (perp), TEST-02 (perp)
**Success Criteria** (what must be TRUE):
  1. HyperliquidPerpProvider가 Info API를 통해 오픈 포지션을 조회하고 market, side, entryPrice, markPrice, leverage, unrealizedPnl, liquidationPrice, marginUsed를 포함한 PERP 포지션을 반환한다
  2. HyperliquidSpotProvider가 spot 잔액을 포지션으로 반환한다
  3. Hyperliquid 프로바이더들이 duck-type 감지로 PositionTracker에 자동 등록된다
  4. 각 프로바이더의 getPositions() 단위 테스트와 PositionTracker 통합 테스트가 통과한다
**Plans**: TBD

Plans:
- [ ] 396-01: HyperliquidPerpProvider IPositionProvider 구현 (Info API 오픈 포지션 조회, metadata 매핑)
- [ ] 396-02: HyperliquidSpotProvider IPositionProvider 구현 + duck-type 자동 등록 + 테스트

### Phase 397: Admin Dashboard UX
**Goal**: Admin Dashboard에서 모든 DeFi 포지션을 카테고리별/프로바이더별로 직관적으로 조회하고, 위험 상태를 즉시 인지할 수 있다
**Depends on**: Phase 393, 394, 395, 396
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. Admin Dashboard에서 STAKING/LENDING/YIELD/PERP/ALL 카테고리 필터 탭으로 포지션을 필터링할 수 있다
  2. 같은 프로바이더의 포지션이 그룹으로 묶여 표시되며, 카테고리별 맞춤 상세 정보(STAKING: APR, LENDING: HF, YIELD: 만기, PERP: PnL)가 표시된다
  3. worst Health Factor가 임계값 미만일 때 대시보드 상단에 경고 배너가 표시된다
  4. 특정 지갑의 포지션만 필터링하여 조회할 수 있다
  5. 30초 주기 자동 새로고침이 동작한다
**Plans**: TBD

Plans:
- [ ] 397-01: 카테고리 필터 탭 + 지갑 필터 + 자동 새로고침 구현
- [ ] 397-02: 프로바이더 그룹핑 + 카테고리별 맞춤 상세 UI + HF 경고 배너 + Admin API/UI 테스트

## Progress

**Execution Order:** 393 → 394 → 395 → 396 → 397

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 386. 타입 시스템 + 에러 코드 + DB | v31.12 | 3/3 | Complete | 2026-03-11 |
| 387. Signer Capability 레지스트리 | v31.12 | 2/2 | Complete | 2026-03-11 |
| 388. Credential Vault | v31.12 | 2/2 | Complete | 2026-03-11 |
| 389. 추적 + 정책 확장 | v31.12 | 2/2 | Complete | 2026-03-11 |
| 390. 파이프라인 라우팅 + 조회 API | v31.12 | 2/2 | Complete | 2026-03-12 |
| 391. Admin UI | v31.12 | 2/2 | Complete | 2026-03-12 |
| 392. MCP + SDK + 스킬 파일 | v31.12 | 2/2 | Complete | 2026-03-12 |
| 393. Staking Positions (Lido + Jito) | v31.13 | 0/2 | Not started | - |
| 394. Lending Positions (Aave V3) | v31.13 | 0/1 | Not started | - |
| 395. Yield Positions (Pendle) | v31.13 | 0/1 | Not started | - |
| 396. Perp/Spot Positions (Hyperliquid) | v31.13 | 0/2 | Not started | - |
| 397. Admin Dashboard UX | v31.13 | 0/2 | Not started | - |
