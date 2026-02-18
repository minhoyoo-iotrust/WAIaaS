# 마일스톤 m18: 품질 강화 + CI/CD

## 목표

설계 단계에서 정의한 300+ 테스트 시나리오를 구현하고, CI/CD 파이프라인으로 지속적 품질을 보장하는 상태.

---

## 구현 대상 설계 문서

이 마일스톤에서 구현하는 설계 문서 목록과 각 문서에서 구현할 범위를 명시한다.

| 문서 | 이름 | 구현 범위 | 전체/부분 |
|------|------|----------|----------|
| 46 | keystore-external-security-scenarios | SEC-04-01~06 키스토어 보안 시나리오 6건 (잠금 상태 서명, authTag 변조, 잘못된 패스워드, 경로 순회, 메모리 클리어, 미존재 키), SEC-04-EX-01~04 외부 위협 시나리오 4건 (Host 헤더, 파일 권한, JWT Secret 노출, Rate Limit 글로벌). 총 10건, Critical 2 / High 6 / Medium 2 | 전체 |
| 47 | boundary-value-chain-scenarios | Part 1 경계값 19건: 금액 경계 6건 (기본/커스텀 정책 INSTANT/NOTIFY/DELAY/APPROVAL -1/정확히/+1 lamport), 시간 경계 8건 (JWT exp, DELAY 쿨다운, APPROVAL 타임아웃, 세션 최대/최소 수명, Blockhash 만료, Nonce TTL, ownerAuth timestamp), TOCTOU 동시성 3건 (reserved_amount, usageStats, BEGIN IMMEDIATE 직렬화), 세션 한도 2건 (maxAmountPerTx, maxTotalAmount/maxTransactions +/-1). Part 2 E2E 연쇄 공격 체인 5건: 세션 한도 소진, 정책 우회+TOCTOU, 금액 에스컬레이션->Kill Switch, 세션 탈취+복구, 시간 기반 우회+연속 실패. 총 24건 | 전체 |
| 48 | blockchain-test-environment-strategy | Solana 3단계 테스트 환경: Level 1 Mock RPC 13개 시나리오 (SOL 전송 성공, 잔액 조회, 수수료 추정, RPC 연결 실패, 잔액 부족, Blockhash 만료, 유효하지 않은 주소, 시뮬레이션 실패, 트랜잭션 실행 실패, RPC 타임아웃, Priority Fee 기본값, 확인 대기 타임아웃, 중복 제출), Level 2 Local Validator E2E 5개 흐름 (SOL 전송, SPL 토큰, 배치 트랜잭션, 에러 복구, 성능 기준), Level 3 Devnet 최대 3건 (SOL 전송, 잔액, 헬스). EVM Adapter Stub 테스트 5건 (타입 준수, isConnected, getHealth, 11 메서드 CHAIN_NOT_SUPPORTED, AdapterRegistry) | 전체 |
| 49 | enum-config-consistency-verification | 16개 Enum SSoT 빌드타임 검증: as const -> TypeScript 타입 -> Zod enum -> Drizzle text enum -> DB CHECK 4단계 방어. 16개 Enum (TransactionStatus 10값, PolicyTier 4값, TransactionType 7값, KillSwitchState 3값, SessionStatus 3값, WalletStatus 5값, OwnerState 3값, NotificationEventType 25값, PolicyType 12값, NotificationLogStatus 2값, AuditAction 25값, ChainType 2값, NetworkType 13값, SolanaNetworkType 3값, EvmNetworkType 10값, EnvironmentType 2값). config.toml 3단계 로딩 검증 12건 (CF-01~12: 기본값, TOML 오버라이드, 환경변수 오버라이드, 잘못된 값, 누락 키, 음수, 빈 문자열, 다중 섹션, 중첩 금지, 경로 확장, 환경변수 우선, 최종 통합). NOTE-01~11 매핑 중 4건 테스트 필요 (22건 테스트 케이스) | 전체 |
| 50 | cicd-pipeline-coverage-gate | GitHub Actions 4-stage 파이프라인: Stage 1 push (~2min, lint+typecheck+unit), Stage 2 PR (~5min, Stage 1 + integration+e2e+security+enum-verify+coverage-gate), Stage 3 nightly (~10min, 전체 + solana-test-validator + Devnet max 3건), Stage 4 release (~15min, 전체 + platform CLI/Docker + full coverage). 4개 YAML (ci.yml/nightly.yml/release.yml/coverage-report.yml), Composite Action (setup), Turborepo 태스크 기반 실행, Soft/Hard 커버리지 게이트 전환, 패키지별 독립 전환 우선순위, 8건 Pitfall 대응 | 전체 |
| 51 | platform-test-scope | 3개 배포 타겟별 테스트 범위: CLI Daemon 32건 (init 4, start 6, stop 5, status 3, signal 5, Windows 2, exit codes 6, E2E 1), Docker 18건 (build 2, compose 2, volume 2, env 2, hostname 1, grace 2, secrets 2, healthcheck 2, non-root 2, auto-init 1), Telegram Bot 34건 (polling 5, commands 10, callbacks 7, auth 4, format 2, callback_data 2, direct approve 2, shutdown 2). 총 84건 (자동 84). Tauri Desktop 34건은 v2.6.1로 이연 | 부분 (Desktop 제외) |
| 64 | extension-test-strategy | v0.6 확장 기능 테스트 전략: Mock 경계 5->10개 확장 (Jupiter API msw 2.x, 가격 API CoinGecko/Pyth/Chainlink mock, 온체인 오라클 mock, IPriceOracle, IActionProvider), Contract Test 5->7개 확장 (IPriceOracle mock vs CoinGeckoOracle 동작 동일성, IActionProvider mock vs TestESMPlugin 동일성 (JupiterSwapProvider는 v2.3.1)), ~148개 신규 테스트 시나리오 (토큰 32, 컨트랙트 28, Approve 24, 배치 22, Oracle 20, Action Provider 16, Swap 12, ChainError 12), ~56개 신규 보안 시나리오 (토큰 정책 우회, 컨트랙트 화이트리스트, 무제한 approve, 배치 분할 우회, 가격 조작, 스왑 슬리피지 등). EVM Stub -> Hardhat/Anvil 전환 | 전체 |

