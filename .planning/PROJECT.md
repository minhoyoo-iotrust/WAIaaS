# WAIaaS: AI 에이전트를 위한 Wallet-as-a-Service

## 이것이 무엇인가

중앙 서버 없이 사용자가 직접 설치하여 운영하는 오픈소스(MIT) AI 에이전트 지갑 시스템. 체인 무관(Chain-Agnostic) 3계층 보안 모델(세션 인증 → 시간 지연+AutoStop → 모니터링+Kill Switch)로 에이전트 해킹이나 키 유출 시에도 피해를 최소화한다. npm(`@waiaas/*` 10개 패키지) / Docker(`waiaas/daemon`, `waiaas/push-relay`) / CLI로 배포하며, REST API(60+ 엔드포인트), TypeScript/Python SDK, MCP 통합(18+ 도구), Telegram Bot 원격 관리를 통해 모든 에이전트 프레임워크에서 사용 가능하다. 멀티체인 환경 모델(1 월렛 = 1 체인 + 1 환경)로 하나의 EVM 월렛이 5개 네트워크에서 동작하며, ALLOWED_NETWORKS 정책으로 네트워크를 제한할 수 있다. **1:N 멀티 지갑 세션 모델**로 하나의 세션 토큰이 여러 지갑에 접근하고, GET /v1/connect-info 자기 발견 엔드포인트로 에이전트가 마스터 패스워드 없이 접근 가능 지갑/정책/capabilities를 파악한다. WalletConnect v2로 외부 지갑(MetaMask/Phantom) 연결하여 QR 스캔 기반 Owner 승인이 가능하며, WC 실패 시 Telegram Bot으로 자동 전환된다. Admin Web UI(`/admin`)는 5개 섹션(Wallets/Trading/Security/Channels/System)으로 그룹화된 사이드바와 Dashboard 최상단 배치로 구성되며, 크로스 지갑 트랜잭션 조회(필터+검색+페이지네이션+행 확장), 토큰 레지스트리 CRUD(온체인 메타데이터 자동 조회), 수신 TX 모니터링 설정+뷰어, 지갑 4탭 상세(Overview/Activity/Assets/Setup, Owner Protection 카드 인라인), 잔액+USD 표시, Ctrl+K 설정 검색/미저장 경고/필드 description help text 등 DX를 제공한다. @waiaas/push-relay로 ntfy 토픽을 기존 푸시 인프라(Pushwoosh/FCM)로 변환·전달하여, 지갑 앱이 기존 푸시 파이프라인만으로 서명 요청과 알림을 수신할 수 있다. CAIP-2/CAIP-19 표준 식별자를 전 인터페이스에서 지원하며, 네트워크 입력에 CAIP-2 문자열(`eip155:1`)을 plain string과 동일하게 수용하고, 토큰은 assetId(`eip155:1/erc20:0x...`) 하나만으로 특정 가능하며(레지스트리 자동 resolve), 모든 응답에 chainId(CAIP-2)/assetId(CAIP-19)가 항상 포함된다(하위 호환 유지). 자동 버전 체크 + CLI update 7단계 시퀀스로 안전한 업그레이드가 가능하고, release-please 2-게이트 릴리스 모델 + workflow_dispatch RC 승격 자동화로 배포를 지원한다. v2.0.0-rc.1 pre-release 발행 완료. **EVM RPC 프록시**: `POST /v1/rpc-evm/:walletId/:chainId` 엔드포인트로 Forge/Hardhat/ethers.js/viem 등 기존 EVM 도구가 `--rpc-url`만 변경하면 WAIaaS 정책 엔진+서명 파이프라인 아래에서 컨트랙트 배포 및 온체인 인터랙션을 수행할 수 있다(10 signing intercept + 19 passthrough, DELAY/APPROVAL Long-poll 비동기 승인, CONTRACT_DEPLOY 9번째 타입). **가스비 조건부 실행**: 트랜잭션 요청에 gasCondition(maxGasPrice/maxPriorityFee/timeout)을 선언적으로 지정하면 GAS_WAITING 상태로 대기 후 조건 충족 시 자동 실행, 타임아웃 시 자동 취소되며, REST API/MCP/SDK/ActionProvider 전 인터페이스에서 사용 가능하다.

## 핵심 가치

**AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다** — 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서. 서비스 제공자 의존 없이 사용자가 완전한 통제권을 보유한다.

## Current Milestone: v33.3 Desktop App 배포 채널 확장

**Goal:** Tauri Desktop App의 배포 접근성을 높인다 — waiaas.ai 다운로드 페이지(OS 감지), Homebrew Cask tap, Desktop 설치 가이드

**Target features:**
- waiaas.ai 다운로드 페이지 (OS 자동 감지 + GitHub Releases API 연동, 클라이언트 사이드 JS, 대체 설치법 안내)
- Homebrew Cask Tap (homebrew-waiaas 별도 repo, CI 자동 formula 업데이트)
- Desktop 설치 가이드 (OS별 설치/Setup Wizard/트러블슈팅/업그레이드, docs/admin-manual/ 10번째 파일)
- SUBMISSION_KIT.md Desktop 배포 채널 항목 추가
- GitHub Releases CI (tauri-action 3 플랫폼 빌드) + Tauri 자동 업데이트

## Previous Milestone: v33.2 Tauri Desktop App — SHIPPED 2026-04-01

Tauri 2 기반 데스크탑 앱. Rust SidecarManager(Node.js SEA 바이너리 관리, crash detection, 동적 포트 할당), 7 IPC 명령, 3색 시스템 트레이, 5단계 Setup Wizard, WalletConnect QR(Plan B REST API), GitHub Releases CI 3 플랫폼 빌드 + Ed25519 auto-update. 5 phases, 12 plans, 37 requirements, 33 commits, 108 files, +32,011/-7,916 lines.

## Previous Milestone: v33.0 Desktop App 아키텍처 재설계 — SHIPPED 2026-03-31

설계 문서 39를 React 18 SPA에서 Admin Web UI(Preact 10.x) WebView 로드 아키텍처로 전환. isDesktop() 환경 감지, 7개 IPC 명령 규격, 4-layer tree-shaking, TCP bind(0) 동적 포트 할당 설계 완료. m33-02 objectives 정합성 갱신. 3 phases, 6 plans, 18 requirements, 26 commits, +5,772/-1,843 lines.

## Previous Milestone: v32.10 에이전트 스킬 정리 + OpenClaw 플러그인 — SHIPPED 2026-03-18

docs/guides/ → docs/agent-guides/ 리네이밍으로 에이전트/관리자 문서 구조 분리. docs/admin-manual/ 9개 파일로 masterAuth 운영 가이드 이전. skills/ 12개 파일에서 masterAuth 콘텐츠 완전 제거(admin/setup 스킬 삭제, 나머지 7개 sessionAuth 전용). @waiaas/openclaw-plugin 패키지 구현(17개 sessionAuth 도구, 5그룹, register() 진입점, fetch HTTP 클라이언트). release-please + turbo + npm publish + smoke-test 파이프라인 통합. openclaw-integration.md 플러그인 우선 구조 재작성 + openclaw-plugin SEO 랜딩 페이지 + 사이트 30페이지 빌드. 4 phases, 7 plans, 48 requirements, 28 commits, 239 files, +17,896/-10,026 lines, ~327,768 LOC TS.

## Previous Milestone: v32.9 Push Relay 직접 연동 (ntfy.sh 제거) — SHIPPED 2026-03-18

ntfy.sh SSE 의존성을 완전 제거하고 데몬-Push Relay 간 HTTP 직접 연동으로 전환. ResponseChannelSchema에서 type: 'ntfy' 제거 + type: 'push_relay' 추가, APPROVAL_METHODS에서 sdk_ntfy→sdk_push 전환. Push Relay 서버 자체 sign_responses DB + long-polling API 구현. PushRelaySigningChannel HTTP POST + long-polling 서명 채널 재작성. NtfyChannel/ntfy config/settings/hot-reload 코드 전량 삭제. DB v60 마이그레이션(push_relay_url 컬럼, DCent 프리셋 자동 설정). Wallet SDK ntfy 함수 deprecated 처리(@deprecated JSDoc). Admin UI Push Relay URL 관리 + Approval Method 라벨 "Wallet App (Push)" 전환. 3 phases, 7 plans, 32 requirements, 36 commits, 118 files, +5,426/-4,411 lines, ~326,625 LOC TS.

## Previous Milestone: v32.8 테스트 커버리지 강화 — SHIPPED 2026-03-18

전 패키지 커버리지 강화: 620+ 신규 테스트, 9/12 패키지 L:90/B:85/F:95 통일 기준 달성. SDK 99.93%, shared 100%, EVM B:91%, wallet-sdk B:95%. daemon/cli/admin은 프레임워크 제약으로 근접 수준 달성. coverage-gate.sh 12 패키지 동기화. 7개 오픈 이슈 전량 해결(EVM 체크섬, PositionTracker RPC, DeFi UAT 등). 6 phases, 17 plans, 48 requirements, 58 commits, 131 files, +21,334/-185 lines, ~368,589 LOC TS.

## Previous Milestone: v32.7 SEO/AEO 최적화 — SHIPPED 2026-03-17

