---
phase: 141-autostop-engine
plan: 02
subsystem: security
tags: [autostop, config, admin-settings, hot-reload, daemon-lifecycle, i18n, notification]

# Dependency graph
requires:
  - phase: 141-autostop-engine
    plan: 01
    provides: "AutoStopService 4-rule engine + EventBus subscription"
provides:
  - "DaemonConfigSchema security 섹션 autostop_* flat key 6개 (Zod 기본값)"
  - "SETTING_DEFINITIONS autostop 카테고리 6개 키 (Admin Settings 런타임 오버라이드)"
  - "DaemonLifecycle Step 4c-3 AutoStopService 초기화/시작/종료 통합"
  - "HotReloadOrchestrator autostop 키 변경 감지 + updateConfig() 호출"
  - "AUTO_STOP_TRIGGERED i18n 범용 템플릿 ({walletId}/{reason}/{rule})"
affects: [142-balance-monitoring, 143-telegram-bot, 144-admin-ui-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["HotReloadOrchestrator autostop category handler", "SettingsService -> AutoStopService config bridge"]

key-files:
  created:
    - "packages/daemon/src/__tests__/autostop-integration.test.ts"
  modified:
    - "packages/daemon/src/infrastructure/config/loader.ts"
    - "packages/daemon/src/infrastructure/settings/setting-keys.ts"
    - "packages/daemon/src/infrastructure/settings/hot-reload.ts"
    - "packages/daemon/src/lifecycle/daemon.ts"
    - "packages/core/src/i18n/en.ts"
    - "packages/core/src/i18n/ko.ts"
    - "packages/daemon/src/services/autostop-service.ts"
    - "packages/daemon/src/__tests__/settings-service.test.ts"
    - "packages/daemon/src/__tests__/autostop-service.test.ts"

key-decisions:
  - "기존 auto_stop_consecutive_failures_threshold(기본값 3) 제거, autostop_consecutive_failures_threshold(기본값 5)로 교체"
  - "autostop 키를 security 섹션 내 flat key로 유지 (CLAUDE.md 중첩 금지 규칙 준수)"
  - "SETTING_DEFINITIONS에 별도 autostop 카테고리 추가 (Admin UI에서 독립 섹션으로 표시)"
  - "AUTO_STOP_TRIGGERED i18n 템플릿을 범용 {walletId}/{reason}/{rule}로 변경하여 모든 규칙 커버"
  - "HotReloadOrchestrator에서 autostop 키 변경은 동기(synchronous) 처리 (async 불필요)"
  - "DaemonLifecycle Step 4c-3 위치: KillSwitchService + NotificationService 이후, PriceOracle 이전"

patterns-established:
  - "config.toml flat key -> SETTING_DEFINITIONS -> SettingsService.get() -> AutoStopService.updateConfig() 전체 파이프라인"
  - "HotReloadOrchestrator 동기 처리 패턴: reloadAutoStop() 메서드"

# Metrics
duration: 8min
completed: 2026-02-16
---

# Phase 141 Plan 02: AutoStop 설정 관리 + DaemonLifecycle 통합 + 알림 통합 Summary

**config.toml autostop 6개 flat key + Admin Settings 런타임 오버라이드 + DaemonLifecycle Step 4c-3 통합 + i18n 범용 알림 템플릿**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-16T05:56:32Z
- **Completed:** 2026-02-16T06:04:31Z
- **Tasks:** 2
- **Files created:** 1
- **Files modified:** 9 + 17 test files (config key rename)

## Accomplishments
- DaemonConfigSchema security 섹션에 autostop_* flat key 6개 추가 (기본값: 5/20/300/3600/60/true)
- 기존 auto_stop_consecutive_failures_threshold(기본값 3) 제거 -> autostop_consecutive_failures_threshold(기본값 5, AUTO-01) 교체
- SETTING_DEFINITIONS에 autostop 카테고리 6개 키 등록 (Admin Settings 런타임 조회/수정 가능)
- DaemonLifecycle Step 4c-3에 AutoStopService 초기화/시작 통합, shutdown에서 stop() 호출
- HotReloadOrchestrator에 autostop 키 변경 감지 + AutoStopService.updateConfig() 호출
- AUTO_STOP_TRIGGERED i18n 템플릿을 범용 {walletId}/{reason}/{rule} 변수로 변경 (en/ko)
- 16개 통합 테스트 + 18개 기존 단위 테스트 = 34개 AutoStop 관련 테스트 전체 통과
- 전체 daemon 테스트 1403개 통과 (사전 존재 api-policies 1개 실패만 유지)

## Task Commits

Each task was committed atomically:

1. **Task 1: config.toml autostop 키 + Admin Settings + i18n** - `7f3fc81` (feat)
2. **Task 2: DaemonLifecycle + hot-reload + 통합 테스트** - `414d601` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/config/loader.ts` - DaemonConfigSchema security 섹션에 autostop_* 6개 키 추가
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - SETTING_CATEGORIES에 'autostop' 추가, SETTING_DEFINITIONS에 6개 키
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` - HotReloadDeps에 autoStopService 추가, reloadAutoStop() 메서드
- `packages/daemon/src/lifecycle/daemon.ts` - Step 4c-3 AutoStopService 초기화/시작, shutdown stop(), HotReloadOrchestrator wiring
- `packages/core/src/i18n/en.ts` - AUTO_STOP_TRIGGERED 범용 템플릿 ({walletId}/{reason}/{rule})
- `packages/core/src/i18n/ko.ts` - AUTO_STOP_TRIGGERED 범용 템플릿 ({walletId}/{reason}/{rule})
- `packages/daemon/src/services/autostop-service.ts` - 알림 호출에 walletId/reason/rule 변수 전달
- `packages/daemon/src/__tests__/autostop-integration.test.ts` - 16개 통합 테스트 (config/settings/notification/enabled/i18n/hot-reload)
- `packages/daemon/src/__tests__/settings-service.test.ts` - autostop 카테고리 반영 (39->45개)
- `packages/daemon/src/__tests__/autostop-service.test.ts` - i18n 범용 변수 반영
- 17개 API 테스트 파일 - auto_stop_consecutive_failures_threshold -> autostop_consecutive_failures_threshold 키 이름 갱신

## Decisions Made
- 기존 `auto_stop_consecutive_failures_threshold` (기본값 3, min 1 max 20) 제거 -> `autostop_consecutive_failures_threshold` (기본값 5, min 1 max 50) 교체 -- AUTO-01 요구사항 "5회 연속 실패" 반영
- autostop 키는 security TOML 섹션 내 flat key 유지 (새 TOML 섹션 추가 불필요)
- Admin Settings에서는 별도 'autostop' 카테고리로 분리 (UI에서 독립 표시)
- HotReloadOrchestrator의 autostop 처리를 동기(synchronous)로 구현 (DB I/O 없이 parseInt + updateConfig만)
- AUTO_STOP_TRIGGERED i18n 템플릿에서 단일 `{failures}` 변수를 범용 `{walletId}/{reason}/{rule}`로 교체하여 4가지 규칙 모두 커버

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] settings-service.test.ts 하드코딩된 카테고리/수 업데이트**
- **Found during:** Task 2 검증 (전체 테스트 실행)
- **Issue:** settings-service 테스트가 validCategories에 'autostop' 미포함, 정의 수 39 하드코딩
- **Fix:** validCategories에 'autostop' 추가, 정의 수 39->45로 갱신
- **Files modified:** packages/daemon/src/__tests__/settings-service.test.ts
- **Commit:** 414d601

