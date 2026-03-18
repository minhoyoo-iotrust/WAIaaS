---
phase: 449-foundation-core-db-push-relay
plan: 03
subsystem: push-relay
tags: [push-relay, ntfy-removal, long-polling, api]
dependency-graph:
  requires: [449-01]
  provides: [sign-response-store, push-api, long-polling]
  affects: [daemon/signing-channel, wallet-sdk]
tech-stack:
  added: []
  patterns: [db-response-store, long-polling, direct-push]
key-files:
  created: []
  modified:
    - packages/push-relay/src/registry/device-registry.ts
    - packages/push-relay/src/relay/sign-response-routes.ts
    - packages/push-relay/src/server.ts
    - packages/push-relay/src/config.ts
    - packages/push-relay/src/bin.ts
    - packages/push-relay/src/registry/device-routes.ts
    - packages/push-relay/src/index.ts
    - packages/push-relay/src/providers/push-provider.ts
    - packages/push-relay/src/providers/pushwoosh-provider.ts
    - packages/push-relay/src/providers/fcm-provider.ts
    - packages/push-relay/src/transformer/payload-transformer.ts
  deleted:
    - packages/push-relay/src/subscriber/ntfy-subscriber.ts
    - packages/push-relay/src/subscriber/message-parser.ts
    - packages/push-relay/src/message-router.ts
    - packages/push-relay/src/__tests__/ntfy-subscriber.test.ts
    - packages/push-relay/src/__tests__/message-parser.test.ts
    - packages/push-relay/src/__tests__/message-router.test.ts
decisions:
  - Moved PushPayload type from message-parser to push-provider (canonical provider-level type)
  - POST /v1/push requires API key auth (daemon-only), POST /v1/sign-response is public (wallet apps call it)
  - Long-polling uses 1s poll interval with configurable timeout (1-120s, default 30s)
  - sign_responses cleanup runs every 60s via unref'd setInterval
metrics:
  duration: ~5min
  completed: 2026-03-18
---

# Phase 449 Plan 03: Push Relay ntfy Removal + Self-hosted Response Store

Remove ntfy SSE from Push Relay server and add direct HTTP APIs.

## One-liner

Push Relay ntfy-subscriber/message-parser/router fully removed; POST /v1/push + sign-response DB store + long-polling API added

## What was done

### Task 1: sign_responses DB + Routes Rewrite (TDD)
- Added sign_responses table to DeviceRegistry (save, get, delete, cleanup, count)
- Rewrote POST /v1/sign-response: stores response in DB instead of relaying to ntfy
- Added GET /v1/sign-response/:requestId: long-polling with configurable timeout
- Added POST /v1/push: direct push notification via IPushProvider with subscription token lookup
- 31 tests pass (device-registry + sign-response-routes)
- Commit: `8815ccb1`

### Task 2: ntfy Code Removal + Server/Config/Bin Updates
- Deleted ntfy-subscriber.ts, message-parser.ts, message-router.ts (and their tests)
- Removed ntfy_server, sign_topic_prefix, notify_topic_prefix, wallet_names from config
- Removed NtfySubscriber from ServerOpts, bin.ts, device-routes
- Removed subscriber.addTopics/removeTopics from device registration flow
- Moved PushPayload type to push-provider.ts (was in deleted message-parser.ts)
- Added sign_responses cleanup interval (60s) in bin.ts
- Updated health endpoint: removed ntfy section, added sign_responses count
- Updated all test files (12 files, 94 tests pass)
- Commit: `ff16b1ff`

## Verification

- All 94 push-relay tests pass across 12 test files
- `grep -r "ntfy" packages/push-relay/src/ --include="*.ts" -l` returns no matches
- sign_responses table created and functional
- POST /v1/push, POST /v1/sign-response, GET /v1/sign-response/:requestId all working

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] PushPayload type relocation**
- **Found during:** Task 2
- **Issue:** PushPayload was defined in message-parser.ts which was deleted; multiple files depended on it
- **Fix:** Moved PushPayload interface to push-provider.ts and updated all imports
- **Files modified:** push-provider.ts, pushwoosh-provider.ts, fcm-provider.ts, payload-transformer.ts, 4 test files
- **Commit:** ff16b1ff