### v1.1~v1.6.1에서 작성된 테스트와 v1.7 추가 범위 구분

| 구분 | 기존 (v1.1~v1.6.1) | v1.7에서 추가 |
|------|-------------------|-------------|
| 단위 테스트 | 각 마일스톤에서 모듈별 구현과 동시 작성 (커버리지 게이트 미적용) | 누락분 보완 + Hard 80% 달성을 위한 추가 테스트 |
| Contract Test | IChainAdapter, IPolicyEngine 기본 Contract Test (v1.1~v1.4) | IPriceOracle, IActionProvider Contract Test 추가 (7개 완성) |
| 블록체인 테스트 | Mock RPC 기본 시나리오 (v1.1), Local Validator SOL/SPL 흐름 (v1.4) | Mock RPC 13개 전수 + Anvil EVM 통합 + Devnet 3건 체계 완성 |
| 보안 테스트 | 각 마일스톤에서 해당 기능의 보안 시나리오 부분 작성 | 71건(46-47) + 166건(64) + ~12건(x402) = ~249건 보안 시나리오 전수 통과 |
| 플랫폼 테스트 | CLI 기본 테스트 (v1.1), Docker 기본 (v1.6) | CLI 32건 + Docker 18건 + Telegram 34건 = 84건 전수. Tauri 34건은 v2.6.1로 이연 |
| Enum 검증 | tsc --noEmit로 빌드타임 검증 (v1.1~) | SSoT 검증 스크립트 + config.toml 12건 + NOTE 테스트 22건 완성 |
| CI/CD | 로컬 테스트만 실행 (CI/CD 미구축) | 4-stage 파이프라인 4개 YAML + 커버리지 게이트 Hard 신규 도입 |
| 크로스 빌드 | 단일 플랫폼 빌드 | native addon prebuildify (npm 배포용). Desktop 5플랫폼 빌드는 v2.6.1로 이연 |

