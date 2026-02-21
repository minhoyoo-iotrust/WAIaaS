---
phase: 224-core-types-db-foundation
verified: 2026-02-22T00:00:00Z
status: passed
score: 4/4 success criteria verified
re_verification: null
gaps: []
human_verification: []
---

# Phase 224: Core Types + DB Foundation Verification Report

**Phase Goal:** 모든 후속 단계가 의존하는 타입 시스템과 DB 스키마가 존재하여, 구독자와 서비스 코드가 컴파일되고 테스트 데이터를 삽입할 수 있는 상태
**Verified:** 2026-02-22T00:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | IChainSubscriber 6-method interface defined in @waiaas/core, importable for implements | VERIFIED | `packages/core/src/interfaces/IChainSubscriber.ts` — 6 methods: subscribe, unsubscribe, subscribedWallets, connect, waitForDisconnect, destroy. Exported via `interfaces/index.ts` and `core/index.ts` |
| 2 | DB v21 migration creates incoming_transactions (13 cols + UNIQUE), incoming_tx_cursors (6 cols), wallets.monitor_incoming | VERIFIED | `migrate.ts` LATEST_SCHEMA_VERSION=21; pushSchema DDL at lines 257-280; v21 migration at lines 1493-1531; 46 migration chain tests (test line 1005 asserts LATEST_SCHEMA_VERSION===21) |
| 3 | IncomingTransaction Zod schema and IncomingTxStatus enum exported from @waiaas/core | VERIFIED | `schemas/incoming-transaction.schema.ts` — IncomingTransactionSchema (13-field Zod object + type inference); `enums/incoming-tx.ts` — INCOMING_TX_STATUSES=['DETECTED','CONFIRMED'], IncomingTxStatusEnum; both exported via core barrel |
| 4 | pushSchema DDL, Drizzle schema, migration chain tests all pass | VERIFIED | 46 test cases in migration-chain.test.ts; EXPECTED_INDEXES includes 4 new idx_incoming_tx_* entries; ALL_TABLES includes incoming_transactions and incoming_tx_cursors; Drizzle schema defines both tables with correct columns, FK references, CHECK constraints |

**Score:** 4/4 success criteria verified

---

## Required Artifacts

### Plan 224-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core/src/interfaces/IChainSubscriber.ts` | 6-method subscriber interface | VERIFIED | 62 lines; exports interface IChainSubscriber with readonly chain, subscribe, unsubscribe, subscribedWallets, connect, waitForDisconnect, destroy; JSDoc on each method |
| `packages/core/src/interfaces/chain-subscriber.types.ts` | IncomingTransaction interface (13 fields) | VERIFIED | 35 lines; IncomingTransaction interface with all 13 fields: id, txHash, walletId, fromAddress, amount, tokenAddress, chain, network, status, blockNumber, detectedAt, confirmedAt, isSuspicious |
| `packages/core/src/schemas/incoming-transaction.schema.ts` | Zod SSoT schema with 13 fields | VERIFIED | 27 lines; IncomingTransactionSchema z.object with all 13 fields using ChainTypeEnum and IncomingTxStatusEnum; exports type IncomingTransaction via z.infer |
| `packages/core/src/enums/incoming-tx.ts` | INCOMING_TX_STATUSES + IncomingTxStatus + IncomingTxStatusEnum | VERIFIED | 5 lines; INCOMING_TX_STATUSES=['DETECTED','CONFIRMED'] as const; type IncomingTxStatus; IncomingTxStatusEnum Zod enum |
| `packages/core/src/events/event-types.ts` | IncomingTxEvent + IncomingTxSuspiciousEvent in WaiaasEventMap | VERIFIED | WaiaasEventMap now has 7 keys: transaction:completed, transaction:failed, transaction:incoming, transaction:incoming:suspicious, wallet:activity, kill-switch:state-changed, approval:channel-switched |

