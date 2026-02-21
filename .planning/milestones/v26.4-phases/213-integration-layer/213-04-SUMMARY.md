---
phase: 213-integration-layer
plan: 04
subsystem: docs, notification
tags: [skill-files, connect-info, walletId, notification, i18n, multi-wallet, session]

# Dependency graph
requires:
  - phase: 212-connect-info-endpoint
    provides: GET /v1/connect-info endpoint, agent-prompt endpoint
  - phase: 213-01
    provides: SDK createSession + getConnectInfo
  - phase: 213-02
    provides: MCP connect_info tool + walletId params
  - phase: 213-03
    provides: Admin UI multi-wallet form + CLI quickset single session
provides:
  - SESSION_WALLET_ADDED / SESSION_WALLET_REMOVED notification events (28 total)
  - Skill files with connect-info usage and walletId parameter documentation
  - Guide docs updated to session-token-only auth (master password removed from agent sections)
affects: [notification channels, wallet-sdk notification types, agent onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns: [fire-and-forget notification on session-wallet mutation]

key-files:
  created: []
  modified:
    - packages/core/src/enums/notification.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/core/src/schemas/signing-protocol.ts
    - packages/core/src/__tests__/enums.test.ts
    - packages/daemon/src/api/routes/sessions.ts
    - skills/quickstart.skill.md
    - skills/wallet.skill.md
    - skills/admin.skill.md
    - docs/guides/openclaw-integration.md
    - docs/guides/claude-code-integration.md
    - docs/guides/agent-skills-integration.md

key-decisions:
  - "summaryItems section does not exist in i18n -- skipped (only notifications record needed)"
  - "message-templates.ts unchanged as getNotificationMessage auto-resolves from i18n"

patterns-established:
  - "Notification dispatch on session-wallet mutation: void deps.notificationService?.notify() fire-and-forget"

requirements-completed: [INTG-08, INTG-09, INTG-10]

# Metrics
duration: 4min
completed: 2026-02-21
---

# Phase 213 Plan 04: Skill Files + Guide Docs + Session-Wallet Notification Events Summary

**Skill files updated with connect-info/walletId docs, guide docs migrated to session-token-only auth, and SESSION_WALLET_ADDED/REMOVED notification events added**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-20T17:49:18Z
- **Completed:** 2026-02-20T17:53:50Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Added SESSION_WALLET_ADDED and SESSION_WALLET_REMOVED notification events with en/ko i18n, category mapping, and daemon dispatch
- Updated 3 skill files (quickstart, wallet, admin) with connect-info usage and walletId parameter documentation
- Removed master password dependency from 3 guide docs (openclaw, claude-code, agent-skills), migrated to session-token-only auth

## Task Commits

Each task was committed atomically:

1. **Task 1: Notification events SESSION_WALLET_ADDED/SESSION_WALLET_REMOVED** - `b0f993c` (feat)
2. **Task 2: Skill files + guide docs update** - `2fe58ea` (docs)

## Files Created/Modified
- `packages/core/src/enums/notification.ts` - Added 2 new events (26 -> 28 total)
- `packages/core/src/i18n/en.ts` - English notification templates for wallet add/remove
- `packages/core/src/i18n/ko.ts` - Korean notification templates for wallet add/remove
- `packages/core/src/schemas/signing-protocol.ts` - EVENT_CATEGORY_MAP entries (session category)
- `packages/core/src/__tests__/enums.test.ts` - Updated count assertion to 28
- `packages/daemon/src/api/routes/sessions.ts` - Fire-and-forget notify on addWallet/removeWallet
- `skills/quickstart.skill.md` - Added self-discovery section with connect-info
- `skills/wallet.skill.md` - Added multi-wallet operations section, session creation multi-wallet params
- `skills/admin.skill.md` - Added session-wallet management, agent self-discovery, session creation docs
- `docs/guides/openclaw-integration.md` - Removed MASTER_PASSWORD, added connect-info discovery
- `docs/guides/claude-code-integration.md` - Added MCP connect_info tool guidance
- `docs/guides/agent-skills-integration.md` - Removed MASTER_PASSWORD, added auto-discovery section

## Decisions Made
- summaryItems section referenced in plan does not exist in i18n files -- skipped (only notifications record needed for type safety)
- message-templates.ts unchanged as getNotificationMessage auto-resolves from i18n notifications record

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Skipped nonexistent summaryItems section**
- **Found during:** Task 1 (i18n notification templates)
- **Issue:** Plan referenced adding to `summaryItems` in en.ts/ko.ts but this section does not exist in the codebase
- **Fix:** Skipped summaryItems additions; the `notifications` Record<NotificationEventType, ...> is the only required section for type safety
- **Files modified:** None (skip)
- **Verification:** TypeScript typecheck passes with only notifications entries

---

**Total deviations:** 1 auto-fixed (1 bug in plan specification)
**Impact on plan:** No functional impact. The notifications record provides all needed type coverage.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 213 (integration layer) is now complete with all 4 plans executed
- All skill files, guide docs, and notification events updated for multi-wallet + connect-info model
- Ready for milestone completion

## Self-Check: PASSED

All 12 modified files verified present. Both task commits (b0f993c, 2fe58ea) verified in git log.

---
*Phase: 213-integration-layer*
*Completed: 2026-02-21*
