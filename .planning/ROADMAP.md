# Roadmap: WAIaaS

## Milestones

- ✅ **v0.1-v2.0** -- Phases 1-173 (shipped 2026-02-05 ~ 2026-02-18) -- See milestones/ archive
- ✅ **v2.2-v31.6** -- Phases 178-356 (shipped 2026-02-18 ~ 2026-03-09) -- See milestones/ archive
- [ ] **v31.7 E2E 자동 검증 체계** -- Phases 357-364 (in progress)

## Phases

- [x] **Phase 357: E2E 테스트 인프라 및 공통 유틸리티** - 독립 패키지, 데몬/Push Relay 라이프사이클, 세션/HTTP 헬퍼, 시나리오 타입 (completed 2026-03-09)
- [x] **Phase 358: 오프체인 Smoke -- 코어 기능** - 인증/지갑/세션/정책 CRUD E2E 시나리오 (completed 2026-03-09)
- [x] **Phase 359: 오프체인 Smoke -- 인터페이스 및 운영** - Admin/MCP/SDK/알림/토큰/connect-info/감사/백업 E2E (completed 2026-03-09)
- [x] **Phase 360: 오프체인 Smoke -- 고급 프로토콜** - Smart Account/UserOp/Owner Auth/x402/ERC-8004/8128/DeFi/Push Relay E2E (completed 2026-03-09)
- [x] **Phase 361: CI/CD 워크플로우 통합** - e2e-smoke.yml, RC 트리거, 리포트, 알림, #282/#283 이슈 해결 (completed 2026-03-09)
- [x] **Phase 362: 온체인 사전 조건 체커** - 데몬/지갑/잔액 확인, 인터랙티브 프롬프트, 네트워크 필터 (completed 2026-03-09)
- [ ] **Phase 363: 온체인 E2E 시나리오** - testnet 전송/토큰/수신감지/스테이킹/Hyperliquid/NFT + skip 처리
- [ ] **Phase 364: E2E 시나리오 등록 강제** - Provider/API 매핑 검증, CI fail, 빈 파일 방지

## Phase Details

### Phase 357: E2E 테스트 인프라 및 공통 유틸리티
**Goal**: E2E 테스트를 작성할 수 있는 독립 패키지와 공통 유틸리티가 갖춰져, 이후 시나리오 작성에 즉시 착수할 수 있다
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07
**Success Criteria** (what must be TRUE):
  1. `pnpm turbo run test --filter=@waiaas/e2e-tests` 명령이 패키지를 인식하고 빈 테스트 스위트가 통과한다
  2. 테스트 코드에서 데몬을 기동하고 health check 후 종료하는 유틸리티가 동작한다
  3. Push Relay를 기동하고 health check 후 종료하는 유틸리티가 동작한다
  4. 마스터 패스워드 설정 + 세션 생성 + REST API 호출이 헬퍼 함수 한 줄로 가능하다
  5. E2EScenario 타입으로 offchain/onchain 트랙을 구분하여 시나리오를 등록할 수 있고, 테스트 리포트가 통과/실패/스킵을 요약 출력한다
**Plans:** 3/3 plans complete

Plans:
- [x] 357-01-PLAN.md — 패키지 셋업 + E2EScenario 타입 시스템 + 리포터
- [x] 357-02-PLAN.md — 데몬/Push Relay 라이프사이클 관리 유틸리티
- [x] 357-03-PLAN.md — 세션 관리 + HTTP 클라이언트 헬퍼

### Phase 358: 오프체인 Smoke -- 코어 기능
**Goal**: WAIaaS의 핵심 기능(인증, 지갑, 세션, 정책)이 E2E 시나리오로 자동 검증된다
**Depends on**: Phase 357
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04
**Success Criteria** (what must be TRUE):
  1. 마스터 패스워드 설정 -> 세션 생성 -> 갱신 -> 삭제가 하나의 테스트로 통과한다
  2. EVM/Solana 지갑 생성 -> 목록 조회 -> 삭제가 테스트로 검증된다
  3. 다중 지갑 세션에서 지갑 연결/해제 후 session_wallets 상태가 올바르다
  4. 정책 CRUD(생성/조회/수정/삭제) + dry-run 평가가 테스트로 검증된다
