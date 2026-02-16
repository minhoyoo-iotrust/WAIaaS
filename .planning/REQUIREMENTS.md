# Requirements: WAIaaS v1.7 품질 강화 + CI/CD

**Defined:** 2026-02-16
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.

## v1.7 Requirements

설계 문서(46-51, 64) 기반 테스트 시나리오 전수 구현 + CI/CD 파이프라인 구축.

### 보안 테스트

- [ ] **SEC-01**: 세션 인증 공격 시나리오 20건 구현 (JWT 위조/만료 우회/세션 탈취 등, 설계 문서 43)
- [ ] **SEC-02**: 정책 우회 공격 시나리오 9건 구현 (TOCTOU 경합/금액 에스컬레이션, 설계 문서 44)
- [ ] **SEC-03**: Kill Switch 복구 공격 시나리오 8건 구현 (상태 전이 위조/dual-auth 우회, 설계 문서 45)
- [ ] **SEC-04**: 키스토어+외부 보안 시나리오 10건 구현 (키스토어 공격 6건 + 외부 위협 4건, 설계 문서 46)
- [ ] **SEC-05**: 경계값+연쇄 공격 시나리오 24건 구현 (금액/시간/TOCTOU 경계값 19건 + E2E 연쇄 5건, 설계 문서 47)
- [ ] **SEC-06**: 토큰 정책 보안 시나리오 32건 구현 (ALLOWED_TOKENS 우회 등, 설계 문서 64)
- [ ] **SEC-07**: 컨트랙트 화이트리스트 보안 시나리오 28건 구현 (CONTRACT_WHITELIST/METHOD_WHITELIST 우회, 설계 문서 64)
- [ ] **SEC-08**: Approve 관리 보안 시나리오 24건 구현 (무제한 approve 차단/APPROVED_SPENDERS 우회, 설계 문서 64)
- [ ] **SEC-09**: 배치 분할 우회 보안 시나리오 22건 구현 (소액 분할 합산 우회/All-or-Nothing, 설계 문서 64)
- [ ] **SEC-10**: Oracle 가격 조작 보안 시나리오 20건 구현 (가격 조작/fallback/stale 가격, 설계 문서 64)
- [ ] **SEC-11**: Action Provider 보안 시나리오 16건 구현 (악의적 플러그인/권한 에스컬레이션, 설계 문서 64)
- [ ] **SEC-12**: Swap 슬리피지/MEV 보안 시나리오 12건 구현 (슬리피지 초과/MEV 공격, 설계 문서 64)
- [ ] **SEC-13**: ChainError 보안 시나리오 12건 구현 (에러 카테고리 오분류/재시도 무한 루프, 설계 문서 64)
- [ ] **SEC-14**: x402 결제 보안 시나리오 ~12건 구현 (SSRF 우회/X402_ALLOWED_DOMAINS 우회/결제 금액 조작)

### 확장 기능 테스트

- [ ] **EXT-01**: 토큰 전송 테스트 32건 구현 (SPL/ERC-20/Token-2022/ALLOWED_TOKENS 정책)
- [ ] **EXT-02**: 컨트랙트 호출 테스트 28건 구현 (EVM/Solana ContractCallRequest, CONTRACT_WHITELIST/METHOD_WHITELIST)
- [ ] **EXT-03**: Approve 관리 테스트 24건 구현 (ApproveRequest, APPROVED_SPENDERS/AMOUNT_LIMIT/TIER_OVERRIDE 3중 정책)
- [ ] **EXT-04**: 배치 트랜잭션 테스트 22건 구현 (Solana 원자적 배치, 2단계 합산, All-or-Nothing)
- [ ] **EXT-05**: Oracle 테스트 20건 구현 (IPriceOracle, OracleChain fallback, 5분 TTL, 가격 나이, 교차 검증)
- [ ] **EXT-06**: Action Provider 테스트 16건 구현 (IActionProvider, resolve-then-execute, Registry, MCP Tool 변환)
- [ ] **EXT-07**: ChainError 테스트 12건 구현 (3-카테고리 PERMANENT/TRANSIENT/STALE, retryable 자동 파생)

### 플랫폼 테스트

