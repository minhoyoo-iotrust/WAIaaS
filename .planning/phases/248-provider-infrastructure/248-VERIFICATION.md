---
phase: 248-provider-infrastructure
verified: 2026-02-23T23:20:00Z
status: gaps_found
score: 4/5 success criteria verified
gaps:
  - truth: "When resolve() returns an array, the actions route executes each element through the 6-stage pipeline sequentially"
    status: partial
    reason: "Sequential pipeline execution IS implemented correctly in actions route. However, 16 pre-existing tests (extension + security) that call executeResolve() were not updated to expect ContractCallRequest[] instead of ContractCallRequest. The registry auto-tagging pattern is also broken in those tests because result.type is undefined (array has no .type). This causes 17 daemon test failures."
    artifacts:
      - path: "packages/daemon/src/__tests__/extension/action-provider.extension.test.ts"
        issue: "Tests access result.type directly (e.g. line 211, 295, 334, 377, 486) but executeResolve now returns ContractCallRequest[] -- should be result[0].type"
      - path: "packages/daemon/src/__tests__/security/extension/action-provider-attacks.security.test.ts"
        issue: "Tests access result.type directly (lines 127, 128, 200, 603) but executeResolve now returns ContractCallRequest[]"
      - path: "packages/daemon/src/__tests__/security/extension/swap-slippage-attacks.security.test.ts"
        issue: "Tests access result.type at line 422 but executeResolve now returns ContractCallRequest[]"
      - path: "packages/daemon/src/__tests__/notification-channels.test.ts"
        issue: "Line 51 asserts NOTIFICATION_EVENT_TYPES.toHaveLength(30) but 248-01 added ACTION_API_KEY_REQUIRED making it 31"
    missing:
      - "Update action-provider.extension.test.ts: change result.type -> result[0].type and result.to -> result[0].to in all executeResolve assertions"
      - "Update action-provider-attacks.security.test.ts: change result.type -> result[0].type in lines 127, 128, 200, 603"
      - "Update swap-slippage-attacks.security.test.ts: change result.type -> result[0].type in line 422 and all similar assertions"
      - "Update notification-channels.test.ts line 51: change toHaveLength(30) to toHaveLength(31)"
human_verification:
  - test: "Navigate to Admin UI Actions page at #/actions"
    expected: "Two provider cards (Jupiter Swap, 0x Swap) render with name, description, chain badge, status badge, and enable/disable toggle. 0x Swap shows API Key section."
    why_human: "Preact CSP-sandboxed UI cannot be verified programmatically by grep/file checks"
  - test: "Enable Jupiter Swap toggle in Admin UI, then make a swap API call without jupiter_swap in CONTRACT_WHITELIST"
    expected: "The swap executes successfully (CONTRACT_WHITELIST is bypassed due to provider-trust)"
    why_human: "Requires running daemon + actual API call sequence"
---

# Phase 248: Provider Infrastructure Verification Report

**Phase Goal:** 운영자가 Admin UI에서 ActionProvider를 관리하고, 프로바이더가 다중 트랜잭션(approve+swap)을 순차 파이프라인으로 실행할 수 있다
**Verified:** 2026-02-23T23:20:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin UI Actions 페이지에서 빌트인 프로바이더(Jupiter, 0x) 목록이 표시되고, 활성화 토글과 API 키 입력이 동작한다 | ? HUMAN | actions.tsx exists (346 lines), layout.tsx wired. Needs browser verification. |
| 2 | config.toml [actions] 섹션 없이 Admin Settings만으로 프로바이더 설정이 관리되며, 기존 Jupiter 설정이 정상 이관된다 | ✓ VERIFIED | daemon.ts passes SettingsService to registerBuiltInProviders. config.toml [actions] kept for backward compat parsing only. |
| 3 | API 키 미설정 상태에서 스왑 시도 시 ACTION_API_KEY_REQUIRED 알림이 adminUrl 필드와 함께 발송된다 | ✓ VERIFIED | actions.ts line 235 fires notify('ACTION_API_KEY_REQUIRED', ...) with adminUrl before throwing. |
| 4 | resolve()가 ContractCallRequest 배열을 반환하면 actions route가 각 요소를 순차적으로 6-stage 파이프라인에 통과시킨다 | ✗ FAILED | Sequential pipeline loop implemented correctly (actions.ts lines 332-393). But 17 tests fail because extension/security test files were NOT updated after executeResolve() return type changed to array. |
| 5 | actionProvider 태그가 있는 ContractCallRequest는 해당 프로바이더가 활성화 상태일 때 CONTRACT_WHITELIST 검사를 건너뛴다 | ✓ VERIFIED | database-policy-engine.ts lines 1043-1054 implement provider-trust bypass. stages.ts passes actionProvider through buildTransactionParam. 3 PTRUST tests pass. |