### Plan 224-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/daemon/src/infrastructure/database/migrate.ts` | LATEST_SCHEMA_VERSION=21, v21 migration, updated pushSchema DDL | VERIFIED | LATEST_SCHEMA_VERSION=21 (line 55); v21 migration at line 1493 creates incoming_transactions (IF NOT EXISTS, 13 cols + UNIQUE), incoming_tx_cursors (IF NOT EXISTS, 6 cols), 4 indexes, ALTER TABLE wallets ADD COLUMN monitor_incoming; INCOMING_TX_STATUSES used in CHECK constraint |
| `packages/daemon/src/infrastructure/database/schema.ts` | Drizzle incomingTransactions + incomingTxCursors + wallets.monitorIncoming | VERIFIED | incomingTransactions table at line 436 (13 cols, 5 indexes including uniqueIndex, 2 CHECK constraints using CHAIN_TYPES and INCOMING_TX_STATUSES); incomingTxCursors table at line 469 (6 cols); wallets.monitorIncoming at line 75 |
| `packages/daemon/src/infrastructure/database/index.ts` | Re-exports incomingTransactions and incomingTxCursors | VERIFIED | Lines 25-26 re-export both tables |
| `packages/daemon/src/__tests__/migration-chain.test.ts` | EXPECTED_INDEXES + ALL_TABLES updated; version assertions to 21 | VERIFIED | EXPECTED_INDEXES includes idx_incoming_tx_chain_network, idx_incoming_tx_detected_at, idx_incoming_tx_status, idx_incoming_tx_wallet_detected; ALL_TABLES includes incoming_transactions and incoming_tx_cursors; line 1005 asserts LATEST_SCHEMA_VERSION===21; 46 total test cases |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `IChainSubscriber.ts` | `chain-subscriber.types.ts` | `import type { IncomingTransaction }` | WIRED | Line 2: `import type { IncomingTransaction } from './chain-subscriber.types.js'` — IncomingTransaction used as onTransaction callback parameter type |
| `chain-subscriber.types.ts` | `enums/incoming-tx.ts` | `import type { IncomingTxStatus }` | WIRED | Line 2: `import type { IncomingTxStatus } from '../enums/incoming-tx.js'` — used in `status: IncomingTxStatus` field |
| `enums/incoming-tx.ts` | `schemas/incoming-transaction.schema.ts` | INCOMING_TX_STATUSES used in Zod enum (conceptual SSoT) | WIRED | Both define INCOMING_TX_STATUSES=['DETECTED','CONFIRMED']; schema imports IncomingTxStatusEnum from enums/index.ts at line 2 |
| `core/src/index.ts` | `interfaces/index.ts` | barrel re-export of IChainSubscriber + IncomingTransaction | WIRED | Lines 208-209 export `IncomingTransaction, IChainSubscriber` from `./interfaces/index.js` |
| `migrate.ts` | `@waiaas/core` | `import INCOMING_TX_STATUSES` for inList() CHECK constraints | WIRED | Line 37: `INCOMING_TX_STATUSES` imported from `@waiaas/core`; used at lines 266 and 1509 in CHECK constraint DDL |
| `schema.ts` | `@waiaas/core` | `import INCOMING_TX_STATUSES` for buildCheckSql() | WIRED | Line 43: `INCOMING_TX_STATUSES` imported from `@waiaas/core`; used at line 460 in check() constraint |
| `schema.ts (incomingTransactions.walletId)` | `schema.ts (wallets.id)` | `.references(() => wallets.id, { onDelete: 'cascade' })` | WIRED | Line 441: `references(() => wallets.id, { onDelete: 'cascade' })`; same pattern for incomingTxCursors at line 470 |
| `migrate.ts (pushSchema DDL)` | `migrate.ts (v21 migration)` | DDL structural equivalence | WIRED | Both produce identical schema (13-col incoming_transactions, 6-col incoming_tx_cursors, monitor_incoming column, 4 indexes); migration uses IF NOT EXISTS for idempotency |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SUB-01 | 224-01 | IChainSubscriber 6-method interface defined in @waiaas/core | SATISFIED | IChainSubscriber interface with subscribe/unsubscribe/subscribedWallets/connect/waitForDisconnect/destroy exported from @waiaas/core. Note: REQUIREMENTS.md text uses "subscribedAddresses" but design doc 76 (authoritative) and PLAN both specify "subscribedWallets" — implementation follows the design doc |
| STO-01 | 224-02 | DB v21 migration adds incoming_transactions table, incoming_tx_cursors table, and wallets.monitor_incoming column | SATISFIED | LATEST_SCHEMA_VERSION=21; v21 migration creates all 3 schema elements; migration chain test line 1005 asserts version 21 |

**Orphaned requirements:** None. Both phase 224 requirements (SUB-01, STO-01) are claimed by plans 224-01 and 224-02 respectively.

**Minor discrepancy noted:** REQUIREMENTS.md SUB-01 description uses "subscribedAddresses" but design doc 76 (authoritative source), the PLAN, RESEARCH.md, and the implementation all use "subscribedWallets". This is a documentation inaccuracy in REQUIREMENTS.md, not a functional gap.

---

## Anti-Patterns Found

None. All new files are substantive implementations with no TODO/FIXME/placeholder patterns. No empty return stubs.

---

## Human Verification Required

None. All success criteria are verifiable programmatically from the codebase.

---

## Commit Verification

All commits referenced in summaries exist in git log:

| Commit | Description |
|--------|-------------|
| `bd76428` | feat(224-01): add IChainSubscriber interface and IncomingTxStatus enum |
| `c40b0ba` | feat(224-01): add IncomingTransaction Zod schema and event types |
| `35de861` | feat(224-02): add DB v21 migration + pushSchema DDL for incoming TX monitoring |
| `f671e62` | feat(224-02): add Drizzle schema tables + update migration chain tests + re-exports |

---

## Summary

Phase 224 goal is fully achieved. All 4 ROADMAP success criteria are verified against actual codebase files.

**Plan 224-01 (Core Types):** All 5 new files are substantive and correctly wired:
- IChainSubscriber 6-method interface with JSDoc documentation
- IncomingTransaction interface (13 fields) and Zod schema SSoT
- IncomingTxStatus enum with INCOMING_TX_STATUSES const array for DB CHECK constraints
- IncomingTxEvent + IncomingTxSuspiciousEvent in WaiaasEventMap (7 total events)
- All new types barrel-exported from @waiaas/core's root index.ts

**Plan 224-02 (DB Migration):** All 4 modified files are substantive and correctly wired:
- LATEST_SCHEMA_VERSION=21 with v21 migration creating incoming_transactions, incoming_tx_cursors tables and wallets.monitor_incoming column
- INCOMING_TX_STATUSES imported from @waiaas/core (SSoT) for CHECK constraints in both migrate.ts and schema.ts
- Drizzle schema defines both tables with full FK references, indexes, and CHECK constraints
- 46 migration chain tests updated with 4 new indexes and 2 new tables; explicit version assertion at test line 1005

The type system and DB schema are in place. Downstream packages (adapter-solana, adapter-evm, daemon) can import IChainSubscriber and implement against these types. Test data can be inserted into incoming_transactions and incoming_tx_cursors via DB v21.

---

_Verified: 2026-02-22T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
