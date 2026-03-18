# 마일스톤 m32-08: 테스트 커버리지 강화

- **Status:** SHIPPED
- **Milestone:** v32.8
- **Completed:** 2026-03-18

## 목표

전 패키지 커버리지를 **Lines 90% / Branches 85% / Functions 95%** 통일 기준으로 끌어올린다. 현재 임계값보다 실측이 높은 패키지는 임계값만 인상하고, 미달 패키지는 테스트를 추가하여 목표를 달성한다. CI Gate hard mode로 구조적 하락을 방지한다.

---

## 배경

### 현재 문제

v32.7 기준 (2026-03-17 측정) 12개 패키지 커버리지 현황:

| 패키지 | Lines | Branches | Functions | 테스트 파일 | 비고 |
|--------|-------|----------|-----------|-----------|------|
| **daemon** | 85.31% | 81.36% | 94.26% | 314 | 최대 개선 기회, Functions 소폭 하락(94.64%→94.26%) |
| sdk | 85.89% | 95.25% | 85.91% | 13 | v29.3 대비 개선 완료 |
| admin | 87.56% | 80.29% | **71.39%** | 61 | Functions 전 패키지 최저 — 95%까지 대량 추가 필요 |
| core | 96.89% | 92.19% | **93.75%** | 51 | Lines/Branches 이미 달성, **Functions 하락(94.62%→93.75%)** +1.25%p 필요 |
| solana | 94.04% | **89.15%** | 98.50% | 17 | **전 메트릭 이미 달성** ✅ — 임계값만 인상 |
| evm | 95.81% | **76.53%** | 95.83% | 9 | **Branches 최대 갭 (+8.47%p)** |
| cli | **81.08%** | **78.25%** | 98.03% | 21 | Lines +8.92%p, Branches +6.75%p (이전 대비 소폭 하락) |
| mcp | 90.43% | 84.85% | 96.70% | 21 | Lines 달성, Branches +0.15%p |
| wallet-sdk | 90.04% | **79.09%** | 100% | 4 | Branches +5.91%p |
| push-relay | 93.14% | 92.50% | 95.45% | 15 | 전 메트릭 이미 달성 — 임계값만 인상 |
| actions | 97.74% | 84.59% | 97.73% | 71 | Lines 달성, Branches +0.41%p |
| **shared** | **측정 불가** | **측정 불가** | **측정 불가** | 1 | **vitest.config 미설정** — 설정 추가 후 커버리지 측정 필요 |

전체 테스트 파일: **598개**. daemon이 314개로 과반을 차지하며, shared 패키지는 vitest.config 자체가 없어 커버리지 측정이 안 되는 상태이다.

### 메트릭별 갭 분석 요약

| 메트릭 | 이미 달성 | 소량 추가 (<3%p) | 중간 추가 (3~10%p) | 대량 추가 (>10%p) |
|--------|----------|-----------------|-------------------|-----------------|
| **Lines 90%** | core, evm, actions, push-relay, solana, mcp, wallet-sdk | — | admin(+2.44%p), sdk(+4.11%p), daemon(+4.69%p), cli(+8.92%p) | shared(측정 불가) |
| **Branches 85%** | sdk, push-relay, core, solana | mcp(+0.15%p), actions(+0.41%p) | daemon(+3.64%p), admin(+4.71%p), wallet-sdk(+5.91%p), cli(+6.75%p) | evm(+8.47%p) |
| **Functions 95%** | wallet-sdk, cli, solana, mcp, evm, actions, push-relay | daemon(+0.74%p) | core(+1.25%p), sdk(+9.09%p) | admin(+23.61%p) |

### daemon 미커버 분석

daemon은 57,925 LOC 중 ~8,590줄이 미커버(14.83%). 90% 달성에 ~2,800줄 추가 커버 필요:

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

sdk는 3,496 LOC 중 ~503줄이 미커버(14.38%). Lines 90% + Functions 95% 달성 필요:

| 영역 | 예상 미커버 Lines | 테스트 난이도 | 가치 |
|------|-----------------|-------------|------|
| client.ts HTTP 에러/엣지 경로 | ~250줄 | 하 | HIGH |
| validation.ts 검증 분기 | ~14줄 | 하 | HIGH |
| http.ts 내부 유틸리티 | ~15줄 | 하 | MEDIUM |
| 기타 (DeFi/ERC-8004 메서드) | ~224줄 | 중 | MEDIUM |

### admin Functions 미커버 분석

