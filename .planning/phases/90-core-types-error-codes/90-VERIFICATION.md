---
phase: 90-core-types-error-codes
verified: 2026-02-13T01:01:00Z
status: passed
score: 7/7
re_verification: false
---

# Phase 90: 코어 타입 + 에러 코드 Verification Report

**Phase Goal:** @waiaas/core 패키지의 모든 agent 용어를 wallet으로 변경하여, 다운스트림 패키지가 참조하는 SSoT가 갱신된다
**Verified:** 2026-02-13T01:01:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | WalletSchema, CreateWalletRequestSchema, WalletStatusEnum Zod schemas exist | ✓ VERIFIED | All three schemas exist in packages/core/src/schemas/wallet.schema.ts and packages/core/src/enums/wallet.ts |
| 2 | Agent-prefixed Zod schemas (AgentSchema, AgentStatusEnum) are 0 in codebase | ✓ VERIFIED | grep found 0 matches for AgentSchema\|AgentStatusEnum\|AGENT_STATUSES\|CreateAgentRequest in core/src/ |
| 3 | WALLET_NOT_FOUND, WALLET_SUSPENDED, WALLET_TERMINATED error codes exist with domain WALLET | ✓ VERIFIED | All 3 error codes exist with domain: 'WALLET' in error-codes.ts |
| 4 | AGENT_* error codes are 0 in error-codes.ts | ✓ VERIFIED | grep found 0 matches for AGENT_NOT_FOUND\|AGENT_SUSPENDED\|AGENT_TERMINATED and domain: 'AGENT' |
| 5 | AuditAction/NotificationEvent enum has WALLET_* values only | ✓ VERIFIED | audit.ts has WALLET_CREATED/ACTIVATED/SUSPENDED/TERMINATED, notification.ts has WALLET_SUSPENDED, 0 AGENT_* values |
| 6 | i18n en/ko templates use {walletId}/{walletCount} variables (no {agentId}) | ✓ VERIFIED | grep found 18 {walletId} and 2 {walletCount} occurrences, 0 {agentId}/{agentCount} matches |
| 7 | tsc --noEmit compilation succeeds | ✓ VERIFIED | npx tsc --noEmit in packages/core exited with 0, no errors |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core/src/enums/wallet.ts` | WALLET_STATUSES, WalletStatus, WalletStatusEnum | ✓ VERIFIED | File exists, contains all expected exports with 5 status values |
| `packages/core/src/schemas/wallet.schema.ts` | WalletSchema, CreateWalletRequestSchema | ✓ VERIFIED | File exists, contains both schemas with walletId references |
| `packages/core/src/errors/error-codes.ts` | WALLET_NOT_FOUND/SUSPENDED/TERMINATED with domain WALLET | ✓ VERIFIED | All 3 error codes exist with correct domain, total 68 codes maintained |
| `packages/core/src/enums/audit.ts` | WALLET_CREATED/ACTIVATED/SUSPENDED/TERMINATED | ✓ VERIFIED | All 4 audit actions present in AUDIT_ACTIONS array |
| `packages/core/src/enums/notification.ts` | WALLET_SUSPENDED event | ✓ VERIFIED | Event exists in NOTIFICATION_EVENT_TYPES array |
| `packages/core/src/schemas/session.schema.ts` | Uses walletId field | ✓ VERIFIED | SessionSchema and CreateSessionRequestSchema use walletId, 0 agentId |
| `packages/core/src/schemas/transaction.schema.ts` | Uses walletId field | ✓ VERIFIED | TransactionSchema uses walletId, 0 agentId |
| `packages/core/src/schemas/policy.schema.ts` | Uses walletId field | ✓ VERIFIED | PolicySchema uses walletId, 0 agentId |
| `packages/core/src/i18n/en.ts` | Wallet terminology in messages | ✓ VERIFIED | WALLET_* error keys, {walletId}/{walletCount} in notifications, "Wallet" text |
| `packages/core/src/i18n/ko.ts` | Wallet terminology in messages | ✓ VERIFIED | WALLET_* error keys, {walletId}/{walletCount} in notifications, "지갑" text |
| `packages/core/src/index.ts` | Exports WalletSchema, WALLET_STATUSES | ✓ VERIFIED | Barrel exports all wallet-prefixed names, 0 agent-prefixed names |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| packages/core/src/schemas/wallet.schema.ts | packages/core/src/enums/wallet.ts | import WalletStatusEnum | ✓ WIRED | Import statement found: `import { WalletStatusEnum } from '../enums/index.js'` |
| packages/core/src/index.ts | packages/core/src/schemas/index.ts | re-export WalletSchema | ✓ WIRED | WalletSchema exported in schemas/index.ts and re-exported in core/index.ts |
| packages/core/src/index.ts | packages/core/src/enums/index.ts | re-export WALLET_STATUSES | ✓ WIRED | WALLET_STATUSES exported in enums/index.ts and re-exported in core/index.ts |
| packages/core/src/i18n/en.ts | packages/core/src/errors/error-codes.ts | error key parity (68 keys) | ✓ WIRED | Both files have 68 error codes with matching keys |

### Requirements Coverage

Phase 90 requirements from ROADMAP.md (8 requirements):

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| SCHEMA-01: Rename AgentSchema to WalletSchema | ✓ SATISFIED | None |
| SCHEMA-02: Rename CreateAgentRequestSchema to CreateWalletRequestSchema | ✓ SATISFIED | None |
| ERR-01: Rename AGENT_NOT_FOUND to WALLET_NOT_FOUND | ✓ SATISFIED | None |
| ERR-02: Rename AGENT_SUSPENDED to WALLET_SUSPENDED | ✓ SATISFIED | None |
| ERR-03: Rename AGENT_TERMINATED to WALLET_TERMINATED | ✓ SATISFIED | None |
| ERR-04: Rename ErrorDomain 'AGENT' to 'WALLET' | ✓ SATISFIED | None |
| I18N-01: Replace {agentId} with {walletId} in en/ko | ✓ SATISFIED | None |
| I18N-02: Replace {agentCount} with {walletCount} in en/ko | ✓ SATISFIED | None |
| I18N-03: Replace "Agent"/"에이전트" with "Wallet"/"지갑" in en/ko | ✓ SATISFIED | None |

**All 8 requirements satisfied.**

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | N/A | N/A | N/A | N/A |

**No anti-patterns found.** All files are substantive with complete implementations. No TODO/FIXME/placeholder comments found in modified files.

### Test Results

```bash
cd packages/core && npx vitest run
```

**Result:** ✓ PASSED

- **Test Files:** 9 passed (9)
- **Tests:** 137 passed (137)
- **Duration:** 1.45s

All core tests updated to wallet terminology:
- enums.test.ts: WALLET_STATUSES assertions
- errors.test.ts: WALLET_NOT_FOUND error code tests
- schemas.test.ts: WalletSchema validation tests, walletId field tests
- i18n.test.ts: WALLET_* message key tests
- package-exports.test.ts: WalletSchema export tests

### Implementation Quality Checks

**File Deletion Verification:**
- ✓ packages/core/src/enums/agent.ts — DELETED (confirmed)
- ✓ packages/core/src/schemas/agent.schema.ts — DELETED (confirmed)

**Terminology Consistency:**
- ✓ 0 matches for AgentSchema in core/src/
- ✓ 0 matches for AGENT_STATUSES in core/src/
- ✓ 0 matches for agentId in core/src/schemas/
- ✓ 0 matches for {agentId}/{agentCount} in core/src/i18n/
- ✓ 68 error codes maintained (no additions/deletions)
- ✓ ErrorDomain includes 'WALLET', excludes 'AGENT'

**Commit Verification:**
All commits from SUMMARYs verified in git log:
- ✓ 54661c7 — refactor(90-01): rename agent enums/schemas to wallet terminology
- ✓ 4d45b6b — feat(90-01): rename AGENT error codes/domain to WALLET + update barrel exports
- ✓ 3741a8d — feat(90-02): update i18n en/ko notification templates to wallet terminology

**TypeScript Compilation:**
- ✓ npx tsc --noEmit in packages/core — SUCCESS (exit code 0)

### Success Criteria Met

From ROADMAP.md Phase 90 success criteria:

1. ✓ `WalletSchema`, `CreateWalletRequestSchema`, `WalletStatusEnum` Zod 스키마가 존재하고 Agent 접두사 스키마가 0건이다
2. ✓ 에러 코드 `WALLET_NOT_FOUND`, `WALLET_SUSPENDED`, `WALLET_TERMINATED`가 존재하고 `AGENT_*` 에러 코드가 0건이다
3. ✓ AuditAction/NotificationEvent enum에 `WALLET_*` 값만 존재한다
4. ✓ i18n en/ko 템플릿에서 `{walletId}`, `{walletCount}` 변수가 사용되고 `{agentId}` 변수가 0건이다
5. ✓ `tsc --noEmit` 컴파일이 성공한다

**All 5 success criteria met.**

## Verification Summary

Phase 90 goal **ACHIEVED**. The @waiaas/core package has been fully migrated to wallet terminology:

**What was verified:**
- ✓ All schemas, enums, and error codes renamed from Agent to Wallet
- ✓ All 3 WALLET domain error codes exist with correct properties
- ✓ AuditAction and NotificationEvent enums use WALLET_* values
- ✓ All i18n templates (en/ko) use wallet terminology and variables
- ✓ All dependent schemas (Session, Transaction, Policy) use walletId
- ✓ All barrel exports updated to re-export wallet-prefixed names
- ✓ TypeScript compilation succeeds with no errors
- ✓ All 137 core tests pass with wallet terminology
- ✓ Old agent.ts and agent.schema.ts files deleted
- ✓ All commits documented in SUMMARYs verified in git log

**No gaps found.** All must-haves verified, all key links wired, all requirements satisfied.

**Next phase ready:** Downstream packages (daemon, SDK, MCP, admin) can now import wallet-prefixed types from @waiaas/core. Phase 91-93 will migrate those packages.

---

_Verified: 2026-02-13T01:01:00Z_
_Verifier: Claude (gsd-verifier)_