---

## 산출물

### 1. 단위 테스트

모듈별 Vitest 테스트 스위트. 커버리지 게이트 기준:
- v1.1~v1.6: CI 없이 로컬 테스트만 실행 (커버리지 게이트 미적용)
- **v1.7: CI/CD 도입과 동시에 Hard 80% 게이트 적용 (미달 시 PR 머지 차단)**

패키지별 커버리지 임계값 (Hard Gate):

| 패키지 | Tier | Target | branches/functions/lines/statements |
|--------|------|--------|--------------------------------------|
| @waiaas/core | Critical | 90%+ | 85/90/90/90 |
| @waiaas/daemon/keystore | Critical | 95%+ | 90/95/95/95 |
| @waiaas/daemon/services | Critical | 90%+ | 85/90/90/90 |
| @waiaas/daemon/middleware | High | 85%+ | 80/85/85/85 |
| @waiaas/daemon/routes | High | 80%+ | 75/80/80/80 |
| @waiaas/daemon/database | High | 80%+ | 75/80/80/80 |
| @waiaas/daemon/notifications | High | 80%+ | 75/80/80/80 |
| @waiaas/daemon/lifecycle | Normal | 75%+ | 70/75/75/75 |
| @waiaas/adapter-solana | High | 80%+ | 75/80/80/80 |
| @waiaas/adapter-evm | Low | 50%+ | 45/50/50/50 |
| @waiaas/sdk | High | 80%+ | 75/80/80/80 |
| @waiaas/cli | Normal | 70%+ | 65/70/70/70 |
| @waiaas/mcp | Normal | 70%+ | 65/70/70/70 |
| @waiaas/admin | Normal | 70%+ | 65/70/70/70 |

### 2. Contract Test

Mock 10개 경계와 7개 Contract Test 시나리오:

**Mock 10개 경계:**

| # | Mock 대상 | Mock 방식 | 소스 |
|---|----------|----------|------|
| M1 | 블록체인 RPC | MockChainAdapter (canned responses) | 42-mock-boundaries |
| M2 | 알림 채널 | MockNotificationChannel | 42-mock-boundaries |
| M3 | 파일시스템 | memfs (Unit) / tmpdir (Integration) | 42-mock-boundaries |
| M4 | 시간 (IClock) | FakeClock (DI) | 42-mock-boundaries |
| M5 | Owner 서명 | FakeOwnerSigner (DI) | 42-mock-boundaries |
| M6 | Jupiter API | msw 2.x setupServer() HTTP 인터셉터 | 64-extension-test |
| M7 | 가격 API | msw handlers (CoinGecko/Pyth) | 64-extension-test |
| M8 | 온체인 오라클 | Mock Pyth 프로그램 | 64-extension-test |
| M9 | IPriceOracle | MockPriceOracle (jest.fn()) | 64-extension-test |
| M10 | IActionProvider | MockActionProvider (jest.fn()) | 64-extension-test |

**Contract Test 7개:**

| # | 인터페이스 | Mock | 실제 구현체 | 검증 내용 |
|---|----------|------|-----------|----------|
| CT-1 | IChainAdapter | MockChainAdapter | SolanaAdapter | 22 메서드 동작 동일성 |
| CT-2 | IChainAdapter | MockChainAdapter | EvmAdapter | 22 메서드 동작 동일성 (buildBatch -> BATCH_NOT_SUPPORTED) |
| CT-3 | IPolicyEngine | MockPolicyEngine | DatabasePolicyEngine | 4-tier 평가 동작 동일성 |
| CT-4 | INotificationChannel | MockNotificationChannel | TelegramChannel | 알림 전송 동작 동일성 |
| CT-5 | IClock | FakeClock | SystemClock | now() 반환 타입 동일성 |
| CT-6 | IPriceOracle | MockPriceOracle | OracleChain (Pyth→CoinGecko fallback) | getPrice/getPrices/getNativePrice 동작 동일성 |
| CT-7 | IActionProvider | MockActionProvider | TestESMPlugin (fixtures) | metadata/getDefinitions/resolve/execute 동작 동일성 (JupiterSwapProvider는 v2.3.1 이후 추가) |

