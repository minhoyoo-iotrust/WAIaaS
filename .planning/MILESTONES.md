# Project Milestones: WAIaaS

## v33.8 XRPL DEX 지원 (Shipped: 2026-04-04)

**Phases completed:** 3 phases, 7 plans, 6 tasks

**Key accomplishments:**

- RippleAdapter.buildContractCall() extended with calldata JSON routing for OfferCreate/OfferCancel via shared buildXrplNativeTx helper
- tx-parser extended to parse OfferCreate/OfferCancel as CONTRACT_CALL with TakerGets-based spending amount extraction
- 1. [Rule 3 - Blocking] xrpl dependency missing from @waiaas/actions
- 1. [Rule 1 - Bug] Missing requiredApis field in metadata
- XRPL DEX CONTRACT_CALL calldata parsing for accurate USD spending limit -- XRP drops via native oracle, IOU safe fallback
- XRPL DEX framework integration verified via 16 tests + Admin UI transaction type labels improved to human-readable format

---

## v33.6 XRP 메인넷 지원 (Shipped: 2026-04-03)

**Phases completed:** 4 phases (470-473), 10 plans, 37 requirements

**Key accomplishments:**

- @waiaas/adapter-ripple 패키지 — IChainAdapter 25 메서드 구현, Ed25519 키 + r-address 도출, xrpl.Client WebSocket RPC
- XRP 네이티브 전송 — drops 변환, 동적 reserve, Destination Tag, LastLedgerSequence, validated ledger 확인
- Trust Line 토큰 지원 — TrustSet(tfSetNoRipple), IOU 전송, 3-char/40-char hex 통화 코드, account_lines 자산 조회
- XLS-20 NFT 전송 — NFTokenCreateOffer/AcceptOffer 2-step 모델, pending_accept 상태, URI/taxon 메타데이터
- SSoT 자동 전파 — ChainType 'ripple' 추가만으로 REST/MCP/SDK/Admin UI 전 인터페이스 자동 지원
- DB v62 마이그레이션 — 6 테이블 CHECK 제약조건 확장, CAIP-2 xrpl:0/1/2, CAIP-19 slip44:144 + token 네임스페이스

**Stats:**