ESM 빌드 파이프라인(`site/build.mjs`)으로 19개 마크다운 파일을 CRT 테마 HTML 페이지로 변환(빌드타임 구문 강조), Blog/Docs 목록 페이지 + 활성 네비게이션 + 259개 내부 링크 검증(0 broken). sitemap.xml(22 URL) + JSON-LD 구조화 데이터(Article/TechArticle + BreadcrumbList) + canonical URL, llms-full.txt(188KB) AEO 최적화 + 20개 FAQ Q&A(FAQPage 스키마), GitHub Actions CI 파이프라인(docs/** 변경 시 자동 빌드 + GitHub Pages 배포), SEO 랜딩 페이지 3종("AI wallet" 카테고리) + SUBMISSION_KIT(7 플랫폼) + 커뮤니티 포스팅 초안 4개. 5 phases, 7 plans, 33 requirements, 30 commits, 53 files, +6,080/-867 lines, ~355,935 LOC TS.

## Previous Milestone: v32.6 성능 + 구조 개선 — SHIPPED 2026-03-17

N+1 쿼리 6곳 배치 전환(IN()/GROUP BY), sessions/policies API limit/offset 페이지네이션(SDK listSessions/listPolicies + MCP list_sessions 도구), 4개 대형 파일 분할: migrate.ts(3,529→285줄 러너 + DDL + 6 마이그레이션 모듈), daemon.ts(2,412→327줄 셸 + startup/shutdown/pipeline), database-policy-engine.ts(2,318→852줄 오케스트레이터 + 8 evaluator), stages.ts(2,330→12줄 barrel + 6 stage + helpers). Solana mapError() 중앙화(14 catch 통합) + ILogger 인터페이스(@waiaas/core). 4 phases, 9 plans, 46 requirements, 34 commits, 83 files, +13,451/-9,755 lines, ~313,564 LOC TS.

## Previous Milestone: v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글 — SHIPPED 2026-03-16

PositionQueryContext 타입 도입 + IPositionProvider 시그니처 확장(8개 프로바이더 마이그레이션, 체인 가드 패턴). Lido 5네트워크/Aave V3 5네트워크/Pendle 2네트워크 멀티체인 병렬 포지션 조회(Promise.allSettled 장애 격리). Solana 프로바이더 동적 네트워크 추출(ctx.networks[0]). DB migration v59 defi_positions.environment 컬럼 + Admin API includeTestnets 필터 + Admin UI 테스트넷 토글(localStorage). 이슈 3건 수정(#376-#378). 3 phases, 8 plans, 30 requirements, 37 commits, 94 files, +5,349/-880 lines, ~339,000 LOC TS.

## Previous Milestone: v32.4 타입 안전 + 코드 품질 — SHIPPED 2026-03-16

프로덕션 `as any` 0건 달성, DatabasePolicyEngine 20건 JSON.parse→Zod safeParse, IChainSubscriber 9메서드 확장, NATIVE_DECIMALS/sleep/formatAmount SSoT 통합, 레이어 위반 0건, 4건 이슈 수정(#359-#362). 5 phases, 11 plans, 51 requirements, 47 commits, 140 files, +7,233/-1,967 lines, ~349,000 LOC TS.

## Previous Milestone: v32.2 보안 패치 — SHIPPED 2026-03-16

SSRF 가드 범용화(infrastructure/security/) + Admin RPC Test SSRF 방어, hostGuard startsWith 우회 수정(정확 매칭만), SlidingWindowRateLimiter 인메모리 3계층(IP/세션/TX) Rate Limit 미들웨어 + RATE_LIMITED 에러 코드, hono/cors 미들웨어(cors_origins hot-reload), 알림 채널 10초 fetch timeout, AutoStop EventBus 리스너 정리. 3 phases, 3 plans, 14 requirements, 16 commits, 20 files, +1,228/-273 lines, 32 new tests.

## Previous Milestone: v32.0 Contract Name Resolution — SHIPPED 2026-03-15

ContractNameRegistry 4단계 우선순위 동기 해석(Action Provider > Well-known > CONTRACT_WHITELIST > Fallback), well-known 305+ 정적 엔트리(5 EVM 체인 + Solana), 17개 Action Provider displayName 메타데이터, CONTRACT_CALL 알림 7개 호출지점에서 "Protocol Name (0xabcd...1234)" 포맷 표시, TxDetailResponse contractName/contractNameSource 필드 추가(5개 엔드포인트), Admin UI 트랜잭션 목록 + 지갑 Activity 탭 컨트랙트 이름 표시. 3 phases, 4 plans, 24 requirements, 22 commits, 64 files, +4,839/-975 lines, ~397,990 LOC TS.

## Previous Milestone: v31.18 Admin UI IA 재구조화 — SHIPPED 2026-03-15

Admin UI 사이드바 17개 플랫 메뉴를 5개 섹션 헤더(Wallets/Trading/Security/Channels/System)로 그룹화, 페이지 리네이밍(DeFi→Providers, Security→Protection, System→Settings), Tokens/RPC Proxy 독립 페이지를 Wallets/Settings 탭으로 병합, Hyperliquid/Polymarket Settings 탭 제거→Providers 중앙화, 지갑 상세 8탭→4탭(Overview/Activity/Assets/Setup) 통합 + Owner Protection 카드 인라인, 레거시 경로 리다이렉트 + Ctrl+K 검색 동기화 + TabNav 통일. 4 phases, 7 plans, 38 requirements, 30 commits, 52 files, +3,311/-515 lines.

## Previous Milestone: v31.17 OpenAPI 기반 프론트엔드 타입 자동 생성 — SHIPPED 2026-03-15

Build-time OpenAPI spec 추출 + openapi-typescript 자동 타입 생성 파이프라인, openapi-fetch 기반 타입 안전 API 클라이언트(인증 미들웨어), Admin UI 18+ 페이지 수동 interface → 생성 타입 점진적 마이그레이션(satisfies 검증), Provider discovery API(enabledKey/category/isEnabled) + settings schema 엔드포인트 → 하드코딩 제거, @waiaas/shared 상수 모듈(정책/크레덴셜/에러 코드), OpenAPI spec ↔ Admin UI 필드 사용 contract test CI 게이트. 5 phases, 11 plans, 21 requirements, 46 commits, 136 files, +19,066/-4,788 lines, ~347,156 LOC TS.

## Previous Milestone: v31.16 CAIP 표준 식별자 승격 — SHIPPED 2026-03-15

REST API, SDK, MCP 전체 인터페이스에서 CAIP-2(네트워크)와 CAIP-19(자산)를 표준 식별자로 승격. normalizeNetworkInput CAIP-2 dual-accept(15개 네트워크 매핑 + z.preprocess 자동 적용), assetId-only 토큰 특정(레지스트리 자동 resolve + 네트워크 추론), 모든 응답에 chainId/assetId 런타임 동적 생성(connect-info supportedChainIds), SDK Caip2ChainId/Caip19AssetId 타입 + TokenInfo union 확장, MCP resolve_asset 신규 도구 + assetId-only 토큰 도구, 스킬 파일 4종 CAIP 문서화. 5 phases, 8 plans, 46 requirements, 34 commits, 71 files, +4,783 lines, 239 CAIP tests.

## Previous Milestone: v31.15 Amount 단위 표준화 및 AI 에이전트 DX 개선 — SHIPPED 2026-03-14

14개 non-CLOB provider 스키마에 명시적 단위 description 추가, 4개 레거시 provider(Aave V3/Kamino/Lido/Jito) smallest-unit 전환 + migrateAmount() 하위 호환성 자동 변환. MCP typed schema 등록(jsonSchemaToZodParams) + GET /v1/actions/providers inputSchema JSON Schema 노출. 트랜잭션/잔액 응답에 amountFormatted/amountDecimals/amountSymbol + balanceFormatted 런타임 보강. humanAmount XOR 파라미터 — REST API(TRANSFER/TOKEN_TRANSFER/APPROVE) + 10 action providers + MCP 자동 노출. SDK humanAmount 타입 + 스킬 파일 4종 단위 가이드 + E2E humanAmount 시나리오 검증. 5 phases, 9 plans, 33 requirements, 40 commits, 89 files, +7,834 lines, ~294,834 LOC TS.

## Previous Milestone: v31.14 EVM RPC 프록시 모드 — SHIPPED 2026-03-13

WAIaaS 데몬이 EVM JSON-RPC 프록시로 동작. CONTRACT_DEPLOY 9번째 트랜잭션 타입(Zod SSoT 전체 전파, DB v58), `POST /v1/rpc-evm/:walletId/:chainId` 엔드포인트(10 signing intercept + 19 passthrough + batch), DELAY/APPROVAL Long-poll 비동기 승인(CompletionWaiter + SyncPipelineExecutor), Admin Settings 7키 + Admin UI RPC Proxy 페이지, MCP get_rpc_proxy_url + SDK getRpcProxyUrl() + connect-info rpcProxyBaseUrl 자동 발견, 보안(sessionAuth + from 검증 + bytecodeSize 제한 + audit log source). 4 phases, 11 plans, 49 requirements, 31 commits, 82 files, +9,485 lines, ~189 tests.

## Previous Milestone: v31.13 DeFi 포지션 대시보드 완성 — SHIPPED 2026-03-12

미구현 5개 DeFi 프로바이더의 getPositions() 구현 + Admin Dashboard UX 완성. Lido stETH/wstETH + Jito jitoSOL 스테이킹 포지션(환산 비율, duck-type 자동 등록), Aave V3 Supply/Borrow + Health Factor + Oracle USD, Pendle PT/YT Yield 포지션(MATURED 자동 전환, implied APY), Hyperliquid Perp 오픈 포지션 + Spot 잔액(Info API 신규 구현, 8 metadata 필드), Admin Dashboard 카테고리 필터(5탭) + 프로바이더 그룹핑 + 카테고리별 맞춤 상세 컬럼(STAKING:APR/LENDING:HF/YIELD:만기/PERP:PnL) + HF 경고 배너 + 지갑 필터 + 30초 자동 새로고침. 5 phases, 8 plans, 27 requirements, 28 commits, 44 files, +5,985 lines, ~188 tests.

## Previous Milestone: v31.12 External Action 프레임워크 구현 — SHIPPED 2026-03-12

doc-81 설계 기반 External Action 프레임워크 전체 구현. ResolvedAction 3-kind Zod discriminatedUnion(contractCall/signedData/signedHttp, backward-compatible normalization), ISignerCapability 7-scheme registry(EIP-712/PersonalSign/ERC-8128 어댑터 + HMAC/RSA-PSS/ECDSA/Ed25519 신규), CredentialVault(AES-256-GCM 암호화, HKDF 도메인 분리, per-wallet/global scope, REST 8 endpoints, re-encrypt on password change), Venue Whitelist + Action Category Limit 정책(default-deny venue, 카테고리별 daily/monthly/per_action USD 한도), Kind-based 파이프라인 라우팅(signedData/signedHttp → credential→policy→DB→sign→track→audit), AsyncTrackingResult 9-state, DB v55-v57(wallet_credentials + transactions action columns + composite index), Admin UI 4페이지(Credentials/External Actions/Venue Whitelist/Category Limit) + MCP 2도구 + SDK 6메서드 + skill files 4종. Known gaps: TRACK-02(bridge_status rename deferred), TRACK-03(ExternalActionTracker class deferred), TRACK-05(EventBus events deferred). 7 phases, 15 plans, 57/60 requirements, 57 commits, 144 files, +15,780/-263 lines, ~219 new tests.

## Previous Milestone: v31.11 External Action 프레임워크 설계 — SHIPPED 2026-03-12

설계 전용 마일스톤. ActionProvider 프레임워크를 on-chain 트랜잭션 전용에서 off-chain 액션(CEX API, EIP-712 CLOB, ERC-8128 서명 HTTP)을 포괄하는 통합 액션 모델로 확장하는 설계. ResolvedAction 3종 Zod union(contractCall/signedData/signedHttp), ISignerCapability 통합 인터페이스(기존 4종 래핑 + HMAC/RSA-PSS/signBytes 신규, 7종 Registry), CredentialVault(per-wallet AES-256-GCM, HKDF 도메인 분리, REST 8 endpoints), 3-way 파이프라인 라우팅(kind별 분기 + off-chain DB 기록, DB v55-v57), 정책 확장(VENUE_WHITELIST + ACTION_CATEGORY_LIMIT), AsyncTrackingResult 9-state 확장, doc-81 통합 설계 문서(1,184줄, 19 Zod 스키마, 4-Wave 구현 계획). 6 phases, 11 plans, 34 requirements, 36 design decisions, 46 commits, 60 files, +13,039/-1,582 lines.

## Previous Milestone: v31.10 코드베이스 품질 개선 — SHIPPED 2026-03-11

순수 리팩토링 마일스톤. parseTokenAmount/contract-encoding 유틸리티 통합(7개 프로바이더 중복 제거), WalletRow SmartAccount 타입 확장(`as any` 24곳 제거), admin.ts 5개 도메인 모듈 분할(3,107줄→98줄 thin aggregator), WAIaaSError 패턴 통일(에러 코드 135→137), 10개 명명 상수 추출(daemon/cli/admin 3개 constants.ts). 5 phases, 8 plans, 16 requirements, 32 commits, 89 files, +6,742/-3,472 lines. 행위 변경 없음, API 변경 없음, DB 마이그레이션 없음.

## Previous Milestone: v31.9 Polymarket 예측 시장 통합 — SHIPPED 2026-03-11

Polymarket 예측 시장 통합. EIP-712 3-domain 서명(ClobAuth, CTF Exchange, Neg Risk) 기반 CLOB 주문 인프라(PolymarketSigner, ClobClient, OrderBuilder, RateLimiter), Gamma API 마켓 조회(30s TTL 캐시) + PolymarketCtfProvider(5 on-chain CTF actions: split/merge/redeem/approve), PositionTracker(가중평균가 bigint) + PnlCalculator + ResolutionMonitor(마켓 해결 폴링), DB v53-v54(polymarket_orders/positions/api_keys 3 tables), PolymarketOrderProvider(5 actions: buy/sell/cancel/cancel_all/update) + ApiDirectResult off-chain 패턴, Admin Settings 7키 + REST 9 endpoints + Admin UI 5탭(Overview/Markets/Orders/Positions/Settings) + MCP 8 query 도구 + SDK 15 메서드 + connect-info polymarket capability + 정책 통합(17 tests) + Skill 파일 2개 + E2E 4시나리오 + UAT defi-13. 5 phases, 14 plans, 29 requirements, 48 commits, 93 files, +10,363 lines, ~235 tests.

## Previous Milestone: v31.8 Agent UAT (메인넷 인터랙티브 검증) — SHIPPED 2026-03-10

Agent UAT 마크다운 시나리오 체계 구축. 6-section 표준 포맷(Metadata/Prerequisites/Steps/Verification/Cost/Troubleshooting) + YAML 프론트매터, `/agent-uat` skill 파일, 45개 시나리오(Testnet 8 + Mainnet 6 + DeFi 12 + Advanced 6 + Admin 13), CI 시나리오 등록 강제(Provider 매핑/포맷/인덱스/Admin 라우트 4개 검증 스크립트 + ci.yml 통합). 5 phases, 12 plans, 56 requirements, 41 commits, 89 files, +10,962 lines.

## Previous Milestone: v31.7 E2E 자동 검증 체계 — SHIPPED 2026-03-09

E2E 자동 검증 체계 구축. @waiaas/e2e-tests 독립 패키지(시나리오 레지스트리, 데몬/Push Relay 라이프사이클, 세션/HTTP 헬퍼), 오프체인 스모크 테스트(코어/인터페이스/고급 프로토콜), CI/CD 통합(e2e-smoke.yml RC 트리거, 실패 알림), 온체인 E2E(PreconditionChecker, testnet 전송/스테이킹/Hyperliquid/NFT), E2E 시나리오 등록 강제(CI fail on gap). 8 phases, 21 plans, 47 requirements, 55 commits, 122 files, +12,359 lines.

## Previous Milestone: v31.6 Across Protocol 크로스체인 브릿지 — SHIPPED 2026-03-09

Across Protocol Intent 기반 고속 크로스체인 브릿지 통합. AcrossApiClient(5 REST endpoints) + AcrossBridgeActionProvider(5 actions: quote/execute/status/routes/limits), SpokePool depositV3 via CONTRACT_CALL(ERC-20 approve BATCH + native ETH msg.value), Late-bind quote(Stage 5 fresh /suggested-fees), 2-phase polling status tracker(15s active + 5min monitoring, bridge_status/bridge_metadata reuse), 7 Admin Settings + connect-info + 4 SDK methods + Admin UI + skill file, 110 tests(67 unit + 43 integration), design doc 79, no DB migration, no new npm deps. 5 phases, 8 plans, 33 requirements, 31 commits, 66 files, +8,815 lines.

## Previous Milestone: v31.4 Hyperliquid 생태계 통합 — SHIPPED 2026-03-08

HyperEVM 체인 지원과 Hyperliquid L1 DEX(Perp/Spot) 거래 + Sub-account 관리를 ApiDirectResult 패턴으로 기존 파이프라인에 통합. HyperEVM Mainnet/Testnet (Chain ID 999/998) 체인 등록, EIP-712 서명 기반 off-chain DEX API(7 Perp actions + 3 Spot actions + 2 Sub-account actions), Stage 5 ApiDirectResult 분기(on-chain TX 없이 CONFIRMED), margin 기반 정책 평가(Perp) + size*price 정책(Spot), HyperliquidSigner(L1 + User-Signed dual EIP-712), ExchangeClient(RateLimiter 600 weight/min), MarketData(positions/orders/fills/funding/markets/balances/sub-accounts), DB v51 hyperliquid_orders + DB v52 hyperliquid_sub_accounts, 22 MCP tools + 22 SDK methods + 9 Admin Settings + Admin UI 5-tab page + connect-info capability + skill files 3개. 5 phases, 12 plans, 44 requirements, 38 commits, 112 files, +12,755 lines.

## Previous Milestone: v31.3 DCent Swap Aggregator 통합 — SHIPPED 2026-03-07

DCent Swap Backend API를 WAIaaS에 통합하여 다중 프로바이더 스왑(동일체인 DEX + 크로스체인 Exchange) + 2-hop 자동 라우팅 폴백 지원. DcentSwapApiClient(7 endpoints, 24h currency cache), currency-mapper(CAIP-19 ↔ DCent Currency ID 양방향 변환, 8 native token mappings), DEX Swap(approve+txdata BATCH, min/max validation, provider sorting), Exchange(payInAddress TRANSFER + ExchangeStatusTracker polling + 4 notification events), auto-router(6 EVM chains intermediate tokens, 2-hop fallback on no-route error), DcentSwapActionProvider(IActionProvider, 4 actions), 4 MCP tools + 4 SDK methods + 7 Admin Settings keys + connect-info capability + policy engine integration + skill files 2개 업데이트 + design doc 77 (936 lines). 5 phases, 9 plans, 37 requirements, 54 commits, 110 files, +11,612 lines, 116 tests.

## Previous Milestone: v31.2 UserOp Build/Sign API — SHIPPED 2026-03-06

Smart Account 지갑에서 프로바이더 없이 UserOperation을 구성/서명할 수 있는 Build/Sign API. Provider Lite/Full 모드 자동 분기, unsigned UserOp 구성(nonce, callData, factory 자동 감지, Bundler 불필요), callData 이중 검증 + 정책 평가 + 서명, DB v45 userop_builds 테이블(TTL 10분 + cleanup 워커), MCP 2도구 + SDK 2메서드, Admin UI Lite/Full 모드 표시, 스킬 파일 3개. 4 phases, 8 plans, 58 requirements, 27 commits, +6,821 lines.

## Previous Milestone: v31.0 NFT 지원 (EVM + Solana) — SHIPPED 2026-03-06

EVM(ERC-721/ERC-1155)과 Solana(Metaplex) NFT 통합. NFT_TRANSFER 6번째 discriminatedUnion type, INftIndexer(Alchemy/Helius), IChainAdapter 25 메서드, 6-stage 파이프라인 NFT_TRANSFER + Smart Account UserOp 호환, NFT Query API(커서 페이지네이션/컬렉션 그룹핑/메타데이터 캐싱), MCP 3도구 + SDK 3메서드, Admin UI NFT 탭 + 인덱서 설정, 스킬 파일 3개, CAIP-19 NFT 네임스페이스, 정책 적용(RATE_LIMIT nft_count/CONTRACT_WHITELIST/기본 APPROVAL). 5 phases, 12 plans, 58 requirements, 38 commits, +12,784 lines.

## Previous Milestone: v30.11 Admin UI DX 개선 — SHIPPED 2026-03-05

Admin UI 메뉴를 DeFi/Agent Identity로 직관적으로 재명명, ERC-8004 토글을 Agent Identity 페이지에 통합하여 한 페이지 완결 관리, 전 10개 프로바이더 기본 활성화(DB v42 INSERT OR IGNORE), 액션별 Tier 오버라이드 프레임워크(Settings 기반 + 파이프라인 floor 에스컬레이션), Admin UI Description 컬럼 + Tier 드롭다운 + 오버라이드/Reset 기능, 4개 스킬 파일 동기화. 23 commits, 48 files, +2,984/-370 lines.

## Previous Milestone: v30.10 ERC-8128 Signed HTTP Requests — SHIPPED 2026-03-05

ERC-8128 (Signed HTTP Requests with Ethereum) 표준 통합. RFC 9421 Signature Base + RFC 9530 Content-Digest + EIP-191 signing engine, REST API 2 endpoints, ERC8128_ALLOWED_DOMAINS policy (default-deny, wildcard, rate limit), MCP 2 tools + SDK 3 methods (fetchWithErc8128 포함), Admin UI settings + policy form, connect-info capability, erc8128.skill.md. x402(결제) + ERC-8004(신원) + ERC-8128(API 인증) 에이전트 웹 인증 3종 세트 완성. 80 new tests, 23 commits.

## Current State

v31.17 OpenAPI 기반 프론트엔드 타입 자동 생성 shipped (2026-03-15). 12-패키지 모노레포(packages/actions/) + Python SDK, ~347,156 LOC TypeScript, ~8,050+ 테스트 통과. **OpenAPI 타입 자동 생성**: Build-time OpenAPI spec 추출(createApp stub deps) + openapi-typescript v7 타입 생성, openapi-fetch 기반 타입 안전 API 클라이언트(X-Master-Password 미들웨어, 401 로그아웃), Admin UI 18+ 페이지 수동 interface→생성 타입 alias 전환(types.aliases.ts 중앙 모듈, satisfies 검증), CI freshness gate(types.generated.ts 동기화 강제), Provider discovery API(enabledKey/category/isEnabled 확장), settings schema 엔드포인트, @waiaas/shared 상수 모듈(정책/크레덴셜/에러 코드 브라우저 안전 re-export), OpenAPI spec ↔ Admin UI contract test CI 게이트. **CAIP 표준 식별자**: normalizeNetworkInput CAIP-2 dual-accept(15개 네트워크 매핑, z.preprocess 자동 적용), assetId-only 토큰 특정(CAIP-19 파싱 + 레지스트리 자동 resolve + 네트워크 추론), 모든 응답에 chainId(CAIP-2)/assetId(CAIP-19) 런타임 동적 생성, SDK Caip2ChainId/Caip19AssetId 타입 + TokenInfo union 확장, MCP resolve_asset 신규 도구, 스킬 파일 4종 CAIP 문서화, 239 CAIP-related tests. **Amount 단위 표준화**: 14개 non-CLOB provider smallest-unit 통일, migrateAmount() 하위 호환, MCP typed schema(jsonSchemaToZodParams), amountFormatted/balanceFormatted 응답 보강, humanAmount XOR 파라미터(REST+10 providers+MCP+SDK). **DeFi Position Tracking**: 5개 프로바이더(Lido/Jito/Aave V3/Pendle/Hyperliquid) getPositions() 구현 완료, Admin Dashboard 카테고리별 필터+프로바이더 그룹핑+HF 경고 배너. **Hyperliquid**: HyperEVM Mainnet/Testnet(Chain ID 999/998), ApiDirectResult off-chain DEX 패턴(Stage 5 CONFIRMED), HyperliquidPerpProvider(7 actions: Market/Limit/SL/TP/Cancel/Leverage/Margin), HyperliquidSpotProvider(3 actions: Buy/Sell/Cancel), HyperliquidSubAccountProvider(2 actions: Create/Transfer), EIP-712 dual signing(L1 phantom agent + User-Signed), ExchangeClient(RateLimiter), MarketData(15 query methods), DB v52(hyperliquid_orders + hyperliquid_sub_accounts), 22 MCP tools + 22 SDK methods + 9 Admin Settings + Admin UI 5-tab page. **DCent Swap**: DcentSwapApiClient(7 endpoints), currency-mapper(CAIP-19↔DCent 양방향), DEX Swap(approve+txdata BATCH), Exchange(payInAddress TRANSFER + ExchangeStatusTracker), auto-router(6 EVM chains 2-hop fallback), DcentSwapActionProvider(4 actions), MCP 4도구 + SDK 4메서드 + 7 Admin Settings. **ERC-8004 Trustless Agents**: Erc8004ActionProvider(8 write actions: register/wallet/uri/metadata/feedback/validation), Erc8004RegistryClient(viem 래퍼, 3 ABI 상수), DB v39-40(agent_identities/reputation_cache/approval_type/policies CHECK), ReputationCacheService(인메모리→DB→RPC 3-tier, TTL 300s), REPUTATION_THRESHOLD 정책(Stage 3 position 6, maxTier 에스컬레이션, unrated_tier), EIP-712 typed data 월렛 링킹(AgentWalletSet 4-field typehash, ApprovalWorkflow dual-routing SIWE/EIP712, WcSigningBridge eth_signTypedData_v4, calldata re-encoding), 4 GET REST 엔드포인트 + connect-info erc8004 확장, MCP 11 도구(8 write auto-expose + 3 read-only), SDK 11 메서드, Admin UI ERC-8004 페이지(Identity/Registration File/Reputation 3탭) + REPUTATION_THRESHOLD 정책 폼 + BUILTIN_PROVIDERS erc8004_agent, erc8004.skill.md 612 lines, 182 새 테스트(E1-E20 시나리오). **ERC-4337 Smart Account**: SmartAccountService(viem toSoladySmartAccount, CREATE2 주소 예측), DB v38(account_type/signer_key/deployed/entry_point 4 컬럼), Admin Settings 25개 정의(feature gate + bundler/paymaster URL + chain overrides), UserOperation Pipeline(stage5Execute accountType 분기, BundlerClient/PaymasterClient, BATCH 원자적 실행), Paymaster Gas Sponsorship(자동 감지/rejection 처리), 전 인터페이스 확장(CLI --account-type, SDK createWallet, MCP wallet detail, Admin UI Account Type 셀렉터 + Smart Account 설정, 3 skill files 업데이트). **Ops Design Specs (OPS-01~06)**: Transaction Dry-Run(SimulationResult Zod 스키마, PipelineContext dryRun 분기, POST /v1/transactions/simulate), Audit Log Query API(AuditEventType 20개, cursor pagination, GET /v1/audit-logs), Encrypted Backup(AES-256-GCM 아카이브 포맷, EncryptedBackupService, CLI backup/restore), Webhook Outbound(HMAC-SHA256, webhooks+webhook_logs DB, 재시도 큐, REST API 4개), Admin Stats(7-category Zod, IMetricsCounter, 1분 TTL 캐시), AutoStop Plugin(IAutoStopRule, RuleRegistry, per-rule 토글). 설계 문서 48개 + objective 9개. MIT 라이선스, npm 10개 패키지(@waiaas/push-relay 추가) OIDC Trusted Publishing 발행, Sigstore provenance 배지 확보, Docker Hub/GHCR dual push(daemon + push-relay), 설계 문서 47개(신규 73/74/75 + 기존 44개 갱신) 교차 검증 PASS, 설계 부채 0건, 영문 README + CONTRIBUTING + 배포 가이드 + API 레퍼런스 + CHANGELOG 완비, @waiaas/skills npx 패키지 + examples/simple-agent 예제. CLI로 init → start → quickstart --mode testnet/mainnet → 세션 생성 → 정책 설정(USD 기준, 12개 타입별 전용 폼, 누적 지출 한도 daily/monthly, 표시 통화 43개) → SOL/SPL/ETH/ERC-20 전송(네트워크 선택, USD 환산 정책 평가) → 컨트랙트 호출 → Approve → 배치 → 외부 dApp unsigned tx 서명(sign-only) → Action Provider 플러그인 실행 → x402 유료 API 자동 결제 → Owner 승인/거절(SIWS/SIWE + WalletConnect v2 QR 페어링 + 서명 요청 + Telegram Fallback 자동 전환) + Kill Switch 3-state 긴급 정지(6-step cascade + dual-auth 복구) + AutoStop 4-규칙 자동 정지 엔진 + 잔액 모니터링(LOW_BALANCE 사전 알림) + Telegram Bot 원격 관리(10개 명령어 + 2-Tier 인증 + i18n) + SDK/MCP로 프로그래밍 접근(18개 도구 + 스킬 리소스 + Action Provider 동적 도구) + Telegram/Discord/ntfy/Slack 알림(APPROVAL_CHANNEL_SWITCHED 추가) + Admin Web UI(`/admin`) 관리(Kill Switch 3-state UI + WalletConnect 세션 관리 페이지 + Telegram Users 관리 + AutoStop/Monitoring Settings + 12개 정책 폼 + PolicyRulesSummary 시각화) + Docker 원클릭 배포(Multi-stage + Secrets + non-root) + 토큰 레지스트리 관리 + API 스킬 파일(skills/ 7개) 제공까지 동작. **v1.8에서 추가:** VersionCheckService npm registry 24h 주기 자동 체크 + CLI stderr 업그레이드 알림(24h dedup, --quiet) + `waiaas upgrade` 7단계 시퀀스(--check/--to/--rollback) + BackupService DB+config 백업/복원(5개 보존) + 호환성 매트릭스(코드-DB 스키마 3-시나리오 판별) + Health API 확장(latestVersion/updateAvailable/schemaVersion) + Docker Watchtower+OCI 라벨 + GHCR 3-tier 태깅 + release-please 2-게이트 릴리스(Conventional Commits→Release PR→deploy 수동 승인) + SDK HealthResponse 타입 + 19건 E2E 통합 테스트.

**구현 로드맵:**
- ✅ v1.1 코어 인프라 + 기본 전송 — shipped 2026-02-10
- ✅ v1.2 인증 + 정책 엔진 — shipped 2026-02-10
- ✅ v1.3 SDK + MCP + 알림 — shipped 2026-02-11
- ✅ v1.3.1 Admin Web UI 설계 — shipped 2026-02-11
- ✅ v1.3.2 Admin Web UI 구현 — shipped 2026-02-11
- ✅ v1.3.3 MCP 다중 에이전트 지원 — shipped 2026-02-11
- ✅ v1.3.4 알림 이벤트 트리거 연결 + 어드민 알림 패널 — shipped 2026-02-12
- ✅ v1.4 토큰 + 컨트랙트 확장 — shipped 2026-02-12 (1,126 tests, 51,750 LOC)
- ✅ v1.4.1 EVM 지갑 인프라 + REST API 5-type 통합 + Owner Auth SIWE — shipped 2026-02-12 (1,313 tests, 65,074 LOC)
- ✅ v1.4.2 용어 변경 (agent → wallet) — shipped 2026-02-13 (1,326 tests, 56,808 LOC)
- ✅ v1.4.3 EVM 토큰 레지스트리 + MCP/Admin DX + 버그 수정 — shipped 2026-02-13 (1,357 tests, 59,993 LOC)
- ✅ v1.4.4 Admin Settings + MCP 5-type + Skill Files — shipped 2026-02-14 (1,467 tests, 62,296 LOC)
- ✅ v1.4.5 멀티체인 월렛 모델 설계 — shipped 2026-02-14 (설계 문서 5개, 설계 결정 31개)
- ✅ v1.4.6 멀티체인 월렛 구현 — shipped 2026-02-14 (1,580 tests, ~73,000 LOC)
- ✅ v1.4.7 임의 트랜잭션 서명 API — shipped 2026-02-15 (1,636 tests, ~175,480 LOC)
- ✅ v1.4.8 Admin DX + 알림 개선 — shipped 2026-02-15 (~1,618 tests, ~178,176 LOC)
- ✅ v1.5 DeFi Price Oracle + Action Provider Framework — shipped 2026-02-15 (1,848 tests, ~185,000 LOC)
- ✅ v1.5.1 x402 클라이언트 지원 — shipped 2026-02-15 (2,058 tests, ~187,000 LOC)
- ✅ v1.5.2 Admin UI 정책 폼 UX 개선 — shipped 2026-02-16 (2,111 tests, ~188,000 LOC)
- ✅ v1.5.3 USD 정책 확장 (누적 지출 한도 + 표시 통화) — shipped 2026-02-16 (~2,150 tests, ~191,000 LOC)
- ✅ v1.6 운영 인프라 + 잔액 모니터링 — shipped 2026-02-16 (~2,294 tests, ~207,902 LOC)
- ✅ v1.6.1 WalletConnect Owner 승인 — shipped 2026-02-16 (~2,510 tests, ~220,000 LOC)
- ✅ v1.7 품질 강화 + CI/CD — shipped 2026-02-17 (3,509 tests, ~237,000 LOC)
- ✅ v1.8 업그레이드 + 배포 인프라 — shipped 2026-02-17 (3,599 tests, ~124,712 LOC TS)
- ✅ v2.0 전 기능 완성 릴리스 — shipped 2026-02-18 (~3,599 tests, ~124,830 LOC TS)
- ✅ v2.2 테스트 커버리지 강화 — shipped 2026-02-18 (281 신규 tests, ~142,639 LOC TS)
- ✅ v2.3 Admin UI 기능별 메뉴 재구성 — shipped 2026-02-18 (11 plans, 39 requirements, ~145,784 LOC TS)
- ✅ v2.4 npm Trusted Publishing 전환 — shipped 2026-02-19 (4 plans, 12 requirements, ~146,464 LOC TS)
- ✅ v2.4.1 Admin UI 테스트 커버리지 복원 — shipped 2026-02-19 (5 plans, 22 requirements, ~151,015 LOC TS)
- ✅ v2.5 DX 품질 개선 — shipped 2026-02-19 (8 plans, 23 requirements)
- ✅ v2.6 Wallet SDK 설계 — shipped 2026-02-20 (7 plans, 23 requirements, 34 설계 결정, 설계 문서 3개 신규)
- ✅ v2.6.1 WAIaaS Wallet Signing SDK — shipped 2026-02-20 (13 plans, 27 requirements, 4,323 tests, ~138,051 LOC TS)
- ✅ v2.7 지갑 앱 알림 채널 — shipped 2026-02-20 (4 plans, 16 requirements, ~161,634 LOC TS)
- ✅ v26.3 Push Relay Server — shipped 2026-02-20 (8 plans, 25 requirements, ~163,416 LOC TS)
- ✅ v26.4 멀티 지갑 세션 + 에이전트 자기 발견 — shipped 2026-02-21 (15 plans, 30 requirements, ~145,704 LOC TS)
- ✅ v27.0 수신 트랜잭션 모니터링 설계 — shipped 2026-02-21 (16 plans, 29 requirements, 26 설계 결정, docs 76)
- ✅ v27.1 수신 트랜잭션 모니터링 구현 — shipped 2026-02-22 (18 plans, 30 requirements, ~155,540 LOC TS)
- ✅ v27.2 CAIP-19 자산 식별 표준 — shipped 2026-02-22 (9 plans, 31 requirements, ~157,584 LOC TS)
- ✅ v27.3 토큰별 지출 한도 정책 — shipped 2026-02-22 (7 plans, 27 requirements, ~158,416 LOC TS)
- ✅ v27.4 Admin UI UX 개선 — shipped 2026-02-23 (9 plans, 32 requirements, ~186,724 LOC TS)
- ✅ v28.0 기본 DeFi 프로토콜 설계 — shipped 2026-02-23 (5 plans, 25 requirements, 59 설계 결정)
- ✅ v28.1 Jupiter Swap — shipped 2026-02-23 (6 plans, 17 requirements, ~187,250 LOC TS)
- ✅ v28.2 0x EVM DEX Swap — shipped 2026-02-24 (7 plans, 22 requirements, ~188,500 LOC TS)
- ✅ v28.3 LI.FI 크로스체인 브릿지 — shipped 2026-02-24 (6 plans, 22 requirements)
- ✅ v28.4 Liquid Staking (Lido + Jito) — shipped 2026-02-24 (7 plans + 1 quick task, 25 requirements, ~189,000 LOC TS)
- ✅ v28.5 가스비 조건부 실행 — shipped 2026-02-25 (4 plans, 25 requirements, ~190,000 LOC TS)
- ✅ v28.6 RPC Pool 멀티엔드포인트 로테이션 — shipped 2026-02-25 (5 phases, 25 requirements, ~190,000 LOC TS)
- ✅ v28.8 빌트인 지갑 프리셋 자동 설정 — shipped 2026-02-26 (3 phases, 6 plans, 14 requirements, ~180,194 LOC TS)
- ✅ v29.0 고급 DeFi 프로토콜 설계 — shipped 2026-02-26 (6 phases, 12 plans, 38 requirements, 59 설계 결정)
- ✅ v29.2 EVM Lending -- Aave V3 — shipped 2026-02-27 (5 phases, 15 plans, 34 requirements)
- ✅ v29.3 기본 지갑/기본 네트워크 개념 제거 — shipped 2026-02-27 (4 phases, 10 plans, 72 requirements)
- ✅ v29.4 Solana Lending (Kamino) — shipped 2026-02-28 (2 phases, 9 plans, 21 requirements, ~192,843 LOC TS)
- ✅ v29.5 내부 일관성 정리 — shipped 2026-02-28 (3 phases, 7 plans, 18 requirements, ~223,044 LOC TS)
- ✅ v29.6 Pendle Yield Trading + Yield 프레임워크 — shipped 2026-03-01 (3 phases, 8 plans, 18 requirements, ~225,248 LOC TS)
- ✅ v29.7 D'CENT 직접 서명 + Human Wallet Apps 통합 — shipped 2026-03-01 (6 phases, 11 plans, 40 requirements)
- ✅ v29.8 Solana Perp DEX (Drift) + Perp 프레임워크 — shipped 2026-03-02 (3 phases, 7 plans, 22 requirements)
- ✅ v29.9 세션 점진적 보안 모델 — shipped 2026-03-02 (2 phases, 14 plans, 25 requirements, ~233,440 LOC TS)
- ✅ v29.10 ntfy 토픽 지갑별 설정 전환 — shipped 2026-03-02 (2 phases, 4 plans, 21 requirements)
- ✅ v30.0 운영 기능 확장 설계 — shipped 2026-03-03 (5 phases, 11 plans, 25 requirements, 40+ 설계 결정)
- ✅ v30.2 운영 기능 확장 구현 — shipped 2026-03-04 (6 phases, 14 plans, 30 requirements, ~246,245 LOC TS)
- ✅ v30.6 ERC-4337 Account Abstraction 지원 — shipped 2026-03-04 (3 phases, 10 plans, 36 requirements, ~281,265 LOC TS)
- ✅ v30.8 ERC-8004 Trustless Agents 지원 — shipped 2026-03-04 (7 phases, 15 plans, 39 requirements, ~225,565 LOC TS)
- ✅ v30.9 Smart Account DX 개선 — shipped 2026-03-05 (3 phases, 6 plans, 27 requirements, ~262,608 LOC TS)
- ✅ v30.10 ERC-8128 Signed HTTP Requests — shipped 2026-03-05 (3 phases, 7 plans, 26 requirements, ~232,614 LOC TS)
- ✅ v30.11 Admin UI DX 개선 — shipped 2026-03-05 (3 phases, 5 plans, 27 requirements, ~266,814 LOC TS)
- ✅ v31.0 NFT 지원 (EVM + Solana) — shipped 2026-03-06 (5 phases, 12 plans, 58 requirements, ~239,575 LOC TS)
- ✅ v31.2 UserOp Build/Sign API — shipped 2026-03-06 (4 phases, 8 plans, 58 requirements, ~278,864 LOC TS)
- ✅ v31.3 DCent Swap Aggregator 통합 — shipped 2026-03-07 (5 phases, 9 plans, 37 requirements, ~248,459 LOC TS)
- ✅ v31.4 Hyperliquid 생태계 통합 — shipped 2026-03-08 (5 phases, 12 plans, 44 requirements, ~337,060 LOC TS)
- ✅ v31.6 Across Protocol 크로스체인 브릿지 — shipped 2026-03-09 (5 phases, 8 plans, 33 requirements, ~259,644 LOC TS)
- ✅ v31.7 E2E 자동 검증 체계 — shipped 2026-03-09 (8 phases, 21 plans, 47 requirements, ~527,949 LOC TS)
- ✅ v31.8 Agent UAT (메인넷 인터랙티브 검증) — shipped 2026-03-10 (5 phases, 12 plans, 56 requirements, 45 scenarios)
- ✅ v31.9 Polymarket 예측 시장 통합 — shipped 2026-03-11 (5 phases, 14 plans, 29 requirements, ~235 tests)
- ✅ v31.10 코드베이스 품질 개선 — shipped 2026-03-11 (5 phases, 8 plans, 16 requirements)
- ✅ v31.11 External Action 프레임워크 설계 — shipped 2026-03-12 (6 phases, 11 plans, 34 requirements)
- ✅ v31.12 External Action 프레임워크 구현 — shipped 2026-03-12 (7 phases, 15 plans, 60 requirements, ~219 tests)
- ✅ v31.13 DeFi 포지션 대시보드 완성 — shipped 2026-03-12 (5 phases, 8 plans, 27 requirements, ~188 tests)
- ✅ v31.14 EVM RPC 프록시 모드 — shipped 2026-03-13 (4 phases, 11 plans, 49 requirements, ~189 tests)
- ✅ v31.15 Amount 단위 표준화 및 AI 에이전트 DX 개선 — shipped 2026-03-14 (5 phases, 9 plans, 33 requirements, ~294,834 LOC TS)
- ✅ v31.16 CAIP 표준 식별자 승격 — shipped 2026-03-15 (5 phases, 8 plans, 46 requirements, 239 tests)
- ✅ v31.17 OpenAPI 기반 프론트엔드 타입 자동 생성 — shipped 2026-03-15 (5 phases, 11 plans, 21 requirements, ~347,156 LOC TS)
- ✅ v31.18 Admin UI IA 재구조화 — shipped 2026-03-15 (4 phases, 7 plans, 38 requirements)
- ✅ v32.0 Contract Name Resolution — shipped 2026-03-15 (3 phases, 4 plans, 24 requirements)
- ✅ v32.2 보안 패치 — shipped 2026-03-16 (3 phases, 3 plans, 14 requirements)
- ✅ v32.4 타입 안전 + 코드 품질 — shipped 2026-03-16 (5 phases, 11 plans, 51 requirements)
- ✅ v32.5 멀티체인 DeFi 포지션 + 테스트넷 토글 — shipped 2026-03-16 (3 phases, 8 plans, 30 requirements)
- ✅ v32.6 성능 + 구조 개선 — shipped 2026-03-17 (4 phases, 9 plans, 46 requirements)
- ✅ v32.7 SEO/AEO 최적화 — shipped 2026-03-17 (5 phases, 7 plans, 33 requirements)
- ✅ v32.8 테스트 커버리지 강화 — shipped 2026-03-18 (6 phases, 17 plans, 48 requirements)
- ✅ v32.9 Push Relay 직접 연동 — shipped 2026-03-18 (3 phases, 7 plans, 32 requirements)
- ✅ v32.10 에이전트 스킬 정리 + OpenClaw 플러그인 — shipped 2026-03-18 (4 phases, 7 plans, 48 requirements, ~327,768 LOC TS)
- 기본 거부 정책 토글 3개 (default_deny_tokens/contracts/spenders)
- IForexRateService CoinGecko tether 기반 43개 법정 통화 환산 + display_currency
- 누적 USD 지출 한도 (CUMULATIVE_SPENDING_DAILY/MONTHLY 롤링 윈도우, APPROVAL 격상, 80% 경고)
- 알림 4채널 (Telegram/Discord/ntfy/Slack) + 지갑 앱 ntfy 사이드 채널(6 카테고리, priority 기반) + 메시지 저장/조회 + DB v13
- API 키 관리 — SettingsService SSoT 단일 저장소, DB 암호화 저장(HKDF+AES-256-GCM), Admin UI CRUD, hot-reload 즉시 반영
- pushSchema 3-step 순서 (tables→migrations→indexes) + 마이그레이션 체인 테스트
- MCP graceful shutdown (stdin 감지 + force-exit 타임아웃)
- EventBus(EventEmitter) + Kill Switch 3-state(ACTIVE/SUSPENDED/LOCKED, CAS ACID, 6-step cascade)
- AutoStopService 4-규칙 자동 정지 (CONSECUTIVE_FAILURES/UNUSUAL_ACTIVITY/IDLE_TIMEOUT/MANUAL_TRIGGER)
- BalanceMonitorService 5분 주기 잔액 체크 + LOW_BALANCE 알림 (24h 중복 방지)
- TelegramBotService Long Polling + 10개 명령어 + 2-Tier 인증(ADMIN/READONLY/PENDING) + i18n(en/ko)
- Docker 배포 (Multi-stage Dockerfile, docker-compose.yml, Docker Secrets _FILE 패턴, non-root UID 1001)
- @waiaas/wallet-sdk (8개 공개 함수, SSE 자동 재연결, node>=18 engine) — subscribeToNotifications/parseNotification 추가
- Signing Protocol v1 (SignRequest/SignResponse, base64url, owner_approval_method 5-value)
- WalletNotificationChannel 사이드 채널 (26 이벤트 → 6 카테고리, priority 기반, 기존 채널과 독립 병행)
- ApprovalChannelRouter 5단계 우선순위 (SDK ntfy > SDK Telegram > WC > Telegram Bot > REST)
- DB v19 마이그레이션 (session_wallets junction + sessions.wallet_id 제거)
- 1:N 세션 모델 (session_wallets junction, resolveWalletId 3단계 우선순위)
- GET /v1/connect-info 자기 발견 (capabilities 동적 결정, 자연어 프롬프트)
- IChainSubscriber 6-method + SolanaIncomingSubscriber/EvmIncomingSubscriber + IncomingTxMonitorService (큐+멀티플렉서+안전규칙+KillSwitch)
- incoming_transactions/incoming_tx_cursors DB v21 + wallets.monitor_incoming opt-in
- GET /v1/wallet/incoming + /summary REST API + TS/Python SDK + MCP 2 tools + Admin IncomingSettings
- CAIP-19 자산 식별: caip/ 모듈(~240 LOC), 13-네트워크 양방향 맵, TokenRef assetId 확장, DB v22 token_registry.asset_id, 4-시나리오 ALLOWED_TOKENS 매칭, 가격 오라클 L2(Polygon/Arbitrum/Optimism/Base) 지원
- token_limits: CAIP-19 키 기반 토큰별 사람 읽기 단위 지출 한도, evaluateTokenTier 4단계 매칭(정확→native:{chain}→native→raw 폴백), Admin UI 토큰 레지스트리 연동 편집기
- DeFi Lending 프레임워크: ILendingProvider/IPositionProvider, PositionTracker(5분 sync), HealthFactorMonitor(4단계 severity, 적응형 폴링), LendingPolicyEvaluator(LTV/차입한도/비지출분류)
- AaveV3LendingProvider: supply/borrow/repay/withdraw 4액션, manual hex ABI(Lido 패턴), 5-chain 주소 레지스트리, HF 시뮬레이션 자기 청산 방지
- KaminoLendingProvider: Solana supply/borrow/repay/withdraw 4액션, @kamino-finance/klend-sdk 래퍼, HF 시뮬레이션 가드, PositionTracker duck-type 자동 등록
- IYieldProvider: IActionProvider 확장, getMarkets/getPosition/getYieldForecast 3 메서드, 5 액션(buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity)
- PendleYieldProvider: Pendle REST API v2 Convert 엔드포인트 기반, 5 Yield 액션, PT/YT/LP 포지션 추적
- MaturityMonitor: IDeFiMonitor 구현, 1일 1회 폴링, 만기 7일/1일 전 경고 + 만기 후 미상환 경고, 24h 쿨다운
- defi_positions DB v25: category/status/provider/assetId 인덱싱, PositionWriteQueue batch upsert, MATURED 상태 추가
- GET /v1/wallet/positions + /health-factor REST API, MCP 6도구(4 action + 2 query), TS/Python SDK 확장
- Admin DeFi Dashboard: HF 게이지(색상 badge), 포지션 테이블, Aave V3 Settings 4키 런타임 조정
- 설계 문서 48개 (24-76 + m29-00 DeFi 설계), 8 objective 문서

## 요구사항

### 검증됨

- ✓ AI 에이전트 vs 사람 사용자: WaaS 설계 차이점 분석 — v0.1 (CUST-02)
- ✓ 에이전트 지갑 생성/사용 방식 설계 — v0.1 (ARCH-01, ARCH-02)
- ✓ 커스터디 모델 비교 연구 — v0.1 (CUST-01, CUST-03, CUST-04)
- ✓ 주인-에이전트 관계 모델 설계 — v0.1 (REL-01~05)
- ✓ Solana 생태계 기술 스택 조사 — v0.1 (TECH-01, TECH-02, TECH-03)
- ✓ 활용 가능한 오픈소스 및 기존 솔루션 조사 — v0.1 (CUST-03)
- ✓ 에이전트 프레임워크 통합 방안 조사 — v0.1 (API-05, API-06)
- ✓ 세션 기반 인증 시스템 설계 (JWT HS256, SIWS/SIWE, 세션 제약) — v0.2 (SESS-01~05)
- ✓ 시간 지연 + 승인 정책 엔진 설계 (4-tier, DatabasePolicyEngine) — v0.2 (LOCK-01~04)
- ✓ 실시간 알림 + 긴급 정지 설계 (멀티 채널, Kill Switch, AutoStop) — v0.2 (NOTI-01~05)
- ✓ Owner 지갑 연결 설계 (WalletConnect v2, ownerAuth) — v0.2 (OWNR-01~03)
- ✓ 체인 추상화 계층 설계 (IChainAdapter, SolanaAdapter, EvmStub) — v0.2 (CHAIN-01~03)
- ✓ 코어 지갑 서비스 설계 (AES-256-GCM 키스토어, sodium guarded memory) — v0.2 (KEYS-01~04)
- ✓ REST API 서버 설계 (Hono, 31 엔드포인트, OpenAPI 3.0) — v0.2 (API-01~06)
- ✓ CLI Daemon 설계 (init/start/stop/status, 데몬 라이프사이클) — v0.2 (CLI-01~04)
- ✓ TypeScript SDK + Python SDK 인터페이스 설계 — v0.2 (SDK-01~02)
- ✓ MCP Server 설계 (6 도구, 3 리소스, stdio) — v0.2 (MCP-01~02)
- ✓ Desktop App 아키텍처 설계 (Tauri 2, Sidecar, 8 화면) — v0.2 (DESK-01~04)
- ✓ Docker 배포 스펙 설계 (compose, named volume) — v0.2 (DOCK-01)
- ✓ Telegram Bot 설계 (2-Tier 인증, 인라인 키보드) — v0.2 (TGBOT-01~02)
- ✓ 로컬 스토리지 설계 (SQLite 7-table, Drizzle ORM) — v0.2 (CORE-02)
- ✓ v0.1→v0.2 변경 매핑 및 SUPERSEDED 표기 — v0.3 (LEGACY-01~09)
- ✓ CRITICAL 의사결정 확정 (포트, Enum, Docker, 자금충전) — v0.3 (CRIT-01~04)
- ✓ Enum/상태값 통합 대응표 + config.toml 보완 — v0.3 (ENUM-01~04, CONF-01~05)
- ✓ REST API↔API Framework 스펙 통일 — v0.3 (API-01~06)
- ✓ 11개 구현 노트 추가 — v0.3 (NOTE-01~11)
- ✓ 테스트 레벨/모듈 매트릭스/커버리지 목표 정의 — v0.4 (TLVL-01~03, MOCK-01~04)
- ✓ 보안 공격 시나리오 71건 정의 (3계층 + 키스토어 + 경계값 + E2E 체인) — v0.4 (SEC-01~05)
- ✓ 블록체인 3단계 테스트 환경 + Enum SSoT 빌드타임 검증 — v0.4 (CHAIN-01~04, ENUM-01~03)
- ✓ CI/CD 4단계 파이프라인 + 커버리지 게이트 설계 — v0.4 (CICD-01~03)
- ✓ 배포 타겟별 테스트 118건 시나리오 — v0.4 (PLAT-01~04)
- ✓ masterAuth/ownerAuth/sessionAuth 3-tier 인증 책임 분리 — v0.5 (AUTH-01~05)
- ✓ Owner 주소 에이전트별 귀속 + WalletConnect 선택적 전환 — v0.5 (OWNR-01~06)
- ✓ 세션 낙관적 갱신 프로토콜 (PUT /renew, 5종 안전 장치) — v0.5 (SESS-01~05)
- ✓ CLI DX 개선 (init 간소화, --quickstart, --dev, hint, MCP 검토, 원격 접근) — v0.5 (DX-01~08)
- ✓ 기존 설계 문서 11개 v0.5 통합 반영 — v0.5 (Phase 21)
- ✓ SPL/ERC-20 토큰 전송 확장 + ALLOWED_TOKENS 정책 + getAssets() 복원 — v0.6 (TOKEN-01~05)
- ✓ ContractCallRequest + CONTRACT_WHITELIST 기본 거부 정책 — v0.6 (CONTRACT-01~05)
- ✓ ApproveRequest 독립 정책 카테고리 + 무제한 approve 차단 — v0.6 (APPROVE-01~03)
- ✓ BatchRequest Solana 원자적 배치 + 2단계 합산 정책 — v0.6 (BATCH-01~03)
- ✓ IPriceOracle + USD 기준 정책 평가 전환 — v0.6 (ORACLE-01~04)
- ✓ IActionProvider resolve-then-execute + MCP 자동 변환 + Jupiter Swap — v0.6 (ACTION-01~05)
- ✓ 확장 기능 테스트 전략 166건 + 기존 문서 8개 v0.6 통합 — v0.6 (TEST-01~03, INTEG-01~02)
- ✓ 구현 장애 요소 25건 해소 (CRITICAL 7 + HIGH 10 + MEDIUM 8) — v0.7 (CHAIN-01~04, DAEMON-01~06, DEPS-01~02, API-01~07, SCHEMA-01~06)
- ✓ Owner 선택적 등록 스펙 (3-State 상태 머신, 6전이, 유예/잠금 구간, 보안 공격 방어 4건) — v0.8 (OWNER-01~08)
- ✓ 점진적 보안 해금 모델 (APPROVAL→DELAY 다운그레이드, TX_DOWNGRADED_DELAY 이벤트, 3채널 알림) — v0.8 (POLICY-01~03, NOTIF-01~02)
- ✓ 자금 회수 프로토콜 (withdraw API 38번째 엔드포인트, sweepAll 20번째 메서드, HTTP 207 부분 실패) — v0.8 (WITHDRAW-01~08)
- ✓ Kill Switch/세션 보안 Owner 유무 분기 (복구 24h vs 30min, 세션 갱신 [거부하기]) — v0.8 (SECURITY-01~04, NOTIF-03)
- ✓ DX 변경 스펙 (set-owner/remove-owner/withdraw CLI 3개, --quickstart 간소화, agent info 안내) — v0.8 (DX-01~05)
- ✓ 14개 설계 문서 v0.8 통합 + 18x3 Owner 상태 분기 매트릭스 SSoT — v0.8 (INTEG-01~02)
- ✓ SessionManager 핵심 설계 (인터페이스, 토큰 로드, 자동 갱신, 실패 처리, lazy 401 reload) — v0.9 (SMGR-01~07)
- ✓ MCP tool handler 통합 설계 (ApiClient, 동시성, 프로세스 생명주기, Claude Desktop 에러 처리) — v0.9 (SMGI-01~04)
- ✓ CLI mcp setup/refresh-token + Telegram /newsession 연동 설계 — v0.9 (CLIP-01~02, TGSN-01~02)
- ✓ SESSION_EXPIRING_SOON 알림 이벤트 + 만료 임박 판단 로직 설계 — v0.9 (NOTI-01~02)
- ✓ 18개 테스트 시나리오 명시 + 7개 설계 문서 v0.9 통합(85 [v0.9] 태그) — v0.9 (TEST-01~02, INTEG-01~02)
- ✓ PolicyRuleSchema ↔ 25-sqlite 교차 참조 + APPROVAL 타임아웃 3단계 우선순위 — v0.10 (PLCY-01, PLCY-03)
- ✓ Owner GRACE→LOCKED 상태 전이 + 다운그레이드 우선순위 양방향 확정 — v0.10 (PLCY-02)
- ✓ 66개 에러 코드 통합 매트릭스 + PolicyType 10개 확장 + superRefin 검증 — v0.10 (ERRH-01, ERRH-03)
- ✓ ChainError 3-카테고리(PERMANENT/TRANSIENT/STALE) 분류 + 복구 전략 — v0.10 (ERRH-02)
- ✓ Stage 5 완전 의사코드 + 티어별 타임아웃 — v0.10 (CONC-01)
- ✓ 세션 갱신 낙관적 잠금(token_hash CAS) + RENEWAL_CONFLICT(409) — v0.10 (CONC-02)
- ✓ Kill Switch 4전이 CAS ACID 패턴 — v0.10 (CONC-03)
- ✓ 데몬 6단계 시작 타임아웃 + fail-fast/soft — v0.10 (OPER-01)
- ✓ Batch 부모-자식 2계층 DB + PARTIAL_FAILURE — v0.10 (OPER-02)
- ✓ Price Oracle 교차 검증 인라인 + 가격 나이 3단계 stale 정책 — v0.10 (OPER-03)

- ✓ v1.1~v2.0 마일스톤별 objective 문서 8개 생성 — v1.0
- ✓ 설계 부채 추적 체계 초기화 (objectives/design-debt.md) — v1.0
- ✓ 설계 문서 37개 → 구현 마일스톤 매핑 확정 + 양방향 교차 검증 — v1.0

(v1.1~v1.8 구현 검증됨 — 상세 생략, milestones/ 아카이브 참조)

- ✓ Agent UAT 마크다운 시나리오 포맷 6-section 표준 정의 — v31.8 (INFRA-01~07)
- ✓ Testnet 7개 + Mainnet 기본 전송 6개 시나리오 — v31.8 (TEST-01~07, XFER-01~06)
- ✓ DeFi 프로토콜 12개 시나리오 (12 providers) — v31.8 (DEFI-01~12)
- ✓ 고급 기능 6개 + Admin UI 검증 13개 시나리오 — v31.8 (ADV-01~06, ADMIN-01~13)
- ✓ CI 시나리오 등록 강제 (4 검증 스크립트 + ci.yml) — v31.8 (CI-01~05)

- ✓ 모노레포 인프라 구축 (pnpm workspace + Turborepo, 4 패키지, ESM-only) — v1.1 (MONO-01~03)
- ✓ @waiaas/core 패키지 (12 Enum SSoT, 5 Zod 스키마, 66 에러 코드, 4 인터페이스, i18n en/ko) — v1.1 (CORE-01~05)
- ✓ SQLite 7-table Drizzle ORM + CHECK 제약 + UUID v7 + WAL 모드 — v1.1 (DB-01~03)
- ✓ AES-256-GCM 키스토어 + Argon2id KDF + sodium guarded memory — v1.1 (KEY-01~03)
- ✓ config.toml 로더 (smol-toml + Zod 17키 검증 + 환경변수 오버라이드) — v1.1 (CFG-01~02)
- ✓ 데몬 라이프사이클 (6단계 시작/10-step 종료/flock 잠금/PID/BackgroundWorkers) — v1.1 (LIFE-01~04)
- ✓ Hono API 서버 (5 미들웨어 + errorHandler + 6 엔드포인트) — v1.1 (API-01~08)
- ✓ SolanaAdapter 10개 IChainAdapter 메서드 (@solana/kit 6.x) — v1.1 (SOL-01~06)
- ✓ 6-stage 트랜잭션 파이프라인 (DefaultPolicyEngine INSTANT, async fire-and-forget) — v1.1 (PIPE-01~04)
- ✓ CLI 4개 명령어 (init/start/stop/status, commander 13.x) — v1.1 (CLI-01~04)
- ✓ E2E 통합 검증 12건 (MockChainAdapter, 281 total tests) — v1.1 (E2E-01~04)

- ✓ sessionAuth JWT HS256 미들웨어 + dual-key rotation + DB session lookup — v1.2 (AUTH-01, SESS-06)
- ✓ masterAuth Argon2id 미들웨어 + ownerAuth Ed25519 서명 검증 미들웨어 — v1.2 (AUTH-02~05)
- ✓ 세션 CRUD API (create/list/revoke) + masterAuth 보호 — v1.2 (SESS-01~03)
- ✓ 세션 낙관적 갱신 + 5종 안전 장치 (maxRenewals, absoluteExpiresAt, 50% TTL, CAS, revocation) — v1.2 (SESS-04~05)
- ✓ DatabasePolicyEngine 4-tier 분류 (SPENDING_LIMIT BigInt + WHITELIST) + 정책 CRUD API — v1.2 (PLCY-01~04)
- ✓ TOCTOU 방지 (BEGIN IMMEDIATE + reserved_amount) — v1.2 (PLCY-05)
- ✓ DelayQueue 쿨다운 자동 실행 + 취소 — v1.2 (FLOW-01, FLOW-06)
- ✓ ApprovalWorkflow Owner 승인/거절 + 3단계 타임아웃 만료 — v1.2 (FLOW-02~05)
- ✓ Owner 3-State 상태 머신 (resolveOwnerState 순수 함수, NONE/GRACE/LOCKED) — v1.2 (OWNR-01~05)
- ✓ APPROVAL→DELAY 자동 다운그레이드 (TX_DOWNGRADED_DELAY 이벤트) — v1.2 (OWNR-06)
- ✓ 파이프라인 Stage 2(Auth) + Stage 3(Policy) + Stage 4(Wait) 실제 구현 — v1.2 (PIPE-01~04)
- ✓ 인증/정책/세션/워크플로우/Owner 통합 테스트 457건 — v1.2 (TEST-01~05)

- ✓ OpenAPIHono 전면 전환 — 33 엔드포인트 createRoute() + GET /doc OpenAPI 3.0 자동 생성 + 68개 에러 코드 매핑 — v1.3 (OAPI-01~04)
- ✓ IChainAdapter getAssets() + SolanaAdapter 구현 — v1.3 (CHAIN-01~02)
- ✓ REST API 15개 추가 (누적 33개) — assets, transactions, agents CRUD, admin 6종, error hint 32개 — v1.3 (API-01~15)
- ✓ 3채널 알림 시스템 — Telegram/Discord/ntfy, NotificationService 우선순위 폴백, 21 이벤트 en/ko 템플릿 — v1.3 (NOTIF-01~08)
- ✓ TypeScript SDK (@waiaas/sdk) — WAIaaSClient 9 메서드 + WAIaaSOwnerClient 4 메서드, 0 외부 의존성 — v1.3 (TSDK-01~08)
- ✓ Python SDK (waiaas) — async httpx + Pydantic v2, 동일 인터페이스 — v1.3 (PYDK-01~06)
- ✓ MCP Server (@waiaas/mcp) — 6 도구 + 3 리소스, SessionManager 자동 갱신, CLI mcp setup — v1.3 (MCP-01~06)

- ✓ Admin Web UI 전체 설계 문서 67(10개 섹션) — Preact 10.x + Vite 6.x + CSS Variables — v1.3.1 (PAGE-01~05, AUTH-01~02, INFRA-01~04, APIC-01~03, COMP-01~03, SEC-01)
- ✓ 5개 페이지 화면 설계 (Dashboard/Agents/Sessions/Policies/Settings) — 와이어프레임, 컴포넌트 계층, API 매핑, 상호작용 흐름 — v1.3.1
- ✓ masterAuth 로그인 흐름 + @preact/signals Auth Store + 15분 비활성 타임아웃 + 4종 로그아웃 — v1.3.1
- ✓ Hono serveStatic SPA 서빙 + CSP(default-src 'none') + 캐시 정책 + admin_ui 토글 — v1.3.1
- ✓ 8개 공통 컴포넌트 인터페이스 + CSS Variables 디자인 토큰 + 폼 유효성 검증 전략 — v1.3.1
- ✓ fetch 래퍼 + 68개 에러 코드 전체 매핑 + 로딩/빈/에러/셧다운 UX 패턴 — v1.3.1

- ✓ @waiaas/admin Preact + Vite 패키지 스캐폴드 + 빌드 파이프라인 + CSP + Kill Switch bypass — v1.3.2 (INFRA-01~07)
- ✓ masterAuth 로그인 + Auth Store + 비활성 타임아웃 + API Client fetch 래퍼 + 70 에러 코드 매핑 — v1.3.2 (AUTH-01~03, COMP-01~03)
- ✓ Dashboard/Agents/Sessions/Policies/Settings 5개 페이지 구현 + 4-tier SPENDING_LIMIT 시각화 — v1.3.2 (PAGE-01~05)
- ✓ Admin UI 통합 테스트 27건 (인증 4 + 유틸 6 + 페이지 14 + 보안/서빙 4) — v1.3.2 (TEST-01~03)

- ✓ 에이전트별 토큰 경로 분리 (mcp-tokens/<agentId>) + 기존 mcp-token fallback + 토큰 갱신 경로 격리 — v1.3.3 (TOKEN-01~04)
- ✓ MCP 서버 에이전트 식별 — waiaas-{agentName} 동적 이름 + 도구/리소스 description prefix + 하위 호환 — v1.3.3 (MCPS-01~03)
- ✓ CLI mcp setup 다중 에이전트 — --agent 개별 + --all 일괄 설정 + waiaas-{slug} config 키 + slug 충돌 해소 + 자동 감지 새 경로 — v1.3.3 (CLIP-01~07)

- ✓ 파이프라인 8개 이벤트 알림 트리거 연결 — TX_REQUESTED/TX_SUBMITTED/TX_CONFIRMED/TX_FAILED/POLICY_VIOLATION/SESSION_CREATED/SESSION_EXPIRED/OWNER_SET fire-and-forget — v1.3.4 (TRIG-01~08)
- ✓ notification_logs 테이블 증분 마이그레이션 + 발송 성공/실패 로깅 — schema_version 기반, MIG-01 준수 — v1.3.4 (LOG-01~03)
- ✓ 어드민 알림 API 3개 엔드포인트 — GET status(credential 마스킹)/POST test/GET log(페이지네이션) — v1.3.4 (API-01~03)
- ✓ 어드민 알림 패널 UI — 채널 상태 카드, 테스트 발송, 발송 로그, config.toml 안내 — v1.3.4 (UI-01~04)

- ✓ SPL/ERC-20 토큰 전송 + ALLOWED_TOKENS 기본 거부 정책 — v1.4 (TOKEN-01~06)
- ✓ 컨트랙트 호출 + CONTRACT_WHITELIST/METHOD_WHITELIST 기본 거부 — v1.4 (CONTRACT-01~04)
- ✓ Approve 관리 + APPROVED_SPENDERS/무제한 차단/TIER_OVERRIDE — v1.4 (APPROVE-01~04)
- ✓ Solana 원자적 배치 + 2단계 합산 정책 + EVM BATCH_NOT_SUPPORTED — v1.4 (BATCH-01~04)
- ✓ @waiaas/adapter-evm (viem 2.x, 20메서드, EIP-1559, gas 1.2x, nonce) — v1.4 (EVM-01~06)
- ✓ ChainError 3-카테고리 + DB 마이그레이션 러너 + discriminatedUnion 5-type — v1.4 (INFRA-01~05)
- ✓ Stage 5 CONC-01 재시도 + buildByType 5-type 라우팅 + 6개 PolicyType superRefine — v1.4 (PIPE-01~06)

- ✓ NetworkType 13값 확장 + EVM_CHAIN_MAP 10 네트워크 + DaemonConfig EVM RPC 16키 + validateChainNetwork — v1.4.1 (CONF-01~06)
- ✓ secp256k1 멀티커브 키스토어 + EIP-55 주소 파생 + curve/network 필드 + AES-256-GCM — v1.4.1 (KEYS-01~04)
- ✓ AdapterPool lazy init + 캐싱 + agent.chain 기반 어댑터 자동 선택 + 데몬 라이프사이클 전환 — v1.4.1 (POOL-01~04)
- ✓ managesOwnTransaction + schema_version 2 마이그레이션 + agents CHECK EVM 확장 — v1.4.1 (MIGR-01~03)
- ✓ REST API 5-type 통합 + route schema separation 방안 C + oneOf 6-variant OpenAPI — v1.4.1 (API-01~04)
- ✓ MCP send_token type/token + TS/Python SDK 5-type 확장 + CONTRACT_CALL/APPROVE/BATCH 보안 차단 — v1.4.1 (MCPSDK-01~04)
- ✓ verifySIWE(EIP-4361) + owner-auth chain 분기 + setOwner 주소 형식 검증 + Solana 회귀 없음 — v1.4.1 (SIWE-01~04)

- ✓ DB schema_version 3 마이그레이션 (agents→wallets, FK 5개, 인덱스 10개, enum 데이터 5건) — v1.4.2 (DB-01~05)
- ✓ Zod 스키마/Enum/에러 코드/i18n 전체 wallet 용어 rename — v1.4.2 (SCHEMA-01~04, ERR-01~04, I18N-01~03)
- ✓ REST API /v1/wallets 엔드포인트 + JWT wlt claim + OpenAPI 스키마 + Config — v1.4.2 (API-01~05, CONF-01)
- ✓ MCP WalletContext + CLI --wallet + WAIAAS_WALLET_ID + SDK walletId — v1.4.2 (MCP-01~05, SDK-01~02)
- ✓ Admin UI Wallets 페이지 + Dashboard/Sessions/Policies walletId — v1.4.2 (ADMIN-01~04)
- ✓ 설계 문서 15개 + README 갱신 + grep 전수 검사 0건 + 1,326 테스트 통과 — v1.4.2 (DOCS-01~02, VERIFY-01~03)

- ✓ EVM 네트워크별 내장 ERC-20 토큰 레지스트리 (5 네트워크 24 토큰) + 커스텀 토큰 CRUD — v1.4.3 (REGISTRY-01~03)
- ✓ getAssets() ERC-20 잔액 자동 조회 (레지스트리 ∪ ALLOWED_TOKENS 합집합) — v1.4.3 (ASSETS-01~02)
- ✓ POST /v1/mcp/tokens 원스톱 MCP 프로비저닝 API + Admin UI MCP Setup 섹션 — v1.4.3 (MCP-01~03)
- ✓ EVM/Solana waitForConfirmation fallback 패턴 (타임아웃 시 receipt 조회, SUBMITTED→FAILED 오판 방지) — v1.4.3 (PIPE-01~03)
- ✓ tag-release.sh 모노레포 버전 관리 + 9 패키지 1.4.3 적용 — v1.4.3 (DX-01~02)

- ✓ Admin UI 설정 관리 — 알림/RPC/보안 파라미터 DB 저장 + hot-reload, 5개 카테고리 섹션 — v1.4.4
- ✓ WalletConnect 설정 — project_id Admin UI 입력 + DB 저장 — v1.4.4
- ✓ MCP 5-type feature parity — call_contract/approve_token/send_batch MCP 도구 추가, BUG-017 해소 — v1.4.4
- ✓ API 스킬 파일 — quickstart/wallet/transactions/policies/admin 5개 마크다운 — v1.4.4
- ✓ Settings DB 인프라 — AES-GCM 암호화, fallback 체인, config.toml 자동 import — v1.4.4
- ✓ HotReloadOrchestrator — 알림 채널 재생성, RPC 어댑터 evict, 보안 즉시 반영 — v1.4.4

- ✓ 멀티체인 월렛 환경 모델 설계 (EnvironmentType SSoT, 환경-네트워크 매핑 4함수, 설계 결정 8개) — v1.4.5
- ✓ DB 마이그레이션 전략 설계 (v6a transactions.network ADD COLUMN + v6b wallets 12-step 재생성) — v1.4.5
- ✓ 트랜잭션 레벨 네트워크 지정 설계 (NetworkResolver 순수 함수, PipelineContext 확장, Stage 1~6 흐름도) — v1.4.5
- ✓ ALLOWED_NETWORKS 정책 + 네트워크 스코프 정책 설계 (11번째 PolicyType, 4단계 override, policies 테이블 v8) — v1.4.5
- ✓ REST API 7개 엔드포인트 network/environment 파라미터 + 3-Layer 하위호환 전략 설계 — v1.4.5
- ✓ MCP 6개 도구 + TS/Python SDK network 파라미터 확장 설계 — v1.4.5
- ✓ Quickstart --mode testnet/mainnet 워크플로우 설계 (Solana+EVM 2월렛 일괄 생성) — v1.4.5

- ✓ DB 마이그레이션 v6a/v6b/v8 (wallets.network→environment, transactions.network, policies.network) — v1.4.6
- ✓ EnvironmentType Zod SSoT + 환경-네트워크 매핑 함수 4개 (getNetworksForEnvironment, getDefaultNetwork, deriveEnvironment, validateNetworkEnvironment) — v1.4.6
- ✓ resolveNetwork() 순수 함수 + ENVIRONMENT_NETWORK_MISMATCH 에러 코드 + PipelineContext 확장 + Stage 1~5 통합 — v1.4.6
- ✓ ALLOWED_NETWORKS 11번째 PolicyType + permissive default + 네트워크 스코프 4단계 override — v1.4.6
- ✓ REST API 7개 엔드포인트 network/environment 파라미터 + PUT /default-network + GET /networks 신규 2개 (44 엔드포인트) — v1.4.6
- ✓ MCP 6개 도구 network 파라미터 + get_wallet_info 신규 도구 (11 도구) + TS/Python SDK network 확장 — v1.4.6
- ✓ Admin UI 환경 모델 전환 + ALLOWED_NETWORKS 정책 UI + 네트워크 관리 UI — v1.4.6
- ✓ CLI quickstart --mode testnet/mainnet 원스톱 Solana+EVM 2월렛 생성 — v1.4.6
- ✓ Skill 파일 4개 동기화 (quickstart, wallet, transactions, policies) — v1.4.6

- ✓ Sign-only 파이프라인 — POST /v1/transactions/sign (unsigned tx 파싱 → 기존 정책 평가 → 동기 서명 반환), DELAY/APPROVAL 즉시 거부, reserved_amount SIGNED 이중 지출 방지 — v1.4.7 (SIGN-01~15)
- ✓ Solana/EVM unsigned tx 파서 — IChainAdapter parseTransaction/signExternalTransaction 22메서드, ParsedOperationType 5종, DB 마이그레이션 v9 — v1.4.7 (SIGN-02~05,09,14)
- ✓ EVM calldata 인코딩 유틸리티 — POST /v1/utils/encode-calldata, TS/Python SDK encodeCalldata, MCP encode_calldata 도구 — v1.4.7 (ENCODE-01~05)
- ✓ 기본 거부 정책 3개 토글 — default_deny_tokens/contracts/spenders ON/OFF, SettingsService DI, hot-reload — v1.4.7 (TOGGLE-01~05)
- ✓ MCP 스킬 리소스 — waiaas://skills/{name} ResourceTemplate 5개, SKILL_NOT_FOUND 에러 — v1.4.7 (MCPRES-01~03)
- ✓ POLICY_VIOLATION 알림 보강 — policyType/contractAddress/tokenAddress/adminLink vars enrichment — v1.4.7 (NOTIF-01~02)

- ✓ pushSchema 3-step 순서 수정 (tables→migrations→indexes) + 마이그레이션 체인 테스트 23개 — v1.4.8 (MIGR-01~03)
- ✓ MCP graceful shutdown + stdin 종료 감지 + 3초 force-exit — v1.4.8 (MCPS-01~03)
- ✓ MCP set_default_network 도구 + CLI wallet 서브커맨드 + TS/Python SDK 메서드 — v1.4.8 (MCDX-01~03)
- ✓ network=all 잔액/자산 집계 + Promise.allSettled 부분 실패 + MCP/SDK 지원 — v1.4.8 (MCDX-04~07)
- ✓ Admin 대시보드 확장 (StatCard 링크, 추가 카드, 최근 활동) + 월렛 잔액/트랜잭션 + 세션 전체 조회 — v1.4.8 (ADUI-01~07)
- ✓ 알림 테스트 SYSTEM_LOCKED 수정 + 채널별 테스트 + 메시지 저장 + Slack Webhook — v1.4.8 (NOTF-01~06)
- ✓ wallet.skill.md + admin.skill.md 인터페이스 동기화 — v1.4.8 (SKIL-01~02)

- ✓ IPriceOracle 인터페이스 (getPrice/getPrices/getNativePrice/getCacheStats Zod SSoT) — v1.5 (ORACL-01)
- ✓ PythOracle Pyth Hermes REST API Zero-config 가격 조회 — v1.5 (ORACL-02)
- ✓ CoinGeckoOracle Demo API opt-in 롱테일 토큰 가격 조회 — v1.5 (ORACL-03)
- ✓ OracleChain Pyth→CoinGecko 2단계 fallback 가격 제공 — v1.5 (ORACL-04)
- ✓ InMemoryPriceCache 5분 TTL LRU 128항목 + stampede prevention — v1.5 (ORACL-05)
- ✓ classifyPriceAge FRESH/AGING/STALE 3단계 판정 — v1.5 (ORACL-06)
- ✓ OracleChain 교차 검증 편차>5% STALE 격하 — v1.5 (ORACL-07)
- ✓ GET /v1/admin/oracle-status 오라클 캐시 통계 + 소스별 상태 — v1.5 (ORACL-08)
- ✓ resolveEffectiveAmountUsd 5-type USD 환산 — v1.5 (USDPL-01)
- ✓ SpendingLimitRuleSchema instant_max_usd/notify_max_usd/delay_max_usd Zod SSoT — v1.5 (USDPL-02)
- ✓ PriceResult success/oracleDown/notListed 3-state discriminated union — v1.5 (USDPL-03)
- ✓ 가격 불명 토큰 NOTIFY 격상 + UNLISTED_TOKEN_TRANSFER 감사 로그 — v1.5 (USDPL-04)
- ✓ 오라클 장애 시 graceful fallback (네이티브 금액만 정책 평가) — v1.5 (USDPL-05)
- ✓ 가격 불명 토큰 + CoinGecko 키 미설정 시 최초 1회 힌트 — v1.5 (USDPL-06)
- ✓ IActionProvider metadata/actions/resolve 3메서드 인터페이스 — v1.5 (ACTNP-01)
- ✓ ActionProviderRegistry ~/.waiaas/actions/ ESM 플러그인 발견/로드/검증 — v1.5 (ACTNP-02)
- ✓ resolve() ContractCallRequestSchema Zod 재검증 정책 우회 차단 — v1.5 (ACTNP-03)
- ✓ POST /v1/actions/:provider/:action Action Provider resolve → 파이프라인 실행 — v1.5 (ACTNP-04)
- ✓ ActionDefinition→MCP Tool 자동 변환 mcpExpose=true — v1.5 (ACTNP-05)
- ✓ 프로바이더 등록/해제 시 MCP 도구 동적 추가/제거 — v1.5 (ACTNP-06)
- ✓ api_keys 테이블 DB v11 암호화 저장 — v1.5 (APIKY-01)
- ✓ GET/PUT/DELETE /v1/admin/api-keys CRUD (마스킹) — v1.5 (APIKY-02)
- ✓ requiresApiKey=true 프로바이더 키 미설정 시 비활성화 — v1.5 (APIKY-03)
- ✓ Admin UI API Keys 섹션 설정/수정/삭제 — v1.5 (APIKY-04)
- ✓ 설계 문서 61 Pyth Primary + CoinGecko Fallback + Chainlink 제거 — v1.5 (DSGN-01)
- ✓ 설계 문서 62 MCP 16개 상한 제거 + 14개 도구 현행화 — v1.5 (DSGN-02)
- ✓ 설계 문서 38 MCP 상한 제거 + 현행화 — v1.5 (DSGN-03)
- ✓ admin.skill.md oracle-status + api-keys 엔드포인트 문서화 — v1.5 (SKIL-01)
- ✓ actions.skill.md Action Provider REST API 문서화 신규 생성 — v1.5 (SKIL-02)

- ✓ x402 자동 결제 파이프라인 — SSRF 가드, HTTP 402 파싱, EIP-3009/TransferChecked 결제 서명, POST /v1/x402/fetch REST API — v1.5.1
- ✓ X402_ALLOWED_DOMAINS 기본 거부 정책 + SPENDING_LIMIT 4-tier USD 환산 통합 — v1.5.1
- ✓ TS/Python SDK x402Fetch/x402_fetch + MCP x402_fetch 도구 + x402.skill.md — v1.5.1

- ✓ 12개 PolicyType Zod rules 스키마 전체 등록 (4개 미등록 타입 추가) — v1.5.2 (VALID-01)
- ✓ DynamicRowList 재사용 컴포넌트 + PolicyFormRouter 12-type 분기 라우터 — v1.5.2 (FORM-01~04)
- ✓ 12개 PolicyType 전용 폼 컴포넌트 (SPENDING_LIMIT~X402_ALLOWED_DOMAINS) — v1.5.2 (PFORM-01~12)
- ✓ 폼 실시간 유효성 검증 + 에러 표시 — v1.5.2 (VALID-02~03)
- ✓ PolicyRulesSummary 12-type 목록 시각화 (심볼 배지, req/time, tier bars) — v1.5.2 (VIS-01~03)
- ✓ 수정 모달 전용 폼 프리필/저장 통합 — v1.5.2 (EDIT-01~02)

- ✓ CUMULATIVE_SPENDING_DAILY/MONTHLY 12번째 PolicyType 추가 — v1.5.3 (CUMUL-01~04)
- ✓ 롤링 윈도우 USD 누적 지출 계산 + APPROVAL 격상 + 80% 경고 알림 — v1.5.3 (CUMUL-05~08)
- ✓ IForexRateService CoinGecko tether 기반 43개 법정 통화 환산 — v1.5.3 (FOREX-01~04)
- ✓ display_currency 월렛별 표시 통화 + Admin UI 설정 — v1.5.3 (FOREX-05~07)
- ✓ DB 마이그레이션 v13 (amount_usd, reserved_amount_usd 컬럼) — v1.5.3 (DB-01)

- ✓ EventBus 이벤트 인프라 + 파이프라인/라우트 이벤트 발행 (EVNT-01~03) — v1.6
- ✓ Kill Switch 3-state 상태 머신 + CAS ACID + 6-step cascade + dual-auth 복구 + REST API + 미들웨어 (KILL-01~10) — v1.6
- ✓ AutoStop 4-규칙 자동 정지 엔진 + config/Admin Settings hot-reload + 알림 통합 (AUTO-01~06) — v1.6
- ✓ BalanceMonitorService 잔액 체크 + LOW_BALANCE 알림 + 중복 방지 + config/Admin Settings (BMON-01~06) — v1.6
- ✓ Telegram Bot Long Polling + 10개 명령어 + 2-Tier 인증 + i18n + DB v15 마이그레이션 (TGBOT-01~14) — v1.6
- ✓ Admin UI Kill Switch 3-state + Telegram Users 관리 + AutoStop/Monitoring Settings (ADUI-01~04) — v1.6
- ✓ Docker Multi-stage + docker-compose + Secrets + HEALTHCHECK + non-root (DOCK-01~06) — v1.6

- ✓ WalletConnect SignClient 인프라 — DB v16, SqliteKeyValueStorage, DaemonLifecycle fail-soft, Admin Settings hot-reload (INFRA-01~05) — v1.6.1
- ✓ QR 페어링 + REST API 4개 엔드포인트 — pairing URI→QR base64, CAIP-2 13 네트워크, Admin QR 모달, CLI owner connect (PAIR-01~06) — v1.6.1
- ✓ WcSigningBridge 서명 요청 — stage4Wait fire-and-forget WC 연동, SIWE/Ed25519 검증, approve/reject (SIGN-01~06) — v1.6.1
- ✓ Telegram Fallback 자동 전환 — WC→Telegram 자동 전환, 단일 승인 소스, APPROVAL_CHANNEL_SWITCHED 알림 (FALL-01~03) — v1.6.1
- ✓ WC DX 전체 인터페이스 — Admin WC 관리 페이지, MCP 3 도구, TS/Python SDK WC 메서드, Skill 파일 업데이트 (DX-01~04) — v1.6.1

- ✓ Vitest v8 커버리지 인프라 + Turborepo 5개 태스크 분리 + Mock 10개 경계(M1-M10) 완성 — v1.7 (COV-01~03, MOCK-01)
- ✓ 16개 Enum SSoT 4단계 빌드타임 검증 + config.toml 12건 + NOTE 매핑 22건 — v1.7 (ENUM-01~03)
- ✓ 7개 인터페이스 Contract Test (IChainAdapter/IPolicyEngine/INotificationChannel/IClock/IPriceOracle/IActionProvider) — v1.7 (CTST-01~07)
- ✓ 블록체인 3단계 테스트 (Mock RPC 13건 + Solana Local Validator 5건 + EVM Anvil 3건 + Devnet 3건) — v1.7 (CHAIN-01~04)
- ✓ 3계층 보안 테스트 71건 (세션20/정책9/Kill Switch8/키스토어10/경계값24) — v1.7 (SEC-01~05)
- ✓ 확장 보안 테스트 ~178건 (토큰32/컨트랙트28/Approve24/배치22/Oracle20/Action16/Swap12/ChainError12/x402 12) — v1.7 (SEC-06~14)
- ✓ 확장 기능 테스트 154건 (토큰32/컨트랙트28/Approve24/배치22/Oracle20/Action16/ChainError12) — v1.7 (EXT-01~07)
- ✓ 플랫폼 테스트 84건 (CLI Daemon32/Docker18/Telegram34) — v1.7 (PLAT-01~03)
- ✓ GitHub Actions 4-stage CI/CD (push→PR→nightly→release) + Composite Action + coverage-gate.sh — v1.7 (CICD-01~06)

- ✓ VersionCheckService npm registry 24h 주기 버전 체크 + fail-soft + key_value_store 저장 — v1.8 (VCHK-01~04)
- ✓ Health API 확장 — latestVersion, updateAvailable, schemaVersion 3필드 + createHealthRoute DI — v1.8 (HLTH-01~02)
- ✓ CLI 업그레이드 알림 — stderr 박스, 24h 파일 mtime dedup, --quiet/WAIAAS_NO_UPDATE_NOTIFY 억제 — v1.8 (VCHK-05~07)
- ✓ BackupService DB+WAL/SHM+config.toml 백업/복원, 5개 보존 정책 — v1.8 (UPGR-03~04,06)
- ✓ waiaas upgrade 7단계 시퀀스 (--check/--to/--rollback/--no-start) — v1.8 (UPGR-01~02,05,07)
- ✓ 호환성 매트릭스 — checkSchemaCompatibility 3-시나리오(migrate/reject-code_too_old/reject-schema_too_old) + daemon Step 2 통합 — v1.8 (CMPT-01~03)
- ✓ Docker Watchtower+OCI 라벨 + GHCR 3-tier 태깅(latest/semver/major) — v1.8 (DOCK-01~02)
- ✓ release-please 2-게이트 릴리스 모델 — manifest+config+워크플로우, deploy environment: production, BREAKING CHANGE major 범프 — v1.8 (RLSE-01~08)
- ✓ SDK HealthResponse 타입 + 스킬 파일 동기화 + 19건 E2E 통합 테스트 — v1.8 (SYNC-01)

- ✓ 설계 문서 44개 구현 교차 검증 PASS + 설계 부채 0건 확인 — v2.0 (VERIFY-01~03)
- ✓ 보안 460건 + 커버리지 80%+ + Enum SSoT 16개 + 플랫폼 84건 + 블록체인 통합 테스트 전수 통과 — v2.0 (TEST-01~05)
- ✓ 문서 재편성(docs/사용자, docs-internal/설계) + README(en) + CONTRIBUTING + 배포 가이드 + API 레퍼런스 + CHANGELOG 완비 — v2.0 (DOC-01~08)
- ✓ @waiaas/skills npx 배포 패키지 + examples/simple-agent SDK 예제 — v2.0 (PKG-01~02)
- ✓ npm 8개 패키지 publish + Docker Hub push + release.yml 활성화 + v2.0.0-rc.1 pre-release — v2.0 (DEPLOY-01~04, RELEASE-01~03)
- ✓ adapter-solana 브랜치 커버리지 65% → 84.87% (49 신규 테스트) — v2.2 (SOL-01~04)
- ✓ admin 함수 커버리지 57.95% → 77.87% (195 신규 테스트) — v2.2 (ADM-01~04)
- ✓ CLI 라인/구문 커버리지 68.09% → 91.88% (37 신규 테스트) — v2.2 (CLI-01~02)
- ✓ 3개 패키지 커버리지 임계값 원래 수준 복원 (branches 65→75, functions 55→70, lines/statements 65→70) — v2.2 (GATE-01)

- ✓ Admin UI 7-메뉴 재구성 (Dashboard/Wallets/Sessions/Policies/Notifications/Security/System) — v2.3 (MENU-01~03)
- ✓ TabNav 공용 컴포넌트 + 5개 페이지 탭 적용 (Wallets 4탭/Sessions 2탭/Policies 2탭/Notifications 3탭/Security 3탭) — v2.3 (TAB-01~06)
- ✓ Security 페이지 (Kill Switch/AutoStop Rules/JWT Rotation 3탭) + System 페이지 — v2.3 (SEC-01~04, SYS-01~02)
- ✓ Settings 분산 배치 — 13개 항목을 Wallets/Sessions/Policies/Notifications 탭으로 이동 + 독립 dirty/save — v2.3 (DIST-01~06, NEW-01~03)
- ✓ Ctrl+K 설정 검색 — 54개 필드 정적 인덱스, 페이지+탭 네비게이션, 필드 하이라이트 — v2.3 (SRCH-01~03)
- ✓ FieldGroup fieldset+legend 시맨틱 래퍼 + Sessions/Notifications/Security 그룹화 — v2.3 (FGRP-01~04)
- ✓ Breadcrumb 네비게이션 (5개 탭 페이지에 페이지명 > 탭명 표시) — v2.3 (BCMB-01~03)
- ✓ PageHeader subtitle + FormField description help text 전 필드 적용 — v2.3 (DESC-01~02)
- ✓ 미저장 경고 3버튼 다이얼로그 (탭 전환 + 사이드바 메뉴 전환 인터셉트) — v2.3 (DIRTY-01~02)
- ✓ README Admin UI 섹션 7-메뉴 구조 갱신 — v2.3 (DOC-01)

- ✓ npm Trusted Publishing (OIDC) 전환 — 8개 패키지 NPM_TOKEN 제거, GitHub Actions OIDC 인증 — v2.4 (PREP-01~03, OIDC-01~05)
- ✓ Sigstore provenance 배지 확보 — 8개 패키지 "Built and signed on GitHub Actions" — v2.4 (VERIFY-01~02)
- ✓ NPM_TOKEN 시크릿 제거 + Deploy summary provenance 메타데이터 추가 — v2.4 (VERIFY-03~04)
- ✓ 8건 이슈 수정 — 마스터 패스워드 검증(#090), NotificationService always-init(#088), npm README 복사(#093), homepage/bugs URL(#092), 스킬 버전 동기화(#085), AI 연결 프롬프트(#087), JWT UI 텍스트(#089), quickset 별칭(#091) — v2.4 (quick tasks)

- ✓ security.tsx 3-tab (Kill Switch/AutoStop/JWT Rotation) 27 테스트 + walletconnect.tsx 16 테스트 — v2.4.1 (NEWPG-01~04, NEWPG-10~12)
- ✓ system.tsx 6-섹션 34 테스트 (API Keys CRUD/Daemon 설정/Danger Zone) — v2.4.1 (NEWPG-05~09)
- ✓ 공용 컴포넌트 5개 65 테스트 (EmptyState/dirty-guard/UnsavedDialog/SettingsSearch/PolicyRulesSummary) — v2.4.1 (COMP-01~05)
- ✓ 기존 페이지(sessions/notifications/wallets) 44 추가 테스트 커버리지 개선 — v2.4.1 (EXIST-01~03)
- ✓ vitest 커버리지 임계값 70% 복원 (실제: 92% lines, 84% branches, 77% functions) — v2.4.1 (INFRA-01~02)

- ✓ CLI --version 동적 버전 + engines.node >= 22 + init 패스워드 안내/config 템플릿/권한 에러 — v2.5 (CLI-01~05)
- ✓ 데몬 시작 EADDRINUSE 감지 + Step 로그 debug 하향 + Admin UI URL 한 줄 요약 — v2.5 (DAEMON-01~03)
- ✓ quickstart 영문 전환 + 409 멱등성 + 만료 표시 + availableNetworks 필드 수정 — v2.5 (QS-01~04)
- ✓ MCP setup 에러 안내 + 기본 만료(24h) 경고 + --expires-in 옵션 가이드 — v2.5 (DAEMON-04, MCP-01)
- ✓ README SDK 코드 필드 수정 + skill 파일 14개 버전 자동 치환 — v2.5 (README-01~02)
- ✓ CLI/SDK npm 패키지 README + docker-compose GHCR 이미지 + .env.example — v2.5 (SDK-01~02, DOCK-01~02)
- ✓ Python SDK 버전/포트 수정 + .venv gitignore — v2.5 (PY-01~03)

- ✓ WAIaaS Signing Protocol v1 설계 (SignRequest/SignResponse Zod 스키마, 유니버셜 링크, ntfy/Telegram 채널, 보안 모델) — v2.6 (PROTO-01~04)
- ✓ @waiaas/wallet-sdk 공개 API 6개 함수 시그니처 + WalletLinkConfig + 패키지 구조 확정 — v2.6 (WSDK-01~03)
- ✓ 데몬 서명 컴포넌트 인터페이스 확정 (SignRequestBuilder/SignResponseHandler/ISigningChannel/ApprovalChannelRouter 5단계 fallback) — v2.6 (DMON-01~05)
- ✓ 알림 채널 토픽 분리 + NotificationMessage + WalletNotificationChannel 통합 설계 — v2.6 (NOTIF-01~03)
- ✓ Push Relay Server 설계 (IPushProvider/Pushwoosh/FCM + ntfy SSE + Docker) — v2.6 (RELAY-01~04)
- ✓ 기존 설계 문서 4개(35/37/25/67) v2.6 갱신 + 교차 검증 5항목 PASS — v2.6 (DOCS-01~04)

- ✓ Signing Protocol v1 구현 (SignRequest/SignResponse Zod 스키마, base64url, DB v18 owner_approval_method, 7 에러 코드) — v2.6.1 (PROTO-01~05)
- ✓ NtfySigningChannel 양방향 SSE 서명 채널 + TelegramSigningChannel 인라인 버튼 + /sign_response — v2.6.1 (CHAN-01~07)
- ✓ @waiaas/wallet-sdk npm 패키지 — 6개 공개 함수 (parseSignRequest, buildSignResponse, formatDisplayMessage, sendViaNtfy, sendViaTelegram, subscribeToRequests) — v2.6.1 (SDK-01~06)
- ✓ WalletLinkRegistry + SettingsService signing_sdk.* 6개 키 + owner_approval_method REST/Admin UI — v2.6.1 (WALLET-01~07)
- ✓ ApprovalChannelRouter 5단계 우선순위 라우팅 + SDK 비활성 fallback + 데몬 라이프사이클 완전 연결 — v2.6.1 (CHAN-05~07)
- ✓ GET/PUT /admin/settings 11개 카테고리 노출 + Admin UI signing_sdk 설정 관리 + Skills 동기화 — v2.6.1 (CONF-01~02, WALLET-07)

- ✓ NotificationMessageSchema Zod SSoT + EVENT_CATEGORY_MAP (26 events → 6 categories) — v2.7 (SCHEMA-01~03)
- ✓ WalletNotificationChannel 사이드 채널 (sdk_ntfy 지갑 대상, 기존 채널과 독립 병행, priority 기반) — v2.7 (DAEMON-01~06)
- ✓ subscribeToNotifications/parseNotification SDK 함수 (ntfy SSE + base64url Zod 검증) — v2.7 (SDK-01~02)
- ✓ signing_sdk.notifications_enabled/notify_categories 설정 + Admin UI 멀티셀렉트 체크박스 — v2.7 (SETTINGS-01~03, ADMIN-01)
- ✓ wallet.skill.md Section 13 SDK 알림 함수 문서화 — v2.7 (SYNC-01)

- ✓ NtfySigningChannel base64url 인코딩 통일 + wallet-sdk 호환성 검증 — v26.3 (ENCODE-01~03)
- ✓ @waiaas/push-relay ntfy SSE 구독 + 메시지 파서 + config.toml/Zod 검증 — v26.3 (SUB-01~04, INFRA-05~06)
- ✓ IPushProvider + PushwooshProvider + FcmProvider (지수 백오프 재시도, invalid token 자동 삭제) — v26.3 (PUSH-01~07)
- ✓ Device Token Registry SQLite + REST API + API Key 인증 — v26.3 (REG-01~05)
- ✓ npm 패키지 빌드 + Docker 이미지 + release-please + CI/CD 파이프라인 통합 — v26.3 (INFRA-01~04)
- ✓ 1:N 세션 모델 (session_wallets junction, DB v19) + 세션-지갑 CRUD 4 API — v26.4 (SESS-01~10)
- ✓ walletId 선택적 파라미터 + resolveWalletId 3단계 우선순위 + 하위 호환 — v26.4 (API-01~06)
- ✓ GET /v1/connect-info 자기 발견 (지갑/정책/capabilities/prompt) + agent-prompt 통합 — v26.4 (DISC-01~04)
- ✓ SDK/MCP/Admin UI/CLI 멀티 지갑 세션 + connect-info 통합 + 이슈 #119-#120 — v26.4 (INTG-01~10)

- ✓ IChainSubscriber 6-메서드 인터페이스 + IncomingTransaction 타입 + incoming_transactions DDL(v21) 완성 — v27.0 (MON-01, DATA-01~04)
- ✓ Solana logsSubscribe(mentions) + getTransaction(jsonParsed) SOL/SPL/Token-2022 이중 감지 + ATA 자동 감지 전략 설계 — v27.0 (MON-02, MON-08)
- ✓ EVM getLogs Transfer + getBlock(includeTransactions) ETH/ERC-20 이중 감지 + token_registry 오탐 방지 전략 설계 — v27.0 (MON-03)
- ✓ 3-state WebSocket 상태 머신 + SubscriptionMultiplexer 연결 공유 + 블라인드 구간 복구 설계 — v27.0 (MON-04~07, MON-09)
- ✓ INCOMING_TX_DETECTED/SUSPICIOUS 이벤트 + IIncomingSafetyRule 3규칙 + i18n(en/ko) + 5채널 알림 연동 명세 — v27.0 (EVT-01~05)
- ✓ REST API(GET /v1/wallet/incoming + /summary) + SDK/MCP 인터페이스 Zod SSoT 명세 — v27.0 (API-01~05)
- ✓ config.toml [incoming] 6키 + 지갑별 monitor_incoming opt-in + 환경변수 매핑 — v27.0 (CFG-01~03)
- ✓ 기존 설계 문서 9개 영향 분석 + 17개 검증 시나리오 + 교차 검증 PASS — v27.0 (VER-01~03)
- ✓ 감사 갭 9건 전량 해결 (IChainSubscriber connect()/waitForDisconnect(), 폴링 BackgroundWorker 등록, is_suspicious 컬럼, eventBus 타입 통일, FLOW-2 E2E, NOTIFY-1 priority 라우팅, getDecimals 헬퍼, doc 31 PATCH, skills/ 업데이트) — v27.0 (Phase 222-223)

- ✓ IChainSubscriber 6-method interface + DB v21 migration (incoming_transactions, incoming_tx_cursors, wallets.monitor_incoming) — v27.1 (SUB-01, STO-01)
- ✓ SolanaIncomingSubscriber WebSocket logsSubscribe + SOL/SPL/Token-2022 파서 + 60s heartbeat keepalive — v27.1 (SUB-02, SUB-07)
- ✓ EvmIncomingSubscriber getLogs ERC-20 Transfer + getBlock native ETH 폴링 감지 — v27.1 (SUB-03)
- ✓ WebSocket-to-polling 자동 폴백 3-state connection machine + SubscriptionMultiplexer 연결 공유 — v27.1 (SUB-04, SUB-06)
- ✓ Gap recovery via incoming_tx_cursors + blind gap recovery after reconnection — v27.1 (SUB-05)
- ✓ IncomingTxQueue Map dedup + BackgroundWorkers batch flush + ON CONFLICT DO NOTHING — v27.1 (STO-02, STO-04)
- ✓ Retention policy worker auto-delete older than incoming_retention_days — v27.1 (STO-05)
- ✓ GET /v1/wallet/incoming 커서 페이지네이션 + GET /summary 기간별 집계 + PATCH monitorIncoming 토글 — v27.1 (API-01~03)
- ✓ TypeScript/Python SDK listIncomingTransactions + getIncomingTransactionSummary — v27.1 (API-04, API-05)
- ✓ MCP list-incoming-transactions + get-incoming-summary 2 tools (total 23) — v27.1 (API-06, API-07)
- ✓ EventBus transaction:incoming + transaction:incoming:suspicious + 3 safety rules (dust/unknownToken/largeAmount) — v27.1 (EVT-01, EVT-03)
- ✓ TX_INCOMING/TX_INCOMING_SUSPICIOUS NotificationEventType + en/ko i18n templates — v27.1 (EVT-02, EVT-06)
- ✓ KillSwitch SUSPENDED/LOCKED 알림 억제 + per-wallet cooldown — v27.1 (EVT-04, EVT-05)
- ✓ config.toml [incoming] 7키 Zod 검증 + WAIAAS_INCOMING_* env var + SettingsService + HotReload — v27.1 (CFG-01~05)
- ✓ DaemonLifecycle Step 4c-9 IncomingTxMonitorService fail-soft 초기화 — v27.1 (CFG-04)
- ✓ 3개 통합 버그 수정 (BackgroundWorkers 공유, polling worker handlers, gap recovery wiring) — v27.1 (Phase 230)
- ✓ 20개 통합 테스트 6대 피트폴 검증 (listener leak, SQLite contention, dedup, shutdown drain, EVM reorg, gap recovery) — v27.1 (Phase 229)

- ✓ CAIP-2/19 파서/포매터 + Zod 스키마 + 13-네트워크 양방향 맵 (CAIP-01~10) — v27.2 (Phase 231)
- ✓ TokenRef assetId(CAIP-19) + network(NetworkType) 확장 (TOKN-01) — v27.2 (Phase 231)
- ✓ 가격 오라클 CAIP-19 캐시 키 전환 + CoinGecko L2 플랫폼 매핑 + Pyth 피드 ID 원자적 전환 (ORCL-01~04) — v27.2 (Phase 232)
- ✓ DB v22 마이그레이션: token_registry.asset_id + CAIP-19 backfill + Token API assetId (TOKN-02~04) — v27.2 (Phase 233)
- ✓ TokenInfoSchema assetId cross-validation + TransactionParam assetId 전파 (TXSC-01~03) — v27.2 (Phase 233)
- ✓ ALLOWED_TOKENS 4-시나리오 정책 매칭 매트릭스 (PLCY-01~04) — v27.2 (Phase 233)
- ✓ MCP 토큰 도구 assetId 파라미터 + TS/Python SDK 타입 확장 + 3개 스킬 파일 문서화 (MCPS-01~04, SKIL-01~02) — v27.2 (Phase 234)

- ✓ TokenLimitSchema Zod SSoT — raw optional 전환 + CAIP-19 키 기반 token_limits record + superRefine 검증 (SCHM-01~06) — v27.3 (Phase 235)
- ✓ evaluateTokenTier 정책 엔진 — CAIP-19 4단계 매칭 + decimal 변환 + maxTier(USD, 토큰별) 합산 (ENGN-01~10) — v27.3 (Phase 236)
- ✓ Admin UI 토큰별 한도 폼 — USD 최상단 + 네이티브/CAIP-19 편집기 + 레지스트리 연동 + deprecated 표시 (ADMN-01~07) — v27.3 (Phase 237)
- ✓ 하위 호환 100% + skill 파일 갱신 (CMPT-01~04) — v27.3 (Phase 238)

- ✓ ExplorerLink(13 networks)/FilterBar(URL sync)/SearchInput(debounce) 공용 컴포넌트 (COMP-01~03) — v27.4 (Phase 239)
- ✓ GET /v1/admin/transactions + GET /v1/admin/incoming 크로스 지갑 Admin API (API-01~02) — v27.4 (Phase 239)
- ✓ /transactions 페이지 — 8-column 테이블, 서버사이드 페이지네이션, 행 확장, 5개 필터 + 검색 (TXN-01~06) — v27.4 (Phase 240)
- ✓ Dashboard — Approval Pending 카드, 클릭 가능 StatCards, 네트워크/txHash 익스플로러 (DASH-01~04) — v27.4 (Phase 240)
- ✓ /tokens 페이지 — 네트워크별 토큰 CRUD, 온체인 메타데이터 자동 조회, 빌트인/커스텀 배지 (TOKR-01~04) — v27.4 (Phase 241)
- ✓ 알림 로그 필터 — 이벤트/채널/상태/날짜 필터 + 지갑 링크 (NLOG-01~02) — v27.4 (Phase 241)
- ✓ /incoming 페이지 — 설정 패널 추출, 크로스 지갑 수신 TX 뷰어, 지갑별 모니터링 토글 (INTX-01~04) — v27.4 (Phase 242)
- ✓ 지갑 목록 검색/필터/잔액+USD (WLST-01~03) — v27.4 (Phase 243)
- ✓ 지갑 상세 4탭(Overview/Transactions/Owner/MCP) + 페이지네이션/USD/새로고침 (WDET-01~04) — v27.4 (Phase 243)

- ✓ DEFI-01: packages/actions/ 패키지 구조 + registerBuiltInProviders 라이프사이클 + config.toml [actions.*] 공통 스키마 + Admin Settings 경계 확정 — v28.0 (Phase 244)
- ✓ DEFI-02: ActionApiClient(fetch+AbortController+Zod) 베이스 + Solana/EVM ContractCallRequest 매핑 + 8 DeFi 에러코드 + SlippageBps/SlippagePct branded types 확정 — v28.0 (Phase 244)
- ✓ DEFI-03: ActionProvider→Stage 3 정책 플로우 + CONTRACT_WHITELIST 8주소 + 크로스체인 출발 체인 정책 + 도착 주소 3단계 검증 확정 — v28.0 (Phase 244)
- ✓ DEFI-04: IAsyncStatusTracker + AsyncPollingService + 10→11-state(GAS_WAITING) + DB migration v23 + 3단계 브릿지 타임아웃 확정 — v28.0 (Phase 245)
- ✓ DEFI-05: JSON mock fixture 구조 + 3 테스트 헬퍼 + 33-scenario 매트릭스 확정 — v28.0 (Phase 245)
- ✓ Safety: Jito MEV fail-closed + wstETH 채택 + stale calldata re-resolve + API drift 3중 방어 확정 — v28.0 (Phase 245)

- ✓ JupiterSwapActionProvider — IActionProvider 구현, Quote API v1 + /swap-instructions → ContractCallRequest 변환, 5-safety (슬리피지 클램프/priceImpact/Jito MEV/동일 토큰/프로그램 주소) — v28.1 (JUP-01~06)
- ✓ JupiterApiClient — native fetch + Zod 검증, AbortController 10초 타임아웃 — v28.1 (JUP-07~08)
- ✓ packages/actions/ 신규 모노레포 패키지 — ActionApiClient + slippage 유틸리티 + ChainError DeFi 코드 체계 — v28.1 (JUP-09~11)
- ✓ 데몬 자동 등록 — config.toml [actions] 8 keys + registerBuiltInProviders + MCP jupiter_swap 자동 노출 — v28.1 (JUP-12~14)
- ✓ 정책 통합 — 6-stage pipeline CONTRACT_WHITELIST + SPENDING_LIMIT 자동 평가 (코드 변경 0) — v28.1 (JUP-15~17)

- ✓ LidoStakingActionProvider — Lido 컨트랙트 직접 ABI 인코딩, ETH→stETH stake + Withdrawal Queue unstake — v28.4 (LIDO-01~06, PLCY-01~03)
- ✓ JitoStakingActionProvider — SPL Stake Pool 프로그램, SOL→JitoSOL stake/unstake, 순수 TS PDA 유틸 — v28.4 (JITO-01~05)
- ✓ IAsyncStatusTracker — LidoWithdrawalTracker + JitoEpochTracker + STAKING_UNSTAKE_COMPLETED/TIMEOUT 알림 — v28.4 (ASYNC-01~04)
- ✓ Staking API — GET /v1/wallet/staking 포지션 조회 (APY + USD 환산 + pending unstake) — v28.4 (SAPI-01~03)
- ✓ MCP 4 도구 자동 노출 + Admin UI 스테이킹 섹션 + actions.skill.md 문서화 — v28.4 (INTF-01~04)
- ✓ Pipeline gap closure — bridge_status 기록 + actionProvider metadata 영속화 — v28.4 (Phase 257)
- ✓ GasCondition Zod schema + Pipeline Stage 3.5 gas condition check + GAS_WAITING transition — v28.5 (PIPE-01~06, EVAL-01~04)
- ✓ GasConditionTracker (EVM eth_gasPrice/Solana getRecentPrioritizationFees) + 10s cache + daemon executeFromStage4 — v28.5 (WRKR-01~06)
- ✓ TX_GAS_WAITING/TX_GAS_CONDITION_MET/TX_CANCELLED 알림 이벤트 — v28.5 (NOTF-01~03)
- ✓ REST API + Admin Settings 5키 + Admin UI Gas Condition 섹션 — v28.5 (INTF-01~03)
- ✓ MCP 5 tools + TS/Python SDK + ActionProvider gasCondition + skill docs — v28.5 (INTF-04~07)
- ✓ RpcPool round-robin + cooldown + event emission + AdapterPool.withRpcPool() + BUILT_IN_RPC_DEFAULTS 13네트워크 — v28.6 (RPC-01~05)
- ✓ rpc_pool.* Settings 5키 + Admin RPC Endpoints 탭 + hot-reload + RPC health 알림(DEGRADED/ALL_FAILED/RECOVERED) — v28.6 (ADMIN-01~04)
- ✓ BUILTIN_PRESETS 레지스트리(D'CENT 1종) + WalletPreset 타입 + DB v24 wallet_type 마이그레이션 — v28.8 (PRST-01, PRST-03, PRST-04, DB-01)
- ✓ PresetAutoSetupService 4단계 자동 설정 + Settings 스냅샷 롤백 — v28.8 (PRST-02, PRST-05)
- ✓ Owner API wallet_type 필드 확장 + 프리셋 우선 적용 + warning + wallet.skill.md 갱신 — v28.8 (API-01~03)
- ✓ Admin UI Owner 등록 폼 지갑 종류 드롭다운 — v28.8 (ADUI-01)
- ✓ Push Relay ConfigurablePayloadTransformer + config.toml [relay.push.payload] 스키마 + 파이프라인 통합 + bypass — v28.8 (RLAY-01~04)

- ✓ defi_positions 통합 테이블 + DB v25 마이그레이션 + PositionTracker 차등 폴링 + 배치 쓰기 전략 — v29.0 (POS-01~06)
- ✓ IDeFiMonitor 공통 인터페이스 + HealthFactor/Maturity/Margin 3개 모니터 + 4 알림 이벤트 SSoT + 데몬 라이프사이클 — v29.0 (MON-01~07)
- ✓ ILendingProvider(4 actions + 3 queries) + LendingPolicyEvaluator + Aave V3/Kamino/Morpho 매핑 — v29.0 (LEND-01~09)
- ✓ IYieldProvider(5 actions + 3 queries) + MaturityMonitor 만기 관리 + Pendle V2 매핑 — v29.0 (YIELD-01~06)
- ✓ IPerpProvider(5 actions + 3 queries) + PerpPolicyEvaluator 3정책 + MarginMonitor + Drift V2 매핑 — v29.0 (PERP-01~07)
- ✓ SignableOrder EIP-712 + ActionProviderRegistry intent 확장 + 10-step 파이프라인 + 4-layer 보안 모델 — v29.0 (INTENT-01~06)

- ✓ SSoT Enum 확장 (DeFi 알림 이벤트 + 포지션 카테고리/상태) — v29.2
- ✓ ILendingProvider 인터페이스 + Lending 프레임워크 공통 인프라 — v29.2
- ✓ PositionTracker 포지션 추적 서비스 (defi_positions 테이블) — v29.2
- ✓ HealthFactorMonitor 헬스 팩터 모니터링 + LIQUIDATION_WARNING 알림 — v29.2
- ✓ LendingPolicyEvaluator 차입 정책 평가 (LTV, USD 한도) — v29.2 (KINT-07 suffix matching fix in v29.4)
- ✓ AaveV3LendingProvider 구현 (supply/borrow/repay/withdraw) — v29.2
- ✓ KaminoLendingProvider 구현 (Solana supply/borrow/repay/withdraw, HF 시뮬레이션) — v29.4
- ✓ REST API + MCP 도구 + SDK 확장 (포지션/헬스팩터 조회) — v29.2
- ✓ Admin 포트폴리오 뷰 (DeFi 포지션 섹션) — v29.2 (Kamino 통합 v29.4)

- ✓ API 키 이중 저장소 해소 — ApiKeyStore 제거, SettingsService SSoT 통합, DB migration v28 — v29.5
- ✓ Solana 네트워크 ID 통일 — `solana-mainnet` 형식 전 스택 적용, DB migration v29, 레거시 자동 변환 — v29.5
- ✓ Push Relay 서명 응답 릴레이 — POST /v1/sign-response + sendViaRelay() SDK 함수 — v29.5
- ✓ IYieldProvider 인터페이스 + MaturityMonitor + MATURED 포지션 상태 — v29.6
- ✓ PendleYieldProvider — 5 Yield 액션(buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity) + PendleApiClient — v29.6
- ✓ Admin Settings 7키 + MCP 5도구 + actions.skill.md Pendle 섹션 — v29.6

- ✓ D'CENT preset sdk_ntfy 전환 + wallet_type 기반 서명 토픽 라우팅 — v29.7
- ✓ Admin UI Owner 탭 Wallet Type 선택/변경 + approval method 미리보기 + WC 조건부 표시 — v29.7
- ✓ wallet_apps DB 테이블 + WalletAppService CRUD + REST API + signing_enabled 차단 — v29.7
- ✓ Human Wallet Apps Admin UI 최상위 메뉴 (앱 카드, Signing/Alerts 토글, Used by 목록) — v29.7
- ✓ 앱별 알림 토픽 라우팅 (WalletNotificationChannel → waiaas-notify-{app.name}) — v29.7
- ✓ Notifications ntfy 독립 섹션 분리 + Human Wallet Apps 링크 — v29.7

- ✓ IPerpProvider + MarginMonitor + PerpPolicyEvaluator(3정책) + DriftPerpProvider(5액션+mock-first) — v29.8
- ✓ Admin UI Perp 포지션 + MCP 26도구 + actions.skill.md Perp 섹션 — v29.8

- ✓ 무제한 세션 기본값 전환 — per-session TTL/maxRenewals/absoluteLifetime, 기본값 무제한(0) — v29.9
- ✓ JWT exp 조건부 생략 — 무제한 세션 exp 클레임 없는 JWT + RENEWAL_NOT_REQUIRED 갱신 거부 — v29.9
- ✓ Admin Settings 전역 세션 키 3개 삭제 — per-session 설정으로 완전 이동 — v29.9
- ✓ MCP + CLI + SDK + Admin UI + Skill 전 계층 세션 모델 동기화 — v29.9

- ✓ Per-wallet ntfy 토픽 전환 — wallet_apps sign_topic/notify_topic DB 기반, 글로벌 NtfyChannel 제거 — v29.10
- ✓ Admin UI per-wallet 토픽 표시/편집 + admin.skill.md 동기화 — v29.10

- ✓ Transaction Dry-Run — POST /v1/transactions/simulate, 부수 효과 없는 시뮬레이션 — v30.2 (OPS-01)
- ✓ Audit Log Query API — GET /v1/audit-logs, cursor pagination, 20개 이벤트 타입 — v30.2 (OPS-02)
- ✓ Encrypted Backup & Restore — AES-256-GCM 아카이브, REST API + CLI 4 커맨드 — v30.2 (OPS-03)
- ✓ Webhook Outbound — HMAC-SHA256 서명, 재시도 큐, CRUD API 4개 — v30.2 (OPS-04)
- ✓ Admin Stats API — 7 카테고리 JSON 통계, 1분 TTL 캐시 — v30.2 (OPS-05)
- ✓ AutoStop Plugin Architecture — IAutoStopRule 추출, RuleRegistry, Admin API — v30.2 (OPS-06)

- ✓ SmartAccountService — viem toSoladySmartAccount(), CREATE2 주소 예측, EntryPoint v0.7 전용 — v30.6 (SA-01~07)
- ✓ DB Migration v38 — wallets 테이블 account_type/signer_key/deployed/entry_point 4 컬럼, EOA 기본값 — v30.6 (SA-04, SA-05)
- ✓ Admin Settings 25개 — smart_account.enabled feature gate, bundler/paymaster URL, chain overrides — v30.6 (SET-01~06)
- ✓ UserOperation Pipeline — stage5Execute accountType 분기, BundlerClient/PaymasterClient 연동 — v30.6 (UOP-01~13)
- ✓ Paymaster Gas Sponsorship — paymaster_url 연동, rejection 패턴 감지, agent 직접 가스 폴백 — v30.6 (PAY-01~04)
- ✓ BATCH 원자적 실행 — UserOperation calls[] 단일 실행, atomic=true 응답, lazy deployment — v30.6 (UOP-06~09)
- ✓ CLI/SDK/MCP/Admin UI 확장 — --account-type, createWallet(accountType), MCP wallet detail, Admin UI 셀렉터 — v30.6 (INT-01~08)
- ✓ Skill Files 업데이트 — wallet/quickstart/admin 스킬 파일 스마트 어카운트 가이드 추가 — v30.6 (INT-07, INT-08)

- ✓ Per-wallet Provider Model — AA_PROVIDER_NAMES enum, DB v41 4 columns, 23 global settings 제거 — v30.9 (PROV-01~10)
- ✓ Provider Chain Mapping — AA_PROVIDER_CHAIN_MAP(10 networks × 2 providers), 미지원 네트워크 사전 차단 — v30.9 (CMAP-01~03)
- ✓ Agent Self-Service Provider — PUT /v1/wallets/:id/provider dual-auth, wallet ownership 검증 — v30.9 (ASSR-01~04)
- ✓ Provider Status Query — 지갑 응답 provider 필드, connect-info prompt, MCP get_provider_status — v30.9 (STAT-01~05)
- ✓ Admin UI Provider Management — 조건부 필드 노출, dashboard link, detail page inline edit — v30.9 (PROV-06~07, GUID-01~03)
- ✓ AA Default Enabled — smart_account.enabled 기본값 true, AES-256-GCM API key 암호화 — v30.9 (DFLT-01~02, PROV-04)
- ✓ HTTP Message Signing Engine — RFC 9421 Signature Base + RFC 9530 Content-Digest + EIP-191 signing — v30.10 (ENG-01~05, VER-01~02)
- ✓ ERC-8128 REST API + MCP + SDK — POST /v1/erc8128/sign,verify + MCP 2 tools + SDK 3 methods + fetchWithErc8128 — v30.10 (API-01~07)
- ✓ ERC8128_ALLOWED_DOMAINS Policy — default-deny, wildcard matching, per-domain rate limiting — v30.10 (POL-01~04)
- ✓ ERC-8128 Admin Settings + UI — 6 settings keys, Admin UI policy form + system settings, connect-info capability — v30.10 (ADM-01~04, INT-01~04)
- ✓ Admin UI DX 개선 — DeFi/Agent Identity 메뉴 리네임, ERC-8004 토글 통합, Tier 오버라이드 프레임워크 — v30.11
- ✓ NFT 지원 (EVM + Solana) — NFT_TRANSFER 6th type, INftIndexer(Alchemy/Helius), NFT Query API, MCP 3도구 + SDK 3메서드, Admin UI NFT 탭 — v31.0
- ✓ UserOp Build/Sign API — Provider Lite/Full 모드, Build/Sign 엔드포인트, DB v45, MCP 2도구 + SDK 2메서드, Admin UI Lite/Full 배지 — v31.2
- ✓ DCent Swap Aggregator — DcentSwapApiClient(7 endpoints), currency-mapper(CAIP-19↔DCent), DEX Swap+Exchange+auto-router, 4 MCP+SDK methods — v31.3
- ✓ Hyperliquid 생태계 통합 — HyperEVM chain, ApiDirectResult DEX 패턴, Perp(7)+Spot(3)+SubAccount(2) providers, EIP-712 dual signing, 22 MCP+SDK — v31.4
- ✓ Across Protocol 크로스체인 브릿지 — AcrossApiClient(5 endpoints), AcrossBridgeActionProvider(5 actions), SpokePool depositV3, late-bind quote, 2-phase polling tracker, 7 Admin Settings, 4 SDK methods, 110 tests — v31.6
- ✓ E2E 자동 검증 체계 — @waiaas/e2e-tests, 오프체인 스모크 + 온체인 E2E, CI 시나리오 등록 강제 — v31.7
- ✓ Agent UAT — 45개 메인넷 인터랙티브 검증 시나리오, 6-section 표준 포맷, CI 등록 강제 — v31.8
- ✓ Polymarket 예측 시장 통합 — EIP-712 CLOB, CTF Provider(5 actions), Order Provider(5 actions), ApiDirectResult, DB v53-v54, Admin UI 5탭 — v31.9
- ✓ 코드베이스 품질 개선 — parseTokenAmount 통합, SmartAccount 타입 확장, admin.ts 분할, WAIaaSError 통일, 명명 상수 추출 — v31.10
- ✓ External Action 프레임워크 — ResolvedAction 3-kind, ISignerCapability 7-scheme, CredentialVault, VENUE_WHITELIST+ACTION_CATEGORY_LIMIT 정책, Kind-based pipeline, DB v55-v57 — v31.11+v31.12
- ✓ DeFi 포지션 대시보드 — 5개 프로바이더 getPositions(), Admin Dashboard 카테고리 필터+프로바이더 그룹핑+HF 경고 — v31.13
- ✓ EVM RPC 프록시 모드 — CONTRACT_DEPLOY 9th type, POST /v1/rpc-evm, DELAY/APPROVAL Long-poll, 10 signing intercept + 19 passthrough — v31.14
- ✓ Amount 단위 표준화 — 14개 provider smallest-unit 통일, migrateAmount(), MCP typed schema, amountFormatted/humanAmount XOR 파라미터 — v31.15
- ✓ CAIP 표준 식별자 승격 — normalizeNetworkInput CAIP-2 dual-accept, assetId-only 토큰 특정, 모든 응답 chainId/assetId, MCP resolve_asset, 239 tests — v31.16
- ✓ OpenAPI 기반 프론트엔드 타입 자동 생성 — Build-time spec 추출+openapi-typescript, openapi-fetch 타입 안전 클라이언트, 18+ 페이지 마이그레이션, @waiaas/shared 상수, contract test CI 게이트 — v31.17
- ✓ Admin UI IA 재구조화 — 5섹션 헤더 그룹핑, 페이지 리네이밍, 지갑 상세 8→4탭 통합, Ctrl+K 검색 동기화 — v31.18
- ✓ Contract Name Resolution — 4단계 우선순위 동기 해석, well-known 305+ 엔트리, 17 provider displayName, Admin UI 표시 — v32.0
- ✓ 보안 패치 — SSRF 가드 범용화, Rate Limit 3계층, CORS 미들웨어, AutoStop 리스너 정리 — v32.2
- ✓ 타입 안전 + 코드 품질 — `as any` 0건, JSON.parse→Zod safeParse, IChainSubscriber 확장, 레이어 위반 0건 — v32.4
- ✓ 멀티체인 DeFi 포지션 + 테스트넷 토글 — PositionQueryContext 8프로바이더, Lido/Aave/Pendle 멀티체인, DB v59 environment — v32.5
- ✓ 성능 + 구조 개선 — N+1 배치 6곳, sessions/policies 페이지네이션, 4대형 파일 분할, ILogger — v32.6
- ✓ SEO/AEO 최적화 — site/build.mjs ESM, 19 마크다운→HTML, sitemap.xml, JSON-LD, llms-full.txt, FAQ 스키마, GitHub Actions CI — v32.7
- ✓ 테스트 커버리지 강화 — 620+ 신규 테스트, 9/12 패키지 L:90/B:85/F:95 기준 달성, 7개 이슈 해결 — v32.8
- ✓ Push Relay 직접 연동 — ntfy.sh 완전 제거, PushRelaySigningChannel HTTP POST+long-polling, DB v60, NtfyChannel 전량 삭제 — v32.9
- ✓ 에이전트 스킬 정리 + OpenClaw 플러그인 — docs/agent-guides/ 분리, docs/admin-manual/ 9파일, skills/ sessionAuth 전용, @waiaas/openclaw-plugin 17도구, CI/CD 통합, SEO — v32.10

### 활성

<!-- Deferred -->

- [ ] Intent 서명 — EIP-712 SignableOrder + CoW Protocol
- [ ] Morpho Lending — ILendingProvider 3rd 구현체

### 범위 외

- SaaS 버전 (클라우드 호스팅) — Self-Hosted 우선, 클라우드는 추후 확장
- 온체인 스마트 컨트랙트 정책 (Squads 등) — 체인 무관 로컬 정책 엔진 우선
- 모바일 앱 — Desktop/CLI 우선
- ML 기반 이상 탐지 — 규칙 기반으로 시작
- 가격/비즈니스 모델 — 기술 구현 완료 후 별도 검토
- 하드웨어 지갑 직접 연결 (Ledger) — WalletConnect 간접 연결 (D'CENT는 v29.7에서 sdk_ntfy 직접 서명 지원)
- NFT 민팅/마켓플레이스 통합 — Action Provider로 향후 추가 가능
- ERC-7579 모듈 시스템 (Validator/Executor/Hook) — 기본 스마트 어카운트 안정화 후 별도 확장
- 다크 모드 Admin UI — 현재 CSS Variables 기반 향후 확장 가능
- Admin UI 다국어 i18n — 현재 영어 전용

## 컨텍스트

**누적:** 103 milestones (v0.1-v31.17), 416 phases, ~932 plans, ~2,879 requirements, 49 설계 문서(24-79 + m29-00), 10 objective 문서, ~347,156 LOC TS, ~8,050+ 테스트

v0.1~v0.10 설계 완료 (2026-02-05~09). 44 페이즈, 110 플랜, 286 요구사항, 30 설계 문서(24-64).
v1.0 구현 계획 수립 완료 (2026-02-09). 8개 objective 문서, 설계 부채 추적, 문서 매핑 검증.
v1.1 코어 인프라 + 기본 전송 shipped (2026-02-10). 4 페이즈, 12 플랜, 46 요구사항, 10,925 LOC, 281 테스트.
v1.2 인증 + 정책 엔진 shipped (2026-02-10). 6 페이즈, 13 플랜, 35 요구사항, 25,526 LOC, 457 테스트.
v1.3 SDK + MCP + 알림 shipped (2026-02-11). 6 페이즈, 11 플랜, 49 요구사항, 33,929 LOC, 784 테스트.
v1.3.1 Admin Web UI 설계 shipped (2026-02-11). 2 페이즈, 2 플랜, 18 요구사항, 설계 문서 67(10섹션).
v1.3.2 Admin Web UI 구현 shipped (2026-02-11). 5 페이즈, 10 플랜, 22 요구사항, 45,332 LOC, 816 테스트.
v1.3.3 MCP 다중 에이전트 지원 shipped (2026-02-11). 2 페이즈, 2 플랜, 14 요구사항, 44,639 LOC, 847 테스트.
v1.3.4 알림 트리거 + 어드민 알림 패널 shipped (2026-02-12). 3 페이즈, 5 플랜, 18 요구사항, 42,123 LOC, 895 테스트.
v1.4 토큰 + 컨트랙트 확장 shipped (2026-02-12). 6 페이즈, 12 플랜, 35 요구사항, 51,750 LOC, 1,126 테스트.
v1.4.1 EVM 지갑 인프라 + REST API 5-type 통합 + Owner Auth SIWE shipped (2026-02-12). 7 페이즈, 15 플랜, 29 요구사항, 65,074 LOC, 1,313 테스트.
v1.4.2 용어 변경 (agent → wallet) shipped (2026-02-13). 6 페이즈, 11 플랜, 38 요구사항, 56,808 LOC, 1,326 테스트.
v1.4.3 EVM 토큰 레지스트리 + MCP/Admin DX + 버그 수정 shipped (2026-02-13). 5 페이즈, 8 플랜, 13 요구사항, 59,993 LOC, 1,357 테스트.
v1.4.4 Admin Settings + MCP 5-type + Skill Files shipped (2026-02-14). 5 페이즈, 10 플랜, 24 요구사항, 62,296 LOC, 1,467 테스트.
v1.4.5 멀티체인 월렛 모델 설계 shipped (2026-02-14). 4 페이즈, 6 플랜, 19 요구사항, 설계 문서 5개(68-72), 설계 결정 31개.
v1.4.6 멀티체인 월렛 구현 shipped (2026-02-14). 6 페이즈, 13 플랜, 35 요구사항, ~73,000 LOC, 1,580 테스트, 38 설계 결정.
v1.4.7 임의 트랜잭션 서명 API shipped (2026-02-15). 5 페이즈, 12 플랜, 30 요구사항, ~175,480 LOC, 1,636 테스트, 33 설계 결정.
v1.4.8 Admin DX + 알림 개선 shipped (2026-02-15). 5 페이즈, 8 플랜, 28 요구사항, ~178,176 LOC, ~1,618 테스트, 18 설계 결정.
v1.5 DeFi Price Oracle + Action Provider Framework shipped (2026-02-15). 5 페이즈, 14 플랜, 29 요구사항, ~185,000 LOC, 1,848 테스트, 84 설계 결정.
v1.5.1 x402 클라이언트 지원 shipped (2026-02-15). 4 페이즈, 10 플랜, 39 요구사항, ~187,000 LOC, 2,058 테스트, 59 설계 결정.
v1.5.2 Admin UI 정책 폼 UX 개선 shipped (2026-02-16). 2 페이즈, 4 플랜, 24 요구사항, ~188,000 LOC, 2,111 테스트, 7 설계 결정.
v1.5.3 USD 정책 확장 (누적 지출 한도 + 표시 통화) shipped (2026-02-16). 4 페이즈, 8 플랜, 19 요구사항, ~191,000 LOC, ~2,150 테스트.
v1.6 운영 인프라 + 잔액 모니터링 shipped (2026-02-16). 6 페이즈, 14 플랜, 49 요구사항, ~207,902 LOC, ~2,294 테스트, 45 설계 결정.
v1.6.1 WalletConnect Owner 승인 shipped (2026-02-16). 5 페이즈, 10 플랜, 24 요구사항, ~220,000 LOC, ~2,510 테스트, 28 설계 결정.
v1.7 품질 강화 + CI/CD shipped (2026-02-17). 9 페이즈, 19 플랜, 48 요구사항, ~237,000 LOC, 3,509 테스트, 66 설계 결정.
v1.8 업그레이드 + 배포 인프라 shipped (2026-02-17). 5 페이즈, 12 플랜, 30 요구사항, ~124,712 LOC TS, 3,599 테스트, 16 설계 결정.
v2.0 전 기능 완성 릴리스 shipped (2026-02-18). 9 페이즈, 17 플랜, 25 요구사항, ~124,830 LOC TS, ~3,599 테스트, 39 설계 결정.
v2.2 테스트 커버리지 강화 shipped (2026-02-18). 4 페이즈, 6 플랜, 11 요구사항, ~142,639 LOC TS, ~3,880 테스트, 9 설계 결정.
v2.3 Admin UI 기능별 메뉴 재구성 shipped (2026-02-18). 6 페이즈, 11 플랜, 39 요구사항, ~145,784 LOC TS, 31 설계 결정.
v2.4 npm Trusted Publishing 전환 shipped (2026-02-19). 3 페이즈, 4 플랜, 12 요구사항, ~146,464 LOC TS, 7 설계 결정. + 8건 이슈 수정.
v2.4.1 Admin UI 테스트 커버리지 복원 shipped (2026-02-19). 3 페이즈, 5 플랜, 22 요구사항, ~151,015 LOC TS, ~186 신규 테스트.
v2.5 DX 품질 개선 shipped (2026-02-19). 4 페이즈, 8 플랜, 23 요구사항, 58 파일 변경, +3,333/-192 lines, 34 커밋.
v2.6 Wallet SDK 설계 shipped (2026-02-20). 4 페이즈, 7 플랜, 23 요구사항, 55 파일 변경, +10,435/-324 lines, 33 커밋, 34 설계 결정, 설계 문서 3개 신규(73/74/75) + 4개(35/37/25/67) 갱신.
v2.6.1 WAIaaS Wallet Signing SDK shipped (2026-02-20). 4 페이즈, 13 플랜, 27 요구사항, 206 파일 변경, +16,137/-332 lines, 67 커밋, 43 설계 결정.
v2.7 지갑 앱 알림 채널 shipped (2026-02-20). 1 페이즈, 4 플랜, 16 요구사항, 34 파일 변경, +3,722/-91 lines, 6 설계 결정.
v26.3 Push Relay Server shipped (2026-02-20). 3 페이즈, 8 플랜, 25 요구사항, 45 파일 변경, +2,589/-26 lines, 6 설계 결정. @waiaas/push-relay 신규 패키지.
v26.4 멀티 지갑 세션 + 에이전트 자기 발견 shipped (2026-02-21). 5 페이즈, 15 플랜, 30 요구사항, ~145,704 LOC TS, 4,396+ 테스트, 5 설계 결정.
v27.0 수신 트랜잭션 모니터링 설계 shipped (2026-02-21). 9 페이즈, 16 플랜, 29 요구사항, 101 파일 변경, +8,058/-2,158 lines, 26 설계 결정. 설계 문서 76(~2,300줄, 8섹션).
v27.1 수신 트랜잭션 모니터링 구현 shipped (2026-02-22). 7 페이즈, 18 플랜, 30 요구사항, 189 파일 변경, +23,969/-5,834 lines, 102 커밋, ~155,540 LOC TS. Known gap: STO-03 (Confirmation Worker RPC 콜백 미주입).
v27.2 CAIP-19 자산 식별 표준 shipped (2026-02-22). 4 페이즈, 9 플랜, 31 요구사항, 135 파일 변경, +12,997/-2,406 lines, 62 커밋, ~157,584 LOC TS.
v27.3 토큰별 지출 한도 정책 shipped (2026-02-22). 4 페이즈, 7 플랜, 27 요구사항, 35 파일 변경, +4,809/-104 lines, 29 커밋, ~158,416 LOC TS.
v27.4 Admin UI UX 개선 shipped (2026-02-23). 5 페이즈, 9 플랜, 32 요구사항, 51 파일 변경, +6,177/-577 lines, ~186,724 LOC TS. 30 설계 결정.
v28.0 기본 DeFi 프로토콜 설계 shipped (2026-02-23). 2 페이즈, 5 플랜, 25 요구사항, 60 파일 변경, +6,451/-530 lines, 24 커밋, 59 설계 결정. 설계 문서 m28-00(~1,595줄). Tech debt: m28-03/04/05 objective 파일 업데이트 필요.
v28.1 Jupiter Swap shipped (2026-02-23). 2 페이즈, 6 플랜, 17 요구사항, 63 파일 변경, +2,972/-1,721 lines, 16 커밋, ~187,250 LOC TS, 4,975 테스트.
v28.5 가스비 조건부 실행 shipped (2026-02-25). 2 페이즈, 4 플랜, 25 요구사항, 84 파일 변경, +5,646/-110 lines, 38 커밋, ~190,000 LOC TS, 17 설계 결정.
v28.6 RPC Pool 멀티엔드포인트 로테이션 shipped (2026-02-25). 5 페이즈, 25 요구사항, 49 커밋, +9,493 lines.
v28.8 빌트인 지갑 프리셋 자동 설정 shipped (2026-02-26). 3 페이즈, 6 플랜, 14 요구사항, 56 파일 변경, +4,952/-262 lines, 29 커밋, ~180,194 LOC TS, 42 신규 테스트, 12 설계 결정.
v29.0 고급 DeFi 프로토콜 설계 shipped (2026-02-26). 6 페이즈, 12 플랜, 38 요구사항, 59 설계 결정, 설계 문서 m29-00(26섹션).
v29.2 EVM Lending -- Aave V3 shipped (2026-02-27). 5 페이즈, 15 플랜, 34 요구사항, 109 커밋, 281 파일, +45,864/-1,159 lines. DeFi Lending 프레임워크 + Aave V3 Provider.
v29.3 기본 지갑/기본 네트워크 개념 제거 shipped (2026-02-27). 4 페이즈, 10 플랜, 72 요구사항, 231 파일, +6,200/-2,354 lines.
v29.4 Solana Lending (Kamino) shipped (2026-02-28). 2 페이즈, 9 플랜, 21 요구사항, 61 파일 변경, +6,771/-206 lines, 21 커밋, ~192,843 LOC TS, 83 신규 테스트, 7 설계 결정.
v29.5 내부 일관성 정리 shipped (2026-02-28). 3 페이즈, 7 플랜, 18 요구사항, 156 파일 변경, +3,990/-1,220 lines, 23 커밋, ~223,044 LOC TS, 5 설계 결정.
v29.6 Pendle Yield Trading + Yield 프레임워크 shipped (2026-03-01). 3 페이즈, 8 플랜, 18 요구사항, 50 파일 변경, +3,940/-107 lines, 14 커밋, ~225,248 LOC TS, 4 설계 결정.
v29.7 D'CENT 직접 서명 + Human Wallet Apps 통합 shipped (2026-03-01). 6 페이즈, 11 플랜, 40 요구사항, 73 파일 변경, +7,424/-428 lines, 40 커밋, 7 설계 결정. wallet_apps DB 테이블(migration v31), Human Wallet Apps Admin UI 최상위 메뉴.
v29.8 Solana Perp DEX (Drift) + Perp 프레임워크 shipped (2026-03-02). 3 페이즈, 7 플랜, 22 요구사항, 133 신규 테스트. IPerpProvider+MarginMonitor+PerpPolicyEvaluator Perp 프레임워크.
v29.9 세션 점진적 보안 모델 shipped (2026-03-02). 2 페이즈, 14 플랜, 25 요구사항, ~233,440 LOC TS. per-session TTL/maxRenewals/absoluteLifetime, 무제한 기본값.
v31.14 EVM RPC 프록시 모드 shipped (2026-03-13). 4 페이즈, 11 플랜, 49 요구사항, 82 파일 변경, +9,485/-190 lines, 31 커밋, ~292,079 LOC TS, ~189 신규 테스트, 10 설계 결정.
v31.13 DeFi 포지션 대시보드 완성 shipped (2026-03-12). 5 페이즈, 8 플랜, 27 요구사항, 44 파일 변경, +5,985/-139 lines, 28 커밋, ~188 테스트.
v31.12 External Action 프레임워크 구현 shipped (2026-03-12). 7 페이즈, 15 플랜, 60 요구사항, 144 파일 변경, +15,780/-263 lines, 57 커밋, ~219 신규 테스트.
v31.11 External Action 프레임워크 설계 shipped (2026-03-12). 6 페이즈, 11 플랜, 34 요구사항, 60 파일 변경, 36 설계 결정, doc-81.
v31.10 코드베이스 품질 개선 shipped (2026-03-11). 5 페이즈, 8 플랜, 16 요구사항, 89 파일 변경, +6,742/-3,472 lines.
v31.9 Polymarket 예측 시장 통합 shipped (2026-03-11). 5 페이즈, 14 플랜, 29 요구사항, 93 파일 변경, +10,363 lines, ~235 테스트.
v31.8 Agent UAT shipped (2026-03-10). 5 페이즈, 12 플랜, 56 요구사항, 89 파일 변경, +10,962 lines, 45 시나리오.
v31.7 E2E 자동 검증 체계 shipped (2026-03-09). 8 페이즈, 21 플랜, 47 요구사항, 122 파일 변경, +12,359 lines.
v29.10 ntfy 토픽 지갑별 설정 전환 shipped (2026-03-02). 2 페이즈, 4 플랜, 21 요구사항, 43 파일 변경, +2,877/-138 lines, 20 커밋, 8 설계 결정. wallet_apps sign_topic/notify_topic DB 기반 토픽 관리(migration v33), 글로벌 NtfyChannel 제거, Admin UI per-wallet 토픽 편집.

**기술 스택 (v0.2 확정, v1.4.1 구현 검증):**
- Runtime: Node.js 22 LTS (ESM-only)
- Server: OpenAPIHono 4.x (@hono/zod-openapi)
- DB: SQLite (better-sqlite3) + Drizzle ORM
- Crypto: sodium-native (guarded memory), argon2 (KDF)
- Auth: jose (JWT HS256), sodium-native (Ed25519 ownerAuth)
- Chain: @solana/kit 6.0.1 + @solana-program/token (Solana), viem 2.x (EVM, @waiaas/adapter-evm 구현)
- SDK: @waiaas/sdk (TS, 0 의존성), waiaas (Python, httpx + Pydantic v2)
- MCP: @waiaas/mcp (@modelcontextprotocol/sdk, stdio transport)
- Build: pnpm workspace + Turborepo, tsc only
- Test: Vitest (forks pool for sodium mprotect) + v8 coverage + msw 2.x (mock HTTP)
- Schema: Zod SSoT → TypeScript → OpenAPI → Drizzle CHECK
- Admin: Preact 10.x + @preact/signals + Vite 6.x, @testing-library/preact
- 미구현: Tauri

**설계 문서:** 48개 (24-76 + m29-00) + 대응표/테스트 전략/objective

### 알려진 이슈

- Node.js SEA + native addon (sodium-native, better-sqlite3) 크로스 컴파일 호환성 미검증 (v0.7 prebuildify 전략 설계 완료)
- @solana/kit 실제 버전 6.0.1 (설계서는 3.x 언급, API 동일)
- Pre-existing flaky lifecycle.test.ts (timer-sensitive BackgroundWorkers test) — not blocking
- Pre-existing e2e-errors.test.ts failure (expects 404, gets 401) — OpenAPIHono 전환 side effect
- Pre-existing 3 CLI E2E failures (E-07, E-08, E-09) — daemon-harness uses old adapter: param, not adapterPool:
- Kill Switch 3-state DB 저장 (v1.6에서 DB v14 마이그레이션 완료, CAS ACID 패턴)
- BUG-013~016 RESOLVED in v1.4.3 (Admin MCP 토큰, EVM getAssets, EVM confirmation timeout, 패키지 버전)
- STO-03: Confirmation Worker RPC 콜백(getBlockNumber, checkSolanaFinalized) 미주입 — DETECTED→CONFIRMED 상태 전환 미작동 (v27.1 known gap, 다음 마일스톤에서 수정)

## 제약사항

- **배포**: Self-Hosted 전용 — 중앙 서버 의존 없이 사용자 로컬에서 완전 동작
- **보안**: 체인 무관(Chain-Agnostic) — 특정 블록체인 프로토콜에 의존하지 않는 보안 모델
- **블록체인**: Solana 1순위, EVM 2순위 — ChainAdapter로 추상화
- **언어**: 모든 기획 문서 한글 작성
- **의사결정 방식**: 질문 최소화, 직접 판단하여 최선의 방법 제시

## 주요 결정

| 결정 | 근거 | 결과 |
|------|------|------|
| Solana 우선 타겟 | 빠른 속도, 낮은 수수료, AI 에이전트 생태계 활발 | ✓ Good |
| API 우선 설계 | 에이전트는 UI가 아닌 API로 상호작용 | ✓ Good |
| Hono + SQLite (v0.2 전환) | Self-Hosted 경량화, 외부 의존 최소화 | ✓ Good |
| Dual Key 아키텍처 | Owner(통제) + Agent(자율) 역할 분리, defense-in-depth | ✓ Good |
| Cloud → Self-Hosted 전환 | 서비스 제공자 의존 제거, 사용자 완전 통제 | ✓ Good |
| 3계층 보안 (세션→시간지연→모니터링) | 다층 방어, 키 유출 시에도 피해 최소화 | ✓ Good |
| 체인 무관 정책 엔진 | Squads 등 온체인 의존 제거, 모든 체인에 동일 보안 | ✓ Good |
| 세션 기반 에이전트 인증 | 영구 키 대신 단기 JWT, 유출 시 만료로 자동 무효화 | ✓ Good |
| Zod SSoT | 스키마 → 타입 + OpenAPI + 런타임 검증 통합 | ✓ Good |
| masterAuth/ownerAuth 책임 분리 | Owner 서명은 자금 영향 시에만 요구 | ✓ Good — v1.2 구현 검증 |
| Owner 선택적 등록 (3-State) | 자율 에이전트 시나리오 지원, 초기 마찰 제거 | ✓ Good — v1.2 구현 검증 |
| APPROVAL→DELAY 다운그레이드 | Owner 없어도 차단 없이 DELAY로 대체 | ✓ Good — v1.2 구현 검증 |
| tsc only (빌드 도구 불필요) | ESM 단일 출력, 번들러 불필요 | ✓ Good — v1.1 구현 |
| jose for JWT HS256 | ESM-native, Buffer.from(hex) 대칭키 | ✓ Good — v1.2 구현 |
| BigInt for amount comparisons | floating point 정밀도 이슈 방지 | ✓ Good — v1.2 구현 |
| BEGIN IMMEDIATE + reserved_amount | TOCTOU 방지, SQLite 동시 정책 평가 | ✓ Good — v1.2 구현 |
| resolveOwnerState 순수 함수 | DB 비저장, 런타임 파생, 재사용 가능 | ✓ Good — v1.2 구현 |
| PIPELINE_HALTED 에러 코드 | DELAY/APPROVAL 의도적 중단 표현 (409) | ✓ Good — v1.2 구현 |
| ownerAuth 성공 시 자동 GRACE→LOCKED | 별도 전이 엔드포인트 불필요 | ✓ Good — v1.2 구현 |
| server-level auth middleware | sub-router 레벨 대신 app.use() 적용 | ✓ Good — v1.2 구현 |
| IChainAdapter 저수준 유지 | DeFi 지식은 Action Provider에 분리 | ✓ Good — v0.6 설계 |
| resolve-then-execute 패턴 | Action Provider가 요청 생성 → 파이프라인 실행 | ✓ Good — v0.6 설계 |
| config.toml 중첩 금지 | WAIAAS_{SECTION}_{KEY} 1:1 매핑 | ✓ Good — v0.7 해소 |
| SQLite 타임스탬프 초 단위 | UUID v7 ms가 동일 초 내 순서 보장 | ✓ Good — v0.7 해소 |
| OpenAPIHono 전면 전환 | Zod SSoT → OpenAPI 자동 생성, 타입 안전 라우팅 | ✓ Good — v1.3 구현 |
| @hono/zod-openapi v0.19.10 | v1.x는 zod@^4.0.0 필요, 프로젝트는 zod@3.x | ✓ Good — v1.3 구현 |
| TS SDK 0 외부 의존성 | Node.js 22 내장 fetch, 번들 크기 최소화 | ✓ Good — v1.3 구현 |
| Python SDK httpx + Pydantic v2 | 비동기 HTTP + 타입 안전 모델 | ✓ Good — v1.3 구현 |
| MCP SessionManager eager init | 서버 시작 시 즉시 토큰 로드 + 갱신 타이머 | ✓ Good — v1.3 구현 |
| 알림 채널 native fetch | 외부 Bot 프레임워크 미사용, 의존성 최소화 | ✓ Good — v1.3 구현 |
| Error hint resolveHint() | AI 에이전트 자율 복구용 32개 hint 매핑 | ✓ Good — v1.3 구현 |
| 커서 페이지네이션 UUID v7 | createdAt 대신 ID 컬럼 사용, 순서 보장 | ✓ Good — v1.3 구현 |
| Admin UI masterAuth only (JWT 미사용) | 관리 도구 저빈도 요청, Argon2id 300ms/req 허용 | ✓ Good — v1.3.1 설계 |
| Preact 10.x (3KB gzip) + @preact/signals | 경량 SPA, React 호환 API, 시그널 기반 상태 관리 | ✓ Good — v1.3.1 설계 |
| CSP default-src 'none' + CSRF 토큰 불필요 | 가장 엄격한 CSP 기본값, 커스텀 헤더로 CSRF 방어 | ✓ Good — v1.3.1 설계 |
| 클라이언트 검증 Zod 미임포트 | ~13KB gzip 절약, 빌드 커플링 제거 | ✓ Good — v1.3.1 설계 |
| 68 에러 코드 전체 매핑 | Admin UI 미사용 코드 포함, 향후 견고성 확보 | ✓ Good — v1.3.1 설계 |
| All Preact/Vite deps as devDependencies | 빌드 타임만 필요, 런타임 번들에 미포함 | ✓ Good — v1.3.2 구현 |
| CSP default-src 'none' 최엄격 정책 | XSS 방어 극대화, script-src/style-src/img-src 'self' 개별 허용 | ✓ Good — v1.3.2 구현 |
| Custom hash routing (@preact/signals) | preact-router 의존 제거, hashchange 이벤트 + signal 단순 구현 | ✓ Good — v1.3.2 구현 |
| Preact signal reset via beforeEach | module-level signals 테스트 격리, 상태 누수 방지 | ✓ Good — v1.3.2 구현 |
| Type-to-confirm 데몬 종료 패턴 | 실수 방지, "SHUTDOWN" 입력 필수 | ✓ Good — v1.3.2 구현 |
| isInitialLoad 패턴 (스켈레톤 vs 스테일 데이터) | 첫 로드만 스켈레톤, 이후 폴링은 stale 데이터 위 에러 표시 | ✓ Good — v1.3.2 구현 |
| 프로세스 분리 방식 (에이전트당 MCP 서버 1개) | MCP 프로토콜 표준 부합, 서버 단위 capability 노출 | ✓ Good — v1.3.3 구현 |
| mcp-tokens/<agentId> 서브디렉토리 격리 | 동일 디렉토리 파일명 패턴보다 깨끗한 분리 | ✓ Good — v1.3.3 구현 |
| AgentContext DI 패턴 (글로벌 상태 아님) | 테스트 용이, 모듈 간 의존 최소화 | ✓ Good — v1.3.3 구현 |
| CLI 토큰 경로 항상 mcp-tokens/<agentId> | 단일 에이전트도 새 경로 사용, 일관성 확보 | ✓ Good — v1.3.3 구현 |
| toSlug + resolveSlugCollisions 유틸리티 | 에이전트 이름→config-safe 키 변환, 충돌 시 agentId 접미사 | ✓ Good — v1.3.3 구현 |
| schema_version 테이블로 DB 마이그레이션 추적 | INTEGER PK 버전 순서, MIG-01~06 준수 | ✓ Good — v1.3.4 구현 |
| fire-and-forget notify() 패턴 (void + optional chaining) | 알림이 파이프라인 실행을 차단하지 않음, 역방향 호환 | ✓ Good — v1.3.4 구현 |
| 어드민 UI 알림 설정 읽기 전용 | config.toml SSoT 유지, 설정 변경은 파일 직접 수정 | ✓ Good — v1.3.4 구현 |
| credential 마스킹 (boolean enabled만 반환) | bot token/webhook URL 미노출, 보안 원칙 준수 | ✓ Good — v1.3.4 구현 |
| getChannels() + channel.send() 직접 호출 (테스트 발송) | rate limiter 우회, notify() 수정 불필요 | ✓ Good — v1.3.4 구현 |
| Drizzle count() + offset/limit 페이지네이션 | 알림 로그 역순 조회, 간단하고 효과적 | ✓ Good — v1.3.4 구현 |
| ChainError extends Error (not WAIaaSError) | chain adapter 내부 에러, Stage 5에서 WAIaaSError 변환 | ✓ Good — v1.4 구현 |
| ChainError 3-카테고리 retryable 자동 파생 | category !== 'PERMANENT' → retryable, 일관된 재시도 로직 | ✓ Good — v1.4 구현 |
| schema_version 기반 증분 마이그레이션 | ALTER TABLE only, DB 삭제 금지, MIG-01~06 준수 | ✓ Good — v1.4 구현 |
| discriminatedUnion 5-type (type 필드 기반) | TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH 자동 식별 | ✓ Good — v1.4 구현 |
| 기본 거부 정책 원칙 (ALLOWED_TOKENS/CONTRACT_WHITELIST/APPROVED_SPENDERS) | 정책 미설정 시 deny, opt-in 화이트리스트 | ✓ Good — v1.4 구현 |
| Gas safety margin (estimatedGas * 120n) / 100n | BigInt 산술로 1.2x 배수, 모든 build 메서드 일관 적용 | ✓ Good — v1.4 구현 |
| viem 에러 메시지 패턴 매칭 (mapError 헬퍼) | typed error 미제공 대응, ChainError 자동 분류 | ✓ Good — v1.4 구현 |
| Token-2022 mint account owner 필드 감지 | SPL_TOKEN_PROGRAM_ID vs TOKEN_2022_PROGRAM_ID 판별 | ✓ Good — v1.4 구현 |
| evaluateBatch 2단계 (개별 + 합산) | 소액 분할 우회 방지, All-or-Nothing | ✓ Good — v1.4 구현 |
| CONC-01 TRANSIENT retry rebuilds from Stage 5a | 단순한 루프 구조, build/sign은 로컬 ops | ✓ Good — v1.4 구현 |
| buildByType 5-type adapter 라우팅 | type별 IChainAdapter 메서드 디스패치 | ✓ Good — v1.4 구현 |
| sleep() extracted to pipeline/sleep.ts | vi.mock 테스트 가능성, 모듈 레벨 분리 | ✓ Good — v1.4 구현 |
| chain='ethereum' EVM 전체 포괄 | ChainType enum 확장 없이 EVM 호환 체인 지원 | ✓ Good — v1.4.1 구현 |
| AdapterPool lazy init + 캐싱 | 데몬 시작 시 전체 초기화 아닌 요청 시 생성 | ✓ Good — v1.4.1 구현 |
| Route schema separation 방안 C | OpenAPI doc과 실제 Zod 검증 분리, stage1Validate SSoT | ✓ Good — v1.4.1 구현 |
| SIWE nonce 미검증 | Solana owner-auth 일관성, expirationTime 의존 | ✓ Good — v1.4.1 구현 |
| SIWE message base64 인코딩 | 멀티라인 EIP-4361 HTTP 헤더 호환 | ✓ Good — v1.4.1 구현 |
| managesOwnTransaction 마이그레이션 플래그 | 테이블 재생성 시 자체 PRAGMA/트랜잭션 관리 | ✓ Good — v1.4.1 구현 |
| EVM_CHAIN_MAP Record<EvmNetworkType> | 컴파일 타임 완전성 보장, 네트워크 누락 방지 | ✓ Good — v1.4.1 구현 |
| 엔티티 이름 wallet 확정 | 서비스명 WaaS와 일치, 관리 대상의 실체(지갑) 반영 | ✓ Good — v1.4.2 구현 |
| API v1 유지 (breaking change) | 외부 소비자 없음 (self-hosted 내부), 깔끔하게 일괄 변경 | ✓ Good — v1.4.2 구현 |
| 하위 호환 shim 미제공 | 외부 배포 전이므로 불필요, deprecated alias 없이 직접 변경 | ✓ Good — v1.4.2 구현 |
| MCP 기존 토큰 폐기 + 재설정 안내 | JWT claim 변경(agt→wlt)으로 기존 토큰 자동 무효화 | ✓ Good — v1.4.2 구현 |
| AI agent 개념 참조 보존 | 설계 문서에서 코드 식별자만 rename, AI agent 설명은 유지 | ✓ Good — v1.4.2 구현 |
| 한국어 용어 에이전트→지갑 (관리 엔티티) | AI agent 개념은 에이전트 유지, 관리 대상은 지갑으로 변경 | ✓ Good — v1.4.2 구현 |
| 내장 토큰 레지스트리 merge layer | DB custom + built-in 병합, custom 우선, source 필드 구분 | ✓ Good — v1.4.3 구현 |
| 레지스트리 ≠ 전송 허용 역할 분리 | 레지스트리(UX 조회용) vs ALLOWED_TOKENS(보안 전송 허용) 분리 | ✓ Good — v1.4.3 구현 |
| waitForConfirmation never throws | fallback receipt 조회, return-value 3-way branching | ✓ Good — v1.4.3 구현 |
| POST /v1/mcp/tokens 원스톱 프로비저닝 | 세션 + 토큰 파일 + Claude Desktop config 단일 응답 | ✓ Good — v1.4.3 구현 |
| tag-release.sh 모노레포 버전 관리 | jq in-place + git tag + git commit 일괄 처리 | ✓ Good — v1.4.3 구현 |
| duck-typing adapter 감지 (getAssets) | instanceof 대신 메서드 존재 확인으로 registry 주입 | ✓ Good — v1.4.3 구현 |
| HKDF(SHA-256) settings 암호화 | Argon2id 대비 경량, 빈번한 읽기에 적합 | ✓ Good — v1.4.4 구현 |
| Settings fallback 체인 (DB>config>env>default) | DaemonConfig 재활용, importFromConfig 자동 | ✓ Good — v1.4.4 구현 |
| HotReloadOrchestrator prefix/set 분류 | 알림/RPC/보안 3개 서브시스템별 reload 액션 | ✓ Good — v1.4.4 구현 |
| MCP Feature Parity 원칙 (MCPSDK-04 철회) | MCP/SDK/API 동일 공격 면적, 정책 엔진이 보안 담당 | ✓ Good — v1.4.4 구현 |
| 스킬 파일 5개 분리 (단일 파일 대체) | 컨텍스트 윈도우 절약, 용도별 로드 | ✓ Good — v1.4.4 구현 |
| EnvironmentType 2값 하드코딩 (testnet/mainnet) | 제3 환경 수요 없음, YAGNI 원칙 | ✓ Good — v1.4.5 설계 |
| 환경-네트워크 매핑 순수 함수 (DB 조회 없음) | 13 NETWORK_TYPES 하드코딩 가능, 성능 우선 | ✓ Good — v1.4.5 설계 |
| default_network nullable (NULL=환경 기본값) | 사용자 미지정 시 환경 기본값 자동 사용 | ✓ Good — v1.4.5 설계 |
| DB 마이그레이션 2단계 분리 (v6a ADD COLUMN, v6b 12-step 재생성) | 의존 순서 명확, 실패 시 개별 롤백 | ✓ Good — v1.4.5 설계 |
| resolveNetwork() 순수 함수 (클래스 아님) | 테스트 용이, 모듈 분리 | ✓ Good — v1.4.5 설계 |
| ENVIRONMENT_NETWORK_MISMATCH 별도 에러 코드 | TX 도메인 명확한 에러 분류 | ✓ Good — v1.4.5 설계 |
| ALLOWED_NETWORKS permissive default | 기존 월렛 하위호환, opt-in 제한 | ✓ Good — v1.4.5 설계 |
| policies.network DB 컬럼 (not rules JSON) | SQL 쿼리 최적화 | ✓ Good — v1.4.5 설계 |
| REST API environment optional + deriveEnvironment fallback | breaking change 방지 | ✓ Good — v1.4.5 설계 |
| MCP network "omit for default" 패턴 | LLM 혼란 방지 | ✓ Good — v1.4.5 설계 |
| quickstart 에러 시 rollback 없음 (멱등성) | 복잡성 감소, 재실행으로 해결 | ✓ Good — v1.4.5 설계 |
| EnvironmentType Zod SSoT chain.ts 배치 | 기존 SSoT와 동일 위치, 코드 응집도 | ✓ Good — v1.4.6 구현 |
| ALLOWED_NETWORKS permissive default 구현 | 기존 월렛 하위호환, ALLOWED_TOKENS과 반대 철학 | ✓ Good — v1.4.6 구현 |
| resolveNetwork() 순수 함수 별도 파일 | stages.ts 비대 방지, 테스트 용이 | ✓ Good — v1.4.6 구현 |
| ENVIRONMENT_NETWORK_MISMATCH 별도 에러 코드 | 보안 중요도 높은 에러 명시적 분류 | ✓ Good — v1.4.6 구현 |
| 4단계 override 우선순위 (wallet+network > wallet+null > global+network > global+null) | 가장 구체적인 정책이 우선, 직관적 | ✓ Good — v1.4.6 구현 |
| evaluateAndReserve raw SQL network 바인딩 | Drizzle ORM 제약 우회, 성능 최적화 | ✓ Good — v1.4.6 구현 |
| daemon.ts tx.network DB 값 직접 사용 | Stage 5 재실행 시 안전성 보장 | ✓ Good — v1.4.6 구현 |
| GET /networks 응답 isDefault 플래그 | 클라이언트 기본 네트워크 시각적 표시 | ✓ Good — v1.4.6 구현 |
| get_wallet_info 파라미터 없는 MCP 도구 | address + networks 2단계 API 호출 조합 | ✓ Good — v1.4.6 구현 |
| Python SDK keyword-only network 파라미터 | 기존 positional args 하위호환 유지 | ✓ Good — v1.4.6 구현 |
| quickstart buildConfigEntry 인라인 복제 | 공통 유틸 추출은 scope 외, YAGNI | ✓ Good — v1.4.6 구현 |
| DELAY/APPROVAL tier sign-only 즉시 거부 | 동기 API에서 blockhash/nonce 만료 위험 | ✓ Good — v1.4.7 구현 |
| 파싱 실패 = DENY 원칙 | 알려진 패턴만 통과, 보안 기본값 | ✓ Good — v1.4.7 구현 |
| ParsedOperationType 5종 | NATIVE_TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/UNKNOWN | ✓ Good — v1.4.7 구현 |
| sign-only 파이프라인 별도 모듈 분리 | stages.ts 수정 없음, 독립 모듈 | ✓ Good — v1.4.7 구현 |
| reservation SUM 쿼리에 SIGNED 포함 | 이중 지출 방지, TOCTOU 일관성 | ✓ Good — v1.4.7 구현 |
| settingsService 선택적 3번째 파라미터 DI | 하위 호환, null-safe 패턴 | ✓ Good — v1.4.7 구현 |
| skills 라우트 public (인증 불필요) | nonce/health와 동일 레벨 | ✓ Good — v1.4.7 구현 |
| ResourceTemplate list callback 정적 나열 | VALID_SKILLS 배열 기반, 동적 조회 불필요 | ✓ Good — v1.4.7 구현 |
| SKILL_NOT_FOUND SYSTEM 도메인 배치 | 스킬은 시스템 리소스 | ✓ Good — v1.4.7 구현 |
| pushSchema 3-step 순서 (tables→migrations→indexes) | 인덱스가 최신 컬럼 참조, 마이그레이션 후 생성해야 안전 | ✓ Good — v1.4.8 구현 |
| createShutdownHandler 팩토리 패턴 | DI exit 함수 주입으로 테스트 가능, idempotent once guard | ✓ Good — v1.4.8 구현 |
| 세션 스코프 PUT /v1/wallet/default-network | MCP sessionAuth로 기본 네트워크 변경, masterAuth 미러링 | ✓ Good — v1.4.8 구현 |
| getAllBalances()/getAllAssets() 별도 메서드 | 반환 타입 다름, 타입 안전성 우선 | ✓ Good — v1.4.8 구현 |
| Promise.allSettled 부분 실패 패턴 | 환경 내 네트워크별 병렬 RPC, 성공/실패 각각 표시 | ✓ Good — v1.4.8 구현 |
| Slack Incoming Webhook attachments 형식 | Block Kit 대신 범용 호환성 우선 | ✓ Good — v1.4.8 구현 |
| notification_logs.message nullable TEXT | pre-v10 로그 하위호환 보장 | ✓ Good — v1.4.8 구현 |
| Pyth Primary + CoinGecko Fallback (Chainlink 제거) | Pyth 380+ 피드 체인 무관, EVM 전용 불필요 | ✓ Good — v1.5 구현 |
| PriceResult 3-state discriminated union | success/oracleDown/notListed로 "가격 불명 ≠ 가격 0" 보안 원칙 | ✓ Good — v1.5 구현 |
| evaluateAndReserve 진입 전 Oracle HTTP 호출 | better-sqlite3 동기 트랜잭션 내 비동기 호출 불가 | ✓ Good — v1.5 구현 |
| 신규 외부 npm 의존성 0개 | Pyth/CoinGecko native fetch, LRU 직접 구현, 암호화 settings-crypto 재사용 | ✓ Good — v1.5 구현 |
| IActionProvider resolve-then-execute ESM 플러그인 | ContractCallRequestSchema Zod 재검증으로 정책 우회 차단 | ✓ Good — v1.5 구현 |
| ActionProviderRegistry infrastructure/action/ 배치 | 기존 컨벤션 준수 (설계 문서 services/ 대신) | ✓ Good — v1.5 구현 |
| MCP 도구명 action_{provider}_{action} | 기존 14개 내장 도구와 네임스페이스 충돌 방지 | ✓ Good — v1.5 구현 |
| fire-and-forget 패턴 registerActionProviderTools | 실패 시에도 MCP 서버 정상 동작, degraded mode | ✓ Good — v1.5 구현 |
| OracleChain 캐시 전담 (Oracle 개별 캐시 미관리) | 단일 캐시 레이어로 일관된 TTL/LRU 관리 | ✓ Good — v1.5 구현 |
| 교차 검증 CoinGecko DI 주입 시에만 활성화 | 키 미설정 → fallback 미주입 → 자동 스킵 | ✓ Good — v1.5 구현 |
| @x402/core 단일 의존성 추가 | Zod SSoT 호환, PaymentRequirements/PaymentPayload 재정의 불필요 | ✓ Good — v1.5.1 구현 |
| SSRF 가드 자체 구현 (node:dns + node:net) | 외부 라이브러리 CVE 회피, RFC 5735/6890 전체 범위 차단 | ✓ Good — v1.5.1 구현 |
| x402-handler 독립 파이프라인 | 기존 6-stage 미확장, sign-only 패턴 참조한 별도 오케스트레이션 | ✓ Good — v1.5.1 구현 |
| DELAY/APPROVAL 즉시 거부 (x402) | 동기 HTTP에서 Owner 승인 대기 불가 | ✓ Good — v1.5.1 구현 |
| IChainAdapter 미경유 결제 서명 | EIP-3009 typed data 서명은 IChainAdapter 책임 외 | ✓ Good — v1.5.1 구현 |
| X402_ALLOWED_DOMAINS DatabasePolicyEngine 외부 모듈 | 독립 평가 로직, 정책 엔진 수정 최소화 | ✓ Good — v1.5.1 구현 |
| USDC $1 직접 환산 + 비-USDC IPriceOracle | USDC 안정성 활용, 오라클 호출 최소화 | ✓ Good — v1.5.1 구현 |
| parse402Response + selectPaymentRequirement + signPayment 직접 조합 | handleX402Fetch 단일 함수 대신 조합 가능한 빌딩 블록 | ✓ Good — v1.5.1 구현 |
| POLICY_RULES_SCHEMAS Partial→Record 전환 | 12개 전체 등록, 타입 안전성 강화 | ✓ Good — v1.5.2 구현 |
| PolicyFormRouter switch/case 타입별 분기 | 12개 타입 독립 폼 컴포넌트, 확장 용이 | ✓ Good — v1.5.2 구현 |
| DynamicRowList generic T 재사용 컴포넌트 | renderRow 콜백 패턴으로 다양한 행 형태 지원 | ✓ Good — v1.5.2 구현 |
| chain/network 옵션 로컬 상수 (core import 불가) | core는 Node.js 전용, admin은 브라우저 빌드 | ✓ Good — v1.5.2 구현 |
| METHOD_WHITELIST 2단계 중첩 DynamicRowList | contractAddress + selectors[] Zod 구조 반영 | ✓ Good — v1.5.2 구현 |
| TierVisualization → PolicyRulesSummary 이동 | 단일 책임 원칙, 시각화 전담 컴포넌트 분리 | ✓ Good — v1.5.2 구현 |
| PolicyFormRouter + validateRules 수정 모달 재사용 | 생성/수정 동일 폼, 코드 중복 방지, 일관된 UX | ✓ Good — v1.5.2 구현 |
| CUMULATIVE_SPENDING_DAILY/MONTHLY 롤링 윈도우 | 고정 달력 기간 대신 24h/30d 슬라이딩 윈도우 | ✓ Good — v1.5.3 구현 |
| 누적 한도 80% 경고 CUMULATIVE_LIMIT_WARNING | 한도 소진 전 사전 경고, 22번째 NotificationEventType | ✓ Good — v1.5.3 구현 |
| IForexRateService CoinGecko tether 기반 | USD→법정통화 환산, stablecoin 가격으로 간접 환율 | ✓ Good — v1.5.3 구현 |
| display_currency 월렛별 표시 통화 | 정책 평가는 항상 USD, 표시만 로컬 통화 | ✓ Good — v1.5.3 구현 |
| Kill Switch 3-state (ACTIVE/SUSPENDED/LOCKED) | RECOVERING 제거, 단순화, CAS ACID | ✓ Good — v1.6 구현 |
| EventBus emit() 리스너별 try/catch 격리 | 파이프라인 안전성, 하나의 리스너 오류가 전체 차단 방지 | ✓ Good — v1.6 구현 |
| eventBus optional chaining(?.) 패턴 | 기존 코드 무중단 호환, 이벤트 버스 미초기화 시 안전 | ✓ Good — v1.6 구현 |
| AutoStop 규칙 트리거 후 카운터 리셋 | 재축적 필요, 연속 실패 5회 리셋 후 재카운트 | ✓ Good — v1.6 구현 |
| MANUAL_TRIGGER → Kill Switch 전체, 나머지 → 개별 월렛 | 수동은 전역, 자동은 격리 정지 | ✓ Good — v1.6 구현 |
| BalanceMonitorService setInterval 폴링 (5분) | EventBus 구독 대신 주기적 체크, 단순하고 예측 가능 | ✓ Good — v1.6 구현 |
| Telegram Bot native fetch (외부 프레임워크 미사용) | telegraf/grammy 의존 제거, 최소 의존성 | ✓ Good — v1.6 구현 |
| telegram.bot_token 별도 TOML 섹션 | Bot 수신 vs 알림 발송 독립 제어 | ✓ Good — v1.6 구현 |
| 2-Tier 인증 (ADMIN/READONLY/PENDING) | 관리 명령은 ADMIN만, 조회는 READONLY 허용 | ✓ Good — v1.6 구현 |
| node:22-slim Docker 베이스 이미지 | glibc 호환, native addon prebuildify 지원 | ✓ Good — v1.6 구현 |
| Docker Secrets _FILE 패턴 | 환경변수 대신 파일 기반 시크릿 주입, compose 오버라이드 | ✓ Good — v1.6 구현 |
| 127.0.0.1:3100 포트 매핑 | 외부 네트워크 노출 방지, localhost 전용 | ✓ Good — v1.6 구현 |
| WC "선호 채널" 위치 (REST API 절대 유지) | self-hosted 철학, 외부 relay 의존 최소화 | ✓ Good — v1.6.1 설계 |
| 3중 승인 채널 (WC > Telegram > REST) | 편의성 순서, fallback 자동 전환 | ✓ Good — v1.6.1 구현 |
| SqliteKeyValueStorage (WC SDK 세션 영속화) | WC keyvaluestorage 의존성 대신 직접 구현, pnpm strict 호환 | ✓ Good — v1.6.1 구현 |
| 서버사이드 QR 생성 (CSP 변경 불필요) | qrcode.toDataURL → base64 data URL | ✓ Good — v1.6.1 구현 |
| fire-and-forget WC 서명 요청 | stage4Wait 비차단, void prefix 패턴 | ✓ Good — v1.6.1 구현 |
| 서명 검증 실패 시 reject 안 함 | Owner REST API 재시도 가능 | ✓ Good — v1.6.1 구현 |
| WC fallback에 isApprovalStillPending guard | 이미 처리된 approval 보호, 단일 승인 소스 | ✓ Good — v1.6.1 구현 |
| 사용자 명시적 거부(4001/5000)는 fallback 없음 | 의도적 거부는 존중 | ✓ Good — v1.6.1 구현 |
| notificationService/eventBus optional DI | WC 없이도 데몬 정상 동작 | ✓ Good — v1.6.1 구현 |
| v8 coverage thresholds --coverage 플래그 실행 시에만 활성화 | vitest run 기본 실행 성능 유지 | ✓ Good — v1.7 구현 |
| msw 핸들러 factory 패턴 (overrides 커스터마이징) | 테스트별 응답 분기 가능, 재사용 극대화 | ✓ Good — v1.7 구현 |
| Contract Test factory skipMethods 패턴 | RPC 의존 복잡 메서드 격리, shape 검증 집중 | ✓ Good — v1.7 구현 |
| describe.skipIf(!validatorRunning) 패턴 | Local Validator 미실행 시 graceful skip | ✓ Good — v1.7 구현 |
| coverage-gate.sh Soft/Hard 모드 | v1.7 초기 soft, 안정화 후 hard 전환 | ✓ Good — v1.7 구현 |
| ci.yml Stage 1 --affected / Stage 2 full suite | push 시 빠른 피드백, PR 시 전체 검증 | ✓ Good — v1.7 구현 |
| nightly devnet job continue-on-error: true | devnet 불안정성 격리, 빌드 중단 방지 | ✓ Good — v1.7 구현 |
| release Docker 빌드 GHA cache (type=gha, mode=max) | 레이어 캐시 재활용, 빌드 시간 최소화 | ✓ Good — v1.7 구현 |
| BackgroundWorkers runImmediately 옵션 | fire-and-forget 즉시 1회 실행 후 interval 반복 | ✓ Good — v1.8 구현 |
| semver 패키지 npm registry 버전 비교 | AbortSignal.timeout(5000) fetch 타임아웃, fail-soft | ✓ Good — v1.8 구현 |
| createHealthRoute 팩토리 DI 패턴 | VersionCheckService 선택적 주입, backward compatibility 유지 | ✓ Good — v1.8 구현 |
| 파일 기반 mtime dedup (.last-update-notify) | 데몬 비실행 시에도 CLI 독립적 24h 중복 방지 | ✓ Good — v1.8 구현 |
| process.stderr.write CLI 알림 | stdout 파이프 안전성 확보, 2초 타임아웃 | ✓ Good — v1.8 구현 |
| BackupService copyFileSync 개별 파일 복사 | 명시적 파일 단위, DB+WAL/SHM+config.toml, 5개 보존 | ✓ Good — v1.8 구현 |
| execSync('npm install -g') upgrade 실행 | npm CLI 직접 호출, Step 5 마이그레이션 데몬 위임 | ✓ Good — v1.8 구현 |
| checkSchemaCompatibility 3-시나리오 판별 | ok/migrate/reject, MIN_COMPATIBLE_SCHEMA_VERSION=1 | ✓ Good — v1.8 구현 |
| SCHEMA_INCOMPATIBLE 에러 코드 (503) | SYSTEM 도메인, non-retryable, upgrade 안내 | ✓ Good — v1.8 구현 |
| docker/metadata-action@v5 3-tier 태깅 | GHCR latest/semver/major 자동 생성 | ✓ Good — v1.8 구현 |
| Watchtower 라벨 이미지 기본 포함 | 사용자 opt-in 간소화 | ✓ Good — v1.8 구현 |
| 모노레포 단일 버전 전략 (release-please) | 루트 패키지가 9개 서브패키지 대표, Self-Hosted 특성 | ✓ Good — v1.8 구현 |
| bump-minor-pre-major: false | 1.x에서도 BREAKING CHANGE → major 범프 | ✓ Good — v1.8 구현 |
| 2-gate release model | Release PR 머지(게이트 1) → 품질 게이트 → deploy 수동 승인(게이트 2) | ✓ Good — v1.8 구현 |
| contract test 패턴 (cross-package 의존성 검증) | health 응답 스키마 계약으로 패키지 경계 존중 | ✓ Good — v1.8 구현 |
| MIT 라이선스 채택 | 오픈소스 표준, 상업 사용 허용, 기여 장벽 최소화 | ✓ Good — v2.0 구현 |
| npm @waiaas Organization scope | 패키지 네임스페이스 확보, 일관된 브랜딩 | ✓ Good — v2.0 구현 |
| OpenAPI swagger-parser CI 자동 검증 | 스펙 유효성 빌드타임 보장, 수동 검증 불필요 | ✓ Good — v2.0 구현 |
| docs/ vs docs-internal/ 분리 | 사용자 문서와 내부 설계 문서 독립 관리 | ✓ Good — v2.0 구현 |
| zero-dependency skills CLI | process.argv 직접 파싱, 외부 라이브러리 미사용 | ✓ Good — v2.0 구현 |
| publishConfig.access: public | scoped 패키지 npm publish 필수 설정 | ✓ Good — v2.0 구현 |
| admin 패키지 private:true | daemon에 번들, 별도 publish 불필요 | ✓ Good — v2.0 구현 |
| release-as "2.0.0-rc.1" 명시적 | release-as와 prerelease-type 결합 불가 | ✓ Good — v2.0 구현 |
| GITHUB_TOKEN → RELEASE_PAT | GITHUB_TOKEN은 다른 워크플로 트리거 불가 | ✓ Good — v2.0 구현 |
| npm Classic Automation Token | Trusted Publishing은 v2.0.4에서 전환 | ✓ Good — v2.0 구현, v2.4에서 OIDC 전환 완료 |
| Dead code it.skip 문서화 패턴 | 도달 불가 코드는 강제 실행 대신 skip+설명 주석 | ✓ Good — v2.2 테스트 |
| Branch-focused 별도 테스트 파일 | 기존 happy-path 테스트와 중복 없이 분기 집중 | ✓ Good — v2.2 테스트 |
| Coverage 별도 테스트 파일 (mock 충돌 회피) | 기존 test와 mock 설정 충돌 방지 | ✓ Good — v2.2 테스트 |
| client.ts real fetch 테스트 (no mock) | 실제 코드 경로 정확한 커버리지 측정 | ✓ Good — v2.2 테스트 |
| Non-throwing process.exit mock | try/catch 내 exit 호출 catch 블록 커버리지 | ✓ Good — v2.2 테스트 |
| PassThrough stream stdin mock | forks pool에서 readline mock 불안정 대체 | ✓ Good — v2.2 테스트 |
| Settings 분산 전략 — 재배치(이동), 재작성 아님 | 기존 컴포넌트를 탭 단위로 이동, 로직 변경 최소화 | ✓ Good — v2.3 구현 |
| 5-phase 구조 (공용→메뉴→설정→UX→마무리) | 점진적 빌드업, 각 단계 독립 검증 가능 | ✓ Good — v2.3 구현 |
| HTML fieldset+legend 시맨틱 FieldGroup | div 래퍼 대신 접근성 표준 요소 사용 | ✓ Good — v2.3 구현 |
| 정적 SearchIndexEntry 배열 (서버 API 아님) | 수십 개 설정 항목에 클라이언트 사이드 검색 충분 | ✓ Good — v2.3 구현 |
| Module-level signal (highlightField/pendingNavigation) | prop drilling 없이 cross-component 통신 | ✓ Good — v2.3 구현 |
| Module-level signal registry (dirty guard) | 각 탭이 isDirty/save/discard 클로저 등록 | ✓ Good — v2.3 구현 |
| 3-button unsaved dialog (저장 후 이동/저장 없이 이동/취소) | 모든 UX 시나리오 커버 | ✓ Good — v2.3 구현 |
| Record<string, string> 맵 기반 field description | 동적 렌더링, settings-search-index.ts와 일관성 유지 | ✓ Good — v2.3 구현 |
| Hidden input 패턴 (CurrencySelect name discovery) | FormField 외부 커스텀 컴포넌트의 querySelector 발견 지원 | ✓ Good — v2.3 구현 |
| 각 Settings 탭 독립적 signal 상태 | 탭 간 상태 간섭 방지, 독립 dirty/save/load | ✓ Good — v2.3 구현 |
| Job-level permissions (workflow-level 아닌) | OIDC scope를 deploy job에만 제한 | ✓ Good — v2.4 구현 |
| npm publish 직접 호출 (pnpm 위임 대신) | OIDC 토큰 전달 경로 확실성 | ✓ Good — v2.4 구현 |
| publish-check에서 --provenance 사용 금지 | dry-run + provenance 비호환 | ✓ Good — v2.4 구현 |
| NPM_TOKEN은 OIDC E2E 검증 후에만 제거 | 롤백 가능성 유지 | ✓ Good — v2.4 구현 |
| release-please prerelease versioning (rc type) | RC 릴리스로 OIDC 검증 수행 | ✓ Good — v2.4 구현 |
| homepage 필드는 provenance 범위 밖 유지 | repository.url만 Sigstore에 사용 | ✓ Good — v2.4 구현 |
| NotificationService always-init (0 channels) | Admin UI hot-reload 런타임 활성화 지원 | ✓ Good — v2.4 quick-4 |
| message 필드 UTF-8 원문 + 인코딩은 체인 라이브러리 | SignRequest 가독성 + 검증 가능성 확보 | ✓ Good — v2.6 설계 |
| requestId(UUID v7) 재사용 Nonce | 별도 nonce 생성 불필요, 1회성 보장 | ✓ Good — v2.6 설계 |
| ntfy 응답 토픽 requestId 기반 1회용 (122비트 엔트로피) | 토픽 자체가 인증 역할, 추측 불가 | ✓ Good — v2.6 설계 |
| Telegram 3중 보안 (chatId + signerAddress + 서명) | 위조 방지 계층적 보안 | ✓ Good — v2.6 설계 |
| parseSignRequest 동기/비동기 2모드 반환 | 인라인(URL data) vs ntfy 조회 fallback 지원 | ✓ Good — v2.6 설계 |
| zod만 peerDependency (SDK 의존성 최소화) | React Native/Electron/Node.js 환경 호환 | ✓ Good — v2.6 설계 |
| ISigningChannel 공통 인터페이스 (sendRequest + waitForResponse) | ntfy/telegram 채널 교체 가능, Slack/Discord 확장 | ✓ Good — v2.6 설계 |
| WalletLinkRegistry SettingsService JSON 배열 저장 | 별도 DB 테이블 불필요 (1-3개 지갑) | ✓ Good — v2.6 설계 |
| ApprovalChannelRouter 5단계 fallback | ownerApprovalMethod > SDK > WC > Telegram Bot > REST | ✓ Good — v2.6 설계 |
| 서명/알림 토픽 분리 (waiaas-sign-*/waiaas-notify-*) | 동일 ntfy 서버, 접두어로 구분 | ✓ Good — v2.6 설계 |
| IPushProvider send+validateConfig 2메서드 | 프로바이더 확장 가능, createProvider 팩토리 | ✓ Good — v2.6 설계 |
| FCM HTTP v1 단건 전송 + Promise.allSettled | sendAll deprecated 대비, 병렬 처리 | ✓ Good — v2.6 설계 |
| Push Relay 별도 패키지 중첩 config.toml 허용 | WAIaaS flat-key 정책 미적용 (독립 패키지) | ✓ Good — v2.6 설계 |
| INotificationChannel type에 'WALLET_NTFY' 추가 | 4번째 채널 타입, 타입 안전성 유지 | ✓ Good — v2.6 설계 |
| DB migration v18 owner_approval_method CHECK 제약 | fresh DDL에만 CHECK, 기존 ALTER ADD COLUMN은 무제약 | ✓ Good — v2.6.1 구현 |
| Injectable verify functions (EvmVerifyFn/SolanaVerifyFn) | 테스트 가능성 확보, mock 주입 용이 | ✓ Good — v2.6.1 구현 |
| node>=18 engine for wallet SDK | React Native/Electron 호환, ReadableStream SSE 파싱 | ✓ Good — v2.6.1 구현 |
| AsyncGenerator SSE parsing for NtfySigningChannel | 재연결 max 3회 5s 딜레이, requestId 필터링 | ✓ Good — v2.6.1 구현 |
| TelegramSigningChannel one-way push (no SSE) | /sign_response bot 명령어로 응답, ADMIN tier 필요 | ✓ Good — v2.6.1 구현 |
| Three-state approval_method protocol (undefined/null/string) | preserve/clear/save 명확한 의미 분리 | ✓ Good — v2.6.1 구현 |
| ApprovalChannelRouter raw better-sqlite3 | wallet lookup 성능 최적화, Drizzle ORM 우회 | ✓ Good — v2.6.1 구현 |
| Late-binding setter for signResponseHandler injection | VersionCheckService 일관 패턴, 순환 의존 회피 | ✓ Good — v2.6.1 구현 |
| Signing SDK fail-soft lifecycle (fire-and-forget) | enabled=false 시 스킵, 데몬 정상 동작 보장 | ✓ Good — v2.6.1 구현 |
| Direct getAllMasked() return (z.infer assertion) | 카테고리 체리피킹 대신 직접 반환, 11개 카테고리 자동 노출 | ✓ Good — v2.6.1 구현 |
| Side channel BEFORE channels.length guard | 기존 채널 0개여도 사이드 채널은 동작해야 함 | ✓ Good — v2.7 구현 |
| Fire-and-forget .catch() 사이드 채널 격리 | 사이드 채널 실패가 기존 채널에 무영향 | ✓ Good — v2.7 구현 |
| notify_categories 빈 배열 = 전체 카테고리 | 명시적 필터링 opt-in, 기본값은 모든 알림 수신 | ✓ Good — v2.7 구현 |
| SSE subscribeToNotifications reuse pattern | subscribeToRequests와 동일한 AbortController/재연결 패턴 재사용 | ✓ Good — v2.7 구현 |
| Wallet App Notifications as subgroup under Signing SDK | 관련 SDK 설정과 함께 배치, 별도 카테고리 아닌 하위 그룹 | ✓ Good — v2.7 구현 |
| JSON array string for notify_categories | 멀티셀렉트 체크박스 → JSON.stringify/parse, SettingsService 기존 패턴 | ✓ Good — v2.7 구현 |
| NtfySigningChannel base64url 인코딩 통일 | 서명/알림 모두 동일 인코딩, Relay 파서 단일 로직 | ✓ Good — v26.3 구현 |
| push-relay 독립 Dockerfile (daemon과 분리) | 지갑사 자체 운영 서버, daemon 배포와 독립 | ✓ Good — v26.3 구현 |
| IPushProvider + withRetry 지수 백오프 | 5xx 재시도 3회, 401/403 즉시 에러, invalid token 자동 삭제 | ✓ Good — v26.3 구현 |
| better-sqlite3 WAL mode Device Registry | daemon과 동일 DB 패턴, 동시 읽기 최적화 | ✓ Good — v26.3 구현 |
| ntfy SSE subscriber 지수 백오프 재연결 (1s→60s) | 네트워크 불안정 대응, cap 60초 | ✓ Good — v26.3 구현 |
| TOML 중첩 config 허용 (push-relay 전용) | WAIaaS flat-key 정책 미적용, 독립 패키지 | ✓ Good — v26.3 구현 |
| session_wallets junction 테이블 (JWT에 지갑 배열 넣지 않음) | DB 기반 동적 관리, 토큰 재발급 불필요 | ✓ Good — v26.4 구현 |
| walletId 선택적 파라미터 (미지정 시 기본 지갑 자동) | 하위 호환 100%, 기존 클라이언트 무변경 | ✓ Good — v26.4 구현 |
| connect-info sessionAuth 전용 (마스터 패스워드 불필요) | 에이전트 자율 발견, 보안 경계 유지 | ✓ Good — v26.4 구현 |
| MCP 단일 인스턴스 (지갑별 인스턴스 제거) | connect-info로 발견, MCP config 단순화 | ✓ Good — v26.4 구현 |
| workflow_dispatch RC 승격 자동화 | 로컬 수동 편집 제거, 모노레포 전 패키지 일괄 처리 | ✓ Good — v26.4 구현 |
| IChainSubscriber를 IChainAdapter와 별도 인터페이스 | 구독(수신 감지)과 어댑터(발신 TX) 책임 분리 | ✓ Good — v27.0 설계 |
| UNIQUE(tx_hash, wallet_id) 복합 제약 | 동일 TX 다른 지갑 허용, 같은 지갑 중복 차단 | ✓ Good — v27.0 설계 |
| 2단계 상태 DETECTED/CONFIRMED | finality 수준 추적, 거래소급 안전성 | ✓ Good — v27.0 설계 |
| 메모리 큐 + 5초 flush (SQLite 보호) | 단일 라이터 병목 해소, 배치 INSERT | ✓ Good — v27.0 설계 |
| Solana logsSubscribe({ mentions }) 단일 구독 | SOL+SPL+Token-2022 통합 감지, mentions로 ATA 자동 포함 | ✓ Good — v27.0 설계 |
| EVM 폴링(getLogs) 우선 | WebSocket 불안정 EVM RPC 대응, 폴백 아닌 주방식 | ✓ Good — v27.0 설계 |
| 3-state 연결 상태 머신 (WS_ACTIVE/POLLING_FALLBACK/RECONNECTING) | 명확한 전환 조건, 복구 자동화 | ✓ Good — v27.0 설계 |
| 체인별 WebSocket 공유 멀티플렉서 | 같은 체인 N개 지갑이 1개 연결 공유 | ✓ Good — v27.0 설계 |
| config.toml [incoming] 6키 flat | 기존 flat-key 패턴 일관성, hot-reload 가능 | ✓ Good — v27.0 설계 |
| 전역 게이트 + 지갑별 opt-in 2단계 | 글로벌 enabled → 지갑별 monitor_incoming | ✓ Good — v27.0 설계 |
| IChainSubscriber connect()/waitForDisconnect() 필수 | reconnectLoop에서 호출 가능, 인터페이스 완전성 | ✓ Good — v27.0 갭 해결 |
| flush() 반환 IncomingTransaction[] + 개별/집계 이벤트 분리 | eventBus 타입 안전성, 개별 TX 이벤트 + 집계 카운트 분리 | ✓ Good — v27.0 갭 해결 |
| is_suspicious 컬럼 (별도 테이블 아님) | incoming_transactions 단일 테이블, JOIN 불필요, Summary SQL 정합 | ✓ Good — v27.0 갭 해결 |
| 폴링 BackgroundWorker Step 6 등록 | incoming-tx-poll-solana/evm 2개, DaemonLifecycle 완전 통합 | ✓ Good — v27.0 갭 해결 |
| SUSPICIOUS priority:high 채널 내부 eventType 매핑 | NotificationPayload 변경 없이 priority 라우팅 | ✓ Good — v27.0 갭 해결 |
| SafetyRuleContext.decimals + getDecimals() 헬퍼 | IncomingTransaction 타입 변경 없이 decimals 전달 | ✓ Good — v27.0 갭 해결 |

