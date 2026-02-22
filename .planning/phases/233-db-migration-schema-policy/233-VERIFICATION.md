---
phase: 233-db-migration-schema-policy
verified: 2026-02-22T05:00:00Z
status: passed
score: 10/10 must-haves verified
re_verification: false
---

# Phase 233: DB Migration + Schema + Policy Verification Report

**Phase Goal:** token_registry DB 테이블에 CAIP-19 asset_id가 저장되고, 트랜잭션 요청과 정책 규칙이 assetId 필드를 지원하여, 동일 주소의 다른 체인 토큰을 정책 수준에서 구분할 수 있는 상태
**Verified:** 2026-02-22T05:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                  | Status     | Evidence                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | DB v22 migration adds asset_id TEXT column to token_registry                                           | ✓ VERIFIED | `migrate.ts` L1547-1576: `version: 22`, `ALTER TABLE token_registry ADD COLUMN asset_id TEXT` with PRAGMA guard     |
| 2   | Existing token_registry records have correct CAIP-19 asset_id backfilled via tokenAssetId()           | ✓ VERIFIED | `migrate.ts` L1560-1576: app-level backfill loop using `tokenAssetId(row.network, row.address)` with error handling  |
| 3   | GET /v1/tokens response includes assetId field for each token                                          | ✓ VERIFIED | `tokens.ts` L141: `assetId: t.assetId ?? null` in response mapping                                                  |
| 4   | Fresh DB DDL includes asset_id column and LATEST_SCHEMA_VERSION is 22                                  | ✓ VERIFIED | `migrate.ts` L58: `LATEST_SCHEMA_VERSION = 22`; L205: `asset_id TEXT` in CREATE TABLE                               |
| 5   | Drizzle schema tokenRegistry table includes assetId column                                             | ✓ VERIFIED | `schema.ts` L342: `assetId: text('asset_id')`                                                                       |
| 6   | All 7 migration/schema test files assert LATEST_SCHEMA_VERSION === 22                                  | ✓ VERIFIED | All 7 files confirmed: `toBe(22)` present, no remaining `toBe(21)` version assertions                                |
| 7   | v22 data-transformation test verifies correct CAIP-19 asset_id for known networks                     | ✓ VERIFIED | `migration-runner.test.ts` L1136-1227: 2 test cases; Ethereum eip155:1/erc20:…, Solana solana:5eykt4…/token:…       |
| 8   | TokenInfoSchema accepts optional assetId with superRefine cross-validation                             | ✓ VERIFIED | `transaction.schema.ts` L55-82: `TokenInfoBaseSchema` with `assetId: Caip19Schema.optional()` + `superRefine`       |
| 9   | TransactionParam.assetId propagated through pipeline for TOKEN_TRANSFER, APPROVE, BATCH                | ✓ VERIFIED | `stages.ts` L184: `assetId?: string` in interface; L205, L227, L354: extraction in all 3 switch cases               |
| 10  | ALLOWED_TOKENS policy evaluates 4 assetId/address scenarios with EVM lowercase normalization           | ✓ VERIFIED | `database-policy-engine.ts` L889-959: all 4 scenarios with `parseCaip19` try/catch; `toLowerCase()` in scenarios 2-4 |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact                                                                                    | Provides                                              | Status     | Details                                                                |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| `packages/daemon/src/infrastructure/database/migrate.ts`                                    | v22 migration + DDL asset_id + LATEST_SCHEMA_VERSION  | ✓ VERIFIED | L58: version=22; L205: DDL; L1547-1576: migration; L1555: PRAGMA guard |
| `packages/daemon/src/infrastructure/database/schema.ts`                                     | Drizzle tokenRegistry.assetId column                  | ✓ VERIFIED | L342: `assetId: text('asset_id')`                                      |
| `packages/daemon/src/infrastructure/token-registry/token-registry-service.ts`               | RegistryToken.assetId + getTokensForNetwork assetId   | ✓ VERIFIED | L21: interface; L46-66: builtin on-the-fly + custom DB fallback        |
| `packages/daemon/src/api/routes/openapi-schemas.ts`                                         | TokenRegistryItemSchema with assetId                  | ✓ VERIFIED | L759: `assetId: z.string().nullable()`                                 |
| `packages/daemon/src/api/routes/tokens.ts`                                                  | GET /v1/tokens response mapping includes assetId      | ✓ VERIFIED | L141: `assetId: t.assetId ?? null`                                     |
| `packages/daemon/src/__tests__/migration-chain.test.ts`                                     | 4 assertions bumped to v22                            | ✓ VERIFIED | L1005, L1334, L1515, L1730: `toBe(22)`                                 |
| `packages/daemon/src/__tests__/migration-runner.test.ts`                                    | v22 assertions (3) + v22 data-transformation test     | ✓ VERIFIED | L67, L152, L446: `toBe(22)`; L1136-1227: describe block                |
| `packages/daemon/src/__tests__/schema-compatibility.test.ts`                                | LATEST_SCHEMA_VERSION is 22 assertion                 | ✓ VERIFIED | L453-454: `toBe(22)`                                                   |
| `packages/daemon/src/__tests__/migration-v14.test.ts`                                       | 3 assertions bumped to v22                            | ✓ VERIFIED | L245-246, L359: `toBe(22)`                                             |
| `packages/daemon/src/__tests__/migration-v6-v8.test.ts`                                     | LATEST_SCHEMA_VERSION = 22 assertion                  | ✓ VERIFIED | L522-523: `toBe(22)`                                                   |
| `packages/daemon/src/__tests__/settings-schema-migration.test.ts`                           | max_version and LATEST_SCHEMA_VERSION v22 assertions  | ✓ VERIFIED | L303, L306-307: `toBe(22)`                                             |
| `packages/daemon/src/__tests__/signing-sdk-migration.test.ts`                               | LATEST_SCHEMA_VERSION + getMaxVersion() v22 assertions | ✓ VERIFIED | L67, L78: `toBe(22)`                                                   |
| `packages/core/src/schemas/transaction.schema.ts`                                           | TokenInfoSchema assetId + superRefine cross-validation | ✓ VERIFIED | L55-82: base schema + superRefine; L5: imports Caip19Schema, parseCaip19 |
| `packages/daemon/src/pipeline/stages.ts`                                                    | TransactionParam.assetId + buildTransactionParam      | ✓ VERIFIED | L184: interface; L205, L227, L354: extraction                          |
| `packages/core/src/schemas/policy.schema.ts`                                                | AllowedTokensRulesSchema with optional assetId        | ✓ VERIFIED | L4: Caip19Schema import; L29: `assetId: Caip19Schema.optional()`       |
| `packages/daemon/src/pipeline/database-policy-engine.ts`                                    | 4-scenario evaluateAllowedTokens + parseCaip19        | ✓ VERIFIED | L38: parseCaip19 import; L69: AllowedTokensRules; L889-959: 4 scenarios |

