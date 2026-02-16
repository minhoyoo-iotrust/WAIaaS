---
phase: 142-balance-monitoring
plan: 01
subsystem: monitoring
tags: [balance-monitor, notification, low-balance, service]
dependency_graph:
  requires: [core-notification-types, adapter-pool, notification-service]
  provides: [BalanceMonitorService, LOW_BALANCE-event]
  affects: [daemon-lifecycle, admin-settings]
tech_stack:
  added: []
  patterns: [setInterval-polling, per-wallet-error-isolation, cooldown-dedup, recovery-detection]
key_files:
  created:
    - packages/daemon/src/services/monitoring/balance-monitor-service.ts
    - packages/daemon/src/__tests__/balance-monitor-service.test.ts
  modified:
    - packages/core/src/enums/notification.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
decisions:
  - "BalanceMonitorService는 EventBus 구독 대신 setInterval 기반 주기적 폴링 (5분 기본값)"
  - "잔액 비교는 Number(balance)/10**decimals decimal 변환 후 임계값 비교"
  - "중복 알림 방지: wasLow 플래그 + 24시간 쿨다운, 회복 후 재하락 시 새 알림 허용"
metrics:
  duration: 4m
  completed: 2026-02-16
  tasks: 2/2
  tests: 15
  files_created: 2
  files_modified: 3
  loc_added: 788
---

# Phase 142 Plan 01: BalanceMonitorService 코어 + LOW_BALANCE 알림 인프라 Summary

BalanceMonitorService가 setInterval 기반으로 모든 활성 월렛의 네이티브 토큰 잔액을 주기적 체크하고, 체인별 임계값(SOL 0.01, ETH 0.005) 이하 시 LOW_BALANCE 알림을 발송하며, 24시간 쿨다운 + 회복 후 재하락 감지를 지원한다.

## Tasks Completed

### Task 1: LOW_BALANCE NotificationEventType + i18n 템플릿
- `NOTIFICATION_EVENT_TYPES` 배열에 `LOW_BALANCE` 추가 (24번째 이벤트)
- en.ts: `Low Balance Alert` + `{walletId}/{balance}/{currency}/{threshold}` 변수 템플릿
- ko.ts: `잔액 부족 알림` + 동일 변수 한글 템플릿
- TypeScript 컴파일 성공 (Messages 인터페이스 자동 키 검증)
- **Commit:** 1bc0bc8

### Task 2: BalanceMonitorService 코어 + 단위 테스트
- `BalanceMonitorService` (286 LOC): setInterval 폴링, AdapterPool + resolveRpcUrl 통합
- `checkAllWallets()`: better-sqlite3 직접 SQL로 ACTIVE 월렛 조회, 어댑터별 getBalance 호출
- 체인별 임계값 매핑: `getThreshold(chain)` -- solana -> lowBalanceThresholdSol, ethereum -> lowBalanceThresholdEth
- `shouldNotify()`: 24시간 쿨다운 + wasLow 플래그로 중복 방지 (BMON-03)
- `markRecovered()`: 잔액 회복 감지, wasLow=false 설정 -> 재하락 시 새 알림 (BMON-04)
- `notifyLowBalance()`: fire-and-forget 패턴 (`void this.notificationService?.notify(...)`)
- `updateConfig()`: 런타임 설정 변경, checkIntervalSec 변경 시 타이머 재시작
- `getStatus()`: 모니터링/디버깅용 상태 반환
- 15개 단위 테스트 전체 통과 (BMON-01~04, 임계값 이상, disabled, stop, error isolation, updateConfig, getStatus, DEFAULT_BALANCE_MONITOR_CONFIG)
- **Commit:** 62d1537

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm --filter @waiaas/core build` | PASS |
| `pnpm --filter @waiaas/daemon build` | PASS |
| `vitest run balance-monitor-service.test.ts` | 15/15 PASS |
| `grep LOW_BALANCE notification.ts` | 1 occurrence |
| `grep LOW_BALANCE en.ts` | 1 occurrence |
| `grep LOW_BALANCE ko.ts` | 1 occurrence |

## Key Exports

```typescript
// packages/daemon/src/services/monitoring/balance-monitor-service.ts
export interface BalanceMonitorConfig {
  checkIntervalSec: number;       // default 300
  lowBalanceThresholdSol: number;  // default 0.01
  lowBalanceThresholdEth: number;  // default 0.005
  cooldownHours: number;           // default 24
  enabled: boolean;                // default true
}
export const DEFAULT_BALANCE_MONITOR_CONFIG: BalanceMonitorConfig;
export class BalanceMonitorService {
  constructor(opts: { sqlite, adapterPool, config, notificationService?, monitorConfig? });
  start(): void;
  stop(): void;
  checkAllWallets(): Promise<void>;
  updateConfig(config: Partial<BalanceMonitorConfig>): void;
  getStatus(): { enabled, config, trackedWallets };
}
```

## Self-Check: PASSED

- balance-monitor-service.ts: FOUND
- balance-monitor-service.test.ts: FOUND
- 142-01-SUMMARY.md: FOUND
- Commit 1bc0bc8: FOUND
- Commit 62d1537: FOUND
