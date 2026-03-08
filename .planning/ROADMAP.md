# Roadmap: WAIaaS

## Milestones

- ✅ **v0.1-v2.0** -- Phases 1-173 (shipped 2026-02-05 ~ 2026-02-18) -- See milestones/ archive
- ✅ **v2.2 테스트 커버리지 강화** -- Phases 178-181 (shipped 2026-02-18)
- ✅ **v2.3 Admin UI 기능별 메뉴 재구성** -- Phases 182-187 (shipped 2026-02-18)
- ✅ **v2.4 npm Trusted Publishing 전환** -- Phases 188-190 (shipped 2026-02-19)
- ✅ **v2.4.1 Admin UI 테스트 커버리지 복원** -- Phases 191-193 (shipped 2026-02-19)
- ✅ **v2.5 DX 품질 개선** -- Phases 194-197 (shipped 2026-02-19)
- ✅ **v2.6 Wallet SDK 설계** -- Phases 198-201 (shipped 2026-02-20)
- ✅ **v2.6.1 WAIaaS Wallet Signing SDK** -- Phases 202-205 (shipped 2026-02-20)
- ✅ **v2.7 지갑 앱 알림 채널** -- Phase 206 (shipped 2026-02-20)
- ✅ **v26.3 Push Relay Server** -- Phases 207-209 (shipped 2026-02-20)
- ✅ **v26.4 멀티 지갑 세션 + 에이전트 자기 발견** -- Phases 210-214 (shipped 2026-02-21)
- ✅ **v27.0 수신 트랜잭션 모니터링 설계** -- Phases 215-223 (shipped 2026-02-21)
- ✅ **v27.1 수신 트랜잭션 모니터링 구현** -- Phases 224-230 (shipped 2026-02-22)
- ✅ **v27.2 CAIP-19 자산 식별 표준** -- Phases 231-234 (shipped 2026-02-22)
- ✅ **v27.3 토큰별 지출 한도 정책** -- Phases 235-238 (shipped 2026-02-22)
- ✅ **v27.4 Admin UI UX 개선** -- Phases 239-243 (shipped 2026-02-23)
- ✅ **v28.0 기본 DeFi 프로토콜 설계** -- Phases 244-245 (shipped 2026-02-23)
- ✅ **v28.1 Jupiter Swap** -- Phases 246-247 (shipped 2026-02-23)
- ✅ **v28.2 0x EVM DEX Swap** -- Phases 248-250 (shipped 2026-02-24)
- ✅ **v28.3 LI.FI 크로스체인 브릿지** -- Phases 251-253 (shipped 2026-02-24)
- ✅ **v28.4 Liquid Staking (Lido + Jito)** -- Phases 254-257 (shipped 2026-02-24)
- ✅ **v28.5 가스비 조건부 실행** -- Phases 258-259 (shipped 2026-02-25)
- ✅ **v28.6 RPC Pool 멀티엔드포인트 로테이션** -- Phases 260-264 (shipped 2026-02-25)
- ✅ **v28.8 빌트인 지갑 프리셋 자동 설정** -- Phases 265-267 (shipped 2026-02-26)
- ✅ **v29.0 고급 DeFi 프로토콜 설계** -- Phases 268-273 (shipped 2026-02-26)
- ✅ **v29.2 EVM Lending -- Aave V3** -- Phases 274-278 (shipped 2026-02-27)
- ✅ **v29.3 기본 지갑/기본 네트워크 개념 제거** -- Phases 279-282 (shipped 2026-02-27)
- ✅ **v29.4 Solana Lending (Kamino)** -- Phases 283-284 (shipped 2026-02-28)
- ✅ **v29.5 내부 일관성 정리** -- Phases 285-287 (shipped 2026-02-28)
- ✅ **v29.6 Pendle Yield Trading + Yield 프레임워크** -- Phases 288-290 (shipped 2026-03-01)
- ✅ **v29.7 D'CENT 직접 서명 + Human Wallet Apps 통합** -- Phases 291-296 (shipped 2026-03-01)
- ✅ **v29.8 Solana Perp DEX (Drift) + Perp 프레임워크** -- Phases 297-299 (shipped 2026-03-02)
- ✅ **v29.9 세션 점진적 보안 모델** -- Phases 300-301 (shipped 2026-03-02)
- ✅ **v29.10 ntfy 토픽 지갑별 설정 전환** -- Phases 302-303 (shipped 2026-03-02)
- ✅ **v30.0 운영 기능 확장 설계** -- Phases 304-308 (shipped 2026-03-03)
- ✅ **v30.2 운영 기능 확장 구현** -- Phases 309-313.1 (shipped 2026-03-04)
- ✅ **v30.6 ERC-4337 Account Abstraction 지원** -- Phases 314-316 (shipped 2026-03-04)
- ✅ **v30.8 ERC-8004 Trustless Agents 지원** -- Phases 317-323 (shipped 2026-03-04)
- ✅ **v30.9 Smart Account DX 개선** -- Phases 324-326 (shipped 2026-03-05)
- ✅ **v30.10 ERC-8128 Signed HTTP Requests** -- Phases 327-329 (shipped 2026-03-05)
- ✅ **v30.11 Admin UI DX 개선** -- Phases 330-332 (shipped 2026-03-05)
- ✅ **v31.0 NFT 지원 (EVM + Solana)** -- Phases 333-337 (shipped 2026-03-06)
- ✅ **v31.2 UserOp Build/Sign API** -- Phases 338-341 (shipped 2026-03-06)
- ✅ **v31.3 DCent Swap Aggregator 통합** -- Phases 342-346 (shipped 2026-03-07)

