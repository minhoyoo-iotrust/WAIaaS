---
phase: 116-default-deny-toggles
verified: 2026-02-15T15:55:00Z
status: passed
score: 5/5
re_verification: false
---

# Phase 116: Default Deny Toggles Verification Report

**Phase Goal:** 관리자가 기본 거부 정책을 개별적으로 ON/OFF 전환하여 운영 유연성을 확보한 상태  
**Verified:** 2026-02-15T15:55:00Z  
**Status:** passed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin UI/API에서 default_deny_tokens를 OFF로 전환하면 ALLOWED_TOKENS 미설정 월렛도 토큰 전송이 허용된다 | ✓ VERIFIED | DatabasePolicyEngine.evaluateAllowedTokens() line 779-781: `if (this.settingsService?.get('policy.default_deny_tokens') === 'false') { return null; }` + Test: TOGGLE-01 allows TOKEN_TRANSFER when toggle=false |
| 2 | Admin UI/API에서 default_deny_contracts를 OFF로 전환하면 CONTRACT_WHITELIST 미설정 월렛도 컨트랙트 호출이 허용된다 | ✓ VERIFIED | DatabasePolicyEngine.evaluateContractWhitelist() line 846-848: `if (this.settingsService?.get('policy.default_deny_contracts') === 'false') { return null; }` + Test: TOGGLE-02 allows CONTRACT_CALL when toggle=false |
| 3 | Admin UI/API에서 default_deny_spenders를 OFF로 전환하면 APPROVED_SPENDERS 미설정 월렛도 토큰 승인이 허용된다 | ✓ VERIFIED | DatabasePolicyEngine.evaluateApprovedSpenders() line 972-974: `if (this.settingsService?.get('policy.default_deny_spenders') === 'false') { return null; }` + Test: TOGGLE-03 allows APPROVE when toggle=false |
| 4 | 화이트리스트 정책이 설정된 월렛은 토글과 무관하게 정상 화이트리스트 평가가 수행된다 | ✓ VERIFIED | All 3 evaluateXXX methods check for policy existence BEFORE checking toggles (lines 775-778, 843-845, 968-971). Tests: TOGGLE-04 verifies whitelist denial when policy exists + toggle=false (3 tests) |
| 5 | 3개 토글의 기본값은 모두 ON(기본 거부 유지)이며 변경 시 hot-reload로 즉시 반영된다 | ✓ VERIFIED | setting-keys.ts lines 85-87: defaultValue='true' for all 3 toggles. settingsService.get() reads from DB on every call (hot-reload). Test: TOGGLE-05 verifies dynamic toggle change (true→false→true) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | 3개 토글 SETTING_DEFINITIONS | ✓ VERIFIED | Lines 85-87: policy.default_deny_tokens/contracts/spenders with category='security', defaultValue='true' |
| `packages/daemon/src/pipeline/database-policy-engine.ts` | SettingsService DI + 3개 메서드 토글 분기 | ✓ VERIFIED | Line 140: private settingsService field. Lines 142-149: constructor with optional settingsService param. Lines 779, 846, 972: toggle checks in 3 methods |
| `packages/daemon/src/lifecycle/daemon.ts` | DatabasePolicyEngine에 settingsService 전달 | ✓ VERIFIED | Lines 369-373: `new DatabasePolicyEngine(this._db!, this.sqlite ?? undefined, this._settingsService ?? undefined)` |
| `packages/daemon/src/infrastructure/settings/hot-reload.ts` | SECURITY_KEYS에 3개 키 추가 | ✓ VERIFIED | Lines 52-54: 'policy.default_deny_tokens', 'policy.default_deny_contracts', 'policy.default_deny_spenders' added to SECURITY_KEYS Set |
| `packages/admin/src/pages/settings.tsx` | SecuritySettings 섹션에 3개 체크박스 | ✓ VERIFIED | Lines 83-85: keyToLabel mappings. Lines 596-626: "Default Deny Policies" subgroup with 3 FormField checkboxes |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `database-policy-engine.ts` | `settings-service.ts` | `settingsService?.get('policy.default_deny_*')` | ✓ WIRED | Lines 779, 846, 972: All 3 toggle checks use settingsService.get() with null-safe optional chaining |
| `daemon.ts` | `database-policy-engine.ts` | `new DatabasePolicyEngine(db, sqlite, settingsService)` | ✓ WIRED | Lines 369-373: settingsService passed as 3rd constructor arg |
| `settings.tsx` | `PUT /admin/settings` | `handleFieldChange('policy.default_deny_*', v)` | ✓ WIRED | Lines 609, 616, 623: All 3 checkboxes call handleFieldChange with full key 'policy.default_deny_*' |
| `database-policy-engine.test.ts` | `database-policy-engine.ts` | `new DatabasePolicyEngine(db, undefined, settingsService)` | ✓ WIRED | Line 1499: Test suite creates engine with real SettingsService instance for toggle verification |

### Requirements Coverage

From ROADMAP.md Phase 116 requirements: TOGGLE-01, TOGGLE-02, TOGGLE-03, TOGGLE-04, TOGGLE-05