admin Functions 71.37%→95%는 이 마일스톤의 **최대 난이도 작업**. UI 컴포넌트의 이벤트 핸들러, 조건부 렌더링 함수, 유틸리티 함수를 폭넓게 커버해야 함:

| 영역 | 예상 미커버 Functions | 테스트 난이도 | 가치 |
|------|---------------------|-------------|------|
| 페이지 컴포넌트 이벤트 핸들러 | ~30개 | 중 — 사용자 인터랙션 시뮬레이션 | HIGH |
| 조건부 렌더링 헬퍼 함수 | ~15개 | 하 | MEDIUM |
| 폼 검증/변환 유틸 | ~10개 | 하 | HIGH |
| API 호출 래퍼 | ~8개 | 하 — HTTP 목킹 | MEDIUM |

### evm Branches 미커버 분석

evm Branches 76.36%→85%는 **두 번째 난이도 작업**. 체인별 분기, 에러 처리 경로, 가스 추정 fallback 등:

| 영역 | 예상 미커버 Branches | 테스트 난이도 | 가치 |
|------|---------------------|-------------|------|
| 체인별 가스 추정 분기 | ~15개 | 중 — 체인 특성별 목킹 | HIGH |
| ERC-20/721/1155 에러 경로 | ~10개 | 하 | MEDIUM |
| RPC 재시도/fallback 분기 | ~8개 | 중 | MEDIUM |
| 트랜잭션 타입 분기 (legacy/EIP-1559/EIP-4844) | ~5개 | 중 | HIGH |

### shared 미커버 분석

shared는 신규 패키지(@waiaas/shared)로 **자체 vitest.config가 없어 커버리지 측정 자체가 불가능**한 상태. 테스트 파일 1개만 존재. vitest 설정 추가 → 커버리지 측정 → 갭 분석 → 테스트 추가 순서로 진행 필요.

---

## 목표 수치

### 통일 커버리지 기준

**전 패키지 공통 최소 기준: Lines ≥ 90% / Branches ≥ 85% / Functions ≥ 95%**

현재 실측이 기준을 초과하는 패키지는 현재 임계값을 유지(절대 하향 금지). 기준보다 높은 기존 임계값도 그대로 유지.

### 최종 커버리지 목표 (전 패키지)

| 패키지 | Lines (현재→목표) | Branches (현재→목표) | Functions (현재→목표) | 작업 규모 |
|--------|------------------|--------------------|--------------------|----------|
| core | 96.89% → 유지 | 92.19% → 유지 | 93.75% → **95%** | 소 — Functions +1.25%p |
| actions | 97.74% → 유지 | 84.59% → **85%** | 97.73% → 유지 | 소 — Branches +0.41%p |
| evm | 95.81% → 유지 | 76.53% → **85%** | 95.83% → 유지 | **대** — Branches +8.47%p |
| push-relay | 93.14% → 유지 | 92.50% → 유지 | 95.45% → 유지 | 없음 — 임계값만 인상 |
| solana | 94.04% → 유지 | 89.15% → 유지 | 98.50% → 유지 | 없음 — **전 메트릭 이미 달성**, 임계값만 인상 |
| mcp | 90.43% → 유지 | 84.85% → **85%** | 96.70% → 유지 | 소 — Branches +0.15%p |
| wallet-sdk | 90.04% → 유지 | 79.09% → **85%** | 100% → 유지 | 중 — Branches +5.91%p |
| admin | 87.56% → **90%** | 80.29% → **85%** | 71.39% → **95%** | **대** — 전 메트릭 인상, Functions 최대 |
| sdk | 85.89% → **90%** | 95.25% → 유지 | 85.91% → **95%** | 중 — Lines +4.11%p, Functions +9.09%p |
| daemon | 85.31% → **90%** | 81.36% → **85%** | 94.26% → **95%** | **대** — Lines +4.69%p, Functions +0.74%p |
| cli | 81.08% → **90%** | 78.25% → **85%** | 98.03% → 유지 | 중 — Lines +8.92%p, Branches +6.75%p |
| shared | 측정 불가 → **90%** | 측정 불가 → **85%** | 측정 불가 → **95%** | 중 — vitest 설정 추가 후 측정 필요 |

### 임계값 최종 목표

모든 패키지 vitest.config.ts + coverage-gate.sh 동기화. 원칙: **max(현재 임계값, 통일 기준)**

