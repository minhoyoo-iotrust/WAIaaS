# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v29.7 — D'CENT 직접 서명 + Human Wallet Apps 통합

**Shipped:** 2026-03-01
**Phases:** 6 | **Plans:** 11 | **Sessions:** 1

### What Was Built
- D'CENT preset sdk_ntfy 전환 — approval_method를 walletconnect에서 sdk_ntfy로 변경, wallet_type 기반 서명 토픽 라우팅
- Admin UI Owner 탭 개선 — Wallet Type 선택/변경 UI, approval method 미리보기, WalletConnect 조건부 표시, 상태별 읽기 전용
- wallet_apps DB 테이블(migration v31) + WalletAppService CRUD + REST API 4 엔드포인트 + signing_enabled 차단
- Human Wallet Apps Admin UI 최상위 메뉴 — 앱 카드(Signing/Alerts 토글, Used by 목록), ntfy 서버 설정, 앱 등록/삭제
- WalletNotificationChannel 앱별 토픽(waiaas-notify-{name}) 발행 전환 + Alerts 토글 반영
- Notifications ntfy 독립 FieldGroup 분리 + Human Wallet Apps 링크

### What Worked
- 6 phases 전체 1일 완료 — 설계 문서(m29-07)가 DB 스키마/API/UI까지 상세히 정의되어 빠른 구현
- wallet_apps DB 테이블 정규화 결정이 Used by 역추적, signing_enabled 차단, alerts_enabled 라우팅 전부 깔끔하게 해결
- 기존 PresetAutoSetupService의 sdk_ntfy case 분기를 재활용하여 코드 변경 최소화
- Admin UI 컴포넌트 패턴(FieldGroup, Toggle, Card) 재사용으로 293/295 구현이 빠름

### What Was Inefficient
- REQUIREMENTS.md traceability 상태가 대부분 Pending으로 유지된 채 아카이브 — 자동 상태 업데이트 미구현 (반복 이슈)
- Phase 291 plan 목록에 `[ ]` 체크 미갱신 (ROADMAP.md의 Plan checklist가 수동)

### Patterns Established
- wallet_apps 정규화 테이블 패턴: 앱 엔티티를 Settings key-value가 아닌 DB 테이블로 관리, FK 역추적 자연스러움
- 앱별 토픽 네이밍: signing용 `waiaas-sign-{wallet_apps.name}`, alerts용 `waiaas-notify-{wallet_apps.name}` — 동일 네임스페이스
- Admin UI 메뉴 승격 패턴: 기존 서브섹션 제거 → 최상위 메뉴 추가 + 설정 키 유지(내부 호환)

### Key Lessons
1. DB 테이블 정규화가 Settings JSON보다 확장성 높음 — CRUD + 토글 + 역추적 + 차단 로직 전부 SQL로 해결
2. 프리셋 변경은 정의 변경만으로 기존 로직 분기가 자동 활성화 — 코드 수정 최소화 설계의 가치
3. "Human Wallet Apps" 네이밍이 기술 용어("Signing SDK")보다 사용자 친화적 — 메뉴 구조가 사용자 멘탈 모델과 일치

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 73 파일, +7,424/-428 lines, 1일 완료 — DB+API+UI 풀스택 구현이 설계 문서 덕분에 빠름

---

## Milestone: v29.6 — Pendle Yield Trading + Yield 프레임워크

**Shipped:** 2026-03-01
**Phases:** 3 | **Plans:** 8 | **Sessions:** 1

### What Was Built
- IYieldProvider 인터페이스 — IActionProvider 확장, getMarkets/getPosition/getYieldForecast 3 메서드, MATURED 포지션 상태 추가
- PendleYieldProvider — 5 Yield 액션(buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity), Pendle REST API v2 Convert 엔드포인트 기반
- PendleApiClient — Pendle REST API v2 래퍼, Zod 스키마 검증, 무료 티어 100 CU/분 지원
- MaturityMonitor — IDeFiMonitor 구현, 1일 1회 폴링, 만기 7일/1일 전 경고 + 만기 후 미상환 경고, 24시간 쿨다운
- Admin Settings 7키 + MCP 5도구 자동 등록 + actions.skill.md Pendle Yield Trading 섹션
- 버그 수정: #216 Solana WSS URL prefix, #217 Lido factory default network residue

### What Worked
- v29.0 설계 문서(Phase 271 Yield 프레임워크 설계)가 구현 방향을 명확히 하여 빠른 구현 가능
- REST API Convert 엔드포인트 선택으로 SDK 의존성 없이 깔끔한 구현 — 외부 의존성 최소화 전략 유효
- 기존 ActionProvider/PositionTracker/DeFi 모니터링 프레임워크 재사용 — v29.0/v29.2에서 구축한 인프라의 가치 확인
- 50 파일 변경만으로 완전한 Yield Trading 스택 구현 — 프레임워크 추상화가 잘 작동