| IncomingTransaction interface + Zod schema 이중 정의 | interface는 코드 계약, Zod는 검증/OpenAPI SSoT | ✓ Good — v27.1 구현 |
| Custom CAIP-2/19 모듈 (~240 LOC, 외부 의존성 0) | 4개 외부 라이브러리 평가 후 과잉 의존성 판단 | ✓ Good — v27.2 구현 |
| `token` namespace for Solana SPL/Token-2022 (NOT `spl`) | CAIP-19 표준 준수, SPL은 비표준 | ✓ Good — v27.2 구현 |
| slip44: ETH=60, SOL=501, POL=966 (Polygon NOT 60) | SLIP-44 표준 coin type 준수 | ✓ Good — v27.2 구현 |
| EVM addresses lowercase at CAIP construction time | Solana base58은 NEVER lowercased, 체인별 정규화 | ✓ Good — v27.2 구현 |
| InMemoryPriceCache volatile — 캐시 키 마이그레이션 제로 비용 | 재시작 시 자동 적용, 데이터 마이그레이션 불필요 | ✓ Good — v27.2 구현 |
| DB v22 application-level backfill (SELECT+loop+UPDATE) | established v6b 패턴 재사용 | ✓ Good — v27.2 구현 |
| 4-scenario ALLOWED_TOKENS 정책 매칭 매트릭스 | assetId↔assetId, assetId↔legacy, legacy↔assetId, legacy↔legacy 전환 기간 호환 | ✓ Good — v27.2 구현 |
| CAIP-19 assetId optional additive (하위 호환) | 기존 address-only 경로 전부 유지, 점진적 전환 | ✓ Good — v27.2 구현 |
| network-map.ts SSoT for CAIP-2/NetworkType 양방향 맵 | x402.types.ts, wc-session-service.ts 모두 여기서 import | ✓ Good — v27.2 구현 |
| resolveNetwork(chain, network?) 하위호환 패턴 | 오라클 호출자 시그니처 점진적 마이그레이션 | ✓ Good — v27.2 구현 |
| MCP tools 내 CAIP-19 validation 없음 | 데몬 Caip19Schema superRefine이 단일 검증 지점 | ✓ Good — v27.2 구현 |
| CREATE TABLE IF NOT EXISTS v21 마이그레이션 | pushSchema DDL 실행 순서 호환, 기존 패턴 일관 | ✓ Good — v27.1 구현 |
| generateId DI 주입 (crypto.randomUUID default) | 테스트 가능성 확보, Phase 226에서 UUID v7 사용 | ✓ Good — v27.1 구현 |
| EVM polling-first (connect no-op) | EVM WebSocket 불안정 대응, 설계(D-06) 충실 구현 | ✓ Good — v27.1 구현 |
| Duck-typed subscriber 파라미터 (reconnectLoop) | IChainSubscriber 순환 의존 회피 | ✓ Good — v27.1 구현 |
| 큐 flush 시 generateId() 호출 (UUID v7 time ordering) | 삽입 시점 기준 정렬, 감지 시점과 분리 | ✓ Good — v27.1 구현 |
| Composite cursor base64url JSON {d, i} | keyset 페이지네이션, offset 없이 안정적 | ✓ Good — v27.1 구현 |
| Summary JS BigInt 집계 (SQL SUM 미사용) | SQLite bigint 정밀도 이슈 방지 | ✓ Good — v27.1 구현 |
| Duck-typed incomingTxMonitorService (순환 의존 회피) | HotReloadDeps/CreateAppDeps에서 일관 적용 | ✓ Good — v27.1 구현 |
| BackgroundWorkers pre-created double guard | daemon Step 4c-9 전 + Step 6 내부, 방어적 코딩 | ✓ Good — v27.1 구현 |
| Polling workers structural typing cast | pollAll()이 IChainSubscriber interface에 없음, as unknown as 캐스트 | ✓ Good — v27.1 구현 |
| TX_INCOMING_SUSPICIOUS → security_alert 카테고리 | 전 채널 브로드캐스트, TX_INCOMING은 transaction 카테고리 | ✓ Good — v27.1 구현 |
| CAIP-19 regex 인라인 복제 (policy.schema.ts) | caip/ 모듈 순환 의존성 방지 | ✓ Good — v27.3 구현 |
| raw 필드 optional + superRefine "USD/token_limits/raw 중 하나 필수" | 하위 호환 유지하면서 USD-only 정책 허용 | ✓ Good — v27.3 구현 |
| evaluateTokenTier 4단계 CAIP-19 매칭 순서 | 정확→native:{chain}→native→raw 폴백, 토큰별 세밀 제어 | ✓ Good — v27.3 구현 |
| parseDecimalToBigInt fixed-point multiplication | 부동소수점 없이 정밀 비교 | ✓ Good — v27.3 구현 |
| NATIVE_DECIMALS 중복 정의 (DRY 위반) | cross-file 의존성 회피, 런타임 미영향 | ⚠️ Revisit — v27.3 tech debt |
| Lido manual ABI encoding (no viem at provider level) | zerox-swap 패턴 일관성, 외부 의존성 제거 | ✓ Good — v28.4 구현 |
| parseEthAmount decimal-to-wei via string split + BigInt | 부동소수점 없이 정밀 산술 | ✓ Good — v28.4 구현 |
| Lido environment-based address switching (deriveEnvironment) | mainnet/Holesky 자동 전환, 설정 오버라이드 지원 | ✓ Good — v28.4 구현 |
| Pure mathematical Ed25519 on-curve check | crypto.subtle importKey 불신뢰 대체 | ✓ Good — v28.4 구현 |
| Zero external Solana SDK deps for PDA/base58/ATA | 순수 TypeScript 구현, 의존성 최소화 | ✓ Good — v28.4 구현 |
| Dynamic notificationEvent in AsyncPollingService | tracker details.notificationEvent 오버라이드, BRIDGE_* 기본값 폴백 | ✓ Good — v28.4 구현 |
| Metadata-based v1 tracking (no on-chain queries) | metadata.status 필드 기반 COMPLETED 감지 | ✓ Good — v28.4 구현 |
| Staking API metadata aggregation (not RPC) | v1 balance estimation via transactions metadata | ✓ Good — v28.4 구현 |
| Hardcoded APY for v1 (Lido ~3.5%, Jito ~7.5%) | 실시간 APY 조회 복잡도 회피, v2에서 개선 | ✓ Good — v28.4 구현 |
| bridge_status enrollment after Stage 6 (fire-and-forget) | confirmed unstakes만 async tracking 진입 | ✓ Good — v28.4 구현 |
| metadata UPDATE after Stage 1 (synchronous) | 포지션 조회 즉시 가능 | ✓ Good — v28.4 구현 |
| sign-only tokenDecimals 미전달 | ParsedOperation에 decimals 없음, 설계 문서 기록 | — Pending — v27.3 known limitation |
| Stage 3.5 gas condition insertion 패턴 | Stage 3(정책)과 Stage 4(대기) 사이 가스 조건 평가 | ✓ Good — v28.5 구현 |
| GasCondition Zod schema with at-least-one refine | maxGasPrice/maxPriorityFee 중 하나 필수, 빈 객체 방지 | ✓ Good — v28.5 구현 |
| bridgeMetadata tracker convention (gas-condition) | AsyncPollingService 라우팅 호환, metadata와 분리 | ✓ Good — v28.5 구현 |
| Raw JSON-RPC fetch for gas price queries | adapter 의존성 없이 자체 완결, rpcUrl은 metadata에서 읽음 | ✓ Good — v28.5 구현 |
| 10s gas price cache per RPC URL | 동일 폴링 사이클 내 중복 RPC 호출 방지, 배치 효율 | ✓ Good — v28.5 구현 |
| GAS_WAITING→PENDING (not CONFIRMED) | Stage 4+5+6 실행 필요, executeFromStage4 재진입 | ✓ Good — v28.5 구현 |
| resumePipeline callback (no reservation release) | 온체인 실행에 자금 필요, 해제는 Stage 6에서 | ✓ Good — v28.5 구현 |
| executeFromStage4 skips stage4Wait | 정책은 GAS_WAITING 진입 전 이미 평가됨 | ✓ Good — v28.5 구현 |
| max_pending_count global (not per-wallet) | 기존 max_pending_tx 패턴 일관성, 단순 | ✓ Good — v28.5 구현 |
| gas_condition.* settings 5키 (런타임 조정) | config.toml 아닌 Admin Settings, hot-reload 가능 | ✓ Good — v28.5 구현 |
| GasConditionOpenAPI documentation-only z.object | core GasConditionSchema.refine()은 OpenAPI 비호환 | ✓ Good — v28.5 구현 |
| MCP snake_case→camelCase gasCondition 매핑 | wallet_id→walletId 기존 패턴 일관성 | ✓ Good — v28.5 구현 |
| Actions route gasCondition spread merge | {…contractCall, gasCondition}으로 파이프라인 request 주입 | ✓ Good — v28.5 구현 |
| Python SDK by_alias=True camelCase 직렬화 | REST API 호환, Pydantic alias 패턴 | ✓ Good — v28.5 구현 |
| APPROVE without OVERRIDE → SPENDING_LIMIT 평가 | token_limits 평가를 위해 기존 경로 수정 | ✓ Good — v27.3 구현 |
| evaluateBatch tokenContext 미전달 | BATCH는 native 합산만, raw/USD만 적용 | ✓ Good — v27.3 구현 |
| Admin token registry EVM-only fetch | Solana 레지스트리 API 미존재, manual CAIP-19 입력 제공 | ✓ Good — v27.3 구현 |
| Inlined EXPLORER_MAP in admin SPA | Admin UI에서 @waiaas/core 임포트 불가 (번들 분리) | ✓ Good — v27.4 구현 |
| FilterBar hash-based URL sync | replaceState로 필터 상태 공유/북마크 가능 | ✓ Good — v27.4 구현 |
| offset/limit 서버사이드 페이지네이션 | Admin 크로스 지갑 API에 커서 대신 offset/limit 채택 | ✓ Good — v27.4 구현 |
| Custom expandable table (vs Table component) | 행 확장 기능 미지원 → 전용 테이블 구현 | ✓ Good — v27.4 구현 |
| Wallet detail 4-tab layout (closure-based) | Overview/Transactions/Owner/MCP 탭 로컬 함수 컴포넌트 | ✓ Good — v27.4 구현 |
| apiPatch helper for PATCH mutations | /incoming 모니터링 토글에 필요, client.ts 확장 | ✓ Good — v27.4 구현 |
| Balance fetch capped at 50 wallets | 대량 지갑 목록 시 성능 보호 (BALANCE_FETCH_LIMIT) | ✓ Good — v27.4 구현 |
| USD value via price oracle getNativePrice | 지갑 잔액/상세에 실시간 USD 환산 표시 | ✓ Good — v27.4 구현 |
| syncUrl=false for tab-routed pages | 탭 상태가 hash로 관리되는 페이지에서 FilterBar URL 충돌 방지 | ✓ Good — v27.4 구현 |
| BUILTIN_PRESETS registry (@waiaas/core) | WalletPreset 타입 + D'CENT 1종 초기 등록, 프레임워크 확장 가능 | ✓ Good — v28.8 구현 |
| DB v24 wallet_type nullable TEXT | 기존 데이터 정상 조회, 하위 호환, ALTER TABLE ADD COLUMN | ✓ Good — v28.8 구현 |
| wallet_type Zod 검증 (schema level 400) | 빌트인에 없는 값 즉시 거부, 런타임 안전 | ✓ Good — v28.8 구현 |
| Preset approval_method overrides manual (with warning) | 충돌 시 프리셋 우선, warning 필드로 투명성 확보 | ✓ Good — v28.8 구현 |
| WalletLinkRegistry created in server.ts (not daemon.ts) | 라이프사이클 재구조화 회피, 안정성 우선 | ✓ Good — v28.8 구현 |
| Auto-setup optional (deps guard) | settingsService && walletLinkRegistry 존재 시에만 동작, 하위 호환 | ✓ Good — v28.8 구현 |
| WALLET_PRESETS Admin SPA static constant | @waiaas/core 직접 import 불가 (브라우저 빌드), 수동 동기 필요 | ⚠️ Revisit — v28.8 tech debt |
| Dropdown only shown when ownerState NONE | 첫 등록 시에만 표시, 주소 편집 시 숨김 | ✓ Good — v28.8 구현 |
| Merge priority: original > category_map > static_fields | 원본 페이로드 데이터 보존 원칙 | ✓ Good — v28.8 구현 |
| PayloadConfigSchema z.record() for flexible key-value | 유연한 선언적 설정, 추가 Zod 타입 불필요 | ✓ Good — v28.8 구현 |
| Transformer injected via NtfySubscriberOpts | 하드코딩 아닌 DI, 향후 교체 가능 | ✓ Good — v28.8 구현 |
| Bypass: undefined check before transform() | 미설정 시 zero-overhead, 기존 동작 100% 유지 | ✓ Good — v28.8 구현 |
| defi_positions discriminatedUnion 4-category | LENDING/YIELD/PERP/STAKING 카테고리별 metadata 타입 분기 | ✓ Good — v29.0 설계 |
| PositionTracker 카테고리별 차등 폴링 | Lending 5분, Perp 1분, Yield 1시간 — 위험도 비례 | ✓ Good — v29.0 설계 |
| IDeFiMonitor 독립 인터페이스 (IActionProvider와 분리) | 모니터가 DB 캐시 데이터 읽기, 프로바이더 직접 호출 안함 | ✓ Good — v29.0 설계 |
| HealthFactorMonitor 적응형 폴링 (5s-5min) | 위험도 기반 4-tier 간격, 긴급 시 15초까지 단축 | ✓ Good — v29.0 설계 |
| 알림 4 이벤트 기존 SSoT 체인 통합 | LIQUIDATION_WARNING 등 EVENT_CATEGORY_MAP에 security_alert 매핑 | ✓ Good — v29.0 설계 |
| config.toml [monitoring] 17 flat keys | KNOWN_SECTIONS 등록, 전부 hot-reloadable | ✓ Good — v29.0 설계 |
| ILendingProvider extends IActionProvider | 기존 프레임워크 재사용, supply/borrow/repay/withdraw 표준 | ✓ Good — v29.0 설계 |
| LendingPolicyEvaluator default-deny 자산 화이트리스트 | 기존 default_deny_tokens 패턴 일관, LTV 제한 추가 | ✓ Good — v29.0 설계 |
| IYieldProvider 5 actions + 3 queries | buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity — Pendle 최적화 | ✓ Good — v29.0 설계 |
| MaturityMonitor 1일 1회 + 7일/1일 전 경고 | 만기 모니터링 비용 최소화, 충분한 사전 경고 | ✓ Good — v29.0 설계 |
| IPerpProvider 5 actions + 3 queries | open/close/modify + addMargin/withdrawMargin — Drift 최적화 | ✓ Good — v29.0 설계 |
| PerpPolicyEvaluator 3-policy default-deny | 최대 레버리지 + 포지션 크기(USD) + 시장 화이트리스트 | ✓ Good — v29.0 설계 |
| SignableOrder EIP-712 + TRANSACTION_TYPES INTENT | 8번째 타입, 기존 파이프라인과 분기점 명확 | ✓ Good — v29.0 설계 |
| Intent 4-layer 보안 (chainId+contract+nonce+deadline) | 리플레이/크로스체인 공격 방지, 서버 사이드 nonce 추적 | ✓ Good — v29.0 설계 |
| IYieldProvider extends IActionProvider (ILendingProvider와 별도) | 만기 개념이 Yield 고유, Lending과 독립 확장 | ✓ Good — v29.6 |
| Pendle REST API v2 Convert 엔드포인트 사용 (SDK 의존성 불필요) | SDK 크기·호환성 부담 없이 HTTP만으로 calldata 빌드 | ✓ Good — v29.6 |
| MaturityMonitor 1일 1회 폴링 | 만기는 초 단위 추적 불필요, 비용 최소화 | ✓ Good — v29.6 |
| Yield 포지션 metadata JSON 컬럼 활용 (DDL 변경 없음) | Aave/Kamino와 동일 패턴, 카테고리별 유연한 메타데이터 | ✓ Good — v29.6 |
| viem account-abstraction 모듈 활용 | toSoladySmartAccount + createBundlerClient + createPaymasterClient 검증된 구현체 | ✓ Good — v30.6 |
| EntryPoint v0.7 전용 (v0.6 미지원) | 레거시 제외하여 범위 한정, v0.7이 현재 표준 | ✓ Good — v30.6 |
| 기존 5-type 유지 + 내부 분기 | TransactionRequestSchema 변경 없이 accountType으로만 실행 경로 분기 | ✓ Good — v30.6 |
| Lazy deployment (CREATE2 예측 주소) | 미배포 상태에서 주소 확정, 첫 UserOp에 initCode 포함 | ✓ Good — v30.6 |
| On-demand settings (hot-reload 불필요) | SmartAccountService가 요청 시마다 settings 읽기, 인프라 단순화 | ✓ Good — v30.6 |
| Paymaster rejection 패턴 매칭 | error message에서 'paymaster'/'PM_'/'Paymaster' 감지 → PAYMASTER_REJECTED | ✓ Good — v30.6 |
| any 타입 SmartAccountService.client | viem 복잡한 generic 회피, 런타임 동작 정확 | — Pending — v30.6 |
| Per-wallet provider model (글로벌 설정 제거) | 지갑별 프로바이더 선택으로 멀티 프로바이더 환경 지원 | ✓ Good — v30.9 |
| Pimlico/Alchemy unified endpoint | bundler URL = paymaster URL, 단일 API 키로 양쪽 자동 구성 | ✓ Good — v30.9 |
| 23 global settings 일괄 제거 (deprecated 없이) | Clean break, 하위 호환 불필요 (v30.6 직후) | ✓ Good — v30.9 |
| Dual-auth via Bearer token prefix 감지 | wai_sess_ prefix → sessionAuth, otherwise masterAuth | ✓ Good — v30.9 |
| HKDF info 'aa-provider-key-encryption' | settings-crypto와 별도 subkey 파생 | ✓ Good — v30.9 |
| Admin UI dashboard URL 브라우저 사이드 미러 | @waiaas/core import 불가, AA_PROVIDER_DASHBOARD_URLS 인라인 | ✓ Good — v30.9 |
| Lite mode = accountType='smart' + aaProvider=null | Provider 없이 Smart Account 생성 허용, Full 모드 전환은 PUT /provider | ✓ Good — v31.2 |
| Nonce EntryPoint v0.7 직접 조회 (Bundler 불필요) | Lite 모드에서 Bundler 의존성 제거 | ✓ Good — v31.2 |
| callData 이중 검증 (DB + 정책 재평가) | build-sign 간 변조 방지 | ✓ Good — v31.2 |
| userop capability separate from smart_account | userop = Smart Account 존재만, smart_account = aaProvider 필요 | ✓ Good — v31.2 |
| SDK UserOp methods use masterAuth | 플랫폼 백엔드 호출 패턴, sessionAuth 불필요 | ✓ Good — v31.2 |
| Default provider is None (Lite mode) | 새 Smart Account 지갑 기본값 Lite, 필요 시 Full 전환 | ✓ Good — v31.2 |
| ApiDirectResult off-chain DEX 패턴 | on-chain TX 없이 EIP-712 REST API 결과를 파이프라인에 통합 | ✓ Good — v31.4 |
| EIP-712 dual signing (L1 + User-Signed) | Phantom agent vs User-signed 용도별 서명 스키마 분리 | ✓ Good — v31.4 |
| Margin 기반 정책 평가 (Perp) | Notional 대비 실제 투입 자금으로 평가하여 레버리지 과대 추정 방지 | ✓ Good — v31.4 |
| Sub-account as metadata rows (not wallets) | WAIaaS 월렛 모델과 충돌 방지, 간단한 1:N 매핑 | ✓ Good — v31.4 |
| RateLimiter 600 weight/min (50% of API limit) | Hyperliquid 1200 제한의 안전 여유 확보 | ✓ Good — v31.4 |
| Close/sell/cancel $0 policy-exempt | 정책이 청산/매도 차단하여 손실 확대 방지 | ✓ Good — v31.4 |
| Agent UAT 6-section 시나리오 포맷 | 에이전트 파싱 가능, 사람도 읽기 쉬운 구조화 마크다운 | ✓ Good — v31.8 |
| Self-transfer 패턴 (to=own address) | 메인넷 UAT 안전성, 자금 손실 위험 제거 | ✓ Good — v31.8 |
| dispatch.kind=prompt for UAT skill | 인터랙티브 멀티스텝 플로우에 적합, 에이전트 자율 실행 | ✓ Good — v31.8 |
| CI 시나리오 등록 강제 (4 scripts) | Provider 추가 시 시나리오 누락 자동 감지 | ✓ Good — v31.8 |
| CONTRACT_DEPLOY = adapter.buildContractCall(to='') | 새 adapter 메서드 없이 기존 인터페이스 재사용 | ✓ Good — v31.14 |
| CONTRACT_DEPLOY 기본 APPROVAL tier + Settings override | 컨트랙트 배포 = 고위험, 관리자 설정으로 완화 가능 | ✓ Good — v31.14 |
| PIPELINE_HALTED catch + CompletionWaiter 패턴 | 기존 파이프라인 zero modification, 동기 JSON-RPC 응답 변환 | ✓ Good — v31.14 |
| SyncPipelineExecutor 래핑 | 6-stage pipeline 재사용, 비동기→동기 브릿지 | ✓ Good — v31.14 |
| ABI decoding inline (no viem at RPC proxy layer) | RPC 프록시 계층 viem 의존성 최소화 | ✓ Good — v31.14 |
| eth_sendRawTransaction 명시적 거부 (-32602) | 서명 우회 방지, 정책 엔진 보안 유지 | ✓ Good — v31.14 |
| CompletionWaiter lazy-init (nullable EventBus) | EventBus 없는 환경(테스트) 호환 | ✓ Good — v31.14 |
| validateAndFillFrom exported 헬퍼 | SEC-02/SEC-03 테스트 가능성 확보 | ✓ Good — v31.14 |
| keepAliveTimeout 600s inline | 단일 사용처, Settings 확장 가능 | ✓ Good — v31.14 |
| EVM_CHAIN_ID_TO_NETWORK 모듈 로드 시 파생 | SSoT(EVM_CHAIN_MAP) 유지, 런타임 비용 0 | ✓ Good — v31.14 |

