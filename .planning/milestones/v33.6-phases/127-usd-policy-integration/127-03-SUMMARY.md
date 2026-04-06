---
phase: 127-usd-policy-integration
plan: 03
subsystem: pipeline
tags: [price-oracle, usd-policy, pipeline, stage3, notListed, oracleDown, di, audit-log]

# Dependency graph
requires:
  - phase: 127-01
    provides: "resolveEffectiveAmountUsd, PriceResult 3-state discriminated union"
  - phase: 127-02
    provides: "evaluateSpendingLimit USD 분기, evaluateAndReserve usdAmount 파라미터"
  - phase: 126-oracle-chain
    provides: "OracleChain (IPriceOracle), InMemoryPriceCache, PythOracle, CoinGeckoOracle"
provides:
  - "Stage 3 파이프라인 USD 정책 평가 통합 (resolveEffectiveAmountUsd -> evaluateAndReserve)"
  - "OracleChain DI: daemon.ts -> createApp -> transactionRoutes -> PipelineContext"
  - "PriceResult.notListed -> 최소 NOTIFY 격상 + UNLISTED_TOKEN_TRANSFER 감사 로그"
  - "CoinGecko 키 미설정 + notListed -> 최초 1회 힌트 알림"
  - "AdminRouteDeps.priceOracle 전달 (GET /admin/oracle-status 동작)"
affects: [128-spending-limit-usd, 129-mcp-oracle-tools]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OracleChain DI: daemon Step 4e -> createApp -> transactionRoutes -> PipelineContext.priceOracle"
    - "evaluateAndReserve 진입 전 Oracle HTTP 호출 패턴 (better-sqlite3 동기 트랜잭션 제약)"
    - "hintedTokens 모듈 레벨 Set: 데몬 재시작 시 리셋, 최초 1회 힌트 패턴"
    - "notListed NOTIFY 격상: TIER_ORDER indexOf 비교로 보수적 방향 격상"

key-files:
  created: []
  modified:
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/__tests__/pipeline-stage1-stage3.test.ts

key-decisions:
  - "POLICY_VIOLATION 이벤트 타입으로 notListed 알림 발송 (SPENDING_LIMIT은 유효한 NotificationEventType이 아님)"
  - "hintedTokens를 export하여 테스트에서 beforeEach clear 가능하게 함"
  - "CoinGeckoOracle 생성자에 API 키 문자열 직접 전달 (SettingsService 아닌 string 파라미터)"
  - "priceOracle DI를 CreateAppDeps에 optional로 추가하여 하위 호환 유지"

patterns-established:
  - "Stage 3 Oracle 통합: priceOracle -> resolveEffectiveAmountUsd -> usdAmount -> evaluateAndReserve/evaluateBatch"
  - "notListed 3-action: audit_log INSERT + NOTIFY 격상 + 힌트 알림"
  - "oracleDown 무동작: 네이티브 금액 기준 기존 평가 유지 (안전한 fallback)"

# Metrics
duration: 8min
completed: 2026-02-15
---

# Phase 127 Plan 03: Stage 3 USD Policy Integration Summary

**Stage 3 파이프라인에 OracleChain DI 연결 + resolveEffectiveAmountUsd USD 환산 통합 + notListed NOTIFY 격상/감사로그/힌트 (9 tests)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-15T08:00:31Z
- **Completed:** 2026-02-15T08:08:34Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- OracleChain을 daemon 부트스트랩(Step 4e)에서 PipelineContext까지 DI 체인 완성 (daemon.ts -> createApp -> transactionRoutes -> PipelineContext.priceOracle)
- stage3Policy에서 evaluateAndReserve 진입 전 resolveEffectiveAmountUsd 호출하여 USD 기준 정책 평가 활성화
- PriceResult 3-state 분기: success(usdAmount 전달), oracleDown(네이티브 fallback), notListed(NOTIFY 격상 + 감사 로그 + 힌트)
- CoinGecko 키 미설정 시 최초 1회 힌트 알림 포함, 동일 토큰 재전송 시 힌트 비포함
- priceOracle 미설정 시 기존 네이티브 전용 평가 100% 하위 호환

## Task Commits

Each task was committed atomically:

1. **Task 1: OracleChain DI 연결 + PipelineContext priceOracle 주입** - `e75fb18` (feat)
2. **Task 2: Stage 3 USD 통합 + notListed 격상 + oracleDown fallback + 힌트** - `9793d80` (feat)