### 3. 블록체인 테스트

3단계 환경:

**Level 1 — Unit Mock (빠른 피드백, 매 커밋):**
- `createMockRpcTransport()` 기반 13개 시나리오
- 테스트 속도 <1ms/call, 결정성 100%
- SolanaAdapter 메서드 로직, ChainError 에러 매핑 11종, 에러 복구 재시도
- `--maxWorkers=75%` (병렬 실행)

**Level 2 — Local Validator (통합 검증, nightly 필수):**
- `solana-test-validator` + Anvil (Foundry)
- Solana E2E 5개 흐름: SOL 전송, SPL 토큰 전송, 배치 트랜잭션, 에러 복구, 성능 기준
- EVM: Anvil ETH 전송, ERC-20 전송, gas 추정 검증
- `--runInBand --testTimeout=60000`

**Level 3 — Devnet (외부 API, nightly only):**
- 최대 3건: SOL 전송, 잔액 조회, 헬스 체크
- `continue-on-error: true` (네트워크 불안정 대응)
- `--runInBand --testTimeout=60000`

### 4. 보안 테스트

총 ~249건 공격 시나리오. 71건(46-47) + 166건(64) + ~12건(x402).

**v0.4 보안 시나리오 71건 (문서 43~47):**

| 문서 | 요구사항 | 시나리오 수 | 분류 |
|------|---------|-----------|------|
| 43-layer1-session-auth-attacks | SEC-01 | 20건 (12 + 8 OA) | 세션 탈취/위조(15건), JWT 만료 우회, 세션 제약 초과 |
| 44-layer2-policy-bypass-attacks | SEC-02 | 9건 | TOCTOU 경합(8건), 정책 우회, 금액 에스컬레이션 |
| 45-layer3-killswitch-recovery-attacks | SEC-03 | 8건 | Kill Switch 상태 전이, 복구 서명 위조, dual-auth |
| 46-keystore-external-security | SEC-04 | 10건 (6 + 4 EX) | 키스토어 공격(12건), API 인증 우회(8건) |
| 47-boundary-value-chain | SEC-05 | 24건 (19 + 5) | 경계값, 연쇄 공격 체인 |

**v0.6 확장 보안 시나리오 ~166건 (문서 64) + x402 보안 ~12건:**

| 도메인 | 시나리오 수 | 분류 |
|--------|-----------|------|
| 토큰 정책 | 32건 | ALLOWED_TOKENS 우회, 미허용 토큰 전송, 미설정 에이전트 |
| 컨트랙트 화이트리스트 | 28건 | CONTRACT_WHITELIST/METHOD_WHITELIST 우회, 기본 거부 |
| Approve 관리 | 24건 | 무제한 approve 차단, APPROVED_SPENDERS 우회 |
| 배치 분할 우회 | 22건 | 소액 분할 합산 우회, All-or-Nothing 위반 |
| Oracle 가격 조작 | 20건 | 가격 조작, fallback 체인, stale 가격, 교차 검증 |
| Action Provider | 16건 | 악의적 플러그인, 권한 에스컬레이션 |
| Swap 슬리피지/MEV | 12건 | 슬리피지 초과, MEV 공격, Jupiter API 변조 |
| ChainError | 12건 | 에러 카테고리 오분류, 재시도 무한 루프 |
| x402 결제 보안 | ~12건 | SSRF 우회(private IP/localhost), X402_ALLOWED_DOMAINS 우회, 결제 금액 조작, 비활성 상태 결제 시도, DELAY/APPROVAL 타임아웃 검증, EIP-712/TransferChecked 서명 위변조 |