- [ ] **PLAT-01**: CLI Daemon 플랫폼 테스트 32건 구현 (init/start/stop/status/signal/exit codes/E2E, 설계 문서 51)
- [ ] **PLAT-02**: Docker 플랫폼 테스트 18건 구현 (build/compose/volume/env/grace/secrets/healthcheck/non-root, 설계 문서 51)
- [ ] **PLAT-03**: Telegram Bot 플랫폼 테스트 34건 구현 (polling/commands/callbacks/auth/format/shutdown, 설계 문서 51)

### Contract Test

- [ ] **CTST-01**: IChainAdapter Contract Test — MockChainAdapter vs SolanaAdapter 22 메서드 동작 동일성 검증
- [ ] **CTST-02**: IChainAdapter Contract Test — MockChainAdapter vs EvmAdapter 22 메서드 동작 동일성 검증 (buildBatch → BATCH_NOT_SUPPORTED)
- [ ] **CTST-03**: IPolicyEngine Contract Test — MockPolicyEngine vs DatabasePolicyEngine 4-tier 평가 동일성 검증
- [ ] **CTST-04**: INotificationChannel Contract Test — MockNotificationChannel vs TelegramChannel 전송 동일성 검증
- [ ] **CTST-05**: IClock Contract Test — FakeClock vs SystemClock now() 반환 타입 동일성 검증
- [ ] **CTST-06**: IPriceOracle Contract Test — MockPriceOracle vs OracleChain getPrice/getPrices/getNativePrice 동일성 검증
- [ ] **CTST-07**: IActionProvider Contract Test — MockActionProvider vs TestESMPlugin metadata/getDefinitions/resolve/execute 동일성 검증

### 블록체인 테스트

- [ ] **CHAIN-01**: Level 1 Mock RPC 13개 시나리오 구현 (SOL 전송/잔액/수수료/RPC 실패/잔액 부족/Blockhash 만료 등, 설계 문서 48)
- [ ] **CHAIN-02**: Level 2 Local Validator Solana E2E 5개 흐름 구현 (SOL/SPL 전송/배치/에러 복구/성능 기준)
- [ ] **CHAIN-03**: Level 2 Local Validator EVM Anvil 통합 구현 (ETH/ERC-20 전송/gas 추정 검증)
- [ ] **CHAIN-04**: Level 3 Devnet 최대 3건 구현 (SOL 전송/잔액 조회/헬스 체크, continue-on-error)

### Enum 검증

- [ ] **ENUM-01**: 16개 Enum SSoT 빌드타임 검증 스크립트 구현 (as const → TS → Zod → Drizzle → DB CHECK 4단계 방어, 설계 문서 49)
- [ ] **ENUM-02**: config.toml 로딩 검증 12건 구현 (CF-01~12: 기본값/TOML 오버라이드/환경변수/잘못된 값 등, 설계 문서 49)
- [ ] **ENUM-03**: NOTE-01~11 매핑 중 테스트 필요 4건 (22 테스트 케이스) 구현 (설계 문서 49)

### CI/CD

- [ ] **CICD-01**: ci.yml 구현 — Stage 1(push: lint+typecheck+unit) + Stage 2(PR: full suite + coverage gate), cancel-in-progress, turbo affected
- [ ] **CICD-02**: nightly.yml 구현 — UTC 02:30 cron, full-suite + local-validator(solana-test-validator + Anvil) + devnet(continue-on-error)
- [ ] **CICD-03**: release.yml 구현 — full-test-suite + chain-integration + platform-cli + platform-docker + coverage-report, Docker 빌드, npm dry-run
- [ ] **CICD-04**: coverage-report.yml 구현 — davelosert/vitest-coverage-report-action@v2, 핵심 4 패키지 PR 코멘트
- [ ] **CICD-05**: Composite Action setup 구현 — Node.js 22 + pnpm + Turborepo 캐시 + dependencies 설치
- [ ] **CICD-06**: coverage-gate.sh 스크립트 구현 — Soft/Hard 모드 전환, 패키지별 독립 임계값, 환경변수 기반

### 커버리지 인프라

