# 마일스톤 m29-07: 테스트 커버리지 강화

- **Status:** PLANNED
- **Milestone:** TBD

## 목표

daemon(85%)과 sdk(81%)의 테스트 커버리지를 핵심 비즈니스 로직 중심으로 대폭 개선하여 전 패키지 Lines 커버리지 85% 이상을 달성한다. CI Gate를 hard mode로 전환하여 커버리지 하락을 구조적으로 방지한다.

---

## 배경

### 현재 문제

v29.3 기준 12개 패키지 중 daemon과 sdk가 커버리지 경계선에 놓여 있다:

| 패키지 | Lines | 미커버 Lines | 비고 |
|--------|-------|------------|------|
| **daemon** | 85.06% | **3,418줄** | 전체 미커버의 ~60%, 최대 개선 기회 |
| **sdk** | 80.99% | **137줄** | 여유분 0.99%, 코드 추가 시 즉시 임계값 미달 위험 |
| admin | 89.39% | 1,105줄 | functions 73.55%로 전 패키지 중 최저 |

나머지 8개 패키지는 84~97% 수준으로 안정적이지만, daemon과 sdk는 코드가 추가될 때마다 임계값 미달 위험이 상존한다.

### daemon 미커버 분석

daemon은 22,890줄 중 3,418줄이 미커버(14.94%). 주요 미커버 영역:

| 영역 | 예상 미커버 Lines | 테스트 난이도 | 가치 |
|------|-----------------|-------------|------|
| DeFi Action Provider (Jupiter, 0x, LI.FI, Lido, Jito, Aave) | ~1,200줄 | 중 — 외부 API 목킹 필요 | HIGH — 핵심 비즈니스 로직 |
| Pipeline stages (stage1~6) 엣지 케이스 | ~600줄 | 중 — 복잡한 상태 전이 | HIGH — 트랜잭션 안전성 |
| IncomingTxMonitor + Subscribers | ~400줄 | 중 — WebSocket/폴링 목킹 | MEDIUM |
| Admin API 라우트 | ~350줄 | 하 — HTTP 요청 테스트 | MEDIUM |
| Lifecycle (daemon.ts) | ~300줄 | 상 — 전체 시스템 통합 | MEDIUM |
| WalletConnect Bridge | ~250줄 | 상 — 외부 서비스 의존 | LOW |
| Notification 템플릿/포맷팅 | ~200줄 | 하 — 순수 함수 | MEDIUM |
| 기타 (config, migration, utils) | ~118줄 | 하 | LOW |

### sdk 미커버 분석

sdk는 721줄 중 137줄이 미커버(19%). 주요 미커버 영역:

| 영역 | 예상 미커버 Lines | 테스트 난이도 | 가치 |
|------|-----------------|-------------|------|
| HTTP 에러 핸들링 경로 | ~50줄 | 하 | HIGH |
| 재시도 로직 / 타임아웃 | ~30줄 | 하 | HIGH |
| 옵셔널 파라미터 분기 | ~30줄 | 하 | MEDIUM |
| 기타 유틸리티 | ~27줄 | 하 | LOW |

---

## 목표 수치

### 최종 커버리지 목표

| 패키지 | 현재 Lines | 목표 Lines | 필요 추가 커버 Lines | 현재 Branches | 목표 Branches |
|--------|-----------|-----------|---------------------|-------------|-------------|
| **daemon** | 85.06% | **90%** | ~1,130줄 | 82.38% | **85%** |
| **sdk** | 80.99% | **88%** | ~50줄 | 94.73% | 94% (유지) |
| **admin** | 89.39% | 89% (유지) | — | 82.39% | 82% (유지) |

daemon 90% 달성 시 22,890줄 중 20,601줄 커버 필요 → 현재 19,472줄에서 ~1,130줄 추가.

### 임계값 최종 목표

모든 패키지 vitest + CI Gate 동기화:

