---
phase: 450-daemon
plan: 02
subsystem: notifications, config
tags: [push-relay, ntfy-removal, config-cleanup]
dependency-graph:
  requires: [450-01]
  provides: [clean-daemon-no-ntfy]
  affects: [admin-ui, wallet-sdk]
tech-stack:
  added: []
  patterns: [push-relay-notification]
key-files:
  created: []
  modified:
    - packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts
    - packages/daemon/src/notifications/index.ts
    - packages/daemon/src/infrastructure/config/loader.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/src/infrastructure/settings/hot-reload.ts
    - packages/daemon/src/constants.ts
    - packages/daemon/src/__tests__/wallet-notification-channel.test.ts
    - packages/daemon/src/__tests__/notification-channels.test.ts
  deleted:
    - packages/daemon/src/notifications/channels/ntfy.ts
decisions:
  - WalletNotificationChannel skips apps without push_relay_url (no fallback topic)
  - preferred_channel default changed from 'ntfy' to 'push_relay'
  - NtfyChannel completely removed (no deprecation period needed for server-side component)
metrics:
  duration: ~5min
  completed: 2026-03-18
---

# Phase 450 Plan 02: Notification Push Relay + NtfyChannel Removal Summary

Replace WalletNotificationChannel ntfy publishing with Push Relay HTTP POST, delete NtfyChannel, and clean all ntfy config/settings.

## One-liner

WalletNotificationChannel uses Push Relay POST; NtfyChannel deleted; ntfy config/settings/hot-reload entries removed

## What was done

### Task 1: WalletNotificationChannel Push Relay rewrite
- Replaced ntfy topic publishing with Push Relay POST /v1/push
- Changed resolveAlertApps() to query push_relay_url instead of notify_topic
- Apps without push_relay_url are skipped (no fallback topic construction)
- Removed getNtfyServer() and DEFAULT_NTFY_SERVER constant
- JSON body: { subscriptionToken, category: 'notification', payload: NotificationMessage }
- X-Api-Key header from signing_sdk.push_relay_api_key
- 21 wallet-notification-channel tests pass
- Commit: `34bef0dc`

### Task 2: NtfyChannel deletion + config cleanup
- Deleted notifications/channels/ntfy.ts entirely
- Removed NtfyChannel export from notifications/index.ts
- Removed ntfy_server and ntfy_topic from DaemonConfigSchema
- Removed 3 ntfy setting keys: ntfy_server, ntfy_request_topic_prefix, ntfy_response_topic_prefix
- Changed preferred_channel default from 'ntfy' to 'push_relay'
- Removed ntfy_server from hot-reload NOTIFICATION_KEYS
- Updated constants.ts comment
- Removed NtfyChannel test section from notification-channels.test.ts
- 78 tests pass (notification-channels + hot-reload)
- Commit: `c30b1410`

## Verification

- 21 wallet-notification-channel tests pass
- 57 notification-channels tests pass (NtfyChannel tests removed)
- 21 settings-hot-reload tests pass
- `ls packages/daemon/src/notifications/channels/ntfy.ts` returns NOT FOUND
- `grep -n "ntfy_server|ntfy_topic" packages/daemon/src/infrastructure/config/loader.ts` returns ZERO matches
- `grep -n "ntfy_server|ntfy_request_topic|ntfy_response_topic" packages/daemon/src/infrastructure/settings/setting-keys.ts` returns ZERO matches

## Deviations from Plan

None -- plan executed exactly as written.