## Phases

### v31.4 Hyperliquid 생태계 통합

**Milestone Goal:** HyperEVM 체인 지원과 Hyperliquid L1 DEX(Perp/Spot) 거래, Sub-account를 통합하여 WAIaaS에서 Hyperliquid 생태계를 활용할 수 있도록 한다. L1 DEX는 온체인 TX가 아닌 EIP-712 서명 + REST API 방식이므로 ApiDirectResult 패턴으로 기존 파이프라인과 통합한다.

- [ ] **Phase 347: HyperEVM 체인 등록** - HyperEVM Mainnet/Testnet을 EVM_CHAIN_MAP에 추가하여 기존 EVM 기능 즉시 동작
- [ ] **Phase 348: Hyperliquid DEX 설계 문서** - L1 DEX API 통합 아키텍처, EIP-712 서명, Sub-account, 정책 적용 방안 확정
- [ ] **Phase 349: Core Infrastructure + Perp Trading** - 공유 인프라(ExchangeClient/Signer/MarketData) + Perp 거래 + Account State + 정책 + 전 인터페이스
- [ ] **Phase 350: Spot Trading** - Spot Market/Limit 주문, 잔액/마켓 조회, MCP/SDK 통합
- [ ] **Phase 351: Sub-account 관리** - Sub-account 생성/자금이동/포지션 조회, MCP/SDK 통합

## Phase Details

### Phase 347: HyperEVM 체인 등록
**Goal**: 기존 EVM 지갑이 HyperEVM 네트워크에서 즉시 동작한다
**Depends on**: Nothing (first phase)
**Requirements**: HCHAIN-01, HCHAIN-02, HCHAIN-03
**Success Criteria** (what must be TRUE):
  1. User가 HyperEVM Mainnet (Chain ID 999) 네트워크에서 EVM 지갑을 사용하여 ETH 전송/토큰 전송/컨트랙트 호출을 할 수 있다
  2. User가 HyperEVM Testnet (Chain ID 998) 네트워크에서 EVM 지갑을 사용하여 동일한 기능이 동작한다
  3. HyperEVM이 ALLOWED_NETWORKS 정책과 connect-info 네트워크 목록에 표시된다
**Plans:** 1 plan
Plans:
- [ ] 347-01-PLAN.md — HyperEVM Mainnet/Testnet 체인 등록 + 테스트

