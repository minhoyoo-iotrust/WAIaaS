---
phase: 256-staking-api-async-tracking-interface-integration
verified: 2026-02-24T21:35:00Z
status: gaps_found
score: 10/11 must-haves verified
gaps:
  - truth: "settings-service 테스트가 staking 설정 추가로 인해 카운트 불일치로 실패한다"
    status: failed
    reason: "settings-service.test.ts와 api-admin-settings.test.ts의 actions 카테고리 설정 카운트가 18을 기대하지만 실제 24개 (Phases 254/255에서 6개 staking 설정 추가됨). 이 테스트들은 Phase 256 실행 중에도 수정되지 않아 전체 daemon 테스트 스위트에서 21개 실패가 발생한다."
    artifacts:
      - path: "packages/daemon/src/__tests__/settings-service.test.ts"
        issue: "Line 456: expects 'actions category has 18 settings' but actual count is 24"
      - path: "packages/daemon/src/__tests__/api-admin-settings.test.ts"
        issue: "Multiple tests fail due to total settings count mismatch"
    missing:
      - "settings-service.test.ts: 'actions category has 18 settings' → update to 24"
      - "settings-service.test.ts: 'has expected number of definitions' snapshot count → update"
      - "api-admin-settings.test.ts: expected total settings counts → update for 6 new staking settings"
  - truth: "SAPI-01 경로 불일치: REQUIREMENTS.md는 /v1/wallets/:id/staking을 요구하지만 구현은 /v1/wallet/staking (단수)"
    status: partial
    reason: "Plan 02 SUMMARY에서 세션 인증 패턴을 따라 /v1/wallet/staking(단수)을 의도적으로 선택했고, Admin용 /v1/admin/wallets/:id/staking 엔드포인트는 Plan 03에서 추가됐다. 그러나 REQUIREMENTS.md의 명시적 경로 스펙과 다르다."
    artifacts:
      - path: "packages/daemon/src/api/routes/staking.ts"
        issue: "Route path is '/wallet/staking' not '/wallets/:id/staking' as specified in REQUIREMENTS.md SAPI-01"
    missing:
      - "REQUIREMENTS.md SAPI-01 텍스트를 실제 구현된 경로 (/v1/wallet/staking 세션 기반 + /v1/admin/wallets/:id/staking 어드민 기반)로 업데이트"
human_verification:
  - test: "Admin UI Staking 탭 렌더링 확인"
    expected: "월렛 상세 페이지에서 Staking 탭 클릭 시 Staking Positions 섹션이 나타나고, 스테이킹 이력 없는 월렛은 EmptyState, 이력 있는 월렛은 포지션 테이블이 렌더링된다"
    why_human: "브라우저 UI 렌더링은 프로그래밍 방식으로 검증 불가. fetchStaking API 호출과 테이블 렌더링을 확인해야 한다."
  - test: "STAKING_UNSTAKE_COMPLETED 알림 실제 발행 확인"
    expected: "Lido unstake 후 metadata.status='claimable'로 업데이트되면 LidoWithdrawalTracker가 COMPLETED를 반환하고 STAKING_UNSTAKE_COMPLETED 알림이 전송된다"
    why_human: "실제 Lido 트랜잭션과 알림 수신 채널(Ntfy/Telegram)을 통한 end-to-end 테스트가 필요하다"
---

# Phase 256: Staking API Async Tracking Interface Integration Verification Report