### What Was Inefficient
- Phase directory에 SUMMARY.md 없이 작업 완료 — GSD 추적과 실제 코드 커밋 사이 동기화 누락
- REQUIREMENTS.md traceability 상태가 Pending으로 유지된 채 아카이브 — 자동 상태 업데이트 미구현

### Patterns Established
- Yield Provider 패턴: IYieldProvider extends IActionProvider + Convert API calldata → ContractCallRequest 반환
- DeFi Provider 3-tier 구성: ApiClient(HTTP 래퍼) → Provider(IYieldProvider 구현) → Integration(Settings+MCP+Admin)
- MaturityMonitor 패턴: IDeFiMonitor + 만기 기반 경고 3단계(7일/1일/만기후) + 쿨다운

### Key Lessons
1. REST API 기반 DeFi Provider 패턴이 확립됨 — SDK 없이 HTTP calldata 빌드 → ContractCallRequest 반환이 표준 패턴
2. v29.0 설계 단계에서의 인터페이스 정의가 구현 속도를 극대화 — 설계 투자 ROI 확인
3. Pendle 무료 티어(100 CU/분)로도 기본 기능 충분 — 유료 API 키는 선택적 최적화

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 1일 완료, 50 파일 +3,940 lines — DeFi Provider 추가가 프레임워크 덕분에 빠름

---

## Milestone: v29.5 — 내부 일관성 정리

**Shipped:** 2026-02-28
**Phases:** 3 | **Plans:** 7 | **Sessions:** 1

### What Was Built
- API 키 이중 저장소 해소: ApiKeyStore 완전 제거, SettingsService SSoT 통합, DB migration v28 (api_keys→settings)
- Solana 네트워크 ID 전 스택 통일: `solana-mainnet` 형식, DB migration v29 (6 테이블 12-step recreation), 레거시 자동 변환
- Push Relay 서명 응답 릴레이: POST /v1/sign-response 엔드포인트 + sendViaRelay() SDK 함수
- normalizeNetworkInput() + NetworkTypeEnumWithLegacy Zod preprocess 하위 호환 레이어

### What Worked
- Issue-driven milestone: #214/#211/#215 세 가지 구체적 이슈에 집중하여 스코프가 명확했음
- DB migration 순서 결정(v28→v29)을 사전에 확정하여 충돌 없이 순차 적용
- Audit 선행으로 skills 파일 네트워크 예시 오류 2건 사전 수정
- 156 파일 변경에도 불구하고 5,595+ 전체 테스트 PASS — 기존 테스트 인프라의 가치 확인

### What Was Inefficient
- Phase 287 (Push Relay)은 quick task로 처리되어 phase directory/SUMMARY.md 없음 — gsd-tools roadmap analyze에서 누락
- REQUIREMENTS.md traceability 상태가 Pending으로 유지됨 (audit에서는 satisfied 확인) — 자동 업데이트 미구현

### Patterns Established
- config.toml 키 유지 + 런타임 양방향 매핑(`rpcConfigKey`/`configKeyToNetwork`) — 네이밍 변경 시 config 호환 패턴
- Zod preprocess + normalizer 조합으로 API 하위 호환 레이어 구축

### Key Lessons
1. 내부 일관성 마일스톤은 기능 추가보다 파일 변경이 광범위하지만 오래 끌리지 않음 — 1일 완료
2. 이중 저장소 문제는 발견 즉시 SSoT 통합이 최선 — dual-write나 sync보다 단일 저장소 전환
3. 네트워크 ID 리네이밍은 DB migration + Zod preprocess + config 매핑 3-layer로 하위 호환 확보 가능

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 156 파일 변경, 순 삭제(-1,220 > +3,990 중 상당수 테스트 업데이트) — 정리 마일스톤 특성

---

## Milestone: v29.0 — 고급 DeFi 프로토콜 설계

**Shipped:** 2026-02-26
**Phases:** 6 | **Plans:** 12 | **Sessions:** 1

### What Was Built
- defi_positions 통합 테이블 + PositionTracker 차등 폴링 + REST API + Admin 와이어프레임
- IDeFiMonitor 공통 프레임워크 + 3개 모니터(HealthFactor/Maturity/Margin) + 4 알림 이벤트
- ILendingProvider + IYieldProvider + IPerpProvider 3개 프레임워크 + 프로토콜 매핑(Aave/Kamino/Morpho/Pendle/Drift)
- SignableOrder EIP-712 Intent 서명 패턴 + 10-step 파이프라인 + 4-layer 보안 모델
- m29-00 설계 문서 26개 섹션, 59 설계 결정

### What Worked
- 인프라-우선 순서(positions → monitoring → frameworks → intent)로 의존성 자연 해소
- 6 phases 전체를 1 세션에 완료 — 설계 마일스톤은 실행 속도가 빠름
- 기존 IActionProvider/PolicyEngine 패턴 재사용으로 프레임워크 설계 일관성 확보
- Audit 선행으로 갭 사전 식별 (4건 low-severity, 전부 구현 시 해결 가능)