## Shipped: v27.2 CAIP-19 자산 식별 표준

v27.2 shipped. WAIaaS 전체 코드베이스의 토큰/자산 식별 체계를 CAIP-19 표준으로 통일. Custom CAIP-2/19 파서 모듈(~240 LOC, 외부 의존성 0), 13-네트워크 양방향 맵, 가격 오라클 L2 지원(Polygon/Arbitrum/Optimism/Base), DB v22 마이그레이션(token_registry.asset_id + 자동 backfill), 4-시나리오 ALLOWED_TOKENS 정책 매칭 매트릭스, MCP 토큰 도구 assetId + TS/Python SDK 타입 확장 + 3개 스킬 파일 문서화. 모든 변경 additive(하위 호환). 31/31 requirements PASS.

## Shipped: v27.3 토큰별 지출 한도 정책

v27.3 shipped. SPENDING_LIMIT 정책에 CAIP-19 기반 토큰별 사람 읽기 단위 지출 한도(token_limits) 추가. TokenLimitSchema Zod SSoT(raw optional 전환, superRefine "USD/token_limits/raw 중 하나 필수" 검증), evaluateTokenTier 4단계 CAIP-19 매칭(정확→native:{chain}→native→raw 폴백) + decimal 변환 + maxTier(USD, 토큰별) 합산, Admin UI spending-limit-form 재구성(USD 최상단 + 네이티브/CAIP-19 토큰 편집기 + 레지스트리 연동 + Legacy deprecated), 하위 호환 100%(기존 raw-only 정책 동일 동작). 27/27 requirements PASS, 5 tech debt(전부 non-blocking).

