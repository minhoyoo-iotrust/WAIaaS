---
phase: 445
plan: 01
subsystem: daemon-testing
tags: [test-coverage, incoming-tx, notification, rpc-proxy]
dependency_graph:
  requires: []
  provides: [incoming-tx-monitor-tests, notification-service-tests, rpc-proxy-route-tests]
  affects: [daemon-coverage]
tech_stack:
  added: []
  patterns: [mock-sqlite, vitest-mock-factory, hono-app-request]
key_files:
  created:
    - packages/daemon/src/__tests__/incoming-tx-monitor-coverage.test.ts
    - packages/daemon/src/__tests__/incoming-tx-workers-coverage.test.ts
    - packages/daemon/src/__tests__/notification-service-coverage.test.ts
    - packages/daemon/src/__tests__/notification-templates-coverage.test.ts
    - packages/daemon/src/__tests__/rpc-proxy-route-coverage.test.ts
  modified: []
decisions: []
metrics:
  duration: ~5min
  completed: 2026-03-17
---

# Phase 445 Plan 01: IncomingTx Monitor/Workers + Notification + RPC Proxy Route Tests Summary

IncomingTx 모니터/워커, NotificationService, 알림 템플릿/포맷, RPC Proxy 라우트 미커버 경로를 101개 테스트로 커버

## What Was Done

### Task 1: IncomingTx + Notification Tests (81 tests)

**incoming-tx-monitor-coverage.test.ts** (12 tests):
- syncSubscriptions(): 신규 지갑 추가, 알 수 없는 chain:environment 건너뜀, 실패 격리
- start() 엣지 케이스: 알 수 없는 chain 경고 및 건너뜀
- flush handler: token symbol lookup (등록된 토큰/미등록 토큰/0 금액)
- polling workers: Solana pollAll 호출, EVM 빈 구독 처리
- optional deps 없는 동작: killSwitchService null, notificationService null
- stop() 엣지 케이스: start() 전 stop()

**incoming-tx-workers-coverage.test.ts** (21 tests):
- Confirmation worker: Solana finalized true/false/없음, EVM 임계값 초과/미달/기본값/null block, 캐싱, 에러 격리
- Retention worker: 삭제 성공 로깅, 삭제 없음 무로깅
- Gap recovery: subscriber 있음/없음/pollAll 에러/pollAll 메서드 없음
- Cursor: Solana signature/EVM block number 저장/로드, null 반환

**notification-service-coverage.test.ts** (24 tests):
- Broadcast: KILL_SWITCH_ACTIVATED/RECOVERED/TX_INCOMING_SUSPICIOUS 전채널 전송, 전채널 실패 시 CRITICAL 로깅
- Rate limiting: rateLimitRpm 초과 시 fallback 채널
- Event filter: notify_events 허용/차단, broadcast 바이패스, notify_categories 폴백, 빈 필터
- Side channel: walletNotificationChannel 성공/null/에러 격리
- replaceChannels, updateConfig, getChannels, lookupWallet 엣지 케이스

**notification-templates-coverage.test.ts** (24 tests):
- 8개 이벤트 타입 메시지 생성 (en/ko)
- TX_TYPE_LABELS 변환 (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/unknown)
- 변수 인터폴레이션, 미치환 플레이스홀더 제거, vars 없는 호출
- abbreviateId: UUID 축약/짧은 ID/경계값
- abbreviateAddress: ETH/SOL 주소 축약/짧은 주소/경계값

### Task 2: RPC Proxy Route Tests (20 tests)

**rpc-proxy-route-coverage.test.ts**:
- validateAndFillFrom 확장: 빈 params, undefined, case-insensitive
- Hono app.request() 기반 라우트 테스트: Content-Type 415, proxy disabled 503, JSON parse error, NaN chainId, missing infrastructure 503
- jsonRpcError 빌더: data 유무, string/null id
- parseJsonRpcBody: single/batch/notification, 유효하지 않은 입력 6가지

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 72471de0 | IncomingTx, Notification, template coverage tests |
| 2 | 0d78a917 | RPC proxy route handler coverage tests |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

```
Test Files  5 passed (5)
Tests       101 passed (101)
```
