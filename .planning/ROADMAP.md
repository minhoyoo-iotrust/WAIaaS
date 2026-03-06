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
- [ ] **v31.3 DCent Swap Aggregator 통합** -- Phases 342-346 (in progress)

## Phases

### v31.3 DCent Swap Aggregator 통합 (In Progress)

**Milestone Goal:** DCent Swap Backend API를 WAIaaS에 통합하여 다중 프로바이더 스왑(동일체인 DEX + 크로스체인 Exchange)을 지원한다.

- [x] **Phase 342: Research & Design** - DCent API 리서치 + 통합 설계 문서 작성 (completed 2026-03-06)
- [x] **Phase 343: Currency Mapping + DEX Swap** - CAIP-19 변환 인프라 + DEX Swap 실행 (completed 2026-03-06)
- [ ] **Phase 344: Exchange + Status Tracking** - 크로스체인 Exchange 실행 + 상태 폴링
- [ ] **Phase 345: Auto Routing** - 조건부 2-hop 자동 라우팅
- [ ] **Phase 346: Integration + Testing** - ActionProvider, MCP, SDK, 정책, 테스트

## Phase Details

### Phase 342: Research & Design
**Goal**: DCent Swap API의 동작 방식을 이해하고, WAIaaS 파이프라인 매핑 전략과 통합 설계를 완성한다
**Depends on**: Nothing (first phase)
**Requirements**: RSRCH-01, RSRCH-02, RSRCH-03, RSRCH-04, RSRCH-05, RSRCH-06
**Success Criteria** (what must be TRUE):
  1. DCent Swap API 7개 엔드포인트의 요청/응답 구조가 문서화되어 있다
  2. CAIP-19 <-> DCent Currency ID 양방향 변환 매핑 전략이 확정되어 있다
  3. DEX Swap(txdata) -> CONTRACT_CALL+BATCH, Exchange(payInAddress) -> TRANSFER 파이프라인 매핑이 설계되어 있다
  4. DCent API의 multi-hop 자체 지원 여부가 확인되어 Phase 345 범위가 확정되어 있다
  5. DcentSwapActionProvider 인터페이스와 MCP/SDK/정책 통합 설계가 완성되어 있다
**Plans:** 1/1 plans complete

Plans:
- [ ] 342-01-PLAN.md -- DCent Swap API 심층 리서치 + 통합 설계 문서 작성

### Phase 343: Currency Mapping + DEX Swap
**Goal**: CAIP-19 <-> DCent Currency ID 양방향 변환이 동작하고, DEX Swap을 approve+txdata BATCH 파이프라인으로 실행할 수 있다
**Depends on**: Phase 342
**Requirements**: CMAP-01, CMAP-02, CMAP-03, CMAP-04, DSWP-01, DSWP-02, DSWP-03, DSWP-04
**Success Criteria** (what must be TRUE):
  1. CAIP-19 자산 식별자를 DCent Currency ID로 변환하고 역방향 변환도 가능하다 (네이티브 토큰 포함)
  2. DCent get_supported_currencies 응답이 24h TTL로 캐싱되어 반복 호출을 최소화한다
  3. 사용자가 DEX Swap 견적을 요청하면 프로바이더별 비교와 최적 추천을 받을 수 있다
  4. 사용자가 DEX Swap을 실행하면 approve+txdata가 BATCH 파이프라인으로 처리되고, min/max 한도가 검증된다
**Plans:** 2/2 plans complete

Plans:
- [ ] 343-01-PLAN.md -- CAIP-19 <-> DCent Currency ID 양방향 변환 구현 + 캐싱
- [ ] 343-02-PLAN.md -- DEX Swap 견적 조회 + 실행 (approve+txdata BATCH)