- 4 phases, 10 plans, 37 requirements, 27 commits
- 152 files changed, +13,772 / -1,441 lines
- @waiaas/adapter-ripple: 3,120 LOC, 131 tests
- Timeline: 2 days (2026-04-02 → 2026-04-03)
- WalletConnect v2 QR 연결 + ownerAuth 8단계 미들웨어 + Owner API 8개 엔드포인트 + owner_wallets 스키마 + Relay 장애 CLI 대안 전체 설계
- INotificationChannel 3채널 추상화 + NotificationService 폴백/broadcast + notification_channels/notification_log DB 스키마 + TokenBucketRateLimiter + 최소 2채널 제한 모드 전체 설계
- Kill Switch 6단계 캐스케이드 프로토콜 + 3상태 머신 + 이중 인증 복구 + AutoStopEngine 5개 규칙 타입 + auto_stop_rules 테이블 + EvmAdapterStub 13메서드 전체 설계
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- v0.1 -> v0.2 변경 매핑 문서 작성 및 6개 SUPERSEDED 대상 문서에 경고 표기 추가
- IBlockchainAdapter -> IChainAdapter 인터페이스 매핑, RFC 9457 46개 -> 36개 에러 코드 변환, 4단계 에스컬레이션 -> 4-tier 정책 대응표 작성
- Settings key-value table (Drizzle + v5 migration) with AES-256-GCM HKDF credential encryption for operational config DB storage
- SettingsService CRUD with DB > config.toml > default fallback, AES-GCM credential auto-encryption, and first-boot config.toml auto-import hook in daemon startup
- 3 admin settings REST endpoints (GET/PUT/POST) with OpenAPI schemas, credential masking, key validation, and RPC connectivity testing
- HotReloadOrchestrator dispatching settings changes to notification channel swap, RPC adapter eviction, and security parameter refresh without daemon restart
- Complete settings page overhaul with 5 category sections (notifications, RPC, security, WalletConnect, daemon), dirty tracking save bar, RPC connectivity testing with latency, and notification test delivery
- 14-test comprehensive settings page test suite covering all 5 categories, credential masking, save/discard flow, RPC/notification test interactions, and error handling
- 3 new MCP tools (call_contract, approve_token, send_batch) for full discriminatedUnion 5-type parity with REST API and SDK
- 11 new tests for call_contract/approve_token/send_batch MCP tools, MCPSDK-04 design decision formally revoked with feature parity principle, BUG-017 closed
- 3 API skill files (quickstart, wallet, transactions) with correct v1.4.4 endpoints, discriminatedUnion 5-type documentation, and masterAuth/sessionAuth curl examples for AI agent onboarding
- 10-PolicyType CRUD reference + 12 admin endpoint reference completing the 5-file AI agent skill set
- EnvironmentType(testnet/mainnet) Zod SSoT 파생 체인, 13개 네트워크 전수 매핑, WalletSchema 변경 설계, 키스토어 영향 분석을 단일 설계 문서(docs/68)로 확립
- v6a(ADD COLUMN + UPDATE 역참조) + v6b(wallets 12-step 재생성 with 13개 CASE WHEN) 마이그레이션 전략을 copy-paste 수준 SQL로 완성하고, pushSchema/Drizzle 동기화 + 테스트 전략 + 위험 완화를 포함한 설계 문서(docs/69) 작성
- resolveNetwork() 3단계 우선순위 순수 함수 + PipelineContext.resolvedNetwork 전파 + ENVIRONMENT_NETWORK_MISMATCH 에러 코드 + AdapterPool 호출부 2곳 변경 통합 설계 문서(docs/70, 7개 섹션)
- ALLOWED_NETWORKS 11번째 PolicyType + 4단계 network override + policies v8 12-step 마이그레이션 통합 설계 (docs/71, 8개 섹션)
- REST API 7개 엔드포인트의 network/environment 파라미터 확장, 멀티네트워크 잔액 집계 엔드포인트 신설, 3-Layer 하위호환 전략 + OpenAPI 변경 전수 목록 설계
- MCP 6개 도구 + TS/Python SDK 3개 메서드의 network 파라미터 Zod/타입 수준 설계, 3개 인터페이스 통합 하위호환 매트릭스, quickstart --mode 5단계 CLI 워크플로우 의사코드 완성
- EnvironmentType Zod SSoT (testnet/mainnet 2값) + 환경-네트워크 매핑 상수 2개 + 순수 함수 4개를 TDD로 구현, 31개 테스트 전부 GREEN
- v6a/v6b/v8 SQLite 마이그레이션으로 wallets.network을 environment+default_network 2컬럼으로 분리, Drizzle 스키마 동기화, 807개 테스트 전체 PASS
- Wallet/Transaction/Policy Zod 스키마를 environment 모델로 전환하고, ALLOWED_NETWORKS 11번째 PolicyType SSoT + 라우트 레이어 적용
- ALLOWED_NETWORKS 정책 평가 + 4단계 override resolveOverrides + evaluateAndReserve network SQL 필터 TDD 구현
- resolveNetwork() 순수 함수 TDD 구현 -- 3단계 우선순위 네트워크 해결 + chain/environment 교차 검증 + ENVIRONMENT_NETWORK_MISMATCH 에러 코드 69번째 등록
- transactions.ts/daemon.ts/pipeline.ts에 resolveNetwork() 통합 -- 환경 불일치 WAIaaSError 변환 + AdapterPool resolvedNetwork 전달 + daemon.ts 재진입 tx.network 직접 사용 + 통합 테스트 5개
- balance/assets 엔드포인트 network 쿼리 파라미터 + 월렛/트랜잭션 응답 environment/network 필드 보강
- PUT /wallets/:id/default-network + GET /wallets/:id/networks 엔드포인트와 ALLOWED_NETWORKS 정책 CRUD 통합 검증
- MCP 6개 도구에 network optional 파라미터 추가 + get_wallet_info 신규 도구로 멀티체인 MCP 인터페이스 완성
- TS SDK + Python SDK에 network 선택 파라미터 추가하여 멀티체인 잔액 조회 및 트랜잭션 실행 지원
- Admin UI 월렛 생성/상세를 environment 기반으로 전환하고, Available Networks 관리 UI + ALLOWED_NETWORKS 정책 타입 추가
- waiaas quickstart --mode testnet/mainnet 명령으로 Solana + EVM 2개 월렛 일괄 생성 + 네트워크 조회 + MCP 세션 생성 + config snippet 출력
- 4개 API 스킬 파일을 environment 기반 멀티체인 모델로 전면 동기화 + ALLOWED_NETWORKS 11번째 정책 타입 + CLI quickstart 대안 섹션
- SSoT 열거형에 SIGNED/SIGN 추가, ParsedTransaction/SignedTransaction 타입 정의, IChainAdapter 2개 메서드 선언, 4+2 에러 코드 추가, DB migration v9로 CHECK 제약 갱신
- Solana tx-parser.ts로 base64 unsigned tx 파싱 (4종 operation 식별) + adapter.ts에 parseTransaction/signExternalTransaction 구현, 10개 TDD 테스트 통과
- EVM unsigned tx 파싱 유틸리티 (tx-parser.ts) + EvmAdapter parseTransaction/signExternalTransaction 구현, ERC-20 transfer/approve selector 기반 4종 operation 분류, 13개 TDD 테스트
- SettingsService 기반 3개 기본 거부 토글 추가 -- DatabasePolicyEngine DI + Admin UI 체크박스
- SettingsService 기반 Default Deny 3개 토글의 ON/OFF, 화이트리스트 공존, hot-reload 동작을 10개 테스트로 검증
- executeSignOnly() 10-step 파이프라인 모듈과 reservation SUM 쿼리 SIGNED 확장으로 외부 tx 서명 + TOCTOU 이중 지출 방지 구현
- POST /v1/transactions/sign 라우트 + TxSignRequest/TxSignResponse OpenAPI 스키마 + 11개 통합 테스트로 sign-only 파이프라인 HTTP 노출
- POST /v1/utils/encode-calldata endpoint wrapping viem encodeFunctionData with ABI_ENCODING_FAILED error code, OpenAPI schemas, sessionAuth
- TS/Python SDK encodeCalldata 메서드 + MCP encode_calldata 도구 + transactions.skill.md 문서화로 3개 클라이언트 인터페이스 완성
- TS/Python SDK signTransaction() 메서드 + MCP sign_transaction 13번째 도구를 추가하여 sign-only REST API를 3개 클라이언트 인터페이스에서 사용 가능하게 함
- GET /v1/skills/:name public REST 엔드포인트 + waiaas://skills/{name} MCP ResourceTemplate으로 5개 API 스킬 파일을 AI 에이전트에 in-context 제공
- POLICY_VIOLATION 알림에 policyType/tokenAddress/contractAddress/adminLink vars 추가 + transactions.skill.md sign-only API 문서화
- 1. [Rule 1 - Bug] AutoStopRuleType 값 수정
- 1. [Rule 2 - Missing Critical] Zod 스키마 전체 섹션 명시
- pushSchema() 3-step 순서 수정 (tables->migrations->indexes)으로 기존 DB 시작 실패 버그 해결, 23개 마이그레이션 체인 테스트 추가
- stdin end/close 감지 + 3초 force-exit 타임아웃으로 Claude Desktop 종료 시 MCP 고아 프로세스 잔류 방지 (BUG-020)
- MCP 14번째 도구 + 세션 스코프 엔드포인트 + CLI wallet 서브커맨드 + TS/Python SDK 메서드로 모든 인터페이스에서 기본 네트워크 변경 가능
- network=all 파라미터로 환경 내 모든 네트워크 잔액/자산 한 번에 조회 + Promise.allSettled 부분 실패 처리 + MCP/SDK/Skill 전체 동기화
- admin/status API에 정책/트랜잭션 통계 추가 + 대시보드 StatCard 링크/추가 카드/최근 활동 테이블 구현
- 월렛 상세에 네이티브/토큰 잔액 + 트랜잭션 테이블 추가, 세션 페이지에서 전체 세션 즉시 조회 + walletName 컬럼 표시
- apiPost 빈 body SYSTEM_LOCKED 버그 수정 + 채널별 개별 [Test] 버튼 UI + Delivery Log 메시지 확장 패널
- notification_logs.message 컬럼 v10 마이그레이션, Slack Incoming Webhook 채널 구현, 전체 알림 메시지 저장/조회 파이프라인 완성
- 설계 문서 61/62/38을 v1.5 아키텍처에 맞게 수정: Pyth Primary + CoinGecko Fallback 2단계 Oracle, Chainlink 제거, MCP 16개 상한 제거 + 14개 도구 현행화
- IPriceOracle Zod SSoT 인터페이스 + Map 기반 LRU 캐시(128항목, 5min TTL, stampede 방지) + classifyPriceAge 3단계 분류기를 TDD로 구현
- PythOracle: Pyth Hermes REST API 기반 IPriceOracle 구현체 -- SOL/ETH/BTC 등 5개 토큰 feed ID 하드코딩 + fetch mock 기반 10개 테스트 TDD
- CoinGecko Demo API 기반 IPriceOracle 구현: SPL/ERC-20 토큰 + 네이티브(SOL/ETH) 가격 조회 + 체인별 배치 + oracle SettingsService 키 2개 등록
- OracleChain: Pyth->CoinGecko->Stale Cache 3단계 fallback + 편차>5% 교차 검증 isStale 격하 + GET /admin/oracle-status 모니터링 엔드포인트
- PriceResult 3-state discriminated union + resolveEffectiveAmountUsd 5-type USD 환산 (TDD 16 tests)
- SpendingLimitRulesSchema Zod SSoT + evaluateSpendingLimit USD 병행 평가 + evaluateAndReserve 코드 통일 (10 tests)
- Stage 3 파이프라인에 OracleChain DI 연결 + resolveEffectiveAmountUsd USD 환산 통합 + notListed NOTIFY 격상/감사로그/힌트 (9 tests)
- IActionProvider Zod SSoT 인터페이스 3개 스키마 + ActionProviderRegistry 등록/조회/실행/ESM 로드 구현 (20 tests)
- api_keys 테이블 DB v11 증분 마이그레이션 + HKDF/AES-256-GCM ApiKeyStore CRUD with 14 unit tests
- Actions REST API 2개 라우트 + DaemonLifecycle Step 4f 초기화 + 11개 통합 테스트 (pipeline 연동 포함)
- Admin UI API Keys 섹션 + GET/PUT/DELETE /v1/admin/api-keys REST API (masterAuth 보호, 마스킹 반환, 10 tests)
- mcpExpose=true Action Provider 액션을 action_{provider}_{action} MCP 도구로 자동 등록 + degraded mode 지원 + 8개 단위 테스트
- admin.skill.md에 oracle-status/api-keys 4개 엔드포인트 추가, actions.skill.md 신규 생성으로 Action Provider REST API 완전 문서화
- One-liner:
- One-liner:
- @x402/core 의존성 + CAIP-2 양방향 매핑 13개 + TransactionType/PolicyType SSoT 확장 + X402 에러 코드 8개 + 23개 신규 테스트
- v12 마이그레이션: transactions + policies 12-step 재생성으로 X402_PAYMENT/X402_ALLOWED_DOMAINS CHECK 제약 갱신 + 7개 체인 테스트
- DNS 사전 해석 + RFC 5735/6890 사설 IP 전체 범위 차단 + IPv4-mapped IPv6 바이패스 방어 + 리다이렉트 hop별 재검증 SSRF 가드 TDD 구현
- x402 전체 파이프라인 오케스트레이션 핸들러 -- SSRF 가드 + 402 파싱 + scheme 자동 선택 + 결제 서명 + 재요청을 조합하는 독립 파이프라인 (25 테스트)
- EVM EIP-3009 + Solana TransferChecked 결제 서명 모듈을 TDD로 구현, viem signTypedData와 @solana/kit signBytes로 체인별 서명 생성
- matchDomain 와일드카드 도메인 매칭 + evaluateX402Domain 기본 거부 정책 평가 + config.toml [x402] 섹션 (enabled/request_timeout)
- USDC $1 직접 환산 + IPriceOracle 폴백으로 x402 결제 금액 USD 변환 모듈 TDD 구현 (7개 EVM 체인 + Solana)
- POST /v1/x402/fetch 엔드포인트: sessionAuth + 도메인 정책 + SSRF + 402 파싱 + SPENDING_LIMIT 4-tier + DELAY/APPROVAL + 결제 서명 + 감사 로그 + 알림 전체 오케스트레이션 (21개 통합 테스트)
- TS SDK x402Fetch() + Python SDK x402_fetch() 메서드 추가 -- POST /v1/x402/fetch 래퍼, 9개 테스트
- MCP x402_fetch 도구 등록 + x402.skill.md 생성 + VALID_SKILLS/SKILL_NAMES 7개 통합
- 12개 PolicyType 전체 Zod 스키마 등록 + DynamicRowList/PolicyFormRouter/JSON 토글 폼 인프라 구축
- 5개 핵심 타입(SPENDING_LIMIT, WHITELIST, RATE_LIMIT, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE) 전용 폼 + 유효성 검증 + 10개 통합 테스트
- 7개 나머지 PolicyType 전용 폼 컴포넌트 + PolicyFormRouter 12-type 완전 분기 + validateRules 12-type 클라이언트 유효성 검증
- PolicyRulesSummary 12-type 목록 시각화 (심볼 배지, req/time, tier bars) + 수정 모달 전용 폼 프리필/저장 + 22개 통합 테스트
- SpendingLimitForm에 daily/monthly USD 한도 입력 필드 추가 + PolicyRulesSummary에 누적 한도 설정값 조건부 시각화
- Commit:
- Admin 환산 유틸리티 생성
- display-currency-helper.ts
- 14-02 준비 상태:
- 1. [Rule 2 - Missing Critical] 에러 코드 매핑 병기
- 금액 경계:
- 1. [Efficiency] 두 태스크를 단일 파일 작성으로 통합
- GitHub Actions 4단계 파이프라인(ci/nightly/release/coverage-report) + Turborepo --affected + Soft/Hard 커버리지 게이트 전환 메커니즘 통합 설계
- 4개 배포 타겟(CLI 32건, Docker 18건, Tauri 6+28건, Telegram 34건) 총 118건 시나리오 확정 + Phase 17 CI/CD Stage 4 통합 매핑 + 정합성 검증 10건
- masterAuth(implicit/explicit)/ownerAuth(2곳)/sessionAuth 3-tier 재분리, 31-endpoint 인증 맵 재배치, 16-downgrade 보상 통제 검증, CLI 수동 서명 4단계 플로우
- agents.owner_address NOT NULL 전환, wallet_connections 테이블 신규(owner_wallets 대체), config.toml walletconnect 선택적 편의 기능, v0.5 마이그레이션 6단계 전략
- 변경 범위:
- 27 tests covering security.tsx 3-tab layout: Kill Switch 3-state actions, AutoStop Rules dirty form, JWT Rotation modal
- 16 tests covering walletconnect.tsx: table rendering, WC session status, Connect/QR modal with polling, Disconnect, empty state, and error handling
- 34 tests for system.tsx covering all 6 sections: API Keys CRUD, Oracle/RateLimit/LogLevel/Currency settings forms, dirty tracking save/discard, and shutdown double-confirmation modal
- 65 unit tests for 5 shared admin components: EmptyState, dirty-guard, UnsavedDialog, SettingsSearch, PolicyRulesSummary covering render, interaction, and all 12 policy types
- 44 targeted tests for sessions/notifications/wallets pages, restoring vitest.config.ts thresholds to 70% with 92% actual coverage
- Dynamic --version from package.json via createRequire, init password guidance with commented config sections, and EACCES permission error handling
- Step logs downgraded to console.debug, EADDRINUSE port conflict detection with lsof hint, and Admin UI URL in daemon ready message
- Quickstart command fully English with session expiry display, 409-idempotent wallet reuse, and correct availableNetworks field parsing
- MCP setup "Run waiaas quickstart first" guidance and 24h default session expiry warning with --expires-in option hint
- Fixed README SDK example field names (balance.balance, tx.id) and extended sync-version.mjs to auto-sync all 14 root + packages skill file version headers at build time
- Minimal npm README files for @waiaas/cli and @waiaas/sdk with install commands, quickstart code, and API reference tables
- docker-compose.yml switched from local build to GHCR image pull, with build override file and .env.example template for zero-friction Docker startup
- Python SDK version synced to 1.7.0 (matching pyproject.toml), default port corrected to 3100 in README/docstrings, .venv/ added to gitignore
- 낙관적 갱신 프로토콜 SSoT(53-session-renewal-protocol.md) 신규 작성: PUT /v1/sessions/:id/renew API, 5종 안전 장치, 토큰 회전, Owner 사후 거부, 알림 이벤트 2종 + 30-session-token-protocol.md SessionConstraints 8필드 확장 및 수명주기 5단계 반영
- sessions 테이블 갱신 컬럼 4개 + PUT /v1/sessions/:id/renew API 스펙 + SESSION_RENEWED/SESSION_RENEWAL_REJECTED 알림 이벤트 2종을 기존 설계 문서 3개에 전파
- CLI 플로우 재설계 SSoT(54-cli-flow-redesign.md) 신규 작성: init 2단계 간소화(DX-01) + agent create --owner(DX-02) + session create masterAuth(DX-03) + --quickstart 4단계 오케스트레이션(DX-04) + --dev 고정 패스워드 + 3종 보안 경고(DX-05), v0.5 CLI 17개 커맨드 전체 요약표 + v0.2 마이그레이션 가이드
- ErrorResponseSchema hint 필드(31개 에러 맵) + MCP 옵션 B(stdio) 채택 + SSH 터널 원격 접근 가이드를 단일 SSoT로 정의
- 28/37/40 설계 문서 3개에 v0.5 인증 모델(masterAuth implicit/explicit, ownerAuth 2곳 한정) + hint 필드 + CLI 간소화 + Docker --dev 주의사항 반영
- One-liner:
- TransferRequest.token 확장 + SPL/ERC-20 빌드 로직 + ALLOWED_TOKENS 정책 + TOKEN_TRANSFER NOTIFY 과도기 전략을 1824줄 설계 문서로 완성
- getAssets() 14번째 메서드 복원 + Solana Token Program/Token-2022 조회 + EVM ALLOWED_TOKENS 기반 multicall 조회 + FeeEstimate ATA 동적 비용 + 테스트 시나리오 44개
- ContractCallRequest(EVM calldata + Solana instruction) + CONTRACT_WHITELIST/METHOD_WHITELIST opt-in 정책 + 파이프라인 5-type discriminatedUnion + DB TransactionType 5개/PolicyType 10개 + 에러 코드 10개 + 보안 시나리오 14개
- ApproveRequest(EVM ERC-20 + Solana SPL) 독립 타입 + APPROVED_SPENDERS/APPROVE_AMOUNT_LIMIT/APPROVE_TIER_OVERRIDE 3중 정책 + race condition 자동 방지 + 단일 delegate 경고 + 보안 시나리오 22개
- BatchRequest/InstructionRequest discriminated union(4 types) + Solana 원자적 배치 빌드(pipe/ATA/CU) + EVM BATCH_NOT_SUPPORTED + 2단계 정책 평가(개별+합산 All-or-Nothing) + 1232 bytes/20 instruction 사전 검증 + 보안 시나리오 14개
- DEFI-01 package structure + DEFI-02 API conversion patterns confirmed with ActionApiClient base, branded SlippageHelper, 8 error codes, and AllowanceHolder flow replacing Permit2
- ActionProvider -> Stage 3 정책 연동 플로우, 4개 프로토콜 CONTRACT_WHITELIST 주소 확정, 크로스체인 정책 규칙 및 도착 주소 변조 방지 3단계 검증 설계
- IAsyncStatusTracker interface with 3 implementations, setTimeout-chain polling scheduler, 11-state transaction machine (GAS_WAITING), integrated DB migration v23, and 3-stage bridge timeout policy
- 4 safety designs confirmed: Jito MEV fail-closed, wstETH adoption, stale calldata re-resolve pattern, and API drift 3-layer defense with effectiveWaitTime RPC failure handling
- Mock API fixture structure, 3 test helpers, and C1-C10 cross-provider scenario matrix with 33 total test scenarios for 4 DeFi providers
- Actions settings category (13 keys) in Admin Settings SSoT with SettingsReader-based provider registration and ACTION_API_KEY_REQUIRED notification
- Sequential pipeline execution for ContractCallRequest arrays with auto-tagged actionProvider and SettingsService-based CONTRACT_WHITELIST bypass
- Admin Actions page with Jupiter Swap and 0x Swap provider cards, enable/disable toggles, API key management, and 14 test cases
- ZeroExApiClient with Zod-validated price/quote responses, AllowanceHolder address mapping for 20 EVM chains, and 19 MSW-based unit tests
- ZeroExSwapActionProvider with approve+swap multi-step resolution, ERC-20 vs native ETH detection, and 17 MSW-based unit tests
- v0.4 테스트 프레임워크에 Mock 경계 5->10개, Contract Test 5->7개 확장 + Hardhat EVM 환경 + 124개 기능/42개 보안 시나리오 7개 도메인 통합 (1577줄)
- One-liner:
- One-liner:
- REST API discriminatedUnion 5-type 스키마 + 5개 엔드포인트(36개 총), SDK/MCP 메서드 18개 + MCP Tool Action 변환(MCP_TOOL_MAX=16) 통합
- executeAction/execute_action methods added to TS and Python SDKs for DeFi action provider API calls with multi-step pipeline support
- Verified MCP auto-registration for zerox_swap and added comprehensive 0x Swap DX documentation with REST/MCP/SDK examples, safety features, and Admin Settings config
- MCP LiFi tool registration verified (5 tests) + actions.skill.md updated with LI.FI Section 5 covering config, parameters, 6 chains, safety features, bridge tracking, and 8 code examples across 4 interfaces
- Solana blockhash freshness guard(getBlockHeight 기반 20초 임계값) + refreshBlockhash(Option A 메시지 캐싱) + IChainAdapter 19개 메서드 확장(getCurrentNonce/resetNonceTracker) + UnsignedTransaction.nonce 승격
- AES-GCM nonce 충돌의 Birthday Problem 정확 공식(P=1-e^(-n^2/(2N))) 정정 + WAIaaS 구조적 불가능성 분석, Priority fee TTL 30초의 Nyquist-Shannon 이론적 근거 확립, 1.5배 fee bump 1회 재시도 전략 설계
- RpcPool class with priority-based RPC URL rotation, exponential cooldown (60s base, 300s max), and AllRpcFailedError -- 24 unit tests covering all fallback scenarios
- BUILT_IN_RPC_DEFAULTS with 13 public RPC endpoints (6 mainnet + 7 testnet) and RpcPool.createWithDefaults() zero-config factory -- 18 tests covering data integrity and factory behavior
- AdapterPool wired to RpcPool with config.toml highest-priority seeding, configKeyToNetwork reverse mapping, and backward-compatible optional rpcUrl -- 27 integration tests covering pool resolution, fallback, config priority, and failure reporting
- 1. [Rule 1 - Bug] Fixed `let` -> `const` for non-reassigned variables in tests
- resolveRpcUrlFromPool helper wired into IncomingTxMonitor subscriberFactory for pool-first RPC URL resolution with SettingsService fallback -- 12 tests covering pool preference, cooldown fallback, and Solana/EVM subscriber creation
- 1. [Rule 3 - Blocking] Fixed pre-existing lint error: let -> const in rpc-pool-defaults.test.ts
- GET /admin/rpc-status endpoint with per-network pool status, multi-URL RPC Endpoints tab with add/delete/reorder/built-in-toggle per network, 11 tests (4 backend + 7 frontend)
- Live RPC pool health indicators (available green / cooldown orange with remaining time) via 15s polling, plus per-URL Test button with latency/block result display, 6 new tests (13 total)
- RPC_ALL_FAILED/RPC_RECOVERED notification events (42->44) with RpcPool onEvent callback emitting 3 event types on cooldown transitions, 5 new tests
- RpcPool onEvent wired to daemon NotificationService for RPC health/failure/recovery alerts, RpcPoolEvent exported from @waiaas/core, 4 integration tests verifying MNTR-01 through MNTR-04
- 섹션 5: 공통 인프라 — positions 테이블
- 섹션 7: 공통 인프라 — REST API 명세
- IDeFiMonitor interface with adaptive polling HealthFactorMonitor, daily MaturityMonitor, and minute-interval MarginMonitor — all designed in m29-00 sections 9-10
- 4 notification events SSoT chain integrated, config.toml [monitoring] 17 flat keys defined, DaemonLifecycle Step 4c-11 with fail-soft start/stop designed in m29-00 sections 11-12
- One-liner:
- Argon2id 메모리 캐시 기반 Master Password 인증 통일(DAEMON-05) + INonceStore 인터페이스 추상화로 Memory/SQLite nonce 저장 전략 패턴 확립(DAEMON-06)
- ILendingProvider interface extending IActionProvider with 4 lending actions, 3 query methods, LendingPosition/HealthFactor/MarketInfo Zod schemas, and LendingPolicyEvaluator with default-deny asset whitelist and LTV limit policies
- GET /v1/wallets/:id/health-factor endpoint with HealthFactorResponseSchema, plus complete Aave V3/Kamino/Morpho Blue protocol-to-ILendingProvider method mapping tables
- IYieldProvider interface with 5 yield actions (buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity), 3 query methods, and 4 Zod type schemas (YieldPositionSummary, MaturityInfo, YieldMarketInfo, YieldForecast) added to m29-00 design doc sections 18-19
- MaturityMonitor↔IYieldProvider 5-stage data flow specified, Phase 268 YIELD schema completeness verified, and full Pendle V2 protocol mapping table connecting all 8 IYieldProvider methods to Router/Hosted SDK endpoints — added as m29-00 section 20 with 5 design decisions
- IPerpProvider interface with 5 perp actions (open/close/modify position, add/withdraw margin), 3 query methods, PerpPositionSummary/MarginInfo/PerpMarketInfo Zod schemas, and PerpPolicyEvaluator with 3 default-deny policy types added to m29-00 sections 21-22
- MarginMonitor 5-stage data flow from DriftProvider through PositionTracker to DB cache, PerpMetadataSchema completeness verification (7 fields all sufficient), Drift V2 SDK mapping tables (5 actions + 3 queries), and cross-protocol comparison added to m29-00 section 23
- SignableOrder Zod schema with EIP-712 domain + intentMetadata, ActionProviderRegistry union return type extension, and TRANSACTION_TYPES 8th value 'INTENT'
- IChainAdapter.signTypedData extension, 10-step intent pipeline, IntentOrderTracker async polling, 4-layer security model with attack vector analysis (21 design decisions total for Phase 273)
- DeFi SSoT enums (POSITION_CATEGORIES, POSITION_STATUSES) with Zod validation, 4 DeFi notification events, defi_monitoring category, and bilingual i18n templates
- Protocol-agnostic DeFi position sync infrastructure with per-category timers, Map-based dedup write queue, pluggable monitor orchestrator, and daemon lifecycle integration
- Adaptive polling health factor monitor with 4-level severity, recursive setTimeout intervals, cooldown-based LIQUIDATION alerts, and on-demand PositionTracker sync
- ContractCallRequestSchema.actionName extension + LENDING_ASSET_WHITELIST/LENDING_LTV_LIMIT policy evaluation + non-spending classification for supply/repay/withdraw
- Manual hex ABI encoding for 7 Aave V3 functions (4 Pool write + approve + 2 read), 5-chain address registry, and Zod input schemas with 'max' support
- Pure decoder functions for Aave V3 on-chain responses with bigint-only HF simulation preventing self-liquidation
- Complete Aave V3 lending provider with 4 actions (supply/borrow/repay/withdraw), dual ILendingProvider+IPositionProvider interface, HF simulation guard, and registerBuiltInProviders integration
- DB migration v27 drops is_default and default_network columns; getSingleNetwork replaces getDefaultNetwork with EVM null return; WALLET_ID_REQUIRED/NETWORK_REQUIRED error codes added
- resolveWalletId rewritten with 2-priority + single-wallet auto-resolve; resolveNetwork uses getSingleNetwork with NETWORK_REQUIRED for EVM chains
- SIWE 검증을 viem/siwe 내장 3단계 함수로 전환하여 ethers/siwe 의존성을 제거하고, 5개 타겟 플랫폼 + prebuildify 기반 native addon SEA 번들 전략을 확정한 5개 설계 문서 수정
- Removed wlt claim from JWT, defaultWalletId from auth middleware, isDefault from session routes/Telegram bot, and deleted setDefaultWalletRoute
- Deleted 2 default-network endpoints, removed defaultNetwork/isDefault from all API responses and OpenAPI schemas, updated 8 route files to use getSingleNetwork and 3-param resolveNetwork
- Removed defaultNetwork from pipeline context, services, and settings; rewrote BalanceMonitor for multi-network iteration; fixed ownerAuth transaction ID lookup; updated 70+ test files for v27 migration compatibility
- Remove all default wallet/default network dead code from TypeScript SDK, CLI, and Python SDK after daemon API cleanup in Phase 280
- Deleted set_default_network MCP tool and updated wallet_id/network descriptions across all 24 remaining MCP tools to remove default wallet/default network references
- Remove all default wallet/network UI from Admin Web UI (wallets, sessions, settings pages) and update 5 skill files to explicit network/wallet specification model
- Sidecar 종료 35초 타임아웃 + SQLite integrity_check 복구, CORS 5종 Origin, Setup Wizard CLI 위임 + waiaas init --json idempotent 스펙 확정
- Owner disconnect 5단계 cascade(APPROVAL->EXPIRED, DELAY 유지) 확정 + 5개 TransactionType x 4 Tier HTTP 응답 매트릭스(INSTANT/NOTIFY->200, DELAY/APPROVAL->202) 확정으로 API-03, API-04 해소
- WAIaaSBaseModel(alias_generator=to_camel)로 Python SDK 필드 변환 SSoT 확정, @waiaas/core Zod 스키마 export + SDK .parse() 사전 검증 패턴 정의
- IPerpProvider interface with 3 Zod SSoT schemas, MarginWarningEvent, 3 perp policy types, and TransactionParam extensions for perp framework
- Adaptive margin ratio monitor with 4-level severity polling and 3 perp policy evaluators (market whitelist, leverage limit, position size limit) in DatabasePolicyEngine Step 4i
- IDriftSdkWrapper abstraction layer with 5 build + 3 query methods, MockDriftSdkWrapper deterministic test data, DriftConfig, and 5 Zod input schemas for Drift Perp
- DriftPerpProvider with 5 perp actions (open/close/modify/add_margin/withdraw_margin) implementing IPerpProvider + IPositionProvider for Drift V2 on Solana
- 81 unit tests covering DriftSdkWrapper (mock + stub), DriftMarketData conversion, and DriftPerpProvider (5 actions + IPerpProvider queries + IPositionProvider compliance + graceful degradation)
- DriftPerpProvider auto-registration via actions.drift_enabled toggle with pendle_yield hot-reload bug fix
- Admin UI Drift Perp Trading card with 4 advanced settings fields and actions.skill.md section 11 documenting 5 perp actions with REST/MCP/SDK/Python examples
- config.toml 17개 중첩 키 평탄화 + WAIAAS_{SECTION}_{KEY} 환경변수 1:1 매핑 확정 + SQLite 타임스탬프 전체 초 단위 통일
- agents 테이블 chain/network CHECK 제약 + NetworkType 'mainnet' 통일 + Docker UID 1001 정합성 + 알림 채널 BEGIN IMMEDIATE TOCTOU 방지
- agents 스키마 v0.8 변경(nullable owner_address, owner_verified CHECK), OwnerState/SweepResult 타입 정의, PolicyDecision downgraded 확장을 설계 문서 25/32에 반영
- IChainAdapter에 sweepAll 20번째 메서드 시그니처를 추가하고, resolveOwnerState() 순수 함수 유틸리티와 Grace->Locked BEGIN IMMEDIATE 원자화 설계를 확정
- One-liner:
- evaluate() Step 9.5에 APPROVAL->DELAY 다운그레이드 삽입, evaluateBatch() 합산 다운그레이드, evaluate() agentOwnerInfo 시그니처 확장, TX_DOWNGRADED 감사 로그, Owner LOCKED 후 정상 APPROVAL 복원 흐름, Stage 4 다운그레이드 분기를 33-time-lock-approval-mechanism.md에 명세
- TX_DOWNGRADED_DELAY 이벤트를 16번째 NotificationEventType으로 추가하고, 3채널(Telegram/Discord/ntfy.sh) 다운그레이드 알림 템플릿에 Owner 등록 CLI 안내를 포함시키며, APPROVAL 승인/거부 버튼을 채널별 제약에 맞게 명세 완료
- POST /v1/owner/agents/:agentId/withdraw API 완전 스펙(요청/응답/에러/인증) + WithdrawService 도메인 서비스(scope all/native 분기) + sweepAll Solana 4단계 실행 순서 + 부분 실패 HTTP 207 처리 설계
- Kill Switch 복구 대기 시간의 Owner 유무 분기(30min vs 24h)와 2단계 복구 패턴을 36-killswitch에 설계하고, 세션 갱신의 OwnerState별 분기(즉시 확정 vs [거부하기] 버튼)를 53-session-renewal과 35-notification에 3채널 명세 완료
- 54-cli-flow-redesign.md를 v0.8 Owner 선택적 모델로 전면 갱신 -- --owner Required->Optional, set-owner/remove-owner/withdraw 3개 CLI 신규, agent info 안내 메시지, --quickstart --chain만 필수, Kill Switch withdraw 방안 A 채택
- objectives/v0.8에 18행x3열 Owner 상태 분기 매트릭스를 SSoT로 작성 -- GRACE APPROVAL=DELAY 다운그레이드 확정(33-time-lock 준수), Kill Switch withdraw 방안 A 반영, v0.8 본문 6곳을 3-State 기준으로 보강, 교차 검증 10건 전건 일치
- 14개 기존 설계 문서 + 3개 참조 문서에 v0.8 Owner 선택적 모델 통합 -- 4개 미변경 문서(30-session, 31-solana, 40-telegram, 36-killswitch)에 첫 v0.8 태그 적용, killSwitchGuard 5번째 허용 경로(withdraw) 반영, 37-rest-api Open Question 해소, 매트릭스 SSoT 교차 검증 전건 통과
- SESSION_EXPIRING_SOON 이벤트를 17번째 NotificationEventType으로 추가하고, 데몬 SessionService 갱신 로직에 shouldNotifyExpiringSession 순수 함수 기반 만료 임박 판단 + notification_log 중복 방지 메커니즘을 설계
- SessionManager 클래스 인터페이스(getToken/start/dispose, 9개 내부 상태, Composition 패턴)와 loadToken() 8-step 토큰 로드 전략(파일>env var, jose decodeJwt, C-03 방어적 범위 검증)을 38-sdk-mcp-interface.md 섹션 6.4에 정의
- scheduleRenewal(절대 시간 기준 + safeSetTimeout + 드리프트 보정), renew(파일-우선 쓰기 H-02 방어), handleRenewalError(5종 에러 분기 테이블), handleUnauthorized(4-step lazy reload)를 38-sdk-mcp-interface.md 섹션 6.4.3~6.4.7에 구현 가능 수준으로 정의
- ApiClient 래퍼 클래스(7개 메서드, request 7-step, handle401 3-step), ApiResult<T> discriminated union 4종 분기, toToolResult/toResourceResult 공통 변환 함수, SessionManager.getState() 추가(SMGI-D01), 6개 tool + 3개 resource handler 리팩토링 패턴을 38-sdk-mcp-interface.md 섹션 6.5~6.5.4에 정의
- 토큰 로테이션 동시성 시퀀스 다이어그램(50ms 대기 + 401 재시도, SMGI-D02), MCP 프로세스 5단계 생명주기(degraded mode + startRecoveryLoop 60초 polling, SMGI-D03), Claude Desktop 에러 처리 전략(isError 회피 5종 + 안내 메시지 JSON 3종 + stdout 오염 방지, SMGI-D04)을 38-sdk-mcp-interface.md 섹션 6.5.5~6.5.7에 정의하고, objectives에 Phase 38 설계 결과 반영
- Commit:
- 38-sdk-mcp-interface.md 섹션 12에 18개 테스트 시나리오(T-01~T-14 핵심 + S-01~S-04 보안) 검증 방법/테스트 레벨/설계 결정 ID 매핑 완료
- 7개 설계 문서 v0.9 태그 검증 + 25-sqlite EXT-03 이연 태그 + pitfall 5건 교차 참조 매트릭스 + REQUIREMENTS 21/21 Complete
- One-liner:
- 34-owner §10에 GRACE 무기한 정책/배타적 전이 트리거 명시, 33-time-lock §11.6과 양방향 SSoT 참조 확정
- ChainError에 category 필드(PERMANENT/TRANSIENT/STALE) 추가, 25개 에러 코드 전체 분류, 카테고리별 복구 전략 테이블 정의
- 66개 에러 코드 통합 매트릭스(HTTP/retryable/backoff SSoT) + 429 응답 포맷 확정 + PolicyType 4->10개 확장 + superRefine type별 rules 검증 분기
- executeStage5() 완전 의사코드: build->simulate->sign->submit 4단계 + ChainError category 기반 에러 분기(PERMANENT/TRANSIENT/STALE) + 티어별 타임아웃(30초/60초) + transitionTo() CAS 패턴
- 53-session-renewal SS5에 token_hash WHERE 조건 낙관적 잠금 + RENEWAL_CONFLICT(409) 에러 정의 추가
- Kill Switch 4개 상태 전이(NORMAL->ACTIVATED, ACTIVATED->RECOVERING, RECOVERING->NORMAL, RECOVERING->ACTIVATED)에 CAS SQL + 전이별 409 에러 코드 + BEGIN IMMEDIATE 원칙 문서화
- 28-daemon §2.5에 7단계 시작 절차별 타임아웃(5~30초) + fail-fast/soft 정책 테이블 + 전체 90초 AbortController 상한 의사코드 추가
- 배치 트랜잭션 부모-자식 2계층 DB 저장 전략 정의 + transactions 스키마에 parent_id/batch_index/PARTIAL_FAILURE 추가
- OracleChain.getPrice()에 10% 괴리 시 보수적 가격 채택을 동기 인라인하고, FRESH/AGING/STALE 3단계 가격 나이 정책 테이블을 신설하여 >30분 시 USD 평가 스킵 정책을 확정
- v1.1(코어 인프라 9개 설계 문서/E2E 12건) + v1.2(인증 정책 7개 설계 문서/E2E 20건) objective 문서 2개 생성, 전체 [L0] 자동화, [HUMAN] 0건
- v1.3 SDK/MCP/알림 + v1.4 토큰/컨트랙트/EVM 확장 objective 문서 2개 생성, 총 62개 E2E 검증 시나리오 + 17개 기술 결정
- v1.5 DeFi+가격오라클(IPriceOracle 3구현체+OracleChain+ActionProvider+Jupiter Swap, 28 E2E) + v1.6 Desktop+Telegram+Docker(Tauri 8화면+Kill Switch CAS+AutoStop 5규칙, 33 E2E) objective 문서 2개 생성
- 설계 부채 추적 파일(Tier 1~3 + 운영 절차) 초기화 완료, 37개 설계 문서 번호가 구현 마일스톤(v1.1~v2.0)에 누락 없이 매핑되었음을 양방향 교차 검증으로 확인
- Registered 'ripple' as 3rd ChainType with 3 XRPL NetworkTypes, environment mappings, native constants (6 decimals/XRP), and WebSocket RPC defaults
- Registered XRPL CAIP-2 chain IDs (xrpl:0/1/2) and CAIP-19 asset identifiers for native XRP (slip44:144) and Trust Line tokens (token:{currency}.{issuer})
- DB v62 12-step table recreation for 6 tables adding ripple chain CHECK and XRPL network CHECK constraints, plus AdapterPool ripple stub with RPC config key mapping
- @waiaas/adapter-ripple package with RippleAdapter (25 IChainAdapter methods), KeyStore ripple Ed25519 key generation, and XRPL WebSocket RPC config
- AdapterPool ripple resolution with dynamic import, full XRP transfer pipeline validation, and 75 unit tests covering all 25 IChainAdapter methods
- TrustSet (tfSetNoRipple), IOU Payment with {currency,issuer,value} Amount, getTokenInfo/getAssets Trust Line queries, and 15-decimal precision IOU parsing
- 120 unit tests covering currency-utils validation/conversion, TrustSet/IOU adapter methods, and 15-decimal tx-parser precision
- XLS-20 NFT transfer via NFTokenCreateOffer with TDD, NftStandardEnum 'XLS-20' extension, and ripple getNativeTokenInfo support
- OpenAPI/SDK chain enums extended with 'ripple', Admin UI wallet creation with XRPL network selector and RPC settings
- 4 skill files updated with ripple/XRP/XRPL/XLS-20 guides including wallet creation, transfers, Trust Lines, and NFT workflows
- pnpm workspace + Turborepo 모노레포 4-패키지 스캐폴드 (core, daemon, adapter-solana, cli) with ESLint flat config, Prettier, Vitest workspace, ESM-only TypeScript project references
- 12 Enum SSoT with as-const-to-Zod pipeline, 5 domain Zod schemas with z.infer type derivation, 66 error codes unified matrix (10 domains) with WAIaaSError base class, validated by 46 unit tests
- 4 contract interfaces (IChainAdapter 10-method, ILocalKeyStore, IPolicyEngine, INotificationChannel) with chain adapter common types, and i18n bilingual message system (en/ko) covering 66 error codes, validated by 65 total unit tests
- 7-table Drizzle ORM schema with WAL mode, CHECK constraints from enum SSoT, UUID v7 IDs, and 37 comprehensive tests
- AES-256-GCM keystore with Argon2id KDF (m=64MiB, t=3, p=4), sodium-native guarded memory, and 32 tests covering encrypt/decrypt/sign round-trip
- smol-toml config loader with 7-section Zod schema, env overrides, nested section rejection; DaemonLifecycle 6-step startup / 10-step shutdown with proper-lockfile, BackgroundWorkers, signal handling; 45 tests
- Hono 4.x API server with 5 middleware (requestId/hostGuard/killSwitchGuard/requestLogger) + errorHandler + GET /health, 19 tests passing
- SolanaAdapter with 10 IChainAdapter methods using @solana/kit 6.x functional pipe pattern, 17 tests with mock RPC
- POST /v1/agents creates Solana key pair + DB row, GET /v1/wallet/address and /balance query via SolanaAdapter, DaemonLifecycle Steps 4-5 filled with adapter init and HTTP server start, 13 new tests (146 total)
- 6-stage transaction pipeline (validate/auth/policy/wait/execute/confirm) with DefaultPolicyEngine INSTANT passthrough, POST /send returning 201 async, GET /:id status query, 21 new tests (167 total)
- 4 CLI commands (init/start/stop/status) via commander ^13.x with PID-based process management and 20 unit tests
- 12 E2E tests covering full user journey (init, start, agent, wallet, transaction, stop, errors) with MockChainAdapter enabling pipeline testing without real Solana RPC
- JWT secret management with dual-key 5-min rotation via jose HS256, sessionAuth middleware validating wai_sess_ tokens against DB sessions
- masterAuth (Argon2id) and ownerAuth (Ed25519) middleware, all 6 endpoints auth-protected via server-level app.use() with 17 new tests
- Session lifecycle CRUD (create/list/revoke) with masterAuth protection, JWT issuance via JwtSecretManager, active session limit enforcement, and 10 TDD tests
- PUT /v1/sessions/:id/renew with 5 safety checks (maxRenewals, absoluteExpiresAt, 50% TTL, token_hash CAS, revocation), token rotation, and 11 TDD tests
- DB-backed policy engine with SPENDING_LIMIT 4-tier BigInt classification, WHITELIST address filtering, and agent-specific override resolution
- Policy CRUD REST API with masterAuth + BEGIN IMMEDIATE TOCTOU prevention via reserved_amount for concurrent spending limit serialization
- DELAY tier cooldown queue with BEGIN IMMEDIATE atomic expiry, JSON_EXTRACT metadata, 11 TDD tests
- APPROVAL tier owner sign-off lifecycle with BEGIN IMMEDIATE atomicity, 3-level timeout, and 14 TDD tests
- Owner NONE/GRACE/LOCKED state machine with lifecycle service, APPROVAL->DELAY downgrade, and transaction approve/reject/cancel API routes with 18 TDD tests
- stage3Policy wired to evaluateAndReserve (TOCTOU-safe) + downgradeIfNoOwner, sessionId audit trail on every transaction INSERT
- stage4Wait with DELAY/APPROVAL branching via PIPELINE_HALTED halt, BackgroundWorkers delay-expired/approval-expired, executeFromStage5 pipeline re-entry
- CLI E2E harness fixed with v1.2 auth (jwtSecretManager + masterPasswordHash + sessionAuth) + 16 gap-closure tests for auth and policy engine edge cases
- Session lifecycle + DELAY/APPROVAL workflow + Owner state E2E tests with ownerAuth Ed25519 signatures, covering TEST-03 through TEST-05 at API level
- Converted all 18 Hono routes to OpenAPIHono createRoute() pattern with auto-generated OpenAPI 3.0 spec via GET /doc and shared response schemas
- IChainAdapter.getAssets() with SolanaAdapter implementation using getBalance + getTokenAccountsByOwner RPC, TDD with 6 test cases
- 6 new OpenAPIHono endpoints (assets, tx list/pending, nonce, agents list/detail) with cursor pagination, ownerState, and 17 test cases
- 9 new REST endpoints (agent PUT/DELETE + 6 admin ops) with 32-code error hint enrichment for AI agent self-recovery and 29 new test cases
- 3 notification channel adapters (Telegram/Discord/ntfy) with 21 event type enums, en/ko message templates, and 39 passing tests
- NotificationService with priority fallback, broadcast for critical events, per-channel rate limiting, CRITICAL audit_log, and daemon lifecycle integration with 31 tests
- @waiaas/sdk zero-dependency package with WAIaaSClient (9 API methods), WAIaaSError, HttpClient fetch layer, and 44 tests
- WAIaaSOwnerClient with 5 ownerAuth/masterAuth methods, exponential backoff retry on all SDK calls, inline sendToken validation, 91 total tests
- Async WAIaaSClient with 8 API methods, 10 Pydantic v2 models, exponential backoff retry, and 47 pytest tests using httpx MockTransport
- @waiaas/mcp package with 6 MCP tools, 3 resources, SessionManager (JWT load + 60% TTL renewal), ApiClient (auth proxy), and stdio transport -- 79 tests passing
- SessionManager hardened with exponential backoff retry (1s/2s/4s), isRenewing concurrency guard, 409 conflict handling, 60s recovery loop, plus CLI `waiaas mcp setup` command for Claude Desktop integration -- 50 new tests
- Preact SPA serving via Hono serveStatic, masterAuth-only login with @preact/signals auth store, CSP/memory-only password/XSS-CSRF defense in design doc 67 sections 1-7
- 5 page wireframes with data flows, CSS Variables design tokens, 8 component interfaces, 68 error code mapping, and fetch wrapper specification in design doc 67 sections 8-10
- Preact + Vite SPA scaffold with turbo.json build ordering and postbuild copy to daemon/public/admin/
- CSP-secured serveStatic at /admin with Kill Switch bypass, config toggle, adminTimeout in status API, and dynamic version from package.json
- Preact signals auth store with inactivity auto-logout, login form against /v1/admin/status, and fetch wrapper with X-Master-Password header injection
- Sidebar layout with hash-based page routing, 7 reusable UI components (Table/Form/Modal/Toast/CopyButton/Badge/EmptyState), 70 error message mappings, and format utilities
- Dashboard stat cards grid with 30s polling for daemon version, uptime, agent count, session count, kill switch state, and status
- Agents page with list/detail CRUD (create, rename, terminate) and Sessions page with agent-scoped session management featuring JWT token one-time display
- Policy CRUD page with 10-type dropdown, agent-scoped filtering, JSON rules editing, and 4-tier SPENDING_LIMIT visualization (green/blue/yellow/red bars)
- Settings page with Kill Switch state toggle, JWT secret rotation confirmation modal, and daemon shutdown type-to-confirm (SHUTDOWN) with post-shutdown overlay
- Vitest + @testing-library/preact infrastructure with 14 tests covering auth flow (login/logout/timeout) and daemon security (CSP, kill switch bypass, admin_ui toggle)
- 14 Preact page tests covering Dashboard (3), Agents (5), Sessions (3), Policies (3), Settings (3) with mocked API client and testing-library assertions
- Per-agent token path isolation (mcp-tokens/<agentId>) with legacy fallback, and agentName-based server naming + description prefix for multi-agent MCP identification
- CLI mcp setup extended with per-agent token paths (mcp-tokens/<agentId>), WAIAAS_AGENT_ID/NAME env vars in config snippets, --all batch setup flag, and slug collision resolution
- notification_logs table with incremental migration (schema_version), fire-and-forget delivery logging in NotificationService, 16 new tests
- Fire-and-forget NotificationService.notify() wired into pipeline stages 1/3/5/6 for TX_REQUESTED, POLICY_VIOLATION, TX_SUBMITTED, TX_FAILED, TX_CONFIRMED events with 8 new tests
- Fire-and-forget notify() wired into POST /sessions (SESSION_CREATED), PUT /agents/:id/owner (OWNER_SET), and session-cleanup worker (SESSION_EXPIRED) with 6 new tests covering all 3 event types + optional chaining safety
- 3 admin notification endpoints (status/test/log) with OpenAPI schemas, credential masking, masterAuth, and paginated Drizzle queries
- Notifications page with channel status cards, test send button, paginated delivery log table, and config.toml guidance info box
- ChainError class with 25 codes mapped to PERMANENT/TRANSIENT/STALE categories, retryable auto-derivation, INSUFFICIENT_FOR_FEE moved to TX domain
- schema_version-based incremental migration runner + z.discriminatedUnion 5-type TransactionRequestSchema for pipeline type routing
- IChainAdapter extended to 20 methods with 7 new types, SolanaAdapter stubs, and Zod superRefine validation for 6 new PolicyType rules schemas
- @waiaas/adapter-evm package with viem 2.x, IChainAdapter 20-method skeleton (6 real + 14 stubs), ERC20_ABI, 13 unit tests
- EvmAdapter 17/20 real methods -- EIP-1559 build/simulate/sign/submit pipeline, 1.2x gas margin, viem multicall ERC-20 metadata, approve calldata, ChainError mapping, 34 tests
- SolanaAdapter SPL/Token-2022 transfer with ATA auto-creation via @solana-program/token + ALLOWED_TOKENS default-deny policy in DatabasePolicyEngine
- EvmAdapter buildTokenTransfer with ERC-20 transfer calldata + getAssets ERC-20 multicall expansion via setAllowedTokens() using viem encodeFunctionData and client.multicall
- buildContractCall on EVM (EIP-1559 calldata) and Solana (programId + AccountRole), CONTRACT_WHITELIST default deny + METHOD_WHITELIST optional method restriction in DatabasePolicyEngine
- SolanaAdapter.buildApprove with SPL ApproveChecked instruction, 3 new approve policy evaluations (spender whitelist, amount limit, tier override) in DatabasePolicyEngine
- SolanaAdapter.buildBatch assembles 2-20 mixed instructions into atomic Solana tx with ATA auto-creation; DatabasePolicyEngine.evaluateBatch performs 2-stage All-or-Nothing policy evaluation with aggregate SPENDING_LIMIT
- Stage 1 discriminatedUnion 5-type parsing with Stage 3 type-based policy routing via buildTransactionParam helper and evaluateBatch delegation for BATCH
- Stage 5 CONC-01 complete: build->simulate->sign->submit loop with ChainError 3-category retry (PERMANENT instant fail, TRANSIENT 1s/2s/4s backoff max 3, STALE rebuild max 1) and buildByType 5-type adapter routing
- NetworkType SSoT extended to 13 values (3 Solana + 10 EVM) with validateChainNetwork cross-validation and EVM_CHAIN_MAP 10-network viem mapping table
- DaemonConfigSchema extended to 16 RPC keys (10 EVM drpc.org defaults + evm_default_network) with EvmAdapter nativeSymbol/nativeName constructor parameterization
- CreateAgentRequestSchema.network made optional with chain-based service-layer defaults and validateChainNetwork integration in POST /agents
- secp256k1 key generation with EIP-55 address derivation via viem, curve/network fields in KeystoreFileV1, backward compat for ed25519-only files
- Chain-aware mock keyStore with 5 EVM agent creation integration tests verifying 0x address, default network, param signature, and DB persistence
- AdapterPool class with lazy-init, caching by chain:network, and fail-soft disconnectAll for multi-chain daemon support
- Wire AdapterPool into daemon lifecycle, server, route handlers, and all test files for multi-chain Solana+EVM support
- schema_version v2 migration with managesOwnTransaction flag expanding agents.network CHECK to accept EVM networks via 12-step table recreation
- POST /v1/transactions/send route schema separation with stage1Validate delegation and OpenAPI oneOf 6-variant component registration
- MCP send_token with TRANSFER/TOKEN_TRANSFER params, TS SDK + Python SDK full 5-type sendToken with per-type validation and backward-compatible body construction
- verifySIWE pure function for EIP-4361 SIWE messages + validateOwnerAddress chain-aware utility with strict EIP-55 and base58 32-byte validation
- Chain-branching owner-auth middleware (solana=Ed25519, ethereum=SIWE) with chain-aware setOwner address validation rejecting invalid addresses per chain type
- 6 E2E tests verifying EVM full lifecycle, Solana+EVM dual operation, and SIWE owner-auth through Hono API with mock adapters
- 10 E2E/integration tests verifying all 5 transaction types flow through full pipeline (stage1-6) with correct adapter method dispatch, plus MCP/SDK parameter passing verification
- 1,310 tests pass with zero new regressions across 86 test files, confirming v1.4.1 milestone (Phases 82-88) ready for tagging
- SQLite v3 migration renames agents table to wallets with FK column/index/enum updates, Drizzle schema wallets definition, and backward-compat agents alias
- Renamed all agent-related Zod schemas, enums, error codes, and i18n messages in @waiaas/core to wallet terminology -- 19 files modified, 137/137 tests passing
- Updated all i18n notification templates (en/ko) to wallet terminology with {walletId}/{walletCount} placeholders, verified 137/137 core tests passing
- 1. [Rule 3 - Blocking] Fixed AGENT_STATUSES -> WALLET_STATUSES in schema.ts and migrate.ts
- 37 daemon test files renamed from agent to wallet terminology with NotificationPayload.agentId boundary preserved and raw SQL bug fixed
- NotificationPayload.walletId and ILocalKeyStore walletId parameters in @waiaas/core, propagated to all daemon notification channels, keystore, and test files
- MCP WalletContext/withWalletPrefix + CLI --wallet flag + WAIAAS_WALLET_ID env var -- complete agent-to-wallet rename across 21 files
- TS SDK and Python SDK response types renamed from agentId to walletId with 159 tests passing
- Admin UI agent->wallet rename across 15 files: endpoints, pages, tests, CSS selectors, error messages
- 15 design docs + README.md updated with wallet terminology (walletId, /v1/wallets, --wallet) matching v1.4.2 codebase, ~236 substitutions with AI agent concept references preserved
- IPolicyEngine/DatabasePolicyEngine/owner-state.ts walletId rename + comprehensive grep/test/OpenAPI verification confirming zero unintentional agent references across 14 source files and 1,326 passing tests
- tag-release.sh script for monorepo-wide semver versioning + all 9 packages bumped to 1.4.3 (BUG-016 fix)
- EVM waitForConfirmation fallback receipt query + stage6Confirm 3-way status branching to prevent SUBMITTED->FAILED false overwrite
- Solana waitForConfirmation returns submitted on RPC error instead of throwing, matching EVM adapter fallback pattern
- Built-in ERC-20 token data for 5 EVM mainnets (24 tokens), tokenRegistry DB table with migration v4, and TokenRegistryService merge layer
- GET/POST/DELETE /v1/tokens endpoints with OpenAPI schemas, EVM network validation, and 17 tests covering service + API integration
- EVM getAssets() wired to return ERC-20 token balances from token registry + ALLOWED_TOKENS policy union with case-insensitive dedup
- POST /v1/mcp/tokens endpoint combining session creation, atomic token file writing, and Claude Desktop config snippet generation behind masterAuth
- MCP Setup section in wallet detail page with one-click token provisioning and copyable Claude Desktop config JSON

---

## v33.4 서명 앱 명시적 선택 (Shipped: 2026-04-02)

**Phases completed:** 3 phases, 4 plans, 8 tasks

**Key accomplishments:**

- Partial unique index + CHECK triggers enforce wallet_type-level signing primary uniqueness at DB level
- Exclusive signing toggle in WalletAppService + PresetAutoSetupService migrated from preferred_wallet setting to signing_enabled column
- SignRequestBuilder transitioned from name-based 3-query + preferred_wallet setting to wallet_type + signing_enabled=1 single DB query
- wallet_type group layout with signing radio buttons replacing checkboxes for explicit signing app selection

---

## v33.3 Desktop App 배포 채널 확장 (Shipped: 2026-04-01)

**Phases completed:** 3 phases, 3 plans, 6 tasks

**Key accomplishments:**

- macOS/Windows/Linux Desktop App installation guide with Gatekeeper/SmartScreen bypass, 5-step Setup Wizard, and Ed25519 auto-update documentation
- Standalone download page with OS auto-detection, GitHub Releases API integration (5-min TTL cache), platform-specific binary links, and npm/Docker alternative install methods
- Download nav link added to all site pages via template.html, /download/ registered in sitemap.xml, Desktop App distribution channels documented in SUBMISSION_KIT