| 패키지 | Lines/Stmts | Branches | Functions |
|--------|-------------|----------|-----------|
| core | 95 | 91 | 93 |
| **daemon** | **88** | **85** | **92** |
| solana | 89 | 80 | 89 |
| evm | 92 | 71 | 93 |
| **sdk** | **85** | **92** | **80** |
| cli | 80 | 82 | 95 |
| mcp | 87 | 83 | 93 |
| admin | 87 | 80 | 71 |
| wallet-sdk | 87 | 76 | 98 |
| push-relay | 82 | 90 | 94 |

---

## 구현 대상

### Phase 1: daemon DeFi Provider + Pipeline 테스트 강화

daemon에서 가장 큰 미커버 영역인 DeFi Action Provider와 Pipeline 엣지 케이스에 테스트 추가.

| 대상 | 내용 | 예상 추가 테스트 |
|------|------|----------------|
| Jupiter Swap Provider | resolve/execute 경로, 에러 처리, 슬리피지 검증 | 15-20개 |
| 0x Swap Provider | 견적 조회, 체인 매핑, hex→decimal 변환 | 12-15개 |
| LI.FI Bridge Provider | 크로스체인 라우트, 토큰 주소 매핑, 타임아웃 | 12-15개 |
| Lido/Jito Staking Provider | deposit/withdraw, 스테이크 계정 처리 | 10-12개 |
| Aave V3 Lending Provider | supply/borrow/repay/withdraw, health factor | 15-20개 |
| Pipeline stages 엣지 케이스 | DELAY 재진입, 가스 추정 실패, 서명 타임아웃 | 15-20개 |
| Gas Conditional Executor | 가스 조건 평가, 폴링 로직, 만료 처리 | 8-10개 |

### Phase 2: daemon Infra + Admin + Notification 테스트

| 대상 | 내용 | 예상 추가 테스트 |
|------|------|----------------|
| IncomingTxMonitor | 구독 관리, 감지 로직, DB 저장, 알림 트리거 | 15-20개 |
| EVM/Solana Subscriber | 폴링/WSS 재연결, 블록 스캔, 트랜잭션 파싱 | 12-15개 |
| Admin API 라우트 | settings, actions, sessions, wallets CRUD 엣지 케이스 | 15-20개 |
| Notification 템플릿 | 금액 포맷팅, 익스플로러 링크, 카테고리 필터링 | 8-10개 |
| RPC Pool | 로테이션, 재시도, 장애 격리, WSS 전환 | 10-12개 |

### Phase 3: sdk 테스트 강화 + 임계값 최종 인상

| 대상 | 내용 | 예상 추가 테스트 |
|------|------|----------------|
| SDK HTTP 에러 경로 | 4xx/5xx 응답 파싱, 네트워크 타임아웃, 재시도 | 10-12개 |
| SDK 옵셔널 파라미터 | 빈 옵션, 부분 옵션, 잘못된 타입 | 8-10개 |
| 전 패키지 임계값 최종 인상 | daemon 88%, sdk 85%로 vitest + CI Gate 동기화 | — |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | DeFi Provider 테스트 방식 | 외부 API 목킹 vs 실제 호출 | 목킹 — 테스트 안정성 + CI 환경 독립성. 실제 API 호출은 rate limit, 네트워크 불안정으로 flaky test 유발 |
| 2 | Pipeline 테스트 전략 | 단위 테스트 vs 통합 테스트 | 혼합 — stage 함수 단위 테스트 + 주요 경로 통합 테스트. 단위 테스트만으로는 stage 간 상호작용 검증 불가 |
| 3 | IncomingTx 테스트 | WebSocket 실제 연결 vs mock | mock — 테스트 격리 + 결정적 동작. Solana WSS/EVM 폴링 모두 목킹 |
| 4 | 커버리지 목표 수준 | daemon 88% vs 90% vs 95% | 90% — 88%는 보수적이고, 95%는 WalletConnect 등 외부 의존 코드에 대한 비용 대비 효과 낮음 |
| 5 | CI Gate mode | soft → hard 즉시 전환 vs 단계적 | hard 즉시 전환 — #209(임계값 인상 이슈)에서 현행 수치 기반으로 인상하므로 즉시 hard mode 가능 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### 커버리지 목표 달성 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | daemon Lines ≥ 90% | `pnpm turbo run test:unit --filter=@waiaas/daemon` 후 coverage-summary.json 확인 | [L0] |
| 2 | daemon Branches ≥ 85% | 동일 | [L0] |
| 3 | sdk Lines ≥ 88% | `pnpm turbo run test:unit --filter=@waiaas/sdk` 후 coverage-summary.json 확인 | [L0] |
| 4 | 전 패키지 임계값 통과 | `pnpm turbo run test:unit` 전체 통과 (0 failures) | [L0] |
| 5 | CI Gate hard mode 작동 | coverage-gate.sh exit code 0 확인 | [L0] |