### Phase 344: Exchange + Status Tracking
**Goal**: 크로스체인 Exchange를 payInAddress TRANSFER 파이프라인으로 실행하고, 상태를 폴링하여 완료/실패를 알린다
**Depends on**: Phase 343
**Requirements**: XCHG-01, XCHG-02, XCHG-03, XCHG-04
**Success Criteria** (what must be TRUE):
  1. 사용자가 크로스체인 Exchange 견적을 요청하면 가용 프로바이더별 비교를 받을 수 있다
  2. 사용자가 Exchange를 실행하면 create_exchange_transaction -> payInAddress TRANSFER 파이프라인으로 처리된다
  3. Exchange 트랜잭션 상태가 get_transactions_status 폴링으로 추적되어 진행 상황을 확인할 수 있다
  4. Exchange 완료 또는 실패 시 알림 채널을 통해 사용자에게 통지된다
**Plans**: TBD

Plans:
- [ ] 344-01: Exchange 견적 조회 + 실행 (payInAddress TRANSFER)
- [ ] 344-02: Exchange 상태 폴링 + 알림 연동

### Phase 345: Auto Routing
**Goal**: 직접 경로가 없는 토큰 페어에 대해 2-hop 자동 라우팅으로 스왑을 완료할 수 있다
**Depends on**: Phase 344
**Requirements**: ROUT-01, ROUT-02, ROUT-03, ROUT-04, ROUT-05
**Success Criteria** (what must be TRUE):
  1. 직접 경로가 없는 페어에 대해 중간 토큰(ETH, USDC, USDT 등) 경유 2-hop 경로가 탐색된다
  2. 2-hop 경로의 총 비용(수수료+슬리피지 누적)이 사전에 계산되어 사용자에게 표시된다
  3. 2-hop 경로가 BATCH 파이프라인으로 순차 실행되며, 부분 실패 시 중간 토큰 잔액이 안내된다
  4. 사용자에게 2-hop 경로임이 명시되어 수수료 투명성이 보장된다
**Plans**: TBD

Plans:
- [ ] 345-01: 중간 토큰 후보 선정 + 2-hop 경로 탐색/비용 계산
- [ ] 345-02: 2-hop 경로 BATCH 실행 + 부분 실패 처리

### Phase 346: Integration + Testing
**Goal**: DcentSwapActionProvider가 MCP/SDK/정책/Admin Settings/connect-info/스킬 파일과 완전히 통합되고, 전 기능이 테스트로 검증된다
**Depends on**: Phase 345
**Requirements**: INTG-01, INTG-02, INTG-03, INTG-04, INTG-05, INTG-06, INTG-07, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07
**Success Criteria** (what must be TRUE):
  1. DcentSwapActionProvider가 IActionProvider 패턴으로 구현되어 4개 MCP 도구와 4개 SDK 메서드가 동작한다
  2. 스왑/Exchange 실행이 정책 엔진(스왑 한도, CONTRACT_WHITELIST, ALLOWED_TOKENS)을 통과한다
  3. Admin Settings에서 dcent_swap 설정을 관리하고, connect-info에 dcent_swap capability가 노출된다
  4. Currency 변환, DEX Swap, Exchange, 라우팅, 에러, 정책, MCP/SDK 전 영역의 테스트가 통과한다
  5. transactions.skill.md 등 스킬 파일이 DCent Swap 기능을 반영하여 업데이트되어 있다
**Plans**: TBD

Plans:
- [ ] 346-01: DcentSwapActionProvider + MCP 도구 + SDK 메서드 구현
- [ ] 346-02: 정책 엔진 통합 + Admin Settings + connect-info + 스킬 파일
- [ ] 346-03: 전 영역 테스트 작성 (단위 + 통합)

## Progress

**Execution Order:** 342 -> 343 -> 344 -> 345 -> 346

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 342. Research & Design | 1/1 | Complete    | 2026-03-06 | - |
| 343. Currency Mapping + DEX Swap | 2/2 | Complete    | 2026-03-06 | - |
| 344. Exchange + Status Tracking | v31.3 | 0/2 | Not started | - |
| 345. Auto Routing | v31.3 | 0/2 | Not started | - |
| 346. Integration + Testing | v31.3 | 0/3 | Not started | - |