**Plans:** 2/2 plans complete

Plans:
- [x] 358-01-PLAN.md — 인증 + 지갑 CRUD + 다중 지갑 세션 E2E
- [x] 358-02-PLAN.md — 정책 CRUD + dry-run 평가 E2E

### Phase 359: 오프체인 Smoke -- 인터페이스 및 운영
**Goal**: REST API 외 모든 인터페이스(Admin UI, MCP, SDK)와 운영 기능(알림, 토큰, 감사, 백업)이 E2E로 검증된다
**Depends on**: Phase 358
**Requirements**: IFACE-01, IFACE-02, IFACE-03, IFACE-04, IFACE-05, IFACE-06, IFACE-07, IFACE-08
**Success Criteria** (what must be TRUE):
  1. Admin UI가 HTTP 200으로 접근 가능하고 Settings API CRUD가 동작한다
  2. MCP 서버에 stdio로 연결하여 tool listing과 기본 도구 호출이 성공한다
  3. SDK로 세션 생성 -> 지갑 목록 조회 -> connect-info 확인이 동작한다
  4. 알림 채널 설정 후 이벤트 발행, 토큰 레지스트리 CRUD, 감사 로그 존재, 백업->복원->데이터 일치가 각각 검증된다
**Plans:** 3/3 plans complete

Plans:
- [x] 359-01-PLAN.md — Admin UI + MCP stdio + SDK 인터페이스 E2E
- [x] 359-02-PLAN.md — 알림 채널 + 토큰 레지스트리 + connect-info E2E
- [x] 359-03-PLAN.md — 감사 로그 + 백업/복원 E2E

### Phase 360: 오프체인 Smoke -- 고급 프로토콜
**Goal**: Smart Account, Owner Auth, x402, ERC-8004/8128, DeFi 설정 등 고급 기능이 E2E로 검증된다
**Depends on**: Phase 358
**Requirements**: ADV-01, ADV-02, ADV-03, ADV-04, ADV-05, ADV-06, ADV-07, ADV-08
**Success Criteria** (what must be TRUE):
  1. Smart Account 생성/조회 + Lite/Full 모드 판별이 테스트로 확인된다
  2. UserOp Build/Sign + TTL 만료, Owner Auth 챌린지 발급/서명 검증이 테스트로 확인된다
  3. x402 설정 CRUD + dry-run, ERC-8004 등록/해제/권한 조회, ERC-8128 서명 생성/검증이 각각 테스트로 확인된다
  4. DeFi 프로토콜별 Admin Settings CRUD와 Push Relay 디바이스 등록/해제가 테스트로 확인된다
**Plans:** 3/3 plans complete

Plans:
- [x] 360-01-PLAN.md — Smart Account/UserOp/Owner Auth E2E
- [x] 360-02-PLAN.md — x402/ERC-8004/ERC-8128 E2E
- [x] 360-03-PLAN.md — DeFi Settings/Push Relay E2E

