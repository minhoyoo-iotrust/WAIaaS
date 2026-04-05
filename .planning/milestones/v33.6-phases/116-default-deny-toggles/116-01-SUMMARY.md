---
phase: 116-default-deny-toggles
plan: 01
subsystem: security, policy, admin-ui
tags: [settings-service, policy-engine, default-deny, admin-ui, hot-reload]

# Dependency graph
requires:
  - phase: 81-approve-policies
    provides: "DatabasePolicyEngine ALLOWED_TOKENS/CONTRACT_WHITELIST/APPROVED_SPENDERS 평가"
  - phase: 99-admin-settings
    provides: "SettingsService + HotReloadOrchestrator + Admin Settings UI"
provides:
  - "3개 기본 거부 토글 (policy.default_deny_tokens/contracts/spenders)"
  - "DatabasePolicyEngine SettingsService DI + 토글 분기"
  - "Admin UI SecuritySettings Default Deny Policies 서브그룹"
affects: [policy-engine-tests, admin-settings, daemon-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SettingsService DI를 통한 정책 엔진 런타임 설정 제어"
    - "null-safe optional chaining으로 하위 호환 유지 (settingsService?.get())"

key-files:
  created: []
  modified:
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/src/pipeline/database-policy-engine.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/infrastructure/settings/hot-reload.ts
    - packages/admin/src/pages/settings.tsx

key-decisions:
  - "settingsService를 DatabasePolicyEngine 생성자의 선택적 파라미터로 추가 (하위 호환)"
  - "토글은 오직 'no policy exists' 분기에서만 확인 -- 정책 존재 시 토글 무관 화이트리스트 평가"
  - "settingsService?.get() null-safe 패턴으로 미전달 시 기본 거부 유지"

patterns-established:
  - "SettingsService DI: 정책 엔진에 런타임 설정 주입 패턴"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 116 Plan 01: Default Deny Toggles Summary

**SettingsService 기반 3개 기본 거부 토글 추가 -- DatabasePolicyEngine DI + Admin UI 체크박스**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T15:43:07Z
- **Completed:** 2026-02-14T15:45:37Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- setting-keys.ts에 policy.default_deny_tokens/contracts/spenders 3개 토글 SETTING_DEFINITIONS 추가
- DatabasePolicyEngine에 SettingsService DI 주입 + 3개 "no policy" 분기에 토글 확인 로직 삽입
- Admin UI SecuritySettings에 "Default Deny Policies" 서브그룹 + 3개 체크박스 노출
- hot-reload.ts SECURITY_KEYS에 3개 키 추가 (운영자 로그 가시성)
- 기존 55개 정책 엔진 테스트 모두 통과 (하위 호환 검증)

## Task Commits

Each task was committed atomically:

1. **Task 1: SETTING_DEFINITIONS + DatabasePolicyEngine DI + 분기 로직** - `8165702` (feat)
2. **Task 2: Admin UI SecuritySettings 체크박스 추가** - `9a67e64` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - 3개 토글 SETTING_DEFINITIONS 추가
- `packages/daemon/src/pipeline/database-policy-engine.ts` - SettingsService DI + 3개 메서드 토글 분기
- `packages/daemon/src/lifecycle/daemon.ts` - DatabasePolicyEngine에 settingsService 전달
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` - SECURITY_KEYS에 3개 키 추가
- `packages/admin/src/pages/settings.tsx` - SecuritySettings Default Deny Policies 서브그룹 + 3개 체크박스

## Decisions Made
- settingsService를 DatabasePolicyEngine 생성자의 선택적 3번째 파라미터로 추가 (기존 코드 무수정 호환)
- `settingsService?.get('policy.default_deny_*') === 'false'` 패턴: null-safe하고 명시적 opt-out만 허용
- 토글은 오직 "no policy exists" 분기에서만 확인 -- 정책이 존재하면 토글과 무관하게 화이트리스트 평가 정상 수행

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 3개 토글이 SettingsService에 등록되어 Admin UI/API에서 조작 가능
- Phase 116-02 테스트 계획에서 토글 ON/OFF 동작 검증 예정
- 기존 정책 엔진 테스트 모두 통과 확인

## Self-Check: PASSED

All 5 modified files verified present. Both commits (8165702, 9a67e64) verified in git history.

---
*Phase: 116-default-deny-toggles*
*Completed: 2026-02-15*