| Requirement | Status | Evidence |
|-------------|--------|----------|
| TOGGLE-01: default_deny_tokens ON/OFF | ✓ SATISFIED | Code: lines 779-781. Tests: 2 passing tests (deny when ON, allow when OFF) |
| TOGGLE-02: default_deny_contracts ON/OFF | ✓ SATISFIED | Code: lines 846-848. Tests: 2 passing tests (deny when ON, allow when OFF) |
| TOGGLE-03: default_deny_spenders ON/OFF | ✓ SATISFIED | Code: lines 972-974. Tests: 2 passing tests (deny when ON, allow when OFF) |
| TOGGLE-04: 화이트리스트 정책 존재 시 토글 무시 | ✓ SATISFIED | Code: all 3 methods check policy existence first. Tests: 3 passing tests (whitelist denies even with toggle=false) |
| TOGGLE-05: hot-reload 즉시 반영 | ✓ SATISFIED | Code: settingsService.get() reads from DB. Tests: 1 passing test (toggle change reflected immediately) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No blocking anti-patterns detected |

**Notes:**
- No TODO/FIXME/placeholder comments in modified code
- No console.log debugging statements
- No empty implementations or stub functions
- All 65 policy engine tests pass (55 existing + 10 new)
- Admin UI builds successfully without errors

### Test Coverage

**Total Tests:** 65 (55 existing + 10 new Default Deny Toggles tests)  
**All Passing:** ✓ Yes  
**Test Suite:** `packages/daemon/src/__tests__/database-policy-engine.test.ts`

**New Tests (Phase 116):**
1. TOGGLE-01: denies TOKEN_TRANSFER when default_deny_tokens=true (default) and no ALLOWED_TOKENS policy
2. TOGGLE-01: allows TOKEN_TRANSFER when default_deny_tokens=false and no ALLOWED_TOKENS policy
3. TOGGLE-02: denies CONTRACT_CALL when default_deny_contracts=true (default) and no CONTRACT_WHITELIST policy
4. TOGGLE-02: allows CONTRACT_CALL when default_deny_contracts=false and no CONTRACT_WHITELIST policy
5. TOGGLE-03: denies APPROVE when default_deny_spenders=true (default) and no APPROVED_SPENDERS policy
6. TOGGLE-03: allows APPROVE when default_deny_spenders=false and no APPROVED_SPENDERS policy
7. TOGGLE-04: evaluates ALLOWED_TOKENS whitelist normally when policy exists, regardless of toggle=false
8. TOGGLE-04: evaluates CONTRACT_WHITELIST normally when policy exists, regardless of toggle=false
9. TOGGLE-04: evaluates APPROVED_SPENDERS normally when policy exists, regardless of toggle=false
10. TOGGLE-05: reflects toggle change on next evaluate() call (hot-reload for tokens)

**Test Execution:**
```
✓ 65 tests passed in 124ms
Duration: 898ms (transform 158ms, setup 0ms, collect 516ms, tests 124ms)
```

### Build Verification

**Daemon TypeScript:** ✓ No type errors  
**Admin UI Build:** ✓ Success (built in 403ms)  
**Vite Output:**
```
dist/index.html                  0.41 kB │ gzip:  0.28 kB
dist/assets/index-BjZDI6Zc.css  19.78 kB │ gzip:  3.53 kB
dist/assets/index-B0OViy4W.js   75.79 kB │ gzip: 23.55 kB
```

### Commit Verification

All 3 commits from SUMMARY.md verified in git history:

1. **8165702** - feat(116-01): SettingsService 기반 3개 기본 거부 토글 + DatabasePolicyEngine DI
   - Modified: setting-keys.ts, database-policy-engine.ts, daemon.ts, hot-reload.ts
   
2. **9a67e64** - feat(116-01): Admin UI SecuritySettings에 Default Deny Toggles 체크박스 추가
   - Modified: settings.tsx (+35 lines)
   
3. **7036fdc** - test(116-02): Default Deny Toggles 테스트 10개 추가
   - Modified: database-policy-engine.test.ts (+248 lines)

### Implementation Quality

**Backward Compatibility:** ✓ Excellent  
- settingsService is optional 3rd constructor parameter
- Null-safe optional chaining: `settingsService?.get()`
- If settingsService not provided, defaults to deny (safe fallback)
- All existing tests pass without modification

**Code Patterns:**
- ✓ Null-safe optional chaining prevents runtime errors
- ✓ Toggle checks only in "no policy exists" branches (correct precedence)
- ✓ Real SettingsService in tests (not mocked) for accurate hot-reload verification
- ✓ Consistent pattern across all 3 toggle types

**DX Quality:**
- ✓ Clear Admin UI labels: "Default Deny: Token Transfers", etc.
- ✓ Help text explains toggle behavior
- ✓ Organized in dedicated "Default Deny Policies" subgroup
- ✓ Hot-reload SECURITY_KEYS logging for operator visibility

## Overall Assessment

**Status:** PASSED ✓

Phase 116 goal fully achieved. All 5 observable truths verified through:
- Code inspection: 3 toggle definitions, SettingsService DI, 3 evaluation method branches, Admin UI checkboxes
- Automated testing: 10 comprehensive tests covering ON/OFF, whitelist coexistence, hot-reload
- Build verification: TypeScript compilation success, Admin UI build success
- Commit verification: All 3 commits present with expected changes

**Key Strengths:**
1. Perfect backward compatibility (optional settingsService parameter)
2. Null-safe implementation prevents runtime errors
3. Correct policy precedence (whitelist overrides toggles)
4. Real SettingsService in tests ensures accurate behavior verification
5. Clear Admin UI with explanatory help text

**No gaps, no human verification needed, no blockers.**

Phase ready to proceed to Phase 117.

---

_Verified: 2026-02-15T15:55:00Z_  
_Verifier: Claude (gsd-verifier)_