### What Was Inefficient
- SUMMARY.md 포맷 불일치 (268은 markdown, 269-273은 YAML frontmatter) — gsd-tools summary-extract 실패
- Audit에서 발견한 slug 오타(273-01 → '272-perp-framework-design') 수정 미반영

### Patterns Established
- DeFi 프레임워크 설계 패턴: IXxxProvider extends IActionProvider + XxxPolicyEvaluator + XxxMonitor + 프로토콜 매핑
- 설계 마일스톤에서 m{seq}-{sub} 설계 문서 섹션 번호 체계 활용

### Key Lessons
1. 설계 마일스톤은 6 phases도 1일 1세션에 완료 가능 — 코드 작성 없이 문서만 산출
2. 프로토콜 매핑 테이블은 구현 시 가장 유용한 산출물 — API/SDK/ABI 호출 매핑 미리 정의

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 설계 문서 전용 마일스톤은 context 효율적 (코드 변경 없음, +11,805 lines docs only)

---

## Milestone: v29.10 — ntfy 토픽 지갑별 설정 전환

**Shipped:** 2026-03-02
**Phases:** 2 | **Plans:** 4 | **Sessions:** 1

### What Was Built
- DB migration v33: wallet_apps 테이블에 sign_topic/notify_topic 컬럼 추가, 기존 행 prefix+appName 기본값 backfill
- SignRequestBuilder/WalletNotificationChannel DB 기반 per-wallet 토픽 라우팅 (NULL시 prefix fallback)
- 글로벌 NtfyChannel 인스턴스 제거 (daemon.ts, hot-reload) — per-wallet 토픽이 유일한 알림 경로
- REST API wallet-apps 엔드포인트에 sign_topic/notify_topic 필드 추가 (POST/PUT/GET)
- Admin UI Notifications 페이지 글로벌 Ntfy 카드 제거 + Human Wallet Apps per-wallet 토픽 표시/인라인 편집
- admin.skill.md per-wallet topic API 동기화

### What Worked
- v29.7에서 확립된 wallet_apps 테이블 패턴 활용으로 스키마 확장이 자연스러움 (sign_topic/notify_topic 2컬럼 추가만으로 해결)
- 2 phase 4 plan으로 범위가 명확하게 제한되어 ~1.5시간 만에 전체 완료
- NULL 토픽 = prefix fallback 전략으로 기존 동작 100% 하위호환 보장
- 글로벌 NtfyChannel 제거가 실질적 기능 손실 없이 깔끔하게 정리 (Push Relay 미구독 토픽이었으므로)

### What Was Inefficient
- 302-02 SUMMARY에서 보고된 pre-existing test failures (signing-sdk-migration, settings-service, migration-chain) — 이전 plan에서 발생한 assertion 변경이 후속 정리 안 됨
- Phase 303 ROADMAP.md에서 303-01 plan 체크박스가 unchecked(`[ ]`)인 채로 남음 — plan 완료 시 자동 반영 미구현 반복 이슈

### Patterns Established
- Per-wallet DB 토픽 라우팅 패턴: wallet_apps 컬럼 직접 저장 → channel에서 DB SELECT → NULL시 prefix 폴백
- 글로벌 설정 → 엔티티별 설정 마이그레이션 패턴: 설정 키 삭제 + DB 컬럼 추가 + backfill + fallback

### Key Lessons
- 엔티티별 설정으로 전환 시 NULL fallback 전략이 하위 호환성의 핵심 — 기존 코드가 중단 없이 동작
- Settings 키 삭제 시 hot-reload/daemon startup/admin 경로 3곳 동시 수정 필요 — 놓치면 런타임 crash

### Cost Observations
- Model mix: 100% opus (quality profile)
- Sessions: 1
- Notable: 범위가 작고 패턴이 확립되어 매우 효율적 (43 files, +2,877/-138 lines, 20 commits)

---

## Milestone: v30.0 — 운영 기능 확장 설계

**Shipped:** 2026-03-03
**Phases:** 5 | **Plans:** 11 | **Sessions:** 1

### What Was Built
- Transaction Dry-Run 설계 — SimulationResult Zod 스키마(12 warning codes, 4-axis), PipelineContext dryRun 분기, REST/SDK/MCP 스펙
- Audit Log Query API 설계 — AuditEventType 20개(9 기존 + 11 신규), cursor pagination, GET /v1/audit-logs masterAuth
- Encrypted Backup & Restore 설계 — AES-256-GCM 암호화 아카이브 포맷(60B 헤더), EncryptedBackupService, CLI 4 커맨드
- Webhook Outbound 설계 — HMAC-SHA256 서명, webhooks+webhook_logs DB, 4-attempt 재시도 큐, REST API 4 엔드포인트
- Admin Stats + AutoStop Plugin 설계 — 7-category Zod 스키마, IMetricsCounter, IAutoStopRule 플러그인, RuleRegistry

