---
phase: 154-blockchain-3level
plan: 01
subsystem: adapter-solana
tags: [chain-test, mock-rpc, e2e, solana]
dependency-graph:
  requires: [solana-adapter, chain-error]
  provides: [level-1-mock-rpc-tests, level-2-e2e-tests]
  affects: [test-coverage, ci-pipeline]
tech-stack:
  added: []
  patterns: [vi.mock-rpc-pattern, describe.skipIf-validator, mock-rpc-transport-factory]
key-files:
  created:
    - packages/adapters/solana/src/__tests__/chain/helpers/mock-rpc-transport.ts
    - packages/adapters/solana/src/__tests__/chain/helpers/validator-setup.ts
    - packages/adapters/solana/src/__tests__/chain/mock-rpc.chain.test.ts
    - packages/adapters/solana/src/__tests__/chain/solana-local-validator.chain.test.ts
  modified: []
decisions:
  - "isValidAddress 미존재 -> address() 함수 직접 사용 및 adapter 메서드 통한 간접 검증"
  - "SolanaAdapter가 WAIaaSError로 래핑 (ChainError가 아닌) -> assertion 타입 맞춤"
  - "estimateFee는 priority fee RPC 조회 없이 DEFAULT_SOL_TRANSFER_FEE 반환 -> 시나리오 11 설계 반영"
  - "describe.skipIf(!validatorRunning) + it('...', { timeout }) vitest 4 호환 문법"
metrics:
  duration: 5min
  completed: 2026-02-16
  tasks: 2
  files: 4
  tests-added: 24
---

# Phase 154 Plan 01: Solana Mock RPC + Local Validator E2E Summary

Level 1 Mock RPC 13 scenarios (19 tests) + Level 2 Local Validator E2E 5 flows, zero external dependency with graceful skip.

## What Was Built

### Task 1: Mock RPC Transport Helper + Level 1 Mock RPC 13 Scenarios

**mock-rpc-transport.ts**: `createMockRpcConfig()` factory providing canned RPC responses in stateless (method-mapped) and stateful (queue-based) modes. Tracks all calls for assertion. Supports delay simulation for timeout scenarios.

**mock-rpc.chain.test.ts**: 19 tests across 13 scenarios covering every SolanaAdapter error path:

| # | Scenario | Tests | Key Assertion |
|---|----------|-------|---------------|
| 1 | SOL transfer full flow (success) | 1 | 6-step pipeline: connect -> build -> simulate -> sign -> submit -> confirm |
| 2 | Balance query (success) | 1 | BalanceInfo { balance: 5B, decimals: 9, symbol: SOL } |
| 3 | Fee estimation (success) | 1 | FeeEstimate { fee: 5000n } for native SOL |
| 4 | RPC connection failure | 2 | getHealth() returns healthy:false; ADAPTER_NOT_AVAILABLE guard |
| 5 | Insufficient balance | 1 | simulateTransaction returns success:false with InsufficientFundsForFee |
| 6 | Blockhash expired | 1 | WAIaaSError CHAIN_ERROR containing "Blockhash not found" |
| 7 | Invalid address | 3 | address() throws on invalid/empty/ETH format strings |
| 8 | Simulation failure (program error) | 1 | success:false with InstructionError |
| 9 | Transaction execution failure | 2 | confirmationStatus-based + sendTransaction RPC error |
| 10 | RPC timeout | 1 | WAIaaSError CHAIN_ERROR with timeout message |
| 11 | Priority fee fallback | 1 | Base fee 5000n without priority RPC query |
| 12 | Confirmation wait timeout | 2 | status: 'submitted' on null status + RPC error |
| 13 | Duplicate transaction | 1 | CHAIN_ERROR with "already processed" |

### Task 2: Level 2 Local Validator E2E 5 Flows

**validator-setup.ts**: `isValidatorRunning()` health check (fetch-based, max 5s polling) + `airdropSol()` with confirmation polling (max 15s).

**solana-local-validator.chain.test.ts**: 5 E2E flows on `solana-test-validator`:

| Flow | Description | Timeout |
|------|-------------|---------|
| E2E-1 | SOL transfer full pipeline (build -> simulate -> sign -> submit -> confirm) | 30s |
| E2E-2 | Balance query + fee estimation (10 SOL airdrop account) | 30s |
| E2E-3 | Address validation (valid/invalid via @solana/kit address()) | 30s |
| E2E-4 | Connection management (connect -> health -> disconnect lifecycle) | 30s |
| E2E-5 | Error recovery (zero-balance account simulation failure) | 30s |

`describe.skipIf(!validatorRunning)` ensures graceful skip in CI when no validator is running.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] isValidAddress method does not exist on SolanaAdapter**
- **Found during:** Task 1 (scenario #7) and Task 2 (E2E-3)
- **Issue:** Plan referenced `isValidAddress()` but IChainAdapter has no such method; SolanaAdapter uses `address()` from @solana/kit internally.
- **Fix:** Scenario #7 tests invalid address through `getBalance()` and `buildTransaction()` error paths. E2E-3 validates directly via `address()` function from @solana/kit.
- **Files modified:** mock-rpc.chain.test.ts, solana-local-validator.chain.test.ts

**2. [Rule 3 - Blocking] SolanaAdapter wraps all errors as WAIaaSError, not ChainError**
- **Found during:** Task 1 (all error scenarios)
- **Issue:** Plan expected ChainError assertions, but adapter.ts wraps errors as `new WAIaaSError('CHAIN_ERROR', {...})`. ChainError is only used in token/contract operations.
- **Fix:** All error assertions use `WAIaaSError` with `code === 'CHAIN_ERROR'` instead of ChainError class.
- **Files modified:** mock-rpc.chain.test.ts

**3. [Rule 3 - Blocking] estimateFee has no priority fee RPC query**
- **Found during:** Task 1 (scenario #11)
- **Issue:** Plan expected `getRecentPrioritizationFees` fallback behavior, but `estimateFee()` for native SOL simply returns `DEFAULT_SOL_TRANSFER_FEE` without any RPC call.
- **Fix:** Scenario #11 verifies the designed behavior: base fee 5000n returned without priority fee query.
- **Files modified:** mock-rpc.chain.test.ts

**4. [Rule 1 - Bug] it() third argument deprecated in Vitest 4**
- **Found during:** Task 2 (first E2E run)
- **Issue:** `it('name', callback, { timeout })` pattern triggers deprecation warning.
- **Fix:** Changed to `it('name', { timeout }, callback)` Vitest 4-compatible syntax.
- **Files modified:** solana-local-validator.chain.test.ts

## Verification Results

- `npx vitest run packages/adapters/solana/src/__tests__/chain/mock-rpc.chain.test.ts` -- 19 tests PASSED (2.04s)
- `npx vitest run packages/adapters/solana/src/__tests__/chain/solana-local-validator.chain.test.ts` -- 5 tests SKIPPED (no validator)
- `npx vitest run packages/adapters/solana/src/__tests__/chain/` -- 19 passed, 5 skipped (2.59s)
- `pnpm test:chain` (direct package) -- 19 passed, 8 skipped (includes pre-existing devnet test)

## Self-Check: PASSED

All 4 created files verified on disk. Commits ab79359 (Task 1) and 365b0b6 (Task 2) verified in git log.