**Phase Goal:** unstake 비동기 완료 추적, 스테이킹 포지션 조회 API, 모든 인터페이스(MCP/SDK/Admin/Skills) 통합이 완성된다
**Verified:** 2026-02-24T21:35:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Lido unstake 후 Withdrawal Queue 상태가 AsyncPollingService로 폴링된다 | VERIFIED | `LidoWithdrawalTracker` (480x30s) implements `IAsyncStatusTracker`; daemon.ts Step 4f-3 conditionally registers via `registerTracker(new LidoWithdrawalTracker())` when `actions.lido_staking_enabled='true'` |
| 2 | Jito unstake 후 에포크 경계 완료가 AsyncPollingService로 폴링된다 | VERIFIED | `JitoEpochTracker` (240x30s) implements `IAsyncStatusTracker`; daemon.ts Step 4f-3 conditionally registers via `registerTracker(new JitoEpochTracker())` when `actions.jito_staking_enabled='true'` |
| 3 | unstake 완료 시 STAKING_UNSTAKE_COMPLETED 알림이 발행된다 | VERIFIED | `async-polling-service.ts` line ~272 reads `updatedMetadata.notificationEvent ?? 'BRIDGE_COMPLETED'`; trackers return `notificationEvent: 'STAKING_UNSTAKE_COMPLETED'` in COMPLETED details; 3 dynamic event dispatch tests pass |
| 4 | unstake 타임아웃 시 STAKING_UNSTAKE_TIMEOUT 알림이 발행된다 | VERIFIED | `async-polling-service.ts` line ~225 reads `metadata.notificationEvent ?? 'BRIDGE_TIMEOUT'`; metadata contains `notificationEvent: 'STAKING_UNSTAKE_TIMEOUT'` at unstake creation; test verifies TIMEOUT dispatch |
| 5 | GET /v1/wallets/:id/staking 이 월렛별 스테이킹 포지션 배열을 반환한다 | PARTIAL | Implemented as GET /v1/wallet/staking (session-based, singular) + GET /v1/admin/wallets/:id/staking (masterAuth); REQUIREMENTS.md SAPI-01 specifies /v1/wallets/:id/staking path — naming deviation acknowledged in SUMMARY but REQUIREMENTS.md not updated |
| 6 | 포지션에 stETH/JitoSOL 잔고, 현재 APY, USD 환산이 포함된다 | VERIFIED | `StakingPositionSchema`: `balance`, `apy` (hardcoded ~3.5%/~7.5%), `balanceUsd` (PriceOracle); 11 integration tests all pass |
| 7 | 스테이킹 포지션이 없으면 빈 배열을 반환한다 | VERIFIED | Route returns `{ walletId, positions: [] }` when no staking transactions; test "should return empty positions array for wallet with no staking transactions" passes |
| 8 | MCP에서 action_lido_staking_stake/unstake, action_jito_staking_stake/unstake 4개 도구가 노출된다 | VERIFIED | 8 MCP tests pass; `registerActionProviderTools` auto-exposes 4 tools from Lido+Jito providers with `mcpExpose:true`; tool names verified: `action_lido_staking_stake`, `action_lido_staking_unstake`, `action_jito_staking_stake`, `action_jito_staking_unstake` |
| 9 | SDK에서 executeAction('lido_staking/stake')로 실행 가능하다 | VERIFIED | Generic `executeAction` in TS/Python SDK sends POST to `/v1/actions/{provider}/{action}` — same endpoint MCP tools call; test "SDK executeAction pattern works for lido_staking (mock REST call)" passes |
| 10 | Admin 월렛 상세에 스테이킹 포지션 섹션이 렌더링된다 | VERIFIED (human pending) | `wallets.tsx`: StakingTab() function renders full position table (Protocol badge, Asset, Balance, USD, APY, Pending Unstake); `fetchStaking()` calls `apiGet(API.ADMIN_WALLET_STAKING(id))`; `ADMIN_WALLET_STAKING` endpoint defined in `endpoints.ts`; `GET /v1/admin/wallets/:id/staking` implemented in `admin.ts` |
| 11 | actions.skill.md에 Lido/Jito 스테이킹 문서가 추가된다 | VERIFIED | Section 6 "Lido Liquid Staking (ETH -> stETH)" and Section 7 "Jito Liquid Staking (SOL -> JitoSOL)" added with configuration tables, action parameters, code examples (REST/MCP/SDK), async tracking lifecycle, and security notice |

