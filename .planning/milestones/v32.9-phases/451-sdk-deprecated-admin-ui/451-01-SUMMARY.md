---
phase: 451-sdk-deprecated-admin-ui
plan: 01
subsystem: wallet-sdk, daemon-api
tags: [push-relay, ntfy-deprecation, api-extension]
dependency-graph:
  requires: [450-01, 450-02]
  provides: [deprecated-ntfy-sdk, push_relay_url-api]
  affects: [admin-ui, wallet-apps]
tech-stack:
  added: []
  patterns: [jsdoc-deprecation, openapi-schema-extension]
key-files:
  created: []
  modified:
    - packages/wallet-sdk/src/channels/ntfy.ts
    - packages/wallet-sdk/src/index.ts
    - packages/daemon/src/services/signing-sdk/wallet-app-service.ts
    - packages/daemon/src/api/routes/wallet-apps.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/admin/src/api/types.generated.ts
    - packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts
decisions:
  - WalletApp API returns push_relay_url as nullable string field
  - Test notification handler uses Push Relay POST instead of ntfy topic publish
  - sign_topic and notify_topic descriptions changed to "(legacy, unused)"
metrics:
  duration: ~5min
  completed: 2026-03-18
---

# Phase 451 Plan 01: SDK ntfy Deprecated + WalletApp API push_relay_url Summary

Deprecate SDK ntfy functions and add push_relay_url to WalletApp API for Admin UI consumption.

## One-liner

SDK ntfy functions @deprecated + WalletApp API extended with push_relay_url field and Push Relay test notification

## What was done

### Task 1: SDK ntfy functions deprecated
- Added @deprecated JSDoc to sendViaNtfy, subscribeToRequests, subscribeToNotifications, parseNotification
- Updated module-level comment to note deprecation in favor of Push Relay
- Marked deprecated functions in index.ts Public API comment
- Push Relay functions (sendViaRelay, registerDevice, etc.) remain unchanged
- Commit: `2af5fb4c`

### Task 2: WalletApp API push_relay_url field + type regeneration
- Added pushRelayUrl field to WalletApp interface, mapRow, register, update methods
- Added push_relay_url to all SQL SELECT queries (getByName, getById, list, getAlertEnabledApps)
- Added push_relay_url to WalletApp, Create, Update OpenAPI schemas
- Updated test-notification handler to use Push Relay POST instead of ntfy
- Updated sign_topic/notify_topic descriptions to "(legacy, unused)"
- Updated subscription_token description to "Push Relay subscription token"
- Regenerated types.generated.ts with push_relay_url and sdk_push
- Commit: `095eec91`

## Verification

- 5 @deprecated tags in ntfy.ts (4 functions + 1 module-level)
- 0 @deprecated in relay.ts
- 3 push_relay_url occurrences in openapi-schemas.ts (schema, create, update)
- push_relay_url present in types.generated.ts
- sdk_push in approval_method enum in types.generated.ts
- TypeScript compilation passes for daemon and admin packages

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused priority field from notification payload**
- **Found during:** Task 2 (typecheck)
- **Issue:** wallet-notification-channel.ts included `priority` field in NotificationMessage object literal, but NotificationMessage schema does not have this field (was an ntfy-specific concept)
- **Fix:** Removed `priority` field and its computation from the notification payload
- **Files modified:** packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts
- **Commit:** `095eec91` (bundled with Task 2)