## Shipped: v27.4 Admin UI UX 개선

v27.4 shipped. Admin UI에 부재한 핵심 기능을 추가하고 기존 페이지 UX 전반 개선. ExplorerLink(13 networks)/FilterBar(URL hash sync)/SearchInput(debounce) 공용 컴포넌트 + 크로스 지갑 Admin API 2개(GET /admin/transactions, GET /admin/incoming). /transactions 페이지(8-column 테이블, 서버사이드 offset/limit 페이지네이션, 행 확장, 5개 필터 + txHash/수신자 검색), Dashboard 개선(Approval Pending 카드, 클릭 가능 StatCards, 네트워크/txHash 익스플로러 링크), /tokens 페이지(네트워크별 CRUD + 온체인 메타데이터 자동 조회 GET /tokens/resolve), /incoming 페이지(설정 패널 추출 + 크로스 지갑 수신 TX 뷰어 + 지갑별 모니터링 토글), 지갑 목록 검색/필터/잔액+USD, 지갑 상세 4탭(Overview/Transactions/Owner/MCP) + 페이지네이션/USD 환산/새로고침. 31/32 requirements satisfied (WDET-02 partial: 클라이언트 사이드 필터 design limitation). Tech debt 3건 non-blocking.

## Shipped: v28.0 기본 DeFi 프로토콜 설계