**Score:** 10/11 truths verified (1 partial: SAPI-01 path deviation, 1 infrastructure gap: settings test count failure)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/actions/src/providers/lido-staking/withdrawal-tracker.ts` | LidoWithdrawalTracker implementing IAsyncStatusTracker | VERIFIED | 53 lines; `name='lido-withdrawal'`, `maxAttempts=480`, `pollIntervalMs=30000`, `timeoutTransition='TIMEOUT'`; COMPLETED returns `notificationEvent: 'STAKING_UNSTAKE_COMPLETED'` |
| `packages/actions/src/providers/jito-staking/epoch-tracker.ts` | JitoEpochTracker implementing IAsyncStatusTracker | VERIFIED | 55 lines; `name='jito-epoch'`, `maxAttempts=240`, `pollIntervalMs=30000`, `timeoutTransition='TIMEOUT'`; COMPLETED returns `notificationEvent: 'STAKING_UNSTAKE_COMPLETED'` |
| `packages/actions/src/__tests__/staking-trackers.test.ts` | Unit tests (min 80 lines) | VERIFIED | 177 lines; 20 tests (10 Lido + 10 Jito); all pass |
| `packages/core/src/enums/notification.ts` | STAKING_UNSTAKE_COMPLETED and STAKING_UNSTAKE_TIMEOUT | VERIFIED | Both values present at lines 41-42 of NOTIFICATION_EVENT_TYPES array |
| `packages/daemon/src/__tests__/async-polling-service.test.ts` | Contains STAKING_UNSTAKE_COMPLETED dynamic dispatch tests | VERIFIED | 3 new tests in "dynamic notification event type" describe block; all 28 tests pass |
| `packages/daemon/src/api/routes/staking.ts` | GET /v1/wallet/staking route handler (createStakingRoutes) | VERIFIED | 284 lines; full implementation with wallet chain filtering, balance aggregation, pending unstake detection, USD conversion |
| `packages/daemon/src/__tests__/api-staking.test.ts` | Staking API endpoint tests (min 80 lines) | VERIFIED | 606 lines; 11 tests; all pass |
| `packages/mcp/src/__tests__/action-provider-staking.test.ts` | MCP staking tool registration tests (min 60 lines) | VERIFIED | 347 lines; 8 tests; all pass |
| `packages/admin/src/pages/wallets.tsx` | Staking positions section in wallet detail | VERIFIED | StakingTab() at line 1050 with full table rendering, badge variants, USD conversion |
| `skills/actions.skill.md` | Lido/Jito staking documentation | VERIFIED | Section 6 (line 659) and Section 7 (line 798) with configuration, examples, security notice |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `packages/daemon/src/lifecycle/daemon.ts` | `LidoWithdrawalTracker` | `registerTracker(new LidoWithdrawalTracker())` | WIRED | daemon.ts lines 966-978: Step 4f-3 conditionally registers when `actions.lido_staking_enabled='true'` |
| `packages/daemon/src/lifecycle/daemon.ts` | `JitoEpochTracker` | `registerTracker(new JitoEpochTracker())` | WIRED | daemon.ts lines 966-978: Step 4f-3 conditionally registers when `actions.jito_staking_enabled='true'` |
| `packages/daemon/src/services/async-polling-service.ts` | notification callbacks | `emitNotification(STAKING_UNSTAKE_*)` | WIRED | Dynamic `eventType = metadata.notificationEvent ?? 'BRIDGE_*'` pattern at lines ~225, ~272, ~297; backward compatible with bridge trackers |
| `packages/core/src/enums/notification.ts` | `packages/daemon/src/services/async-polling-service.ts` | NotificationEventType union includes STAKING_UNSTAKE_* | WIRED | Both values in NOTIFICATION_EVENT_TYPES; emitNotification callback accepts `string` type |
| `packages/daemon/src/api/server.ts` | `packages/daemon/src/api/routes/staking.ts` | `createStakingRoutes` mount | WIRED | server.ts line 67 imports createStakingRoutes; line 415 mounts at /v1 |
| `packages/daemon/src/api/routes/staking.ts` | `packages/daemon/src/api/routes/openapi-schemas.ts` | `StakingPositionsResponseSchema` import | WIRED | staking.ts line 25 imports StakingPositionsResponseSchema |
| `packages/mcp/src/tools/action-provider.ts` | `LidoStakingActionProvider` | `mcpExpose:true` auto-registration | WIRED | registerActionProviderTools fetches /v1/actions/providers and creates tools for mcpExpose providers; verified by 8 MCP tests |
| `packages/admin/src/pages/wallets.tsx` | `GET /v1/admin/wallets/:id/staking` | `apiGet(API.ADMIN_WALLET_STAKING(id))` | WIRED | wallets.tsx line 478 calls `apiGet<StakingPositionsResponse>(API.ADMIN_WALLET_STAKING(id))`; ADMIN_WALLET_STAKING endpoint defined in endpoints.ts |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| ASYNC-01 | 256-01 | Lido unstake IAsyncStatusTracker로 Withdrawal Queue 폴링 | SATISFIED | LidoWithdrawalTracker registered in daemon Step 4f-3; checkStatus metadata-based v1 |
| ASYNC-02 | 256-01 | Jito unstake IAsyncStatusTracker로 에포크 경계 폴링 | SATISFIED | JitoEpochTracker registered in daemon Step 4f-3; checkStatus metadata-based v1 |
| ASYNC-03 | 256-01 | unstake 완료 시 STAKING_UNSTAKE_COMPLETED 알림 | SATISFIED | Dynamic notificationEvent dispatch in AsyncPollingService COMPLETED branch |
| ASYNC-04 | 256-01 | unstake 타임아웃 시 STAKING_UNSTAKE_TIMEOUT 알림 | SATISFIED | Dynamic notificationEvent dispatch in AsyncPollingService TIMEOUT branch |
| SAPI-01 | 256-02 | GET /v1/wallets/:id/staking 스테이킹 포지션 조회 | PARTIAL | Implemented as /v1/wallet/staking (sessionAuth) + /v1/admin/wallets/:id/staking (masterAuth); REQUIREMENTS.md path spec not updated to match |
| SAPI-02 | 256-02 | 포지션에 stETH/JitoSOL 잔고, APY, USD 환산 포함 | SATISFIED | StakingPositionSchema includes balance, apy, balanceUsd; hardcoded APY v1 |
| SAPI-03 | 256-02 | 포지션 없으면 빈 배열 반환 | SATISFIED | Route returns `{ positions: [] }` when no staking transactions; test verified |
| INTF-01 | 256-03 | MCP 4개 스테이킹 도구 노출 | SATISFIED | action_lido_staking_stake/unstake, action_jito_staking_stake/unstake; note REQUIREMENTS.md uses shorthand `action_lido_stake` while actual names include `_staking_` infix |
| INTF-02 | 256-03 | TS/Python SDK executeAction 실행 가능 | SATISFIED | Generic executeAction sends POST /v1/actions/{provider}/{action}; verified by mock REST test |
| INTF-03 | 256-03 | Admin 스테이킹 포지션 섹션 렌더링 | SATISFIED | wallets.tsx StakingTab() fully implemented; fetches /v1/admin/wallets/:id/staking |
| INTF-04 | 256-03 | actions.skill.md Lido/Jito 문서 추가 | SATISFIED | Section 6 (Lido) + Section 7 (Jito) with full documentation and security notice |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/daemon/src/__tests__/settings-service.test.ts` | 456 | Hardcoded count `toBe(18)` not updated after 6 new staking settings added (Phases 254+255) | Blocker | 9 test failures in settings-service test suite |
| `packages/daemon/src/__tests__/api-admin-settings.test.ts` | Multiple | Hardcoded settings count expectations not updated after staking settings additions | Blocker | 12 test failures in admin settings test suite |