| 패키지 | Lines/Stmts (현재→목표) | Branches (현재→목표) | Functions (현재→목표) |
|--------|----------------------|--------------------|--------------------|
| core | 95 (유지) | 91 (유지) | 93→**95** |
| **daemon** | 85→**90** | 80→**85** | 87→**95** |
| solana | 89→**90** | 80→**85** | 89→**95** |
| evm | 92 (유지) | 71→**85** | 93→**95** |
| **sdk** | 80→**90** | 89 (유지) | 80→**95** |
| **cli** | 77→**90** | 79→**85** | 92→**95** |
| mcp | 87→**90** | 83→**85** | 93→**95** |
| **admin** | 87→**90** | 80→**85** | 71→**95** |
| wallet-sdk | 87→**90** | 76→**85** | 98 (유지) |
| push-relay | 82→**90** | 90 (유지) | 94→**95** |
| actions | 95 (유지) | 79→**85** | 95 (유지) |
| **shared** | —→**90** | —→**85** | —→**95** |

---

## 구현 대상

### Phase 1: daemon DeFi Provider + Pipeline 테스트 강화

daemon에서 가장 큰 미커버 영역인 DeFi Action Provider와 Pipeline 엣지 케이스에 테스트 추가. daemon Lines 90%, Branches 85%, Functions 95% 달성의 핵심.

| 대상 | 내용 | 예상 추가 테스트 |
|------|------|----------------|
| Jupiter Swap Provider | resolve/execute 경로, 에러 처리, 슬리피지 검증 | 15-20개 |
| 0x Swap Provider | 견적 조회, 체인 매핑, hex→decimal 변환 | 12-15개 |
| LI.FI Bridge Provider | 크로스체인 라우트, 토큰 주소 매핑, 타임아웃 | 12-15개 |
| Lido/Jito Staking Provider | deposit/withdraw, 스테이크 계정 처리 | 10-12개 |
| Aave V3 Lending Provider | supply/borrow/repay/withdraw, health factor | 15-20개 |
| Pipeline stages 엣지 케이스 | DELAY 재진입, 가스 추정 실패, 서명 타임아웃 | 15-20개 |
| Gas Conditional Executor | 가스 조건 평가, 폴링 로직, 만료 처리 | 8-10개 |

### Phase 2: daemon Infra + Admin API + Notification 테스트

| 대상 | 내용 | 예상 추가 테스트 |
|------|------|----------------|
| IncomingTxMonitor | 구독 관리, 감지 로직, DB 저장, 알림 트리거 | 15-20개 |
| EVM/Solana Subscriber | 폴링/WSS 재연결, 블록 스캔, 트랜잭션 파싱 | 12-15개 |
| Admin API 라우트 | settings, actions, sessions, wallets CRUD 엣지 케이스 | 15-20개 |
| Notification 템플릿 | 금액 포맷팅, 익스플로러 링크, 카테고리 필터링 | 8-10개 |
| RPC Pool | 로테이션, 재시도, 장애 격리, WSS 전환 | 10-12개 |

### Phase 3: evm Branches + wallet-sdk Branches 강화

evm Branches 76.53%→85%(최대 갭), wallet-sdk Branches 79.09%→85% 집중. ~~solana Branches~~ v32.7에서 89.15% 달성으로 제외.

| 대상 | 내용 | 예상 추가 테스트 |
|------|------|----------------|
| EVM 가스 추정 분기 | 체인별 가스 전략, EIP-1559/legacy/EIP-4844 분기 | 15-20개 |
| EVM ERC 토큰 에러 경로 | ERC-20/721/1155 전송 실패, 잔액 부족, 승인 부족 | 10-15개 |
| EVM RPC fallback 분기 | 재시도, 타임아웃, 프로바이더 전환 | 8-10개 |
| wallet-sdk 서명 분기 | 서명 채널별 에러 경로, 타임아웃, 재시도 | 10-15개 |

### Phase 4: admin Functions + cli Lines/Branches 강화

admin Functions 71.39%→95%(최대 난이도), cli Lines 81.08%→90%, cli Branches 78.25%→85%.

| 대상 | 내용 | 예상 추가 테스트 |
|------|------|----------------|
| Admin 페이지 이벤트 핸들러 | 폼 제출, 버튼 클릭, 모달 인터랙션 테스트 | 25-30개 |
| Admin 조건부 렌더링 함수 | 상태별 UI 분기, 로딩/에러/빈 상태 | 10-15개 |
| Admin 폼 검증/변환 유틸 | 입력 검증, 데이터 변환, 에러 메시지 | 10-12개 |
| CLI 명령어 엣지 케이스 | 인자 파싱 실패, config 미설정, 네트워크 에러 | 15-20개 |

### Phase 5: sdk + shared + 나머지 패키지 + 임계값 최종 인상