---

## v33.2 Tauri Desktop App (Shipped: 2026-04-01)

**Phases completed:** 5 phases, 12 plans, 20 tasks

**Key accomplishments:**

- Tauri 2 spike project with @reown/appkit QR pairing, Solana/EVM dual adapters, and WalletConnect CSP ready for manual Go/No-Go verification
- Tauri 2 project with Rust SidecarManager for daemon lifecycle management (spawn, stdout port parsing, health polling, crash restart, PID lockfile, graceful shutdown)
- Node.js SEA build pipeline with esbuild bundling, native addon dlopen loader, and WAIAAS_PORT stdout protocol for sidecar port discovery
- Splash page with Tauri 2.x event listeners for daemon lifecycle status, integrated with SidecarManager events and WebView navigation
- 7 typed IPC command wrappers with isDesktop() detection and 4-layer tree-shaking ensuring Desktop code never leaks to browser builds
- 3-color system tray icon with context menu and 30-second health polling using include_bytes! PNG icons
- 5-step Desktop Setup Wizard with Preact signals state management, localStorage first-run detection, and dynamic import App.tsx integration
- WalletConnect QR pairing connector using daemon REST API (Plan B) with zero @reown/appkit dependency and reactive QR modal
- Owner step wired to WalletConnect QR modal with dynamic imports for complete 5-step Setup Wizard flow
- Tauri updater plugin with Ed25519 signing config for secure auto-updates
- GitHub Actions 3-platform build matrix (macOS arm64/x64, Windows x64, Linux x64) with draft-then-publish pattern
- UpdateBanner auto-update UI with dynamic import tree-shaking for Desktop-only rendering

---

## v33.0 Desktop App 아키텍처 재설계 (Shipped: 2026-03-31)

**Phases completed:** 3 phases, 6 plans, 12 tasks

**Key accomplishments:**

- Design doc 39 sections 2.1/2.2/3.1/3.3 rewritten from React 18 SPA to Admin Web UI (Preact 10.x) WebView load architecture with apiCall() relative path reuse
- Design doc 39 sections 6/7/13 rewritten: 8-screen React frontend replaced with Admin Web UI 19-page reuse + 3 Desktop-only extensions (Setup Wizard, Sidecar Status, WalletConnect QR)
- isDesktop() environment detection, 6-command IPC bridge spec with Rust/TS signatures, Tauri Capability settings, CSP exception strategy, and desktopComponent() conditional rendering pattern for 3 Desktop-only components
- Module boundary rules with ESLint enforcement, 6 Desktop-only dependencies as optional peers, 4-layer tree-shaking strategy, and HMR-first Tauri development workflow with Vite mode=desktop
- TCP bind(0) dynamic port allocation protocol with stdout/tempfile delivery, plus full consistency cleanup of stale paths, React references, and hardcoded port 3100 across design doc 39
- m33-02 Desktop App objectives updated with __TAURI_INTERNALS__ detection, 6 IPC commands, TCP bind(0) port protocol, and packages/admin/src/desktop/ path structure; m33-00 status advanced to IN_PROGRESS

---

## v32.10 에이전트 스킬 정리 + OpenClaw 플러그인 (Shipped: 2026-03-18)

**Phases completed:** 4 phases (452-455), 7 plans, 48 requirements

**Key accomplishments:**

- docs/guides/ → docs/agent-guides/ 디렉토리 구조 분리 + docs/admin-manual/ 9개 파일 생성 (masterAuth 운영 가이드 이전)
- skills/ 12개 파일에서 masterAuth 콘텐츠 완전 제거 — admin/setup 스킬 삭제, 나머지 7개 sessionAuth 전용 정리
- @waiaas/openclaw-plugin 패키지 구현 — 17개 sessionAuth 도구(5 그룹), register() 진입점, fetch 기반 HTTP 클라이언트
- release-please + turbo + npm publish + smoke-test 파이프라인에 openclaw-plugin 통합
- openclaw-integration.md 플러그인 우선 구조로 재작성 + openclaw-plugin SEO 랜딩 페이지 + 사이트 30페이지 빌드

**Stats:**

- 28 commits, 239 files changed, +17,896/-10,026 lines
- ~327,768 LOC TS
- Timeline: 1 day (2026-03-18)

---

## v32.9 Push Relay 직접 연동 (ntfy.sh 제거) (Shipped: 2026-03-18)

**Phases completed:** 3 phases (449-451), 7 plans, 32 requirements

**Key accomplishments:**

- ntfy.sh SSE 의존성 완전 제거 — ResponseChannelSchema/APPROVAL_METHODS에서 ntfy 타입 삭제, NtfyChannel/ntfy config/hot-reload 코드 전량 삭제
- Push Relay 서버 자체 응답 저장소(sign_responses DB) 전환 + long-polling API 구현
- PushRelaySigningChannel HTTP POST + long-polling으로 데몬 서명/알림 채널 재작성
- DB v60 마이그레이션 (push_relay_url 컬럼, DCent 프리셋 자동 설정)
- Wallet SDK ntfy 함수 deprecated 처리 + Admin UI Push Relay URL 기반 워크플로우 전환

**Stats:**

- 36 commits, 118 files changed, +5,426/-4,411 lines
- ~326,625 LOC TS
- Timeline: ~2 hours (2026-03-18)
- Audit: PASS (with advisories)

---

## v32.8 테스트 커버리지 강화 (Shipped: 2026-03-18)

**Phases completed:** 6 phases (444-448.1), 17 plans, 48 requirements

**Key accomplishments:**

- DeFi Provider 5종(Jupiter/0x/LiFi/Lido+Jito/Aave) + Pipeline 상태 머신 엣지 케이스 79 신규 테스트
- daemon Infra(IncomingTx/RPC Proxy/Admin API/Notification) 195 신규 테스트, 임계값 L:90/F:95 달성
- EVM adapter Branches 76%→91%, wallet-sdk Branches 79%→95%, 116 신규 테스트
- SDK Lines 80%→99.93%, shared 100% 달성, coverage-gate.sh 12 패키지 동기화
- 7개 오픈 이슈 전량 해결 (EVM 체크섬, PositionTracker RPC, DeFi UAT 시나리오 등)

**Stats:**

- 6 phases (444-448.1), 17 plans, 48 requirements complete
- 58 commits, 131 files changed, +21,334/-185 lines
- ~368,589 LOC TS, ~620+ 신규 테스트
- Timeline: 2 days (2026-03-17 → 2026-03-18)
- Known gaps: daemon B:83.76%, admin F:75.30% (프레임워크 제약)

---

## v32.7 SEO/AEO Optimization (Shipped: 2026-03-17)

**Phases completed:** 5 phases (439-443), 7 plans, 33 requirements

**Key accomplishments:**

