# Technology Stack: DeFi Protocol Integration (m28-00 ~ m28-05)

**Project:** WAIaaS DeFi Action Providers
**Researched:** 2026-02-23
**Overall confidence:** HIGH

---

## Executive Summary

The DeFi protocol integration for WAIaaS requires **zero new npm dependencies**. All 5 milestones (Jupiter Swap, 0x Swap, LI.FI Bridge, Lido+Jito Staking, Gas Conditional Execution) can be implemented using the existing dependency set: `viem ^2.21.0` (locked 2.45.3), `@solana/kit ^6.0.1` (locked 6.0.1), `zod ^3.24.0` (locked 3.25.76), and Node.js 22 native `fetch`.

This is a deliberate architectural decision, not a constraint. Each DeFi protocol provides REST APIs that return calldata/instructions directly. The pattern is: native fetch -> Zod-validated response -> ContractCallRequest -> existing 6-stage pipeline. No protocol SDKs are needed.

---

## Recommended Stack (Additions Only)

### New Package

| Package | Location | Purpose | Why |
|---------|----------|---------|-----|
| @waiaas/actions | packages/actions/ | Built-in ActionProvider implementations | Separates DeFi protocol code from core/daemon. Selective inclusion. Same monorepo pattern as adapter-evm/adapter-solana |

### No New npm Dependencies

All DeFi providers use existing workspace dependencies only:

| Dependency | Already In | Version (locked) | Used For |
|------------|-----------|-------------------|----------|
| viem | adapter-evm, daemon | 2.45.3 | `encodeFunctionData()` for Lido ABI, `signTypedData()` for 0x Permit2 EIP-712 |
| @solana/kit | adapter-solana, daemon | 6.0.1 | Jito SPL Stake Pool raw instruction building |
| @solana-program/token | adapter-solana, daemon | 0.10.0 | Token account derivation for Jito staking |
| @solana-program/system | adapter-solana | 0.11.0 | SOL transfer instructions in Jito deposit |
| zod | daemon, core | 3.25.76 | Input/output schema validation for all API responses |
| Node.js 22 native fetch | runtime | built-in | Jupiter, 0x, LI.FI REST API calls + AbortController timeout |

**Confidence: HIGH** -- Verified against locked versions in pnpm-lock.yaml and existing package.json files.

---

## Protocol-Specific Stack Details

### 1. Jupiter Swap (m28-01) -- Solana DEX