| 대상 | 내용 | 예상 추가 테스트 |
|------|------|----------------|
| SDK client.ts 미커버 경로 | DeFi/ERC-8004 메서드 엣지 케이스, HTTP 에러 경로 | 15-20개 |
| SDK Functions 미커버 | 미호출 메서드, 에러 핸들러, 변환 함수 | 10-15개 |
| SDK validation.ts 분기 | 검증 실패 분기, 옵셔널 파라미터 조합 | 5-8개 |
| shared 패키지 vitest 설정 + Lines | vitest.config 추가, 유틸리티 함수, 상수 모듈 테스트 추가 | 15-20개 |
| actions/mcp Branches | 나머지 소량 갭 해소 (각 0.15~0.41%p) | 5-10개 |
| 전 패키지 임계값 최종 인상 | vitest.config.ts 12개 + coverage-gate.sh 동기화 | — |

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | DeFi Provider 테스트 방식 | 외부 API 목킹 vs 실제 호출 | 목킹 — 테스트 안정성 + CI 환경 독립성. 실제 API 호출은 rate limit, 네트워크 불안정으로 flaky test 유발 |
| 2 | Pipeline 테스트 전략 | 단위 테스트 vs 통합 테스트 | 혼합 — stage 함수 단위 테스트 + 주요 경로 통합 테스트. 단위 테스트만으로는 stage 간 상호작용 검증 불가 |
| 3 | IncomingTx 테스트 | WebSocket 실제 연결 vs mock | mock — 테스트 격리 + 결정적 동작. Solana WSS/EVM 폴링 모두 목킹 |
| 4 | 통일 커버리지 기준 | Lines 85%/Branches 80% vs **Lines 90%/Branches 85%/Functions 95%** vs Lines 95%/Branches 95% | **90/85/95** — Lines 95%는 WalletConnect 등 외부 의존 코드에 대한 비용 대비 효과 낮음. Branches 95%는 방어 코드/에러 경로까지 전부 커버해야 하여 비현실적. 90/85/95는 비즈니스 로직 중심 커버리지 확보와 실현 가능성의 균형점 |
| 5 | CI Gate mode | soft → hard 즉시 전환 vs 단계적 | hard 즉시 전환 — #209(임계값 인상 이슈)에서 현행 수치 기반으로 인상하므로 즉시 hard mode 가능 |
| 6 | admin Functions 테스트 방식 | @testing-library/preact vs 직접 함수 호출 | 혼합 — 이벤트 핸들러는 @testing-library/preact로 사용자 인터랙션 시뮬레이션, 순수 유틸은 직접 호출 |
| 7 | 임계값 인상 시점 | 테스트 추가와 동시 vs 마지막 Phase에서 일괄 | Phase별 점진 인상 — 각 Phase 완료 시 해당 패키지 임계값 즉시 인상하여 하락 방지. 최종 Phase에서 누락분 일괄 동기화 |

---

## E2E 검증 시나리오

**자동화 비율: 100%**

### 커버리지 목표 달성 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | 전 패키지 Lines ≥ 90% | `pnpm turbo run test:unit` 후 각 패키지 coverage-summary.json lines ≥ 90% | [L0] |
| 2 | 전 패키지 Branches ≥ 85% | 동일 — branches ≥ 85% | [L0] |
| 3 | 전 패키지 Functions ≥ 95% | 동일 — functions ≥ 95% | [L0] |
| 4 | 전 패키지 임계값 통과 | `pnpm turbo run test:unit` 전체 통과 (0 failures) | [L0] |
| 5 | CI Gate hard mode 작동 | coverage-gate.sh exit code 0 확인 | [L0] |
| 6 | 기존 임계값 미하향 | 각 vitest.config.ts diff에서 기존 수치보다 낮은 값 없음 | [L0] |

### DeFi Provider 테스트 품질

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 7 | 각 DeFi Provider resolve() 성공/실패 경로 | 정상 견적 + API 에러 + 타임아웃 케이스 커버 | [L0] |
| 8 | 각 DeFi Provider execute() 성공/실패 경로 | 정상 실행 + 슬리피지 초과 + 가스 부족 케이스 커버 | [L0] |
| 9 | Provider 등록/해제 핫 리로드 | Settings 변경 시 레지스트리 갱신 검증 | [L0] |