### What Worked
- 5 phases 전체 ~50분 완료 — 기존 코드베이스(233K LOC)에 대한 깊은 이해로 설계 결정이 빠르게 수렴
- 각 Phase DESIGN-SPEC.md에 Zod 스키마, 인터페이스, DB 스키마, API 스펙, 테스트 시나리오를 포함하여 구현 마일스톤의 입력이 완전함
- Phase 간 의존성(305→307, 304+305→308)이 자연스럽게 이벤트 체계를 공유하도록 설계
- 기존 패턴 재활용: insertAuditLog helper(raw SQL), IMetricsCounter(IForexRateService 패턴), RuleRegistry(ActionProviderRegistry 패턴)

### What Was Inefficient
- 없음 — 설계 전용 마일스톤이라 코드 변경 없이 순수 문서 작업

### Patterns Established
- OPS-* 설계 스펙 패턴: 각 기능을 독립 DESIGN-SPEC.md로 분리하되, 이벤트 체계(AuditEventType)를 공통 기반으로 공유
- Plugin Architecture 패턴: IAutoStopRule + RuleRegistry로 하드코딩 없는 규칙 확장, ActionProvider와 동일한 등록 패턴
- Secret dual-storage 패턴: 노출 방지용 해시 + 연산용 암호화 값 이중 저장

### Key Lessons
- 설계 전용 마일스톤은 50분 내 완료 가능 — 코드베이스 이해도가 높을 때 설계 결정이 빠르게 수렴
- 이벤트 체계를 먼저 확립하면(Phase 305 → 307, 308) 하위 기능 설계가 자연스럽게 정렬됨
- VACUUM INTO는 파일 복사보다 안전한 DB 스냅샷 방법 (WAL 일관성 보장)

### Cost Observations
- Model mix: 100% opus (quality profile)
- Sessions: 1
- Notable: 설계 전용 마일스톤 — 30 파일 ~50분 완료, +8,132 lines (대부분 DESIGN-SPEC.md)

---

## Milestone: v30.6 — ERC-4337 Account Abstraction 지원

**Shipped:** 2026-03-04
**Phases:** 3 | **Plans:** 10 | **Sessions:** 1

### What Was Built
- SmartAccountService — viem toSoladySmartAccount 기반 CREATE2 주소 예측, EntryPoint v0.7 전용
- DB migration v38 — wallets 테이블에 account_type/signer_key/deployed/entry_point 4 컬럼 추가
- Admin Settings 25개 — smart_account.enabled feature gate, bundler/paymaster URL, chain-specific overrides
- UserOperation Pipeline — stage5Execute accountType 분기, BundlerClient/PaymasterClient 연동, BATCH 원자적 실행
- Paymaster Gas Sponsorship — 자동 스폰서십 + rejection 패턴 감지 + agent 직접 가스 폴백
- 전 인터페이스 확장 — CLI --account-type, SDK createWallet, MCP wallet detail, Admin UI Account Type 셀렉터

### What Worked
- 3 phases 전체 ~2h 완료 — 기존 pipeline 아키텍처가 accountType 분기만으로 확장 가능했음
- viem/account-abstraction 모듈이 검증된 SmartAccount 구현체를 제공하여 커스텀 컨트랙트 불필요
- 기존 5-type TransactionRequestSchema 변경 없이 내부 실행 경로만 분기하여 EOA 호환성 100% 유지
- On-demand settings 패턴으로 hot-reload 인프라 불필요 — SmartAccountService가 요청 시마다 settings 읽기

### What Was Inefficient
- Phase 315 SUMMARY.md 미생성 — 4개 plan 실행 후 summary 파일 누락 (executor가 생성하지 않은 것으로 추정)
- REQUIREMENTS.md traceability 상태 전부 Pending으로 아카이브 — 자동 상태 업데이트 여전히 미구현

### Patterns Established
- accountType 분기 패턴: stage5Execute에서 EOA/Smart 실행 경로 분리, 나머지 pipeline(정책, 감사, 알림) 공유
- Paymaster rejection 패턴 매칭: error message에서 'paymaster'/'PM_'/'Paymaster' 문자열 감지

### Key Lessons
- viem 라이브러리의 타입 시스템이 극도로 복잡 — SmartAccountService.client에 `any` 사용이 실용적 선택
- 기존 아키텍처가 잘 설계되어 있으면 새 기능 추가가 분기 한 줄로 가능 — accountType 분기가 전형적 사례

### Cost Observations
- Model mix: 100% opus (quality profile)
- Sessions: 1
- Notable: 3 phases, 10 plans, 21 commits, 49 files, +4,709 lines — ~2h 완료

---

## Milestone: v30.8 — ERC-8004 Trustless Agents 지원

**Shipped:** 2026-03-04
**Phases:** 7 | **Plans:** 15 | **Sessions:** 1

