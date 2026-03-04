---
phase: 317-foundation
plan: 01
subsystem: database
tags: [sqlite, drizzle, migration, erc-8004, agent-identity, reputation-cache]

requires:
  - phase: none
    provides: first phase of v30.8
provides:
  - DB v39 migration (agent_identities + reputation_cache + approval_type + policies CHECK)
  - POLICY_TYPES 18th type REPUTATION_THRESHOLD
  - Drizzle schema for agentIdentities + reputationCache tables
affects: [317-02, 318, 319, 320, 321, 322, 323]

tech-stack:
  added: []
  patterns: [v39 migration with managesOwnTransaction for policies table recreation]

key-files:
  created:
    - packages/daemon/src/__tests__/migration-v39.test.ts
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/infrastructure/database/index.ts
    - packages/core/src/enums/policy.ts

key-decisions:
  - "v39 migration uses managesOwnTransaction for policies table recreation (same pattern as v27, v33)"
  - "agent_identities uses UNIQUE INDEX on (registry_address, chain_agent_id) for cross-chain dedup"
  - "reputation_cache uses composite PK (agent_id, registry_address, tag1, tag2) for tag-filtered caching"
  - "approval_type defaults to SIWE with CHECK IN (SIWE, EIP712) for backward compatibility"

patterns-established:
  - "23-table schema with agent_identities + reputation_cache for ERC-8004"

requirements-completed: [DB-01, DB-02, DB-03, DB-04]

duration: 17min
completed: 2026-03-04
---

# Phase 317 Plan 01: DB v39 Migration Summary

**DB v39 migration: agent_identities (10 cols, 2 indexes, FK wallets, status CHECK), reputation_cache (composite PK), pending_approvals.approval_type, policies CHECK with REPUTATION_THRESHOLD**

## Performance

- **Duration:** 17 min
- **Started:** 2026-03-04T07:29:47Z
- **Completed:** 2026-03-04T07:47:00Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- agent_identities table with 10 columns, wallet FK, status CHECK (PENDING/REGISTERED/WALLET_LINKED/DEREGISTERED), 2 indexes
- reputation_cache table with composite PK (agent_id, registry_address, tag1, tag2), 8 columns
- pending_approvals.approval_type column (default SIWE, CHECK IN SIWE/EIP712) for EIP-712 approval flow
- policies table recreation with REPUTATION_THRESHOLD (18th type) in CHECK constraint
- 8 dedicated v39 migration tests + 11 existing test files updated for LATEST_SCHEMA_VERSION=39

## Task Commits

1. **Task 1: DB v39 migration implementation** - `aeeeff72` (feat)
2. **Task 2: Existing migration test LATEST_SCHEMA_VERSION updates** - `6667a388` (test)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/migrate.ts` - v39 migration + DDL updates (23 tables)
- `packages/daemon/src/infrastructure/database/schema.ts` - agentIdentities + reputationCache Drizzle tables + pendingApprovals.approvalType
- `packages/daemon/src/infrastructure/database/index.ts` - export agentIdentities, reputationCache
- `packages/core/src/enums/policy.ts` - REPUTATION_THRESHOLD (18th POLICY_TYPE)
- `packages/daemon/src/__tests__/migration-v39.test.ts` - 8 v39 migration tests
- `packages/daemon/src/__tests__/migration-chain.test.ts` - v39 version + T-16g subset fix
- `packages/daemon/src/__tests__/migration-runner.test.ts` - bump custom versions 39->40+
- 9 additional test files - LATEST_SCHEMA_VERSION 38->39

## Decisions Made
- v39 migration uses `managesOwnTransaction: true` because policies table recreation requires foreign keys OFF
- agent_identities.status CHECK uses 4 values: PENDING (default), REGISTERED, WALLET_LINKED, DEREGISTERED
- migration-chain T-16g test updated to subset comparison (not exact equality) since v39 adds approval_type to pending_approvals
- migration-runner custom test versions bumped from 39/40/41 to 40/41/42 to avoid conflict with real v39

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed migration-chain T-16g test assertion**
- **Found during:** Task 2 (migration test updates)
- **Issue:** T-16g compared pending_approvals columns exactly between v16-only DB and fresh DB, but fresh DB now has approval_type from v39
- **Fix:** Changed assertion to verify v16 columns are a subset of fresh DB columns
- **Files modified:** packages/daemon/src/__tests__/migration-chain.test.ts
- **Verification:** All 68 migration-chain tests pass
- **Committed in:** 6667a388

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for test correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DB v39 schema ready for Phase 318-323 ERC-8004 features
- REPUTATION_THRESHOLD in POLICY_TYPES ready for policy schema in Plan 317-02
- Drizzle schema exports ready for service layer usage

---
*Phase: 317-foundation*
*Completed: 2026-03-04*