### 5. 플랫폼 테스트

총 84건 (자동 84건):

| 플랫폼 | 자동화 | 수동 QA | 합계 | 주요 범위 |
|--------|--------|---------|------|----------|
| CLI Daemon | 32건 | 0건 | 32건 | init 4, start 6, stop 5, status 3, signal 5, Windows 2, exit codes 6, E2E 1 |
| Docker | 18건 | 0건 | 18건 | build 2, compose 2, volume 2, env 2, hostname 1, grace 2, secrets 2, healthcheck 2, non-root 2, auto-init 1 |
| Telegram Bot | 34건 | 0건 | 34건 | polling 5, commands 10, callbacks 7, auth 4, format 2, callback_data 2, direct approve 2, shutdown 2 |

> Tauri Desktop 34건 (자동 6 + QA 28)은 v2.6.1로 이연.

디렉토리 구조:

```
packages/
├── cli/__tests__/platform/          # CLI 32건
│   ├── init.platform.test.ts
│   ├── start-stop.platform.test.ts
│   ├── status.platform.test.ts
│   ├── signal.platform.test.ts
│   └── e2e-flow.platform.test.ts
├── daemon/__tests__/
│   ├── security/                     # 보안 ~249건
│   │   ├── layer1-session/           # SEC-01 20건
│   │   ├── layer2-policy/            # SEC-02 9건
│   │   ├── layer3-killswitch/        # SEC-03 8건
│   │   ├── keystore-external/        # SEC-04 10건
│   │   ├── boundary-chain/           # SEC-05 24건
│   │   ├── extension/                # v0.6 ~166건
│   │   └── x402/                     # x402 결제 보안 ~12건
│   ├── platform/                     # Docker 18건 + Telegram 34건
│   │   ├── docker.platform.test.ts
│   │   └── telegram-bot.platform.test.ts
│   └── chain/                        # 블록체인 테스트
│       ├── mock-rpc/                 # Level 1: 13건
│       └── chain-integration/        # Level 2: 5 E2E 흐름
└── adapters/
    ├── solana/__tests__/chain/       # Solana 통합 + Devnet 3건
    └── evm/__tests__/chain/          # Anvil EVM 통합
```

### 6. 확장 기능 테스트

~148개 신규 테스트 시나리오 (v0.6 확장):

| 도메인 | 시나리오 수 | 주요 내용 |
|--------|-----------|----------|
| 토큰 전송 | 32건 | SPL buildSplTokenTransfer, ERC-20 buildErc20Transfer, Token-2022 분기, ALLOWED_TOKENS 정책 |
| 컨트랙트 호출 | 28건 | ContractCallRequest EVM/Solana, CONTRACT_WHITELIST/METHOD_WHITELIST, 기본 전면 거부 |
| Approve 관리 | 24건 | ApproveRequest 독립 타입, APPROVED_SPENDERS/AMOUNT_LIMIT/TIER_OVERRIDE 3중 정책 |
| 배치 트랜잭션 | 22건 | Solana 원자적 배치, 2단계 정책 합산, All-or-Nothing, batch_items 정규화 |
| Oracle | 20건 | IPriceOracle, OracleChain fallback, 5분 TTL, 가격 나이 3단계, 교차 검증 |
| Action Provider | 16건 | IActionProvider, resolve-then-execute, ActionProviderRegistry, MCP Tool 변환 |
| Swap | 12건 | Jupiter Quote/Swap-instructions, 슬리피지 50/500bps, Jito MEV 보호 |
| ChainError | 12건 | 3-카테고리(PERMANENT 17/TRANSIENT 4/STALE 4), category->retryable 자동 파생 |

### 7. Enum 검증

빌드타임 SSoT 검증 스크립트:

