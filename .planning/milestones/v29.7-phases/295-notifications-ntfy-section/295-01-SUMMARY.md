---
phase: 295-notifications-ntfy-section
plan: 01
status: complete
started: 2026-03-01
completed: 2026-03-01
---

# Plan 295-01 Summary

## What Was Built

Separated ntfy settings from the "Other Channels" FieldGroup in the Notifications Settings tab into a dedicated "ntfy" FieldGroup section. Added a Human Wallet Apps link (#/wallet-apps) in the ntfy section for per-app notification configuration. Cleaned "Other Channels" to show only Discord, Slack, and rate limiting.

## Key Changes

1. **ntfy independent FieldGroup** -- New `<FieldGroup legend="ntfy">` section between Telegram and Other Channels, containing ntfy_server and ntfy_topic fields with info box explaining ntfy's role as push notification infrastructure for Human Wallet Apps
2. **Human Wallet Apps link** -- Added `<a href="#/wallet-apps">Human Wallet Apps</a>` link in the ntfy info box for navigating to per-app Signing/Alerts toggles
3. **Other Channels cleanup** -- Removed ntfy_server and ntfy_topic from Other Channels, updated description from "Discord, ntfy, Slack, and rate limiting" to "Discord, Slack, and rate limiting", removed ntfy mention from info box
4. **3 new tests** -- Verify ntfy FieldGroup existence, Other Channels cleanup, and Human Wallet Apps link presence and href

## Commits

1. `feat(295-01): separate ntfy into independent FieldGroup in Notifications Settings`
2. `test(295-01): add tests for ntfy FieldGroup separation and Human Wallet Apps link`

## Key Files

### Created
- `.planning/phases/295-notifications-ntfy-section/295-01-SUMMARY.md`

### Modified
- `packages/admin/src/pages/notifications.tsx` -- ntfy FieldGroup + Other Channels cleanup
- `packages/admin/src/__tests__/notifications-coverage.test.tsx` -- 3 new tests

## Test Results

- `notifications-coverage.test.tsx`: 30 tests passed (27 existing + 3 new)
- `notifications.test.tsx`: 13 tests passed (no regressions)

## Self-Check: PASSED

- [x] DOC-01: ntfy displayed as independent FieldGroup (legend="ntfy")
- [x] DOC-02: Other Channels shows only Discord + Slack + rate limit
- [x] DOC-03: ntfy FieldGroup contains clickable link to #/wallet-apps
- [x] All existing notification tests pass
- [x] 3 new tests verify separation, cleanup, and link