**Score:** 3/5 truths auto-verified (1 human-needed, 1 failed)

### Required Artifacts

#### Plan 248-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | actions category with 13 setting keys | ✓ VERIFIED | Lines 155-168: 8 jupiter_swap + 5 zerox_swap keys. 'actions' in SETTING_CATEGORIES line 46. |
| `packages/core/src/enums/notification.ts` | ACTION_API_KEY_REQUIRED event type | ✓ VERIFIED | Line 35: 'ACTION_API_KEY_REQUIRED' is 31st event in array. |
| `packages/core/src/i18n/en.ts` | English template with provider and adminUrl fields | ✓ VERIFIED | Line 209: Template includes provider, adminUrl. |
| `packages/actions/src/index.ts` | registerBuiltInProviders accepting SettingsReader | ✓ VERIFIED | Lines 25-95: SettingsReader interface, settingsReader.get() calls throughout. |

#### Plan 248-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core/src/interfaces/action-provider.types.ts` | resolve() returning ContractCallRequest \| ContractCallRequest[] | ✓ VERIFIED | Line 112: `Promise<ContractCallRequest \| ContractCallRequest[]>` |
| `packages/core/src/schemas/transaction.schema.ts` | Optional actionProvider field on ContractCallRequestSchema | ✓ VERIFIED | Line 120: `actionProvider: z.string().optional()` |
| `packages/daemon/src/infrastructure/action/action-provider-registry.ts` | executeResolve returning array with auto-tagging | ✓ VERIFIED | Lines 165-218: returns ContractCallRequest[], auto-tags line 206. |
| `packages/daemon/src/api/routes/actions.ts` | Sequential pipeline execution for array results | ✓ VERIFIED | Lines 332-393: for loop over contractCalls, each gets own PipelineContext. |
| `packages/daemon/src/pipeline/database-policy-engine.ts` | Provider-trust skip for CONTRACT_WHITELIST | ✓ VERIFIED | Lines 1043-1054: provider-trust bypass logic with settingsService check. |

#### Plan 248-03 Artifacts

| Artifact | Expected (min_lines) | Status | Details |
|----------|---------------------|--------|---------|
| `packages/admin/src/pages/actions.tsx` | Actions page component, min 100 lines | ✓ VERIFIED | 346 lines. BUILTIN_PROVIDERS, handleToggle, handleSaveApiKey, handleDeleteApiKey, getStatus all implemented. |
| `packages/admin/src/components/layout.tsx` | Updated navigation with Actions item | ✓ VERIFIED | Line 16: ActionsPage import. Line 66: nav item. Line 81: route. |
| `packages/admin/src/api/endpoints.ts` | ACTIONS_PROVIDERS endpoint constant | ✓ VERIFIED | Line 44: `ACTIONS_PROVIDERS: '/v1/actions/providers'` |

### Key Link Verification

