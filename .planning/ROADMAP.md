# Roadmap: WAIaaS v31.9 Polymarket 예측 시장 통합

## Overview

Polymarket 예측 시장을 WAIaaS에 통합한다. Off-chain CLOB 주문과 On-chain CTF 정산의 하이브리드 아키텍처를 Hyperliquid v31.4 패턴 기반으로 구현하며, 설계 리서치부터 Agent UAT까지 5개 페이즈로 전달한다. 29개 요구사항이 5개 페이즈에 매핑된다.

## Phases

**Phase Numbering:**
- Integer phases (370, 371, ...): Planned milestone work
- Decimal phases (371.1, 371.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 370: 설계 및 리서치** - Polymarket 심층 리서치 + EIP-712 서명 구조 설계 + 설계 문서 doc 80 작성
- [x] **Phase 371: CLOB 주문 구현** - API Key 생성, 주문 배치/취소, DB 마이그레이션, Neg Risk 라우팅 (completed 2026-03-10)
- [x] **Phase 372: 마켓 조회 + 포지션/정산** - Gamma API 마켓 탐색, 포지션 추적, CTF 온체인 리딤, PnL (completed 2026-03-11)
- [ ] **Phase 373: 인터페이스 통합** - Admin Settings/UI, MCP 도구, SDK, 정책 엔진, Skill 파일
- [ ] **Phase 374: 테스트 + 검증** - E2E 스모크 시나리오, Agent UAT 시나리오

## Phase Details

### Phase 370: 설계 및 리서치
**Goal**: Polymarket CLOB/CTF 아키텍처를 완전히 이해하고, EIP-712 3개 도메인 서명 구조를 설계하며, 구현 가이드 역할의 설계 문서를 완성한다
**Depends on**: Nothing (first phase)
**Requirements**: DSGN-01, DSGN-02, DSGN-03, DSGN-04
**Success Criteria** (what must be TRUE):
  1. CLOB API, CTF 컨트랙트, Proxy Wallet, Neg Risk 동작 방식이 설계 문서에 정리되어 있다
  2. EIP-712 3개 도메인(ClobAuth, CTF Exchange, Neg Risk CTF Exchange)의 서명 구조가 명세되어 있다
  3. Hyperliquid EIP-712 패턴과의 공통/차이점이 분석되어 공유 추상화 범위가 결정되어 있다
  4. 설계 문서 doc 80이 작성되어 후속 페이즈의 구현 가이드로 사용 가능하다
**Plans:** 1/1 plans complete

Plans:
- [x] 370-01-PLAN.md — Polymarket 심층 리서치 + 설계 문서 doc 80 작성

### Phase 371: CLOB 주문 구현
**Goal**: 사용자가 Polymarket CLOB에서 API Key를 생성하고, 다양한 주문 유형으로 예측 시장 포지션을 매매할 수 있다
**Depends on**: Phase 370
**Requirements**: CLOB-01, CLOB-02, CLOB-03, CLOB-04, CLOB-05, CLOB-06, CLOB-07, CLOB-08, CLOB-09, CLOB-10, CLOB-11, INTG-06
**Success Criteria** (what must be TRUE):
  1. 사용자가 지갑별 Polymarket API Key를 생성하고 암호화 저장할 수 있다
  2. 사용자가 GTC/GTD/FOK/FAK 주문을 제출하고, 바이너리/Neg Risk 시장이 자동 라우팅된다
  3. 사용자가 활성 주문을 취소하고 주문 상태/이력을 조회할 수 있다
  4. 사용자가 오더북(bid/ask, spread, depth)을 조회할 수 있다
  5. USDC approve가 CTF Exchange + Neg Risk CTF Exchange 컨트랙트 대상으로 실행된다
**Plans:** 4/4 plans complete

Plans:
- [x] 371-01-PLAN.md — PolymarketSigner + ClobClient + RateLimiter + OrderBuilder 인프라
- [x] 371-02-PLAN.md — DB 마이그레이션 v53-v54 (polymarket_orders, polymarket_positions, polymarket_api_keys)
- [x] 371-03-PLAN.md — PolymarketOrderProvider (pm_buy/pm_sell/pm_cancel/pm_update) + ApiKeyService
- [x] 371-04-PLAN.md — USDC approve + Neg Risk 라우팅 + 오더북 조회 + 인프라 팩토리

### Phase 372: 마켓 조회 + 포지션/정산
**Goal**: 사용자가 Polymarket 마켓을 탐색/검색하고, 보유 포지션과 PnL을 확인하며, 해결된 마켓에서 CTF 토큰을 리딤할 수 있다
**Depends on**: Phase 371
**Requirements**: MRKT-01, MRKT-02, MRKT-03, SETL-01, SETL-02, SETL-03, SETL-04, SETL-05
**Success Criteria** (what must be TRUE):
  1. 사용자가 카테고리/상태/유동성 필터로 활성 마켓을 브라우징하고 키워드 검색할 수 있다
  2. 사용자가 마켓 상세 정보(설명, 아웃컴, 가격, 거래량, 해결 기한)를 확인할 수 있다
  3. 사용자가 보유 포지션(토큰, 평균 진입가, 현재 가치, PnL)을 조회할 수 있다
  4. 사용자가 해결된 마켓에서 승리 토큰을 온체인 CTF redeemPositions으로 리딤할 수 있다
  5. 마켓 해결 시 사용자에게 알림이 전송되고 자동 리딤 제안이 포함된다
**Plans:** 3/3 plans complete

Plans:
- [x] 372-01-PLAN.md — PolymarketGammaClient + MarketData (Gamma API 마켓/이벤트 조회, 30s TTL 캐시, neg_risk 플래그)
- [x] 372-02-PLAN.md — PolymarketCtfProvider (pm_redeem_positions, pm_split/merge, pm_approve_collateral/ctf)
- [x] 372-03-PLAN.md — PositionTracker + PnlCalculator + ResolutionMonitor + 인프라 팩토리 최종 결합

### Phase 373: 인터페이스 통합
**Goal**: Polymarket 기능이 Admin UI, MCP, SDK, 정책 엔진, connect-info를 통해 완전히 접근 가능하다
**Depends on**: Phase 372
**Requirements**: INTG-01, INTG-02, INTG-03, INTG-04, INTG-05, INTG-07, INTG-10
**Success Criteria** (what must be TRUE):
  1. Admin Settings에서 Polymarket 관련 설정을 구성할 수 있고, Admin UI에 예측 시장 탭이 표시된다
  2. MCP 도구로 주문/마켓/포지션/리딤 등 전체 Polymarket 워크플로우를 실행할 수 있다
  3. TypeScript/Python SDK에서 Polymarket 메서드를 호출할 수 있다
  4. 정책 엔진이 Polymarket 거래에 지출 한도와 Polygon 네트워크 검증을 적용한다
  5. connect-info에 polymarket capability가 포함되어 에이전트 자기 발견이 가능하다
**Plans**: TBD

Plans:
- [ ] 373-01: Admin Settings + REST API 쿼리 라우트
- [ ] 373-02: MCP 도구 등록 + SDK PolymarketClient 메서드
- [ ] 373-03: Admin UI 예측 시장 탭 (포지션/마켓/주문/설정)
- [ ] 373-04: 정책 엔진 연동 + connect-info + Skill 파일 업데이트

### Phase 374: 테스트 + 검증
**Goal**: Polymarket 통합이 E2E 스모크 테스트와 Agent UAT 시나리오로 검증된다
**Depends on**: Phase 373
**Requirements**: INTG-08, INTG-09
**Success Criteria** (what must be TRUE):
  1. 오프체인 CLOB 플로우 E2E 스모크 시나리오가 CI에 등록되어 통과한다
  2. Agent UAT 시나리오(6-section 포맷, DeFi 카테고리)가 작성되어 메인넷 검증 가능하다
**Plans**: TBD

Plans:
- [ ] 374-01: E2E 스모크 시나리오 (오프체인 CLOB mock 기반)
- [ ] 374-02: Agent UAT 시나리오 작성 (6-section 포맷)

## Progress

**Execution Order:**
Phases execute in numeric order: 370 → 371 → 372 → 373 → 374

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 370. 설계 및 리서치 | 1/1 | Complete    | 2026-03-10 |
| 371. CLOB 주문 구현 | 4/4 | Complete    | 2026-03-10 |
| 372. 마켓 조회 + 포지션/정산 | 3/3 | Complete    | 2026-03-11 |
| 373. 인터페이스 통합 | 0/4 | Not started | - |
| 374. 테스트 + 검증 | 0/2 | Not started | - |