### Pipeline 엣지 케이스

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 10 | DELAY 재진입 시 원본 request 보존 | #208 수정 후 모든 트랜잭션 타입 재진입 검증 | [L0] |
| 11 | GAS_WAITING 재진입 시 원본 request 보존 | 가스 조건 충족 후 실행 시 request 무결성 검증 | [L0] |
| 12 | 서명 타임아웃 → FAILED 전이 | 승인 대기 만료 시 올바른 상태 전이 + 알림 | [L0] |
| 13 | 가스 추정 실패 → 적절한 에러 반환 | 시뮬레이션 실패 시 사용자에게 유의미한 에러 메시지 | [L0] |

### evm Branches 강화 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 14 | EVM 가스 추정 체인별 분기 커버 | EIP-1559/legacy/EIP-4844 각 경로 테스트 존재 | [L0] |
| 15 | ERC 토큰 에러 경로 커버 | 잔액 부족/승인 부족/컨트랙트 리버트 케이스 커버 | [L0] |

### admin Functions 강화 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 16 | Admin 페이지 이벤트 핸들러 커버 | 주요 폼 제출/버튼 클릭 테스트 존재 | [L0] |
| 17 | Admin Functions ≥ 95% | admin coverage-summary.json functions ≥ 95% | [L0] |

---

## 선행 조건

| 의존 대상 | 이유 | 상태 |
|----------|------|------|
| #209 (임계값 인상 이슈) | 현행 수치 기반 임계값 먼저 인상 필요 — 이 마일스톤은 인상된 기준 위에 추가 테스트 | **FIXED** (v29.3) |
| #208 (DELAY 재진입 데이터 손실) | Pipeline 재진입 테스트의 전제조건 — 버그 수정 후 테스트 작성 | **FIXED** (v29.3) |
| #207 (파이프라인 재진입 알림 누락) | 알림 관련 테스트의 전제조건 | **FIXED** (v29.3) |

모든 선행 조건 해결 완료 — 즉시 착수 가능.

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | daemon Lines 90% 달성 불가 | WalletConnect, Lifecycle 등 외부 의존 코드의 테스트가 비용 대비 효과 낮을 수 있음 | 최소 88% 달성 후 ROI 재평가. 외부 의존 코드는 통합 테스트로 커버 |
| 2 | **admin Functions 95% 달성 불가** | UI 컴포넌트의 이벤트 핸들러, 조건부 렌더링 함수가 예상보다 많을 수 있음 | 최소 90% 달성 후 나머지는 dead code 제거로 비율 개선. @testing-library/preact 활용 극대화 |
| 3 | **evm Branches 85% 달성 불가** | 체인별 특수 분기, viem 내부 에러 경로가 테스트하기 까다로울 수 있음 | 최소 82% 달성 후 ROI 재평가. 체인 목킹 헬퍼 패턴 도입으로 비용 절감 |
| 4 | 테스트 실행 시간 증가 | 400+개 신규 테스트 추가 시 CI 시간 증가 가능 | vitest forks pool + 병렬 실행으로 완화. 테스트 파일 단위 분리 |
| 5 | 목킹 과다로 테스트 신뢰도 하락 | 외부 API 목킹이 실제 동작과 괴리될 수 있음 | 목킹 데이터를 실제 API 응답 기반으로 작성. 통합 테스트로 보완 |
| 6 | 테스트 유지보수 부담 증가 | 400+개 신규 테스트의 향후 유지 비용 | 테스트 헬퍼/팩토리 패턴 활용하여 중복 최소화 |

---

## 예상 규모

| 항목 | 예상 |
|------|------|
| 페이즈 | **5개** |
| 신규 테스트 파일 | 25-35개 |
| 신규 테스트 케이스 | **400-500개** |
| 수정 파일 | 14-18개 (vitest.config.ts 12개 + coverage-gate.sh + ci.yml) |
| 예상 LOC 추가 | +20,000~30,000줄 (테스트 코드) |
| 주요 작업 | daemon Lines 90%(+4.69%p), evm Branches 85%(+8.47%p), admin Functions 95%(+23.61%p) |
| 임계값 변경 | 전 패키지 Lines→90, Branches→85, Functions→95 통일 (기존 초과분 유지) |

---

*생성일: 2026-02-27*
*갱신일: 2026-03-17 — v32.7 기준 커버리지 실측으로 전면 갱신. solana 전 메트릭 달성(89.15% Branches)으로 작업 목록에서 제외, core Functions 갭 증가(+1.25%p), cli Lines/Branches 소폭 하락 반영, shared vitest.config 미설정 상태 명시.*
*선행: #207, #208, #209 — 전부 FIXED (v29.3)*
*관련: v2.2 (테스트 커버리지 강화), v2.4.1 (Admin UI 테스트 복원), #184 (임계값 상향)*