#### Plan 248-01 Key Links

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `packages/daemon/src/lifecycle/daemon.ts` | `packages/actions/src/index.ts` | `registerBuiltInProviders(registry, settingsService)` | ✓ WIRED | Lines 885-886: `registerBuiltInProviders(this.actionProviderRegistry, this._settingsService!)` |
| `packages/daemon/src/api/routes/actions.ts` | notification-service | `notify ACTION_API_KEY_REQUIRED` | ✓ WIRED | Line 235: `deps.notificationService?.notify('ACTION_API_KEY_REQUIRED', walletId, {...})` |
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | settings-service | `SETTING_DEFINITIONS lookup` | ✓ WIRED | 'actions' category in SETTING_CATEGORIES. SETTING_DEFINITIONS has 13 actions.* entries. |

#### Plan 248-02 Key Links

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `packages/daemon/src/api/routes/actions.ts` | `action-provider-registry.ts` | `executeResolve` | ✓ WIRED | Line 270: `contractCalls = await deps.registry.executeResolve(...)` |
| `packages/daemon/src/pipeline/database-policy-engine.ts` | `settings-service.ts` | `actions.{name}_enabled` check | ✓ WIRED | Lines 1044-1050: `this.settingsService.get(enabledKey)` where enabledKey = `actions.${provider}_enabled` |
| `packages/daemon/src/api/routes/actions.ts` | `pipeline/stages.ts` | `stage1Validate` sequential loop | ✓ WIRED | Lines 332-393: for loop, each iteration calls `await stage1Validate(ctx)` |

