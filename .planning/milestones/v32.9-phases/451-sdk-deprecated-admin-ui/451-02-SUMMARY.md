---
phase: 451-sdk-deprecated-admin-ui
plan: 02
subsystem: admin-ui
tags: [push-relay, ntfy-removal, admin-ui]
dependency-graph:
  requires: [451-01]
  provides: [admin-push-relay-ui]
  affects: [admin/wallets, admin/human-wallet-apps]
tech-stack:
  added: []
  patterns: [preset-auto-fill, conditional-disabled-radios]
key-files:
  created: []
  modified:
    - packages/admin/src/pages/wallets.tsx
    - packages/admin/src/pages/human-wallet-apps.tsx
    - packages/admin/src/__tests__/wallets-preset-dropdown.test.tsx
    - packages/admin/src/__tests__/human-wallet-apps.test.tsx
decisions:
  - Preset wallet types (dcent) get disabled approval method radios with guidance note
  - Push Relay URL auto-filled from PRESET_PUSH_RELAY_URLS when wallet type matches preset
  - ntfy Topics section completely removed from app cards (replaced with Push Relay URL display)
  - Topic editing functions removed (startTopicEdit, cancelTopicEdit, handleTopicSave)
metrics:
  duration: ~5min
  completed: 2026-03-18
---

# Phase 451 Plan 02: Admin UI Push Relay Transition Summary

Update Admin UI approval method labels, register dialog, and app card display from ntfy to Push Relay.

## One-liner

Admin UI approval methods use sdk_push + "Wallet App (Push)" labels, register dialog has Push Relay URL field with preset auto-fill, app cards show Push Relay URL

## What was done

### Task 1: wallets.tsx Approval Method labels + preset logic
- Changed PRESET_APPROVAL_PREVIEW dcent from 'Wallet App (ntfy)' to 'Wallet App (Push)'
- Changed PRESET_APPROVAL_DEFAULTS dcent from 'sdk_ntfy' to 'sdk_push'
- Updated APPROVAL_OPTIONS: sdk_ntfy -> sdk_push, labels ntfy -> Push
- Updated Auto description: "Wallet App (Push) > Wallet App (Telegram) > ..."
- Updated type cast in handleApprovalMethodChange to sdk_push
- Added preset-aware disabled logic for approval method radios (ADMIN-04)
- Added guidance note: "This wallet uses a preset type. The approval method is automatically managed by the preset."
- Updated 12 test assertions from sdk_ntfy/ntfy to sdk_push/Push
- All 12 wallets-preset-dropdown tests pass
- Commit: `77e9f0b9`

### Task 2: human-wallet-apps.tsx Register dialog + card display
- Added Push Relay URL field to Register Wallet App dialog
- Auto-fill Push Relay URL for known presets (dcent -> https://waiaas-push.dcentwallet.com)
- Replaced ntfy Topics section with Push Relay URL display in app cards
- Removed topic editing state/functions (startTopicEdit, cancelTopicEdit, handleTopicSave, topicEditing, topicSaving)
- Updated page header description from "via ntfy" to "via Push Relay" (ADMIN-06)
- Updated test notification success toast to generic message
- Updated handleRegister to include push_relay_url in API body
- Added push_relay_url to mock test data
- Updated T-HWUI-10 and T-HWUI-11 tests for Push Relay
- All 16 human-wallet-apps tests pass
- Commit: `03e1fec0`

## Verification

- `grep "sdk_push" wallets.tsx` shows 3 occurrences (updated values)
- `grep "sdk_ntfy" wallets.tsx` returns no matches
- `grep "push_relay_url" human-wallet-apps.tsx` shows 4 occurrences
- `grep "ntfy Topics" human-wallet-apps.tsx` returns no matches
- `grep "Wallet App (Push)" wallets.tsx` shows 3 occurrences
- All 12 wallets-preset-dropdown tests pass
- All 16 human-wallet-apps tests pass

## Deviations from Plan

None -- plan executed exactly as written.