### Phase 361: CI/CD 워크플로우 통합
**Goal**: 오프체인 E2E 테스트가 RC publish 시 자동 실행되고, 실패 시 알림이 전달되며, 기존 이슈(#282, #283)가 해결된다
**Depends on**: Phase 359, Phase 360
**Requirements**: CICD-01, CICD-02, CICD-03, CICD-04, CICD-05, CICD-06, CICD-07
**Success Criteria** (what must be TRUE):
  1. e2e-smoke.yml이 release published 이벤트와 workflow_dispatch로 트리거된다
  2. RC 버전을 npx로 명시적 설치하여 테스트를 실행하고, 결과가 GitHub Actions Summary에 표시된다
  3. 테스트 실패 시 ntfy 알림 또는 GitHub Issue가 자동 생성된다
  4. #282 네트워크 설정 키 완전성 검증 스크립트가 CI에서 실행되고, #283 README 배지가 동적 업데이트된다
**Plans:** 3/3 plans complete

Plans:
- [x] 361-01-PLAN.md — e2e-smoke.yml 워크플로우 + RC 트리거 + Summary 리포트
- [x] 361-02-PLAN.md — #282 설정 키 완전성 테스트 + #283 README 배지 동적 업데이트
- [x] 361-03-PLAN.md — E2E 실패 알림 + CI 통합 + 이슈 상태 업데이트

### Phase 362: 온체인 사전 조건 체커
**Goal**: 온체인 E2E 실행 전 필요한 사전 조건(데몬, 지갑, 잔액)을 자동으로 확인하고, 부족 시 명확한 리포트를 제공한다
**Depends on**: Phase 357
**Requirements**: ONCH-01, ONCH-02, ONCH-03
**Success Criteria** (what must be TRUE):
  1. 데몬 접속, 지갑 존재, 네트워크별 잔액을 확인하고 부족한 항목을 리포트한다
  2. 인터랙티브 프롬프트로 "가능한 것만 실행" 또는 "중단 후 준비" 중 선택할 수 있다
  3. --network, --only 옵션으로 특정 네트워크/프로토콜만 필터링하여 실행할 수 있다
**Plans:** 2/2 plans complete

Plans:
- [x] 362-01-PLAN.md — PreconditionChecker 코어 (데몬/지갑/잔액 체크 + 네트워크 필터)
- [x] 362-02-PLAN.md — 인터랙티브 프롬프트 + 온체인 러너 진입점

### Phase 363: 온체인 E2E 시나리오
**Goal**: testnet에서 실제 트랜잭션(전송, 토큰, 스테이킹, DEX, NFT)이 자동으로 실행되고 검증된다
**Depends on**: Phase 362
**Requirements**: ONCH-04, ONCH-05, ONCH-06, ONCH-07, ONCH-08, ONCH-09, ONCH-10
**Success Criteria** (what must be TRUE):
  1. Sepolia ETH / Devnet SOL 기본 전송과 ERC-20 / SPL 토큰 전송이 성공한다
  2. IncomingTxMonitor가 수신 트랜잭션을 감지하고 Lido Holesky stake/unstake가 실행된다
  3. Hyperliquid testnet Spot/Perp 주문과 NFT ERC-721/ERC-1155 전송이 성공한다
  4. testnet 미지원 프로토콜과 잔액 부족 시나리오는 fail이 아닌 skip으로 처리된다
**Plans**: TBD

### Phase 364: E2E 시나리오 등록 강제
**Goal**: 신규 기능(Action Provider, REST API) 추가 시 대응하는 E2E 시나리오가 없으면 CI가 실패하여, 테스트 누락을 구조적으로 방지한다
**Depends on**: Phase 361
**Requirements**: ENFORCE-01, ENFORCE-02, ENFORCE-03, ENFORCE-04
**Success Criteria** (what must be TRUE):
  1. Action Provider 목록과 E2E 시나리오 매핑을 검증하는 스크립트가 미등록 Provider를 탐지한다
  2. REST API 엔드포인트와 오프체인 시나리오 매핑을 검증하는 스크립트가 미등록 엔드포인트를 탐지한다
  3. PR 시 CI에서 검증 스텝이 실행되어 미등록 시나리오가 있으면 즉시 fail한다
  4. 시나리오 파일에 최소 1개 테스트 케이스가 존재하는지 검증하여 빈 파일을 방지한다
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 357 -> 358 -> 359/360 (parallel) -> 361 -> 362 -> 363 -> 364

Note: Phase 359 and 360 can execute in parallel (both depend on 358 only). Phase 362 can start after 357 (independent of offchain smoke phases).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 357. E2E 테스트 인프라 | 3/3 | Complete    | 2026-03-09 |
| 358. 오프체인 Smoke -- 코어 | 2/2 | Complete    | 2026-03-09 |
| 359. 오프체인 Smoke -- 인터페이스 | 3/3 | Complete    | 2026-03-09 |
| 360. 오프체인 Smoke -- 고급 | 3/3 | Complete    | 2026-03-09 |
| 361. CI/CD 워크플로우 | 3/3 | Complete    | 2026-03-09 |
| 362. 온체인 사전 조건 체커 | 2/2 | Complete    | 2026-03-09 |
| 363. 온체인 E2E 시나리오 | 0/? | Not started | - |
| 364. E2E 시나리오 등록 강제 | 0/? | Not started | - |