## Files Created/Modified
- `packages/daemon/src/pipeline/stages.ts` - PipelineContext에 priceOracle/settingsService 추가, stage3Policy에 Oracle 통합 + notListed 격상/감사로그/힌트
- `packages/daemon/src/api/routes/transactions.ts` - TransactionRouteDeps에 priceOracle/settingsService 추가 + PipelineContext 생성 시 전달
- `packages/daemon/src/api/server.ts` - CreateAppDeps에 priceOracle 추가 + transactionRoutes/adminRoutes에 전달
- `packages/daemon/src/lifecycle/daemon.ts` - Step 4e: OracleChain(Pyth + CoinGecko) fail-soft 초기화 + createApp에 전달
- `packages/daemon/src/__tests__/pipeline-stage1-stage3.test.ts` - 9개 Stage 3 USD 통합 테스트 추가

## Decisions Made
- POLICY_VIOLATION 이벤트 타입으로 notListed 알림 발송 (SPENDING_LIMIT은 유효한 NotificationEventType이 아님)
- hintedTokens를 export하여 테스트에서 beforeEach clear 가능하게 함
- CoinGeckoOracle 생성자에 API 키 문자열 직접 전달 (SettingsService가 아닌 string 파라미터)
- priceOracle DI를 CreateAppDeps에 optional로 추가하여 하위 호환 유지

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CoinGeckoOracle 생성자 파라미터 수정**
- **Found during:** Task 1 (OracleChain DI 연결)
- **Issue:** 플랜에서 CoinGeckoOracle(this._settingsService!)로 SettingsService 전달하도록 명시했으나, 실제 CoinGeckoOracle 생성자는 string (apiKey)만 수용
- **Fix:** CoinGeckoOracle(coingeckoApiKey)로 API 키 문자열 직접 전달
- **Files modified:** packages/daemon/src/lifecycle/daemon.ts
- **Verification:** npx tsc --noEmit 통과
- **Committed in:** e75fb18 (Task 1 commit)

**2. [Rule 1 - Bug] NotificationEventType 수정**
- **Found during:** Task 2 (Stage 3 USD 통합)
- **Issue:** 플랜에서 'SPENDING_LIMIT' 이벤트 타입 사용 명시했으나 유효한 NotificationEventType 아님
- **Fix:** 'POLICY_VIOLATION' 이벤트 타입으로 변경
- **Files modified:** packages/daemon/src/pipeline/stages.ts
- **Verification:** npx tsc --noEmit 통과
- **Committed in:** 9793d80 (Task 2 commit)

**3. [Rule 1 - Bug] notify vars Record<string, string> 타입 호환**
- **Found during:** Task 2 (Stage 3 USD 통합)
- **Issue:** hint가 string | undefined인데 Record<string, string> 타입에 할당 불가
- **Fix:** notifyVars 객체 분리 후 hint가 truthy일 때만 추가
- **Files modified:** packages/daemon/src/pipeline/stages.ts
- **Verification:** npx tsc --noEmit 통과
- **Committed in:** 9793d80 (Task 2 commit)

**4. [Rule 1 - Bug] BATCH 테스트 ALLOWED_TOKENS 정책 누락**
- **Found during:** Task 2 (Stage 3 통합 테스트)
- **Issue:** BATCH + TOKEN_TRANSFER 테스트에서 ALLOWED_TOKENS 정책 미설정으로 기본 거부 정책에 의해 deny
- **Fix:** ALLOWED_TOKENS 정책 추가 (default deny 원칙)
- **Files modified:** packages/daemon/src/__tests__/pipeline-stage1-stage3.test.ts
- **Verification:** 테스트 PASS
- **Committed in:** 9793d80 (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (4 bugs)
**Impact on plan:** 모두 플랜의 pseudo-code와 실제 코드 인터페이스 차이에서 발생한 타입 버그. 기능 범위 변경 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 127 (3 plans) 완료: USD 정책 파이프라인 통합 완성
- PriceResult 3-state 분기가 실제 트랜잭션 파이프라인에서 동작
- Phase 128 (spending-limit-usd) 진행 준비 완료: USD 기반 spending limit 임계값 설정
- Phase 129 (mcp-oracle-tools) 진행 준비 완료: MCP oracle 도구 노출

---
*Phase: 127-usd-policy-integration*
*Completed: 2026-02-15*