### Key Link Verification

| From                              | To                              | Via                                        | Status     | Details                                        |
| --------------------------------- | ------------------------------- | ------------------------------------------ | ---------- | ---------------------------------------------- |
| `migrate.ts`                      | `@waiaas/core tokenAssetId()`   | import for CAIP-19 backfill generation     | ✓ WIRED    | L38-41: import; L1573: `tokenAssetId(row.network, row.address)` |
| `token-registry-service.ts`       | `schema.ts`                     | Drizzle select reads assetId column        | ✓ WIRED    | L54: `row.assetId` used in custom merge loop   |
| `tokens.ts`                       | `token-registry-service.ts`     | getTokensForNetwork returns RegistryToken  | ✓ WIRED    | L141: `t.assetId ?? null` in response          |
| `transaction.schema.ts`           | `@waiaas/core caip/caip19.ts`   | imports Caip19Schema and parseCaip19       | ✓ WIRED    | L5: `import { Caip19Schema, parseCaip19 }`; L59: `Caip19Schema.optional()` |
| `stages.ts`                       | `transaction.schema.ts`         | TokenTransferRequest/ApproveRequest carry assetId | ✓ WIRED | L198, L220: typed cast includes `assetId?`; L205, L227: extraction |
| `policy.schema.ts`                | `@waiaas/core caip/caip19.ts`   | imports Caip19Schema for assetId validation | ✓ WIRED   | L4: `import { Caip19Schema }`; L29: `Caip19Schema.optional()` |
| `database-policy-engine.ts`       | `@waiaas/core parseCaip19()`    | address extraction in scenarios 2 and 3   | ✓ WIRED    | L38: import; L942, L952: `parseCaip19(...)` with try/catch |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                    | Status      | Evidence                                                     |
| ----------- | ----------- | ------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------ |
| TOKN-02     | 233-01      | token_registry DB table has asset_id TEXT column added via incremental migration (v22) | ✓ SATISFIED | `migrate.ts` L1547: `version: 22`, DDL L205: `asset_id TEXT` |
| TOKN-03     | 233-01      | Existing token_registry records are auto-populated with correct CAIP-19 asset_id | ✓ SATISFIED | `migrate.ts` L1560-1576: backfill loop; test at migration-runner L1184-1210 |
| TOKN-04     | 233-01      | Token API responses include assetId field for all token registry entries        | ✓ SATISFIED | `tokens.ts` L141; `openapi-schemas.ts` L759                  |
| TXSC-01     | 233-02      | Transaction request schemas (TokenInfoSchema) accept optional assetId field     | ✓ SATISFIED | `transaction.schema.ts` L59: `assetId: Caip19Schema.optional()` |
| TXSC-02     | 233-02      | When assetId is provided, address extracted and cross-validated against assetId  | ✓ SATISFIED | `transaction.schema.ts` L63-82: superRefine with parseCaip19 + toLowerCase |
| TXSC-03     | 233-02      | Existing transactions without assetId continue to work identically              | ✓ SATISFIED | L64: `if (!data.assetId) return` skips validation entirely   |
| PLCY-01     | 233-03      | ALLOWED_TOKENS policy rules accept optional assetId per token entry             | ✓ SATISFIED | `policy.schema.ts` L29: `assetId: Caip19Schema.optional()`   |
| PLCY-02     | 233-03      | Policy evaluation with assetId compares chain+network+address via CAIP-19      | ✓ SATISFIED | `database-policy-engine.ts` L933-936: Scenario 1 exact CAIP-19 match |
| PLCY-03     | 233-03      | 4-scenario policy matching works correctly                                      | ✓ SATISFIED | `database-policy-engine.ts` L889-959: all 4 scenarios implemented |
| PLCY-04     | 233-03      | EVM addresses normalized to lowercase for CAIP-19 comparison                   | ✓ SATISFIED | L942-944, L951-954: `toLowerCase()` in scenarios 2 and 3     |