### What Was Built
- DB v39-40 (agent_identities, reputation_cache, approval_type, policies CHECK REPUTATION_THRESHOLD)
- Erc8004ActionProvider 8 write actions + RegistryClient viem wrapper + 3 ABI constants
- 4 read-only REST endpoints + connect-info erc8004 per-wallet extension
- ReputationCacheService 3-tier cache (memory→DB→RPC) + REPUTATION_THRESHOLD policy engine (Stage 3 position 6)
- EIP-712 typed data wallet linking + ApprovalWorkflow dual-routing (SIWE/EIP712) + WcSigningBridge
- Admin UI ERC-8004 page (Identity/Registration File/Reputation 3 tabs) + PolicyFormRouter case 13
- MCP 11 tools + SDK 11 methods + erc8004.skill.md (612 lines) + 182 tests (E1-E20)
- Notification events wiring (5 events emit + cache invalidation post-feedback)

### What Worked
- Zero new dependencies: 전체 ERC-8004 통합을 viem/Zod/Drizzle/Hono 기존 스택으로 구현 — 의존성 충돌 없음
- 7 phases 1일 완료 (50 commits, 121 files) — 설계 문서(m30-08) 상세도가 빠른 구현의 핵심
- 3-tier cache 설계가 RPC 의존성을 효과적으로 차단 — TTL 기반 자동 갱신으로 운영 부담 최소화
- milestone audit 사전 실행으로 INT-01/INT-02 갭을 아카이브 전에 수정

### What Was Inefficient
- SUMMARY.md one_liner 필드 미기재 — gsd-tools summary-extract가 null 반환, 수동 추출 필요
- EIP-712 typehash 온체인 검증(C1)이 여전히 미완 — Anvil fork 테스트 필요하지만 계속 연기

### Patterns Established
- ERC 표준 통합 패턴: ABI constants → RegistryClient → ActionProvider → REST routes → Policy Engine → Admin UI → MCP/SDK
- dual approval routing (SIWE/EIP712): approval_type DB 컬럼 + PipelineContext 분기, 향후 다른 서명 타입 확장 가능
- 3-tier cache 패턴: 인메모리 Map(TTL) → DB 폴백 → RPC 원본, 다른 외부 데이터 캐싱에 재사용 가능

### Key Lessons
1. viem 네이티브 ABI 인코딩이 ethers.js SDK보다 번들 크기·호환성 모두 우위 — ERC 표준 연동에 최적
2. maxTier 에스컬레이션 패턴(기존 티어 유지, 더 높은 것만 적용)이 복수 정책 간 충돌 방지에 효과적
3. feature gate(default false) + validation registry gate 이중 보호가 Draft EIP 통합의 안전한 전략

### Cost Observations
- Model mix: ~100% opus (quality profile)
- Sessions: 1
- Notable: 121 files, +15,921/-151 lines, 1일 완료 — 5패키지 걸친 풀스택 ERC 표준 통합

---

## Milestone: v30.9 — Smart Account DX 개선

**Shipped:** 2026-03-05
**Phases:** 3 | **Plans:** 6 | **Sessions:** 1

### What Was Built
- Per-wallet provider model — AA_PROVIDER_NAMES enum(pimlico/alchemy/custom), DB v41 4 columns, 23 global settings 제거
- Auto URL assembly — AA_PROVIDER_CHAIN_MAP(10 networks × 2 providers), API key AES-256-GCM 암호화
- Agent self-service — PUT /v1/wallets/:id/provider dual-auth, PROVIDER_UPDATED audit event
- Wallet response provider status — name/supportedChains/paymasterEnabled or null
- Admin UI — 조건부 프로바이더 필드, dashboard link 동적 전환, detail page inline edit
- Agent discovery — connect-info provider prompt, MCP get_provider_status 29th tool

### What Worked
- v30.6 Smart Account 기반이 잘 준비되어 provider 모델 전환이 명확한 리팩토링으로 완료
- 23개 글로벌 설정 일괄 제거를 clean break로 처리 — deprecated 과도기 없이 깔끔
- Dual-auth 패턴(Bearer prefix 감지)으로 sessionAuth/masterAuth 분기가 단일 엔드포인트에서 자연스럽게 동작
- buildProviderStatus 헬퍼를 wallets.ts에서 정의 후 connect-info에서 재사용(DRY)

### What Was Inefficient
- REQUIREMENTS.md 7개 checkbox가 Phase 324 구현 시 미갱신 — 감사에서 발견 후 일괄 수정 (반복 이슈)
- Skill files 업데이트가 Phase 326까지 누락 — 감사에서 HIGH severity로 발견 후 수정

### Patterns Established
- Per-wallet provider model: 글로벌 설정을 엔티티(지갑) 레벨로 내리는 패턴 (v29.10 ntfy와 동일 흐름)
- HKDF 서브키 분리: 'aa-provider-key-encryption' info string으로 settings-crypto와 독립 키 파생
- Admin UI dashboard URL 브라우저 사이드 미러: @waiaas/core 미사용 환경에서 상수 인라인

