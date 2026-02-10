---
phase: 60-notification-system
plan: 01
subsystem: notifications
tags: [telegram, discord, ntfy, i18n, fetch, notification-channels]

# Dependency graph
requires:
  - phase: 48-core-infra
    provides: INotificationChannel interface, NotificationPayload type
provides:
  - 21 NotificationEventType SSoT enum values (16 original + 5 new)
  - en/ko message templates for all 21 event types
  - TelegramChannel (MarkdownV2 via Bot API)
  - DiscordChannel (Embed via Webhook)
  - NtfyChannel (plain text via ntfy.sh)
  - getNotificationMessage() template interpolation helper
affects: [60-02-notification-service, 61-ts-sdk, 62-python-sdk]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Channel adapter pattern: INotificationChannel.initialize() + send()"
    - "Native fetch for all HTTP calls (no external Bot frameworks)"
    - "i18n notification templates with {variable} placeholder interpolation"

key-files:
  created:
    - packages/daemon/src/notifications/channels/telegram.ts
    - packages/daemon/src/notifications/channels/discord.ts
    - packages/daemon/src/notifications/channels/ntfy.ts
    - packages/daemon/src/notifications/templates/message-templates.ts
    - packages/daemon/src/__tests__/notification-channels.test.ts
  modified:
    - packages/core/src/enums/notification.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/core/src/__tests__/enums.test.ts

key-decisions:
  - "Discord mock uses Response(null, {status:200}) instead of 204 — Node.js Response constructor rejects 204 with body"
  - "Notification templates use {variable} string placeholders (not JS template literals) for cross-language i18n safety"

patterns-established:
  - "Channel adapter: implements INotificationChannel, validates config in initialize(), formats per channel spec in send()"
  - "Severity color mapping: red=critical, orange=failure, green=success, blue=informational"
  - "ntfy priority mapping: 5=urgent (kill switch), 4=high (failures), 3=default (approvals), 2=low (info)"

# Metrics
duration: 5min
completed: 2026-02-11
---

# Phase 60 Plan 01: Notification Channels Summary

**3 notification channel adapters (Telegram/Discord/ntfy) with 21 event type enums, en/ko message templates, and 39 passing tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-11T00:34:03Z
- **Completed:** 2026-02-11T00:39:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Expanded NotificationEventType from 16 to 21 values with 5 new types (TX_APPROVAL_REQUIRED, TX_APPROVAL_EXPIRED, AUTO_STOP_TRIGGERED, SESSION_CREATED, DAILY_SUMMARY)
- Created en/ko message templates for all 21 event types with variable interpolation
- Implemented TelegramChannel (MarkdownV2 + special char escaping), DiscordChannel (Embed + severity color mapping), NtfyChannel (plain text + priority/tags)
- All channels use native fetch only (zero external HTTP dependencies)
- 39 passing tests covering enum validation, template interpolation, and all 3 channel adapters

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand NotificationEventType to 21 + en/ko message templates** - `4948ed7` (feat)
2. **Task 2: Implement 3 channel adapters + tests** - `b2312c6` (feat)

## Files Created/Modified
- `packages/core/src/enums/notification.ts` - 21 NotificationEventType SSoT enum values
- `packages/core/src/i18n/en.ts` - Messages interface + 21 English notification templates
- `packages/core/src/i18n/ko.ts` - 21 Korean notification templates
- `packages/daemon/src/notifications/templates/message-templates.ts` - getNotificationMessage() with variable interpolation
- `packages/daemon/src/notifications/channels/telegram.ts` - TelegramChannel with MarkdownV2 formatting
- `packages/daemon/src/notifications/channels/discord.ts` - DiscordChannel with Embed + severity colors
- `packages/daemon/src/notifications/channels/ntfy.ts` - NtfyChannel with priority/tags mapping
- `packages/daemon/src/__tests__/notification-channels.test.ts` - 39 tests for all channels + templates + enums
- `packages/core/src/__tests__/enums.test.ts` - Updated enum count test (16 -> 21)

## Decisions Made
- Discord mock uses `new Response(null, { status: 200 })` instead of 204 because Node.js `Response` constructor rejects null-body status codes (204) when a body string is passed
- Notification templates use `{variable}` string placeholders (not JS template literals) for safe cross-language i18n

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing enum count test from 16 to 21**
- **Found during:** Task 2 (verification step)
- **Issue:** Existing enums.test.ts expected 16 NotificationEventTypes, now 21
- **Fix:** Changed `toHaveLength(16)` to `toHaveLength(21)`
- **Files modified:** `packages/core/src/__tests__/enums.test.ts`
- **Verification:** All 65 core tests pass
- **Committed in:** `b2312c6` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary test update for correctness. No scope creep.

## Issues Encountered
- Node.js `Response` constructor throws on `new Response('', { status: 204 })` — Discord webhook returns 204, but test mocks needed status 200 instead. No impact on production code.

## User Setup Required
None - no external service configuration required. Channel credentials are configured at runtime via config.toml.

## Next Phase Readiness
- Channel adapters ready for NotificationService orchestrator (plan 60-02)
- getNotificationMessage() ready for use in NotificationService.emit()
- All 3 channels implement INotificationChannel interface
- No blockers for next plan

## Self-Check: PASSED

---
*Phase: 60-notification-system*
*Completed: 2026-02-11*
