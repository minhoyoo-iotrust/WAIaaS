---
phase: 90-core-types-error-codes
plan: 01
subsystem: core
tags: [zod, typescript, enums, schemas, error-codes, i18n, wallet-terminology]

# Dependency graph
requires:
  - phase: 89-db-migration
    provides: "DB schema migrated (agents -> wallets), Drizzle schema updated"
provides:
  - "WalletSchema, CreateWalletRequestSchema Zod SSoT schemas"
  - "WALLET_STATUSES, WalletStatus, WalletStatusEnum enums"
  - "WALLET_NOT_FOUND, WALLET_SUSPENDED, WALLET_TERMINATED error codes (domain WALLET)"
  - "AuditAction WALLET_CREATED/ACTIVATED/SUSPENDED/TERMINATED"
  - "NotificationEvent WALLET_SUSPENDED"
  - "Session/Transaction/Policy schemas use walletId"
  - "i18n messages updated (en/ko) for wallet terminology"
affects: [91-daemon-routes, 92-sdk-mcp-cli, 93-admin-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: ["wallet terminology SSoT in @waiaas/core"]

key-files:
  created:
    - "packages/core/src/enums/wallet.ts"
    - "packages/core/src/schemas/wallet.schema.ts"
  modified:
    - "packages/core/src/enums/audit.ts"
    - "packages/core/src/enums/notification.ts"
    - "packages/core/src/enums/index.ts"
    - "packages/core/src/schemas/session.schema.ts"
    - "packages/core/src/schemas/transaction.schema.ts"
    - "packages/core/src/schemas/policy.schema.ts"
    - "packages/core/src/schemas/index.ts"
    - "packages/core/src/errors/error-codes.ts"
    - "packages/core/src/index.ts"
    - "packages/core/src/i18n/en.ts"
    - "packages/core/src/i18n/ko.ts"

key-decisions:
  - "i18n messages updated inline (wallet not found/suspended/terminated) for both en and ko"
  - "Notification template body uses {walletId} placeholder instead of {agentId}"
  - "All 5 core test files updated to wallet terminology (auto-fixed via Rule 3)"

patterns-established:
  - "wallet terminology: all @waiaas/core exports use Wallet* prefix (WalletSchema, WalletStatusEnum, WALLET_*)"

# Metrics
duration: 4min
completed: 2026-02-13
---

# Phase 90 Plan 01: Core Types + Error Codes Summary

**Renamed all agent-related Zod schemas, enums, error codes, and i18n messages in @waiaas/core to wallet terminology -- 19 files modified, 137/137 tests passing**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-12T15:48:08Z
- **Completed:** 2026-02-12T15:52:12Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments
- Renamed enums/agent.ts to enums/wallet.ts (AGENT_STATUSES -> WALLET_STATUSES, AgentStatusEnum -> WalletStatusEnum)
- Renamed schemas/agent.schema.ts to schemas/wallet.schema.ts (AgentSchema -> WalletSchema, CreateAgentRequestSchema -> CreateWalletRequestSchema)
- Renamed 3 error codes from AGENT domain to WALLET domain (AGENT_NOT_FOUND -> WALLET_NOT_FOUND, etc.)
- Updated audit actions (4 renamed) and notification events (1 renamed) to wallet terminology
- Renamed agentId to walletId in Session, Transaction, and Policy schemas
- Updated i18n messages (en + ko) for error codes and notification templates
- Updated all 5 core test files, all 137 tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename enum + schema source files and update content** - `54661c7` (refactor)
2. **Task 2: Update error codes + barrel export + tsc verify** - `4d45b6b` (feat)

## Files Created/Modified
- `packages/core/src/enums/wallet.ts` - New file: WALLET_STATUSES, WalletStatus, WalletStatusEnum
- `packages/core/src/schemas/wallet.schema.ts` - New file: WalletSchema, CreateWalletRequestSchema
- `packages/core/src/enums/agent.ts` - Deleted (replaced by wallet.ts)
- `packages/core/src/schemas/agent.schema.ts` - Deleted (replaced by wallet.schema.ts)
- `packages/core/src/enums/audit.ts` - 4 audit actions renamed (AGENT_* -> WALLET_*)
- `packages/core/src/enums/notification.ts` - 1 event renamed (AGENT_SUSPENDED -> WALLET_SUSPENDED)
- `packages/core/src/enums/index.ts` - Barrel exports updated
- `packages/core/src/schemas/session.schema.ts` - agentId -> walletId (2 fields)
- `packages/core/src/schemas/transaction.schema.ts` - agentId -> walletId
- `packages/core/src/schemas/policy.schema.ts` - agentId -> walletId (2 fields + JSDoc)
- `packages/core/src/schemas/index.ts` - Barrel exports updated
- `packages/core/src/errors/error-codes.ts` - ErrorDomain AGENT -> WALLET, 3 codes renamed
- `packages/core/src/index.ts` - Top-level barrel exports updated
- `packages/core/src/i18n/en.ts` - Error + notification messages updated
- `packages/core/src/i18n/ko.ts` - Error + notification messages updated
- `packages/core/src/__tests__/enums.test.ts` - Updated to wallet terminology
- `packages/core/src/__tests__/errors.test.ts` - Updated to wallet terminology
- `packages/core/src/__tests__/i18n.test.ts` - Updated to wallet terminology
- `packages/core/src/__tests__/package-exports.test.ts` - Updated to wallet terminology
- `packages/core/src/__tests__/schemas.test.ts` - Updated to wallet terminology + walletId test data

## Decisions Made
- i18n messages updated inline: "Agent not found" -> "Wallet not found" (en), "에이전트를 찾을 수 없습니다" -> "지갑을 찾을 수 없습니다" (ko)
- Notification template body placeholder changed from {agentId} to {walletId} for WALLET_SUSPENDED event
- All core test files updated to wallet terminology in Task 2 (deviation from plan which only listed error-codes.ts and index.ts)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated i18n message files (en.ts, ko.ts) for wallet terminology**
- **Found during:** Task 2 (tsc --noEmit revealed type errors)
- **Issue:** i18n/en.ts and i18n/ko.ts had AGENT_NOT_FOUND, AGENT_SUSPENDED, AGENT_TERMINATED keys and AGENT_SUSPENDED notification template -- type errors because ErrorCode and NotificationEventType changed
- **Fix:** Renamed error code keys and notification template keys in both locale files
- **Files modified:** packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts
- **Verification:** tsc --noEmit passes
- **Committed in:** 4d45b6b (Task 2 commit)

**2. [Rule 3 - Blocking] Updated 5 core test files for wallet terminology**
- **Found during:** Task 2 (tsc --noEmit revealed type errors in test files)
- **Issue:** enums.test.ts, errors.test.ts, i18n.test.ts, package-exports.test.ts, schemas.test.ts all referenced old Agent* names -- tsc failures
- **Fix:** Renamed all Agent references to Wallet in imports, assertions, test data (agentId -> walletId)
- **Files modified:** 5 test files in packages/core/src/__tests__/
- **Verification:** tsc --noEmit passes, 137/137 tests pass
- **Committed in:** 4d45b6b (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking)
**Impact on plan:** Both auto-fixes necessary for tsc --noEmit to pass (plan requirement). No scope creep -- these files are within core package.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- @waiaas/core fully migrated to wallet terminology
- Zero Agent-prefixed types/schemas/enums/error-codes remain in core/src/
- Downstream packages (daemon, sdk, mcp, admin, cli) still reference old names -- Phases 91-93 will fix those
- tsc --noEmit passes for core, 137/137 tests green

## Self-Check: PASSED

All created files exist, all deleted files removed, all commit hashes verified (54661c7, 4d45b6b).

---
*Phase: 90-core-types-error-codes*
*Completed: 2026-02-13*
