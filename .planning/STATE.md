# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다 -- 동시에 에이전트 주인(사람)이 자금 통제권을 유지하면서.
**Current focus:** v1.5 Phase 128 Action Provider + API Key

## Current Position

Phase: 128 of 129 (Action Provider + API Key)
Plan: 2 of 4 in current phase
Status: Plan 1 complete (2/2 tasks), starting Plan 2
Last activity: 2026-02-15 -- IActionProvider Zod SSoT + ActionProviderRegistry 구현 (20 tests)

Progress: [#####░░░░░] 50%

## Performance Metrics

**Cumulative:** 28 milestones, 124 phases, 265 plans, 739 reqs, ~1,618 tests, ~178,176 LOC

**v1.5 Planned:**
- 5 phases, 14 plans, 29 requirements
- Phases 125-129

## Accumulated Context

### Decisions

Full log in PROJECT.md.
Recent decisions affecting current work:

- v1.5: 신규 외부 npm 의존성 0개 -- Pyth/CoinGecko는 native fetch(), LRU는 직접 구현, 암호화는 settings-crypto 재사용
- v1.5: evaluateAndReserve() 진입 전에 Oracle HTTP 호출 완료 -- better-sqlite3 동기 트랜잭션 내 비동기 호출 불가
- v1.5: PriceResult 3-state discriminated union -- success/oracleDown/notListed로 "가격 불명 != 가격 0" 보안 원칙
- v1.5: PriceAge를 daemon 패키지에 배치 (core 승격은 후속 필요시)
- v1.5: source enum 'pyth'|'coingecko'|'cache' 3가지 제한
- v1.5: staleMax(30min)를 TTL(5min)과 독립 파라미터로 분리
- v1.5: Chainlink 제거 -- Pyth가 체인 무관 380+ 피드 제공, EVM 전용 불필요
- v1.5: PriceCache maxEntries 1000->128 (Self-hosted 보수적 상한)
- v1.5: 교차 검증 편차 10%->5%, CoinGecko 키 설정 시에만 활성화
- v1.5: MCP Tool 도구 수 상한 제거 (MCP 프로토콜에 제한 없음)
- v1.5: PriceNotAvailableError를 oracle-errors.ts 공유 모듈에서 관리 (PythOracle/CoinGeckoOracle 공유)
- v1.5: PythOracle은 캐시 미관리 -- OracleChain이 InMemoryPriceCache 전담
- v1.5: CoinGeckoOracle은 캐시 미관리 -- OracleChain이 InMemoryPriceCache 전담
- v1.5: oracle-errors.ts 공유 모듈에서 PriceNotAvailableError + CoinGeckoNotConfiguredError 관리
- v1.5: Solana 주소는 CoinGecko API에서 원본 base58 보존, EVM만 lowercase 정규화
- v1.5: OracleChain이 InMemoryPriceCache.getOrFetch() stampede prevention 통합 관리
- v1.5: 교차 검증은 fallback oracle DI 주입 시에만 활성화 (CoinGecko 키 미설정 → fallback 미주입 → 자동 스킵)
- v1.5: stale 캐시 fallback은 fetcher 내부에서 처리 (oracle 전체 장애 시 stale 데이터로 연명)
- v1.5: AdminRouteDeps.priceOracle optional -- oracle 미설정 시 zeroed stats 반환
- v1.5: PriceResult를 plain TypeScript discriminated union으로 구현 (Zod discriminatedUnion 불필요)
- v1.5: resolveEffectiveAmountUsd request 파라미터를 Record<string,unknown>으로 정의 (stages.ts as 캐스팅 패턴)
- v1.5: BATCH instruction 분류를 classifyInstruction 헬퍼로 분리 (stage3Policy와 동일 로직)
- v1.5: TIER_ORDER + maxTier를 클래스 외부 모듈 레벨에 배치 (evaluateBatch 기존 tierOrder와 동일 패턴이나 공유 가능)
- v1.5: evaluateNativeTier를 별도 private 메서드로 추출하여 evaluateSpendingLimit 가독성 향상
- v1.5: usdAmount=0일 때 USD 평가 스킵 (APPROVE 등 네이티브 금액 0인 케이스 안전 처리)
- v1.5: SpendingLimitRulesSchema를 named export하여 daemon 테스트에서 직접 검증 가능
- v1.5: POLICY_VIOLATION 이벤트 타입으로 notListed 알림 발송 (SPENDING_LIMIT은 유효한 NotificationEventType 아님)
- v1.5: hintedTokens를 export하여 테스트에서 beforeEach clear 가능
- v1.5: CoinGeckoOracle 생성자에 API 키 문자열 직접 전달 (SettingsService 아닌 string)
- v1.5: priceOracle DI를 CreateAppDeps에 optional로 추가하여 하위 호환 유지
- v1.5: inputSchema를 z.any()로 정의하고 register() 시 덕 타이핑 검증 (typeof parse/safeParse === 'function') -- 크로스 Zod 버전 호환
- v1.5: ActionProviderRegistry를 infrastructure/action/ 디렉토리에 배치 (설계 문서 62의 services/ 대신 기존 컨벤션 준수)
- v1.5: ContractCallRequest.from 검증 스킵 (현행 스키마에 from 필드 없음, Stage 5에서 자동 설정)
- v1.5: ESM 플러그인 로드 시 fail-open 패턴 (개별 실패 시 warn 로그 + 건너뛰기)

### Blockers/Concerns

- Pre-existing flaky lifecycle.test.ts -- not blocking
- Pre-existing 3 CLI E2E failures (E-07~09) -- daemon-harness adapter: param
- MCP 동적 도구 등록/해제 공식 API 미존재 -- Phase 129에서 대안 패턴 검증 필요

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 128-01-PLAN.md (IActionProvider Zod SSoT + ActionProviderRegistry 구현 -- 20 tests)
Resume file: None