| 검증 대상 | 검증 방법 | 실행 시점 |
|----------|----------|----------|
| as const -> TypeScript 타입 | `tsc --noEmit` 컴파일 에러 감지 | Stage 1 (매 커밋) |
| TypeScript -> Zod enum | Zod enum 타입 불일치 컴파일 에러 | Stage 1 (매 커밋) |
| Zod -> Drizzle text enum | Drizzle text enum 타입 불일치 컴파일 에러 | Stage 1 (매 커밋) |
| Drizzle -> DB CHECK SQL | `generateCheckConstraint()` 출력 검증 테스트 | Stage 2 (매 PR) |
| 16개 Enum 전수 | Enum 값 목록 snapshot + 파싱 round-trip 테스트 | Stage 2 (매 PR) |
| config.toml 로딩 | CF-01~12 12건 Unit 테스트 | Stage 1 (매 커밋) |
| NOTE-01~11 매핑 | 테스트 필요 4건(22 테스트 케이스) | Stage 2 (매 PR) |

### 8. CI/CD

GitHub Actions 4개 YAML:

**`ci.yml` (push + pull_request):**
- Stage 1 (push): lint -> typecheck -> unit-test (`turbo run --affected`)
- Stage 2 (PR): Stage 1 + integration-test + e2e-test + security-test + enum-verify + coverage-gate
- `concurrency: cancel-in-progress: true`
- coverage-gate: `COVERAGE_GATE_MODE` 환경변수 (soft/hard)
- 주요 step: `turbo run lint --affected`, `turbo run typecheck --affected`, `turbo run test:unit --affected -- --coverage --ci --maxWorkers=75%`

**`nightly.yml` (schedule + workflow_dispatch):**
- UTC 02:30 cron + 수동 트리거
- full-suite: 전체 패키지 lint + typecheck + unit + integration + e2e + security (`--affected` 없음)
- local-validator: `metadaoproject/setup-solana@v1.0` + `solana-test-validator` + `turbo run test:chain`
- devnet: max 3건, `continue-on-error: true`

**`release.yml` (release published + workflow_dispatch):**
- full-test-suite -> chain-integration + platform-cli + platform-docker + coverage-report (병렬)
- Docker 이미지 빌드 + health check
- npm publish (dry-run으로 검증만 — 실제 배포는 v2.0에서 CI 트리거 모델로 전환 시 활성화)
- native addon prebuildify (npm 배포용)

> v1.7에서 만드는 release.yml은 **릴리스 품질 게이트** 역할. 실제 npm publish / Docker Hub push는 v2.0 릴리스 시 dry-run 플래그 제거로 활성화.
> Desktop 5플랫폼 크로스 빌드 (macOS ARM64/x64, Windows x64, Linux x64/ARM64)는 v2.6.1로 이연.

**`coverage-report.yml` (pull_request):**
- davelosert/vitest-coverage-report-action@v2 (Vitest 네이티브 지원)
- 핵심 4 패키지 PR 코멘트: core, daemon, adapter-solana, sdk
- 나머지 패키지 콘솔 텍스트 리포트

---

## 기술 결정 사항

| # | 결정 항목 | 선택지 | 결정 근거 |
|---|----------|--------|----------|
| 1 | Vitest workspace 설정 | 루트 vitest.workspace.ts에서 전체 패키지 관리 | 모노레포 단일 진입점으로 커버리지 집계 통합. 패키지별 vitest.config.ts는 개별 설정 오버라이드에만 사용 |
| 2 | 커버리지 리포터 | v8 (Vitest 내장) | Vitest의 기본 커버리지 프로바이더. c8보다 안정적이고 Vitest 생태계와 긴밀 통합 |
| 3 | 보안 테스트 분류 | 별도 `__tests__/security/` 디렉토리 | 보안 시나리오 ~249건을 레이어별로 구조화. 모듈별 분산 시 전수 확인 어려움. `turbo run test:security`로 독립 실행 가능 |
| 4 | CI 러너 | ubuntu-latest (GitHub Actions 호스티드) | Self-hosted 러너 관리 부담 회피. Solana validator 시작은 ~30초로 허용 가능. nightly에서만 실행하므로 비용 효율적 |
| 5 | Docker 빌드 캐시 | Docker layer cache (GitHub Actions cache) | `actions/cache@v4`로 Docker layer 캐싱. 빌드 시간 ~50% 단축 예상. Turborepo 캐시와 독립 |
| 6 | 크로스 플랫폼 빌드 | GitHub Actions matrix 전략 | 단일 release.yml 내 matrix로 5 타겟 병렬 빌드. 별도 워크플로우 분리 시 관리 복잡도 증가 |
| 7 | Solana validator CI 설정 | metadaoproject/setup-solana action | 공식 지원 action으로 Solana CLI 설치 자동화. 수동 설치 스크립트 대비 유지보수 용이 |
| 8 | 커버리지 게이트 구현 | CI script assert (scripts/coverage-gate.sh) | Vitest --coverage.thresholds는 패키지별 세밀 제어 어려움. CI 스크립트에서 Soft/Hard 모드 전환 + 환경변수 기반 유연한 운영 |

