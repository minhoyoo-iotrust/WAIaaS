# Roadmap: WAIaaS v31.8 Agent UAT (메인넷 인터랙티브 검증)

## Overview

AI 에이전트가 마크다운 시나리오를 읽고 사용자와 인터랙티브하게 메인넷/테스트넷에서 실제 기능을 검증하는 Agent UAT 체계를 구축한다. 시나리오 포맷 정의 + skill 파일부터 시작하여, testnet/mainnet 전송, DeFi 프로토콜, 고급/관리자 기능 시나리오를 순차적으로 작성하고, CI 강제 검증으로 시나리오 누락을 방지한다.

## Phases

**Phase Numbering:**
- Integer phases (365, 366, ...): Planned milestone work
- Decimal phases (365.1, 365.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 365: Agent UAT 시나리오 포맷 및 인프라** - 마크다운 시나리오 포맷 정의, skill 파일, 인덱스, 지갑 선택/dry-run/리포트 인프라
- [x] **Phase 366: Testnet + 기본 전송 시나리오** - Testnet 7개 + Mainnet 기본 전송 6개 시나리오 작성
- [x] **Phase 367: DeFi 프로토콜 시나리오** - 12개 DeFi 프로토콜(Jupiter, 0x, LI.FI, Across, Lido, Jito, Aave, Kamino, Pendle, Drift, Hyperliquid, DCent) 시나리오 작성 (completed 2026-03-09)
- [ ] **Phase 368: 고급 기능 + 관리자 기능 시나리오** - Smart Account, WalletConnect, x402, 수신 TX, 가스 조건부 + Admin UI 검증 13개 시나리오
- [ ] **Phase 369: CI 시나리오 등록 강제** - Provider/시나리오 매핑 검증, 파일 유효성, 인덱스 등록, Admin 라우트 일관성, CI workflow 통합

## Phase Details

### Phase 365: Agent UAT 시나리오 포맷 및 인프라
**Goal**: 에이전트가 시나리오 마크다운을 읽고 인터랙티브하게 실행할 수 있는 기반 구조가 완성된다
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07
**Success Criteria** (what must be TRUE):
  1. 시나리오 마크다운 파일이 표준 섹션(메타데이터, 사전 조건, 시나리오 단계, 검증 항목, 예상 비용, 실패 시 조치)을 갖추고 있어 에이전트가 파싱할 수 있다
  2. `/agent-uat` 커맨드로 skill 파일이 트리거되고, help/run/run testnet/run mainnet/run defi/run admin/run transfer/run --network 서브커맨드가 동작한다
  3. `_index.md`에서 전체 시나리오를 카테고리별/네트워크별로 조회할 수 있다
  4. 에이전트가 세션 지갑 목록에서 네트워크별 지갑을 자동 선택하고, dry-run으로 예상 가스비를 표시한 후, 실행 완료 시 요약 리포트를 출력한다
  5. 지갑 CRUD 검증 시나리오가 생성->테스트->삭제를 원자적으로 묶어 기존 지갑을 오염시키지 않는다
**Plans**: 2 plans

Plans:
- [x] 365-01-PLAN.md -- 시나리오 마크다운 포맷 정의 + 템플릿 + 인덱스 + 지갑 CRUD 시나리오
- [x] 365-02-PLAN.md -- skill 파일 + 인프라 지침 (서브커맨드, 지갑 선택, dry-run, 리포트)

### Phase 366: Testnet + 기본 전송 시나리오
**Goal**: Testnet과 Mainnet 기본 전송 시나리오가 완비되어 에이전트가 인터랙티브하게 전송 기능을 검증할 수 있다
**Depends on**: Phase 365
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07, XFER-01, XFER-02, XFER-03, XFER-04, XFER-05, XFER-06
**Success Criteria** (what must be TRUE):
  1. Sepolia ETH/ERC-20 전송과 Devnet SOL/SPL 전송 시나리오를 에이전트가 읽고 자기 전송 후 잔액을 확인할 수 있다
  2. Testnet Hyperliquid Spot/Perp 주문 생성/취소 시나리오와 NFT 전송(ERC-721/1155) 시나리오가 실행 가능하다
  3. 수신 트랜잭션 감지 시나리오(Sepolia/Devnet)에서 외부 전송 후 IncomingTxMonitor 감지를 확인할 수 있다
  4. Mainnet ETH/SOL/ERC-20(USDC)/SPL(USDC)/L2 네이티브/NFT 전송 시나리오가 자기 전송 패턴으로 작성되어 있다
  5. 모든 시나리오가 표준 포맷을 따르고 `_index.md`에 등록되어 있다
**Plans**: 2 plans

Plans:
- [x] 366-01-PLAN.md -- Testnet 시나리오 7개 작성 (ETH/SOL/ERC-20/SPL/Hyperliquid/NFT/수신TX)
- [x] 366-02-PLAN.md -- Mainnet 기본 전송 시나리오 6개 작성 (ETH/SOL/ERC-20/SPL/L2/NFT) + _index.md 업데이트

### Phase 367: DeFi 프로토콜 시나리오
**Goal**: 12개 DeFi 프로토콜 시나리오가 완비되어 에이전트가 각 프로토콜의 핵심 기능을 인터랙티브하게 검증할 수 있다
**Depends on**: Phase 366
**Requirements**: DEFI-01, DEFI-02, DEFI-03, DEFI-04, DEFI-05, DEFI-06, DEFI-07, DEFI-08, DEFI-09, DEFI-10, DEFI-11, DEFI-12
**Success Criteria** (what must be TRUE):
  1. Solana DeFi 시나리오(Jupiter Swap, Jito Staking, Kamino Lending, Drift Perp)에서 에이전트가 swap/stake/supply/deposit 후 결과를 확인할 수 있다
  2. EVM DeFi 시나리오(0x Swap, Lido Staking, Aave V3 Lending, Pendle Yield, DCent Swap)에서 에이전트가 swap/stake/supply/trade 후 결과를 확인할 수 있다
  3. 크로스체인 브릿지 시나리오(LI.FI L1->L2, Across L2->L2)에서 에이전트가 브릿지 전송 후 상태를 추적할 수 있다
  4. Hyperliquid Perp/Spot 시나리오에서 에이전트가 주문 생성/취소 후 포지션을 확인할 수 있다
**Plans**: 3 plans

Plans:
- [ ] 367-01-PLAN.md -- Solana DeFi 시나리오 4개 (Jupiter, Jito, Kamino, Drift)
- [ ] 367-02-PLAN.md -- EVM DeFi 시나리오 5개 (0x, Lido, Aave, Pendle, DCent)
- [ ] 367-03-PLAN.md -- 크로스체인 + Hyperliquid 시나리오 3개 (LI.FI, Across, Hyperliquid) + _index.md 업데이트

### Phase 368: 고급 기능 + 관리자 기능 시나리오
**Goal**: Smart Account/WalletConnect/x402 등 고급 기능과 Admin UI 전체 검증 시나리오가 완비되어 에이전트가 전 기능을 인터랙티브하게 검증할 수 있다
**Depends on**: Phase 367
**Requirements**: ADV-01, ADV-02, ADV-03, ADV-04, ADV-05, ADV-06, ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-06, ADMIN-07, ADMIN-08, ADMIN-09, ADMIN-10, ADMIN-11, ADMIN-12, ADMIN-13
**Success Criteria** (what must be TRUE):
  1. Smart Account UserOp Build/Sign, WalletConnect Owner 승인, x402 결제, 수신 TX 감지(mainnet), 잔액 모니터링, 가스 조건부 실행 시나리오가 각각 독립적으로 실행 가능하다
  2. Admin UI 전체 페이지 접근(HTTP 200), 마스터 패스워드 인증, Dashboard 정확성, Settings 반영, 정책 관리 플로우가 시나리오로 검증 가능하다
  3. Admin UI 지갑 잔액/NFT/DeFi 포지션 표시가 온체인 실제 데이터와 일치하는지 확인하는 시나리오가 있다
  4. 알림 설정+수신, 감사 로그 정확성, 백업/복원, 토큰 레지스트리, 통계/모니터링 검증 시나리오가 있다
**Plans**: TBD

Plans:
- [ ] 368-01: 고급 기능 시나리오 6개 (Smart Account, WalletConnect, x402, 수신TX, 잔액 모니터링, 가스 조건부)
- [ ] 368-02: Admin UI 검증 시나리오 전반부 (페이지 접근, 인증, Dashboard, Settings, 정책, 지갑)
- [ ] 368-03: Admin UI 검증 시나리오 후반부 (NFT, DeFi, 알림, 감사로그, 백업, 토큰, 통계)

### Phase 369: CI 시나리오 등록 강제
**Goal**: CI에서 시나리오 누락/무효/미등록/Admin 라우트 불일치를 자동 감지하여 PR 시 차단한다
**Depends on**: Phase 368
**Requirements**: CI-01, CI-02, CI-03, CI-04, CI-05
**Success Criteria** (what must be TRUE):
  1. Action Provider 디렉토리가 존재하면 대응하는 Agent UAT 시나리오 .md 파일이 반드시 존재하며, 없으면 CI가 실패한다
  2. 시나리오 파일이 필수 섹션(메타데이터, 사전 조건, 시나리오, 검증 항목)을 갖추지 않으면 CI가 실패한다
  3. `_index.md`에 등록되지 않은 고아 시나리오가 있으면 CI가 실패한다
  4. Admin UI 메뉴 항목과 라우트 정의가 불일치하면 CI가 실패한다
**Plans**: TBD

Plans:
- [ ] 369-01: 검증 스크립트 4개 (Provider 매핑, 파일 유효성, 인덱스 등록, Admin 라우트)
- [ ] 369-02: CI workflow 통합 + 전체 검증

## Progress

**Execution Order:**
Phases execute in numeric order: 365 -> 366 -> 367 -> 368 -> 369

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 365. Agent UAT 시나리오 포맷 및 인프라 | 2/2 | Complete    | 2026-03-09 |
| 366. Testnet + 기본 전송 시나리오 | 2/2 | Complete    | 2026-03-09 |
| 367. DeFi 프로토콜 시나리오 | 3/3 | Complete    | 2026-03-09 |
| 368. 고급 기능 + 관리자 기능 시나리오 | 0/3 | Not started | - |
| 369. CI 시나리오 등록 강제 | 0/2 | Not started | - |