### Human Verification Required

#### 1. Admin UI Staking Tab Visual Rendering

**Test:** Login to Admin UI, navigate to Wallets, click a wallet detail, click the "Staking" tab.
**Expected:** "Staking Positions" header with Refresh button; empty state shows "No staking positions" message for wallets with no staking history; wallets with staking transactions show a table with Protocol (Lido/Jito badge), Asset (stETH/JitoSOL), Balance, Balance (USD), APY, Pending Unstake columns.
**Why human:** Browser rendering of Preact components, API fetch lifecycle, and table display cannot be verified programmatically.

#### 2. STAKING_UNSTAKE_COMPLETED End-to-End Notification

**Test:** Perform a Lido unstake, then update the transaction's metadata to `{"status": "claimable", ...}` via direct DB edit, then wait for AsyncPollingService poll cycle.
**Expected:** LidoWithdrawalTracker returns COMPLETED state; STAKING_UNSTAKE_COMPLETED notification delivered via configured notification channel (Ntfy/Telegram); i18n template "Staking Unstake Completed" used.
**Why human:** Requires real daemon running, notification channel configured, and manual metadata state injection to simulate Lido withdrawal completion.

### Gaps Summary

**Gap 1 (Blocker): settings-service test count regression**
21 tests fail in the daemon test suite due to hardcoded settings category count expectations (`toBe(18)`) that were not updated when 6 new staking settings were added across phases 254, 255, and 256. Files: `settings-service.test.ts` (9 failures), `api-admin-settings.test.ts` (12 failures). These are straightforward count updates; no logic changes needed.

**Gap 2 (Documentation): SAPI-01 path discrepancy**
REQUIREMENTS.md SAPI-01 specifies `GET /v1/wallets/:id/staking` but the implementation uses `GET /v1/wallet/staking` (singular, sessionAuth) for agent access and `GET /v1/admin/wallets/:id/staking` (masterAuth) for admin access. The SUMMARY documents this as an intentional design decision. The REQUIREMENTS.md text should be updated to match the actual implementation — not a code change, but a documentation alignment.

**Root cause of both gaps:** Phase 256 plans did not include updating the settings-service test counts (which reflects staking settings added in phases 254+255 but not tested there) and did not specify updating REQUIREMENTS.md to match the path decision made in plan 02.

---

_Verified: 2026-02-24T21:35:00Z_
_Verifier: Claude (gsd-verifier)_
