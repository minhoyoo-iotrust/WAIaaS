# Roadmap: WAIaaS

## Milestones

- ✅ **v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글** — Phases 432-434 (shipped 2026-03-16)
- ✅ **v32.6 성능 + 구조 개선** — Phases 435-438 (shipped 2026-03-17)
- ✅ **v32.7 SEO/AEO 최적화** — Phases 439-443 (shipped 2026-03-17)
- **v32.8 테스트 커버리지 강화** — Phases 444-448 (in progress)

<details>
<summary>✅ v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글 (Phases 432-434) — SHIPPED 2026-03-16</summary>

- [x] Phase 432: Interface Extension (2/2 plans) — completed 2026-03-16
- [x] Phase 433: Multichain Positions (4/4 plans) — completed 2026-03-16
- [x] Phase 434: Testnet Toggle (2/2 plans) — completed 2026-03-16

</details>

See `.planning/milestones/v32.5-ROADMAP.md` for full details.

<details>
<summary>✅ v32.6 성능 + 구조 개선 (Phases 435-438) — SHIPPED 2026-03-17</summary>

- [x] Phase 435: N+1 쿼리 해소 (2/2 plans) — completed 2026-03-17
- [x] Phase 436: 페이지네이션 추가 (2/2 plans) — completed 2026-03-17
- [x] Phase 437: 대형 파일 분할 (3/3 plans) — completed 2026-03-17
- [x] Phase 438: 파이프라인 분할 + 추가 정리 (2/2 plans) — completed 2026-03-17

</details>

See `.planning/milestones/v32.6-ROADMAP.md` for full details.

<details>
<summary>✅ v32.7 SEO/AEO 최적화 (Phases 439-443) — SHIPPED 2026-03-17</summary>

- [x] Phase 439: Build Infrastructure (1/1 plan) — completed 2026-03-17
- [x] Phase 440: Content Publishing + Navigation (1/1 plan) — completed 2026-03-17
- [x] Phase 441: Technical SEO & AEO (2/2 plans) — completed 2026-03-17
- [x] Phase 442: CI Integration (1/1 plan) — completed 2026-03-17
- [x] Phase 443: SEO Landing Pages + External Distribution (2/2 plans) — completed 2026-03-17

</details>

See `.planning/milestones/v32.7-ROADMAP.md` for full details.

## v32.8 테스트 커버리지 강화

**Milestone Goal:** 전 패키지 커버리지를 Lines 90% / Branches 85% / Functions 95% 통일 기준으로 끌어올리고, CI Gate로 구조적 하락을 방지한다.

## Phases

- [x] **Phase 444: daemon DeFi Provider + Pipeline 테스트 강화** - DeFi 5개 Provider와 Pipeline 엣지 케이스 테스트 추가 (completed 2026-03-17)
- [x] **Phase 445: daemon Infra + Admin API + Notification 테스트** - IncomingTx, RPC Pool, Admin API, Notification 테스트로 daemon 90/85/95 달성 (completed 2026-03-17)
- [x] **Phase 446: evm Branches + wallet-sdk Branches 강화** - EVM 가스/토큰/RPC 분기와 wallet-sdk 서명 채널 에러 경로 커버 (completed 2026-03-17)
- [x] **Phase 447: admin Functions + cli Lines/Branches 강화** - Admin 이벤트 핸들러/헬퍼/유틸 테스트와 CLI 엣지 케이스 테스트 추가 (completed 2026-03-17)
- [x] **Phase 448: sdk + shared + 나머지 패키지 + 임계값 최종 인상** - 잔여 패키지 갭 해소 후 전 패키지 통일 임계값 적용 (completed 2026-03-17)

## Phase Details

### Phase 444: daemon DeFi Provider + Pipeline 테스트 강화
**Goal**: daemon 패키지의 DeFi Provider 5종과 Pipeline 상태 머신 엣지 케이스가 테스트로 커버된다
**Depends on**: Nothing (first phase)
**Requirements**: DDEFI-01, DDEFI-02, DDEFI-03, DDEFI-04, DDEFI-05, DPIPE-01, DPIPE-02, DPIPE-03, DPIPE-04, DPIPE-05
**Plans**: 3 plans
Plans:
- [x] 444-01-PLAN.md — Jupiter/0x/LiFi Provider 단위 테스트
- [x] 444-02-PLAN.md — Lido+Jito/Aave Provider 단위 테스트
- [x] 444-03-PLAN.md — Pipeline 엣지 케이스 테스트 (DELAY/GAS_WAITING 재진입, 서명 타임아웃, 가스 추정 실패, Gas Conditional)
**Success Criteria** (what must be TRUE):
  1. Jupiter/0x/LI.FI/Lido+Jito/Aave 각 Provider의 성공 및 실패 경로가 목킹 기반 테스트로 검증된다
  2. Pipeline DELAY 재진입 시 원본 request가 보존되고, GAS_WAITING 재진입 후 가스 조건 충족 시 정상 실행된다
  3. 서명 타임아웃이 FAILED 상태 전이와 알림 발송을 트리거하고, 가스 추정 실패 시 유의미한 에러 메시지가 반환된다
  4. Gas Conditional Executor의 조건 평가, 폴링, 만료 처리가 테스트로 검증된다