### Key Lessons
- REQUIREMENTS.md checkbox 갱신을 plan 실행 단계에서 자동화해야 반복 누락 방지 가능
- Skill files는 API 변경과 동시에 업데이트해야 함 — Phase별로 체크리스트에 포함 필요
- 글로벌→per-entity 전환 시 clean break(deprecated 없이 삭제)가 v30.6 직후라서 가능했음

### Cost Observations
- Model mix: 100% opus (quality profile)
- Sessions: 1
- Notable: 73 files, +7,214/-419 lines, 2일 완료 — DB+API+UI+MCP 풀스택 프로바이더 모델 전환

---

## Milestone: v30.10 — ERC-8128 Signed HTTP Requests

**Shipped:** 2026-03-05
**Phases:** 3 | **Plans:** 7 | **Sessions:** 1

### What Was Built
- RFC 9421 Signature Base + RFC 9530 Content-Digest + EIP-191 signing engine (packages/core/src/erc8128/, 7 modules)
- REST API 2 endpoints (POST /v1/erc8128/sign, /verify) with sessionAuth, domain policy, rate limiting
- ERC8128_ALLOWED_DOMAINS policy (default-deny, wildcard matching, per-domain rate limit 60s sliding window)
- MCP 2 tools + SDK 3 methods (signHttpRequest, verifyHttpSignature, fetchWithErc8128) + connect-info capability
- Admin UI policy form + system settings (6 keys) + erc8128.skill.md + 3 skill files updated
- 2 notification events (ERC8128_SIGNATURE_CREATED, ERC8128_DOMAIN_BLOCKED)

### What Worked
- sign-only pattern (x402 precedent) 재활용으로 트랜잭션 파이프라인 우회, 구현 범위 최소화
- ERC-8128 모듈을 @waiaas/core에 격리하여 spec-dependent 값을 keyid.ts/constants.ts에 집중 — 향후 spec 변경 시 수정 범위 제한
- Milestone audit가 DEFECT-01 (Admin UI settings key mismatch), DEFECT-02 (verify param wiring), DEFECT-03 (stale test counts) 3건을 사전 발견하여 ship 전 수정
- 3 phases 전체 1일 완료 — 설계 패턴(policy evaluator, settings keys, MCP tool wrapping)이 기존 x402/ERC-8004와 동일

### What Was Inefficient
- SUMMARY.md one_liner 필드 미기입 — summary-extract 자동 추출 실패, 수동 accomplishment 작성 필요 (반복 이슈)
- Audit가 defects 발견 후 별도 gap closure phase 없이 직접 fix commit — 프로세스 경량화는 좋지만 추적성 저하

### Patterns Established
- ERC 표준 3종 세트 통합 패턴: x402(결제) + ERC-8004(신원) + ERC-8128(API 인증) — 각각 sign-only, ActionProvider, core module 방식
- connect-info capabilities 동적 확장 패턴: settingsService.get('{feature}.enabled') → capabilities 배열 추가

### Key Lessons
- RFC 표준 자체 구현이 외부 라이브러리보다 안정적일 수 있다 (structured-headers 의존 제거, ~150 LOC 자체 구현)
- Milestone audit의 E2E flow 검증이 DEFECT-01(설정 키 불일치) 같은 integration 결함을 설계/단위 테스트에서 발견하기 어려운 문제를 포착

### Cost Observations
- Model mix: 100% opus
- Sessions: 1
- Notable: 3 phases + audit + defect fix all in 1 session, ~76 files +7,280 lines

## Milestone: v30.11 — Admin UI DX 개선

**Shipped:** 2026-03-05
**Phases:** 3 | **Plans:** 5 | **Sessions:** 1

### What Was Built
- Admin UI 메뉴 DeFi/Agent Identity 재명명 + 라우트 변경 + 레거시 리다이렉트
- ERC-8004 Agent Identity 페이지에 활성화/비활성화 토글 통합
- 전체 10개 액션 프로바이더 기본 활성화 + DB v42 마이그레이션 (INSERT OR IGNORE)
- 액션별 보안 Tier 오버라이드 — Settings 기반 동적 키 + 파이프라인 floor 에스컬레이션
- Admin UI Description 컬럼 + Tier 드롭다운 + 오버라이드 인디케이터 + Reset to default
- 4개 스킬 파일 동기화 (admin/erc8004/actions/policies)

### What Worked
- 3 phases 전체 1일 완료 — 기존 Admin UI 패턴(SettingsData, FieldGroup) 재활용으로 빠른 구현
- INSERT OR IGNORE 마이그레이션 전략이 기존 운영자 설정을 안전하게 존중하면서 신규 기본값 적용
- 동적 tier key regex 패턴으로 30+ 정적 설정 정의 없이 유연한 확장 달성
- Audit 27/27 requirements + 8/8 integration + 4/4 flows 전체 패스

### What Was Inefficient
- ROADMAP.md의 Plan checklist에서 332-01이 `[ ]` 미갱신 상태로 아카이브 (반복 이슈)

