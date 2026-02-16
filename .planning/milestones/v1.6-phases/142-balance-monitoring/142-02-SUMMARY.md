---
phase: 142-balance-monitoring
plan: 02
subsystem: monitoring
tags: [config, settings, hot-reload, lifecycle, integration-test]
dependency_graph:
  requires: [142-01]
  provides: [monitoring-config-pipeline, lifecycle-integration, hot-reload-monitoring]
  affects: [daemon-lifecycle, settings-service, hot-reload-orchestrator]
tech_stack:
  added: []
  patterns: [config-flat-key, admin-settings-category, hot-reload-handler, fail-soft-initialization]
key_files:
  created:
    - packages/daemon/src/__tests__/balance-monitor-integration.test.ts
  modified:
    - packages/daemon/src/infrastructure/config/loader.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/src/infrastructure/settings/hot-reload.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/__tests__/settings-service.test.ts
decisions:
  - monitoring_* flat key를 security TOML 섹션에 배치 (autostop 패턴 동일)
  - monitoring 카테고리를 Admin Settings에서 별도 표시 (autostop 카테고리 패턴 동일)
  - HotReloadOrchestrator에서 동기 처리 (reloadAutoStop과 동일 패턴)
  - DaemonLifecycle Step 4c-4에서 fail-soft 초기화 (adapterPool 필요)
  - settings-service.test.ts validCategories/정의 수 갱신 (45->50)
metrics:
  duration: 3m
  completed: 2026-02-16
  tasks: 2/2
  tests_added: 14
  tests_total: 58
---

# Phase 142 Plan 02: 잔액 모니터링 설정 관리 + DaemonLifecycle 통합 Summary

config.toml monitoring_* flat key 5개 + Admin Settings monitoring 카테고리 + HotReload 핸들러 + DaemonLifecycle Step 4c-4 초기화/종료 통합

## What Was Done

### Task 1: config.toml monitoring flat key + Admin Settings + HotReload
- `DaemonConfigSchema` security 섹션에 `monitoring_check_interval_sec`, `monitoring_low_balance_threshold_sol`, `monitoring_low_balance_threshold_eth`, `monitoring_cooldown_hours`, `monitoring_enabled` 5개 flat key 추가
- `SETTING_DEFINITIONS`에 monitoring 카테고리 5개 키 등록 (`security.monitoring_*` configPath 패턴)
- `SETTING_CATEGORIES`에 `'monitoring'` 추가
- `HotReloadOrchestrator`에 `reloadBalanceMonitor()` private 메서드 추가 (동기 처리, parseFloat 사용)
- `HotReloadDeps` 인터페이스에 `balanceMonitorService` optional 필드 추가

### Task 2: DaemonLifecycle 통합 + 통합 테스트
- `DaemonLifecycle` Step 4c-4에서 BalanceMonitorService 초기화/시작 (fail-soft)
- `shutdown()`에 `balanceMonitorService.stop()` 추가 (EventBus cleanup 이전)
- HotReloadOrchestrator 생성자에 `balanceMonitorService` 전달
- 통합 테스트 14개: config 기본값 파싱, SETTING_DEFINITIONS 카테고리, SettingsService->BalanceMonitorConfig 파이프라인, LOW_BALANCE NotificationEventType, i18n en/ko 보간, HotReload 감지/미감지/변경값 반영, Zod 범위 유효성 검증 4개
- `settings-service.test.ts` validCategories에 monitoring 추가, 정의 수 45->50 갱신

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | fddad2d | feat(142-02): config.toml monitoring flat key + Admin Settings + HotReload 통합 |
| 2 | c390646 | feat(142-02): DaemonLifecycle 통합 + 통합 테스트 14개 |

## Verification Results

- `pnpm --filter @waiaas/daemon build` -- 성공
- `balance-monitor-service.test.ts` -- 15/15 통과
- `balance-monitor-integration.test.ts` -- 14/14 통과
- `settings-service.test.ts` -- 29/29 통과
- 전체 58 테스트 통과

## Self-Check: PASSED

- All 5 key files verified on disk
- Commits fddad2d and c390646 verified in git log
