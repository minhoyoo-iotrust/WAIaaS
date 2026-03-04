---
phase: 324-db-core-provider-model
plan: 01
subsystem: database
tags: [zod, drizzle, sqlite, aes-256-gcm, erc-4337, provider-mapping]

requires:
  - phase: 317-323
    provides: ERC-4337 smart account foundation (accountType, signerKey, deployed, entryPoint)
provides:
  - AA_PROVIDER_NAMES enum (pimlico/alchemy/custom) in @waiaas/core
  - AA_PROVIDER_CHAIN_MAP with 10 WAIaaS networkIds per provider
  - resolveProviderChainId + buildProviderBundlerUrl URL assembly
  - CreateWalletRequestSchema superRefine for smart account provider fields
  - WalletSchema with aaProvider, aaBundlerUrl, aaPaymasterUrl response fields
  - encryptProviderApiKey/decryptProviderApiKey AES-256-GCM crypto utility
  - DB migration v41 (4 provider columns on wallets table)
  - Drizzle schema with provider columns + CHECK constraint
affects: [324-02, 325, 326]

tech-stack:
  added: []
  patterns: [per-wallet-provider-model, aa-provider-chain-mapping, provider-api-key-crypto]

key-files:
  created:
    - packages/core/src/constants/aa-provider-chains.ts
    - packages/core/src/constants/index.ts
    - packages/daemon/src/infrastructure/smart-account/aa-provider-crypto.ts
    - packages/daemon/src/__tests__/aa-provider-chains.test.ts
    - packages/daemon/src/__tests__/aa-provider-crypto.test.ts
  modified:
    - packages/core/src/enums/wallet.ts
    - packages/core/src/enums/index.ts
    - packages/core/src/index.ts
    - packages/core/src/schemas/wallet.schema.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/__tests__/settings-schema-migration.test.ts
    - packages/daemon/src/__tests__/migration-runner.test.ts
    - packages/daemon/src/__tests__/migration-chain.test.ts

key-decisions:
  - "HKDF info string 'aa-provider-key-encryption' for separate subkey from settings-crypto"
  - "Pimlico/Alchemy use unified endpoint (bundler URL = paymaster URL)"
  - "CHECK constraint on aa_provider uses hardcoded strings in migration, SSoT array in Drizzle schema"

patterns-established:
  - "Per-wallet provider: each smart account wallet stores its own provider + encrypted API key"
  - "Chain mapping: resolveProviderChainId(provider, networkId) -> provider-specific chainId"
  - "URL building: buildProviderBundlerUrl(provider, chainId, apiKey) -> full URL"

requirements-completed: [PROV-01, PROV-02, PROV-03, PROV-04, CMAP-01, CMAP-02, CMAP-03]

duration: 10min
completed: 2026-03-05
---

# Phase 324 Plan 01: Core Enum + Chain Mapping + DB Migration v41 + API Key Crypto Summary

**AA provider data model with Zod enum, 10-network chain mapping, DB v41 migration, and AES-256-GCM API key encryption**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-04T15:03:33Z
- **Completed:** 2026-03-04T15:13:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- AA_PROVIDER_NAMES enum with pimlico/alchemy/custom exported from @waiaas/core
- Chain mapping table covering 10 EVM networks for both Pimlico and Alchemy providers
- CreateWalletRequestSchema extended with superRefine enforcing provider fields for smart accounts
- DB migration v41 adding 4 provider columns to wallets table with CHECK constraint
- AES-256-GCM encryption/decryption utility for provider API keys
- 30 new tests (25 chains/crypto + 5 migration)

## Task Commits

Each task was committed atomically:

1. **Task 1: Core enum + chain mapping + Zod schema + crypto utility** - `6a81ad77` (feat)
2. **Task 2: DB migration v41 + Drizzle schema for provider columns** - `e2394451` (feat)

## Files Created/Modified
- `packages/core/src/enums/wallet.ts` - Added AA_PROVIDER_NAMES, AaProviderName, AaProviderNameEnum
- `packages/core/src/constants/aa-provider-chains.ts` - Chain mapping table + URL builder + dashboard URLs
- `packages/core/src/constants/index.ts` - Re-exports for constants module
- `packages/core/src/schemas/wallet.schema.ts` - CreateWalletRequestSchema superRefine + WalletSchema provider fields
- `packages/daemon/src/infrastructure/smart-account/aa-provider-crypto.ts` - AES-256-GCM encrypt/decrypt
- `packages/daemon/src/infrastructure/database/migrate.ts` - v41 migration + fresh DB DDL
- `packages/daemon/src/infrastructure/database/schema.ts` - Drizzle columns + CHECK constraint

## Decisions Made
- Used separate HKDF info string ('aa-provider-key-encryption') to derive different subkey from settings-crypto
- Pimlico and Alchemy both use unified endpoint (bundler URL = paymaster URL with same API key)
- Migration CHECK constraint uses hardcoded strings (standard pattern), Drizzle schema uses SSoT array

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed chain type in test assertions**
- **Found during:** Task 1 (schema validation tests)
- **Issue:** Tests used `chain: 'evm'` but ChainTypeEnum expects `'ethereum'`
- **Fix:** Changed all test chain values to `'ethereum'`
- **Files modified:** packages/daemon/src/__tests__/aa-provider-chains.test.ts
- **Committed in:** 6a81ad77

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test data correction only. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Core data model ready for Plan 324-02 (provider resolver refactoring + settings cleanup)
- All enums, chain mappings, schemas, DB columns, and crypto utilities in place
- 324-02 can import from @waiaas/core and use the new DB columns

---
*Phase: 324-db-core-provider-model*
*Completed: 2026-03-05*