---

## E2E 검증 시나리오

**자동화 비율: 100% -- `[HUMAN]` 0건**

### CI/CD 파이프라인 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 1 | git push -> CI push.yml 트리거 -> lint + type-check + unit test 통과 | push 이벤트 후 CI 전체 통과, exit code 0 | [L0] |
| 2 | PR 생성 -> CI pr.yml 트리거 -> full test suite + coverage gate 통과 | PR CI 전체 통과, coverage-gate job 성공 | [L0] |
| 3 | PR 커버리지 < Soft 60% -> 경고 댓글 (CI 통과) | coverage-gate.sh soft 모드에서 `::warning::` annotation 생성 + exit 0 | [L0] |
| 4 | PR 커버리지 < Hard 80% (v1.7 이후) -> 머지 차단 | coverage-gate.sh hard 모드에서 `::error::` + exit 1 -> PR merge 차단 | [L0] |
| 5 | nightly -> Solana validator + Anvil 통합 테스트 전수 통과 | nightly.yml local-validator job 통과, E2E 5개 흐름 assert | [L1] |
| 6 | nightly -> 보안 시나리오 ~249건 전수 통과 (71건 + 166건 + ~12건 x402) | nightly.yml full-suite job의 test:security 전수 통과 | [L0] |
| 7 | release tag -> Docker 이미지 빌드 + push | release.yml platform-docker job 통과, health check 200 OK | [L1] |
| 8 | release tag -> npm publish (dry-run) | release.yml npm publish --dry-run exit code 0 | [L1] |

### 테스트 프레임워크 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 9 | Enum SSoT 빌드타임 검증: as const <-> DB CHECK 일치 | 16개 Enum 파싱 round-trip + generateCheckConstraint 출력 assert | [L0] |
| 10 | Contract Test: IChainAdapter mock <-> SolanaAdapter 동작 동일성 | 22 메서드 호출 결과 비교 assert (반환 타입 + 에러 타입 일치) | [L0] |
| 11 | Contract Test: IPriceOracle mock <-> OracleChain 동작 동일성 | getPrice/getPrices/getNativePrice 반환 스키마 + fallback 동작 비교 assert | [L0] |

### 블록체인 통합 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 12 | 블록체인 Level 2: solana-test-validator SOL 전송 + SPL 전송 통합 | Airdrop -> buildTransaction -> simulate -> sign -> submit -> waitForConfirmation CONFIRMED assert | [L1] |
| 13 | 블록체인 Level 2: Anvil ETH 전송 + ERC-20 전송 통합 | Anvil 기동 -> ERC-20 deploy + mint -> transfer -> CONFIRMED assert | [L1] |
| 14 | 블록체인 Level 3: Devnet 실 트랜잭션 (nightly only) | Devnet Airdrop -> SOL 전송 -> 잔액 변경 assert (continue-on-error) | [L1] |

### 플랫폼 테스트 검증