v28.0 shipped. DeFi 프로토콜 통합을 위한 설계 기반 완성. DEFI-01~05 설계 결정 59건 확정 — IActionProvider 플러그인 프레임워크(ESM + registry + auto-MCP), JupiterSwapActionProvider 설계(Quote→SwapInstructions→ContractCallRequest), 5-safety(슬리피지 클램프/priceImpact/Jito MEV/동일 토큰/프로그램 주소), 기존 6-stage pipeline 재사용(코드 변경 0), config.toml [actions] flat key 패턴. m28-00 설계 문서 ~1,595줄.

## Shipped: v28.1 Jupiter Swap

v28.1 shipped. Jupiter Aggregator REST API를 IActionProvider 프레임워크에 통합 구현. packages/actions/ 신규 모노레포 패키지에 JupiterApiClient(native fetch + Zod 검증) + JupiterSwapActionProvider(5-safety) 구현. 데몬 자동 등록 + config.toml [actions] 8키 + MCP jupiter_swap 자동 노출 + 기존 6-stage pipeline 정책 평가(CONTRACT_WHITELIST + SPENDING_LIMIT) 코드 변경 없이 통합. 17/17 requirements PASS, tech debt 0건.

## Shipped: v28.2 0x EVM DEX Swap

v28.2 shipped. 0x Swap API v2를 IActionProvider 프레임워크에 통합하여 AI 에이전트가 19+ EVM 체인에서 DEX 토큰 스왑 수행. ZeroExApiClient(native fetch + Zod 검증) + ZeroExSwapActionProvider(AllowanceHolder 20체인 주소, 슬리피지 클램프) 구현. SettingsService SSoT 패턴, resolve() 배열 순차 파이프라인, provider-trust 정책 바이패스, Admin UI Actions 페이지 추가. 22/22 requirements PASS, 7 issue fixes.

