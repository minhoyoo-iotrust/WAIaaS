---
phase: 312-webhook-outbound
plan: "01"
subsystem: api, database, infra
tags: [webhook, hmac, zod, sqlite, migration, aes-gcm, sha256]

requires:
  - phase: 307-ops-webhook-design
    provides: OPS-04 Webhook Outbound design spec

provides:
  - Zod SSoT webhook schemas (CreateWebhookRequest, WebhookResponse, WebhookLog, WebhookLogQuery)
  - DB migration v37 (webhooks + webhook_logs tables with indexes and CHECK constraints)
  - WEBHOOK_NOT_FOUND error code
  - WebhookService (dispatch to matching webhooks with event filter)
  - WebhookDeliveryQueue (HMAC-SHA256 signed HTTP delivery with retry)

affects: [312-02, 312-03, admin-ui-webhooks]

tech-stack:
  added: []
  patterns: ["Webhook secret security: randomBytes(32) -> SHA-256 hash + AES-GCM encrypted", "Fire-and-forget delivery queue with exponential backoff retry"]

key-files:
  created:
    - packages/core/src/schemas/webhook.schema.ts
    - packages/daemon/src/services/webhook-service.ts
    - packages/daemon/src/services/webhook-delivery-queue.ts
    - packages/daemon/src/__tests__/webhook-service.test.ts
    - packages/daemon/src/__tests__/webhook-delivery-queue.test.ts
  modified:
    - packages/core/src/schemas/index.ts
    - packages/core/src/index.ts
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/__tests__/migration-chain.test.ts

key-decisions:
  - "Secret security model: 64-char hex generated via randomBytes(32), stored as SHA-256 hash + AES-256-GCM encrypted, returned once on POST only"
  - "Fire-and-forget delivery pattern: WebhookDeliveryQueue runs async delivery without blocking dispatch()"
  - "Retry strategy: max 4 attempts, exponential backoff (0/1s/2s/4s), 10s timeout, 4xx stops immediately"
  - "Event filter: empty events array = wildcard matching all events"

patterns-established:
  - "Webhook HMAC signing: sha256={createHmac('sha256', secret).update(body, 'utf8').digest('hex')}"
  - "Per-attempt log entry in webhook_logs with status, http_status, attempt, error, request_duration"

requirements-completed: [HOOK-01, HOOK-04, HOOK-05, HOOK-06]

duration: ~10min
completed: 2026-03-03
---

# Phase 312 Plan 01: Webhook Foundation Summary

**Webhook Zod SSoT schemas, DB migration v37, WebhookService dispatch engine, and WebhookDeliveryQueue with HMAC-SHA256 signed delivery + exponential backoff retry**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-03T21:40:00Z
- **Completed:** 2026-03-03T21:50:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Zod SSoT webhook schemas with 7 exported types (CreateWebhookRequest, WebhookResponse, CreateWebhookResponse, WebhookLog, WebhookLogQuery, WebhookEventType, WEBHOOK_LOG_STATUSES)
- DB migration v37: webhooks table (9 cols, 1 unique index, CHECK enabled IN (0,1)) + webhook_logs table (9 cols, 4 indexes, CHECK status IN ('success','failed'))
- WebhookService: queries enabled webhooks, filters by JSON events array (empty = wildcard), enqueues to delivery queue
- WebhookDeliveryQueue: HMAC-SHA256 signing (sha256={hex}), 6-header delivery, retry with exponential backoff, per-attempt logging
- 14 unit tests (6 service + 8 delivery queue) covering dispatch, HMAC, retry, 4xx stop, error isolation

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migration v37 + Zod SSoT + error code** - `e65ef073` (feat)
2. **Task 2: WebhookService + WebhookDeliveryQueue + tests** - `7f5eaec5` (feat)

## Files Created/Modified
- `packages/core/src/schemas/webhook.schema.ts` - Zod SSoT schemas for webhook system
- `packages/daemon/src/services/webhook-service.ts` - WebhookService with dispatch() and event filter
- `packages/daemon/src/services/webhook-delivery-queue.ts` - HMAC-signed HTTP delivery with retry
- `packages/daemon/src/__tests__/webhook-service.test.ts` - 6 WebhookService unit tests
- `packages/daemon/src/__tests__/webhook-delivery-queue.test.ts` - 8 WebhookDeliveryQueue unit tests
- `packages/daemon/src/infrastructure/database/migrate.ts` - Migration v37 (2 tables, 5 indexes)
- `packages/daemon/src/infrastructure/database/schema.ts` - Drizzle schema (tables 20-21)
- `packages/core/src/errors/error-codes.ts` - WEBHOOK_NOT_FOUND error code
- `packages/core/src/i18n/en.ts` + `ko.ts` - i18n translations

## Decisions Made
- Secret security: randomBytes(32) -> SHA-256 hash for comparison + AES-256-GCM encrypted for HMAC recovery
- Fire-and-forget async delivery to avoid blocking dispatch()
- 4xx errors stop immediately (client error = no retry), 5xx/network errors retry up to 4 times
- Used vi.stubGlobal('fetch') + zero backoff + polling helper for delivery queue tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added WEBHOOK_NOT_FOUND to i18n files**
- **Found during:** Task 1
- **Issue:** Core build failed because i18n Record types (en.ts, ko.ts) require all error codes
- **Fix:** Added translations: en='Webhook not found', ko='...'
- **Files modified:** packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts
- **Committed in:** e65ef073

**2. [Rule 1 - Bug] Changed WebhookService.eventBus to public readonly**
- **Found during:** Task 2
- **Issue:** TS6138 'eventBus' declared but never read (private field)
- **Fix:** Changed from `private readonly` to `readonly` since Plan 03 needs access
- **Files modified:** packages/daemon/src/services/webhook-service.ts
- **Committed in:** 7f5eaec5

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for build and type safety. No scope creep.

## Issues Encountered
- Fake timer approach for delivery queue tests failed multiple times (async fire-and-forget with setTimeout doesn't work well with vi.useFakeTimers). Resolved by using real timers + zero backoff + polling wait helper.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Webhook foundation complete: schemas, DB tables, service, delivery queue
- Ready for Plan 02 (REST API) and Plan 03 (EventBus + lifecycle)

---
*Phase: 312-webhook-outbound*
*Completed: 2026-03-03*