### Phase 445: daemon Infra + Admin API + Notification 테스트
**Goal**: daemon 패키지가 Lines 90% / Branches 85% / Functions 95% 통일 기준을 달성한다
**Depends on**: Phase 444
**Requirements**: DINF-01, DINF-02, DINF-03, DINF-04, DINF-05, DCOV-01, DCOV-02, DCOV-03
**Plans**: 3 plans
Plans:
- [x] 445-01-PLAN.md — IncomingTx Monitor/Workers + Notification 서비스 + RPC Proxy 라우트 테스트
- [x] 445-02-PLAN.md — Admin API 라우트 (wallets/settings/auth/monitoring/wallet-apps) 테스트
- [x] 445-03-PLAN.md — 잔여 커버리지 갭 sweep + vitest.config.ts 임계값 인상 (90/85/95)
**Success Criteria** (what must be TRUE):
  1. IncomingTxMonitor 구독 관리, 감지, DB 저장, 알림 트리거가 테스트로 검증된다
  2. EVM/Solana Subscriber 폴링, WSS 재연결, 블록 스캔이 테스트로 검증된다
  3. RPC Pool 로테이션, 재시도, 장애 격리가 테스트로 검증된다
  4. Admin API 라우트와 Notification 템플릿 엣지 케이스가 테스트로 검증된다
  5. daemon 패키지 `pnpm test:unit` 실행 시 Lines >= 90%, Branches >= 85%, Functions >= 95% 임계값을 통과한다

### Phase 446: evm Branches + wallet-sdk Branches 강화
**Goal**: evm 패키지 Branches 85%와 wallet-sdk 패키지 Branches 85%를 달성한다
**Depends on**: Phase 444
**Requirements**: EVM-01, EVM-02, EVM-03, EVM-04, WSDK-01, WSDK-02
**Success Criteria** (what must be TRUE):
  1. EVM 가스 추정 EIP-1559/legacy/EIP-4844 각 경로가 테스트로 검증된다
  2. ERC-20/721/1155 잔액 부족, 승인 부족, 컨트랙트 리버트 에러 경로가 테스트로 검증된다
  3. wallet-sdk 서명 채널별 에러, 타임아웃, 재시도 분기가 테스트로 검증된다
  4. evm Branches >= 85%, wallet-sdk Branches >= 85% 임계값을 통과한다
**Plans**: 2 plans
Plans:
- [x] 446-01-PLAN.md — EVM adapter.ts 에러 경로 + tx-parser.ts 분기 테스트 + 임계값 인상
- [x] 446-02-PLAN.md — wallet-sdk ntfy.ts SSE 재연결/에러 + parse-request.ts remote fetch 분기 테스트 + 임계값 인상

### Phase 447: admin Functions + cli Lines/Branches 강화
**Goal**: admin 패키지 Functions 95%와 cli 패키지 Lines 90% / Branches 85%를 달성한다
**Depends on**: Phase 444
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, ADM-06, CLI-01, CLI-02, CLI-03
**Plans**: 3 plans
Plans:
- [x] 447-01-PLAN.md — system/erc8004/credentials/wallet-apps/dashboard/transactions 페이지 미커버 함수 테스트
- [x] 447-02-PLAN.md — 나머지 페이지 + 컴포넌트 미커버 함수 테스트
- [x] 447-03-PLAN.md — CLI 0% 파일 테스트 + admin/cli 임계값 인상

**Success Criteria** (what must be TRUE):
  1. Admin 페이지 이벤트 핸들러(폼 제출, 버튼 클릭, 모달)가 테스트로 검증된다
  2. Admin 조건부 렌더링 헬퍼와 폼 검증/변환 유틸이 테스트로 검증된다
  3. CLI 인자 파싱 실패, config 미설정, 네트워크 에러 엣지 케이스가 테스트로 검증된다
  4. admin Lines >= 90%, Branches >= 85%, Functions >= 95%, cli Lines >= 90%, Branches >= 85% 임계값을 통과한다

### Phase 448: sdk + shared + 나머지 패키지 + 임계값 최종 인상
**Goal**: 전 패키지가 Lines 90% / Branches 85% / Functions 95% 통일 기준을 달성하고 CI Gate로 하락이 방지된다
**Depends on**: Phase 444, Phase 445, Phase 446, Phase 447
**Requirements**: SDK-01, SDK-02, SDK-03, SDK-04, SHR-01, SHR-02, SHR-03, GAP-01, GAP-02, GAP-03, GATE-01, GATE-02, GATE-03, GATE-04, GATE-05
**Plans**: 3 plans
Plans:
- [ ] 448-01-PLAN.md — SDK client.ts/validation.ts/http.ts 미커버 경로 테스트 + 임계값 인상
- [ ] 448-02-PLAN.md — shared vitest 설정 + networks.ts 테스트 + core/actions/mcp 소량 갭 해소
- [ ] 448-03-PLAN.md — 전 패키지 임계값 최종 인상 + coverage-gate.sh 동기화 + 전체 검증
**Success Criteria** (what must be TRUE):
  1. sdk client.ts HTTP 에러/DeFi 메서드와 validation.ts 검증 분기가 테스트로 검증된다
  2. shared 패키지에 vitest.config.ts가 설정되고 유틸리티 함수 테스트가 통과한다
  3. core Functions >= 95%, actions Branches >= 85%, mcp Branches >= 85% 소량 갭이 해소된다
  4. 전 패키지 vitest.config.ts 임계값이 통일 기준으로 인상되고, `pnpm turbo run test:unit` 전체 0 failures로 통과한다
  5. coverage-gate.sh와 vitest.config.ts 임계값이 동기화되고, 기존 임계값 하향이 없음이 확인된다

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 444. daemon DeFi Provider + Pipeline 테스트 강화 | 3/3 | Complete    | 2026-03-17 |
| 445. daemon Infra + Admin API + Notification 테스트 | 3/3 | Complete    | 2026-03-17 |
| 446. evm Branches + wallet-sdk Branches 강화 | 2/2 | Complete    | 2026-03-17 |
| 447. admin Functions + cli Lines/Branches 강화 | 3/3 | Complete    | 2026-03-17 |
| 448. sdk + shared + 나머지 패키지 + 임계값 최종 인상 | 3/3 | Complete    | 2026-03-17 |
