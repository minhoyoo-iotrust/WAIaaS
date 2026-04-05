---
phase: 139-display-currency-integration
plan: "01"
subsystem: admin-ui, notifications, pipeline
tags: [display-currency, forex, admin-dashboard, notifications, i18n]
dependency-graph:
  requires: ["138-01", "138-02"]
  provides: ["Admin display currency utils", "Notification display_amount", "Pipeline forexRateService integration"]
  affects: ["admin-dashboard", "notification-templates", "pipeline-stages", "sign-only", "x402"]
tech-stack:
  added: []
  patterns: ["resolveDisplayAmount helper", "CSP-safe inline formatting", "optional display_amount graceful fallback"]
key-files:
  created:
    - packages/admin/src/utils/display-currency.ts
  modified:
    - packages/admin/src/pages/dashboard.tsx
    - packages/daemon/src/api/routes/admin.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/daemon/src/notifications/templates/message-templates.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/pipeline/sign-only.ts
    - packages/daemon/src/api/routes/x402.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/__tests__/pipeline-notification.test.ts
decisions:
  - "Admin display-currency.ts에 core formatDisplayCurrency 로직 인라인 (CSP 제약으로 daemon import 불가)"
  - "display_amount는 optional variable -- 미치환 시 message-templates에서 자동 제거 + trim"
  - "Stage 1 TX_REQUESTED는 display_amount='' (amountUsd 미산출 시점)"
  - "sign-only/x402는 display_amount='' (USD 환산 미지원 경로)"
  - "PipelineContext.amountUsd에 Stage 3 결과 캐시 (Stage 5/6 DB 재조회 방지)"
metrics:
  duration: "16m"
  completed: "2026-02-16"
  tasks: 2
  files: 12
---

# Phase 139 Plan 01: Admin UI 환산 표시 + 알림 메시지 display_amount Summary

Admin 대시보드 Recent Activity에서 amountUsd 환산 금액을 표시하고, 파이프라인 알림 메시지에 ForexRateService 기반 display_amount를 포함하여 사용자 선호 통화로 금액을 확인할 수 있게 함.

## What Changed

### Task 1: Admin UI 환산 표시 (fd6433c)

**Admin 환산 유틸리티 생성** (`packages/admin/src/utils/display-currency.ts`)
- `fetchDisplayCurrency()`: GET /admin/settings에서 display.currency 읽기 + GET /admin/forex/rates에서 환율 조회
- `formatWithDisplay()`: amountUsd + currency + rate -> 포맷된 문자열 (예: "\u2248\u20A9725,000")
- 5분 캐시로 API 호출 최소화
- CSP 제약으로 core `formatDisplayCurrency` 로직 인라인 (ZERO/THREE_DECIMAL 동일)

**GET /admin/status 응답에 amountUsd 추가** (`packages/daemon/src/api/routes/admin.ts`)
- recentTransactions select에 `transactions.amountUsd` 추가
- map에서 `amountUsd: tx.amountUsd ?? null` 포함

**GET /admin/wallets/:id/transactions 응답에 amountUsd 추가**
- items map에 `amountUsd: tx.amountUsd ?? null` 포함

**대시보드 환산 표시** (`packages/admin/src/pages/dashboard.tsx`)
- RecentTransaction 인터페이스에 `amountUsd: number | null` 추가
- 컴포넌트 마운트 시 fetchDisplayCurrency() 로드
- Amount 컬럼: `"1000000000 (\u2248\u20A9725,000)"` 형식 (amountUsd 있을 때)
- Graceful fallback: amountUsd null이면 기존 amount만 표시

### Task 2: 알림 메시지 display_amount 통합 (358f8f6)

**알림 템플릿 변경** (`packages/core/src/i18n/en.ts`, `ko.ts`)
- TX_REQUESTED, TX_SUBMITTED, TX_CONFIRMED, TX_FAILED, TX_APPROVAL_REQUIRED, CUMULATIVE_LIMIT_WARNING body에 `{display_amount}` 추가

**message-templates.ts 업데이트**
- 미치환 `{display_amount}` 자동 제거 (빈 문자열 치환)
- body/title `.trim()` 처리 (후행 공백 제거)

**파이프라인 stages.ts 변경**
- `resolveDisplayAmount()` 헬퍼: SettingsService.get('display.currency') + ForexRateService.getRate() -> `"(\u2248\u20A9725,000)"` or `"($500.00)"`
- PipelineContext에 `forexRateService?: IForexRateService`, `amountUsd?: number` 추가
- Stage 1: `display_amount: ''` (amountUsd 미산출 시점)
- Stage 3: amountUsd 캐시 + displayAmount 산출 -> CUMULATIVE_LIMIT_WARNING, TX_APPROVAL_REQUIRED에 전달
- Stage 5: 모든 TX_SUBMITTED, TX_FAILED에 displayAmount 전달
- Stage 6: TX_CONFIRMED, TX_FAILED에 displayAmount 전달

**sign-only.ts**: TX_REQUESTED, TX_SUBMITTED에 `display_amount: ''`
**x402.ts**: 모든 notify에 `display_amount: ''` (USD 기반 결제)
**transactions.ts + server.ts**: forexRateService deps 경로 추가

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PriceResult.effectiveAmountUsd -> PriceResult.usdAmount**
- **Found during:** Task 2, Stage 3 amountUsd 캐시
- **Issue:** 플랜에서 `priceResult?.effectiveAmountUsd` 참조했으나, 실제 PriceResult 타입은 `usdAmount` 프로퍼티 사용
- **Fix:** `priceResult?.type === 'success' ? priceResult.usdAmount : undefined`로 수정
- **Files modified:** stages.ts

**2. [Rule 1 - Bug] message-templates.ts 미치환 {display_amount} 잔여**
- **Found during:** Task 2 verification (notification-channels.test.ts 실패)
- **Issue:** display_amount를 vars에 전달하지 않는 기존 코드가 `{display_amount}` 리터럴을 body에 남김
- **Fix:** getNotificationMessage에서 vars 치환 후 `{display_amount}` 잔여 placeholder 제거 + trim
- **Files modified:** message-templates.ts

**3. [Rule 1 - Bug] pipeline-notification.test.ts display_amount 누락**
- **Found during:** Task 2 verification (test assertion 실패)
- **Issue:** Stage 1 notify에 display_amount 추가했으나 테스트가 기존 vars만 검증
- **Fix:** 테스트 expected vars에 `display_amount: ''` 추가
- **Files modified:** pipeline-notification.test.ts

## Verification

- Full monorepo build: PASSED (8/8 tasks)
- Admin build: PASSED (Vite 109KB bundle)
- Daemon tests: 1280/1285 passed (5 pre-existing failures)
- Core tests: 223/224 passed (1 pre-existing failure)
- display_amount in stages.ts: 14 occurrences
- display_amount in en.ts/ko.ts: 6 events each

## Self-Check: PASSED

- display-currency.ts: FOUND
- dashboard.tsx: FOUND
- 139-01-SUMMARY.md: FOUND
- Commit fd6433c: FOUND
- Commit 358f8f6: FOUND
