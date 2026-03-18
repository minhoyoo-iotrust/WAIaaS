---
phase: 449-foundation-core-db-push-relay
plan: 01
subsystem: core
tags: [push-relay, ntfy-removal, type-system]
dependency-graph:
  requires: []
  provides: [PushRelayResponseChannelSchema, sdk_push-approval-method]
  affects: [daemon/sign-request-builder, daemon/schema-ddl, admin/wallets]
tech-stack:
  added: []
  patterns: [push_relay-response-channel]
key-files:
  created: []
  modified:
    - packages/core/src/schemas/signing-protocol.ts
    - packages/core/src/schemas/wallet-preset.ts
    - packages/core/src/__tests__/signing-protocol.test.ts
    - packages/core/src/index.ts
    - packages/daemon/src/services/signing-sdk/sign-request-builder.ts
    - packages/daemon/src/infrastructure/database/schema-ddl.ts
    - packages/daemon/src/__tests__/sign-request-builder.test.ts
decisions:
  - PushRelayResponseChannelSchema uses z.string() (not .url()) for pushRelayUrl to allow empty string when not configured
  - requestTopic simplified to walletName identifier (no longer ntfy topic)
metrics:
  duration: ~5min
  completed: 2026-03-18
---

# Phase 449 Plan 01: Core Type Changes Summary

Replace ntfy with push_relay in core schemas, wallet presets, and sign-request-builder.

## One-liner

ResponseChannelSchema type:'push_relay' + APPROVAL_METHODS sdk_push replacing all ntfy types

## What was done

### Task 1: Core Schemas (TDD)
- Replaced `NtfyResponseChannelSchema` with `PushRelayResponseChannelSchema` (type: 'push_relay', pushRelayUrl, requestId)
- Changed `APPROVAL_METHODS`: 'sdk_ntfy' -> 'sdk_push'
- Removed `ntfy` optional field from `WalletLinkConfigSchema`
- Updated `BUILTIN_PRESETS.dcent.approvalMethod` to 'sdk_push'
- Updated all core exports
- Commit: `b396882e`

### Task 2: sign-request-builder + schema-ddl
- Replaced ntfy channel construction with push_relay (URL from wallet_apps DB)
- Removed ntfy settings lookups (response_topic_prefix, request_topic_prefix, ntfy_server)
- Simplified requestTopic to walletName
- Updated schema-ddl CHECK constraint: sdk_ntfy -> sdk_push
- Commit: `cfdf198a`

## Verification

- 48 core signing-protocol tests pass
- 13 sign-request-builder tests pass
- `grep -r "sdk_ntfy" packages/core/src/` returns no matches (except negative assertion test)
- `grep -r "type: 'ntfy'" packages/core/src/schemas/` returns no matches

## Deviations from Plan

None -- plan executed exactly as written.
