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

### Top Lessons (Verified Across Milestones)

1. 인프라-우선 설계 순서가 프레임워크 간 의존성을 자연스럽게 해소한다
2. 프로토콜 매핑 테이블을 설계 시점에 완성하면 구현 시 API 조사 시간이 절약된다
3. 이중 저장소 발견 시 즉각 SSoT 통합이 최선 — 동기화 레이어보다 단일 저장소 전환이 안정적