| # | 시나리오 | 검증 방법 | 태그 |
|---|---------|----------|------|
| 15 | 플랫폼 CLI: 32건 시나리오 전수 통과 | release.yml platform-cli job에서 turbo run test:platform 전수 통과 | [L0] |
| 16 | 플랫폼 Docker: 18건 시나리오 전수 통과 | release.yml platform-docker job에서 build + health check + teardown 전수 통과 | [L1] |

---

## 의존

| 의존 대상 | 이유 |
|----------|------|
| v1.6 (Telegram Bot + Docker + Kill Switch) | 테스트 대상 코드가 v1.6까지 구현 완료되어야 테스트 작성 가능. CI/CD 파이프라인도 모든 패키지가 존재해야 의미 있는 커버리지 측정 가능. Desktop(v2.6.1)은 이연 |
| v1.6.1 (WalletConnect Owner 승인) | WalletConnect 세션 관리, 모바일 월렛 서명 검증, APPROVAL/DELAY 승인 흐름의 테스트가 v1.7 보안/통합 테스트 범위에 포함. WC 에러 코드 4개(WC_NOT_CONFIGURED/WC_SESSION_EXISTS/WC_SESSION_NOT_FOUND/WC_SIGNING_FAILED), APPROVAL_CHANNEL_SWITCHED 알림, MCP 18개 도구(wc_connect/wc_status/wc_disconnect 추가)도 커버리지 대상 |

---

## 리스크

| # | 리스크 | 영향 | 대응 방안 |
|---|--------|------|----------|
| 1 | Solana validator CI 환경 안정성 | validator 시작/종료 타이밍, 포트 충돌으로 nightly chain-tests 불안정 | `metadaoproject/setup-solana` action + health check 30초 폴링 + `--reset --quiet --no-bpf-jit` 옵션. 실패 시 자동 재시도 workflow |
| 2 | native addon prebuildify 호환성 | sodium-native, better-sqlite3 prebuildify에서 일부 플랫폼 실패 가능 | v0.7 prebuildify 전략 설계 완료. npm 배포용으로만 사용 (Desktop 5플랫폼 빌드는 v2.6.1로 이연) |
| 3 | CI 실행 시간 | 보안 ~249건 + 통합 테스트 전수 실행 시 nightly 30분+ 예상 | 보안 테스트 `--maxWorkers=75%` 병렬화. 블록체인 테스트는 nightly에만 배치. Stage 1-2는 `--affected`로 영향 범위만 실행 |
| 4 | 커버리지 게이트 Hard 80% 달성 난이도 | 외부 API 의존 코드(Jupiter, CoinGecko)의 커버리지 확보 어려움 | Mock 경계 10개로 외부 의존 격리. 패키지별 독립 Hard 전환으로 점진적 달성. Tauri Desktop 커버리지는 v2.6.1로 이연 |
| 5 | GitHub Actions 무료 러너 제한 | CI 실행 시간 누적 시 월간 사용량 제한 도달 가능 | Desktop 5플랫폼 크로스빌드를 v2.6.1로 이연하여 부담 경감. 필요 시 self-hosted 검토 |
| 6 | Devnet 테스트 외부 의존성 | Solana Devnet/EVM testnet 불안정, Airdrop rate limit, 공용 RPC 과부하 | max 3건 제한(CHAIN-DEVNET-LIMIT-3), `continue-on-error: true`, 순차 실행(`--runInBand`). Devnet 실패가 nightly 전체를 차단하지 않음 |

---

*최종 업데이트: 2026-02-16 — v1.6.1 shipped 반영(16개 Enum, 90 에러 코드, MCP 18도구, NotificationEventType 25값), Chainlink 참조 제거(Pyth+CoinGecko only), CT-6 OracleChain 검증 대상 변경, IChainAdapter 22 메서드, JupiterSwapProvider→TestESMPlugin, coverage-report→Vitest 호환, x402 보안 ~12건 추가(총 ~249건), Admin 커버리지 타겟 추가, release.yml 역할 명확화*
