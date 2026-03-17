# Requirements: WAIaaS v32.8 테스트 커버리지 강화

**Defined:** 2026-03-17
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인이 자금 통제권을 유지하면서.

## v32.8 Requirements

전 패키지 커버리지를 Lines 90% / Branches 85% / Functions 95% 통일 기준으로 끌어올린다.

### daemon DeFi Provider 테스트

- [x] **DDEFI-01**: Jupiter Swap Provider resolve/execute 성공/실패 경로 테스트 커버 (목킹 기반)
- [x] **DDEFI-02**: 0x Swap Provider 견적 조회, 체인 매핑, hex→decimal 변환 테스트 커버
- [x] **DDEFI-03**: LI.FI Bridge Provider 크로스체인 라우트, 토큰 주소 매핑, 타임아웃 테스트 커버
- [x] **DDEFI-04**: Lido/Jito Staking Provider deposit/withdraw, 스테이크 계정 처리 테스트 커버
- [x] **DDEFI-05**: Aave V3 Lending Provider supply/borrow/repay/withdraw, health factor 테스트 커버

### daemon Pipeline 테스트

- [x] **DPIPE-01**: Pipeline stages 엣지 케이스 — DELAY 재진입 시 원본 request 보존 검증
- [x] **DPIPE-02**: GAS_WAITING 재진입 시 원본 request 보존 및 가스 조건 충족 후 실행 검증
- [x] **DPIPE-03**: 서명 타임아웃 → FAILED 상태 전이 + 알림 발송 검증
- [x] **DPIPE-04**: 가스 추정 실패 시 유의미한 에러 메시지 반환 검증
- [x] **DPIPE-05**: Gas Conditional Executor 가스 조건 평가, 폴링 로직, 만료 처리 테스트 커버

### daemon Infra 테스트

- [x] **DINF-01**: IncomingTxMonitor 구독 관리, 감지 로직, DB 저장, 알림 트리거 테스트 커버
- [x] **DINF-02**: EVM/Solana Subscriber 폴링/WSS 재연결, 블록 스캔, 트랜잭션 파싱 테스트 커버
- [x] **DINF-03**: RPC Pool 로테이션, 재시도, 장애 격리, WSS 전환 테스트 커버
- [x] **DINF-04**: Admin API 라우트 settings/actions/sessions/wallets CRUD 엣지 케이스 테스트 커버
- [x] **DINF-05**: Notification 템플릿 금액 포맷팅, 익스플로러 링크, 카테고리 필터링 테스트 커버

### daemon 커버리지 목표

- [x] **DCOV-01**: daemon Lines ≥ 90% 달성 (현재 85.31%)
- [x] **DCOV-02**: daemon Branches ≥ 85% 달성 (현재 81.36%)
- [x] **DCOV-03**: daemon Functions ≥ 95% 달성 (현재 94.26%)

### evm 테스트

- [x] **EVM-01**: EVM 가스 추정 체인별 분기 커버 — EIP-1559/legacy/EIP-4844 각 경로 테스트
- [x] **EVM-02**: ERC-20/721/1155 에러 경로 — 잔액 부족, 승인 부족, 컨트랙트 리버트 테스트 커버
- [x] **EVM-03**: RPC 재시도/fallback 분기 — 타임아웃, 프로바이더 전환 테스트 커버
- [x] **EVM-04**: evm Branches ≥ 85% 달성 (현재 76.53%, +8.47%p)

### wallet-sdk 테스트

- [x] **WSDK-01**: 서명 채널별 에러 경로, 타임아웃, 재시도 분기 테스트 커버
- [x] **WSDK-02**: wallet-sdk Branches ≥ 85% 달성 (현재 79.09%, +5.91%p)

### admin 테스트

- [x] **ADM-01**: Admin 페이지 이벤트 핸들러 — 폼 제출, 버튼 클릭, 모달 인터랙션 테스트 커버
- [x] **ADM-02**: Admin 조건부 렌더링 헬퍼 함수 — 상태별 UI 분기, 로딩/에러/빈 상태 테스트 커버
- [x] **ADM-03**: Admin 폼 검증/변환 유틸 — 입력 검증, 데이터 변환, 에러 메시지 테스트 커버
- [x] **ADM-04**: admin Lines ≥ 90% 달성 (현재 87.56%)
- [x] **ADM-05**: admin Branches ≥ 85% 달성 (현재 80.29%)
- [x] **ADM-06**: admin Functions ≥ 95% 달성 (현재 71.39%, +23.61%p)

### cli 테스트

- [x] **CLI-01**: CLI 명령어 엣지 케이스 — 인자 파싱 실패, config 미설정, 네트워크 에러 테스트 커버
- [x] **CLI-02**: cli Lines ≥ 90% 달성 (현재 81.08%, +8.92%p)
- [x] **CLI-03**: cli Branches ≥ 85% 달성 (현재 78.25%, +6.75%p)

### sdk 테스트

