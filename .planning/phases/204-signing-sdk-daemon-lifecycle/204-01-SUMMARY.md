---
phase: 204-signing-sdk-daemon-lifecycle
plan: 01
subsystem: infra
tags: [signing-sdk, daemon-lifecycle, pipeline, approval-channel-router, ntfy, telegram]

# Dependency graph
requires:
  - phase: 202-signing-protocol-daemon-sdk-ntfy
    provides: "SignRequestBuilder, SignResponseHandler, WalletLinkRegistry, NtfySigningChannel"
  - phase: 203-telegram-channel-routing-rest-admin
    provides: "TelegramSigningChannel, ApprovalChannelRouter"
provides:
  - "Signing SDK classes instantiated in daemon.ts lifecycle (Step 4c-8)"
  - "ApprovalChannelRouter wired through pipeline request path (CreateAppDeps -> TransactionRouteDeps -> PipelineContext -> stage4Wait)"
  - "Fire-and-forget SDK signing channel routing for PENDING_APPROVAL transactions"
  - "Daemon shutdown cleanup for ApprovalChannelRouter and its channels"
affects: [204-02, pipeline, daemon-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Signing SDK fail-soft lifecycle pattern (same as WcSigningBridge Step 4c-7)"
    - "Fire-and-forget channel routing in stage4Wait APPROVAL branch"

key-files:
  created: []
  modified:
    - "packages/daemon/src/lifecycle/daemon.ts"
    - "packages/daemon/src/pipeline/stages.ts"
    - "packages/daemon/src/api/server.ts"
    - "packages/daemon/src/api/routes/transactions.ts"

key-decisions:
  - "ApprovalChannelRouter field added to CreateAppDeps in Task 1 (alongside daemon.ts changes) to unblock typecheck, rather than waiting for Task 2"
  - "TelegramSigningChannel conditionally created only when telegramBotService is running and botToken is available"
  - "Fire-and-forget pattern (void + no await) for ApprovalChannelRouter.route() matches existing wcSigningBridge pattern"

patterns-established:
  - "Step 4c-8: Signing SDK lifecycle block follows same fail-soft try/catch pattern as Step 4c-7"

requirements-completed: [PROTO-01, PROTO-03, CHAN-01, CHAN-02, CHAN-03, CHAN-05, CHAN-06, CHAN-07, WALLET-01]

# Metrics
duration: 12min
completed: 2026-02-20
---

# Phase 204 Plan 01: Signing SDK Daemon Lifecycle Wiring Summary

**All 6 signing SDK classes instantiated in daemon.ts Step 4c-8 with ApprovalChannelRouter wired through full pipeline request path for PENDING_APPROVAL fire-and-forget routing**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-20T06:59:44Z
- **Completed:** 2026-02-20T07:12:32Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Signing SDK classes (SignRequestBuilder, SignResponseHandler, WalletLinkRegistry, NtfySigningChannel, TelegramSigningChannel, ApprovalChannelRouter) instantiated in daemon.ts Step 4c-8 when signing_sdk.enabled=true
- ApprovalChannelRouter wired through CreateAppDeps -> TransactionRouteDeps -> PipelineContext -> stage4Wait APPROVAL branch with fire-and-forget routing
- Daemon shutdown cascade properly cleans up ApprovalChannelRouter and its channels
- All 2601 existing daemon tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Instantiate signing SDK classes in daemon.ts lifecycle + shutdown cleanup** - `33b1987` (feat)
2. **Task 2: Add ApprovalChannelRouter to PipelineContext + stage4Wait + transaction routes** - `479dfc2` (feat)

## Files Created/Modified
- `packages/daemon/src/lifecycle/daemon.ts` - Step 4c-8: signing SDK lifecycle instantiation + shutdown cleanup + createApp() wiring
- `packages/daemon/src/pipeline/stages.ts` - PipelineContext.approvalChannelRouter + fire-and-forget route() in stage4Wait APPROVAL branch
- `packages/daemon/src/api/server.ts` - CreateAppDeps.approvalChannelRouter + passthrough to transactionRoutes
- `packages/daemon/src/api/routes/transactions.ts` - TransactionRouteDeps.approvalChannelRouter + PipelineContext construction

## Decisions Made
- Added ApprovalChannelRouter to CreateAppDeps in Task 1 (alongside daemon.ts changes) rather than Task 2, because daemon.ts's createApp() call references the field and typecheck would fail without it (Rule 3: blocking issue).
- TelegramSigningChannel is conditionally created only when telegramBotService is running and botToken is available, avoiding unnecessary TelegramApi instantiation when Telegram is not configured.
- Fire-and-forget routing uses `void ctx.approvalChannelRouter.route(...)` pattern, identical to existing `void ctx.wcSigningBridge.requestSignature(...)` pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added ApprovalChannelRouter to CreateAppDeps in Task 1**
- **Found during:** Task 1 (daemon.ts lifecycle wiring)
- **Issue:** daemon.ts passes `approvalChannelRouter` to createApp(), but CreateAppDeps interface didn't have the field yet (planned for Task 2). TypeScript compile error TS2353.
- **Fix:** Added `approvalChannelRouter?: ApprovalChannelRouter` to CreateAppDeps and the import in server.ts as part of Task 1.
- **Files modified:** packages/daemon/src/api/server.ts
- **Verification:** `pnpm turbo run typecheck --filter=@waiaas/daemon` passes
- **Committed in:** 33b1987 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Moved one field addition from Task 2 to Task 1 to satisfy TypeScript. Task 2 still added the remaining server.ts passthrough and transactions.ts wiring as planned. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 204-02 can now wire TelegramBotService late-binding for signResponseHandler and add remaining integration tests
- All signing SDK code is now reachable at runtime (no longer dead code)
- PENDING_APPROVAL transactions trigger both WcSigningBridge (v1.6.1) and ApprovalChannelRouter (v2.6.1) fire-and-forget

---
*Phase: 204-signing-sdk-daemon-lifecycle*
*Completed: 2026-02-20*
