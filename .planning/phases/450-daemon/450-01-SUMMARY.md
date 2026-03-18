---
phase: 450-daemon
plan: 01
subsystem: signing-sdk
tags: [push-relay, ntfy-removal, signing-channel]
dependency-graph:
  requires: [449-01, 449-03]
  provides: [PushRelaySigningChannel, sdk_push-routing]
  affects: [daemon/startup, daemon/approval-workflow]
tech-stack:
  added: []
  patterns: [http-long-polling, exponential-backoff]
key-files:
  created:
    - packages/daemon/src/services/signing-sdk/channels/push-relay-signing-channel.ts
    - packages/daemon/src/__tests__/push-relay-signing-channel.test.ts
  modified:
    - packages/daemon/src/services/signing-sdk/channels/index.ts
    - packages/daemon/src/services/signing-sdk/index.ts
    - packages/daemon/src/services/signing-sdk/approval-channel-router.ts
    - packages/daemon/src/lifecycle/daemon-startup.ts
    - packages/daemon/src/services/signing-sdk/preset-auto-setup.ts
    - packages/daemon/src/services/signing-sdk/channels/telegram-signing-channel.ts
    - packages/daemon/src/__tests__/approval-channel-router.test.ts
    - packages/daemon/src/__tests__/signing-sdk-lifecycle.test.ts
    - packages/daemon/src/__tests__/signing-sdk-e2e.test.ts
  deleted:
    - packages/daemon/src/services/signing-sdk/channels/ntfy-signing-channel.ts
    - packages/daemon/src/__tests__/ntfy-signing-channel.test.ts
decisions:
  - PushRelaySigningChannel POST failure logs error without throwing (ERR-01 PENDING_APPROVAL preserved)
  - Long-polling 204 responses continue polling without counting as error retry
  - MAX_ERROR_RETRIES=3 with exponential backoff (1s, 2s, 4s) for error responses only
metrics:
  duration: ~10min
  completed: 2026-03-18
---

# Phase 450 Plan 01: PushRelaySigningChannel + ApprovalChannelRouter sdk_push Summary

Replace NtfySigningChannel with PushRelaySigningChannel and update approval routing from sdk_ntfy to sdk_push.

## One-liner

PushRelaySigningChannel HTTP POST + long-polling replaces NtfySigningChannel SSE; ApprovalChannelRouter routes sdk_push

## What was done

### Task 1: PushRelaySigningChannel (TDD)
- Created PushRelaySigningChannel class with HTTP POST to /v1/push and long-polling GET /v1/sign-response/:requestId
- POST sends base64url-encoded SignRequest with X-Api-Key header
- Long-polling handles 200 (response found), 204 (continue polling), errors (backoff retry)
- POST failure logs error without throwing (ERR-01)
- Error retries with exponential backoff: 1s, 2s, 4s (ERR-02)
- cancelSubscription() and shutdown() abort active polling via AbortController
- Deleted ntfy-signing-channel.ts and its test file
- Updated channel/index.ts and signing-sdk/index.ts exports
- 11 PushRelaySigningChannel tests pass
- Commit: `47a35adb`

### Task 2: ApprovalChannelRouter + daemon startup wiring
- Replaced all NtfySigningChannel references with PushRelaySigningChannel
- Changed sdk_ntfy routing to sdk_push in router and global fallback
- Updated daemon-startup.ts: ntfyChannel -> pushRelayChannel
- 29 approval-channel-router tests pass
- Commit: `8ddebcc5`

### Deviation: Remaining ntfy references (Rule 3 - Blocking)
- Fixed preset-auto-setup.ts: sdk_ntfy -> sdk_push, ntfy -> push_relay
- Rewrote signing-sdk-e2e.test.ts for Push Relay flow (was ntfy SSE)
- Updated signing-sdk-lifecycle.test.ts: NtfySigningChannel -> PushRelaySigningChannel
- Fixed telegram-signing-channel.ts JSDoc comment
- Commit: `efae3ff1`

## Verification

- 11 push-relay-signing-channel tests pass
- 29 approval-channel-router tests pass
- 11 signing-sdk-lifecycle tests pass
- 6 signing-sdk-e2e tests pass
- `grep -r "NtfySigningChannel" packages/daemon/src/ --include="*.ts"` returns zero matches in non-test/non-comment code
- `grep -r "sdk_ntfy" packages/daemon/src/ --include="*.ts"` returns only migration files and historical test fixtures

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Remaining ntfy references in production and test files**
- **Found during:** Task 2
- **Issue:** preset-auto-setup.ts, signing-sdk-lifecycle.test.ts, signing-sdk-e2e.test.ts still referenced NtfySigningChannel/sdk_ntfy
- **Fix:** Updated all references to PushRelaySigningChannel/sdk_push
- **Files modified:** preset-auto-setup.ts, signing-sdk-lifecycle.test.ts, signing-sdk-e2e.test.ts, telegram-signing-channel.ts
- **Commit:** efae3ff1