All 10 requirements from plans 233-01, 233-02, 233-03 are covered and satisfied. No orphaned requirements detected for Phase 233 in REQUIREMENTS.md.

### Anti-Patterns Found

None. No TODOs, FIXMEs, placeholders, or stub return patterns detected in any of the 9 modified production files. All `return null` occurrences in `database-policy-engine.ts` are legitimate "no policy match" returns per the policy engine design contract.

### Human Verification Required

None required. All goal truths are verifiable programmatically via static analysis:

- DB schema and migration code is fully readable.
- API response mapping is explicit (`assetId: t.assetId ?? null`).
- Cross-validation logic is explicit (`superRefine` with parseCaip19).
- 4-scenario matching matrix is explicit with scenario comments.
- All 7 commit hashes from summaries confirmed present in git log.

### Gaps Summary

No gaps. All 10 observable truths verified, all 16 artifacts exist and are substantive, all 7 key links wired, all 10 requirements satisfied, no anti-patterns.

**Notable implementation decisions correctly implemented:**

1. PRAGMA table_info guard before `ALTER TABLE ADD COLUMN asset_id` prevents "duplicate column name" error on fresh-DDL databases — this is the correct pattern for idempotent migrations.
2. Test fixture migration versions in `migration-runner.test.ts` and `signing-sdk-migration.test.ts` correctly bumped to 23/24/25 to avoid conflict with real v22 migration.
3. APPROVE case in `buildTransactionParam` now correctly includes `tokenAddress` (was missing before, fixed as part of this phase per 233-02-SUMMARY deviation log).
4. Cross-validation in `TokenInfoSchema.superRefine` correctly skips when `assetId` is absent, preserving full backward compatibility (TXSC-03).
5. All 4 policy matching scenarios handle parse failures gracefully via try/catch around `parseCaip19()`.

---

_Verified: 2026-02-22T05:00:00Z_
_Verifier: Claude (gsd-verifier)_