| Item | Value | Confidence |
|------|-------|------------|
| API Base URL | `https://api.jup.ag/swap/v1` | HIGH -- verified via [dev.jup.ag](https://dev.jup.ag/docs/swap-api) |
| Quote Endpoint | `GET /swap/v1/quote?inputMint=&outputMint=&amount=&slippageBps=` | HIGH |
| Instructions Endpoint | `POST /swap/v1/swap-instructions` (body: `{ quoteResponse, userPublicKey }`) | HIGH |
| API Key | Optional (improves rate limits) | HIGH |
| Auth Header | `Authorization: Bearer <api_key>` (when key provided) | MEDIUM |
| Rate Limit | Unkeyed: limited; Keyed: higher (specific limits undocumented) | LOW |
| Response Validation | Zod schemas for QuoteResponse + SwapInstructionsResponse | HIGH |
| HTTP Client | `globalThis.fetch` + `AbortController` (10s timeout) | HIGH |
| Instruction Format | `swapInstruction`, `computeBudgetInstructions[]`, `setupInstructions[]`, `cleanupInstruction`, `addressLookupTableAddresses[]` | HIGH |

**Integration pattern:** fetch quote -> validate response -> fetch swap-instructions -> map instructions to ContractCallRequest (programId, instructionData, accounts) -> existing pipeline.

**No SDK needed.** Jupiter JS SDK (`@jup-ag/api`) adds ~2MB bundle and wraps the same REST endpoints. Native fetch is sufficient for 2 API calls.

### 2. 0x Swap (m28-02) -- EVM DEX Aggregator

| Item | Value | Confidence |
|------|-------|------------|
| API Base URL | `https://api.0x.org` (unified, all chains) | HIGH -- verified via [0x docs](https://0x.org/docs/upgrading/upgrading_to_swap_v2) |
| Version Header | `0x-version: v2` (required) | HIGH |
| API Key Header | `0x-api-key: <key>` (required) | HIGH |
| Chain Routing | `chainId` query parameter (not URL path) | HIGH |
| Price Endpoint | `GET /swap/permit2/price?chainId=&sellToken=&buyToken=&sellAmount=` | HIGH |
| Quote Endpoint | `GET /swap/permit2/quote?chainId=&sellToken=&buyToken=&sellAmount=&taker=` | HIGH |
| Permit2 Contract | `0x000000000022D473030F116dDEE9F6B43aC78BA3` (same on all chains) | HIGH |
| Slippage Unit | Decimal fraction (0.01 = 1%) via `slippagePercentage` param | HIGH |
| EIP-712 Signing | Quote response includes `permit2.eip712` object for signing | HIGH |
| Supported Chains | Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche, Scroll, Linea, Blast, Mode, Mantle, Unichain, Berachain, Ink, Plasma, Sonic, Monad, Worldchain | HIGH |

**Integration pattern:** fetch price (indicative) -> fetch quote (executable) -> sign Permit2 EIP-712 with `viem.signTypedData()` -> append signature to calldata -> ContractCallRequest (to, data, value) -> pipeline.

**Critical: Permit2 EIP-712 signing.** The 0x v2 Permit2 flow requires signing an EIP-712 typed data message from the quote response, then appending the signature to the transaction calldata. viem 2.x already provides `signTypedData()` which handles this natively. No additional library needed.

**Permit2 approval flow:** First ERC-20 swap requires a separate `approve()` transaction to the Permit2 contract. This runs as an independent pipeline execution (APPROVE type) before the swap pipeline. Subsequent swaps skip approval.

### 3. LI.FI Bridge (m28-03) -- Cross-chain

| Item | Value | Confidence |
|------|-------|------------|
| API Base URL | `https://li.quest/v1` | HIGH -- verified via [docs.li.fi](https://docs.li.fi/api-reference/introduction) |
| Quote Endpoint | `GET /v1/quote?fromChain=&toChain=&fromToken=&toToken=&fromAmount=&fromAddress=&slippage=` | HIGH |
| Status Endpoint | `GET /v1/status?txHash=&fromChain=` | HIGH |
| API Key | Optional (x-lifi-api-key header, improves rate limits) | HIGH |
| Solana Chain ID | `1151111081099710` | HIGH -- verified via [docs.li.fi/solana](https://docs.li.fi/li.fi-api/solana) |
| Solana SOL Address | `11111111111111111111111111111111` (System Program) | HIGH |
| Status Values | `PENDING`, `DONE`, `NOT_FOUND`, `INVALID`, `FAILED` | HIGH |
| Slippage Unit | Decimal fraction (0.03 = 3%) | HIGH |
| Timeout | 15 seconds for quote (cross-chain route calculation is slower) | MEDIUM |
| Solana Bridges | Mayan (Swift/CCTP/Wormhole), AllBridge (stablecoins) | HIGH |

**Integration pattern:** fetch quote (includes calldata + route) -> ContractCallRequest from source chain -> pipeline execution -> poll `/status` with txHash until DONE/FAILED/timeout.

**Async status tracking:** Bridge completion takes minutes to tens of minutes. Polling-based tracking via `GET /v1/status` with 30-second intervals. No webhooks needed (simpler for self-hosted daemon).

### 4a. Lido Staking (m28-04) -- ETH Liquid Staking

| Item | Value | Confidence |
|------|-------|------------|
| stETH Contract | `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` (Ethereum mainnet) | HIGH -- verified via [Etherscan](https://etherscan.io/address/0xae7ab96520de3a18e5e111b5eaab095312d7fe84) |
| Withdrawal Queue | `0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1` (Ethereum mainnet) | HIGH -- verified via [docs.lido.fi](https://docs.lido.fi/contracts/withdrawal-queue-erc721/) |
| Stake Function | `submit(address _referral) payable returns (uint256)` | HIGH -- verified via [Lido docs](https://docs.lido.fi/contracts/lido/) |
| Unstake Function | `requestWithdrawals(uint256[] amounts, address owner) returns (uint256[] requestIds)` | HIGH |
| ABI Encoding | `viem.encodeFunctionData({ abi, functionName: 'submit', args: [referralAddress] })` | HIGH |
| ETH Value | Passed as `value` field in ContractCallRequest (not in calldata) | HIGH |
| No External API | Direct contract call via ABI encoding. No REST API needed | HIGH |

**Integration pattern:** `encodeFunctionData()` with minimal ABI -> ContractCallRequest (to=stETH, data=encoded, value=stakeAmount) -> pipeline.

**ABI is trivially small.** Lido's `submit()` is a single payable function with one address parameter. The ABI can be hardcoded as a const array -- no ABI fetching or generation needed.

```typescript
// Entire Lido stake ABI needed
const LIDO_SUBMIT_ABI = [{
  name: 'submit',
  type: 'function',
  stateMutability: 'payable',
  inputs: [{ name: '_referral', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const;
```

### 4b. Jito Staking (m28-04) -- SOL Liquid Staking

| Item | Value | Confidence |
|------|-------|------------|
| SPL Stake Pool Program | `SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy` | HIGH -- verified via [Jito docs](https://www.jito.network/docs/stakenet/jito-steward/advanced/spl-stake-pool-internals/) |
| Jito Stake Pool Address | `Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb` | HIGH -- verified via [solanacompass](https://solanacompass.com/stake-pools/Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb) |
| JitoSOL Mint | `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn` | HIGH |
| Deposit Instruction | DepositSol -- 10 accounts + lamports_in (u64) | HIGH -- verified via [docs.rs](https://docs.rs/spl-stake-pool/latest/spl_stake_pool/instruction/fn.deposit_sol.html) |
| Instruction Building | Manual raw instruction encoding with @solana/kit | HIGH |
| @solana/spl-stake-pool | **DO NOT USE** -- depends on @solana/web3.js ^1.95.3, incompatible with @solana/kit 6.x | HIGH |

**Critical: @solana/spl-stake-pool is incompatible.** The npm package `@solana/spl-stake-pool@1.1.8` (last published 1+ year ago) depends on `@solana/web3.js ^1.95.3` (legacy v1). WAIaaS uses `@solana/kit ^6.0.1` (web3.js v2). These are **fundamentally incompatible** -- different address types, different transaction building APIs, different key types. There is no `@solana-program/stake-pool` package for @solana/kit yet.

**Solution: Manual instruction building.** Build DepositSol/WithdrawStake instructions manually:
1. Encode instruction discriminator (u8) + lamports (u64 LE)
2. Assemble 10 account metas (pool, withdraw auth, reserve, from, pool_tokens_to, fee, referrer, mint, token_program, system_program)
3. Derive PDAs (withdraw authority, associated token accounts)
4. Construct instruction with @solana/kit's `IInstruction` type

This approach is proven -- the Jito reference implementation demonstrates manual instruction building, and the project already builds raw Solana instructions in adapter-solana.

**DepositSol Account Layout (10 accounts):**

| # | Account | Writable | Signer | Description |
|---|---------|----------|--------|-------------|
| 0 | stakePool | W | - | Jito stake pool account |
| 1 | withdrawAuthority | - | - | PDA: seeds=['withdraw', stakePool], program=SPoo1 |
| 2 | reserveStake | W | - | Reserve stake account (from pool data) |
| 3 | fundingAccount | W | S | SOL source (wallet address) |
| 4 | poolTokensTo | W | - | JitoSOL destination ATA |
| 5 | managerFeeAccount | W | - | Manager fee token account (from pool data) |
| 6 | referrerPoolTokens | W | - | Referrer pool tokens (can be same as manager fee) |
| 7 | poolMint | W | - | JitoSOL mint address |
| 8 | systemProgram | - | - | System Program (11111...) |
| 9 | tokenProgram | - | - | SPL Token Program |

### 5. Gas Conditional Execution (m28-05)

| Item | Value | Confidence |
|------|-------|------------|
| EVM Gas Price | `eth_gasPrice` RPC method (returns baseFee + priorityFee) | HIGH |
| EVM Priority Fee | `eth_maxPriorityFeePerGas` RPC method | HIGH |
| Solana Priority Fee | `getRecentPrioritizationFees` RPC method | HIGH |
| No External API | Uses existing RPC endpoints via IChainAdapter | HIGH |
| Worker Pattern | `setTimeout` chain (not `setInterval`) for reliable scheduling | HIGH |
| DB State | GAS_WAITING status in transactions table (added in m28-03 migration) | HIGH |

**No new dependencies.** Gas condition evaluation uses existing RPC infrastructure. EVM gas prices come from `eth_gasPrice` / `eth_maxPriorityFeePerGas` via viem's publicClient. Solana priority fees come from `getRecentPrioritizationFees` via @solana/kit's RPC.

---

## Dependency Graph for @waiaas/actions

```
@waiaas/actions (NEW)
  +-- @waiaas/core (workspace:*)        # IActionProvider, ContractCallRequest, schemas
  +-- viem (^2.21.0)                    # Lido ABI encoding, 0x Permit2 EIP-712 signing
  +-- @solana/kit (^6.0.1)             # Jito raw instruction building
  +-- @solana-program/token (^0.10.0)  # Token account derivation (Jito JitoSOL ATA)
  +-- @solana-program/system (^0.11.0) # System program for SOL transfers
  +-- zod (^3.24.0)                    # API response schema validation
```

All dependencies already exist in the monorepo. No new packages to install.

---

## What NOT to Add

| Library | Why Reject |
|---------|-----------|
| `@jup-ag/api` | Jupiter REST API is 2 endpoints. SDK adds ~2MB, wraps same fetch calls, pins dependency versions |
| `@solana/spl-stake-pool` | Depends on @solana/web3.js v1 (legacy). Incompatible with @solana/kit v6. Last updated 1+ year ago |
| `@lifi/sdk` | LI.FI SDK is designed for frontend dApps with wallet adapters. Server-side needs only 2 REST endpoints (quote + status) |
| `@0xproject/swap-sdk` | No official 0x SDK for server-side. REST API is the intended integration path |
| Any gas oracle SDK (Blocknative, etc.) | RPC eth_gasPrice/eth_maxPriorityFeePerGas provides the same data without external dependency |
| `@lidofinance/lido-ethereum-sdk` | Lido SDK is for frontend wallet integration. Server-side only needs `submit()` ABI encoding (4 lines with viem) |
| `ethers` | Already using viem. Do not add a competing EVM library |

---

## packages/actions/ Package Configuration

### package.json

```json
{
  "name": "@waiaas/actions",
  "version": "2.6.0-rc.3",
  "description": "WAIaaS built-in DeFi Action Provider implementations",
  "license": "MIT",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "dependencies": {
    "@waiaas/core": "workspace:*",
    "@solana-program/system": "^0.11.0",
    "@solana-program/token": "^0.10.0",
    "@solana/kit": "^6.0.1",
    "viem": "^2.21.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^25.2.3"
  }
}
```

### tsconfig.json

Standard monorepo TypeScript config extending root, targeting ES2022, NodeNext module resolution.

---

## External API Authentication Summary

| Protocol | Auth Required | Method | Config Key |
|----------|--------------|--------|------------|
| Jupiter | No (optional for rate limits) | `Authorization: Bearer <key>` header | `actions.jupiter_swap.api_key` |
| 0x | **Yes** (mandatory) | `0x-api-key: <key>` header + `0x-version: v2` header | `actions.0x_swap.api_key` |
| LI.FI | No (optional for rate limits) | `x-lifi-api-key: <key>` header | `actions.lifi.api_key` |
| Lido | N/A (on-chain) | None | None |
| Jito | N/A (on-chain) | None | None |

**0x is the only protocol that requires an API key.** Free tier available at [dashboard.0x.org](https://dashboard.0x.org). The provider must validate key presence at initialization and provide a clear error message directing to Admin Settings if missing.

---

## Slippage Unit Conventions

| Protocol | Unit | Config Key | Default | Max |
|----------|------|------------|---------|-----|
| Jupiter | BPS (integer, 100 = 1%) | `default_slippage_bps` / `max_slippage_bps` | 50 (0.5%) | 500 (5%) |
| 0x | Percent (decimal, 0.01 = 1%) | `default_slippage_pct` / `max_slippage_pct` | 0.01 (1%) | 0.05 (5%) |
| LI.FI | Percent (decimal, 0.03 = 3%) | `default_slippage_pct` / `max_slippage_pct` | 0.03 (3%) | 0.05 (5%) |

Each config key uses the API-native unit to avoid conversion confusion. The key suffix (`_bps` vs `_pct`) makes the unit explicit.

---

## Contract/Program Addresses for CONTRACT_WHITELIST

These addresses must be registered in CONTRACT_WHITELIST for each protocol to function (default-deny policy):

| Protocol | Chain | Address | Description |
|----------|-------|---------|-------------|
| Jupiter | Solana | `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` | Jupiter Aggregator v6 program |
| 0x | All EVM | Per-chain ExchangeProxy (from quote response `to` field) | 0x Settlement contract |
| 0x | All EVM | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | Permit2 universal contract |
| LI.FI | EVM | Per-route contract (from quote response `transactionRequest.to`) | LI.FI diamond proxy |
| LI.FI | Solana | Per-route program (from quote response) | Bridge program |
| Lido | Ethereum | `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` | stETH / Lido contract |
| Lido | Ethereum | `0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1` | WithdrawalQueueERC721 |
| Jito | Solana | `SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy` | SPL Stake Pool program |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Jupiter integration | Native fetch | @jup-ag/api SDK | SDK wraps 2 REST endpoints, adds 2MB, pins versions. fetch is simpler and already used project-wide |
| 0x integration | Native fetch + viem signTypedData | @0x/swap SDK | No official server-side SDK. REST + viem EIP-712 is the documented integration path |
| LI.FI integration | Native fetch + polling | @lifi/sdk | SDK designed for frontend wallet adapters. Server needs only quote + status endpoints |
| Jito instruction building | Manual with @solana/kit | @solana/spl-stake-pool | spl-stake-pool depends on @solana/web3.js v1 (incompatible with @solana/kit v6). Last updated 1yr+ ago |
| Lido ABI encoding | viem encodeFunctionData | @lidofinance/lido-ethereum-sdk | SDK is for frontend. submit() is 1 function -- 4 lines of ABI encoding with viem |
| Gas oracle | RPC eth_gasPrice | Blocknative / EthGasStation | External dependency for data already available from RPC. Self-hosted principle |
| SOL DEX (alt to Jupiter) | Jupiter | Raydium | Jupiter aggregates Raydium + others. Single aggregator covers more liquidity |
| EVM DEX (alt to 0x) | 0x | 1inch | 0x: 19+ chains, Permit2, institutional-grade. 1inch: 9+ chains, Fusion (gasless) is nice but separate feature |
| Cross-chain (alt to LI.FI) | LI.FI | Socket / Bungee | LI.FI: 100+ bridges, 40+ chains, single API. Socket has fewer integrations |
| ETH staking (alt to Lido) | Lido | Rocket Pool | Lido: $35B TVL, stETH is DeFi standard. Rocket Pool: more decentralized but 10x less TVL |
| SOL staking (alt to Jito) | Jito | Marinade | Jito: largest SOL LST, MEV rewards. Marinade: good but smaller TVL |

---

## Installation (packages/actions/)

```bash
# No new packages to install -- all dependencies are already in the monorepo.
# Just create the package and reference workspace dependencies:

# 1. Create package directory
mkdir -p packages/actions/src/providers

# 2. Add to pnpm workspace (already included via packages/* glob)

# 3. Add workspace dependency in daemon:
# packages/daemon/package.json -> "@waiaas/actions": "workspace:*"

# 4. Turbo pipeline: add to turbo.json build dependencies
```

---

## Sources

### Verified (HIGH confidence)
- [Jupiter Swap API docs](https://dev.jup.ag/docs/swap-api) -- Quote + swap-instructions endpoints
- [Jupiter Quote endpoint](https://dev.jup.ag/docs/swap-api/get-quote) -- Parameters and response schema
- [0x Swap API v2 upgrade guide](https://0x.org/docs/upgrading/upgrading_to_swap_v2) -- v2 headers, chainId param, Permit2
- [0x Permit2 guide](https://0x.org/docs/0x-swap-api/guides/swap-tokens-with-0x-swap-api-permit2) -- EIP-712 signing flow
- [LI.FI API reference](https://docs.li.fi/api-reference/introduction) -- Base URL, auth, rate limits
- [LI.FI Solana integration](https://docs.li.fi/li.fi-api/solana) -- Chain ID, bridges, token addresses
- [LI.FI status tracking](https://docs.li.fi/introduction/user-flows-and-examples/status-tracking) -- Polling endpoint
- [Lido contract docs](https://docs.lido.fi/contracts/lido/) -- submit() function, contract address
- [Lido Withdrawal Queue](https://docs.lido.fi/contracts/withdrawal-queue-erc721/) -- requestWithdrawals(), address
- [Jito Stake Pool internals](https://www.jito.network/docs/stakenet/jito-steward/advanced/spl-stake-pool-internals/) -- SPL Stake Pool program
- [Jito reference implementation](https://github.com/jito-foundation/jito-stake-unstake-reference) -- DepositSol/WithdrawStake instruction building
- [SPL Stake Pool deposit_sol](https://docs.rs/spl-stake-pool/latest/spl_stake_pool/instruction/fn.deposit_sol.html) -- 10-account instruction spec
- [viem encodeFunctionData](https://viem.sh/docs/contract/encodeFunctionData.html) -- ABI encoding
- [viem signTypedData](https://viem.sh/docs/actions/wallet/signTypedData.html) -- EIP-712 signing
- Locked versions verified from pnpm-lock.yaml: viem@2.45.3, @solana/kit@6.0.1, zod@3.25.76

### Verified (MEDIUM confidence)
- Jupiter API key authentication method (documented but details sparse)
- 0x supported chains list (19+ confirmed, exact list may change)

### Needs Validation at Implementation Time
- Jupiter swap-instructions response exact field names (verify with live API call)
- 0x quote response `permit2.eip712` object structure (verify with testnet call)
- LI.FI Solana transaction format differences from EVM (verify with testnet)