- [ ] **COV-01**: Vitest workspace 루트 설정 — vitest.workspace.ts 전체 패키지 관리, v8 커버리지 프로바이더
- [ ] **COV-02**: 패키지별 커버리지 임계값 설정 — Critical(core 90%+/keystore 95%+), High(daemon 85%+/adapter-solana 80%+), Normal(cli/mcp/admin 70%+), Low(adapter-evm 50%+)
- [ ] **COV-03**: Turborepo 테스트 태스크 분리 — test:unit/test:integration/test:security/test:chain/test:platform 스크립트 정의

### Mock 인프라

- [ ] **MOCK-01**: Mock 10개 경계 인프라 구축 — M6(Jupiter msw) + M7(가격 API msw) + M8(온체인 오라클) + M9(MockPriceOracle) + M10(MockActionProvider) 신규 5개 추가 (기존 M1~M5 보완)

## v2 Requirements

다음 마일스톤으로 이연:

- **NATIVE-01**: native addon prebuildify 크로스 빌드 (npm 배포용, v1.8)
- **DESKTOP-01**: Tauri Desktop 5플랫폼 테스트 34건 (자동 6 + QA 28, v2.6.1)
- **SWAP-01**: JupiterSwapProvider Contract Test 추가 (v2.3.1)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Tauri Desktop 플랫폼 테스트 | v2.6.1로 이연, Desktop 미구현 |
| Desktop 5플랫폼 크로스 빌드 | v2.6.1로 이연 |
| JupiterSwapProvider Contract Test | v2.3.1 이후 추가, TestESMPlugin으로 대체 검증 |
| Self-hosted CI 러너 | 무료 러너로 충분, 비용/관리 부담 |
| npm 실제 publish | v2.0에서 dry-run 플래그 제거로 활성화 |
| Docker Hub 실제 push | v2.0에서 활성화 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COV-01 | Phase 151 | Pending |
| COV-02 | Phase 151 | Pending |
| COV-03 | Phase 151 | Pending |
| MOCK-01 | Phase 151 | Pending |
| ENUM-01 | Phase 152 | Pending |
| ENUM-02 | Phase 152 | Pending |
| ENUM-03 | Phase 152 | Pending |
| CTST-01 | Phase 153 | Pending |
| CTST-02 | Phase 153 | Pending |
| CTST-03 | Phase 153 | Pending |
| CTST-04 | Phase 153 | Pending |
| CTST-05 | Phase 153 | Pending |
| CTST-06 | Phase 153 | Pending |
| CTST-07 | Phase 153 | Pending |
| CHAIN-01 | Phase 154 | Pending |
| CHAIN-02 | Phase 154 | Pending |
| CHAIN-03 | Phase 154 | Pending |
| CHAIN-04 | Phase 154 | Pending |
| SEC-01 | Phase 155 | Pending |
| SEC-02 | Phase 155 | Pending |
| SEC-03 | Phase 155 | Pending |
| SEC-04 | Phase 155 | Pending |
| SEC-05 | Phase 155 | Pending |
| SEC-06 | Phase 156 | Pending |
| SEC-07 | Phase 156 | Pending |
| SEC-08 | Phase 156 | Pending |
| SEC-09 | Phase 156 | Pending |
| SEC-10 | Phase 156 | Pending |
| SEC-11 | Phase 156 | Pending |
| SEC-12 | Phase 156 | Pending |
| SEC-13 | Phase 156 | Pending |
| SEC-14 | Phase 156 | Pending |
| EXT-01 | Phase 157 | Pending |
| EXT-02 | Phase 157 | Pending |
| EXT-03 | Phase 157 | Pending |
| EXT-04 | Phase 157 | Pending |
| EXT-05 | Phase 157 | Pending |
| EXT-06 | Phase 157 | Pending |
| EXT-07 | Phase 157 | Pending |
| PLAT-01 | Phase 158 | Pending |
| PLAT-02 | Phase 158 | Pending |
| PLAT-03 | Phase 158 | Pending |
| CICD-01 | Phase 159 | Pending |
| CICD-02 | Phase 159 | Pending |
| CICD-03 | Phase 159 | Pending |
| CICD-04 | Phase 159 | Pending |
| CICD-05 | Phase 159 | Pending |
| CICD-06 | Phase 159 | Pending |

**Coverage:**
- v1.7 requirements: 48 total
- Mapped to phases: 48/48
- Unmapped: 0

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-16 after roadmap creation*
