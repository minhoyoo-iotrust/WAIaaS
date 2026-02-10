---
phase: 50-api-solana-pipeline
plan: 02
subsystem: chain-adapter
tags: [solana, solana-kit, ed25519, rpc, chain-adapter, pipe-pattern]

# Dependency graph
requires:
  - phase: 48-core-types
    provides: "IChainAdapter interface, chain-adapter.types.ts, WAIaaSError, ChainType/NetworkType enums"
provides:
  - "SolanaAdapter class implementing IChainAdapter (10 methods)"
  - "@solana/kit 3.x functional pipe pattern for Solana transactions"
  - "Mock RPC test pattern for adapter unit tests"
affects: [50-04-transaction-pipeline, 51-integration-testing]

# Tech tracking
tech-stack:
  added: ["@solana/kit 6.0.1", "@solana-program/system 0.11.0"]
  patterns: ["@solana/kit functional pipe: createTransactionMessage -> setFeePayer -> appendInstruction -> setBlockhash -> compile", "createNoopSigner for building unsigned transactions", "signBytes with CryptoKey from createKeyPairFromBytes", "vi.hoisted mock for module-level factory mocks"]

key-files:
  created:
    - "packages/adapters/solana/src/adapter.ts"
    - "packages/adapters/solana/src/__tests__/solana-adapter.test.ts"
  modified:
    - "packages/adapters/solana/src/index.ts"
    - "packages/adapters/solana/package.json"

key-decisions:
  - "@solana/kit 6.0.1 (not 3.x as planned; @solana/kit versioning jumped to 6.x)"
  - "createNoopSigner for unsigned tx building (source in getTransferSolInstruction requires TransactionSigner)"
  - "getTransactionEncoder/Decoder pair (encoder encode-only, decoder decode-only)"
  - "createKeyPairFromBytes (64B) and createKeyPairFromPrivateKeyBytes (32B) for dual key format support"
  - "signBytes(privateKey CryptoKey, messageBytes) for raw Ed25519 signing"
  - "PKCS8 export for Ed25519 private keys in tests (Node.js rejects raw export for private keys)"

patterns-established:
  - "Solana RPC mock: vi.hoisted mockRpc + mockSend/mockSendReject helpers for method().send() chain"
  - "Solana adapter connect pattern: createSolanaRpc(url) stored as private _rpc, ensureConnected guard"
  - "Solana tx encode/decode: getTransactionEncoder().encode() + getTransactionDecoder().decode()"
  - "Solana tx signing: decode compiled -> signBytes(privateKey, messageBytes) -> spread signature -> re-encode"

# Metrics
duration: 14min
completed: 2026-02-10
---

# Phase 50 Plan 02: SolanaAdapter Summary

**SolanaAdapter with 10 IChainAdapter methods using @solana/kit 6.x functional pipe pattern, 17 tests with mock RPC**

## Performance

- **Duration:** 14 min
- **Started:** 2026-02-10T02:20:57Z
- **Completed:** 2026-02-10T02:34:40Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- SolanaAdapter class implementing all 10 IChainAdapter methods with @solana/kit 6.x
- Transaction build using functional pipe: createTransactionMessage -> setFeePayer -> appendInstruction -> setBlockhash -> compile
- Ed25519 signing via createKeyPairFromBytes + signBytes (supports both 64B and 32B key formats)
- 17 unit tests with mock RPC covering all methods, error handling, and not-connected guards

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @solana/kit and implement SolanaAdapter** - `02abc3d` (feat)
2. **Task 2: SolanaAdapter unit tests with mock RPC** - `1b30761` (test)

## Files Created/Modified

- `packages/adapters/solana/src/adapter.ts` - SolanaAdapter class (10 IChainAdapter methods)
- `packages/adapters/solana/src/__tests__/solana-adapter.test.ts` - 17 unit tests with mock RPC
- `packages/adapters/solana/src/index.ts` - Re-export SolanaAdapter
- `packages/adapters/solana/package.json` - Added @solana/kit, @solana-program/system dependencies

## Decisions Made

1. **@solana/kit 6.0.1 (not 3.x):** The plan referenced @solana/kit 3.x, but the actual published version is 6.0.1. The API is functionally identical to what the plan described -- the version numbering simply differs.

2. **createNoopSigner for unsigned tx building:** The `getTransferSolInstruction` requires a `TransactionSigner` for the `source` parameter (not just an `Address`). Used `createNoopSigner(fromAddress)` to build unsigned transactions, with real signing deferred to `signTransaction()`.

3. **Separate encoder/decoder:** The `getTransactionEncoder()` is encode-only and `getTransactionDecoder()` is decode-only. Used the pair instead of `getTransactionCodec()` for explicit clarity.

4. **PKCS8 key export in tests:** Node.js WebCrypto does not support `exportKey('raw', ed25519PrivateKey)`. Used PKCS8 format and extracted the last 32 bytes (the Ed25519 seed) for test fixtures.

5. **vi.hoisted mock pattern:** Vitest hoists `vi.mock()` calls above all other code. Used `vi.hoisted()` to declare the mock RPC object before the mock factory runs, avoiding the "Cannot access before initialization" error.

## Deviations from Plan

None -- plan executed exactly as written. The @solana/kit version difference (6.x vs planned 3.x) is a naming discrepancy, not a functional deviation. All 10 IChainAdapter methods implemented as specified.

## Issues Encountered

1. **@solana/kit version:** Plan referenced 3.x but actual version is 6.0.1. API surface matches plan descriptions. No code changes needed.

2. **TransactionSigner type requirement:** `getTransferSolInstruction({ source })` requires `TransactionSigner`, not `Address`. Solved with `createNoopSigner()` from @solana/kit.

3. **Ed25519 private key export:** Node.js WebCrypto rejects `exportKey('raw')` for Ed25519 private keys. Used PKCS8 export + slice(-32) for test fixtures.

4. **Vitest mock hoisting:** `vi.mock()` factory cannot reference variables declared after it due to hoisting. Solved with `vi.hoisted()` pattern.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- SolanaAdapter ready for integration with transaction pipeline (Plan 50-04)
- Mock RPC pattern established for future adapter tests
- @solana/kit API verified and working in Node.js 22 ESM environment
- No blockers for downstream plans

## Self-Check: PASSED

---
*Phase: 50-api-solana-pipeline*
*Completed: 2026-02-10*