### DeFi Provider 테스트 품질

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 6 | 각 DeFi Provider resolve() 성공/실패 경로 | 정상 견적 + API 에러 + 타임아웃 케이스 커버 | [L0] |
| 7 | 각 DeFi Provider execute() 성공/실패 경로 | 정상 실행 + 슬리피지 초과 + 가스 부족 케이스 커버 | [L0] |
| 8 | Provider 등록/해제 핫 리로드 | Settings 변경 시 레지스트리 갱신 검증 | [L0] |

### Pipeline 엣지 케이스

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 9 | DELAY 재진입 시 원본 request 보존 | #208 수정 후 모든 트랜잭션 타입 재진입 검증 | [L0] |
| 10 | GAS_WAITING 재진입 시 원본 request 보존 | 가스 조건 충족 후 실행 시 request 무결성 검증 | [L0] |
| 11 | 서명 타임아웃 → FAILED 전이 | 승인 대기 만료 시 올바른 상태 전이 + 알림 | [L0] |
| 12 | 가스 추정 실패 → 적절한 에러 반환 | 시뮬레이션 실패 시 사용자에게 유의미한 에러 메시지 | [L0] |

---

## 선행 조건

| 의존 대상 | 이유 |
|----------|------|
| #209 (임계값 인상 이슈) | 현행 수치 기반 임계값 먼저 인상 필요 — 이 마일스톤은 인상된 기준 위에 추가 테스트 |
| #208 (DELAY 재진입 데이터 손실) | Pipeline 재진입 테스트의 전제조건 — 버그 수정 후 테스트 작성 |
| #207 (파이프라인 재진입 알림 누락) | 알림 관련 테스트의 전제조건 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | daemon 90% 달성 불가 | WalletConnect, Lifecycle 등 외부 의존 코드의 테스트가 비용 대비 효과 낮을 수 있음 | 최소 88% 달성 후 ROI 재평가. 외부 의존 코드는 통합 테스트로 커버 |
| 2 | 테스트 실행 시간 증가 | daemon 테스트 100+개 추가 시 CI 시간 증가 가능 | vitest forks pool + 병렬 실행으로 완화. 테스트 파일 단위 분리 |
| 3 | 목킹 과다로 테스트 신뢰도 하락 | 외부 API 목킹이 실제 동작과 괴리될 수 있음 | 목킹 데이터를 실제 API 응답 기반으로 작성. 통합 테스트로 보완 |
| 4 | 테스트 유지보수 부담 증가 | 200+개 신규 테스트의 향후 유지 비용 | 테스트 헬퍼/팩토리 패턴 활용하여 중복 최소화 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | 3개 |
| 신규 테스트 파일 | 15-20개 |
| 신규 테스트 케이스 | 180-220개 |
| 수정 파일 | 12-15개 (vitest.config.ts 10개 + coverage-gate.sh + ci.yml) |
| 예상 LOC 추가 | +8,000~12,000줄 (테스트 코드) |
| daemon 목표 | 85% → 90% Lines |
| sdk 목표 | 81% → 88% Lines |

---

*생성일: 2026-02-27*
*선행: #207 (파이프라인 재진입 알림), #208 (재진입 데이터 손실), #209 (임계값 인상)*
*관련: v2.2 (테스트 커버리지 강화), v2.4.1 (Admin UI 테스트 복원), #184 (임계값 상향)*
