---
phase: 328-rest-api-policy-settings
plan: 01
subsystem: policy, settings, notifications
tags: [erc8128, domain-policy, admin-settings, notification-events, i18n]

# Dependency graph
requires:
  - phase: 327-http-message-signing-engine
    provides: ERC-8128 HTTP message signing core (signHttpMessage, verifyHttpSignature)
provides:
  - ERC8128_ALLOWED_DOMAINS policy type in POLICY_TYPES enum (19th policy type)
  - Domain policy evaluator (matchDomain, evaluateErc8128Domain) with wildcard and default-deny
  - In-memory per-domain rate limiter (checkErc8128RateLimit) with 60s sliding window
  - 6 Admin Settings keys under erc8128 category + 1 policy.default_deny_erc8128_domains toggle
  - ERC8128_SIGNATURE_CREATED and ERC8128_DOMAIN_BLOCKED notification events
  - i18n templates (en/ko) for both notification events
affects: [328-02-PLAN, 329-rest-api, mcp, sdk, admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [domain-policy-evaluator following x402 pattern, in-memory rate limiting with Map]

key-files:
  created:
    - packages/daemon/src/services/erc8128/erc8128-domain-policy.ts
    - packages/daemon/src/services/erc8128/__tests__/erc8128-domain-policy.test.ts
  modified:
    - packages/core/src/enums/policy.ts
    - packages/core/src/enums/notification.ts
    - packages/core/src/schemas/signing-protocol.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/core/src/__tests__/enums.test.ts

key-decisions:
  - "ERC8128_SIGNATURE_CREATED mapped to security_alert category (not security, which doesn't exist in NOTIFICATION_CATEGORIES)"
  - "Domain policy evaluator follows x402-domain-policy.ts pattern exactly for consistency"

patterns-established:
  - "Domain policy evaluator pattern: matchDomain + evaluate + rate limit in single module"

requirements-completed: [POL-01, POL-02, POL-03, POL-04, ADM-01, ADM-02, INT-02, INT-03]

# Metrics
duration: 5min
completed: 2026-03-05
---

# Phase 328 Plan 01: ERC-8128 Infra Summary

**ERC8128_ALLOWED_DOMAINS policy type with wildcard domain matching, per-domain rate limiting, 6 Admin Settings keys, and 2 notification events**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-05T05:47:08Z
- **Completed:** 2026-03-05T05:52:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- ERC8128_ALLOWED_DOMAINS policy type added (19 total) with domain evaluator supporting wildcard matching and default-deny
- In-memory per-domain rate limiter with 60s sliding window
- 6 Admin Settings keys under erc8128 category + policy.default_deny_erc8128_domains toggle
- ERC8128_SIGNATURE_CREATED and ERC8128_DOMAIN_BLOCKED notification events with i18n (en/ko)

## Task Commits

Each task was committed atomically:

1. **Task 1: ERC8128_ALLOWED_DOMAINS policy type + domain evaluator + rate limit** - `5bae9913` (feat)
2. **Task 2: Admin Settings keys + notification event types + i18n** - `2db3cc25` (feat)

## Files Created/Modified
- `packages/daemon/src/services/erc8128/erc8128-domain-policy.ts` - Domain policy evaluator with matchDomain, evaluateErc8128Domain, checkErc8128RateLimit
- `packages/daemon/src/services/erc8128/__tests__/erc8128-domain-policy.test.ts` - 11 tests covering domain matching, default-deny, rate limiting
- `packages/core/src/enums/policy.ts` - Added ERC8128_ALLOWED_DOMAINS to POLICY_TYPES
- `packages/core/src/enums/notification.ts` - Added ERC8128_SIGNATURE_CREATED, ERC8128_DOMAIN_BLOCKED
- `packages/core/src/schemas/signing-protocol.ts` - Added EVENT_CATEGORY_MAP and EVENT_DESCRIPTIONS entries
- `packages/core/src/i18n/en.ts` - Added English notification templates
- `packages/core/src/i18n/ko.ts` - Added Korean notification templates
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - Added erc8128 category with 6 keys + 1 policy toggle
- `packages/core/src/__tests__/enums.test.ts` - Updated count assertions (19 policy types, 56 notification events)

## Decisions Made
- ERC8128_SIGNATURE_CREATED mapped to `security_alert` category (plan suggested `security` but that category doesn't exist in NOTIFICATION_CATEGORIES)
- Domain policy evaluator follows x402-domain-policy.ts pattern exactly for codebase consistency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed EVENT_CATEGORY_MAP category value**
- **Found during:** Task 2 (notification event registration)
- **Issue:** Plan specified 'security' category for ERC8128_SIGNATURE_CREATED but NOTIFICATION_CATEGORIES only has 'security_alert'
- **Fix:** Changed to 'security_alert' to match existing category enum
- **Files modified:** packages/core/src/schemas/signing-protocol.ts
- **Verification:** signing-protocol.test.ts passes (validates all events map to valid categories)
- **Committed in:** 2db3cc25 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for type correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Domain policy evaluator ready for use by REST API endpoints (Plan 328-02)
- Admin Settings keys registered for runtime configuration
- Notification events registered for sign/block notifications

---
*Phase: 328-rest-api-policy-settings*
*Completed: 2026-03-05*