#### Plan 248-03 Key Links

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `packages/admin/src/pages/actions.tsx` | `packages/admin/src/api/endpoints.ts` | `ADMIN_SETTINGS`, `ADMIN_API_KEY` | ✓ WIRED | apiPut(API.ADMIN_SETTINGS, ...) and apiPut(API.ADMIN_API_KEY(providerKey), ...) |
| `packages/admin/src/components/layout.tsx` | `packages/admin/src/pages/actions.tsx` | Route `/actions` | ✓ WIRED | Line 81: `if (path === '/actions') return <ActionsPage />;` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| PINF-01 | 248-01 | Admin Settings에 `actions` 카테고리가 등록되어 프로바이더별 설정 키를 관리할 수 있다 | ✓ SATISFIED | setting-keys.ts: 13 actions.* keys in SETTING_DEFINITIONS, 'actions' in SETTING_CATEGORIES |
| PINF-02 | 248-01 | `registerBuiltInProviders()`가 SettingsService에서 설정을 읽어 `enabled !== false`일 때 기본 활성화한다 | ✓ SATISFIED | actions/src/index.ts: settingsReader.get(enabledKey) === 'true' check |
| PINF-03 | 248-01 | config.toml `[actions]` 섹션이 제거되고 기존 Jupiter 설정이 Admin Settings로 이관된다 | ⚠️ PARTIAL | config.toml [actions] section preserved in DaemonConfigSchema for backward compat. Daemon no longer reads from it directly. ROADMAP success criterion ("Admin Settings만으로 관리") IS met. Literal "제거" (removal) not done. |
| PINF-04 | 248-03 | Admin UI Actions 페이지에서 빌트인 프로바이더 목록, 활성화 토글, API 키 관리가 가능하다 | ? HUMAN | actions.tsx implements all features. Needs browser verification. |
| PINF-05 | 248-01 | API 키 미설정 시 ACTION_API_KEY_REQUIRED 알림 이벤트가 발송된다 (adminUrl 필드 포함) | ✓ SATISFIED | actions.ts line 235: notify with provider, action, adminUrl |
| PINF-06 | 248-02 | IActionProvider.resolve() 반환 타입이 ContractCallRequest[]로 확장되고 actions route가 배열을 순차 파이프라인으로 실행한다 | ✗ BLOCKED | Interface and route implementation correct. But 16 existing tests not updated for array return type, causing 17 test failures in daemon package. |
| PINF-07 | 248-02 | ContractCallRequest에 actionProvider 옵션 필드가 추가되고 활성화된 프로바이더의 resolve() 결과에 자동 태깅된다 | ✓ SATISFIED | schema has actionProvider field. Registry auto-tags after Zod validation. |
| PINF-08 | 248-02 | Policy Stage 3에서 actionProvider 태그가 있고 해당 프로바이더가 활성화 상태이면 CONTRACT_WHITELIST 검사를 skip한다 | ✓ SATISFIED | database-policy-engine.ts evaluateContractWhitelist: provider-trust bypass verified. 3 PTRUST tests pass. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/daemon/src/__tests__/notification-channels.test.ts` | 51 | `toHaveLength(30)` for NOTIFICATION_EVENT_TYPES | 🛑 Blocker | Test fails: now 31 events (ACTION_API_KEY_REQUIRED added in 248-01). CI broken. |
| `packages/daemon/src/__tests__/extension/action-provider.extension.test.ts` | 211, 295, 334, 377, 486 | `result.type` (expects single object, gets array) | 🛑 Blocker | 6 test failures: executeResolve now returns array. result[0].type needed. |
| `packages/daemon/src/__tests__/security/extension/action-provider-attacks.security.test.ts` | 127, 128, 200, 603 | `result.type`, `result.to` (expects single object, gets array) | 🛑 Blocker | 4+ test failures: same array return type issue. |
| `packages/daemon/src/__tests__/security/extension/swap-slippage-attacks.security.test.ts` | 422 | `result.type` (expects single object, gets array) | 🛑 Blocker | 1 test failure: same array return type issue. |
| `packages/daemon/src/__tests__/extension/action-provider.extension.test.ts` | multiple | ACT-U04, ACT-I03, ACT-F01, ACT-F02, ACT-X01, ACT-X02, ACT-X03 assertions | 🛑 Blocker | Multiple cascading failures from same root cause. |

**Total daemon test results:** 17 failed, 2948 passed, 1 skipped (2966 total)

### Human Verification Required

#### 1. Admin UI Actions Page Rendering

**Test:** Open daemon Admin UI (http://localhost:3000/admin) and navigate to the Actions page via the sidebar
**Expected:** Two provider cards display (Jupiter Swap + 0x Swap) with name, description, chain badge, status badge (Inactive by default), and enable/disable toggle
**Why human:** Preact UI with CSP cannot be verified by static code analysis

#### 2. Provider Trust Bypass End-to-End

**Test:** Enable Jupiter Swap in Admin UI Settings, then call POST /v1/actions/jupiter_swap/swap without adding any CONTRACT_WHITELIST policy
**Expected:** The swap executes (CONTRACT_WHITELIST is bypassed due to actionProvider='jupiter_swap' tag + enabled state)
**Why human:** Requires running daemon + actual API calls against a live chain adapter

### Gaps Summary

**Root cause of all 17 test failures:** When Plan 248-02 changed `executeResolve()` to return `ContractCallRequest[]` (array), the tests in `action-provider-registry.test.ts` were correctly updated (per the SUMMARY). However, three other test files that ALSO call `executeResolve()` were NOT updated:

1. `action-provider.extension.test.ts` — 6 occurrences of `result.type` / `result.to` that need `result[0].type` / `result[0].to`
2. `action-provider-attacks.security.test.ts` — 4 occurrences
3. `swap-slippage-attacks.security.test.ts` — direct `.type` access

Additionally, `notification-channels.test.ts` in the daemon package still asserts 30 event types (not updated when 31st event ACTION_API_KEY_REQUIRED was added in 248-01).

**These are pre-existing test regressions introduced by 248-01 and 248-02 changes that were not caught by those plans** (the plans only ran tests in filtered scope). The actual implementation code is correct — only test assertion updates are needed.

**PINF-03 nuance:** The REQUIREMENTS.md says config.toml `[actions]` is "제거되고" (removed), but the implementation preserves it for backward compat. The PLAN explicitly documented this decision ("preserved for backward compat but settings take priority"). The ROADMAP success criterion 2 ("Admin Settings만으로 프로바이더 설정이 관리") IS satisfied because the daemon no longer reads config.actions.* directly. This is a gap between the requirement literal text and implementation but is consistent with the roadmap success criterion.

---

_Verified: 2026-02-23T23:20:00Z_
_Verifier: Claude (gsd-verifier)_