- [x] **SDK-01**: client.ts HTTP 에러/엣지 경로 + DeFi/ERC-8004 메서드 테스트 커버
- [x] **SDK-02**: validation.ts 검증 분기 + 옵셔널 파라미터 조합 테스트 커버
- [x] **SDK-03**: sdk Lines ≥ 90% 달성 (현재 85.89%)
- [x] **SDK-04**: sdk Functions ≥ 95% 달성 (현재 85.91%, +9.09%p)

### shared 패키지

- [x] **SHR-01**: shared 패키지 vitest.config.ts 설정 추가 (현재 미설정)
- [x] **SHR-02**: shared 패키지 유틸리티 함수, 상수 모듈 테스트 추가
- [x] **SHR-03**: shared Lines ≥ 90% / Branches ≥ 85% / Functions ≥ 95% 달성

### 소량 갭 패키지

- [x] **GAP-01**: core Functions ≥ 95% 달성 (현재 93.75%, +1.25%p)
- [x] **GAP-02**: actions Branches ≥ 85% 달성 (현재 84.59%, +0.41%p)
- [x] **GAP-03**: mcp Branches ≥ 85% 달성 (현재 84.85%, +0.15%p)

### 임계값 인상 + CI Gate

- [x] **GATE-01**: 전 패키지 vitest.config.ts 임계값을 max(현재 임계값, 통일 기준)으로 인상
- [x] **GATE-02**: 이미 달성한 패키지(solana, push-relay) 임계값 즉시 인상
- [x] **GATE-03**: coverage-gate.sh와 vitest.config.ts 임계값 동기화
- [x] **GATE-04**: `pnpm turbo run test:unit` 전체 통과 (0 failures) 확인
- [x] **GATE-05**: 기존 임계값 절대 하향 금지 확인

## v2 Requirements

없음 — 테스트 커버리지 강화는 이 마일스톤에서 완결.

## Out of Scope

| Feature | Reason |
|---------|--------|
| WalletConnect Bridge 테스트 | 외부 서비스 의존도 높아 ROI 낮음, daemon 90% 달성 후 재평가 |
| daemon Lifecycle 통합 테스트 | 전체 시스템 통합 필요하여 비용 대비 효과 낮음 |
| E2E 테스트 추가 | 이 마일스톤은 단위/통합 테스트 커버리지에 집중 |
| Lines 95% / Branches 95% 목표 | 방어 코드/외부 의존 경로까지 전부 커버하는 것은 비현실적 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DDEFI-01 | Phase 444 | Complete |
| DDEFI-02 | Phase 444 | Complete |
| DDEFI-03 | Phase 444 | Complete |
| DDEFI-04 | Phase 444 | Complete |
| DDEFI-05 | Phase 444 | Complete |
| DPIPE-01 | Phase 444 | Complete |
| DPIPE-02 | Phase 444 | Complete |
| DPIPE-03 | Phase 444 | Complete |
| DPIPE-04 | Phase 444 | Complete |
| DPIPE-05 | Phase 444 | Complete |
| DINF-01 | Phase 445 | Complete |
| DINF-02 | Phase 445 | Complete |
| DINF-03 | Phase 445 | Complete |
| DINF-04 | Phase 445 | Complete |
| DINF-05 | Phase 445 | Complete |
| DCOV-01 | Phase 445 | Complete |
| DCOV-02 | Phase 445 | Complete |
| DCOV-03 | Phase 445 | Complete |
| EVM-01 | Phase 446 | Complete |
| EVM-02 | Phase 446 | Complete |
| EVM-03 | Phase 446 | Complete |
| EVM-04 | Phase 446 | Complete |
| WSDK-01 | Phase 446 | Complete |
| WSDK-02 | Phase 446 | Complete |
| ADM-01 | Phase 447 | Complete |
| ADM-02 | Phase 447 | Complete |
| ADM-03 | Phase 447 | Complete |
| ADM-04 | Phase 447 | Complete |
| ADM-05 | Phase 447 | Complete |
| ADM-06 | Phase 447 | Complete |
| CLI-01 | Phase 447 | Complete |
| CLI-02 | Phase 447 | Complete |
| CLI-03 | Phase 447 | Complete |
| SDK-01 | Phase 448 | Complete |
| SDK-02 | Phase 448 | Complete |
| SDK-03 | Phase 448 | Complete |
| SDK-04 | Phase 448 | Complete |
| SHR-01 | Phase 448 | Complete |
| SHR-02 | Phase 448 | Complete |
| SHR-03 | Phase 448 | Complete |
| GAP-01 | Phase 448 | Complete |
| GAP-02 | Phase 448 | Complete |
| GAP-03 | Phase 448 | Complete |
| GATE-01 | Phase 448 | Complete |
| GATE-02 | Phase 448 | Complete |
| GATE-03 | Phase 448 | Complete |
| GATE-04 | Phase 448 | Complete |
| GATE-05 | Phase 448 | Complete |

**Coverage:**
- v32.8 requirements: 48 total
- Mapped to phases: 48
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after initial definition*