- ESM 빌드 파이프라인 (`site/build.mjs`) — 19개 마크다운 파일을 CRT 테마 HTML 페이지로 변환, 빌드타임 구문 강조
- Blog/Docs 목록 페이지 + 활성 네비게이션 + 259개 내부 링크 검증 (0 broken)
- sitemap.xml (22 URL), JSON-LD 구조화 데이터 (Article/TechArticle + BreadcrumbList), canonical URL
- llms-full.txt (188KB) AEO 최적화 + 20개 FAQ Q&A (FAQPage 스키마)
- GitHub Actions CI 파이프라인 — docs/** 변경 시 자동 빌드 + GitHub Pages 배포
- SEO 랜딩 페이지 3종 ("AI wallet" 카테고리) + SUBMISSION_KIT (7 플랫폼) + 커뮤니티 포스팅 초안 4개

**Stats:**

- 5 phases (439-443), 7 plans, 33 requirements complete
- 30 commits, 53 files changed, +6,080/-867 lines
- ~355,935 LOC TS
- Timeline: 1 day (2026-03-17)
- Audit: PASS (33/33 requirements satisfied)

---

## v32.6 성능 + 구조 개선 (Shipped: 2026-03-17)

**Phases completed:** 4 phases (435-438), 9 plans, 46 requirements

**Key accomplishments:**

- N+1 쿼리 6곳 배치 전환 — sessions/wallets/tokens 조회를 IN()/GROUP BY 단일 쿼리로 통합
- sessions/policies API limit/offset 페이지네이션 — SDK listSessions/listPolicies + MCP list_sessions 도구 추가
- migrate.ts 분할 — 3,529줄 → 285줄 러너 + schema-ddl.ts + 6개 버전별 마이그레이션 모듈
- daemon.ts 분할 — 2,412줄 → 327줄 클래스 셸 + startup(1,704)/shutdown(195)/pipeline(321) 모듈
- database-policy-engine.ts 분할 — 2,318줄 → 852줄 오케스트레이터 + 8개 evaluator 모듈
- stages.ts 분할 — 2,330줄 → 6개 stage 파일 + pipeline-helpers + 12줄 barrel re-export
- Solana mapError() 중앙화 (14개 catch 패턴 통합) + ILogger 인터페이스 도입 (@waiaas/core)

**Stats:**

- 4 phases (435-438), 9 plans, 46 requirements complete
- 34 commits, 83 files changed, +13,451/-9,755 lines
- ~313,564 LOC TS
- Timeline: 1 day (2026-03-17)
- Audit: CONDITIONAL PASS → PASS (E2E pagination assertions fixed)

---

## v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글 (Shipped: 2026-03-16)

**Phases completed:** 3 phases (432-434), 8 plans, 30 requirements

**Key accomplishments:**

- PositionQueryContext 타입 정의 + IPositionProvider 시그니처 확장 — 8개 프로바이더 마이그레이션, 체인 가드 패턴 적용
- Lido 5네트워크 / Aave V3 5네트워크 / Pendle 2네트워크 멀티체인 포지션 조회 — Promise.allSettled 병렬 실행, 단일 네트워크 실패 격리
- Solana 프로바이더(Jito/Kamino/Drift) 동적 네트워크 추출 — ctx.networks[0] 패턴으로 하드코딩 제거
- DB migration v59 — defi_positions.environment 컬럼 추가, mainnet 자동 백필
- Admin DeFi Positions API includeTestnets 필터 + Admin UI "Include testnets" 토글 (localStorage 영속)
- 이슈 3건 수정: E2E 정책 스키마(#376), WalletConnect UAT 제거(#377), admin-ops 카테고리 신설(#378)

**Stats:**

- 3 phases (432-434), 8 plans, 30 requirements complete
- 37 commits, 94 files changed, +5,349/-880 lines
- ~339,000 LOC TS
- Timeline: 1 day (2026-03-16)
- Git range: feat(432-01) → docs(mark issues #376-#378)
- Audit: PASS (30/30 requirements wired, 3/3 E2E flows verified)

---

## v32.4 타입 안전 + 코드 품질 (Shipped: 2026-03-16)

**Phases completed:** 5 phases (427-431), 11 plans, 21 tasks, 51 requirements

**Key accomplishments:**

- safeJsonParse<T> 범용 헬퍼 + POLICY_RULES_SCHEMAS 20종 export (@waiaas/core SSoT)
- IChainSubscriber 9메서드(6 base + 3 optional) 확장 + services/infrastructure에서 api/ import 0건
- DatabasePolicyEngine 20건 JSON.parse→Zod safeParse 전환 + 17개 로컬 인터페이스 제거
- 프로덕션 소스 `as any` 0건 달성 (wc.ts/daemon/stages/userop/actions 전체 교체)
- NATIVE_DECIMALS/NATIVE_SYMBOLS SSoT + sleep/formatAmount/aggregateStakingBalance 통합
- 4건 이슈 수정: IncomingTxMonitor 캐시(#359), NFT Indexer 키(#361), 사이드바 Protocols(#360), 프로토콜 토글 분리(#362)

**Stats:**

- 5 phases (427-431), 11 plans, 51 requirements complete
- 47 commits, 140 files changed, +7,233/-1,967 lines
- ~349,000 LOC TS
- Timeline: 1 day (2026-03-16)
- Audit: PASS (51/51 requirements, cross-phase integration verified)

---

## v32.2 보안 패치 (Shipped: 2026-03-16)

**Phases completed:** 3 phases, 3 plans, 14 requirements

**Key accomplishments:**

- SSRF 가드 범용화(infrastructure/security/) + Admin RPC Test 엔드포인트 SSRF 방어(validateUrlSafety 적용)
- hostGuard startsWith 우회 취약점 수정 — 정확 매칭(===)만 허용
- SlidingWindowRateLimiter 인메모리 3계층(IP/세션/트랜잭션) Rate Limit 미들웨어 + RATE_LIMITED 에러 코드
- hono/cors 미들웨어 등록(cors_origins 설정 기반 동적 origin, hot-reload)
- 알림 채널(Ntfy/Discord/Slack) fetch 10초 timeout + AutoStop EventBus 리스너 정리

**Stats:**

- 3 phases (424-426), 3 plans, 14 requirements complete
- 16 commits, 20 files changed, +1,228/-273 lines
- 32 new tests (12 SSRF/hostGuard + 11 rate limit + 9 CORS/resource)
- Timeline: 1 day (2026-03-16)
- Git range: feat(424-01) → docs(phase-426)
- Audit: PASS (14/14 requirements, cross-phase integration verified)

---

## v32.0 Contract Name Resolution (Shipped: 2026-03-15)

**Phases completed:** 3 phases, 4 plans, 24 requirements

**Key accomplishments:**

- ContractNameRegistry 4단계 우선순위 동기 해석 서비스 (Action Provider > Well-known > Whitelist > Fallback)
- Well-known 컨트랙트 305+ 정적 엔트리 (5 EVM 체인 + Solana mainnet)
- 17개 Action Provider에 displayName 메타데이터 추가 + snakeCaseToDisplayName 자동 변환
- CONTRACT_CALL 알림 7개 호출 지점에서 "Protocol Name (0xabcd...1234)" 포맷으로 이름 표시
- TxDetailResponse에 contractName/contractNameSource 필드 추가 (5개 트랜잭션 엔드포인트)
- Admin UI 트랜잭션 목록 + 지갑 상세 Activity 탭에서 컨트랙트 이름 표시

**Stats:**

- 3 phases (421-423), 4 plans, 24 requirements complete
- 22 commits, 64 files changed, +4,839 / -975 lines
- Timeline: 1 day (2026-03-15)
- Git range: feat(421-01) → feat(423-01)
- Audit: PASS (24/24 requirements, cross-phase integration verified)
- ~397,990 LOC TS

---

## v31.18 Admin UI IA 재구조화 (Shipped: 2026-03-15)

**Phases completed:** 4 phases, 7 plans, 38 requirements

**Key accomplishments:**

- 사이드바 5개 섹션 헤더(Wallets/Trading/Security/Channels/System) 그룹화로 정보 구조(IA) 확립
- Tokens/RPC Proxy 독립 페이지를 Wallets/Settings 페이지 탭으로 병합
- Hyperliquid/Polymarket Settings 탭 제거 → Providers 페이지 중앙화(SSoT)
- 지갑 상세 8탭을 4탭(Overview/Activity/Assets/Setup)으로 통합, Owner Protection 카드 인라인 배치
- 레거시 경로 리다이렉트(5개) + Ctrl+K 검색 인덱스 동기화 + TabNav 통일

**Stats:**

- 4 phases (417-420), 7 plans, 38 requirements complete
- 30 commits, 52 files changed, +3,311 / -515 lines
- Timeline: 1 day (2026-03-15)
- Git range: feat(417-01) → feat(420-02)
- Audit: PASS (38/38 requirements, 8 E2E flows, 905/905 tests)

---

## v31.17 OpenAPI 기반 프론트엔드 타입 자동 생성 (Shipped: 2026-03-14)

**Phases completed:** 5 phases, 11 plans, 7 tasks

**Key accomplishments:**

- Build-time OpenAPI spec 추출 + openapi-typescript 자동 타입 생성 파이프라인 (CI freshness gate 포함)
- openapi-fetch 기반 타입 안전 API 클라이언트 + X-Master-Password 인증 미들웨어
- Admin UI 18+ 페이지 수동 interface → 생성 타입 alias 점진적 마이그레이션 (satisfies 검증)
- Provider discovery API (enabledKey/category/isEnabled) + settings schema 엔드포인트 → 하드코딩 제거
- @waiaas/shared 상수 모듈 — 정책 타입, 크레덴셜 타입, 에러 코드 브라우저 안전 re-export
- OpenAPI spec ↔ Admin UI 필드 사용 contract test CI 게이트 (schema-reference hard gate)

**Stats:**

- 5 phases (412-416), 11 plans, 21 requirements complete
- 46 commits, 136 files changed, +19,066 / -4,788 lines
- Timeline: 1 day (2026-03-15)
- Git range: docs(v31.17-start) → docs(v31.17-audit)
- ~347,156 LOC TypeScript
- Audit: PASS with noted gaps (settings/schema API unused by UI, ~17 component files on old client)

### Known Gaps

- `GET /v1/admin/settings/schema` endpoint created but not consumed by Admin UI (wired in v31.17 late addition)
- ~17 component-level files remain on old untyped API client (wallets.tsx sub-components deferred)

---

## v31.16 CAIP 표준 식별자 승격 (Shipped: 2026-03-15)

**Phases completed:** 407-411 (5 phases, 8 plans, 46 requirements)

**Key accomplishments:**

- normalizeNetworkInput CAIP-2 dual-accept 확장 — 15개 네트워크 CAIP-2 매핑 + z.preprocess 전 인터페이스 자동 적용
- CAIP-19 assetId-only 토큰 특정 + 토큰 레지스트리 자동 resolve + 네트워크 자동 추론
- 모든 응답에 chainId(CAIP-2)/assetId(CAIP-19) 런타임 동적 생성 + connect-info supportedChainIds
- SDK Caip2ChainId/Caip19AssetId 타입 확장 + TokenInfo union (기존 시그니처 유지)
- MCP resolve_asset 신규 도구 + send_token/approve_token assetId-only 지원
- 스킬 파일 4종 CAIP-2/19 사용법 + assetId-only 패턴 문서화

**Stats:**

- 5 phases (407-411), 8 plans, 46 requirements complete
- 34 commits, 71 files changed, +4,783 / -119 lines
- Timeline: 1 day (2026-03-14 → 2026-03-15)
- Git range: docs(v31.16-start) → docs(phase-411)
- 239 CAIP-related tests pass
- Audit: PASS (all 46 requirements wired, 0 gaps)

---

## v31.15 Amount 단위 표준화 및 AI 에이전트 DX 개선 (Shipped: 2026-03-14)

**Phases completed:** 402-406 (5 phases, 9 plans, 33 requirements)

**Key accomplishments:**

- 14개 non-CLOB provider 스키마에 명시적 단위 description(.describe()) 추가, CLOB 3개 exchange-native 단위 문서화
- 4개 레거시 provider(Aave V3, Kamino, Lido, Jito) smallest-unit 전환 + migrateAmount() 하위 호환성 자동 변환
- MCP typed schema 등록(jsonSchemaToZodParams) + GET /v1/actions/providers inputSchema JSON Schema 노출
- 트랜잭션/잔액 응답에 amountFormatted/amountDecimals/amountSymbol + balanceFormatted 런타임 보강
- humanAmount XOR 파라미터 — REST API(TRANSFER/TOKEN_TRANSFER/APPROVE) + 10 action providers + MCP 자동 노출
- SDK humanAmount 타입 + 스킬 파일 4종 단위 가이드 + E2E humanAmount 시나리오 검증

**Stats:**

- 5 phases (402-406), 9 plans, 33 requirements complete
- 40 commits, 89 files changed, +7,834 / -737 lines
- Timeline: 1 day (2026-03-14)
- Git range: feat(402-01) → docs(405-requirements)
- LOC: ~294,834 TypeScript

---

## v31.14 EVM RPC 프록시 모드 (Shipped: 2026-03-13)

**Phases completed:** 398-401 (4 phases, 11 plans, 49 requirements)

**Key accomplishments:**

- CONTRACT_DEPLOY as 9th transaction type — full Zod SSoT chain propagation (enum, schema, pipeline, policy, DB v58)
- EVM JSON-RPC proxy engine — 10 intercepted signing methods + 19 passthrough read methods via RpcDispatcher
- Async approval via Long-poll — DELAY/APPROVAL tier CompletionWaiter with configurable timeout (300s/600s)
- Admin Settings 7키 (rpc_proxy.*) + Admin UI RPC Proxy 페이지 (상태, 요청 로그)
- MCP/SDK/connect-info 에이전트 자동 발견 — get_rpc_proxy_url 도구, getRpcProxyUrl() 메서드, rpcProxyBaseUrl 필드
- ~189 new tests across 16 test files covering protocol compliance, security, and integration

**Stats:**

- 4 phases (398-401), 11 plans, 49 requirements complete
- 31 commits, 82 files changed, +9,485 / -190 lines
- ~189 tests (22 protocol + 18 adapter + 26 pipeline + 27 handler + 19 route + 25 integration + ...)
- Timeline: ~4 hours (2026-03-13)
- Git range: feat(398-01) → docs(phase-401)
- LOC: ~292,079 TypeScript

---

## v31.13 DeFi 포지션 대시보드 완성 (Shipped: 2026-03-12)

**Phases completed:** 393-397 (5 phases, 8 plans, 27 requirements)

**Key accomplishments:**

- Lido stETH/wstETH + Jito jitoSOL 스테이킹 포지션 추적 — wstETH→stETH/jitoSOL→SOL 환산 비율 포함, duck-type 자동 등록
- Aave V3 Supply/Borrow 포지션 추적 — aToken/debtToken 잔액, Health Factor, Aave Oracle 가격 기반 USD 환산
- Pendle PT/YT Yield 포지션 추적 — balanceOf 조회, MATURED 자동 전환, implied APY 포함
- Hyperliquid Perp 오픈 포지션 + Spot 잔액 신규 구현 — Info API 기반 8 metadata 필드, mid-price USD 환산
- Admin Dashboard UX — 카테고리 필터(5탭), 프로바이더 그룹핑, 카테고리별 맞춤 상세 컬럼, HF 경고 배너, 지갑 필터, 30초 자동 새로고침

**Stats:**

- 5 phases (393-397), 8 plans, 27 requirements complete
- 28 commits, 44 files changed, +5,985 / -139 lines
- ~188 tests (27 integration + 8 API + 11 UI + 142 provider unit)
- Timeline: ~5 hours (2026-03-12)
- Git range: feat(393-01) → docs(v31.13)

---

## v31.12 External Action 프레임워크 구현 (Shipped: 2026-03-12)

**Phases completed:** 386-392 (7 phases, 15 plans, 60 requirements)

**Key accomplishments:**

- ResolvedAction 3-kind Zod discriminatedUnion (contractCall/signedData/signedHttp) — backward-compatible normalization, 기존 13개 ActionProvider 무변경
- ISignerCapability 7-scheme registry — EIP-712/PersonalSign/ERC-8128 어댑터 + HMAC/RSA-PSS/ECDSA/Ed25519 신규, auto-select by signingScheme
- CredentialVault — AES-256-GCM 암호화, HKDF 도메인 분리, per-wallet/global scope, REST 8 endpoints, Master Password 변경 시 re-encrypt
- Venue Whitelist + Action Category Limit 정책 — default-deny venue 관리, 카테고리별 daily/monthly/per_action USD 한도
- Kind-based 파이프라인 라우팅 — signedData/signedHttp 파이프라인 (credential→policy→DB→sign→track→audit), connect-info capability
- Full-stack 통합 — Admin UI 4페이지 + MCP 2도구 + SDK 6메서드 + skill files 4종

**Known Gaps:**

- TRACK-02: bridge_status 컬럼 리네임 미수행 (확장으로 대체, 기능적 동등)
- TRACK-03: ExternalActionTracker 클래스 미구현 (AsyncPollingService 직접 확장)
- TRACK-05: EventBus action:* 이벤트 미등록 (notification callbacks로 대체)

**Stats:**

- 7 phases (386-392), 15 plans, 57 requirements complete + 3 deferred
- 57 commits, 144 files changed, +15,780 / -263 lines
- ~219 new tests, DB v55-v57 (3 migrations)
- Timeline: ~4.5 hours (2026-03-12)
- Git range: feat(386-01) → docs(31-12)

---

## v31.11 External Action 프레임워크 설계 (Shipped: 2026-03-12)

**Phases completed:** 380-385 (6 phases, 11 plans, 34 requirements)

**Key accomplishments:**

- ResolvedAction 3종 Zod union 타입 시스템 — contractCall/signedData/signedHttp kind 기반 분기, 기존 13개 ActionProvider 무변경 하위 호환
- ISignerCapability 통합 인터페이스 — 기존 4종 signer 래핑 + HMAC/RSA-PSS/signBytes 신규, SignerCapabilityRegistry 7종 자동 매핑
- CredentialVault 인프라 설계 — per-wallet AES-256-GCM 암호화 자격증명 저장소, HKDF 도메인 분리, REST 8 endpoints + Admin UI + MCP/SDK
- 3-way 파이프라인 라우팅 — kind별 contractCall/signedData/signedHttp 분기, off-chain action DB 기록, DB v55-v57 마이그레이션 설계
- 정책 + 추적 확장 — VENUE_WHITELIST + ACTION_CATEGORY_LIMIT, AsyncTrackingResult 9-state 확장
- doc-81 통합 설계 문서 — D1~D6 전체 통합 (1,184줄), 19 Zod 스키마, 4-Wave 구현 계획, 40+ pitfall 체크리스트

**Stats:**

- 6 phases (380-385), 11 plans, 34 requirements, 36 design decisions
- 46 commits, 60 files changed, +13,039 / -1,582 lines
- ~276,614 LOC TypeScript total
- Timeline: 1 day (2026-03-11 → 2026-03-12)
- Type: Design-only (no implementation code)
- Design document: doc-81 External Action 프레임워크 (1,184 lines)

---

## v31.10 코드베이스 품질 개선 (Shipped: 2026-03-11)

**Phases completed:** 375-379 (5 phases, 8 plans, 16 requirements)

**Key accomplishments:**

- parseTokenAmount/contract-encoding 유틸리티 통합 — 7개 프로바이더 중복 제거, ~260줄 코드 삭제, 공통 amount-parser + contract-encoding 모듈
- WalletRow SmartAccount 타입 확장 + `as any` 24곳 제거, resolveChainId 단일화, CAIP-19 regex 통합, NFT 인터페이스 타입 가드
- admin.ts (3,107줄) → 5개 도메인 모듈(auth/settings/notifications/wallets/monitoring) + thin aggregator (98줄, 96.8% 축소)
- WAIaaSError 패턴 통일 — nft-approvals/sessions/erc8004/admin-monitoring 비표준 패턴 교체, 에러 코드 135→137
- 10개 명명 상수 추출 — daemon/cli/admin 3개 constants.ts 생성, 22개 소스 파일 매직 넘버 교체

**Stats:**

- 5 phases (375-379), 8 plans, 32 commits
- 89 files changed, +6,742 / -3,472 lines
- Timeline: 1 day (2026-03-11)

---

## v31.9 Polymarket 예측 시장 통합 (Shipped: 2026-03-11)

**Phases completed:** 370-374 (5 phases, 14 plans, 29 requirements)

**Key accomplishments:**

- Polymarket 심층 리서치 + 설계 문서 doc 80 (1,345 lines, 12 sections, EIP-712 3-domain 서명 구조 설계)
- EIP-712 CLOB 주문 인프라 — PolymarketSigner(3 domains), ClobClient(HMAC L2), OrderBuilder(USDC.e 6d precision), RateLimiter(10 req/s)
- Gamma API 마켓 조회(30s TTL 캐시) + PositionTracker(가중평균가) + PnlCalculator(bigint) + CTF 온체인 리딤(5 actions)
- 전 인터페이스 통합 — Admin UI 5탭 + MCP 8 query 도구 + SDK 15 메서드 + Admin Settings 7키 + connect-info polymarket capability + 정책 엔진 17 테스트
- E2E 스모크 4시나리오 + Agent UAT defi-13 시나리오 (6-section 포맷, 메인넷 검증 가능)

### Known Gaps

- **CLOB-08**: FAK partial fill order — not implemented
- **CLOB-09**: Batch orders — not implemented
- **FIND-01**: ResolutionMonitor notification callback not wired in daemon.ts (SETL-04 partial)
- **FIND-02**: Python SDK missing Polymarket methods (TypeScript SDK fully covered)

**Stats:**

- 5 phases (370-374), 14 plans, 48 commits
- 93 files changed, +10,363 lines
- ~235 new tests across 22 test files
- Timeline: 2 days (2026-03-10 → 2026-03-11)

---

## v31.8 Agent UAT (메인넷 인터랙티브 검증) (Shipped: 2026-03-09)

**Phases completed:** 5 phases, 12 plans

**Key accomplishments:**

- Agent UAT 마크다운 시나리오 포맷 정의 — 6-section 표준(Metadata/Prerequisites/Steps/Verification/Cost/Troubleshooting), YAML 프론트매터, `/agent-uat` skill 파일
- Testnet 7개 + Mainnet 기본 전송 6개 시나리오 — ETH/SOL/ERC-20/SPL/L2/NFT/Hyperliquid/수신TX 자기 전송 패턴
- DeFi 프로토콜 12개 시나리오 — Jupiter/0x/LI.FI/Across/Lido/Jito/Aave/Kamino/Pendle/Drift/Hyperliquid/DCent
- 고급 기능 6개 + Admin UI 검증 13개 시나리오 — Smart Account/WalletConnect/x402/수신TX/가스조건부 + Admin 전체 페이지
- CI 시나리오 등록 강제 — Provider 매핑/포맷/인덱스/Admin 라우트 4개 검증 스크립트 + ci.yml Stage 1 통합

**Stats:**

- 5 phases (365-369), 12 plans, 41 commits
- 89 files changed, +10,962 / -203 lines, 45 scenario files

---

## v31.7 E2E 자동 검증 체계 (Shipped: 2026-03-09)

**Phases completed:** 8 phases, 21 plans, 16 tasks

**Key accomplishments:**

- @waiaas/e2e-tests 독립 패키지 — E2EScenario 타입, 데몬/Push Relay 라이프사이클 관리, 세션/HTTP 클라이언트 헬퍼
- 오프체인 E2E 스모크 테스트 — 코어(인증/지갑/세션/정책), 인터페이스(Admin/MCP/SDK/알림/토큰/백업), 고급(Smart Account/UserOp/x402/ERC-8004/8128/DeFi/Push Relay)
- CI/CD 통합 — e2e-smoke.yml RC publish 트리거, 실패 시 GitHub Issue 자동 생성, CI 리포터
- 온체인 E2E — PreconditionChecker(데몬/지갑/잔액 확인), testnet 전송(ETH/SOL/ERC-20/SPL), Lido 스테이킹, Hyperliquid Spot/Perp, NFT ERC-721/1155, skip 유틸리티
- E2E 시나리오 등록 강제 — Provider↔시나리오/API↔시나리오 매핑 검증, CI fail on gap, 빈 파일 방지
- 이슈 해결 — #282 네트워크 설정 키 완전성 테스트, #283 README 동적 테스트 배지

**Stats:**

- 8 phases (357-364), 21 plans, 55 commits
- 122 files changed, +12,359 / -99 lines, ~527,949 LOC TS

---

## v31.6 Across Protocol 크로스체인 브릿지 (Shipped: 2026-03-09)

**Delivered:** Across Protocol Intent 기반 고속 크로스체인 브릿지를 WAIaaS에 통합. SpokePool depositV3를 기존 CONTRACT_CALL 파이프라인으로 실행하며, 신규 npm 의존성과 DB 마이그레이션 없이 완료.

**Phases completed:** 5 phases (352-356), 8 plans, 33 requirements

**Key accomplishments:**

- Across Protocol bridge design doc (doc 79) — 5 API endpoints spec, SpokePool depositV3 12 params, fee model, 12 design decisions
- AcrossApiClient (5 REST endpoints) + AcrossBridgeActionProvider (5 actions: quote/execute/status/routes/limits)
- Late-bind quote pattern — Stage 5 실행 직전 fresh /suggested-fees 재조회로 stale quote 방지
- 2-phase polling status tracker (15s active + 5min monitoring) — bridge_status/bridge_metadata 컬럼 재사용 (no DB migration)
- 전 인터페이스 통합 — 7 Admin Settings keys + connect-info + 4 SDK methods + Admin UI + skill file 업데이트
- 110 tests (67 unit + 43 integration) — calldata encoding, pipeline flow, error handling, status tracker 검증

**Stats:**

- 5 phases, 8 plans, 33 requirements, 31 commits
- 66 files changed, +8,815 / -373 lines, ~259,644 LOC TS

---

## v31.4 Hyperliquid 생태계 통합 (Shipped: 2026-03-08)

**Delivered:** HyperEVM 체인 지원과 Hyperliquid L1 DEX(Perp/Spot) 거래 + Sub-account 관리를 ApiDirectResult 패턴으로 기존 파이프라인에 통합. EIP-712 서명 기반 off-chain DEX API를 WAIaaS의 6-stage 파이프라인과 정책 엔진에 연결.

**Phases completed:** 5 phases (347-351), 12 plans, 44 requirements

**Key accomplishments:**

- HyperEVM Mainnet/Testnet (Chain ID 999/998) 체인 등록 — 기존 EVM 지갑이 HyperEVM에서 즉시 동작
- ApiDirectResult 패턴 — off-chain DEX API 결과를 Stage 5에서 on-chain TX 없이 CONFIRMED 처리하는 파이프라인 분기
- Hyperliquid Perp Trading — 7 actions (Market/Limit/Stop-Loss/Take-Profit/Cancel/Leverage/Margin Mode), margin 기반 정책 평가
- Hyperliquid Spot Trading — 3 actions (Buy/Sell/Cancel), spot asset index 10000+ 매핑, size*price 정책 평가
- Sub-account 관리 — Create/Transfer via User-Signed Action EIP-712, DB v52 hyperliquid_sub_accounts
- 전 인터페이스 통합 — 22 MCP tools + 22 SDK methods + 9 Admin Settings + Admin UI 5-tab page (Overview/Orders/Spot/Sub-accounts/Settings) + connect-info capability + skill files 3개 업데이트

**Stats:**

- 5 phases, 12 plans, 44 requirements, 38 commits
- 112 files changed, +12,755 / -166 lines, ~337,060 LOC TS

---

## v31.3 DCent Swap Aggregator 통합 (Shipped: 2026-03-07)

**Delivered:** DCent Swap Backend API를 WAIaaS에 통합하여 다중 프로바이더 DEX Swap(동일체인) + Exchange(크로스체인) + 자동 라우팅 2-hop 폴백을 지원하는 스왑 애그리게이터 구현.

**Phases completed:** 5 phases (342-346), 9 plans, 37 requirements

**Key accomplishments:**

- DCent Swap API 7-endpoint deep research + 936-line integration design doc (doc 77, 17 design decisions)
- CAIP-19 ↔ DCent Currency ID bidirectional converter with 24h stale-while-revalidate cache (8 native token mappings)
- DEX Swap execution via approve+txdata BATCH pipeline with min/max validation and provider sorting
- Cross-chain Exchange execution via payInAddress TRANSFER + ExchangeStatusTracker polling + 4 notification events
- 2-hop auto-routing fallback for no-route token pairs (6 EVM chains, ETH/USDC/USDT intermediate tokens)
- Full integration: DcentSwapActionProvider (IActionProvider) + 4 MCP tools + 4 SDK methods + policy engine + 7 Admin Settings keys + connect-info capability + skill files + 116 tests

**Stats:**

- 5 phases, 9 plans, 37 requirements, 54 commits
- 110 files changed, +11,612 / -211 lines, ~248,459 LOC TS

---

## v31.2 UserOp Build/Sign API (Shipped: 2026-03-06)

**Delivered:** Smart Account 지갑에서 프로바이더 없이 UserOperation을 구성/서명할 수 있는 Build/Sign API를 제공하여, 외부 플랫폼이 가스 대납을 중계하는 아키텍처 지원.

**Phases completed:** 4 phases (338-341), 8 plans, 58 requirements

**Key accomplishments:**

- Provider Lite/Full 모드 — Smart Account를 프로바이더 없이 생성 가능 (Lite), aaProvider 설정 시 Full 모드 전환
- UserOp Build API — POST /v1/wallets/:id/userop/build, unsigned UserOp 구성 (nonce, callData, factory 자동 감지, Bundler 불필요)
- UserOp Sign API — callData 이중 검증 + sender 일치 확인 + INSTANT 정책 평가 + 서명 + USEROP_SIGNED 감사 로그
- DB v45 마이그레이션 — userop_builds 테이블 (buildId, callData, TTL 10분) + cleanup 워커
- MCP build_userop/sign_userop 도구 + SDK buildUserOp()/signUserOp() 메서드 + 스킬 파일 3개 업데이트
- Admin UI — Provider None (Lite mode) 옵션 + Lite/Full 배지 (상세/목록)

**Stats:**

- 4 phases, 8 plans, 58 requirements, 27 commits
- 64 files changed, +6,821 / -186 lines, ~278,864 LOC TS

---

## v31.0 NFT 지원 (Shipped: 2026-03-06)

**Delivered:** EVM(ERC-721/ERC-1155)과 Solana(Metaplex) NFT 통합. 인덱서 인프라(Alchemy/Helius), 6-stage 파이프라인 NFT_TRANSFER 지원, Smart Account 호환, REST/MCP/SDK/Admin UI 전 인터페이스 노출.

**Phases completed:** 5 phases (333-337), 12 plans, 58 requirements

**Key accomplishments:**

- NFT_TRANSFER 6번째 discriminatedUnion type + APPROVE nft 확장 + DB v44 마이그레이션 + CAIP-19 NFT 네임스페이스(erc721/erc1155/metaplex)
- INftIndexer 인터페이스 + Alchemy NFT API v3(EVM) + Helius DAS API(Solana) + 재시도/캐싱/암호화 API 키
- IChainAdapter 25 메서드 확장 — ERC-721/ERC-1155 safeTransferFrom, ERC-165 표준 감지, Metaplex SPL 전송
- NFT Query API — 커서 페이지네이션, 컬렉션 그룹핑, 메타데이터 24h TTL 캐싱, IPFS/Arweave 게이트웨이 변환
- NFT_TRANSFER 6-stage 파이프라인 통과 + Smart Account UserOp 호환 + RATE_LIMIT/CONTRACT_WHITELIST 정책
- MCP 3도구 + SDK 3메서드 + Admin UI NFT 탭(그리드/리스트 뷰) + 인덱서 설정 UI + 스킬 파일 3개

**Stats:**

- 5 phases, 12 plans, 58 requirements, 38 commits
- 112 files changed, +12,784 / -146 lines, ~239,575 LOC TS

---

## v30.11 Admin UI DX 개선 (Shipped: 2026-03-05)

**Delivered:** Admin UI의 액션 관리 경험을 개선하여 메뉴 이름을 DeFi/Agent Identity로 직관적으로 변경하고, ERC-8004 기능을 한 페이지에서 완결적으로 관리하며, 운영자가 액션별 보안 Tier를 드롭다운으로 조정 가능한 상태.

**Phases completed:** 3 phases (330-332), 5 plans, 27 requirements

**Key accomplishments:**

- Admin UI 메뉴 DeFi/Agent Identity 재명명 + 라우트 변경 + 레거시 리다이렉트
- ERC-8004 Agent Identity 페이지에 활성화/비활성화 토글 통합 — 한 페이지 완결적 관리
- 전체 10개 액션 프로바이더 기본 활성화 + DB v42 마이그레이션 (INSERT OR IGNORE, 기존 설정 존중)
- 액션별 보안 Tier 오버라이드 — Settings 기반 백엔드 + 파이프라인 floor 에스컬레이션 (max(policy, action))
- Admin UI Description 컬럼 + Tier 드롭다운 + 오버라이드 인디케이터 + Reset to default

**Stats:**

- 3 phases, 5 plans, 27 requirements, 23 commits
- 48 files changed, +2,984 / -370 lines, ~266,814 LOC TS

---

## v30.10 ERC-8128 Signed HTTP Requests (Shipped: 2026-03-05)

**Delivered:** ERC-8128 (Signed HTTP Requests with Ethereum) 표준을 WAIaaS에 통합하여, 관리 지갑이 외부 API 호출 시 RFC 9421 기반 HTTP 메시지 서명으로 인증 가능. x402(결제) + ERC-8004(신원) + ERC-8128(API 인증)으로 에이전트 웹 인증 3종 세트 완성.

**Phases completed:** 327-329 (3 phases, 7 plans, 26 requirements)

**Key accomplishments:**

- RFC 9421 Signature Base + RFC 9530 Content-Digest + EIP-191 signing engine (packages/core/src/erc8128/, 7 modules)
- REST API 2 endpoints (POST /v1/erc8128/sign, /verify) with sessionAuth + erc8128.enabled feature gate
- ERC8128_ALLOWED_DOMAINS policy (default-deny, wildcard matching, per-domain rate limiting 60s sliding window)
- MCP 2 tools (erc8128_sign_request, erc8128_verify_signature) + SDK 3 methods (signHttpRequest, verifyHttpSignature, fetchWithErc8128)
- Admin UI policy form + system settings (6 keys) + connect-info erc8128 capability
- erc8128.skill.md + 3 existing skill files updated, 2 notification events (ERC8128_SIGNATURE_CREATED, ERC8128_DOMAIN_BLOCKED)

**Stats:**

- 3 phases, 7 plans, 26 requirements, 80 new tests
- 76 files changed, +7,280 / -150 lines
- ~232,614 LOC TypeScript total
- Timeline: 2026-03-05 (1 day)
- Git range: milestone/v30.10 (23 commits)

---

## v30.9 Smart Account DX 개선 (Shipped: 2026-03-05)

**Delivered:** Smart Account 설정을 글로벌 config에서 지갑별 프로바이더 모델로 전환하여, 프로바이더 선택 + API 키 입력만으로 번들러/페이마스터가 자동 구성되고, 에이전트가 셀프서비스로 프로바이더를 등록/조회할 수 있는 상태.

**Phases completed:** 324-326 (3 phases, 6 plans, 27 requirements)

**Key accomplishments:**

- Per-wallet provider model — AA_PROVIDER_NAMES enum(pimlico/alchemy/custom), DB v41 4 columns, AES-256-GCM API key encryption, 23 global settings removed
- Auto URL assembly — AA_PROVIDER_CHAIN_MAP(10 EVM networks × 2 providers), resolveProviderChainId + buildProviderBundlerUrl, custom URL direct input
- Agent self-service — PUT /v1/wallets/:id/provider with dual-auth(masterAuth + sessionAuth), wallet ownership enforcement, PROVIDER_UPDATED audit event
- Wallet response extension — provider.name/supportedChains/paymasterEnabled in GET/POST/PUT responses, ProviderStatusSchema.nullable()
- Admin UI provider management — accountType conditional fields, dashboard link dynamic switching, detail page inline edit form
- Agent discovery — connect-info provider prompt(name, gas sponsorship, chains), MCP get_provider_status tool(29th tool), smart_account capability

**Stats:**

- 3 phases, 6 plans, 27 requirements, 74 new tests
- 73 files changed, +7,214 / -419 lines
- ~262,608 LOC TypeScript total
- Timeline: 2026-03-04 ~ 2026-03-05 (2 days)
- Git range: milestone/v30.9 (33 commits)

---

## v30.8 ERC-8004 Trustless Agents 지원 (Shipped: 2026-03-04)

**Delivered:** ERC-8004 온체인 레지스트리(Identity/Reputation/Validation)를 WAIaaS에 통합하여, AI 에이전트가 온체인 신원 등록 + 평판 기반 신뢰 평가 + 검증 요청을 수행하고, REPUTATION_THRESHOLD 정책으로 상대방 평판에 따라 보안 티어를 자동 조정할 수 있는 상태.

**Phases completed:** 317-323 (7 phases, 15 plans, 39 requirements)

**Key accomplishments:**

- DB v39-40 Schema Extension — agent_identities(10 cols, wallet FK, status CHECK), reputation_cache(composite PK for tag filtering), approval_type dual-approval column, policies CHECK REPUTATION_THRESHOLD
- Erc8004ActionProvider 8 Write Actions + RegistryClient — viem-based encode methods, register_agent/set_agent_wallet/set_agent_uri/set_metadata/give_feedback/revoke_feedback/request_validation + unset_agent_wallet
- 4 Read-Only REST Endpoints + connect-info Extension — agent info, reputation, registration file auto-generation, validation status; per-wallet ERC-8004 identity data in connect-info
- ReputationCacheService 3-Tier Cache + REPUTATION_THRESHOLD Policy — memory→DB→RPC fallback(TTL 300s), Stage 3 position 6 evaluation, maxTier escalation, unrated_tier treatment
- EIP-712 Wallet Linking + ApprovalWorkflow — AgentWalletSet 4-field typehash, dual approval routing(SIWE/EIP712), WcSigningBridge eth_signTypedData_v4, calldata re-encoding with Owner signature
- Admin UI + MCP 11 Tools + SDK 11 Methods — ERC-8004 Identity page(3 tabs), reputation dashboard, REPUTATION_THRESHOLD policy form, 13th PolicyFormRouter case
- 182 Tests + erc8004.skill.md — E1-E20 test scenarios across 13 files, 612-line skill file, policies/admin skill updates

**Stats:**

- 7 phases, 15 plans, 39 requirements, 50 commits
- 121 files changed, +15,921 / -151 lines
- ~225,565 LOC TypeScript total
- Timeline: 2026-03-04 (1 day)
- Git range: 24d5ae3c..HEAD

---

## v30.6 ERC-4337 Account Abstraction 지원 (Shipped: 2026-03-04)

**Delivered:** EVM 지갑에 ERC-4337 스마트 어카운트 옵션을 추가하여 Paymaster 가스비 스폰서십, 네이티브 원자적 배치, UserOperation 기반 트랜잭션 실행이 가능한 상태.

**Phases completed:** 314-316 (3 phases, 10 plans, 36 requirements)

**Key accomplishments:**

- SmartAccountService + DB v38 — AccountType enum(eoa/smart), CREATE2 주소 예측, Drizzle 4-column 확장, migration v38
- Admin Settings 25개 정의 — smart_account.enabled feature gate, bundler/paymaster URL, chain-specific overrides, AES-GCM 암호화 API key
- UserOperation Pipeline — stage5Execute accountType 분기, BundlerClient/PaymasterClient 연동, BATCH 원자적 실행(calls[] 단일 UserOp)
- Paymaster Gas Sponsorship — paymaster_url 설정 시 가스비 스폰서십, rejection 패턴 감지(PAYMASTER_REJECTED), gas safety margin 120%
- 전 인터페이스 확장 — CLI --account-type, SDK createWallet(accountType), MCP wallet detail fetch, Admin UI Account Type 셀렉터 + Smart Account 설정 섹션
- Skill Files + Tests — wallet/quickstart/admin 스킬 파일 3개 업데이트, 86 새 테스트(13+59+14), 19 스냅샷 수정

**Stats:**

- 3 phases, 10 plans, 36 requirements, 21 commits
- 49 files changed, +4,709 / -38 lines
- Timeline: 2026-03-04 (~2h)
- Git range: feat(314-01) → feat(316-03)

---

## v30.2 운영 기능 확장 구현 (Shipped: 2026-03-04)

**Delivered:** v30.0에서 설계한 6가지 운영 기능을 구현하여 WAIaaS 데몬이 운영 환경에서 트랜잭션 시뮬레이션, 감사 로그 조회, 암호화 백업/복원, Webhook 이벤트 전달, 운영 통계 대시보드, AutoStop 규칙 플러그인 관리가 가능한 상태.

**Phases completed:** 309-313.1 (6 phases, 14 plans, 30 requirements)

**Key accomplishments:**

- Transaction Dry-Run — POST /v1/transactions/simulate로 정책 평가/수수료/잔액 변동/경고를 부수 효과 없이 사전 확인, SDK simulate() + MCP simulate_transaction 도구 제공
- Audit Log Query API — GET /v1/audit-logs cursor pagination + 6 필터, 감사 이벤트 9→20개 확대, insertAuditLog 헬퍼로 8개 서비스 파일에서 자동 기록
- Encrypted Backup & Restore — AES-256-GCM 암호화 아카이브(60B 바이너리 헤더), REST API + CLI 4 커맨드(backup/restore/list/inspect) + BackupWorker 자동 스케줄러
- Webhook Outbound — HMAC-SHA256 서명 HTTP 콜백, 4-attempt 재시도 큐(지수 백오프), webhooks+webhook_logs DB 테이블, EventBus 5 이벤트 연동
- Admin Stats + AutoStop Plugin — 7-category 운영 통계 API(30s 폴링 대시보드), IAutoStopRule 플러그인 인터페이스 + RuleRegistry, per-rule Admin Settings 토글
- Gap Closure — InMemoryCounter 프로덕션 와이어링(14 increment 호출), 63 테스트 assertion 수정, admin.skill.md 10 엔드포인트 동기화

**Stats:**

- 6 phases, 14 plans, 30 requirements, 106 commits
- 219 files changed, +31,274 / -1,023 lines
- ~246,245 LOC TypeScript, ~6,413 test cases
- DB: schema v37 (v36 audit index + v37 webhooks tables), 21 tables
- New REST APIs: 11 endpoints, New CLI commands: 4, New error codes: 7
- Timeline: 2026-03-03 ~ 2026-03-04

---

## v30.0 운영 기능 확장 설계 (Shipped: 2026-03-03)

**Delivered:** 운영 환경에서 필요한 6가지 기능(Transaction Dry-Run, Audit Log Query API, Encrypted Backup, Webhook Outbound, Admin Stats API, AutoStop Plugin Architecture)을 설계 수준에서 정의한 마일스톤. Zod 스키마, 인터페이스, 데이터 모델, 기존 설계 문서 통합 지점, 테스트 시나리오를 확정하여 구현 마일스톤의 입력을 생산.

**Phases completed:** 304-308 (5 phases, 11 plans, 25 requirements)

**Key accomplishments:**

- Transaction Dry-Run 설계 — SimulationResult Zod 스키마(12 warning codes, policy/fee/balanceChanges/warnings 4-axis), PipelineContext dryRun 분기(Stage 1'->2'->3'->5a->5b), POST /v1/transactions/simulate + SDK simulate() + MCP tool 스펙
- Audit Log Query API 설계 — AuditEventType 20개(기존 9 + 신규 11), id AUTOINCREMENT cursor pagination, GET /v1/audit-logs masterAuth 엔드포인트, insertAuditLog helper
- Encrypted Backup & Restore 설계 — AES-256-GCM 암호화 아카이브 바이너리 포맷(60B 헤더), EncryptedBackupService(VACUUM INTO 원자적 스냅샷), CLI 4 커맨드(backup/restore/list/inspect), config.toml [backup] 3키
- Webhook Outbound 설계 — webhooks+webhook_logs 2 DB 테이블, HMAC-SHA256 서명 프로토콜(X-WAIaaS-Signature), 4-attempt 재시도 큐(지수 백오프), REST API 4 엔드포인트, EventBus 이벤트 필터링
- Admin Stats + AutoStop Plugin 설계 — AdminStatsResponseSchema 7-category Zod, IMetricsCounter 인메모리 카운터, IAutoStopRule 플러그인 인터페이스, RuleRegistry(런타임 등록/해제), per-rule Admin Settings 토글

**Stats:**

- 5 phases, 11 plans, 25 requirements, 20 commits
- 30 files changed, +8,132 / -314 lines
- Timeline: 2026-03-03 (~50 min)
- Design decisions: 40+
- Design specs: 5 DESIGN-SPEC.md (OPS-01~06)

---

## v29.7 D'CENT 직접 서명 + Human Wallet Apps 통합 (Shipped: 2026-03-01)

**Delivered:** D'CENT 프리셋의 승인 방식을 WalletConnect에서 Push Relay 기반 직접 서명(sdk_ntfy)으로 전환하고, 지갑별 wallet_type 기반 서명 토픽 라우팅을 구현한 마일스톤. "Signing SDK"를 "Human Wallet Apps"로 재구성하여 지갑 앱을 wallet_apps DB 테이블 기반 1급 엔티티로 관리하고, 앱별 Signing/Alerts 토글, 앱별 알림 토픽 라우팅, Admin UI Human Wallet Apps 최상위 메뉴, Notifications 페이지 ntfy 독립 섹션 분리까지 완료.

**Phases completed:** 291-296 (6 phases, 11 plans, 40 requirements)

**Key accomplishments:**

- D'CENT preset sdk_ntfy 전환 — approval_method를 walletconnect에서 sdk_ntfy로 변경, wallet_type 기반 서명 토픽 라우팅(waiaas-sign-{wallet_type})
- Admin UI Owner 탭 개선 — Wallet Type 선택/변경 UI, approval method 미리보기, WalletConnect 조건부 표시, 상태별(NONE/GRACE/LOCKED) 읽기 전용 처리
- Human Wallet Apps 레지스트리 — wallet_apps DB 테이블(migration v31), WalletAppService CRUD, REST API 4 엔드포인트, signing_enabled 차단, 프리셋 자동 등록
- Human Wallet Apps Admin UI — 최상위 메뉴 승격, 앱 카드(Signing/Alerts 토글, Used by 목록), ntfy 서버 설정, 앱 등록/삭제
- 앱별 알림 라우팅 — WalletNotificationChannel을 앱별 토픽(waiaas-notify-{name}) 발행으로 전환, Alerts 토글 반영
- Notifications ntfy 독립 섹션 — ntfy FieldGroup 분리, Other Channels 정리(Discord+Slack only), Human Wallet Apps 링크

**Stats:**

- 6 phases, 11 plans, 40 requirements, 40 commits
- 73 files changed, +7,424 / -428 lines (+2,492 / -399 TS/TSX)
- Timeline: 1 day (2026-03-01)

---

## v29.6 Pendle Yield Trading + Yield 프레임워크 (Shipped: 2026-03-01)

**Delivered:** DeFi Yield 프레임워크(IYieldProvider, MaturityMonitor, MATURED 포지션 상태)를 구축하고 Pendle Finance를 첫 번째 Yield Provider로 구현하여, AI 에이전트가 고정 수익률 전략(PT/YT/LP 매수·상환·유동성 공급)을 정책 평가 하에 실행할 수 있도록 한 마일스톤. Pendle REST API v2 Convert 엔드포인트 기반 calldata 빌드, 만기 경고 알림(7일/1일/만기후), Admin Settings 7키 런타임 조정, MCP 5도구 자동 노출, actions.skill.md 문서화까지 완료. 추가로 #216(Solana WSS URL prefix) 및 #217(Lido factory errors) 버그 수정.

**Phases completed:** 288-290 (3 phases, 8 plans, 18 requirements)

**Key accomplishments:**

- IYieldProvider 인터페이스 — IActionProvider 확장, getMarkets/getPosition/getYieldForecast 메서드, MATURED 포지션 상태 추가
- PendleYieldProvider — 5개 Yield 액션(buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity), Convert API 기반 calldata 빌드
- PendleApiClient — Pendle REST API v2 래퍼, Zod 스키마 검증, 무료 티어 100 CU/분 지원
- MaturityMonitor — 만기 7일/1일 전 경고 + 만기 후 미상환 경고, 1일 1회 폴링, 24시간 쿨다운, EventBus 연동
- Admin Settings 7키 + MCP 5도구 자동 등록 + actions.skill.md Pendle Yield Trading 섹션
- 버그 수정: #216 Solana WSS URL prefix, #217 Lido factory default network residue

**Stats:**

- 3 phases, 8 plans, 18 requirements, 14 commits
- 50 files changed, +3,940 / -107 lines
- ~225,248 LOC TypeScript
- Timeline: 1 day (2026-03-01)

---

## v29.5 내부 일관성 정리 (Shipped: 2026-02-28)

**Delivered:** API 키 이중 저장소 버그(#214)를 SettingsService SSoT 통합으로 해결하고, Solana 네트워크 ID를 `solana-mainnet` 형식으로 전 스택 통일(#211)하며, Push Relay 서명 응답 릴레이 엔드포인트(#215)를 추가한 내부 일관성 정리 마일스톤. DB migration v28(api_keys→settings), v29(network ID 리네이밍), 레거시 입력 자동 변환, config.toml 하위 호환성을 모두 확보.

**Phases completed:** 285-287 (3 phases, 7 plans, 18 requirements)

**Key accomplishments:**

- API 키 저장소 SSoT 통합 — ApiKeyStore 완전 제거, DB migration v28로 api_keys→settings 마이그레이션, hot-reload rpcCaller 전달 수정
- Solana 네트워크 ID 통일 — `solana-mainnet`/`solana-devnet`/`solana-testnet` 전 스택 적용, DB migration v29 (6 테이블 12-step recreation)
- 레거시 입력 자동 변환 — `normalizeNetworkInput()` + `NetworkTypeEnumWithLegacy` Zod preprocess, config.toml `rpcConfigKey()` 양방향 매핑
- Push Relay 서명 응답 릴레이 — POST /v1/sign-response 엔드포인트 + sendViaRelay() SDK 함수
- 전 패키지 5,595+ 테스트 통과 확인 (typecheck/lint 포함)

**Stats:**

- 3 phases, 7 plans, 18 requirements, 23 commits
- 156 files changed, +3,990 / -1,220 lines
- ~223,044 LOC TypeScript
- Timeline: 1 day (2026-02-28)

---

## v29.4 Solana Lending -- Kamino (Shipped: 2026-02-28)

**Delivered:** Kamino K-Lend를 ILendingProvider 구현체로 구축하여 AI 에이전트가 Solana 체인에서 supply/borrow/repay/withdraw를 정책 평가 하에 수행할 수 있도록 한 마일스톤. v29.2에서 구축된 Lending 프레임워크를 재사용하며, @kamino-finance/klend-sdk 래핑 SDK로 Solana instruction을 빌드. HF 시뮬레이션 가드로 자기 청산 방지, PositionTracker duck-type 자동 등록, Admin Settings 3키 런타임 조정, MCP 4도구 자동 노출, Admin UI 7th provider card, KINT-07 LTV suffix matching 버그 수정까지 완료.

**Phases completed:** 283-284 (2 phases, 9 plans, 21 requirements)

**Key accomplishments:**

- KaminoLendingProvider — ILendingProvider + IPositionProvider 구현, 4 actions(supply/borrow/repay/withdraw), @kamino-finance/klend-sdk 래핑 SDK 추상화
- HF 시뮬레이션 모듈 — borrow/withdraw 전 Health Factor 영향 시뮬레이션, 자기 청산 위험 차단, Number 연산(USD floats)
- 83 신규 테스트 — 70 KPROV 단위 테스트(calculateHealthFactor/simulateKaminoHealthFactor/hfToStatus 포함) + 13 KINT 통합 테스트
- Full stack 통합 — registerBuiltInProviders + 3 Admin Settings(kamino.enabled/market/hf_threshold) + HealthFactorMonitor multi-provider 최소값 적용
- Admin UI + 문서 — Actions 페이지 Kamino Lending 7번째 카드 + actions.skill.md Section 9 (REST/MCP/SDK 예시 포함)
- KINT-07 버그 수정 — LendingPolicyEvaluator endsWith('borrow') suffix matching으로 provider-prefixed action name(kamino_borrow, aave_borrow) 정책 평가 정상화

**Stats:**

- 2 phases, 9 plans, 21 requirements, 21 commits
- 61 files changed, +6,771 / -206 lines
- ~192,843 LOC TypeScript, 83 new tests
- Timeline: 1 day (2026-02-28)

---

## v29.2 EVM Lending -- Aave V3 (Shipped: 2026-02-27)

**Delivered:** DeFi Lending 프레임워크(ILendingProvider/IPositionProvider 인터페이스, PositionTracker, HealthFactorMonitor, LendingPolicyEvaluator)를 구축하고, Aave V3를 첫 번째 Lending Provider로 구현. supply/borrow/repay/withdraw 4개 액션을 manual hex ABI encoding으로 5개 EVM 체인(Ethereum/Arbitrum/Optimism/Polygon/Base)에서 지원. 적응형 HF 모니터링(< 1.5 시 5분→1분 폴링), Lending 정책(max_ltv_pct + 비지출 분류), REST API + MCP 6도구 + TS/Python SDK 확장, Admin UI DeFi 포지션 대시보드 + Aave V3 Settings 4키 런타임 조정까지 완전 통합.

**Phases completed:** 274-278 (5 phases, 15 plans, 34 requirements)

**Key accomplishments:**

- DeFi Lending 프레임워크 — ILendingProvider/IPositionProvider, PositionTracker(5분 batch sync), HealthFactorMonitor(4단계 severity), LendingPolicyEvaluator(LTV/차입한도/비지출)
- Aave V3 LendingProvider — supply/borrow/repay/withdraw 4액션, manual hex ABI encoding(Lido 패턴), 5-chain Pool/DataProvider/Oracle 주소 레지스트리
- 적응형 헬스 팩터 모니터링 — HF < 1.5 시 폴링 5분→1분, LIQUIDATION_WARNING/IMMINENT 경고, borrow/withdraw 전 HF 시뮬레이션으로 자기 청산 방지
- REST API + MCP + SDK 통합 — GET /v1/wallet/positions + /health-factor, MCP 6도구(4 action auto-registered + 2 query), TS/Python SDK getPositions()/getHealthFactor()
- Admin UI DeFi 포트폴리오 — 대시보드 HF 게이지(색상 badge), 포지션 테이블, Aave V3 Settings 4키(enabled/hf_threshold/sync_interval/max_ltv_pct) 런타임 조정

**Stats:**

- 5 phases, 15 plans, 34 requirements, 109 commits
- 281 files changed, +45,864 / -1,159 lines
- Timeline: 2 days (2026-02-26 → 2026-02-27)

---

## v28.1 Jupiter Swap (Shipped: 2026-02-23)

**Delivered:** Jupiter Aggregator REST API를 IActionProvider 프레임워크에 통합하여 AI 에이전트가 Solana DEX 토큰 스왑을 안전하게 수행할 수 있게 달성. packages/actions/ 신규 모노레포 패키지에 JupiterApiClient(native fetch + Zod 검증) + JupiterSwapActionProvider(5-safety: 슬리피지 클램프, priceImpact 차단, Jito MEV tip, 동일 토큰 차단, Jupiter 프로그램 주소 검증) 구현. 데몬 자동 등록 + config.toml [actions] 8키 + MCP 자동 노출 + 기존 6-stage pipeline 정책 평가(CONTRACT_WHITELIST + SPENDING_LIMIT) 코드 변경 없이 통합.

**Phases completed:** 246-247 (2 phases, 6 plans, 17 requirements)

**Key accomplishments:**

- packages/actions/ 신규 모노레포 패키지 — ActionApiClient + slippage 유틸리티 + ChainError DeFi 코드 체계
- JupiterApiClient — Quote API v1(/swap/v1/quote) + /swap-instructions Zod 검증, native fetch 구현 (무의존성)
- JupiterSwapActionProvider — 5-safety (슬리피지 50bps/500bps 클램프, priceImpact 1% 차단, Jito MEV tip 1000 lamports, 동일 토큰 차단)
- 데몬 자동 등록 — config.toml [actions] 8 keys + registerBuiltInProviders + MCP jupiter_swap 자동 노출
- 정책 통합 — 기존 6-stage pipeline이 CONTRACT_WHITELIST + SPENDING_LIMIT 자동 평가 (코드 변경 0)
- actions.skill.md — Jupiter Swap 상세 문서 (REST API / MCP / SDK 예시, config, 안전 장치)

**Stats:**

- 2 phases, 6 plans, 17 requirements, 16 commits
- 63 files changed (code), +2,972 / -1,721 lines
- ~187,250 LOC TypeScript, 4,975 tests
- Timeline: 1 day (2026-02-23)

---

## v27.1 수신 트랜잭션 모니터링 구현 (Shipped: 2026-02-22)

**Delivered:** v27.0에서 설계한 수신 트랜잭션 모니터링을 완전 구현. IChainSubscriber 기반 Solana/EVM 체인별 수신 감지, IncomingTxQueue 메모리 큐 + 배치 flush, SubscriptionMultiplexer 연결 공유 + 폴링 폴백, 3개 안전 규칙(dust/unknownToken/largeAmount), REST API 3 엔드포인트 + SDK/MCP 확장, 20개 통합 테스트 완성.

**Phases completed:** 224-230 (7 phases, 18 plans, 30 requirements)

**Key accomplishments:**

- IChainSubscriber 6-method interface + DB v21 migration (incoming_transactions, incoming_tx_cursors, wallets.monitor_incoming)
- SolanaIncomingSubscriber WebSocket logsSubscribe + SOL/SPL/Token-2022 파서 + 60s heartbeat keepalive
- EvmIncomingSubscriber getLogs ERC-20 Transfer + getBlock native ETH 폴링 감지
- IncomingTxMonitorService: 큐(Map dedup + batch flush) + multiplexer(연결 공유 + 재연결) + 3 safety rules + KillSwitch 연동
- REST API(GET /incoming, /summary, PATCH /wallets/:id monitorIncoming) + TS/Python SDK + MCP 2 tools + Admin IncomingSettings
- 20 통합 테스트 — 6대 피트폴(listener leak, SQLite contention, dedup, shutdown drain, EVM reorg) + gap recovery + KillSwitch 억제

**Stats:**

- 7 phases, 18 plans, 30 requirements, 102 commits
- 189 files changed, +23,969 / -5,834 lines
- ~155,540 LOC TypeScript
- Timeline: 1 day (2026-02-21 → 2026-02-22)

### Known Gaps

- **STO-03**: Confirmation Worker RPC 콜백(getBlockNumber, checkSolanaFinalized) 미주입 — DETECTED→CONFIRMED 상태 전환 미작동. 다음 마일스톤에서 수정 예정.

---

## v27.0 수신 트랜잭션 모니터링 설계 (Shipped: 2026-02-21)

**Delivered:** 지갑으로 들어오는 수신 트랜잭션을 실시간 감지·기록·알림하는 인프라를 설계 수준에서 완전히 정의. IChainSubscriber 6-메서드 인터페이스, incoming_transactions DB 스키마, Solana/EVM 체인별 감지 전략, WebSocket 3-state 상태 머신 + 폴링 폴백, 의심 입금 감지 3규칙, REST API/SDK/MCP 명세, config.toml [incoming] 6키 설정까지 설계 문서(doc 76, ~2,300줄, 8섹션)로 완성. 감사 갭 9건 전량 해결.

**Phases completed:** 215-223 (9 phases, 16 plans, 29 requirements + 9 gap closure items)

**Key accomplishments:**

- IChainSubscriber 6-메서드 인터페이스(subscribe/unsubscribe/subscribedAddresses/connect/waitForDisconnect/destroy) + IncomingTransaction 타입 + incoming_transactions DDL(v21 마이그레이션) 완성
- Solana logsSubscribe(mentions) + getTransaction(jsonParsed) SOL/SPL/Token-2022 이중 감지 + ATA 자동 감지 전략 설계
- EVM getLogs Transfer + getBlock(includeTransactions) ETH/ERC-20 이중 감지 + token_registry 화이트리스트 오탐 방지 전략 설계
- 3-state WebSocket 상태 머신(WS_ACTIVE/POLLING_FALLBACK/RECONNECTING) + SubscriptionMultiplexer 연결 공유 + 블라인드 구간 커서 기반 복구 설계
- INCOMING_TX_DETECTED/SUSPICIOUS 이벤트 + IIncomingSafetyRule 3규칙(dust/unknownToken/largeAmount) + i18n(en/ko) + 5채널 알림 연동 명세
- REST API(GET /v1/wallet/incoming + /summary) + SDK/MCP 인터페이스 Zod SSoT 명세 + config.toml [incoming] 6키 + 지갑별 opt-in 설계

**Stats:**

- 9 phases, 16 plans, 29 requirements, 26 design decisions, 9 gap closure items
- 101 files changed, +8,058 / -2,158 lines
- Output: internal/design/76-incoming-transaction-monitoring.md (~2,300 lines, 8 sections)
- Timeline: 1 day (2026-02-21)
- Git range: 1618dce → e32e2f0 (40 commits)

---

## v2.0 전 기능 완성 릴리스 (Shipped: 2026-02-18)

**Delivered:** v0.1~v1.8까지 37개 마일스톤으로 축적된 설계와 구현의 최종 검증, 문서화, 공개 릴리스를 달성. 설계 부채 0건 확인, 테스트 게이트 전수 통과, 영문 사용자 문서 완비, npm 8개 패키지 + Docker 이미지 배포 활성화, v2.0.0-rc.1 pre-release 발행.

**Phases completed:** 165-173 (9 phases, 17 plans, 25 requirements)

**Key accomplishments:**

- MIT License + npm @waiaas scope 확보 + 10개 패키지 배포 메타데이터 완비 (publishConfig, repository, homepage)
- 설계 문서 44개 구현 교차 검증 PASS + 설계 부채 0건 + OpenAPI 3.0 CI 자동 검증 (swagger-parser)
- 보안 460건 + 단위 2,482건 + 플랫폼 84건 테스트 전수 통과, 커버리지 Hard 80% 게이트 달성 (core 97.73%, daemon 86.23%)
- 이중 언어 README(en) + CONTRIBUTING + 배포 가이드(CLI/Docker) + API 레퍼런스(60+ 엔드포인트) + CHANGELOG(v1.1~v1.8) 완비
- @waiaas/skills npx 배포 패키지(7 스킬 파일) + examples/simple-agent SDK 예제 에이전트
- npm 8개 패키지 v2.0.0-rc.1 publish + Docker Hub/GHCR dual push + release.yml 6-job 파이프라인 E2E 검증

**Stats:**

- 9 phases, 17 plans, 25 requirements, 237 files changed, +13,575 LOC (net)
- ~124,830 LOC TypeScript, ~3,599 tests
- 101 commits, 2 days (2026-02-17 → 2026-02-18)
- Git range: v1.8.0 → HEAD

### Known Gaps

- INT-01: README.md/deployment.md `add --all` vs `add all` CLI 문법 불일치 (cosmetic, v2.0.5 이연)
- INT-02: examples/simple-agent/README.md 깨진 링크 + placeholder URL + 구버전 (v2.0.5 이연)
- FLOW-01/FLOW-02: Skills CLI `add --all` 흐름 + example agent setup 흐름 (cosmetic, v2.0.5 이연)
- validate-openapi.ts @see 주석 경로 불일치 (internal, v2.0.5 이연)

**What's next:** v2.0.1 거버넌스 + 신뢰 강화 or v2.0.5 DX 폴리싱

---

## v1.5.3 USD 정책 확장 (누적 지출 한도 + 표시 통화) (Shipped: 2026-02-16)

**Delivered:** 월렛 단위 24시간/30일 롤링 윈도우 누적 USD 지출 한도로 분할 전송 우회를 방지하고, 43개 법정 통화로 환산 표시하여 Admin UI/알림/REST API/MCP 전체 인터페이스에서 다국어 DX를 개선하는 상태 달성

**Phases completed:** 136-139 (8 plans total)

**Key accomplishments:**

- DB v13 마이그레이션 + 누적 USD 지출 한도 엔진 — amount_usd/reserved_amount_usd 컬럼, 24h/30d 롤링 윈도우, APPROVAL 격상, 이중 지출 방지, 80% 경고 알림
- IForexRateService + CoinGeckoForexProvider — tether vs_currencies 기반 43개 법정 통화 환율, InMemoryPriceCache 30분 TTL, graceful null fallback
- Admin CurrencySelect 드롭다운 — 43개 통화 검색 가능, 환율 미리보기, SettingsService display.currency hot-reload
- REST API display_currency 쿼리 파라미터 — transactions/balance/assets 4개 엔드포인트에 displayAmount/displayBalance/displayValue 환산 필드
- MCP 도구 + 알림 환산 통합 — 4개 MCP 조회 도구에 display_currency 파라미터, 6개 알림 템플릿에 {display_amount} 변수

**Stats:**

- 4 phases, 8 plans, 19 requirements, 98 files changed, +8,762 LOC (net)
- ~2,150 tests (~2,111 → ~2,150, +39 forex/format tests)
- Git range: feat(136-01) → feat(139-02)

---

## v1.5.2 Admin UI 정책 폼 UX 개선 (Shipped: 2026-02-16)

**Delivered:** Admin UI에서 12개 정책 타입별 구조화된 전용 폼으로 정책을 생성/수정할 수 있고, 목록에서 타입별 의미 있는 시각화(심볼 배지, req/time 포맷, tier bars)를 확인할 수 있으며, 기존 정책 수정 시 현재값이 프리필되어 수정/저장이 가능한 상태 달성

**Phases completed:** 134-135 (4 plans total)

**Key accomplishments:**

- 12개 PolicyType 전체 Zod rules 스키마 등록 — 4개 미등록 타입(WHITELIST, RATE_LIMIT, TIME_RESTRICTION, X402_ALLOWED_DOMAINS) 추가, POLICY_RULES_SCHEMAS Partial→Record 전환
- DynamicRowList + PolicyFormRouter 폼 인프라 — 재사용 가능한 동적 행 컴포넌트(generic T, renderRow 콜백), 12-type switch/case 분기 라우터
- 12개 PolicyType 전용 폼 컴포넌트 — SpendingLimitForm(3-tier 네이티브+USD), WhitelistForm, RateLimitForm, ApproveAmountLimitForm, ApproveTierOverrideForm, AllowedTokensForm, ContractWhitelistForm, MethodWhitelistForm(2단계 중첩 DynamicRowList), ApprovedSpendersForm, TimeRestrictionForm, AllowedNetworksForm, X402AllowedDomainsForm
- PolicyRulesSummary 12-type 목록 시각화 — ALLOWED_TOKENS 심볼 배지, RATE_LIMIT "100 req / 1h", SPENDING_LIMIT tier bars, APPROVE_TIER_OVERRIDE 색상 배지, 나머지 타입 개수/패턴 배지
- 수정 모달 전용 폼 프리필/저장 통합 — editRulesObj 프리필, PolicyFormRouter + validateRules 재사용, PUT API 호출

**Stats:**

- 2 phases, 4 plans, 24 requirements, 7 설계 결정
- 2,111 tests (2,058 → 2,111, +53 new tests)
- ~188,000 LOC total
- 15 commits, 1 day (2026-02-15 ~ 2026-02-16)

**Git range:** `v1.5.1` → `7d19887` (Phase 135 complete)

**What's next:** 다음 마일스톤 계획 (/gsd:new-milestone)

---

## v1.5.1 x402 클라이언트 지원 (Shipped: 2026-02-15)

**Delivered:** AI 에이전트가 x402 프로토콜로 보호된 외부 유료 API를 자동 결제하며 사용할 수 있는 상태를 달성 — SSRF 가드 자체 구현, x402 핸들러(HTTP 402 파싱 → scheme 선택 → EVM EIP-3009/Solana TransferChecked 결제 서명), POST /v1/x402/fetch REST API, X402_ALLOWED_DOMAINS 기본 거부 정책 + SPENDING_LIMIT 4-tier USD 환산 통합, 감사 로그(X402_PAYMENT) + 알림 연동, TS/Python SDK + MCP x402_fetch 도구 + x402.skill.md 스킬 파일

**Phases completed:** 130-133 (10 plans total)

**Key accomplishments:**

- SSRF 가드 자체 구현 — RFC 5735/6890 전체 범위 사설 IP 차단, IPv4-mapped IPv6/옥탈/16진수 우회 벡터 차단, 리다이렉트 매 hop IP 재검증, HTTPS 강제, URL 정규화, 54 단위 테스트
- x402 자동 결제 파이프라인 — HTTP 402 PAYMENT-REQUIRED 헤더 파싱, (scheme, network) 쌍 자동 선택, EVM EIP-3009 transferWithAuthorization signTypedData + Solana SPL TransferChecked signBytes 결제 서명, 재요청 + 1회 재시도 제한
- X402_ALLOWED_DOMAINS 기본 거부 정책 — 와일드카드 dot-boundary 매칭, SPENDING_LIMIT 4-tier evaluateAndReserve 통합, USDC $1 직접 환산 + IPriceOracle USD 환산, DELAY request_timeout 대기/APPROVAL 즉시 거부
- POST /v1/x402/fetch REST API — sessionAuth 보호, 3-phase 오케스트레이션(validation → policy+402 → signing+retry), transactions X402_PAYMENT 기록 + TX_REQUESTED/TX_CONFIRMED/TX_FAILED 알림 연동, Kill Switch 전체 차단
- TS/Python SDK + MCP x402_fetch 도구 — WAIaaSClient.x402Fetch()/x402_fetch() 메서드, MCP x402_fetch 15번째 도구, x402.skill.md 스킬 파일 + waiaas://skills/x402 리소스, transactions.skill.md X402_PAYMENT 반영

**Stats:**

- 95 files changed, +18,160 / -252 lines
- 4 phases, 10 plans, 39 requirements, 59 설계 결정
- 2,058 tests (1,848 → 2,058, +210 new tests)
- ~187,000 LOC total
- 53 commits, 1 day (2026-02-15)

**Git range:** `v1.5.0` → `0033f0b` (Phase 133 complete)

**What's next:** v1.6 Desktop + Telegram + Docker 또는 v1.6.4 Wallet Signing SDK

---

## v1.3.3 MCP 다중 에이전트 지원 (Shipped: 2026-02-11)

**Delivered:** 하나의 WAIaaS 데몬에 등록된 여러 에이전트를 Claude Desktop(MCP)에서 동시에 사용할 수 있도록, 에이전트별 토큰 경로 분리(mcp-tokens/<agentId>), MCP 서버 이름/description 에이전트 식별, CLI `mcp setup --all` 일괄 설정을 구현

**Phases completed:** 71-72 (2 plans total)

**Key accomplishments:**

- SessionManager 에이전트별 토큰 경로 분리 — `mcp-tokens/<agentId>` 경로 + 기존 `mcp-token` fallback(ENOENT only), AgentContext DI 패턴
- MCP 서버 에이전트 식별 — `waiaas-{agentName}` 동적 서버 이름, 6 도구 + 3 리소스 `[agentName]` description prefix, withAgentPrefix 재사용 헬퍼
- CLI `mcp setup` 다중 에이전트 — `--agent` 개별 + `--all` 일괄 설정, config 스니펫에 WAIAAS_AGENT_ID/NAME 환경변수, `waiaas-{slug}` 키 이름
- Slug 유틸리티 — toSlug + resolveSlugCollisions, 충돌 시 agentId 앞 8자 접미사
- 45 신규 테스트 — 14 MCP 경로/서버 + 9 slug 단위 + 22 CLI mcp-setup 통합

**Stats:**

- 19 files changed, +961 / -125 lines
- 2 phases, 2 plans, 4 tasks, 14 requirements, 11 설계 결정
- 847 tests (816 → 847, +31 new tests)
- 44,639 LOC total
- 1 day (2026-02-11)

**Git range:** `8fd6439` (Phase 71 start) → `d147147` (Phase 72 complete)

**What's next:** v1.4 토큰 + 컨트랙트 확장 — SPL/ERC-20 토큰 전송, 컨트랙트 호출, Approve, Batch, EVM 어댑터

---

## v0.10 구현 전 설계 완결성 확보 (Shipped: 2026-02-09)

**Delivered:** v0.2~v0.9에서 작성한 30개 설계 문서의 BLOCKING 4건 + HIGH 8건 = 12건의 구현 차단 미비점을 4개 영역(정책 엔진, 에러 처리, 동시성/실행, 운영 로직)에서 전수 해소하여, 설계 문서만으로 코드를 작성할 수 있는 상태를 확립

**Phases completed:** 41-44 (10 plans total)

**Key accomplishments:**

- 정책 엔진 완결 — PolicyRuleSchema SSoT 교차 참조(25-sqlite↔33-time-lock), GRACE 무기한+markOwnerVerified() 배타적 전이, APPROVAL 타임아웃 3단계 우선순위(정책별>config>3600초)
- 에러 처리 체계 완결 — 66개 에러 코드 통합 매트릭스(SS10.12 SSoT), ChainError 25코드 3-카테고리 분류(PERMANENT 17/TRANSIENT 4/STALE 4), PolicyType 10개 확장+superRefine 검증
- 동시성+실행 로직 완결 — Stage 5 완전 의사코드(build→simulate→sign→submit+에러분기+재시도), 세션 갱신 낙관적 잠금(token_hash CAS), Kill Switch 4전이 CAS ACID 패턴
- 운영 로직 완결 — 데몬 6단계 시작 타임아웃(5~30초/90초 상한, fail-fast/soft), Batch 부모-자식 2계층 DB+PARTIAL_FAILURE, Oracle 교차 검증 인라인+가격 나이 3단계(FRESH/AGING/STALE)
- 12건 구현 차단 미비점 전수 해소 — 설계 문서 11개 직접 수정, 22개 설계 결정 확정

**Stats:**

- 30 files changed, +4,972 / -195 lines (Markdown design docs)
- 4 phases, 10 plans, 12 requirements, 22 설계 결정
- 1 day (2026-02-09)

**Git range:** `dd7def4` (Phase 41 start) → `4e2357e` (Phase 44 complete)

**What's next:** v1.0 구현 계획 — 설계 문서(24-64) 기반 구현 마일스톤 시작

---

## v0.9 MCP 세션 관리 자동화 설계 (Shipped: 2026-02-09)

**Delivered:** MCP 환경에서 세션 토큰의 갱신·만료·재발급을 자동화하는 메커니즘을 설계 수준에서 완전히 정의 — SessionManager 핵심 로직, MCP tool handler 통합, CLI/Telegram 외부 연동, 18개 테스트 시나리오, 7개 기존 설계 문서 v0.9 통합

**Phases completed:** 36-40 (10 plans total)

**Key accomplishments:**

- 토큰 파일 인프라 — getMcpTokenPath/writeMcpToken/readMcpToken 3개 공유 유틸리티, write-then-rename 원자적 쓰기, SESSION_EXPIRING_SOON 17번째 알림 이벤트
- SessionManager 핵심 설계 — getToken/getState/start/dispose 4개 public 메서드, 9개 내부 상태, 60% TTL 자동 갱신, safeSetTimeout(32-bit overflow 방어), 5종 에러 분기 + lazy 401 reload
- MCP 통합 설계 — ApiClient 래퍼 클래스, 6+3 tool/resource handler 통합, 50ms 대기 토큰 로테이션 동시성, 60초 polling 에러 복구, Claude Desktop isError 회피 전략
- CLI + Telegram 연동 — mcp setup(7단계)/refresh-token(8단계) 커맨드, /newsession 인라인 키보드, resolveDefaultConstraints 공용 함수
- 테스트 설계 + 문서 통합 — T-01~T-14 + S-01~S-04 시나리오 명시, pitfall 교차 참조 매트릭스, 7개 설계 문서 85개 [v0.9] 태그 통합

**Stats:**

- 47 files created/modified
- +15,463 / -470 lines (Markdown design docs)
- 5 phases, 10 plans, 21 requirements, 34 설계 결정, 7 설계 문서 수정 (85 [v0.9] 태그)
- 1 day (2026-02-09)

**Git range:** `cd8ef0a` (v0.8 complete) → `f15eed7` (Phase 40 complete)

**What's next:** v0.10 구현 계획 — 설계 문서(24-64) 기반 구현 마일스톤 시작

---

## v0.8 Owner 선택적 등록 + 점진적 보안 모델 (Shipped: 2026-02-09)

**Delivered:** Owner 지갑 등록을 필수에서 선택으로 전환하고, 등록 여부에 따라 보안 기능이 점진적으로 해금되는 모델을 설계 — 3-State 상태 머신(NONE/GRACE/LOCKED), APPROVAL→DELAY 다운그레이드, sweepAll 자금 회수 프로토콜, 14개 기존 설계 문서 v0.8 통합

**Phases completed:** 31-35 (11 plans total)

**Key accomplishments:**

- Owner 선택적 데이터 모델 — agents.owner_address nullable 전환, OwnerState(NONE/GRACE/LOCKED) 런타임 파생 타입, IChainAdapter.sweepAll 20번째 메서드 추가
- Owner 생명주기 상태 머신 — 3-State 6-전이 설계, OwnerLifecycleService, 유예/잠금 2단계 인증 분기, 보안 공격 방어 4건(C-01/C-02/H-02/H-03)
- 정책 다운그레이드 메커니즘 — evaluate() Step 9.5 APPROVAL→DELAY 다운그레이드, TX_DOWNGRADED_DELAY 16번째 알림 이벤트, 3채널 Owner 등록 안내 템플릿
- 자금 회수 프로토콜 — withdraw API(38번째 엔드포인트), sweepAll Solana 4단계 실행, HTTP 207 부분 실패, Kill Switch/세션 갱신 Owner 유무 분기
- DX + 설계 문서 통합 — 3개 신규 CLI 명령(set-owner/remove-owner/withdraw), 18x3 Owner 상태 분기 매트릭스 SSoT, 14개 설계 문서 + 3개 참조 문서 v0.8 통합(240 [v0.8] 태그)

**Stats:**

- 53 files created/modified
- +13,651 / -386 lines (Markdown design docs)
- 5 phases, 11 plans, 33 requirements, 17 설계 문서 수정 (240 [v0.8] 태그)
- 2 days (2026-02-08 → 2026-02-09)

**Git range:** `227b495` (milestone start) → `bfa407d` (Phase 35 complete)

**What's next:** v0.9 구현 준비 — 설계 문서(24-64) 기반 구현 마일스톤 시작

---

## v0.7 구현 장애 요소 해소 (Shipped: 2026-02-08)

**Delivered:** v0.1~v0.6 설계 문서 전수 분석에서 도출된 25건의 구현 장애 요소(CRITICAL 7 + HIGH 10 + MEDIUM 8)를 기존 설계 문서 9개를 직접 수정하여 해소, 코드 작성 첫날부터 차단 없이 구현 가능한 상태를 확립

**Phases completed:** 26-30 (11 plans total)

**Key accomplishments:**

- 체인 어댑터 안정화 — Solana blockhash freshness guard, IChainAdapter 17→19 메서드(EVM nonce), AES-GCM nonce 수학 정정, Priority fee TTL Nyquist 근거 + 1.5배 bump
- 데몬 보안 기반 확립 — JWT Secret dual-key rotation(5분 윈도우), flock 인스턴스 잠금(PID 폐기), Rate Limiter 2단계 분리, killSwitchGuard 503 SYSTEM_LOCKED, Master Password Argon2id 통일
- 의존성 빌드 환경 해소 — SIWE viem/siwe 전환(ethers 제거), Sidecar 5개 타겟 플랫폼 + prebuildify 네이티브 번들
- API 통합 프로토콜 완성 — Tauri sidecar 종료 35초 + integrity_check, CORS 5종 Origin, Owner disconnect cascade 5단계, TransactionType HTTP status 매트릭스, Python SDK to_camel SSoT
- 스키마 설정 확정 — config.toml 환경변수 평탄화(17키), SQLite timestamp 초 단위 통일, agents CHECK 제약, Docker UID 1001, amount TEXT 근거, 알림 채널 BEGIN IMMEDIATE

**Stats:**

- 67 files created/modified
- +12,437 / -746 lines (Markdown design docs)
- 5 phases, 11 plans, 25 requirements, 9 설계 문서 수정 (150+ [v0.7 보완] 태그)
- 1 day (2026-02-08)

**Git range:** `d09bdbb` (milestone start) → `f0a3778` (Phase 30 complete)

**What's next:** v1.0 구현 마일스톤 — 설계 문서(24-64)를 기반으로 실제 코드 구현 시작

---

## v0.6 블록체인 기능 확장 설계 (Shipped: 2026-02-08)

**Delivered:** IChainAdapter와 트랜잭션 파이프라인을 확장하여 SPL/ERC-20 토큰 전송, 임의 컨트랙트 호출, Approve 관리, 배치 트랜잭션, 가격 오라클, Action Provider 아키텍처를 설계하고, 기존 설계 문서 8개에 v0.6 변경을 통합

**Phases completed:** 22-25 (11 plans total)

**Key accomplishments:**

- 토큰 확장 설계 — TransferRequest.token 확장(SPL/ERC-20), getAssets() 복원, ALLOWED_TOKENS 정책, ATA/gas 수수료 추정
- 트랜잭션 타입 확장 — ContractCallRequest(기본 거부 opt-in), ApproveRequest(독립 정책 카테고리, 무제한 차단), BatchRequest(Solana 원자적, 2단계 합산 정책)
- 상위 추상화 레이어 — IPriceOracle(CoinGecko/Pyth/Chainlink, 5분TTL, OracleChain fallback), USD 기준 정책 평가 전환
- Action Provider 아키텍처 — IActionProvider resolve-then-execute 패턴, MCP Tool 자동 변환(16개 상한), Jupiter Swap 상세 설계
- 테스트 전략 통합 — Mock 경계 5→10개, Contract Test 5→7개, Hardhat EVM 환경, 166개 시나리오(124기능+42보안)
- 기존 문서 8개 v0.6 통합 — Enum 9→12, IChainAdapter 13→17 메서드, REST API 31→36 엔드포인트, 에러코드 40→60

**Stats:**

- 58 files created/modified
- +26,976 / -247 lines (Markdown design docs)
- 4 phases, 11 plans, 30 requirements, 17 deliverables (docs 56-64 신규 + 기존 8개 수정)
- 2 days (2026-02-07 → 2026-02-08)

**Git range:** `2571e9c` (Phase 22 start) → `54cb3d3` (Phase 25 complete)

**What's next:** 구현 마일스톤 — 설계 문서(24-64)를 기반으로 실제 코드 구현 시작

---

## v0.5 인증 모델 재설계 + DX 개선 (Shipped: 2026-02-07)

**Delivered:** masterAuth/ownerAuth/sessionAuth 3-tier 인증 모델을 재설계하고, Owner 주소를 에이전트별 속성으로 이동하며, 세션 낙관적 갱신 프로토콜과 CLI DX 개선을 설계하여, 기존 설계 문서 11개에 v0.5 변경을 통합

**Phases completed:** 19-21 (9 plans total)

**Key accomplishments:**

- 3-Tier 인증 모델 재설계 — masterAuth(로컬 관리) / ownerAuth(자금 인가, 2곳 한정) / sessionAuth(에이전트 API) 책임 분리, authRouter 통합 디스패처
- Owner 주소 에이전트별 귀속 — agents.owner_address NOT NULL, config.toml [owner] 제거, owner_wallets → wallet_connections 전환, WalletConnect 선택적
- 세션 낙관적 갱신 프로토콜 — PUT /renew sessionAuth, 5종 안전 장치(maxRenewals 30, 총 수명 30일, 50% 시점), 토큰 로테이션 + Owner 사후 거부
- CLI DX 개선 — init 2단계 간소화, --quickstart 단일 커맨드, --dev 모드, actionable 에러 hint 31/40 매핑, MCP 옵션 B 채택
- 설계 문서 11개 v0.5 통합 — 신규 4문서(52-55) + 기존 11개 수정, 통합 검증 25/25 PASSED

**Stats:**

- 54 files created/modified
- +14,928 / -696 lines (Markdown design docs)
- 3 phases, 9 plans, 24 requirements, 15 deliverables (docs 52-55 신규 + 11개 수정)
- 1 day (2026-02-07)

**Git range:** `683aace` (Phase 19 start) → `84dfef3` (audit complete)

**What's next:** 구현 마일스톤 — 설계 문서(24-55)를 기반으로 실제 코드 구현 시작

---

## v0.4 테스트 전략 및 계획 수립 (Shipped: 2026-02-07)

**Delivered:** v0.2 설계 문서(17개) + v0.3 일관성 대응표(5개)를 역방향 검증하는 테스트 전략을 수립하여, 구현 단계에서 "무엇을 어떻게 테스트할 것인가"가 명확한 상태를 확립

**Phases completed:** 14-18 (9 plans total)

**Key accomplishments:**

- 테스트 기반 확립 — 6개 테스트 레벨, 9x6 모듈 매트릭스, 4-tier 커버리지 목표, IClock/IOwnerSigner 인터페이스 + 5개 Contract Test 전략
- 보안 시나리오 71건 — 3계층 공격 47건 + 경계값 19건 + E2E 연쇄 체인 5건, Given-When-Then 테스트 케이스 수준
- 블록체인 테스트 격리 — Solana 3단계(Mock RPC 13건 / Local Validator 5흐름 / Devnet 3건), Enum SSoT 빌드타임 파생 체인
- CI/CD 파이프라인 설계 — 4단계(push/PR/nightly/release), GitHub Actions 4 YAML + 1 composite action, Soft/Hard 커버리지 게이트
- 배포 타겟별 테스트 118건 — CLI 32 + Docker 18 + Tauri 34(자동 6+수동 28) + Telegram 34 시나리오

**Stats:**

- 44 files created/modified
- 9,432 lines of test strategy docs (Markdown)
- 5 phases, 9 plans, 26 requirements, 11 deliverables (docs 41-51)
- 2 days (2026-02-06 → 2026-02-07)

**Git range:** `a0214e1` (Phase 14 start) → `725f083` (Phase 18 complete)

**What's next:** v0.5 구현 — 테스트 전략 문서를 참조하여 테스트 코드, Mock 구현, CI 워크플로우 작성 시작

---

## v0.3 설계 논리 일관성 확보 (Shipped: 2026-02-06)

**Delivered:** v0.1(23개) + v0.2(17개) = 40개 설계 문서를 크로스체크하여 37개 비일관성(8 CRITICAL + 15 HIGH + 14 MEDIUM)을 모두 해소, 구현 단계 진입을 위한 Single Source of Truth 확립

**Phases completed:** 10-13 (8 plans total)

**Key accomplishments:**

- v0.1 잔재 정리 — 6개 문서 SUPERSEDED 표기, v0.1→v0.2 변경 매핑 문서 + 3개 용어 대응표(인터페이스/에러코드/에스컬레이션) 작성
- CRITICAL 4건 의사결정 확정 — 포트 3100 통일, TransactionStatus 8개 SSoT, Docker hostname 오버라이드(WAIAAS_DAEMON_HOSTNAME), 자금 충전 모델(Owner→Agent 직접 전송)
- Enum/상태값 9개 통합 대응표 작성(45-enum-unified-mapping.md) + config.toml 누락 설정 11개 추가 (jwt_secret, rate_limit 3-level, auto_stop, kill_switch, policy_defaults)
- REST API↔API Framework 6건 스펙 통일 (CORS, Health, ownerAuth 9단계, memo 이중 검증) + 11개 구현 노트를 8개 설계 문서에 추가
- 37/37 요구사항 완료, 5/5 E2E 문서 플로우 검증, 0건 기술 부채

**Stats:**

- 35 files created/modified
- +6,856 / -314 lines (Markdown design docs)
- 4 phases, 8 plans, 37 requirements
- 1 day (2026-02-06)

**Git range:** `8f5203d` (Phase 10 start) → `a027142` (audit complete)

**What's next:** v0.4 Implementation — 통일된 설계 문서를 기반으로 실제 코드 구현 시작

---

## v0.2 Self-Hosted Secure Wallet Design (Shipped: 2026-02-05)

**Delivered:** Self-Hosted AI 에이전트 지갑의 상세 설계를 완성 -- 3계층 보안 모델, 17개 설계 문서, 45개 요구사항을 구현 가능한 수준으로 정의

**Phases completed:** 6-9 (16 plans total)

**Key accomplishments:**

- 암호화 키스토어 바이트 수준 스펙 (AES-256-GCM + Argon2id + sodium guarded memory) + SQLite 7-table 스키마 + 데몬 라이프사이클 설계
- JWT 세션 프로토콜 (SIWS/SIWE 서명), 6단계 거래 파이프라인, SolanaAdapter 13 메서드 상세 설계
- 3계층 보안: 4-tier 정책 엔진 + WalletConnect v2 Owner 인증 + 멀티 채널 알림 + Kill Switch 캐스케이드
- REST API 31 엔드포인트 + TypeScript/Python SDK + MCP 6 도구 + Tauri Desktop 8화면 + Telegram Bot + Docker 배포 스펙
- 45개 요구사항 전체 충족, 교차 페이즈 통합 43건 검증, E2E 6개 핵심 플로우 완전

**Stats:**

- 74 files created/modified
- 32,158 lines of design docs (Markdown deliverables)
- 4 phases, 16 plans, 17 deliverables
- 1 day (same-day completion, 2026-02-05)

**Git range:** `5be4181` (Phase 6 start) → `fec9f88` (audit complete)

**What's next:** v0.3 Implementation -- 설계 문서를 기반으로 실제 코드 구현 시작

---

## v0.1 Research & Design (Shipped: 2026-02-05)

**Delivered:** AI 에이전트용 Wallet-as-a-Service의 전체 설계 문서 완성 — 기술 스택부터 API 스펙까지.

**Phases completed:** 1-5 (15 plans total)

**Key accomplishments:**

- 기술 스택 확정 — TypeScript 5.x/Fastify 5.x/PostgreSQL/Redis, Solana @solana/kit 3.x 개발 환경
- 커스터디 모델 확정 — AWS KMS + Nitro Enclaves + Squads Protocol 하이브리드 아키텍처 (직접 구축, 외부 프로바이더 배제)
- Dual Key 아키텍처 설계 — Owner Key(KMS)/Agent Key(Enclave) 분리, 3중 정책 검증 레이어
- 소유자-에이전트 관계 모델 — 5단계 에이전트 라이프사이클, Budget Pool 자금 관리, Hub-and-Spoke 멀티 에이전트
- API 스펙 완성 — 33개 REST 엔드포인트, 46개 에러 코드, 31개 SDK 메서드, 9개 MCP Tools
- 보안 위협 모델링 — 10개 위협 식별, 4단계 대응 체계, Circuit Breaker 패턴

**Stats:**

- 78 files created
- 38,262 lines of Markdown
- 5 phases, 15 plans, 23 requirements
- 2 days from start to ship (2026-02-04 → 2026-02-05)

**Git range:** first commit → `fbceed0`

**What's next:** 구현 마일스톤 — 코어 지갑 서비스, 트랜잭션 서비스, 정책 엔진, API 서버 구현

---

## v1.1 코어 인프라 + 기본 전송 (Shipped: 2026-02-10)

**Delivered:** CLI로 init → start → SOL 전송 → 확인까지 동작하는 최소 데몬 구현 — 모노레포 스캐폴드, SQLite 7-table, AES-256-GCM 키스토어, 6단계 데몬 라이프사이클, Hono API 서버, SolanaAdapter, 6-stage 트랜잭션 파이프라인, CLI 4개 명령어, 281개 테스트 통과

**Phases completed:** 48-51 (12 plans total)

**Key accomplishments:**

- 모노레포 스캐폴드 — pnpm workspace + Turborepo 4-패키지 (core, daemon, adapter-solana, cli), ESLint flat config, Vitest workspace, ESM-only TypeScript
- @waiaas/core 패키지 완성 — 12 Enum SSoT (as const→Zod pipeline), 5 Zod 스키마, 66 에러 코드 통합 매트릭스, WAIaaSError, 4 인터페이스, i18n (en/ko), 65 단위 테스트
- 데몬 인프라 — SQLite 7-table Drizzle ORM + CHECK 제약, AES-256-GCM 키스토어 (Argon2id KDF, sodium guarded memory), config.toml 로더 (smol-toml + Zod), DaemonLifecycle (6-step 시작/10-step 종료/flock 잠금/BackgroundWorkers)
- API + SolanaAdapter — Hono 4.x 서버 (5 미들웨어 + errorHandler), SolanaAdapter 10개 IChainAdapter 메서드 (@solana/kit 6.x), 에이전트/지갑 라우트, 167 데몬 테스트
- 트랜잭션 파이프라인 — 6-stage (validate→auth→policy→wait→execute→confirm), DefaultPolicyEngine INSTANT 패스스루, async fire-and-forget (201 즉시 반환), guarded memory release
- CLI + E2E — commander 13.x CLI 4개 명령어 (init/start/stop/status), 12 E2E 통합 테스트 (MockChainAdapter), 전체 281 테스트 통과

**Stats:**

- 97 TypeScript files, 10,925 LOC
- 4 phases, 12 plans, 24 tasks, 46 requirements
- 281 tests (65 core + 17 adapter + 167 daemon + 32 CLI)
- 40 commits, 1 day (2026-02-10)

**Git range:** `fffcb2f` (Phase 48 start) → `3bf9d8d` (Phase 51 complete)

**What's next:** v1.2 인증 + 정책 엔진 — 3-tier 인증 (masterAuth/ownerAuth/sessionAuth), 4-tier 정책, Owner 상태 머신

---

## v1.0 구현 계획 수립 (Shipped: 2026-02-09)

**Delivered:** v0.1~v0.10 설계 완료 후 구현 착수를 위한 8개 마일스톤별 objective 문서(v1.1~v2.0) 생성, 설계 부채 추적 체계 초기화, 37개 설계 문서 전수 매핑 검증

**Phases completed:** 45-47 (5 plans total)

**Key accomplishments:**

- objective 문서 8개 (v1.1~v2.0) — 7-section 부록 구조로 목표/설계문서/산출물/기술결정/E2E/의존/리스크 통일
- 설계 부채 추적 — objectives/design-debt.md, Tier 1~3 분류, v2.0 전 0건 목표
- 설계 문서 매핑 검증 — 37개 설계 문서→구현 마일스톤 양방향 교차 검증 완료
- 구현 마일스톤 8개 순서 확정 — 의존 그래프: 코어→인증→SDK→토큰→DeFi→클라이언트→품질→릴리스

**Stats:**

- 3 phases, 5 plans, 10 requirements, 28 설계 결정
- 1 day (2026-02-09)

**What's next:** v1.1 코어 인프라 + 기본 전송 — 모노레포, SQLite, 키스토어, 데몬, CLI, 파이프라인 구현

---

## v1.2 인증 + 정책 엔진 (Shipped: 2026-02-10)

**Delivered:** v1.1 코어 인프라 위에 3-tier 인증 체계(sessionAuth JWT HS256 + masterAuth Argon2id + ownerAuth Ed25519)와 4-tier 정책 엔진(DatabasePolicyEngine)을 구현하여, 세션 기반 에이전트 접근 제어, 금액별 보안 분류, DELAY/APPROVAL 워크플로우, Owner 3-State 점진적 보안 해금이 동작하는 상태를 달성

**Phases completed:** 52-57 (13 plans total)

**Key accomplishments:**

- 3-Tier 인증 체계 구축 — sessionAuth(JWT HS256 dual-key rotation) + masterAuth(Argon2id) + ownerAuth(Ed25519 서명) 미들웨어, 전 엔드포인트 인증 적용 (37 tests)
- 세션 관리 API 완성 — CRUD(create/list/revoke) + 낙관적 갱신(5종 안전 장치: maxRenewals 30, absoluteExpiresAt 30일, 50% TTL, token_hash CAS, revocation check) (21 tests)
- DatabasePolicyEngine 4-tier 분류 — SPENDING_LIMIT BigInt + WHITELIST 대소문자 무관 평가, 정책 CRUD API, TOCTOU 방지(BEGIN IMMEDIATE + reserved_amount) (28 tests)
- DELAY/APPROVAL 워크플로우 — DelayQueue 쿨다운 자동 실행 + ApprovalWorkflow Owner 서명 승인/거절/3단계 타임아웃 만료, BackgroundWorkers 통합 (25 tests)
- Owner 3-State 상태 머신 — NONE/GRACE/LOCKED 점진적 보안 해금, resolveOwnerState 순수 함수, APPROVAL→DELAY 자동 다운그레이드, ownerAuth 성공 시 GRACE→LOCKED 자동 전이 (18 tests)
- 파이프라인 전 구간 통합 + 457 테스트 — Stage 2(Auth) sessionId + Stage 3(Policy) evaluateAndReserve + Stage 4(Wait) DELAY/APPROVAL 분기, E2E 통합 검증 29건, 전체 457 테스트 통과

**Stats:**

- 238 TypeScript files, 25,526 LOC (10,925 → 25,526, +14,601)
- 6 phases, 13 plans, 35 requirements
- 457 tests (281 → 457, +176 new tests)
- 50 commits, ~6 hours (14:29 → 20:37 KST, 2026-02-10)
- 99 files changed, +16,828 / -181 lines

**Git range:** `v1.1` → `gsd/phase-57-integration-tests`

**What's next:** v1.3 SDK + MCP + 알림 — TypeScript/Python SDK, MCP Server, SessionManager, 알림 3채널

---

## v1.3 SDK + MCP + 알림 (Shipped: 2026-02-11)

**Delivered:** v1.2 인증+정책 엔진 위에 OpenAPIHono 전면 전환(33 엔드포인트 + OpenAPI 3.0 자동 생성), REST API 15개 추가, 3채널 알림 시스템, TypeScript/Python SDK, MCP Server를 구현하여, AI 에이전트가 SDK 또는 MCP로 지갑을 프로그래밍 방식으로 사용하고 Owner가 실시간 알림을 받을 수 있는 상태를 달성

**Phases completed:** 58-63 (11 plans total)

**Key accomplishments:**

- OpenAPIHono 전면 전환 — 기존 18 라우트 createRoute() 리팩터링 + 신규 15 작성 = 33 엔드포인트, GET /doc OpenAPI 3.0 JSON 자동 생성, 68개 에러 코드 OpenAPI 매핑, IChainAdapter.getAssets() 선행 구현
- REST API 확장 — 15개 신규 엔드포인트(assets, transactions, pending, nonce, agents CRUD, admin 6종), error hint 32개(AI 에이전트 자율 복구용 resolveHint), 커서 페이지네이션(UUID v7)
- 3채널 알림 시스템 — TelegramChannel(Bot API MarkdownV2), DiscordChannel(Webhook Embed), NtfyChannel(plain text Priority), NotificationService 우선순위 폴백 + broadcast, 21개 이벤트 en/ko 템플릿, config.toml 8키 확장
- TypeScript SDK (@waiaas/sdk) — WAIaaSClient 9 메서드 + WAIaaSOwnerClient 4 메서드, 0 외부 의존성(Node.js 22 fetch), WAIaaSError 구조화 에러, 지수 백오프 재시도, 인라인 사전 검증
- Python SDK (waiaas) — async httpx WAIaaSClient, 10 Pydantic v2 모델, snake_case↔camelCase dual access, 지수 백오프 재시도, TS SDK 동일 인터페이스
- MCP Server (@waiaas/mcp) — 6 도구 + 3 리소스, SessionManager(토큰 로드 + 60% TTL 자동 갱신 + 지수 백오프 재시도 + 409 CONFLICT 처리 + 복구 루프), CLI `waiaas mcp setup` 원클릭 설정

**Stats:**

- 32,337 TypeScript LOC + 1,592 Python LOC = 33,929 총 LOC
- 6 phases, 11 plans, 49 requirements
- 784 tests (457 → 784, +327 new tests)
- 41 commits, 104 files changed, +13,392 / -171 lines
- 7 days (2026-02-04 → 2026-02-11)

**Git range:** `v1.2` → `gsd/phase-63-mcp-server`

**What's next:** v1.4 토큰 + 컨트랙트 확장 — SPL/ERC-20 토큰 전송, 컨트랙트 호출, Approve, Batch, EVM 어댑터

---

## v1.3.1 Admin Web UI 설계 (Shipped: 2026-02-11)

**Delivered:** 데몬 내장 경량 관리 웹 UI(5 페이지 SPA)의 전체 설계 문서(67-admin-web-ui-spec.md, 10개 섹션)를 작성하여 v1.3.2에서 즉시 구현 착수할 수 있는 상태를 확립

**Phases completed:** 64-65 (2 plans total)

**Key accomplishments:**

- Hono serveStatic SPA 서빙 + CSP 보안(default-src 'none') + 캐시 정책(해시 immutable + no-cache) + admin_ui 토글 설계
- masterAuth 로그인 흐름 + @preact/signals Auth Store + 15분 비활성 타임아웃 + 4종 로그아웃 트리거 설계
- 5개 페이지 화면 설계 (Dashboard/Agents/Sessions/Policies/Settings) — ASCII 와이어프레임, 컴포넌트 계층, API 매핑, 상호작용 흐름
- CSS Variables 디자인 토큰(색상/간격/타이포/티어) + 8개 공통 컴포넌트 인터페이스(Table/Form/Modal/Toast/Button/Badge/CopyButton/EmptyState)
- 68개 에러 코드 전체 매핑 + fetch 래퍼(X-Master-Password 자동 주입, 10초 타임아웃) + 로딩/빈/에러/셧다운 4종 UX 패턴

**Stats:**

- 1 file created (docs/67-admin-web-ui-spec.md, 10 sections)
- 2 phases, 2 plans, 4 tasks, 18 requirements, 13 설계 결정
- 1 day (2026-02-11)

**Git range:** `8f8bddc` (Phase 64 start) → `fb012b0` (Phase 65 complete)

**What's next:** v1.3.2 Admin Web UI 구현 — 설계 문서 67 기반 Preact SPA 구현

---

## v1.3.2 Admin Web UI 구현 (Shipped: 2026-02-11)

**Delivered:** v1.3.1 설계 문서 67(10섹션) 기반으로 Preact 10.x + Vite 6.x Admin Web UI SPA를 구현하여, 브라우저에서 `http://127.0.0.1:{port}/admin`으로 에이전트 등록, 세션 관리, 정책 설정 등 핵심 관리 기능을 수행할 수 있는 상태를 달성

**Phases completed:** 66-70 (10 plans total)

**Key accomplishments:**

- Preact + Vite 빌드 파이프라인 — @waiaas/admin 패키지 스캐폴드, postbuild daemon/public/admin/ 복사, CSP(default-src 'none') 미들웨어, Kill Switch bypass, admin_ui/admin_timeout config 확장
- masterAuth 로그인 + Auth Store — @preact/signals 기반 상태 관리, 비활성 타임아웃 자동 로그아웃, fetch 래퍼(X-Master-Password 자동 주입), 70 에러 코드 사용자 친화적 매핑
- Dashboard/Agents/Sessions 페이지 — 6-카드 데몬 상태 요약 + 30초 폴링, 에이전트 CRUD + Owner 상태 읽기 전용, 세션 생성/조회/폐기 + JWT 토큰 원타임 표시
- Policies/Settings 페이지 — 10 유형 정책 CRUD + 4-tier SPENDING_LIMIT 시각화(초록/파랑/노랑/빨강), Kill Switch 토글, JWT 회전, 데몬 종료(type-to-confirm)
- Vitest + Testing Library 27 테스트 — 인증 4건, 유틸 6건, 페이지 14건(Dashboard 3 + Agents 5 + Sessions 3 + Policies 3 + Settings 3), 보안/서빙 4건(CSP, admin_ui toggle, Kill Switch bypass)

**Stats:**

- 79 files changed, +13,046 / -47 lines
- @waiaas/admin: 4,440 LOC (TSX/TS/CSS)
- Total project: 45,332 LOC
- 5 phases, 10 plans, 22 requirements, 32 구현 결정
- 816 tests (784 → 816, +32 new admin tests)
- 37 commits, ~4 hours (15:34 → 19:39 KST, 2026-02-11)

**Git range:** `3f5b57f` (Phase 66 start) → `afd7ca8` (Phase 70 complete)

**What's next:** v1.4 토큰 + 컨트랙트 확장 — SPL/ERC-20 토큰 전송, 컨트랙트 호출, Approve, Batch, EVM 어댑터

---

## v1.3.4 알림 이벤트 트리거 연결 + 어드민 알림 패널 (Shipped: 2026-02-12)

**Delivered:** v1.3 알림 인프라(NotificationService, 3채널, 21 이벤트 템플릿)를 파이프라인/라우트에 실제 연결하고, notification_logs DB 테이블 + 어드민 UI 알림 패널을 추가하여, 데몬에서 발생하는 주요 이벤트가 실제로 사용자에게 알림으로 전달되고 어드민이 브라우저에서 상태를 확인/테스트/로그 조회할 수 있는 상태를 달성

**Phases completed:** 73-75 (5 plans total)

**Key accomplishments:**

- notification_logs DB 테이블 + 증분 마이그레이션 — schema_version 기반 MIG-01 준수, fire-and-forget logDelivery(), 채널별 sent/failed 개별 기록
- 파이프라인 5개 이벤트 트리거 — Stage 1 TX_REQUESTED, Stage 3 POLICY_VIOLATION, Stage 5 TX_SUBMITTED/TX_FAILED, Stage 6 TX_CONFIRMED, void notify() fire-and-forget 패턴
- 라우트/워커 3개 이벤트 트리거 — POST /sessions SESSION_CREATED, PUT /agents/:id/owner OWNER_SET, session-cleanup worker SESSION_EXPIRED
- 어드민 알림 API 3개 엔드포인트 — GET /admin/notifications/status (credential 마스킹), POST /admin/notifications/test, GET /admin/notifications/log (Drizzle 페이지네이션)
- 어드민 알림 패널 UI — 3-column 채널 상태 카드, 테스트 발송 버튼, 발송 로그 테이블(20건/페이지), config.toml 안내 info box

**Stats:**

- 42 files changed, +5,590 / -52 lines
- 3 phases, 5 plans, 10 tasks, 18 requirements, 13 설계 결정
- 895 tests (847 → 895, +48 new tests)
- 42,123 LOC total
- 2 hours (2026-02-11 22:39 → 2026-02-12 00:38)

**Git range:** `0fe6723` (Phase 73 start) → `2891558` (Phase 75 complete)

**What's next:** v1.4 토큰 + 컨트랙트 확장 — SPL/ERC-20 토큰 전송, 컨트랙트 호출, Approve, Batch, EVM 어댑터

---

## v1.4 토큰 + 컨트랙트 확장 (Shipped: 2026-02-12)

**Delivered:** v1.3.4 알림 인프라 위에 5가지 트랜잭션 타입(TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH)을 지원하는 완전한 블록체인 기능 확장을 구현하여, SPL/ERC-20 토큰 전송, 스마트 컨트랙트 호출, Approve 관리, Solana 원자적 배치가 기본 거부 정책으로 동작하고, @waiaas/adapter-evm 패키지가 viem 2.x 기반으로 IChainAdapter 20메서드를 구현하며, Stage 5가 ChainError 카테고리별 재시도를 수행하는 상태를 달성

**Phases completed:** 76-81 (12 plans total)

**Key accomplishments:**

- ChainError 3-카테고리 시스템 + DB 마이그레이션 러너 — 27개 에러 코드 PERMANENT/TRANSIENT/STALE 자동 분류, schema_version 기반 증분 마이그레이션, discriminatedUnion 5-type TransactionRequestSchema, IChainAdapter 11→20 메서드 확장, 6개 PolicyType superRefine 검증
- @waiaas/adapter-evm 패키지 — viem 2.x Client/Action 패턴으로 IChainAdapter 20메서드 구현(17 실제 + 3 스텁), EIP-1559 네이티브 전송, ERC-20 전송/approve, gas 추정 1.2x, nonce 관리, ChainError viem 에러 패턴 매칭
- SPL/ERC-20 토큰 전송 + ALLOWED_TOKENS 정책 — SolanaAdapter buildTokenTransfer(Token-2022 분기, ATA 자동 생성), EvmAdapter buildTokenTransfer(ERC-20 calldata), ALLOWED_TOKENS 기본 거부 정책, getAssets 토큰 잔액 포함(네이티브 첫 번째 + 잔액 내림차순), getTokenInfo/estimateFee 구현
- 컨트랙트 호출 + Approve 관리 — buildContractCall(EVM calldata/Solana programId+instructionData), CONTRACT_WHITELIST/METHOD_WHITELIST 기본 거부 정책, buildApprove(EVM ERC-20/Solana SPL ApproveChecked), APPROVED_SPENDERS/APPROVE_AMOUNT_LIMIT/APPROVE_TIER_OVERRIDE 정책, 무제한 approve 차단
- Solana 원자적 배치 + 2단계 합산 정책 — buildBatch(min 2/max 20 instructions), evaluateBatch(개별 평가 + 합산 SPENDING_LIMIT, All-or-Nothing), classifyInstruction 필드 기반 union 판별, EVM BATCH_NOT_SUPPORTED
- Stage 5 CONC-01 + discriminatedUnion 파이프라인 — Stage 1 type 필드 기반 5-type 파싱, Stage 3 type별 정책 필터링(10 PolicyType), Stage 5 build→simulate→sign→submit 재시도 루프(PERMANENT 즉시 실패/TRANSIENT 지수 백오프/STALE 재빌드), buildByType 5-type adapter 라우팅

**Stats:**

- 50 files changed, +9,814 / -187 lines
- @waiaas/adapter-evm: 신규 패키지 (9패키지 모노레포)
- Total project: 51,750 LOC (42,123 → 51,750, +9,627)
- 6 phases, 12 plans, 35 requirements, 50+ 설계 결정
- 1,126 tests (895 → 1,126, +231 new tests)
- 1 day (2026-02-12)

**Git range:** `a9ba1e1` (Phase 76 start) → `34c2aec` (Phase 81 complete)

**What's next:** v1.4.1 EVM 지갑 인프라 — secp256k1 키 생성, 어댑터 팩토리, Config EVM RPC

---

## v1.4.1 EVM 지갑 인프라 + REST API 5-type 통합 + Owner Auth SIWE (Shipped: 2026-02-12)

**Delivered:** v1.4 EVM 어댑터를 데몬에 연결하여 EVM 에이전트 생성(secp256k1)부터 트랜잭션 실행까지 풀 라이프사이클이 동작하고, REST API가 5가지 트랜잭션 타입을 수용하며, Owner Auth SIWE(EIP-4361)가 지원되는 상태를 달성

**Phases completed:** 82-88 (15 plans total)

**Key accomplishments:**

- EVM 네트워크 인프라 — NetworkType 13값 확장, EVM_CHAIN_MAP 10 네트워크→viem Chain 매핑, DaemonConfig EVM RPC 16키(drpc.org 기본값), evm_default_network, validateChainNetwork 교차 검증
- secp256k1 멀티커브 키스토어 — EVM 에이전트 생성 시 0x EIP-55 체크섬 주소 파생, AES-256-GCM 암호화 + sodium_memzero, curve 필드 하위 호환(missing=ed25519), network 파라미터 연결
- AdapterPool 어댑터 팩토리 — agent.chain/network 기반 SolanaAdapter/EvmAdapter 자동 선택, lazy init + 캐싱, disconnectAll Promise.all fail-soft, 데몬/서버/라우트 adapterPool 패턴 전환
- DB 마이그레이션 v2 — managesOwnTransaction 플래그(자체 PRAGMA/트랜잭션), agents CHECK 제약 EVM 네트워크 확장, 12-step 테이블 재생성, foreign_key_check 검증
- REST API 5-type 통합 — route schema separation 방안 C(OpenAPI oneOf 6-variant + stage1Validate Zod SSoT), 레거시 하위호환(type 미지정→TRANSFER), MCP send_token type/token + TS/Python SDK 5-type 확장
- Owner Auth SIWE — verifySIWE(viem/siwe EIP-4361+EIP-191), owner-auth 미들웨어 chain 분기(ethereum=SIWE/solana=Ed25519), setOwner chain별 주소 형식 검증(EIP-55/base58)
- E2E 통합 검증 — EVM 풀 라이프사이클(생성→잔액→전송→CONFIRMED), 듀얼 체인 동시 운용, 5-type 파이프라인 E2E, MCP/SDK 통합, 전체 회귀 1,310 pass / 0 new failures

**Stats:**

- 94 files changed, +11,604 / -389 lines
- Total project: 65,074 LOC (63,174 TS/TSX + 950 Python + 950 CSS)
- 7 phases, 15 plans, 29 requirements, 50+ 설계 결정
- 1,313 tests (1,126 → 1,313, +187 new tests)
- 53 commits, 1 day (2026-02-12)

**Git range:** `d966065` (Phase 82 start) → `343d90f` (Phase 88 complete)

**What's next:** v1.5 DeFi + 가격 오라클 또는 v1.5.1 x402 클라이언트 지원

---

## v1.4.2 용어 변경 (agent -> wallet) (Shipped: 2026-02-13)

**Delivered:** 코드베이스 전체에서 "agent"를 "wallet"으로 일괄 변경하여 WAIaaS가 관리하는 엔티티의 실체(AI 에이전트가 사용하는 지갑)를 정확히 반영 — DB schema_version 3 마이그레이션, REST API /v1/wallets, JWT wlt claim, Zod/Enum/에러코드/i18n rename, MCP/CLI/SDK/Admin UI 전체 용어 통일, 설계 문서 15개 갱신, grep 전수 검사 0건 확인

**Phases completed:** 89-94 (11 plans total)

**Key accomplishments:**

- DB schema_version 3 마이그레이션 — agents → wallets 테이블 + FK 5개 + 인덱스 10개 + enum 데이터 5건, Drizzle 스키마 갱신
- @waiaas/core 전체 rename — Zod 스키마(WalletSchema, CreateWalletRequestSchema), Enum(WALLET_STATUSES), 에러 코드(WALLET_NOT_FOUND/SUSPENDED/TERMINATED), i18n en/ko 템플릿 {walletId}/{walletCount}, 19파일 137 테스트
- REST API + JWT + Config — /v1/wallets 6개 CRUD 엔드포인트, JWT wlt claim, PipelineContext.walletId, OpenAPI Wallet 스키마, max_sessions_per_wallet config, 65파일 681 테스트
- MCP + CLI + SDK — WalletContext + withWalletPrefix, CLI --wallet, WAIAAS_WALLET_ID/WAIAAS_WALLET_NAME 환경변수, TS/Python SDK walletId/wallet_id 필드, 30파일 159 테스트
- Admin Web UI — Wallets 페이지 + Dashboard walletCount + Sessions/Policies/Notifications walletId, 15파일 40 테스트
- 설계 문서 15개 + README 갱신 + grep 전수 검사 의도적 잔존 외 0건 + 1,326 테스트 통과 + OpenAPI agentId 0건

**Stats:**

- 194 files changed, +10,015 / -2,892 lines
- 6 phases, 11 plans, 22 tasks, 38 requirements, 30+ 설계 결정
- 1,326 tests (1,313 → 1,326, +13 tests, 3 pre-existing CLI E2E excluded)
- 56,808 LOC total
- 1 day (2026-02-13)

**Git range:** `bc17415` (Phase 89 start) → `45f8607` (Phase 94 complete)

**What's next:** v1.5 DeFi + 가격 오라클 또는 EVM 토큰 레지스트리 + MCP DX 개선

---

## v1.4.3 EVM 토큰 레지스트리 + MCP/Admin DX 개선 + 버그 수정 (Shipped: 2026-02-13)

**Delivered:** EVM 지갑의 토큰 자산 조회 한계를 해소하고, Admin UI에서 MCP 토큰 발급까지 원스톱 처리 가능한 상태를 달성 — 체인별 내장 토큰 레지스트리(5 네트워크 24 토큰), getAssets() ERC-20 연동, POST /v1/mcp/tokens API + Admin UI MCP 섹션, EVM/Solana 확인 타임아웃 fallback, 패키지 버전 관리 스크립트, BUG-013~016 전수 해소

**Phases completed:** 95-99 (8 plans total)

**Key accomplishments:**

- 패키지 버전 관리 — tag-release.sh 모노레포 일괄 버전 갱신, 9 패키지 1.4.3 적용 (BUG-016)
- 파이프라인 확인 fallback — EVM waitForConfirmation fallback receipt 조회 + stage6Confirm 3-way 분기, Solana 동일 패턴 적용, SUBMITTED→FAILED 오판 방지 (BUG-015)
- EVM 토큰 레지스트리 — 5개 EVM 메인넷 24개 내장 ERC-20 토큰, tokenRegistry DB 테이블 + migration v4, TokenRegistryService merge layer, GET/POST/DELETE /v1/tokens REST API
- getAssets ERC-20 연동 — 토큰 레지스트리 ∪ ALLOWED_TOKENS 합집합 ERC-20 잔액 자동 조회, case-insensitive 주소 dedup (BUG-014)
- MCP 토큰 관리 API + Admin UI — POST /v1/mcp/tokens 원스톱 프로비저닝 (세션 생성 + 토큰 파일 + Claude Desktop 설정), Admin UI MCP Setup 섹션 (BUG-013)

**Stats:**

- 64 files changed, +5,691 / -104 lines
- 5 phases, 8 plans, 13 requirements, 9 설계 결정
- 1,357 tests (1,326 → 1,357, +31 new tests)
- 59,993 LOC total
- 1 day (2026-02-13)

**Git range:** `345acf1` (Phase 95 start) → `fb27115` (Phase 99 complete)

**What's next:** v1.5 DeFi + 가격 오라클 — IPriceOracle, Action Provider, Jupiter Swap, USD 정책

---

## v1.4.4 Admin Settings + MCP 5-type + Skill Files (Shipped: 2026-02-14)

**Delivered:** Admin UI에서 운영 설정을 DB 기반으로 관리하고(hot-reload), MCP가 REST API/SDK와 동등하게 5가지 트랜잭션 타입을 지원하며, AI 에이전트가 5개 스킬 파일을 로드하여 즉시 API를 사용할 수 있는 상태를 달성

**Phases completed:** 100-104 (10 plans total)

**Key accomplishments:**

- Settings DB 인프라 — settings key-value 테이블 + AES-GCM 암호화(HKDF SHA-256) + DB>config.toml>env>default fallback 체인 + 최초 기동 시 자동 import
- Settings REST API + Hot-Reload — GET/PUT /v1/admin/settings + POST test-rpc 3개 엔드포인트, HotReloadOrchestrator(알림 채널 재생성/RPC 어댑터 evict/보안 즉시 반영)
- Admin UI Settings 페이지 — 알림/RPC/보안/WalletConnect/log_level 5개 카테고리 섹션, credential 마스킹, RPC 테스트 버튼, 알림 테스트 발송, dirty tracking + save/discard bar
- MCP 5-type Feature Parity — call_contract/approve_token/send_batch 3개 MCP 도구 추가, MCPSDK-04 설계 결정 철회, Feature Parity 원칙 확립, BUG-017 해소
- API 스킬 파일 5개 — quickstart(7-step 온보딩), wallet(17+ 엔드포인트), transactions(5-type), policies(10 PolicyType), admin(12 엔드포인트) + 기존 파일 deprecation

**Stats:**

- 5 phases, 10 plans, 20 tasks, 24 requirements, 20 설계 결정
- 1,467 tests (1,357 → 1,467, +110 new tests)
- 62,296 LOC total
- 2 days (2026-02-13 → 2026-02-14)

**Git range:** `6b4e3b3` (Phase 100 start) → `177f78a` (Phase 104 complete)

**What's next:** v1.5 DeFi + 가격 오라클 — IPriceOracle, Action Provider, Jupiter Swap, USD 정책

---

## v1.4.5 멀티체인 월렛 모델 설계 (Shipped: 2026-02-14)

**Delivered:** "1 월렛 = 1 체인 + 1 네트워크" 모델을 "1 월렛 = 1 체인 + 1 환경(testnet/mainnet)" 모델로 전환하는 아키텍처를 4개 설계 문서(docs/68-72)로 완전히 정의 — 데이터 모델, DB 마이그레이션, 파이프라인, 정책 엔진, REST API, MCP, SDK, Quickstart 인터페이스까지 포괄

**Phases completed:** 105-108 (6 plans total)

**Key accomplishments:**

- EnvironmentType Zod SSoT 파생 체인 + 환경-네트워크 매핑 테이블 설계 (13 NETWORK_TYPES 전수, 매핑 함수 4개, 설계 결정 8개)
- DB 마이그레이션 v6a/v6b(12-step 재생성) 전략 설계 — wallets.network → environment 전환, transactions.network 추가, FK dependent 4개 테이블 함께 재생성
- NetworkResolver 순수 함수 + PipelineContext 확장 + ENVIRONMENT_NETWORK_MISMATCH 에러 코드 + Stage 1~6 데이터 흐름도 설계
- ALLOWED_NETWORKS 11번째 PolicyType + 네트워크 스코프 정책 4단계 override 우선순위 + policies 테이블 v8 마이그레이션 설계
- REST API 7개 엔드포인트 network/environment 파라미터 + 3-Layer 하위호환 전략 + 멀티네트워크 잔액 집계 설계
- MCP 6개 도구 + TS/Python SDK network 파라미터 확장 + Quickstart --mode testnet/mainnet 워크플로우 설계

**Stats:**

- 24 files changed, +10,642 / -30 lines (설계 문서)
- 4 phases, 6 plans, 11 tasks, 19 requirements, 31 설계 결정
- 설계 문서: docs/68 (EnvironmentType), docs/69 (DB 마이그레이션), docs/70 (파이프라인), docs/71 (정책 엔진), docs/72 (API/인터페이스)
- 26 commits, 1 day (2026-02-14)

**Git range:** `0eef0e1` (Phase 105 start) → `29439d3` (Phase 108 complete)

**What's next:** v1.4.6 멀티체인 월렛 모델 구현 — 설계 문서 68-72 기반 코드 구현

---

## v1.4.6 멀티체인 월렛 구현 (Shipped: 2026-02-14)

**Delivered:** v1.4.5에서 설계한 멀티체인 월렛 모델(1 월렛 = 1 체인 + 1 환경)을 전 레이어에 구현하여, 하나의 EVM 월렛이 testnet/mainnet 5개 네트워크에서 트랜잭션을 실행하고, ALLOWED_NETWORKS 정책으로 네트워크를 제한하며, REST API/MCP/SDK/Admin UI/CLI 모든 인터페이스에서 네트워크를 선택할 수 있는 상태를 달성

**Phases completed:** 109-114 (13 plans total)

**Key accomplishments:**

- EnvironmentType Zod SSoT + DB 마이그레이션 3건 — v6a/v6b/v8로 wallets.network→environment 전환, transactions.network/policies.network 추가, 환경-네트워크 매핑 함수 4개
- ALLOWED_NETWORKS 11번째 PolicyType — permissive default + 4단계 override 우선순위 (wallet+network > wallet+null > global+network > global+null)
- resolveNetwork() 파이프라인 네트워크 해결 — 3단계 우선순위 순수 함수 + ENVIRONMENT_NETWORK_MISMATCH 에러 코드 + Stage 1~5 전 구간 통합
- REST API 네트워크 확장 — 7개 엔드포인트 network/environment 파라미터 + PUT /default-network + GET /networks 신규 2개 (44 엔드포인트)
- MCP + SDK + Admin UI 멀티체인 — MCP 6개 도구 network 파라미터 + get_wallet_info 신규(11 도구) + TS/Python SDK network 확장 + Admin UI 환경 모델 전환
- CLI quickstart --mode + 스킬 파일 동기화 — testnet/mainnet 원스톱 Solana+EVM 2월렛 생성 + 4개 스킬 파일 환경 모델 반영

**Stats:**

- 122 files changed, +10,922 / -370 lines
- 6 phases, 13 plans, 26 tasks, 35 requirements, 38 설계 결정
- 1,580 tests (1,467 → 1,580, +113 new tests)
- ~73,000 LOC total
- ~6 hours (17:08 → 22:58 KST, 2026-02-14)

**Git range:** `8429893` (Phase 109 start) → `506cf80` (Phase 114 complete)

**What's next:** v1.5 DeFi + 가격 오라클 — IPriceOracle, Action Provider, Jupiter Swap, USD 정책

---

## v1.4.7 임의 트랜잭션 서명 API (Shipped: 2026-02-15)

**Delivered:** 외부 dApp/프로토콜이 빌드한 unsigned 트랜잭션을 WAIaaS가 정책 평가 후 서명하여 반환하는 sign-only API를 구현 — Solana/EVM unsigned tx 파서, 기본 거부 정책 3개 토글, EVM calldata 인코딩 유틸리티, MCP 스킬 리소스 노출, 정책 거부 알림 보강까지 REST API + TS/Python SDK + MCP 전체 인터페이스 완성

**Phases completed:** 115-119 (12 plans total)

**Key accomplishments:**

- Solana/EVM unsigned tx 파서 — IChainAdapter parseTransaction/signExternalTransaction 22메서드, ParsedOperationType 5종(NATIVE_TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/UNKNOWN), DB 마이그레이션 v9 (SIGNED/SIGN SSoT)
- 기본 거부 정책 3개 토글 — default_deny_tokens/contracts/spenders ON/OFF, SettingsService DI, 화이트리스트 정책 공존 시 토글 무시, hot-reload 즉시 반영
- Sign-only 파이프라인 + REST API — POST /v1/transactions/sign (접수→파싱→정책→서명→반환), DELAY/APPROVAL 즉시 거부, reserved_amount SIGNED 누적 이중 지출 방지
- EVM calldata 인코딩 유틸리티 — POST /v1/utils/encode-calldata (viem encodeFunctionData), ABI_ENCODING_FAILED 에러 코드
- TS/Python SDK + MCP 13개 도구 — signTransaction/encodeCalldata SDK 메서드, MCP sign_transaction(13번째)/encode_calldata(12번째) 도구
- MCP 스킬 리소스 + 알림 보강 — waiaas://skills/{name} ResourceTemplate 5개, POLICY_VIOLATION 알림 enrichment (policyType/contractAddress/tokenAddress/adminLink)

**Stats:**

- 54 files changed, +4,356 / -73 lines
- 5 phases, 12 plans, 30 requirements, 33 설계 결정
- 1,636 tests (1,580 → 1,636, +56 new tests)
- ~175,480 LOC total
- 1 day (2026-02-14 → 2026-02-15)

**Git range:** `9acdc6e` (Phase 115 start) → `3641cc3` (Phase 119 complete)

**What's next:** v1.4.8 Admin DX + 알림 개선 또는 v1.5 DeFi + 가격 오라클

---

## v1.4.8 Admin DX + 알림 개선 (Shipped: 2026-02-15)

**Delivered:** OPEN 이슈 12건(020~031) 일괄 해소 — DB 마이그레이션 순서 버그 수정, MCP 고아 프로세스 방지, MCP/CLI/SDK 멀티체인 DX 도구 확장, Admin 대시보드/월렛 상세/세션 개선, 알림 테스트 버그 수정 + Slack 채널 + 메시지 저장

**Phases completed:** 120-124 (8 plans total)

**Key accomplishments:**

- pushSchema 3-step 순서 수정 — 테이블 → 마이그레이션 → 인덱스 분리로 기존 DB 시작 차단 버그 해결, v1/v5 스냅샷 기반 23개 마이그레이션 체인 테스트 추가
- MCP graceful shutdown — stdin end/close 감지 + 3초 force-exit 타임아웃으로 Claude Desktop 종료 시 고아 프로세스 방지, createShutdownHandler 팩토리 패턴
- MCP/CLI/SDK 멀티체인 DX — set_default_network 14번째 MCP 도구 + CLI wallet 서브커맨드 + TS/Python SDK, network=all 잔액/자산 집계 + Promise.allSettled 부분 실패 처리
- Admin 대시보드 확장 — StatCard 클릭 링크, Policies/Recent Txns/Failed Txns 카드, 최근 활동 5건 테이블, 월렛 상세 잔액/트랜잭션, 세션 전체 조회 + walletName JOIN
- 알림 시스템 개선 — apiPost 빈 body SYSTEM_LOCKED 버그 수정, 채널별 개별 Test 버튼, Delivery Log 메시지 확장 패널, Slack Incoming Webhook 채널 구현, DB v10 message 컬럼
- wallet.skill.md + admin.skill.md 동기화 — network=all, set_default_network, wallet info, Slack 채널 반영

**Stats:**

- 83 files changed, +9,312 / -468 lines
- 5 phases, 8 plans, 14 tasks, 28 requirements, 18 설계 결정
- ~1,618 tests (cumulative), ~178,176 LOC total
- 42 commits, 1 day (2026-02-15)

**Git range:** `0509c60` (milestone start) → `ec4aa93` (Phase 124 complete)

**What's next:** v1.5 DeFi + 가격 오라클 또는 v1.4.8 후속 이슈 대응

---

## v1.5 DeFi Price Oracle + Action Provider Framework (Shipped: 2026-02-15)

**Delivered:** USD 기준 정책 평가가 동작하고, Action Provider 프레임워크가 구축되어 DeFi 프로토콜 플러그인을 추가할 수 있는 상태를 달성 — Pyth Hermes + CoinGecko OracleChain fallback, resolveEffectiveAmountUsd 5-type USD 환산, 가격 불명 토큰 NOTIFY 격상, IActionProvider ESM 플러그인 프레임워크, API 키 DB 암호화 저장, MCP Tool 자동 변환, 신규 외부 npm 의존성 0개

**Phases completed:** 125-129 (14 plans total)

**Key accomplishments:**

- IPriceOracle 가격 오라클 — Pyth Hermes Zero-config Primary + CoinGecko Opt-in Fallback, OracleChain 2단계 fallback + 교차 검증(5% 편차 STALE 격하), InMemoryPriceCache LRU 128항목 + 5분 TTL + stampede prevention, classifyPriceAge 3단계(FRESH/AGING/STALE)
- USD 정책 평가 통합 — resolveEffectiveAmountUsd() 5-type 트랜잭션 USD 환산, SpendingLimitRuleSchema instant_max_usd/notify_max_usd/delay_max_usd Zod SSoT, PriceResult 3-state discriminated union(success/oracleDown/notListed), 가격 불명 토큰 NOTIFY 격상 + UNLISTED_TOKEN_TRANSFER 감사 로그, 오라클 장애 시 graceful fallback
- IActionProvider ESM 플러그인 프레임워크 — metadata/actions/resolve 3메서드 인터페이스, ActionProviderRegistry ~/.waiaas/actions/ ESM 플러그인 발견/로드/검증, resolve() → ContractCallRequestSchema Zod 재검증 → 기존 파이프라인 Stage 1~6 실행
- API 키 관리 + Admin UI — api_keys 테이블 DB v11 암호화 저장(HKDF+AES-256-GCM), GET/PUT/DELETE /v1/admin/api-keys CRUD, requiresApiKey=true 비활성화, Admin UI API Keys 섹션 입력/수정/삭제 + 경고 배지
- MCP Tool 자동 변환 + Skill 파일 — registerActionProviderTools action_{provider}_{action} MCP 도구 자동 생성(mcpExpose=true), fire-and-forget 패턴(14개 내장 도구 유지), admin.skill.md v1.5.0(oracle-status + api-keys 4개 엔드포인트), actions.skill.md 신규 생성

**Stats:**

- 68 commits, 149 files changed, +25,633 / -1,933 lines (+7,701 / -131 code)
- 5 phases, 14 plans, 29 requirements, 84 설계 결정
- 1,848 tests (~1,618 → 1,848, +230 new tests)
- ~185,000 LOC total
- 1 day (2026-02-15)

**Git range:** `v1.4.8` → `bbc62c7` (Phase 129 complete)

**What's next:** v1.5.1 x402 클라이언트 지원 또는 v1.6 Desktop + Telegram + Docker

---

## v1.5.2 Admin UI 정책 폼 UX 개선 (Shipped: 2026-02-16)

**Delivered:** Admin UI에서 12개 정책 타입별 구조화된 전용 폼으로 정책을 생성/수정할 수 있고, 목록에서 타입별 의미 있는 시각화를 확인할 수 있으며, 기존 정책 수정 시 현재값이 프리필되어 수정/저장이 가능한 상태 달성

**Phases completed:** 134-135 (4 plans total)

**Key accomplishments:**

- 12개 PolicyType Zod rules 스키마 전체 등록 + DynamicRowList + PolicyFormRouter 폼 인프라
- 12개 PolicyType 전용 폼 컴포넌트 (SpendingLimitForm~X402AllowedDomainsForm)
- PolicyRulesSummary 12-type 목록 시각화 (심볼 배지, req/time, tier bars)
- 수정 모달 전용 폼 프리필/저장 통합

**Stats:**

- 2 phases, 4 plans, 24 requirements, 7 설계 결정
- 2,111 tests, ~188,000 LOC total

**Git range:** `v1.5.1` → `7d19887` (Phase 135 complete)

---

## v1.6 운영 인프라 + 잔액 모니터링 (Shipped: 2026-02-16)

**Delivered:** Kill Switch 3-state 상태 머신(CAS ACID + 6-step cascade + dual-auth 복구), AutoStop 4-규칙 자동 정지 엔진, BalanceMonitorService 잔액 체크 + LOW_BALANCE 알림, Telegram Bot Long Polling(10개 명령어 + 2-Tier 인증 + i18n), Admin UI 통합(Kill Switch 3-state + Telegram Users + AutoStop/Monitoring Settings), Docker 원클릭 배포(Multi-stage + Secrets + non-root)가 동작하는 상태 달성

**Phases completed:** 140-145 (14 plans total)

**Key accomplishments:**

- EventBus 인프라 + Kill Switch 3-state 상태 머신 — EventEmitter 이벤트 버스, CAS ACID 패턴(BEGIN IMMEDIATE + UPDATE WHERE), 6-step cascade(세션 무효화→거래 중단→월렛 정지→API 503→알림→감사 로그), dual-auth 복구(Owner+Master), DB v14 마이그레이션(NORMAL→ACTIVE, ACTIVATED→SUSPENDED, LOCKED 신규)
- AutoStop 4-규칙 자동 정지 엔진 — CONSECUTIVE_FAILURES(5회)/UNUSUAL_ACTIVITY/IDLE_TIMEOUT/MANUAL_TRIGGER, EventBus 구독, config.toml + Admin Settings hot-reload, AUTOSTOP_TRIGGERED i18n 알림
- BalanceMonitorService 잔액 체크 + LOW_BALANCE 알림 — 5분 주기 폴링, SOL 0.01/ETH 0.005 임계값, 24시간 중복 방지 + 회복 감지, monitoring Admin Settings 카테고리
- Telegram Bot Long Polling + 10개 명령어 + 2-Tier 인증 + i18n — /start, /help, /status, /wallets, /pending, /approve, /reject, /killswitch, /newsession, 인라인 키보드, ADMIN/READONLY/PENDING 권한, en/ko, DB v15 마이그레이션
- Admin UI Kill Switch 3-state 관리 + Telegram Users 관리 + AutoStop/Monitoring Settings — 3-state UI 리팩토링, Approve/Delete 액션, fields map 배열 패턴
- Docker 원클릭 배포 — Multi-stage Dockerfile(node:22-slim, non-root UID 1001), docker-compose.yml(named volume, HEALTHCHECK, 127.0.0.1:3100), Docker Secrets _FILE 패턴

**Stats:**

- 6 phases, 14 plans, 49 requirements, 45 설계 결정
- 115 files changed, +16,313 / -260 lines
- ~2,294 tests, ~207,902 LOC total
- 23 commits, 1 day (2026-02-16)

**Git range:** `d666c46` (feat(140-01)) → `23b2b31` (feat(145-02))

**What's next:** 다음 마일스톤 계획 (/gsd:new-milestone)

---

## v1.6.1 WalletConnect Owner 승인 (Shipped: 2026-02-16)

**Delivered:** WalletConnect v2 경유 Owner 승인 워크플로우가 동작하는 상태 달성 — QR 페어링으로 외부 지갑(MetaMask/Phantom) 연결, APPROVAL 거래 시 WC 서명 요청 자동 전송, WC 실패 시 Telegram Bot 자동 전환, Admin UI/MCP/SDK/CLI 전체 인터페이스 통합

**Phases completed:** 146-150 (10 plans total)

**Key accomplishments:**

- WalletConnect SignClient 인프라 — DB v16 마이그레이션(wc_sessions/wc_store/approval_channel), SqliteKeyValueStorage IKeyValueStorage 영속 세션, DaemonLifecycle Step 4c-6 fail-soft 초기화, Admin Settings hot-reload
- QR 페어링 + REST API 4개 엔드포인트 — createPairing URI→QR base64 dataURL, CAIP-2 13개 네트워크 매핑, Admin UI QR 모달 3초 폴링, CLI owner connect/disconnect/status 명령
- WcSigningBridge 서명 요청 통합 — stage4Wait fire-and-forget WC 연동, EVM personal_sign + Solana solana_signMessage 서명 검증, approve/reject 자동 반영, WC expiry 동기화
- Telegram Fallback 자동 전환 — WC 세션 없음/타임아웃/에러 시 Telegram Bot 자동 전환, 단일 승인 소스 원칙(isApprovalStillPending), APPROVAL_CHANNEL_SWITCHED 알림 이벤트
- DX 전체 인터페이스 통합 — Admin WC 전용 관리 페이지, MCP 3개 도구(wc_connect/wc_status/wc_disconnect), TS/Python SDK WC 메서드, wallet.skill.md WalletConnect 섹션

**Stats:**

- 5 phases, 10 plans, 24 requirements, 105 files changed, +12,099 LOC (net)
- ~2,510 tests (~2,294 → ~2,510, +87 WC tests)
- Git range: feat(146-01) → 623d9dc
- Timeline: 2026-02-16 (~3 hours)

---

## v1.7 품질 강화 + CI/CD (Shipped: 2026-02-17)

**Delivered:** 설계 문서(46-51, 64) 기반 ~999건 신규 테스트와 GitHub Actions 4-stage CI/CD 파이프라인으로 보안 ~249건 시나리오, 확장 기능 154건, 플랫폼 84건, Contract Test 7개 인터페이스, 블록체인 3단계, Enum SSoT 빌드타임 검증을 달성하고 push→PR→nightly→release 지속적 품질 게이트를 확보한 상태

**Phases completed:** 151-159 (19 plans total)

**Key accomplishments:**

- 테스트 인프라 구축 — Vitest v8 커버리지(패키지별 Hard 임계값) + Turborepo 5개 태스크 분리(unit/integration/security/chain/platform) + Mock 10개 경계(M1-M10, msw 2.x/MockPriceOracle/MockActionProvider)
- Enum SSoT 빌드타임 검증 — 16개 Enum 4단계 방어(as const→TS→Zod→Drizzle→DB CHECK) + config.toml 12건 + NOTE 매핑 22건
- Contract Test 7개 인터페이스 — IChainAdapter(Mock vs Solana vs EVM 22 메서드)/IPolicyEngine/INotificationChannel/IClock/IPriceOracle/IActionProvider Mock-실제 동일성 검증
- 보안 테스트 ~460+ it-blocks — 3계층 보안 71건(세션20/정책9/Kill Switch8/키스토어10/경계값24) + 확장 보안 ~178건(토큰32/컨트랙트28/Approve24/배치22/Oracle20/Action16/Swap12/ChainError12/x402 12)
- 확장 기능 154건 + 플랫폼 84건 — 토큰32/컨트랙트28/Approve24/배치22/Oracle20/Action16/ChainError12 기능 검증 + CLI Daemon32/Docker18/Telegram34 배포 품질 검증
- 4-stage CI/CD 파이프라인 — Composite Action(Node.js 22+pnpm+Turborepo cache) + ci.yml(Stage1 --affected/Stage2 full suite+coverage) + nightly.yml(local-validator+devnet) + release.yml(4-job 품질 게이트+Docker+npm dry-run) + coverage-gate.sh(Soft/Hard)

**Stats:**

- 9 phases, 19 plans, 48 requirements, 66 설계 결정
- 92 files changed, +24,004 LOC
- 3,509 tests (~2,510 → 3,509, +~999 new tests)
- ~237,013 LOC total
- 49 commits, 1 day (2026-02-16 → 2026-02-17)

**Git range:** `46a01da` (Phase 151 start) → `5b7cf57` (Phase 159 complete)

**What's next:** v1.8 업그레이드 + 배포 (/gsd:new-milestone)

---

## v1.8 업그레이드 + 배포 인프라 (Shipped: 2026-02-17)

**Delivered:** 설치된 WAIaaS가 새 버전 출시를 자동 감지하여 사용자에게 알리고, `waiaas upgrade`로 7단계 시퀀스(확인-중지-백업-업데이트-마이그레이션-검증-재시작)로 안전하게 업그레이드할 수 있는 상태 달성. npm/Docker 2개 채널 업그레이드 경로 동작, DB 호환성 매트릭스가 자동 마이그레이션/시작 거부를 판별. release-please 기반 2-게이트 릴리스 모델 구축 완료.

**Phases completed:** 160-164 (12 plans total)

**Key accomplishments:**

- VersionCheckService + Health API 확장 — npm registry 최신 버전 자동 조회(24h 주기, fail-soft), GET /health에 latestVersion/updateAvailable/schemaVersion 필드 추가
- CLI 업그레이드 알림 + upgrade 명령 — stderr 알림 박스(24h dedup, --quiet 억제), waiaas upgrade 7단계 시퀀스(--check/--to/--rollback/--no-start)
- BackupService — DB+WAL/SHM+config.toml 자동 백업/복원, 5개 보존 정책, --rollback으로 직전 백업 복원
- 호환성 매트릭스 + Docker — checkSchemaCompatibility 3-시나리오(migrate/reject-code_too_old/reject-schema_too_old), Dockerfile OCI+Watchtower 라벨, GHCR 3-tier 태깅(latest/semver/major)
- release-please 2-게이트 릴리스 모델 — Conventional Commits → Release PR 자동 생성(게이트 1) → 품질 게이트 → deploy environment: production 수동 승인(게이트 2), CHANGELOG 자동 생성
- SDK/MCP/스킬 파일 동기화 + 19건 E2E 통합 테스트 — HealthResponse 타입 export, 4개 영역 업그레이드 파이프라인 검증

**Stats:**

- 5 phases, 12 plans, 30 requirements, ~87 신규 테스트
- 3,599 tests total, ~124,712 LOC TypeScript
- Git range: feat(160-01) → fix(#053-#057)
- Timeline: 2026-02-17 (1일)

**What's next:** 다음 마일스톤 계획 (/gsd:new-milestone)

---

## v2.2 테스트 커버리지 강화 (Shipped: 2026-02-18)

**Delivered:** v1.7에서 설정한 커버리지 Hard 게이트 중 임시 하향된 3개 패키지(adapter-solana branches, admin functions, cli lines/statements)의 임계값을 원래 수준으로 복원하여 전체 패키지의 커버리지 품질을 균일하게 유지하는 상태 달성.

**Phases completed:** 178-181 (4 phases, 6 plans, 12 tasks, 11 requirements)

**Key accomplishments:**

- adapter-solana 브랜치 커버리지 65% → 84.87% 향상 — convertBatchInstruction 4-type dispatch, signExternalTransaction edge case, tx-parser 엣지 케이스, Error instanceof 분기 등 49 신규 테스트
- admin 함수 커버리지 57.95% → 77.87% 향상 — settings/wallets/dashboard/policies/notifications + 0% 그룹(client.ts, toast.tsx, copy-button.tsx, layout.tsx, display-currency.ts, 5 정책 폼) 195 신규 테스트
- CLI 라인/구문 커버리지 68.09% → 91.88% 향상 — owner.ts/wallet.ts/password.ts 37 신규 테스트
- 3개 패키지 vitest 커버리지 임계값 원래 수준 복원 (branches 65→75, functions 55→70, lines/statements 65→70)
- 전체 모노레포 테스트 스위트 ~2,490 테스트 0건 실패 검증 + 이슈 #060~#062 해소

**Stats:**

- 4 phases, 6 plans, 12 tasks, 11 requirements
- 53 files changed, +10,714 lines
- 281 신규 테스트 (49 + 195 + 37), ~142,639 LOC TypeScript
- 30 commits, 1 day (2026-02-18)
- Git range: 330dc92..a8374e9

**What's next:** 다음 마일스톤 계획 (/gsd:new-milestone)

---

## v2.3 Admin UI 기능별 메뉴 재구성 (Shipped: 2026-02-18)

**Delivered:** 모놀리식 Settings 페이지를 해체하여 7개 기능별 메뉴(Dashboard/Wallets/Sessions/Policies/Notifications/Security/System)로 재배치하고, Ctrl+K 설정 검색 + 미저장 경고 다이얼로그 + 전 필드 description help text로 Admin UI DX를 개선한 상태 달성.

**Phases completed:** 182-187 (6 phases, 11 plans, 39 requirements)

**Key accomplishments:**

- TabNav/FieldGroup/Breadcrumb/FormField description 공용 UI 컴포넌트 구축 (5개 페이지에서 재사용)
- 사이드바 7-메뉴 재구성 — Settings/WalletConnect 제거, Security(3탭)/System 신규 페이지 생성, 기존 4개 페이지 탭 구조 적용
- 기존 Settings 항목을 Wallets(3탭)/Sessions(1탭)/Policies(1탭)/Notifications(1탭) Settings 탭으로 분산 배치 + 독립적 dirty/save 상태
- Ctrl+K 설정 검색 — 54개 필드 정적 인덱스, 클릭 시 페이지+탭 네비게이션 + 2s 필드 하이라이트 애니메이션
- 미저장 경고 다이얼로그 — 글로벌 dirty guard 레지스트리, 3버튼(저장 후 이동/저장 없이 이동/취소) 탭+사이드바 인터셉트
- 전 필드 description help text 47개 + README 7-메뉴 구조 갱신

**Stats:**

- 6 phases, 11 plans, 39 requirements, 64 files changed, +9,339 LOC (net)
- ~145,784 LOC TypeScript (Admin UI: 19,152 LOC)
- 50 commits, 1 day (2026-02-18)
- Git range: feat(182-01) → docs(187-01)

---

## v2.4 npm Trusted Publishing 전환 (Shipped: 2026-02-19)

**Delivered:** npm 패키지 발행을 Classic Automation Token(NPM_TOKEN)에서 OIDC Trusted Publishing으로 전환하여, 장기 시크릿 없이 GitHub Actions OIDC 인증 + Sigstore provenance 배지를 확보한 supply chain 보안 강화 상태 달성. 병행하여 8건 품질/DX 이슈 수정 완료.

**Phases completed:** 188-190 (3 phases, 4 plans, 12 requirements)

**Key accomplishments:**

- npm Trusted Publishing (OIDC) 전환 — 8개 패키지 장기 시크릿(NPM_TOKEN) 제거, GitHub Actions OIDC 인증으로 전환
- Sigstore provenance 배지 확보 — 8개 패키지 모두 "Built and signed on GitHub Actions" 표시
- v2.3.0-rc E2E 검증 완료 — release-please prerelease versioning으로 RC 릴리스 OIDC 발행 검증
- Deploy summary provenance 메타데이터 추가 — Source/Commit/Workflow/Sigstore 링크 자동 생성
- 8건 이슈 수정 — 마스터 패스워드 검증(#090), NotificationService always-init(#088), npm README 복사(#093), homepage/bugs URL(#092), 스킬 버전 동기화(#085), AI 연결 프롬프트(#087), JWT UI 텍스트(#089), quickset 별칭(#091)
- 이슈 #094-095 등록 — Admin UI 개선 항목 다음 마일스톤으로 이관

**Stats:**

- 3 phases, 4 plans, 7 tasks + 8 quick tasks, 12 requirements
- 66 files changed, +3,740 / -180 lines
- ~146,464 LOC TypeScript
- 40 commits, 1 day (2026-02-19)
- Git range: ee51276..5d80fb6

**What's next:** 다음 마일스톤 계획 (/gsd:new-milestone)

---

## v2.4.1 Admin UI 테스트 커버리지 복원 (Shipped: 2026-02-19)

**Delivered:** Admin UI v2.3 메뉴 재구성 후 신규/이동 페이지의 테스트 커버리지를 70% 임계값 이상으로 복원. Security/WalletConnect/System 페이지 + 공용 컴포넌트 5개에 대해 186건의 신규 테스트 추가. vitest 커버리지: 92% lines, 84% branches, 77% functions.

**Phases completed:** 191-193 (3 phases, 5 plans, 22 requirements)

**Key accomplishments:**

- Security 페이지 3-tab (Kill Switch/AutoStop/JWT Rotation) 27 테스트 + WalletConnect 페이지 16 테스트
- System 페이지 6-섹션 34 테스트 (API Keys CRUD/Daemon 설정/Danger Zone)
- 공용 컴포넌트 5개 65 테스트 (EmptyState/dirty-guard/UnsavedDialog/SettingsSearch/PolicyRulesSummary)
- 기존 페이지(sessions/notifications/wallets) 44 추가 테스트 커버리지 개선
- vitest 커버리지 임계값 70% 복원 (실제: 92% lines, 84% branches, 77% functions)

**Stats:**

- 3 phases, 5 plans, 22 requirements, ~186 신규 테스트
- ~151,015 LOC TypeScript

**What's next:** v2.5 DX 품질 개선

---

## v2.5 DX 품질 개선 (Shipped: 2026-02-19)

**Delivered:** README/예시 코드를 복붙하면 바로 동작하는 상태 달성. CLI 첫 실행(버전/엔진/init), 데몬 시작(포트 충돌/로그/URL), quickstart(영문/멱등성/필드), Docker(GHCR 이미지/환경변수), Python SDK(버전/포트), npm 패키지 README 등 첫 5분 경험에서 발견된 28건의 마찰 제거.

**Phases completed:** 194-197 (4 phases, 8 plans, 23 requirements)

**Key accomplishments:**

- CLI --version 동적 버전 (createRequire ESM 패턴) + engines.node >= 22 + init 패스워드 안내/config 템플릿/권한 에러
- 데몬 시작 EADDRINUSE 포트 충돌 감지 + Step 로그 console.debug 하향 + Admin UI URL 한 줄 요약
- quickstart 영문 전환 + 409 멱등성 (기존 지갑 재사용 + 세션 재발급) + 만료 시점 표시 + availableNetworks 필드 수정
- MCP setup 에러 시 "Run waiaas quickstart first" 안내 + 기본 만료(24h) 경고 + --expires-in 옵션 가이드
- README SDK 코드 예시 필드 수정 (balance.balance, tx.id) + skill 파일 14개 버전 자동 치환
- CLI/SDK npm 패키지 README 작성 + docker-compose GHCR 이미지 기본값 + .env.example
- Python SDK 버전 pyproject.toml 동기화 + README/client 포트 3100 수정 + .venv gitignore
- 179건 CLI 테스트 통과 (13건 신규)

**Stats:**

- 4 phases, 8 plans, 23 requirements
- 58 files changed, +3,333 / -192 lines
- 34 commits, 1 day (2026-02-19)
- Git range: 839b22a..c2da7a2

**What's next:** 다음 마일스톤 계획 (/gsd:new-milestone)

---

## v2.6 Wallet SDK 설계 (Shipped: 2026-02-20)

**Delivered:** 지갑 개발사(D'CENT 등)가 WAIaaS와 통합하기 위한 Wallet Signing SDK, 개방형 서명 프로토콜, 지갑 앱 알림 채널, Push Relay Server의 공통 설계를 확정. 설계 문서 3개 신규(73/74/75) + 기존 4개(35/37/25/67) 갱신, 교차 검증 5항목 PASS, 설계 부채 0건 유지.

**Phases completed:** 198-201 (4 phases, 7 plans, 15 tasks, 23 requirements)

**Key accomplishments:**

- WAIaaS Signing Protocol v1 설계서 완성 (doc 73, 12개 섹션 1,465줄 — SignRequest/SignResponse Zod 스키마, EIP-191/Ed25519 서명 포맷, 유니버셜 링크, ntfy/Telegram 채널 프로토콜, 5가지 위협 분석 보안 모델, 8개 에러 코드)
- @waiaas/wallet-sdk + 데몬 컴포넌트 설계서 완성 (doc 74, 11개 섹션 ~2,450줄 — SDK 8개 공개 API 시그니처, WalletLinkConfig Zod 스키마, ISigningChannel 공통 인터페이스, ApprovalChannelRouter 5단계 fallback)
- 알림 채널 + Push Relay Server 설계서 완성 (doc 75, 13개 섹션 ~2,500줄 — 서명/알림 토픽 분리, NotificationMessage 6카테고리, IPushProvider 인터페이스, Pushwoosh/FCM, ntfy SSE, Docker 멀티스테이지)
- 기존 설계 문서 4개(35/37/25/67) v2.6 통합 + 교차 검증 5항목 PASS, 설계 부채 0건 유지
- 34개 설계 결정 확정 (프로토콜 11 + SDK 4 + 데몬 7 + 알림 7 + Push Relay 5)

**Stats:**

- 4 phases, 7 plans, 15 tasks, 23 requirements
- 33 commits, 55 files changed, +10,435 / -324 lines
- Timeline: 1 day (2026-02-19 → 2026-02-20)
- Git range: d91a92f → af0999d

**What's next:** 후속 구현 마일스톤 (m26-01 Wallet Signing SDK 구현, m26-02 알림 채널 구현, m26-03 Push Relay Server 구현)

---

## v2.6.1 WAIaaS Wallet Signing SDK (Shipped: 2026-02-20)

**Delivered:** v2.6 설계(docs 73-75)를 코드로 실현하여, @waiaas/wallet-sdk 패키지를 통해 지갑 개발사가 서명 프로토콜을 통합하고, Owner가 ntfy/Telegram 채널을 통해 트랜잭션을 승인/거부할 수 있는 상태 달성. 5단계 우선순위 채널 라우팅 + 데몬 라이프사이클 완전 연결 + Admin Settings 런타임 관리.

**Phases completed:** 202-205 (4 phases, 13 plans, 27 requirements)

**Key accomplishments:**

- Signing Protocol v1 구현 — SignRequest/SignResponse Zod 스키마, base64url 인코딩, DB migration v18 (owner_approval_method), 7개 도메인 에러 코드
- @waiaas/wallet-sdk 신규 npm 패키지 — 6개 공개 함수 (parseSignRequest, buildSignResponse, formatDisplayMessage, sendViaNtfy, sendViaTelegram, subscribeToRequests) + SSE 자동 재연결
- 다중 서명 채널 — NtfySigningChannel (양방향 SSE) + TelegramSigningChannel (인라인 버튼 + /sign_response) + ApprovalChannelRouter 5단계 우선순위 fallback
- 데몬 라이프사이클 연결 — 6개 signing SDK 클래스 daemon.ts 인스턴스화, pipeline PENDING_APPROVAL → 채널 라우팅 fire-and-forget 통합
- Admin Settings + Skills 동기화 — GET/PUT /admin/settings 11개 카테고리 노출, signing_sdk UI 섹션, skill files v2.6.1 버전 동기화

**Stats:**

- 4 phases, 13 plans, 27 requirements, 206 files changed, +16,137/-332 lines
- ~138,051 LOC TypeScript, 4,323 tests (29 new in @waiaas/wallet-sdk)
- 67 commits, 2 days (2026-02-19 → 2026-02-20)
- Git range: milestone/v2.6..milestone/v2.6.1

### Known Gaps

- Phase 202/203 VERIFICATION.md 누락 (절차적 갭, 코드 갭 아님 — 27/27 reqs 구현 완료 + integration 27/27 wired)
- 2 E2E flows need human testing with live infra (ntfy/Telegram SDK signing)

**What's next:** Wallet SDK 설계 고도화 or 추가 서명 채널 (Slack/Discord)

---

## v2.7 지갑 앱 알림 채널 (Shipped: 2026-02-20)

**Delivered:** 지갑 앱(D'CENT 등)이 Telegram 없이 모든 알림 이벤트(26개)를 ntfy 사이드 채널로 수신하고, 카테고리별 필터링과 우선순위 기반 전송으로 긴급도를 구분하는 상태 달성

**Phases completed:** 206 (1 phase, 4 plans, 7 tasks)

**Key accomplishments:**

- NotificationMessageSchema Zod SSoT + EVENT_CATEGORY_MAP (26 events → 6 categories) 정의
- WalletNotificationChannel 사이드 채널 구현 (기존 알림 시스템과 독립 병행, security_alert priority 5)
- subscribeToNotifications/parseNotification SDK 함수 추가 (ntfy SSE + base64url Zod 검증)
- Admin Settings 알림 카테고리 멀티셀렉트 체크박스 UI + wallet.skill.md Section 13 동기화

**Stats:**

- 1 phase, 4 plans, 16 requirements, 34 files changed, +3,722/-91 lines
- ~161,634 LOC TypeScript, 2,637+ tests
- Git range: feat(206-01) → feat(206-04)

---

## v26.3 Push Relay Server (Shipped: 2026-02-20)

**Delivered:** ntfy 토픽을 구독하여 Pushwoosh/FCM으로 변환/전달하는 경량 중계 서버(@waiaas/push-relay)를 구현하고, 데몬의 SignRequest 인코딩을 base64url로 통일하여, 기존 푸시 인프라만으로 서명 요청과 알림을 수신 가능한 상태 달성.

**Phases completed:** 207-209 (3 phases, 8 plans, 25 requirements)

**Key accomplishments:**

- NtfySigningChannel base64url 인코딩 통일 — 서명 요청과 알림이 동일한 인코딩 패턴 사용
- @waiaas/push-relay 신규 패키지 (12 소스 파일, 1,782 LOC) — ntfy SSE 구독 + Pushwoosh/FCM 푸시 변환 + SQLite Device Registry + REST API
- 배포 인프라 통합 — Dockerfile, release-please, CI/CD 파이프라인 (10 npm 패키지, 2 Docker 이미지)
- 51개 테스트 (8 테스트 파일) — config, message-parser, device-registry, device-routes, api-key-auth, push-provider, pushwoosh-provider, ntfy-subscriber
- 이슈 2건 해소 — #117 정책 체크박스 버그 수정, #118 가이드 파일 재구성

**Stats:**

- 3 phases, 8 plans, 25 requirements, 45 files changed, +2,589/-26 lines
- ~163,416 LOC TypeScript (push-relay 1,782 LOC), 51 신규 tests
- 10 commits, 1 day (2026-02-20)
- Git range: feat(207-01) → docs(#118)

---

## v26.4 멀티 지갑 세션 + 에이전트 자기 발견 (Shipped: 2026-02-21)

**Delivered:** 하나의 세션 토큰으로 여러 지갑에 접근할 수 있는 1:N 세션 모델을 구축하고, 에이전트가 마스터 패스워드 없이 자기 상황을 파악할 수 있는 GET /v1/connect-info 자기 발견 엔드포인트를 제공. SDK/MCP/Admin UI/CLI 전면 통합 완료. 병행하여 이슈 #119-#120 해소 및 릴리스 자동화 워크플로우 구축.

**Phases completed:** 210-214 (5 phases, 15 plans, 30 requirements)

**Key accomplishments:**

- DB v19 마이그레이션 — session_wallets junction 테이블로 세션-지갑 1:N 관계 구현, 기존 데이터 무손실 이관, 에러 코드 4개 신규 (WALLET_ACCESS_DENIED, WALLET_ALREADY_LINKED, CANNOT_REMOVE_DEFAULT_WALLET, SESSION_REQUIRES_WALLET)
- resolveWalletId 헬퍼 — body > query > defaultWalletId 3단계 우선순위로 모든 API 엔드포인트에 선택적 walletId 지원 (하위 호환 100%)
- GET /v1/connect-info 자기 발견 엔드포인트 — 세션 토큰만으로 접근 가능 지갑/정책/capabilities/자연어 프롬프트 자동 파악, agent-prompt 통합
- SDK/MCP/Admin UI/CLI 전면 통합 — createSession({ walletIds }) + getConnectInfo(), MCP connect_info 도구, Admin UI 멀티 지갑 세션 생성 모달, CLI quickset 단일 세션
- 릴리스 자동화 — promote-release.yml/restore-prerelease.yml workflow_dispatch 워크플로우, 모노레포 대응 promote-release.js 스크립트

**Stats:**

- 5 phases, 15 plans, 30 requirements, 80 설계 결정
- 78 code files changed, +5,381 / -547 lines
- ~145,704 LOC TypeScript
- 62 commits, 1 day (2026-02-21)
- Git range: feat(210-01) → feat(#120)

**What's next:** 다음 마일스톤 계획 (/gsd:new-milestone)

---

---

## v27.2 CAIP-19 자산 식별 표준 (Shipped: 2026-02-22)

**Delivered:** WAIaaS 전체 코드베이스의 토큰/자산 식별 체계를 CAIP-19 표준으로 통일. Custom CAIP-2/19 파서 모듈(~240 LOC, 외부 의존성 0), 13-네트워크 양방향 맵, 가격 오라클 L2 지원(Polygon/Arbitrum/Optimism/Base), DB v22 마이그레이션(asset_id 컬럼 + 자동 backfill), 4-시나리오 정책 매칭 매트릭스, MCP/SDK/Skills CAIP-19 확장. 모든 변경 additive(하위 호환).

**Phases completed:** 231-234 (4 phases, 9 plans, 31 requirements)

**Key accomplishments:**

- CAIP-2/19 파서/포매터 + Zod 스키마 + 13-네트워크 양방향 맵(NETWORK_TO_CAIP2/CAIP2_TO_NETWORK) + slip44 native asset helpers
- 가격 오라클 CAIP-19 캐시 키 전환 + CoinGecko L2 플랫폼 매핑(polygon-pos, arbitrum-one, optimistic-ethereum, base) + Pyth 피드 ID 원자적 전환
- DB v22 마이그레이션: token_registry.asset_id 컬럼 + CAIP-19 자동 backfill + Token API assetId 응답
- TokenInfoSchema assetId cross-validation + TransactionParam assetId 전파 + 4-시나리오 ALLOWED_TOKENS 정책 매칭
- MCP 토큰 도구 assetId 파라미터 + TS/Python SDK 타입 확장 + 3개 스킬 파일 CAIP-19 문서화

**Stats:**

- 4 phases, 9 plans, 31 requirements, 62 commits
- 135 files changed, +12,997 / -2,406 lines
- ~157,584 LOC TypeScript
- Timeline: 1 day (2026-02-22)
- Git range: v27.1..HEAD

**What's next:** 다음 마일스톤 계획 (/gsd:new-milestone)

---

## v27.3 토큰별 지출 한도 정책 (Shipped: 2026-02-22)

**Phases completed:** 153 phases, 323 plans, 50 tasks

**Key accomplishments:**

- (none recorded)

---

## v27.4 Admin UI UX 개선 (Shipped: 2026-02-23)

**Delivered:** Admin UI에 부재한 핵심 기능(트랜잭션 페이지, 토큰 레지스트리, 수신 TX 모니터링)을 추가하고 기존 페이지 UX를 전반 개선. 운영자가 단일 UI에서 모든 지갑 운영 상태를 파악·관리 가능한 상태 달성.

**Phases completed:** 239-243 (5 phases, 9 plans, 32 requirements)

**Key accomplishments:**

- ExplorerLink(13 networks)/FilterBar(URL sync)/SearchInput(debounce) 공용 컴포넌트 + 크로스 지갑 Admin API 2개 (GET /admin/transactions, GET /admin/incoming)
- /transactions 페이지: 8-column 테이블, 서버사이드 페이지네이션, 행 확장, 5개 필터 + txHash/수신자 검색
- Dashboard: Approval Pending 카드, 클릭 가능 StatCards, Recent Activity 네트워크/txHash 익스플로러 링크
- /tokens 페이지: 네트워크별 토큰 CRUD, 온체인 메타데이터 자동 조회(GET /tokens/resolve), 빌트인/커스텀 배지
- /incoming 페이지: 설정 패널 추출, 크로스 지갑 수신 TX 뷰어, 필터, 지갑별 모니터링 토글
- 지갑 목록 검색/필터/잔액+USD + 지갑 상세 4탭(Overview/Transactions/Owner/MCP) 페이지네이션/USD/새로고침

**Stats:**

- 5 phases, 9 plans, 32 requirements
- 51 files changed, +6,177 / -577 lines
- ~186,724 LOC TypeScript
- Timeline: 1 day (2026-02-22 → 2026-02-23)

### Tech Debt

- tokens.tsx uses raw HTML filter instead of shared FilterBar component (functional but inconsistent)
- Wallet detail Transactions tab filter is client-side only on 20-item page (design limitation)
- WDET-02 partial: status/type filters don't trigger server re-fetch across all pages

---

## v28.0 기본 DeFi 프로토콜 설계 (Shipped: 2026-02-23)

**Delivered:** 5개 DeFi 프로토콜(Jupiter Swap, 0x EVM Swap, LI.FI Bridge, Lido/Jito Staking, Gas Conditional Execution) 구현을 위한 공통 설계 산출물을 완성. 코드 구현 없이 설계 문서만 산출하며, m28-01~m28-05 구현 마일스톤의 입력으로 소비된다. 25개 설계 요구사항 전량 충족, 59개 설계 결정 확정.

**Phases completed:** 244-245 (2 phases, 5 plans, 25 requirements)

**Key accomplishments:**

- DEFI-01: packages/actions/ 패키지 구조 + registerBuiltInProviders() 6-step 라이프사이클 + config.toml [actions.*] 공통 스키마 + Admin Settings 경계 확정
- DEFI-02: ActionApiClient(fetch+AbortController+Zod) 베이스 패턴 + Solana/EVM ContractCallRequest 변환 매핑 + 8개 DeFi 에러코드 + SlippageBps/SlippagePct branded types 확정
- DEFI-03: ActionProvider→Stage 3 정책 연동 플로우 다이어그램 + 4개 프로토콜 CONTRACT_WHITELIST(8 주소) + 크로스체인 출발 체인 정책 + 도착 주소 3단계 검증 확정
- DEFI-04: IAsyncStatusTracker 인터페이스 + AsyncPollingService + 10→11-state 상태 머신(GAS_WAITING) + DB migration v23 + 3단계 브릿지 타임아웃(2h→22h→TIMEOUT) 확정
- Safety: Jito MEV fail-closed(공개 멤풀 폴백 금지) + wstETH 채택(리베이스 근본 해결) + stale calldata re-resolve 패턴 + API drift 3중 방어(Zod+버전고정+실패로깅) 확정
- DEFI-05: JSON mock fixture 구조 + 3개 테스트 헬퍼(createMockApiResponse/assertContractCallRequest/createMockActionContext) + 33-scenario 매트릭스(C1-C10+J/Z/L/S+G1-G7) 확정

**Stats:**

- 2 phases, 5 plans, 25 requirements, 24 commits
- 60 files changed, +6,451 / -530 lines
- ~186,724 LOC TypeScript (unchanged — design only)
- Timeline: 1 day (2026-02-23)

### Tech Debt

- m28-05 objective GAS_WAITING 상태 위치/진입/탈출이 확정 설계와 불일치 (구현 마일스톤 시작 시 업데이트 필요)
- m28-04 objective 결정 #7 stETH→wstETH 미반영 (구현 마일스톤 시작 시 업데이트 필요)
- m28-03 objective 폴링 설정 30분→2시간+BRIDGE_MONITORING 미반영 (구현 마일스톤 시작 시 업데이트 필요)

---

## v28.1 Jupiter Swap (Shipped: 2026-02-23)

**Phases completed:** 153 phases, 323 plans, 50 tasks

**Key accomplishments:**

- (none recorded)

---

## v28.2 0x EVM DEX Swap (Shipped: 2026-02-23)

**Phases completed:** 154 phases, 328 plans, 50 tasks

**Key accomplishments:**

- (none recorded)

---

## v28.3 LI.FI 크로스체인 브릿지 (Shipped: 2026-02-23)

**Phases completed:** 157 phases, 334 plans, 50 tasks

**Key accomplishments:**

- (none recorded)

---

## v28.4 Liquid Staking (Lido + Jito) (Shipped: 2026-02-24)

**Phases:** 254-257 (4 phases, 7 plans + 1 quick task)
**Requirements:** 25/25 satisfied
**Files:** 80 changed, +9,351 / -124 lines
**Timeline:** 2026-02-24 (1 day, 47 commits)

**Key accomplishments:**

- LidoStakingActionProvider — Lido 컨트랙트 직접 ABI 인코딩, ETH→stETH 스테이킹 + Withdrawal Queue unstake
- JitoStakingActionProvider — SPL Stake Pool 프로그램으로 SOL→JitoSOL 스테이킹/unstake, 순수 TS PDA 유틸
- IAsyncStatusTracker — LidoWithdrawalTracker + JitoEpochTracker + STAKING_UNSTAKE_COMPLETED/TIMEOUT 알림
- Staking API — GET /v1/wallet/staking 포지션 조회 (APY + USD 환산 + pending unstake)
- MCP 4 도구 자동 노출 + Admin UI 스테이킹 섹션 + actions.skill.md Lido/Jito 문서화
- Pipeline gap closure — bridge_status 기록 + actionProvider metadata 영속화

---

## v28.5 가스비 조건부 실행 (Shipped: 2026-02-25)

**Phases:** 258-259 (2 phases, 4 plans, 18 tasks)
**Requirements:** 25/25 satisfied
**Files:** 84 changed, +5,646 / -110 lines
**Timeline:** 2026-02-25 (1 day, 38 commits)

**Key accomplishments:**

- GasCondition Zod schema — maxGasPrice/maxPriorityFee/timeout on all 7 discriminatedUnion request types
- Pipeline Stage 3.5 — gas condition check between policy evaluation and wait branching (GAS_WAITING state)
- GasConditionTracker (IAsyncStatusTracker) — EVM eth_gasPrice/Solana getRecentPrioritizationFees RPC queries, 10s cache, daemon executeFromStage4 re-entry
- 5 runtime-adjustable gas_condition Admin Settings + Admin UI Gas Condition 설정 섹션
- Full interface integration — REST API + MCP 5 tools + TS/Python SDK + ActionProvider gasCondition injection + skill docs
- 85 new tests across schema, pipeline, tracker, REST API, Admin UI, MCP, SDK layers

---

## v28.6 RPC Pool -- 멀티 엔드포인트 로테이션 (Shipped: 2026-02-25)

**Phases completed:** 163 phases, 344 plans, 50 tasks

**Key accomplishments:**

- (none recorded)

---

## v28.8 빌트인 지갑 프리셋 자동 설정 (Shipped: 2026-02-26)

**Delivered:** Owner 등록 시 wallet_type 지정으로 signing SDK/approval_method/preferred_wallet 4단계 자동 설정이 원클릭으로 완료되고, Push Relay가 config.toml 선언적 설정으로 카테고리별 페이로드 변환을 처리하며 미설정 시 기존 동작을 유지하는 상태 달성.

**Phases completed:** 265-267 (3 phases, 6 plans, 14 requirements)

**Key accomplishments:**

- WalletPreset 타입 시스템 + BUILTIN_PRESETS 레지스트리(D'CENT 1종) + DB v24 마이그레이션(wallet_type 컬럼)
- Owner API wallet_type 필드 확장 — Zod 검증, 프리셋 우선 적용, 충돌 시 warning 응답
- PresetAutoSetupService 4단계 파이프라인 — signing SDK enable → WalletLinkRegistry → approval_method → preferred_channel + Settings 스냅샷 롤백
- Admin UI Owner 등록 폼 지갑 종류 드롭다운 (빌트인 프리셋 + Custom 옵션)
- ConfigurablePayloadTransformer — static_fields 주입 + category_map 카테고리별 매핑, 선언적 config 기반
- NtfySubscriber 파이프라인 통합 + bypass 패턴 (미설정 시 zero-overhead)

**Stats:**

- 3 phases, 6 plans, 14 requirements, 29 commits
- 56 files changed, +4,952 / -262 lines
- ~180,194 LOC TypeScript, 42 new tests
- Timeline: 1 day (2026-02-25 → 2026-02-26)

---

## v29.0 고급 DeFi 프로토콜 설계 (Shipped: 2026-02-26)

**Delivered:** 상태를 가진 DeFi 포지션(담보/차입, 수익률 거래, 레버리지 트레이딩)을 관리하기 위한 3개 프레임워크(ILendingProvider, IYieldProvider, IPerpProvider)와 공통 인프라(PositionTracker, DeFiMonitorService), Intent 서명 패턴(EIP-712)을 설계 수준에서 정의. m29-00 설계 문서에 26개 섹션(5-26) 추가, 총 59 설계 결정. m29-02~m29-14 구현 마일스톤의 입력 산출물 완성.

**Phases completed:** 268-273 (6 phases, 12 plans, 38 requirements)

**Key accomplishments:**

- defi_positions 통합 테이블 스키마(DDL + Drizzle + DB v25) + PositionTracker 카테고리별 차등 폴링 + 배치 쓰기 전략 + GET /positions API + Admin 포트폴리오 와이어프레임
- IDeFiMonitor 공통 인터페이스 + 3개 모니터(HealthFactor 적응형 폴링, Maturity 1일 1회, Margin 1분) + 4 알림 이벤트 SSoT + config.toml [monitoring] 17키 + 데몬 라이프사이클 통합
- ILendingProvider(supply/borrow/repay/withdraw + 3 queries) + LendingPolicyEvaluator(LTV 제한 + 자산 화이트리스트) + Aave V3/Kamino/Morpho 프로토콜 매핑
- IYieldProvider(buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity + 3 queries) + MaturityMonitor 만기 관리 + Pendle V2 프로토콜 매핑
- IPerpProvider(5 actions + 3 queries) + PerpPolicyEvaluator(최대 레버리지/포지션 크기/시장 화이트리스트) + MarginMonitor 5-stage 데이터 플로우 + Drift V2 매핑
- SignableOrder EIP-712 Zod 타입 + ActionProviderRegistry intent 확장 + 10-step 파이프라인 + IntentOrderTracker + 4-layer 보안 모델(21 설계 결정)

**Stats:**

- 6 phases, 12 plans, 38 requirements, 30 commits
- 38 files changed, +11,805 / -27 lines
- Output: m29-00 설계 문서 26개 섹션, 59 설계 결정
- Timeline: 1 day (2026-02-26)
- Git range: 588346e → 341d796

### Known Gaps

- INT-01 (low): 273-01-SUMMARY.md slug 오타 ('272-perp-framework-design' → '272-perp-framework')
- INT-02 (low): INTENT_ORDER_FILLED 알림 SSoT 체인 미연결 (m29-14에서 처리)
- FLOW-01 (low): SolanaAdapter.signTypedData() 미명세 (EVM-only 스코프, 구현 시 NOT_SUPPORTED stub)
- FLOW-02 (low): STAKING 카테고리 기존 Lido/Jito 미연결 (staking 마이그레이션 마일스톤에서 처리)
- Tech debt: Yield 자산 화이트리스트 정책 미정의, Solana intent 서명 경로 미명세

---

## v29.2 EVM Lending -- Aave V3 (Shipped: 2026-02-27)

**Phases completed:** 174 phases, 371 plans, 50 tasks

**Key accomplishments:**

- (none recorded)

---

## v29.3 기본 지갑/기본 네트워크 개념 제거 (Shipped: 2026-02-27)

**Phases completed:** 178 phases, 381 plans, 50 tasks

**Key accomplishments:**

- (none recorded)

---

## v29.5 내부 일관성 정리 (Shipped: 2026-02-28)

**Phases completed:** 180 phases, 387 plans, 52 tasks

**Key accomplishments:**

- (none recorded)

---

## v29.9 세션 점진적 보안 모델 (Shipped: 2026-03-02)

**Delivered:** 세션 수명 모델을 글로벌 설정 기반에서 per-session 선택적 지정으로 전환하여, 기본 무제한 세션과 선택적 유한 세션이 공존하는 점진적 보안 구조를 완성한 마일스톤. 무제한 세션은 exp 클레임 없는 JWT를 발급하여 jose 검증 자동 통과, 갱신 시 RENEWAL_NOT_REQUIRED로 거부. Admin Settings 전역 세션 키 3개를 삭제하고 per-session TTL/maxRenewals/absoluteLifetime 파라미터로 전환. MCP SessionManager, CLI, SDK, Admin UI, Skill 파일 전 계층 동기화 완료.

**Phases completed:** 300-301 (2 phases, 14 plans, 25 requirements)

**Key accomplishments:**

- 무제한 세션 기본값 전환 — per-session TTL/maxRenewals/absoluteLifetime 파라미터, 기본값 무제한(0)
- JWT exp 조건부 생략 — 무제한 세션은 exp 클레임 없는 JWT 발급, jose 검증 자동 통과
- 갱신 로직 점진적 보안 — 무제한 세션 RENEWAL_NOT_REQUIRED 거부, maxRenewals=0/absoluteLifetime=0 무제한 처리
- Admin Settings 전역 세션 키 3개 삭제 — session_ttl/session_absolute_lifetime/session_max_renewals per-session으로 완전 이동
- 전 계층 동기화 — MCP SessionManager 무제한 토큰 처리 + CLI --ttl 리네임 + SDK expiresIn→ttl + Admin UI Advanced 섹션 + Skill 파일 4개

**Stats:**

- 2 phases, 14 plans, 25 requirements, 15 commits
- 93 files changed, +1,088 / -407 lines
- ~233,440 LOC TypeScript total
- Timeline: 1 day (2026-03-02)

---

## v29.10 ntfy 토픽 지갑별 설정 전환 (Shipped: 2026-03-02)

**Phases completed:** 183 phases, 392 plans, 50 tasks

**Key accomplishments:**

- (none recorded)

---