## Shipped: v28.4 Liquid Staking (Lido + Jito)

v28.4 shipped. Lido(ETH→stETH) + Jito(SOL→JitoSOL) Liquid Staking ActionProvider 구현. LidoStakingActionProvider(ABI 직접 인코딩, Withdrawal Queue unstake), JitoStakingActionProvider(SPL Stake Pool, 순수 TS PDA 유틸), IAsyncStatusTracker(LidoWithdrawalTracker + JitoEpochTracker + 동적 notificationEvent), GET /v1/wallet/staking 포지션 API(APY + USD 환산 + pending unstake), MCP 4 도구 자동 노출 + Admin UI 스테이킹 섹션 + actions.skill.md 문서화. Pipeline gap closure: bridge_status 기록 + actionProvider metadata 영속화. 25/25 requirements PASS.

## Shipped: v28.5 가스비 조건부 실행

v28.5 shipped. 트랜잭션 파이프라인에 가스비 조건부 실행 기능 추가. GasCondition Zod schema(maxGasPrice/maxPriorityFee/timeout, at-least-one refine) + 7-type discriminatedUnion 전체 적용, Pipeline Stage 3.5(정책 평가→대기 사이 가스 조건 평가 삽입), GasConditionTracker(IAsyncStatusTracker, EVM eth_gasPrice + Solana getRecentPrioritizationFees raw JSON-RPC, 10s 캐시, 배치 평가), gas_condition.* Admin Settings 5키(런타임 조정), daemon executeFromStage4 재진입(GAS_WAITING→PENDING→Stage 4+5+6 실행), TX_GAS_WAITING/TX_GAS_CONDITION_MET/TX_CANCELLED 알림 이벤트 + i18n. REST API gasCondition OpenAPI 문서화, Admin UI Gas Condition 설정 섹션, MCP 5 tools gas_condition 파라미터, TS/Python SDK GasCondition 타입, ActionProvider gasCondition 파이프라인 주입, transactions.skill.md section 14 문서화. 25/25 requirements PASS, tech debt 2건(cosmetic).