### Patterns Established
- 동적 Settings 키 패턴: `actions.{provider}_{action}_tier` regex 기반 해석, 30+ 정적 키 대신 런타임 동적 생성
- Tier floor 에스컬레이션: max(policyTier, actionTier) — 오버라이드는 항상 상향만 가능

### Key Lessons
- INSERT OR IGNORE가 마이그레이션에서 기존 설정 존중 + 신규 기본값 시딩을 동시에 해결하는 안전한 패턴
- native `<select>` 드롭다운이 커스텀 컴포넌트보다 Admin UI 맥락에서 충분하고 더 빠름

### Cost Observations
- Model mix: 100% opus
- Sessions: 1
- Notable: 48 files, 23 commits in ~1 day — small focused milestone

---

## Milestone: v31.0 — NFT 지원 (EVM + Solana)

**Shipped:** 2026-03-06
**Phases:** 5 | **Plans:** 12 | **Sessions:** 1

### What Was Built
- NFT_TRANSFER 6번째 discriminatedUnion type + APPROVE nft 확장 + DB v44 마이그레이션 + CAIP-19 NFT 네임스페이스
- INftIndexer 인터페이스 + Alchemy(EVM) + Helius(Solana) 인덱서 구현체 + NftIndexerClient 재시도/캐싱
- IChainAdapter 25 메서드 확장 — ERC-721/1155 safeTransferFrom + ERC-165 감지 + Metaplex SPL transfer
- NFT Query API — 커서 페이지네이션, 컬렉션 그룹핑, 메타데이터 24h TTL DB 캐싱, IPFS/Arweave 게이트웨이
- NFT_TRANSFER 6-stage 파이프라인 + Smart Account UserOp + 정책(RATE_LIMIT nft_count, CONTRACT_WHITELIST)
- MCP 3도구 + SDK 3메서드 + Admin UI NFT 탭 + 인덱서 설정 UI + 스킬 파일 3개

### What Worked
- 5 phases 전체 1일 완료 (10:21→12:56, ~2.5시간) — 기존 패턴(파이프라인 dispatch, 인덱서 프레임워크, Admin UI 탭) 완전 재활용
- INftIndexer 인터페이스 설계가 Alchemy/Helius 차이를 깔끔하게 추상화 — chain-specific 코드가 구현체에만 존재
- NFT_TRANSFER를 기존 /v1/transactions/send 파이프라인에 통합하여 새 엔드포인트 불필요
- APPROVE nft 확장이 기존 APPROVE 인프라를 완전히 재활용

### What Was Inefficient
- NFT REST 라우트 server.ts 마운트 누락 (CRITICAL-01) — Phase 335에서 구현했으나 server.ts wiring이 Phase 337에서 빠짐, 감사에서 발견
- IChainAdapter 테스트 목 미업데이트 (CRITICAL-02) — 인터페이스 25 메서드 확장 시 기존 목 업데이트 누락으로 typecheck 실패
- REQUIREMENTS.md traceability 상태 반영 누락 (반복 이슈) — Phase 337 완료 후 Pending 상태 유지

### Patterns Established
- INftIndexer 프로바이더 패턴: 체인별 인덱서 구현체 + NftIndexerClient 통합 클라이언트 + 재시도/캐시 일괄 적용
- NftTokenInfoSchema: 기존 TokenInfoSchema와 분리 (NFT에는 decimals/symbol이 불필요)
- tokenIdentifier 파싱: lastIndexOf(':') for EVM(address:tokenId), direct mint for Solana

### Key Lessons
- server.ts 라우트 마운트는 가장 마지막 통합 단계에서 빠지기 쉬움 — Phase 별 체크리스트에 "server.ts wiring 확인" 추가 필요
- 인터페이스 메서드 확장 시 모든 기존 테스트 목 업데이트를 자동화/체크하는 패턴 필요
- 기존 파이프라인에 새 타입을 추가하는 것이 새 파이프라인보다 훨씬 효율적 (NFT_TRANSFER → 기존 6-stage 재활용)

### Cost Observations
- Model mix: 100% opus
- Sessions: 1
- Notable: 112 files, 38 commits in ~2.5 hours — medium-sized focused milestone

---

## Milestone: v31.2 — UserOp Build/Sign API

**Shipped:** 2026-03-06
**Phases:** 4 | **Plans:** 8 | **Sessions:** 1

### What Was Built
- Provider Lite/Full 모드 — Smart Account 프로바이더 없이 생성(Lite), aaProvider 설정 시 Full 전환
- UserOp Build API — unsigned UserOp 구성 (nonce EntryPoint v0.7 직접 조회, factory 자동 감지, Bundler 불필요)
- UserOp Sign API — callData 이중 검증 + sender 일치 + INSTANT 정책 + 서명 + 감사 로그
- DB v45 userop_builds 테이블 (TTL 10분) + cleanup 워커
- MCP build_userop/sign_userop + SDK buildUserOp()/signUserOp() + Admin UI Lite/Full 배지