### Phase 348: Hyperliquid DEX 설계 문서
**Goal**: Hyperliquid L1 DEX 통합의 아키텍처 결정이 모두 확정되어 구현 Phase에서 설계 모호성이 없다
**Depends on**: Phase 347
**Requirements**: HDESIGN-01, HDESIGN-02, HDESIGN-03, HDESIGN-04, HDESIGN-05, HDESIGN-06, HDESIGN-07
**Success Criteria** (what must be TRUE):
  1. ApiDirectResult 패턴과 Stage 5 분기 설계가 확정되어 기존 파이프라인 영향 범위가 명확하다
  2. EIP-712 두 서명 스키마(phantom agent L1 Action vs user-signed HyperliquidSignTransaction)의 domain/types/필드 순서가 상세히 문서화되어 있다
  3. Sub-account-to-wallet 매핑 모델과 정책 엔진 적용 규칙(notional vs margin 기준)이 확정되어 있다
  4. DB 스키마 변경, MCP/SDK/Admin UI 인터페이스 설계가 확정되어 있다
**Plans**: TBD

### Phase 349: Core Infrastructure + Perp Trading
**Goal**: User가 WAIaaS를 통해 Hyperliquid에서 Perp 거래를 완전히 수행할 수 있고, 기존 정책 엔진이 적용된다
**Depends on**: Phase 348
**Requirements**: HPERP-01, HPERP-02, HPERP-03, HPERP-04, HPERP-05, HPERP-06, HPERP-07, HPERP-08, HPERP-09, HPERP-10, HPERP-11, HPERP-12, HPERP-13, HPERP-14, HACCT-01, HACCT-02, HACCT-03, HACCT-04, HPOL-01, HPOL-02, HINT-01, HINT-02, HINT-03
**Success Criteria** (what must be TRUE):
  1. User가 MCP/SDK를 통해 Hyperliquid Perp Market/Limit/Stop-Loss/Take-Profit 주문을 생성하고 취소할 수 있다
  2. User가 포지션(PnL/레버리지/마진/청산가), 오픈 주문, 거래 이력, 펀딩 레이트, 마켓 목록을 조회할 수 있다
  3. User가 Cross/Isolated 마진 모드와 레버리지 배율을 설정할 수 있다
  4. Perp/Spot 거래에 기존 지출 한도 정책이 적용되고, Admin Settings에 Hyperliquid 설정이 존재하며, connect-info에 hyperliquid capability가 포함되고, Skill 파일이 업데이트되어 있다
  5. Admin UI에서 Hyperliquid 포지션과 주문 현황을 확인할 수 있다
**Plans**: TBD

### Phase 350: Spot Trading
**Goal**: User가 WAIaaS를 통해 Hyperliquid Spot 거래를 수행할 수 있다
**Depends on**: Phase 349
**Requirements**: HSPOT-01, HSPOT-02, HSPOT-03, HSPOT-04, HSPOT-05, HSPOT-06, HSPOT-07
**Success Criteria** (what must be TRUE):
  1. User가 Hyperliquid Spot Market/Limit 주문을 생성하고 취소할 수 있다
  2. User가 Spot 계정 토큰 잔액과 Spot 마켓 정보(페어/가격/거래량)를 조회할 수 있다
  3. Spot 기능이 MCP 도구 + SDK 메서드로 노출되고, HyperliquidSpotActionProvider가 IActionProvider로 등록된다
**Plans**: TBD

### Phase 351: Sub-account 관리
**Goal**: User가 Hyperliquid Sub-account를 통해 전략별 자금을 격리하고 관리할 수 있다
**Depends on**: Phase 349
**Requirements**: HSUB-01, HSUB-02, HSUB-03, HSUB-04
**Success Criteria** (what must be TRUE):
  1. User가 Hyperliquid Sub-account를 생성하고 목록을 조회할 수 있다
  2. User가 Master와 Sub-account 간 자금(USDC/토큰)을 이동할 수 있다
  3. User가 Sub-account별 포지션과 잔액을 조회할 수 있고, 해당 기능이 MCP 도구 + SDK 메서드로 노출된다
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 347 -> 348 -> 349 -> 350 -> 351
Note: Phase 350과 351은 Phase 349에만 의존하므로 병렬 실행 가능

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 347. HyperEVM 체인 등록 | 0/1 | Not started | - |
| 348. Hyperliquid DEX 설계 문서 | 0/TBD | Not started | - |
| 349. Core Infrastructure + Perp Trading | 0/TBD | Not started | - |
| 350. Spot Trading | 0/TBD | Not started | - |
| 351. Sub-account 관리 | 0/TBD | Not started | - |