---
## Shipped: v28.6 RPC Pool 멀티엔드포인트 로테이션

v28.6 shipped. 네트워크당 복수 RPC 엔드포인트 등록·로테이션 구현. RpcPool(round-robin, cooldown, event emission) + AdapterPool.withRpcPool() + BUILT_IN_RPC_DEFAULTS 13네트워크 + rpc_pool.* Settings 5키 + Admin RPC Endpoints 탭(status polling, URL 관리, built-in toggle) + hot-reload replaceNetwork() + RPC health 알림(DEGRADED/ALL_FAILED/RECOVERED). 25/25 requirements PASS.

## Shipped: v28.8 빌트인 지갑 프리셋 자동 설정

v28.8 shipped. Owner 등록 시 wallet_type 지정으로 signing SDK/approval_method/preferred_wallet 4단계 자동 설정 원클릭 완료 + Push Relay 선언적 페이로드 변환. BUILTIN_PRESETS 레지스트리(D'CENT 1종, WalletPreset → WalletLinkConfig 자동 매핑) + DB v24 마이그레이션(wallets.wallet_type nullable TEXT) + Owner API wallet_type 필드 확장(Zod 검증, 프리셋 우선 적용, warning 응답). PresetAutoSetupService 4단계 파이프라인(signing SDK enable → WalletLinkRegistry → approval_method → preferred_channel) + Settings 스냅샷 롤백. Admin UI Owner 등록 폼 지갑 종류 드롭다운(빌트인 프리셋 + Custom). Push Relay ConfigurablePayloadTransformer(static_fields 주입 + category_map 카테고리별 매핑) + NtfySubscriber 파이프라인 통합 + bypass 패턴(미설정 시 zero-overhead). 14/14 requirements PASS, tech debt 3건(WALLET_PRESETS Admin 중복, VERIFICATION.md 미생성 2건, 전부 Low).

## Shipped: v29.0 고급 DeFi 프로토콜 설계

v29.0 shipped. 상태를 가진 DeFi 포지션 관리를 위한 3개 프레임워크(ILendingProvider, IYieldProvider, IPerpProvider)와 공통 인프라(defi_positions 테이블 + PositionTracker + DeFiMonitorService 3개 모니터), Intent 서명 패턴(SignableOrder EIP-712)을 설계 수준에서 완전 정의. m29-00 설계 문서에 26개 섹션(5-26) 추가, 총 59 설계 결정 수립. 포지션 인프라(DB v25, 차등 폴링, 배치 쓰기), 모니터링 프레임워크(HealthFactor 적응형/Maturity 일간/Margin 분간), Lending(Aave V3/Kamino/Morpho 매핑), Yield(Pendle V2 매핑 + 만기 관리), Perp(Drift V2 매핑 + 마진 모니터링), Intent(10-step 파이프라인 + 4-layer 보안 모델) 완성. m29-02~m29-14 구현 마일스톤 입력 산출물 전량 확보. 38/38 requirements PASS, audit passed.

## Shipped: v29.2 EVM Lending -- Aave V3

v29.2 shipped. DeFi Lending 프레임워크(ILendingProvider/IPositionProvider, PositionTracker 5분 sync, HealthFactorMonitor 4단계 severity, LendingPolicyEvaluator) 구축 + Aave V3를 첫 번째 Provider로 구현. supply/borrow/repay/withdraw 4액션, manual hex ABI encoding, 5-chain(Ethereum/Arbitrum/Optimism/Polygon/Base) 지원. 적응형 HF 모니터링(< 1.5 시 폴링 5분→1분), Lending 정책(max_ltv_pct + 비지출 분류), REST API + MCP 6도구 + TS/Python SDK, Admin UI DeFi 포지션 대시보드 + Aave V3 Settings 4키 런타임 조정. 34/34 requirements PASS.

## Shipped: v29.3 기본 지갑/기본 네트워크 개념 제거

v29.3 shipped. default_wallet/default_network 개념을 제거하고 명시적 walletId/network 선택 모델로 전환. DB 마이그레이션(sessions.default_wallet_id 제거, wallets.default_network 제거), resolveWalletId 단순화, JWT wlt claim 필수화, API network 파라미터 필수화. 231 파일 수정, 72/72 requirements PASS.

## Shipped: v29.4 Solana Lending (Kamino)

v29.4 shipped. Kamino K-Lend를 ILendingProvider 구현체로 구축. KaminoLendingProvider(4 actions: supply/borrow/repay/withdraw), @kamino-finance/klend-sdk 래핑 SDK 추상화(IKaminoSdkWrapper + MockKaminoSdkWrapper), HF 시뮬레이션 모듈(calculateHealthFactor/simulateKaminoHealthFactor/hfToStatus, Number 연산), borrow/withdraw 자기 청산 방지 가드, PositionTracker duck-type IPositionProvider 자동 등록, Admin Settings 3키(kamino.enabled/market/hf_threshold), MCP 4도구 자동 노출(mcpExpose: true), Admin UI 7th provider card, actions.skill.md Section 9 문서화. KINT-07 버그 수정: LendingPolicyEvaluator endsWith('borrow') suffix matching으로 provider-prefixed action name 정책 평가 정상화. 21/21 requirements PASS.

## Shipped: v29.5 내부 일관성 정리

v29.5 shipped. API 키 이중 저장소 버그(#214) 수정(ApiKeyStore 제거, SettingsService SSoT, DB migration v28로 api_keys→settings 마이그레이션). Solana 네트워크 ID 통일(#211)(solana-mainnet/solana-devnet/solana-testnet 전 스택 적용, DB migration v29 6 테이블 12-step recreation, normalizeNetworkInput 레거시 자동 변환, config.toml rpcConfigKey 양방향 매핑). Push Relay 서명 응답 릴레이(#215)(POST /v1/sign-response + sendViaRelay SDK 함수). 18/18 requirements PASS.

## Shipped: v29.6 Pendle Yield Trading + Yield 프레임워크

v29.6 shipped. DeFi Yield 프레임워크 구축(IYieldProvider 인터페이스, MATURED 포지션 상태, MaturityMonitor 만기 경고 서비스) + Pendle Finance 첫 Yield Provider 구현(PendleApiClient REST API v2 래퍼, PendleYieldProvider 5 액션: buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity). Convert 엔드포인트로 calldata 빌드 → ContractCallRequest 반환, SDK 의존성 없이 REST API만 사용. Admin Settings 7키 런타임 조정, MCP 5도구 자동 등록, actions.skill.md Pendle 섹션 추가. MaturityMonitor 1일 1회 폴링으로 만기 7일/1일 전 경고 + 만기 후 미상환 경고, 24시간 쿨다운. 추가 버그 수정: #216 Solana WSS URL prefix, #217 Lido factory default network residue. 18/18 requirements PASS.

## Shipped: v29.8 Solana Perp DEX (Drift) + Perp 프레임워크

v29.8 shipped. IPerpProvider+MarginMonitor+PerpPolicyEvaluator(3정책) Perp 프레임워크 구축 + DriftPerpProvider(5액션: openPosition/closePosition/increasePosition/addCollateral/withdrawCollateral) mock-first 구현. Admin UI Perp 포지션 뷰 + MCP 26도구 + actions.skill.md Perp 섹션. 22/22 requirements PASS.

## Shipped: v29.9 세션 점진적 보안 모델

v29.9 shipped. 세션 수명 모델을 글로벌 설정에서 per-session 선택적 지정으로 전환. 무제한 세션(expiresAt=0) 기본값, exp 클레임 없는 JWT 발급, RENEWAL_NOT_REQUIRED 갱신 거부. Admin Settings 3키(session_ttl/session_absolute_lifetime/session_max_renewals) 삭제, DaemonConfig 동기화. MCP SessionManager 무제한 토큰 처리, CLI --ttl 리네임(일→초), SDK expiresIn→ttl, Admin UI Create Session Advanced 섹션, Skill 파일 4개 동기화. DB schema v32 (maxRenewals default 0). 25/25 requirements PASS.

## Shipped: v29.10 ntfy 토픽 지갑별 설정 전환

v29.10 shipped. 글로벌 단일 ntfy_topic 설정을 제거하고 wallet_apps 테이블 기반 per-wallet sign_topic/notify_topic 관리 체계로 전환. DB migration v33(sign_topic/notify_topic nullable TEXT, 기존 행 prefix+appName 기본값 backfill). SignRequestBuilder/WalletNotificationChannel DB 기반 토픽 라우팅(NULL시 prefix fallback). 글로벌 NtfyChannel 인스턴스 제거(daemon.ts, hot-reload). REST API sign_topic/notify_topic 필드 추가(POST/PUT/GET wallet-apps). Admin Settings notifications.ntfy_topic 설정 키 삭제. Admin UI Notifications 페이지 글로벌 Ntfy 카드 제거 + Human Wallet Apps 토픽 표시/인라인 편집. admin.skill.md 동기화. 21/21 requirements PASS.

## Shipped: v30.0 운영 기능 확장 설계

v30.0 shipped. 운영 환경에서 필요한 6가지 기능을 설계 수준에서 정의한 마일스톤. (1) Transaction Dry-Run: SimulationResult Zod 스키마(12 warning codes, policy/fee/balanceChanges/warnings 4-axis), PipelineContext 별도 executeDryRun() 메서드(부수 효과 격리), POST /v1/transactions/simulate + SDK simulate() + MCP tool 스펙. (2) Audit Log Query API: AuditEventType 20개(기존 9 + 신규 11), cursor pagination(id AUTOINCREMENT), GET /v1/audit-logs masterAuth, insertAuditLog raw SQL helper. (3) Encrypted Backup: AES-256-GCM 암호화 아카이브 바이너리 포맷(60B 고정 헤더 + 평문 메타데이터 + 암호화 페이로드), EncryptedBackupService(VACUUM INTO 원자적 스냅샷, Argon2id KDF), CLI 4 커맨드, config.toml [backup] 3키, REST API POST/GET backup. (4) Webhook Outbound: webhooks+webhook_logs 2 DB 테이블(19→21), HMAC-SHA256 서명(X-WAIaaS-Signature), 4-attempt 재시도 큐(지수 백오프), REST API 4 엔드포인트, EventBus 연동, AuditEventType 20 이벤트 재사용, secret dual-storage(SHA-256 hash + AES-256-GCM). (5) Admin Stats: AdminStatsResponseSchema 7-category Zod(transactions/sessions/wallets/rpc/autostop/notifications/system), IMetricsCounter 인메모리 카운터, DB 10쿼리(기존 인덱스 활용), 1분 TTL 캐시. (6) AutoStop Plugin: IAutoStopRule(evaluate/tick/getStatus/updateConfig), RuleRegistry Map 기반, RuleAction 분리, per-rule Admin Settings 토글. 40+ 설계 결정, 25/25 requirements PASS.

## Shipped: v30.2 운영 기능 확장 구현

v30.2 shipped. v30.0에서 설계한 6가지 운영 기능을 구현. TX Dry-Run(simulate API), Audit Log Query(20 events), Encrypted Backup(AES-256-GCM), Webhook(HMAC-SHA256), Admin Stats(7-category), AutoStop Plugin(IAutoStopRule+RuleRegistry). 106 commits, ~246,245 LOC TS.

## Shipped: v30.6 ERC-4337 Account Abstraction 지원

v30.6 shipped. EVM 지갑에 ERC-4337 스마트 어카운트 옵션 추가. SmartAccountService(viem toSoladySmartAccount, EntryPoint v0.7 전용, CREATE2 주소 예측), DB v38(account_type/signer_key/deployed/entry_point 4 컬럼 추가, EOA 기본값 backward compat), Admin Settings 25개 정의(smart_account.enabled feature gate, bundler/paymaster URL, chain-specific overrides, paymaster_api_key AES-GCM 암호화). UserOperation Pipeline(stage5Execute accountType 분기, BundlerClient/PaymasterClient factory, BATCH 원자적 실행 calls[] 단일 UserOp, lazy deployment initCode 포함, gas safety margin 120%). Paymaster Gas Sponsorship(paymaster_url 설정 시 자동 스폰서십, rejection 패턴 감지 PAYMASTER_REJECTED, PAY_02 agent 직접 가스 지불 폴백). 전 인터페이스 확장(CLI --account-type, SDK createWallet(accountType), MCP wallet detail fetch, Admin UI Account Type 셀렉터 + Smart Account 설정 섹션, wallet/quickstart/admin 스킬 파일 3개 업데이트). 86 새 테스트, 21 commits, 49 files, +4,709 lines.

## Shipped: v30.8 ERC-8004 Trustless Agents 지원

v30.8 shipped. ERC-8004 온체인 레지스트리(Identity/Reputation/Validation)를 WAIaaS에 통합. Erc8004ActionProvider(8 write actions), Erc8004RegistryClient(viem 래퍼), DB v39-40(agent_identities+reputation_cache+approval_type+policies CHECK), ReputationCacheService(3-tier cache: memory→DB→RPC, TTL 300s), REPUTATION_THRESHOLD 정책(Stage 3 position 6, maxTier 에스컬레이션, unrated_tier 처리), EIP-712 typed data 월렛 링킹(AgentWalletSet typehash, dual approval SIWE/EIP712, WcSigningBridge calldata re-encoding), 4 GET REST 엔드포인트 + connect-info erc8004 확장, MCP 11도구 + SDK 11메서드, Admin UI ERC-8004 페이지(3탭) + 정책 폼 + BUILTIN_PROVIDERS, erc8004.skill.md 612 lines, 182 새 테스트. 50 commits, 121 files, +15,921 lines. 39/39 requirements PASS.

## Shipped: v30.9 Smart Account DX 개선

v30.9 shipped. Smart Account 글로벌 설정(23개 키)을 지갑별 프로바이더 모델로 전환. AA_PROVIDER_NAMES enum(pimlico/alchemy/custom), AA_PROVIDER_CHAIN_MAP(10 EVM networks × 2 providers), DB v41(aa_provider/aa_api_key_encrypted/aa_bundler_url/aa_paymaster_url 4 컬럼), AES-256-GCM API key 암호화(HKDF 기반). Provider resolver 리팩토링(WalletProviderData → smart-account-clients.ts), smart_account.enabled 기본값 true. PUT /v1/wallets/:id/provider dual-auth(masterAuth + sessionAuth, wallet ownership 검증), PROVIDER_UPDATED 21st audit event. Wallet 응답 provider 필드 확장(name/supportedChains/paymasterEnabled). Admin UI 조건부 프로바이더 필드 + dashboard link 동적 전환 + detail page inline edit. connect-info provider prompt + MCP get_provider_status 29th tool + smart_account capability. 74 새 테스트, 33 commits, 73 files, +7,214 lines.

---
## Shipped: v31.0 NFT 지원 (EVM + Solana)

v31.0 shipped. EVM(ERC-721/ERC-1155)과 Solana(Metaplex) NFT 지원. NFT_TRANSFER 6번째 discriminatedUnion type(NftTokenInfoSchema, token/amount/to/network), APPROVE nft 확장(tokenId+standard 선택 필드), DB v44 nft_metadata_cache(contract_address+token_id+chain unique, 24h TTL), CAIP-19 NFT 네임스페이스(erc721/erc1155/metaplex, nftAssetId 헬퍼), 5개 NFT 에러 코드. INftIndexer 3-method 인터페이스(listNfts/getNftMetadata/getNftsByCollection), AlchemyNftIndexer(EVM NFT API v3, 10 EVM 네트워크 매핑), HeliusNftIndexer(DAS JSON-RPC), NftIndexerClient(지수 백오프 재시도 max 3, Retry-After, 캐시 TTL 300s, AES-256-GCM API 키 암호화). IChainAdapter 25 메서드(+transferNft/approveNft/buildNftTransferTx), ERC-165 supportsInterface 표준 자동 감지, ERC-721/1155 safeTransferFrom, Metaplex SPL transfer decimals=0. NFT Query API(GET /v1/wallet/nfts + /wallets/{id}/nfts, 커서 페이지네이션, groupBy=collection, tokenIdentifier 메타데이터 조회, IPFS/Arweave 게이트웨이 변환). NFT_TRANSFER 6-stage 파이프라인(buildByType dispatch, buildNftTransferTx, gas estimation), Smart Account UserOp(buildUserOpCalls walletAddress param), NFT 승인(approve/setApprovalForAll/delegate), 승인 상태 조회 API, RATE_LIMIT nft_count 카운터, CONTRACT_WHITELIST NFT 검증, 기본 tier APPROVAL. MCP 3도구(list_nfts/get_nft_metadata/transfer_nft), SDK 3메서드, connect-info nftSummary(graceful degradation), Admin UI NFT 탭(그리드/리스트 뷰, 이미지 썸네일, 상세 모달), CSP img-src IPFS/Arweave 5 도메인, 인덱서 설정 UI, nft.skill.md 신규 + wallet/transactions 스킬 업데이트. 38 commits, 112 files, +12,784 lines, 108 새 테스트.

## Shipped: v31.2 UserOp Build/Sign API

v31.2 shipped. Smart Account 지갑에서 프로바이더 없이 UserOperation을 구성/서명할 수 있는 Build/Sign API 제공. Provider Lite/Full 모드 자동 분기(aaProvider=null → Lite, aaProvider set → Full), Lite 모드에서 send 차단 + userop API 안내. POST /v1/wallets/:id/userop/build(TransactionRequest → unsigned UserOp, nonce EntryPoint v0.7 직접 조회, factory/factoryData 미배포 자동 감지, Bundler 불필요). POST /v1/wallets/:id/userop/sign(callData 이중 검증 + sender 일치 확인 + INSTANT 정책 평가 + smartAccount.signUserOperation + 키 즉시 해제). DB v45 userop_builds 테이블(buildId PK, TTL 10분, cleanup 워커). USEROP_BUILD/USEROP_SIGNED 감사 이벤트(23 total). connect-info userop capability(프로바이더 유무 무관, Smart Account만 필요). MCP build_userop/sign_userop 2도구 + SDK buildUserOp()/signUserOp() 2메서드(masterAuth). Admin UI Provider None (Lite mode) 기본 옵션 + Lite/Full 배지(상세/목록). 스킬 파일 3개 동기화(transactions/wallet/admin). 4 phases, 8 plans, 58 requirements, 27 commits, 64 files, +6,821/-186 lines.

## Shipped: v31.3 DCent Swap Aggregator 통합

v31.3 shipped. DCent Swap Backend API 통합. DcentSwapApiClient(7 endpoints, 24h stale-while-revalidate currency cache), currency-mapper(CAIP-19 ↔ DCent Currency ID 양방향, 8 native token mappings), DEX Swap(approve+txdata BATCH pipeline, min/max validation, provider sorting), Exchange(payInAddress TRANSFER + ExchangeStatusTracker polling + 4 notification events), auto-router(6 EVM chains, ETH/USDC/USDT intermediate tokens, 2-hop fallback), DcentSwapActionProvider(IActionProvider, 4 actions), 4 MCP tools + 4 SDK methods + 7 Admin Settings + connect-info capability + skill files 2개. 5 phases, 9 plans, 37 requirements, 54 commits, 110 files, +11,612 lines, 116 tests.

## Shipped: v31.4 Hyperliquid 생태계 통합

v31.4 shipped. HyperEVM Mainnet/Testnet(Chain ID 999/998) 체인 등록 + Hyperliquid L1 DEX(Perp/Spot) + Sub-account 관리. ApiDirectResult 패턴(off-chain DEX API → Stage 5 CONFIRMED 분기), EIP-712 dual signing(phantom agent L1 Action chainId 1337 + User-Signed HyperliquidSignTransaction chainId 42161), HyperliquidSigner + ExchangeClient(RateLimiter 600 weight/min) + MarketData(15 query methods) 공유 인프라, HyperliquidPerpProvider(7 actions: market/limit/SL/TP/cancel/leverage/margin mode, margin 기반 정책 평가), HyperliquidSpotProvider(3 actions: buy/sell/cancel, asset index 10000+ 매핑, size*price 정책), HyperliquidSubAccountProvider(create/transfer User-Signed Actions), DB v51 hyperliquid_orders + DB v52 hyperliquid_sub_accounts, 22 MCP tools + 22 SDK methods + 9 Admin Settings + Admin UI 5-tab page(Overview/Orders/Spot/Sub-accounts/Settings, 10s auto-refresh) + connect-info hyperliquid capability + skill files 3개. 5 phases, 12 plans, 44 requirements, 38 commits, 112 files, +12,755 lines, design doc 78.

---
## Shipped: v31.7 E2E 자동 검증 체계

v31.7 shipped. E2E 자동 검증 체계 구축. @waiaas/e2e-tests 독립 패키지(E2EScenario 타입, DaemonManager/PushRelayManager 라이프사이클, SessionManager/E2EHttpClient 헬퍼), 오프체인 스모크 15개 시나리오(코어 인증/지갑/세션/정책, 인터페이스 Admin/MCP/SDK/알림/토큰/백업, 고급 Smart Account/UserOp/x402/ERC-8004/8128/DeFi/Push Relay), CI/CD(e2e-smoke.yml RC 트리거 + 실패 시 GitHub Issue 자동 생성 + CI 리포터), 온체인 E2E(PreconditionChecker 데몬/지갑/잔액 확인 + 5 testnet 시나리오: ETH/SOL/ERC-20/SPL 전송, Lido 스테이킹, Hyperliquid Spot/Perp, NFT ERC-721/1155, skip 유틸리티), E2E 시나리오 등록 강제(Provider↔시나리오/API↔시나리오 매핑 CI fail + 빈 파일 방지), #282/#283 이슈 해결. 8 phases, 21 plans, 47 requirements, 55 commits, 122 files, +12,359 lines.

---
## Shipped: v31.8 Agent UAT (메인넷 인터랙티브 검증)

v31.8 shipped. Agent UAT 마크다운 시나리오 체계 구축. 6-section 표준 포맷(Metadata/Prerequisites/Steps/Verification/Cost/Troubleshooting) + YAML 프론트매터(category/network/requires_funds/risk_level), `/agent-uat` skill 파일(help/run/run testnet 등 서브커맨드), _index.md 카테고리별 인덱스(45 시나리오), Testnet 8개(wallet-crud + ETH/SOL/ERC-20/SPL/Hyperliquid/NFT/수신TX), Mainnet 전송 6개(ETH/SOL/ERC-20/SPL/L2/NFT), DeFi 12개(Jupiter/0x/LI.FI/Across/Lido/Jito/Aave/Kamino/Pendle/Drift/Hyperliquid/DCent), Advanced 6개(Smart Account/WalletConnect/x402/수신TX/잔액모니터링/가스조건부), Admin 13개(페이지접근/인증/Dashboard/Settings/정책/지갑/NFT/DeFi/알림/감사로그/백업/토큰/통계), CI 4개 검증 스크립트(Provider맵/포맷/인덱스/Admin라우트) + ci.yml Stage 1 통합. 5 phases, 12 plans, 56 requirements, 41 commits, 89 files, +10,962 lines.

---
## Shipped: v31.14 EVM RPC 프록시 모드

v31.14 shipped. WAIaaS 데몬이 EVM JSON-RPC 프록시로 동작하여 Forge/Hardhat/ethers.js/viem 등 기존 EVM 개발 도구가 `--rpc-url`만 변경하면 WAIaaS 정책 엔진+서명 파이프라인 아래에서 컨트랙트 배포 및 온체인 인터랙션을 수행할 수 있다. CONTRACT_DEPLOY 9번째 트랜잭션 타입(Zod SSoT 전체 전파, DB v58), JSON-RPC 2.0 프록시 엔드포인트(10 signing intercept + 19 passthrough + batch), DELAY/APPROVAL Long-poll 비동기 승인(CompletionWaiter + SyncPipelineExecutor, 기존 파이프라인 zero modification), Admin Settings 7키(rpc_proxy.*) + Admin UI RPC Proxy 페이지, MCP get_rpc_proxy_url + SDK getRpcProxyUrl() + connect-info rpcProxyBaseUrl 자동 발견, 보안(sessionAuth + from 검증 + bytecodeSize 제한 + audit log source). 4 phases (398-401), 11 plans, 49 requirements, 31 commits, 82 files, +9,485 lines, ~189 tests.

---
*최종 업데이트: 2026-03-31 after v33.0 milestone start*