### What Worked
- 4 phases 1일 완료 (27 commits, 64 files) — 기존 SmartAccount 인프라(v30.6/v30.9) 위에 구축하여 빠른 구현
- build→sign 분리 아키텍처가 플랫폼 대납 패턴에 자연스럽게 매핑 — Bundler 의존성 완전 제거
- callData 이중 검증 설계가 보안과 UX를 동시에 충족 — build 시점 정책 검증 + sign 시점 재검증
- userop capability와 smart_account capability 분리로 기능별 세밀한 노출 가능

### What Was Inefficient
- REQUIREMENTS.md traceability 상태 반영 누락 (반복 이슈) — Phase 341 완료 후 ADMIN/INTF/SKILL 요구사항이 Pending 상태 유지
- ROADMAP.md Phase 341 plan checkboxes `[ ]` 미갱신 (반복 이슈) — 감사에서 발견

### Patterns Established
- build-sign 분리 패턴: unsigned UserOp 구성 → 외부에서 gas/paymaster 채움 → 서명만 WAIaaS 담당
- buildId DB 트래킹: TTL 기반 일회성 build 레코드 + callData 무결성 검증 + 주기적 cleanup

### Key Lessons
- REQUIREMENTS.md / ROADMAP.md 상태 동기화 자동화가 여전히 미구현 — 매 마일스톤 반복되는 이슈
- Lite/Full 모드 같은 기능 분기는 첫 단계에서 helper 함수로 격리하면 후속 단계에서 일관된 조건 판단 가능
- userop_builds 테이블에 network 컬럼 미포함 → sign 시 heuristic 네트워크 해결 필요 (향후 개선 권장)

### Cost Observations
- Model mix: 100% opus
- Sessions: 1
- Notable: 64 files, 27 commits in ~1.5 hours — small focused milestone on existing infrastructure

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v29.0 | 1 | 6 | 설계 전용 마일스톤, 1일 완료 |
| v29.5 | 1 | 3 | 이슈 기반 정리 마일스톤, 156 파일 변경 1일 완료 |
| v29.6 | 1 | 3 | Yield Provider 패턴 확립, 50 파일 1일 완료 |
| v29.7 | 1 | 6 | 풀스택(DB+API+UI) 구현, 73 파일 1일 완료 |
| v29.10 | 1 | 2 | 글로벌→per-entity 설정 전환, 43 파일 1.5시간 완료 |
| v30.0 | 1 | 5 | 운영 기능 6개 설계 전용, 30 파일 50분 완료 |
| v30.6 | 1 | 3 | ERC-4337 Smart Account, 49 파일 ~2h 완료 |
| v30.8 | 1 | 7 | ERC-8004 Trustless Agents 5-package 통합, 121 파일 1일 완료 |
| v30.9 | 1 | 3 | Smart Account DX 개선 per-wallet provider 전환, 73 파일 2일 완료 |
| v30.10 | 1 | 3 | ERC-8128 Signed HTTP Requests, 76 파일 1일 완료 |
| v30.11 | 1 | 3 | Admin UI DX 개선, 48 파일 1일 완료 |
| v31.0 | 1 | 5 | NFT 풀스택(타입+인덱서+어댑터+파이프라인+UI), 112 파일 2.5시간 완료 |
| v31.2 | 1 | 4 | UserOp Build/Sign API, 64 파일 1.5시간 완료 |

### Cumulative Quality

| Milestone | Tests | Coverage | Design Decisions |
|-----------|-------|----------|-----------------|
| v29.0 | ~5,000 (unchanged) | unchanged | +59 decisions |
| v29.5 | ~5,595 (+512) | maintained | +5 decisions |
| v29.6 | ~5,595 (unchanged) | maintained | +4 decisions |
| v29.7 | ~5,595 (unchanged) | maintained | +7 decisions |
| v29.10 | ~5,737 (+142) | maintained | +8 decisions |
| v30.0 | ~5,737 (unchanged) | unchanged | +40 decisions |
| v30.6 | ~6,486 (+749) | maintained | +8 decisions |
| v30.8 | ~6,668 (+182) | maintained | +36 decisions |
| v30.9 | ~6,742 (+74) | maintained | +12 decisions |
| v30.10 | ~6,822 (+80) | maintained | +11 decisions |
| v30.11 | ~6,822 (unchanged) | maintained | +9 decisions |
| v31.0 | ~6,930 (+108) | maintained | +24 decisions |
| v31.2 | ~6,993 (+63) | maintained | +15 decisions |

### Top Lessons (Verified Across Milestones)

1. 인프라-우선 설계 순서가 프레임워크 간 의존성을 자연스럽게 해소한다
2. 프로토콜 매핑 테이블을 설계 시점에 완성하면 구현 시 API 조사 시간이 절약된다
3. 이중 저장소 발견 시 즉각 SSoT 통합이 최선 — 동기화 레이어보다 단일 저장소 전환이 안정적