**2. [Rule 1 - Bug] 17개 테스트 파일 config 키 이름 갱신**
- **Found during:** Task 1 (기존 키 제거 후 빌드)
- **Issue:** 17개 API 테스트 파일에서 `auto_stop_consecutive_failures_threshold: 3` 참조
- **Fix:** 일괄 rename -> `autostop_consecutive_failures_threshold: 5`
- **Files modified:** 17 test files
- **Commit:** 7f3fc81

## Issues Encountered

- Pre-existing api-policies 테스트 1개 실패 (404 vs 400, 이 계획과 무관)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- AutoStop Engine 전체 구현 완료 (4 규칙 + config + settings + DaemonLifecycle + hot-reload + 알림)
- Phase 142 BalanceMonitorService가 동일 EventBus + config.toml + Admin Settings 패턴 적용 가능
- Phase 143 Telegram Bot에서 AutoStop 알림이 i18n 템플릿으로 자동 발송됨
- Phase 144 Admin UI에서 autostop 카테고리가 Settings 패널에 자동 표시됨

## Self-Check: PASSED

- [x] autostop-integration.test.ts FOUND
- [x] loader.ts contains autostop_consecutive_failures_threshold
- [x] setting-keys.ts contains category: 'autostop'
- [x] daemon.ts contains new AutoStopService
- [x] hot-reload.ts contains reloadAutoStop
- [x] en.ts AUTO_STOP_TRIGGERED contains {walletId} {reason} {rule}
- [x] ko.ts AUTO_STOP_TRIGGERED contains {walletId} {reason} {rule}
- [x] Commit 7f3fc81 FOUND
- [x] Commit 414d601 FOUND

---
*Phase: 141-autostop-engine*
*Completed: 2026-02-16*
