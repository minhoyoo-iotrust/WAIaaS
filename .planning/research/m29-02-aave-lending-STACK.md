# Technology Stack: Aave V3 EVM Lending + Lending Framework

**Project:** WAIaaS m29-02 EVM Lending (Aave V3)
**Researched:** 2026-02-26
**Overall confidence:** HIGH (verified via Aave official docs, aave-address-book GitHub, IPool.sol source, Etherscan ABI)

---

## Scope

This document covers ONLY the stack additions needed for:
1. Lending Framework (ILendingProvider, PositionTracker, HealthFactorMonitor, LendingPolicyEvaluator)
2. Aave V3 as the first Lending Provider implementation
3. REST API + MCP + Admin UI extensions

It does NOT re-cover existing validated capabilities (viem 2.x, EvmAdapter, IActionProvider, etc.).

---

## New npm Dependencies: 0

No new npm packages required. All Aave V3 interactions use manual ABI encoding in the actions package (following the Lido `lido-contract.ts` pattern), and viem `readContract` in the daemon package (where viem is already a dependency).

**Why NOT `@bgd-labs/aave-address-book` (v4.44.22):**
- 191 releases in 1 year = ~1 release every 2 days. Extremely high churn.
- Package exists solely to provide contract addresses. We only need 5 chains x 4 addresses = 20 constants.
- Adding a dependency for 20 hardcoded constants creates unnecessary update pressure.
- Aave V3 Pool proxy addresses have NOT changed since initial deployment (2023). They are immutable proxies with stable addresses.
- **Decision:** Hardcode addresses in `config.ts` (same pattern as `lido-staking/config.ts` and `zerox-swap/config.ts`).

**Why NOT `@aave/client` (v0.9.2):**
- peerDeps: `viem ^2.31.6` + `ethers ^6.14.4` + `thirdweb ^5.105.25`
- Adding ethers and thirdweb as peer dependencies for 4 ABI-encoded function calls is unacceptable
- WAIaaS uses viem exclusively; introducing ethers would create dual-library confusion

---

## Aave V3 Contract ABI Details

### IPool Interface Functions (6 needed)

Function signatures verified against [aave-v3-core IPool.sol](https://github.com/aave/aave-v3-core/blob/master/contracts/interfaces/IPool.sol):

#### Write Functions (4) -- encoded in @waiaas/actions

```typescript
// supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
// Selector: 0x617ba037
// Requires: prior ERC-20 approve(Pool, amount)
// Returns: void

// borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)
// Selector: 0xa415bcad
// interestRateMode: 2 = variable (ONLY option, stable rate deprecated since 2023 governance vote)
// Returns: void

// repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)
// Selector: 0x573ade81
// amount = type(uint256).max for full repayment
// Requires: prior ERC-20 approve(Pool, amount)
// Returns: uint256 (actual repaid amount)

// withdraw(address asset, uint256 amount, address to)
// Selector: 0x69328dec
// amount = type(uint256).max for full withdrawal
// Returns: uint256 (actual withdrawn amount)
```

#### Read Functions (2) -- called from @waiaas/daemon via viem

```typescript
// getUserAccountData(address user) -> (uint256, uint256, uint256, uint256, uint256, uint256)
// Selector: 0xbf92857c
// Returns: (totalCollateralBase, totalDebtBase, availableBorrowsBase,
//           currentLiquidationThreshold, ltv, healthFactor)
// All values in BASE_CURRENCY_UNIT (8 decimals for ETH-denominated protocols)
// healthFactor is scaled by 1e18 (e.g., 1.5 = 1500000000000000000)

// getReservesList() -> address[]
// Selector: 0xd1946dbc
// Returns: array of all reserve token addresses
```

### ABI Encoding Approach: Manual Hex Encoding (Lido Pattern)

**CRITICAL:** The `@waiaas/actions` package has only 2 dependencies: `@waiaas/core` and `zod`. It does NOT depend on viem. All existing action providers (Lido, Jito, 0x, LI.FI, Jupiter) use either:
1. Manual hex ABI encoding (Lido: `lido-contract.ts` with `padHex`, `addressToHex`, `uint256ToHex`)
2. REST API calldata (Jupiter, 0x, LI.FI: fetch pre-encoded calldata from external API)

Aave V3 must use approach #1 (manual hex encoding) because it interacts directly with on-chain contracts, not external APIs.

**Encoding utilities from Lido pattern (reusable):**

```typescript
// packages/actions/src/providers/aave-v3/aave-contracts.ts
// Same utility functions as lido-contract.ts

function padHex(value: string, length: number = 64): string {
  return value.padStart(length, '0');
}

function addressToHex(address: string): string {
  return padHex(address.slice(2).toLowerCase());
}

function uint256ToHex(value: bigint): string {
  if (value < 0n) throw new Error('uint256 cannot be negative');
  return padHex(value.toString(16));
}

function uint16ToHex(value: number): string {
  return padHex(value.toString(16));
}
```

**Encoding functions for Aave V3 Pool:**

```typescript
// supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
// Selector: 0x617ba037
export function encodeSupplyCalldata(
  asset: string, amount: bigint, onBehalfOf: string, referralCode: number = 0,
): string {
  const selector = '0x617ba037';
  return `${selector}${addressToHex(asset)}${uint256ToHex(amount)}${addressToHex(onBehalfOf)}${uint16ToHex(referralCode)}`;
}

// borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)
// Selector: 0xa415bcad
export function encodeBorrowCalldata(
  asset: string, amount: bigint, onBehalfOf: string,
): string {
  const selector = '0xa415bcad';
  const interestRateMode = 2n; // Variable rate (only option since stable deprecated)
  const referralCode = 0;
  return `${selector}${addressToHex(asset)}${uint256ToHex(amount)}${uint256ToHex(interestRateMode)}${uint16ToHex(referralCode)}${addressToHex(onBehalfOf)}`;
}

// repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)
// Selector: 0x573ade81
export function encodeRepayCalldata(
  asset: string, amount: bigint, onBehalfOf: string,
): string {
  const selector = '0x573ade81';
  const interestRateMode = 2n; // Variable rate
  return `${selector}${addressToHex(asset)}${uint256ToHex(amount)}${uint256ToHex(interestRateMode)}${addressToHex(onBehalfOf)}`;
}

// withdraw(address asset, uint256 amount, address to)
// Selector: 0x69328dec
export function encodeWithdrawCalldata(
  asset: string, amount: bigint, to: string,
): string {
  const selector = '0x69328dec';
  return `${selector}${addressToHex(asset)}${uint256ToHex(amount)}${addressToHex(to)}`;
}

// ERC-20 approve(address spender, uint256 amount) -- reuse from Lido
// Selector: 0x095ea7b3
export function encodeApproveCalldata(spender: string, amount: bigint): string {
  const selector = '0x095ea7b3';
  return `${selector}${addressToHex(spender)}${uint256ToHex(amount)}`;
}
```

**Note on uint16 padding:** The `referralCode` parameter in `supply` is `uint16`, but ABI encoding pads ALL types to 32 bytes. So `uint16ToHex(0)` should produce 64 hex chars of zeros, same as `uint256ToHex(0n)`. The `padHex` function handles this automatically.

**Alternative consideration: extract shared hex utilities.** Both Lido and Aave need `padHex`, `addressToHex`, `uint256ToHex`, `encodeApproveCalldata`. Consider extracting these to `packages/actions/src/common/abi-encode.ts` to avoid duplication. This is a minor refactoring decision for the implementation phase.

### Read Function ABI (daemon-side, viem)

Read functions (`getUserAccountData`, `getReservesList`) are called from `@waiaas/daemon` where viem IS a dependency. Use viem's type-safe `readContract`:

```typescript
// packages/daemon/src/services/defi/aave-pool-abi.ts (daemon-side only)
// Full ABI needed for viem readContract type inference

export const AAVE_V3_POOL_READ_ABI = [
  {
    type: 'function',
    name: 'getUserAccountData',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getReservesList',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
  },
] as const;
```

### ERC-20 Approve Pattern

Supply and repay require prior ERC-20 approve. The LidoStakingActionProvider already handles this exact pattern (approve + action as `ContractCallRequest[]`):

```typescript
// Pattern from lido-staking/index.ts lines 145-174
async resolve(actionName: string, params: Record<string, unknown>, context: ActionContext) {
  if (actionName === 'supply') {
    return [
      { type: 'CONTRACT_CALL', to: asset, calldata: encodeApproveCalldata(pool, amount), value: '0' },
      { type: 'CONTRACT_CALL', to: pool, calldata: encodeSupplyCalldata(asset, amount, wallet), value: '0' },
    ];
  }
}
```

The pipeline already handles `ContractCallRequest[]` (sequential execution with approve-first ordering).

---

## Chain-Specific Contract Addresses

### Aave V3 Pool Addresses (5 supported EVM networks)

Verified from [aave-address-book GitHub](https://github.com/bgd-labs/aave-address-book/) TypeScript source files:

| Network | Chain ID | Pool | PoolAddressesProvider | DataProvider | Oracle |
|---------|----------|------|----------------------|--------------|--------|
| Ethereum | 1 | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` | `0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e` | `0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD` | `0x54586bE62E3c3580375aE3723C145253060Ca0C2` |
| Polygon | 137 | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb` | `0x243Aa95cAC2a25651eda86e80bEe66114413c43b` | `0xb023e699F5a33916Ea823A16485e259257cA8Bd1` |
| Arbitrum | 42161 | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb` | `0x243Aa95cAC2a25651eda86e80bEe66114413c43b` | `0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7` |
| Optimism | 10 | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | `0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb` | `0x243Aa95cAC2a25651eda86e80bEe66114413c43b` | `0xD81eb3728a631871a7eBBaD631b5f424909f0c77` |
| Base | 8453 | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` | `0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D` | `0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A` | `0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156` |

**Confidence:** HIGH -- addresses verified from bgd-labs/aave-address-book TypeScript files (AaveV3Ethereum.ts, AaveV3Polygon.ts, AaveV3Arbitrum.ts, AaveV3Optimism.ts, AaveV3Base.ts).

**Key observations:**
- Polygon, Arbitrum, Optimism share Pool address `0x794a...814aD` (CREATE2 deployment)
- Polygon, Arbitrum, Optimism share PoolAddressesProvider `0xa976...3CDb` and DataProvider `0x243A...c43b`
- Ethereum and Base have unique addresses across all contracts
- Oracle addresses are chain-unique (different Chainlink feeds per chain)

### Address Registry Pattern

Follow `zerox-swap/config.ts` CHAIN_ID_MAP + `lido-staking/config.ts` address constant pattern:

```typescript
// packages/actions/src/providers/aave-v3/config.ts

export interface AaveV3Addresses {
  pool: string;
  poolAddressesProvider: string;
  dataProvider: string;
  oracle: string;
}

export interface AaveV3Config {
  enabled: boolean;
  healthFactorWarningThreshold: number;  // Default 1.2
  positionSyncIntervalSec: number;       // Default 300 (5min)
  maxLtvPct: number;                     // Default 0.8 (80%)
}

export const AAVE_V3_DEFAULTS: AaveV3Config = {
  enabled: false,
  healthFactorWarningThreshold: 1.2,
  positionSyncIntervalSec: 300,
  maxLtvPct: 0.8,
};

/** Aave V3 contract addresses per chain ID. Verified from aave-address-book. */
export const AAVE_V3_ADDRESSES: ReadonlyMap<number, AaveV3Addresses> = new Map([
  [1, {  // Ethereum
    pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    poolAddressesProvider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
    dataProvider: '0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD',
    oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
  }],
  [137, {  // Polygon
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    dataProvider: '0x243Aa95cAC2a25651eda86e80bEe66114413c43b',
    oracle: '0xb023e699F5a33916Ea823A16485e259257cA8Bd1',
  }],
  [42161, {  // Arbitrum
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    dataProvider: '0x243Aa95cAC2a25651eda86e80bEe66114413c43b',
    oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
  }],
  [10, {  // Optimism
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    dataProvider: '0x243Aa95cAC2a25651eda86e80bEe66114413c43b',
    oracle: '0xD81eb3728a631871a7eBBaD631b5f424909f0c77',
  }],
  [8453, {  // Base
    pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    poolAddressesProvider: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D',
    dataProvider: '0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A',
    oracle: '0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156',
  }],
]);

/** Maps WAIaaS network names to chain IDs (same pattern as zerox-swap/config.ts). */
export const AAVE_NETWORK_TO_CHAIN_ID: Record<string, number> = {
  'ethereum-mainnet': 1,
  'polygon-mainnet': 137,
  'arbitrum-mainnet': 42161,
  'optimism-mainnet': 10,
  'base-mainnet': 8453,
};

/** Get Aave V3 addresses for a WAIaaS network name. */
export function getAaveAddresses(network: string): AaveV3Addresses {
  const chainId = AAVE_NETWORK_TO_CHAIN_ID[network];
  if (!chainId) {
    throw new Error(`Unsupported network for Aave V3: ${network}. Supported: ${Object.keys(AAVE_NETWORK_TO_CHAIN_ID).join(', ')}`);
  }
  const addresses = AAVE_V3_ADDRESSES.get(chainId);
  if (!addresses) {
    throw new Error(`No Aave V3 addresses for chain ID ${chainId}`);
  }
  return addresses;
}
```

### Admin Settings Override

Users can override Pool address per network (for custom deployments or Aave V3.1 upgrades):

```
actions.aave_v3_pool_address_ethereum       (empty = use default)
actions.aave_v3_pool_address_polygon        (empty = use default)
actions.aave_v3_pool_address_arbitrum       (empty = use default)
actions.aave_v3_pool_address_optimism       (empty = use default)
actions.aave_v3_pool_address_base           (empty = use default)
```

Same pattern as `actions.lido_staking_steth_address` (empty string falls back to environment default).

---

## Health Factor Calculation

### On-chain Source: `getUserAccountData`

The single most important read function. One call returns everything needed for health factor:

```
getUserAccountData(userAddress) returns:
  totalCollateralBase:            uint256  // Total collateral in BASE_CURRENCY (8 decimals)
  totalDebtBase:                  uint256  // Total debt in BASE_CURRENCY
  availableBorrowsBase:           uint256  // Remaining borrowing capacity
  currentLiquidationThreshold:    uint256  // Weighted avg liquidation threshold (basis points, e.g., 8250 = 82.5%)
  ltv:                            uint256  // Weighted avg LTV (basis points, e.g., 8000 = 80%)
  healthFactor:                   uint256  // 1e18 scaled (1.0 = 1000000000000000000)
```

**Health Factor formula (Aave computes on-chain):**
```
healthFactor = (totalCollateralBase * weightedLiquidationThreshold) / totalDebtBase
```

- healthFactor > 1.0: safe (no liquidation risk)
- healthFactor = 1.0: liquidatable
- healthFactor < 1.0: will be liquidated
- No debt (totalDebtBase = 0): healthFactor = type(uint256).max (effectively infinity -> map to null)

**For HealthFactorMonitor (daemon-side):**
```typescript
// Parse getUserAccountData response via viem readContract (daemon has viem)
const result = await publicClient.readContract({
  address: poolAddress as `0x${string}`,
  abi: AAVE_V3_POOL_READ_ABI,
  functionName: 'getUserAccountData',
  args: [walletAddress as `0x${string}`],
});

const [totalCollateralBase, totalDebtBase, , , , rawHealthFactor] = result;

// Convert from uint256 (1e18 scale) to JavaScript number
const MAX_UINT256 = 2n ** 256n - 1n;
const healthFactor = rawHealthFactor === MAX_UINT256
  ? null  // No debt -> health factor is null (not Infinity)
  : Number(rawHealthFactor) / 1e18;
// e.g., 1500000000000000000n -> 1.5

// Severity determination (from m29-00 design):
// >= 2.0 -> SAFE (5min poll)
// >= 1.5 -> WARNING (1min poll)
// >= 1.2 -> DANGER (15s poll)
// < 1.2  -> CRITICAL (5s poll)
```

### APY Calculation

Aave V3 stores interest rates in "ray" units (10^27). APY is derived from the per-second compounding rate:

```typescript
const SECONDS_PER_YEAR = 31_536_000;
const RAY = 10n ** 27n;

// Supply APY (from reserve.currentLiquidityRate):
function calculateApy(rateRay: bigint): number {
  const ratePerSecond = Number(rateRay) / Number(RAY) / SECONDS_PER_YEAR;
  return Math.pow(1 + ratePerSecond, SECONDS_PER_YEAR) - 1;
}
// e.g., currentLiquidityRate = 32000000000000000000000000n -> ~3.2% APY
```

### LTV and Liquidation Threshold

From `getUserAccountData`:
- `ltv` is in basis points (1/100th of a percent): 8000 = 80% max LTV
- `currentLiquidationThreshold` is in basis points: 8250 = 82.5% liquidation threshold
- These are weighted averages across all supplied assets

**For LendingPolicyEvaluator:**
```
projectedLtv = (currentDebtUsd + newBorrowAmountUsd) / totalCollateralUsd
if projectedLtv > config.maxLtvPct -> DENY
if projectedLtv > config.warningLtv -> upgrade to DELAY tier
```

---

## Position Tracking DB Schema

### defi_positions Table (from m29-00 design DEFI-13)

The schema is already fully designed in m29-00. Key points for implementation:

```sql
CREATE TABLE IF NOT EXISTS defi_positions (
  id TEXT PRIMARY KEY,                          -- UUID v7
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  category TEXT NOT NULL,                       -- 'LENDING' (initially)
  provider TEXT NOT NULL,                       -- 'aave_v3'
  chain TEXT NOT NULL,                          -- 'evm'
  network TEXT,                                 -- 'ethereum-mainnet', etc.
  asset_id TEXT,                                -- CAIP-19 identifier
  amount TEXT NOT NULL,                         -- Decimal string
  amount_usd REAL,                              -- USD from IPriceOracle
  metadata TEXT,                                -- JSON (LendingMetadata)
  status TEXT NOT NULL DEFAULT 'ACTIVE',        -- ACTIVE | CLOSED | LIQUIDATED
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  last_synced_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 4 indexes (designed in m29-00 section 5.1)
CREATE INDEX idx_defi_positions_wallet_category ON defi_positions(wallet_id, category);
CREATE INDEX idx_defi_positions_wallet_provider ON defi_positions(wallet_id, provider);
CREATE INDEX idx_defi_positions_status ON defi_positions(status);
CREATE UNIQUE INDEX idx_defi_positions_unique ON defi_positions(wallet_id, provider, asset_id, category);

-- 4 CHECK constraints (from SSoT arrays)
CHECK(category IN ('LENDING', 'YIELD', 'PERP', 'STAKING'))
CHECK(status IN ('ACTIVE', 'CLOSED', 'LIQUIDATED'))
CHECK(chain IN ('solana', 'evm'))
```

### LendingMetadata JSON Schema

Stored in the `metadata` TEXT column (from m29-00 LendingMetadataSchema):

```typescript
{
  positionType: 'SUPPLY' | 'BORROW',
  apy: number | null,           // e.g., 0.032 = 3.2%
  healthFactor: number | null,  // e.g., 1.5 (account-level, same for all positions)
  collateralUsd: number | null, // Total collateral USD
  debtUsd: number | null,       // Total debt USD
}
```

### Migration Sequencing

Current DB version: v22 (CAIP-19 asset_id from v27.2).
New migration: defi_positions table = migration v23.
Follow existing `pushSchema` 3-step pattern (tables -> migrations -> indexes).

---

## Recommended Stack Summary

### Core Framework (Unchanged)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| viem | ^2.21.0 (existing, in daemon) | RPC reads for health factor + position sync | `readContract` for `getUserAccountData`, `getReservesList` |
| Drizzle ORM | existing (in daemon) | defi_positions table | Schema migration; existing pushSchema + buildCheckSql patterns |
| Zod | ^3.24.0 (existing, in actions+core) | Input schemas + metadata validation | LendingMetadataSchema, HealthFactorSchema from m29-00 design |
| EventBus | existing (in daemon) | HealthFactorMonitor timer events | Follows BalanceMonitorService polling pattern |

### New Components (No New Dependencies)

| Component | Package | Integration Point |
|-----------|---------|-------------------|
| AaveV3LendingProvider | @waiaas/actions | ILendingProvider -> ActionProviderRegistry |
| aave-contracts.ts | @waiaas/actions | Manual ABI encode functions (Lido pattern) |
| config.ts | @waiaas/actions | AaveV3Config + AAVE_V3_ADDRESSES map (5 chains) |
| schemas.ts | @waiaas/actions | Supply/Borrow/Repay/Withdraw input Zod schemas |
| ILendingProvider | @waiaas/core | Interface extending IActionProvider |
| POSITION_CATEGORIES/STATUSES | @waiaas/core | SSoT enums for defi_positions |
| PositionTracker | @waiaas/daemon | Service: 5-min sync, upsert defi_positions |
| HealthFactorMonitor | @waiaas/daemon | Adaptive polling (5s-5min), LIQUIDATION_WARNING |
| LendingPolicyEvaluator | @waiaas/daemon | PolicyEngine step 4h (LTV limit + asset whitelist) |
| defi_positions | @waiaas/daemon/db | Drizzle table + migration v23 |
| aave-pool-abi.ts | @waiaas/daemon | viem ABI for readContract (getUserAccountData) |

### Supporting Libraries (All Existing)

| Library | Version | Purpose | When Used |
|---------|---------|---------|-----------|
| viem/readContract | ^2.21.0 | getUserAccountData RPC | PositionTracker.sync() in daemon |
| IPriceOracle (existing) | - | USD conversion for positions | amount_usd in defi_positions |
| NotificationService (existing) | - | LIQUIDATION_WARNING alerts | HealthFactorMonitor -> notification |
| ActionApiClient (existing) | - | Not used for Aave | Direct ABI, no external API |

---

## What NOT to Add

| Package | Version | Why NOT |
|---------|---------|---------|
| `@bgd-labs/aave-address-book` | 4.44.22 | 191 releases/year for 20 static constants. Pool proxy addresses are immutable since deployment. Hardcode like Lido/0x pattern. |
| `@aave/client` | 0.9.2 | peerDeps: viem + ethers + thirdweb. 3 heavy peer deps for 4 ABI function calls. |
| `@aave/contract-helpers` | DEPRECATED | Replaced by @aave/client. Legacy ethers-based package. |
| `@aave/math-utils` | 1.x | Health factor = `rawValue / 1e18`. APY = compound interest. Both are trivial arithmetic. No library needed. |
| `ethers` | 6.x | WAIaaS uses viem exclusively. Adding ethers creates dual-library confusion. |
| `viem` in @waiaas/actions | - | Actions package is dependency-light (core+zod only). ABI encoding uses manual hex (Lido pattern). viem is daemon-only for RPC. |
| Any Aave subgraph client | - | getUserAccountData is a single RPC call. Subgraph adds GraphQL complexity + The Graph dependency for no benefit. |
| WebSocket RPC | - | 5-min polling is sufficient for health monitoring. WebSocket is expensive and requires persistent connections. |

---

## Integration Points with Existing Architecture

### 1. IActionProvider Pattern (actions package)

AaveV3LendingProvider extends ILendingProvider which extends IActionProvider:

```
IActionProvider (existing)
  -> metadata: ActionProviderMetadata
  -> actions: ActionDefinition[]
  -> resolve(actionName, params, context) -> ContractCallRequest | ContractCallRequest[]

ILendingProvider extends IActionProvider (new, in @waiaas/core)
  -> getPosition(walletAddress, network) -> LendingPosition[]
  -> getHealthFactor(walletAddress, network) -> HealthFactorData
  -> getMarkets(network) -> MarketInfo[]
```

**Note:** `getPosition`/`getHealthFactor`/`getMarkets` require RPC calls. In the actions package (no viem), these methods return `null` or throw. The daemon's PositionTracker provides the actual implementation by calling RPC via EvmAdapter's PublicClient.

### 2. registerBuiltInProviders (actions/index.ts)

New provider entry follows existing pattern (lines 88-176 of index.ts):

```typescript
{
  key: 'aave_v3',
  enabledKey: 'actions.aave_v3_enabled',
  factory: () => {
    const evmNetwork = settingsReader.get('rpc.evm_default_network') || 'ethereum-mainnet';
    const chainId = AAVE_NETWORK_TO_CHAIN_ID[evmNetwork];
    const addresses = chainId ? AAVE_V3_ADDRESSES.get(chainId) : undefined;

    // Admin Settings overrides (empty = use default)
    const poolOverride = settingsReader.get('actions.aave_v3_pool_address');

    const config: AaveV3Config = {
      enabled: true,
      healthFactorWarningThreshold: Number(settingsReader.get('actions.aave_v3_health_factor_warning_threshold')),
      positionSyncIntervalSec: Number(settingsReader.get('actions.aave_v3_position_sync_interval_sec')),
      maxLtvPct: Number(settingsReader.get('actions.aave_v3_max_ltv_pct')),
    };
    return new AaveV3LendingProvider(config, {
      pool: poolOverride || addresses?.pool || '',
    });
  },
},
```

### 3. ContractCallRequest Pipeline

Supply/borrow resolve returns standard `ContractCallRequest` -> pipeline stages 1-6 unchanged:

```
resolve('supply', {asset, amount})
  -> [
    { type: 'CONTRACT_CALL', to: asset, calldata: encodeApproveCalldata(pool, amount), value: '0' },
    { type: 'CONTRACT_CALL', to: pool, calldata: encodeSupplyCalldata(asset, amount, wallet), value: '0' },
  ]
```

### 4. CONTRACT_WHITELIST Policy

Aave Pool addresses must be in CONTRACT_WHITELIST for the pipeline to execute:
- **Recommended approach:** User adds Aave Pool address to CONTRACT_WHITELIST via Admin UI (consistent with current manual approach for all contract interactions)
- Admin UI can show a hint: "Add Aave V3 Pool address for your network to enable lending"

### 5. PositionTracker -> HealthFactorMonitor -> NotificationService

```
PositionTracker (5-min sync)
  -> viem readContract(getUserAccountData) via EvmAdapter's PublicClient
  -> upserts defi_positions table (SUPPLY/BORROW rows per aToken/debtToken)
  -> HealthFactorMonitor reads defi_positions (NOT direct RPC)
  -> if metadata.healthFactor < threshold -> NotificationService.emit(LIQUIDATION_WARNING)
  -> DeFiMonitorService manages HealthFactorMonitor lifecycle
```

---

## File Structure

```
packages/core/src/
  enums/defi.ts                              # POSITION_CATEGORIES, POSITION_STATUSES (NEW)
  enums/notification.ts                      # +LIQUIDATION_WARNING +3 events (MODIFIED)
  interfaces/lending-provider.types.ts       # ILendingProvider interface (NEW)
  schemas/position.schema.ts                 # Base + Category position Zod (NEW)
  schemas/lending.schema.ts                  # LendingPositionSummary + HealthFactor Zod (NEW)

packages/actions/src/
  providers/aave-v3/
    index.ts                                 # AaveV3LendingProvider (NEW)
    aave-contracts.ts                        # Manual ABI encode functions (NEW)
    config.ts                                # AaveV3Config + AAVE_V3_ADDRESSES map (NEW)
    schemas.ts                               # Supply/Borrow/Repay/Withdraw Zod (NEW)
  index.ts                                   # +aave_v3 registration (MODIFIED)

packages/daemon/src/
  services/defi/
    position-tracker.ts                      # PositionTracker service (NEW)
    health-factor-monitor.ts                 # HealthFactorMonitor (NEW)
    lending-policy-evaluator.ts              # LendingPolicyEvaluator (NEW)
    aave-pool-abi.ts                         # viem ABI for readContract (NEW)
  services/notification/
    message-templates.ts                     # +LIQUIDATION_WARNING template (MODIFIED)
  infrastructure/database/
    schema.ts                                # +defiPositions table (MODIFIED)
    migrations/                              # v23 migration (NEW)

packages/daemon/src/api/routes/
  wallets.ts                                 # +GET /positions, /health-factor (MODIFIED)

packages/admin/src/
  components/portfolio/                      # DeFi positions UI (NEW)
```

---

## Sources

- [Aave V3 Pool Smart Contract Docs](https://aave.com/docs/aave-v3/smart-contracts/pool) -- HIGH confidence
- [Aave V3 IPool.sol Interface](https://github.com/aave/aave-v3-core/blob/master/contracts/interfaces/IPool.sol) -- HIGH confidence (function signatures verified)
- [bgd-labs/aave-address-book AaveV3Ethereum.ts](https://github.com/bgd-labs/aave-address-book/blob/main/src/ts/AaveV3Ethereum.ts) -- HIGH confidence
- [bgd-labs/aave-address-book AaveV3Polygon.ts](https://github.com/bgd-labs/aave-address-book/blob/main/src/ts/AaveV3Polygon.ts) -- HIGH confidence
- [bgd-labs/aave-address-book AaveV3Arbitrum.ts](https://github.com/bgd-labs/aave-address-book/blob/main/src/ts/AaveV3Arbitrum.ts) -- HIGH confidence
- [bgd-labs/aave-address-book AaveV3Optimism.ts](https://github.com/bgd-labs/aave-address-book/blob/main/src/ts/AaveV3Optimism.ts) -- HIGH confidence
- [bgd-labs/aave-address-book AaveV3Base.ts](https://github.com/bgd-labs/aave-address-book/blob/main/src/ts/AaveV3Base.ts) -- HIGH confidence
- [Aave V3 Pool on Etherscan](https://etherscan.io/address/0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2) -- HIGH confidence
- [Aave Addresses Dashboard](https://aave.com/docs/resources/addresses) -- HIGH confidence
- [viem encodeFunctionData](https://viem.sh/docs/contract/encodeFunctionData.html) -- HIGH confidence
- [viem readContract](https://viem.sh/docs/contract/readContract) -- HIGH confidence
- [Aave V3 Pool on PolygonScan](https://polygonscan.com/address/0x794a61358D6845594F94dc1DB02A252b5b4814aD) -- HIGH confidence
- [Aave V3 Pool on Arbiscan](https://arbiscan.io/address/0x794a61358d6845594f94dc1db02a252b5b4814ad) -- HIGH confidence
- m29-00 design document (internal) -- ILendingProvider interface, defi_positions table, HealthFactorMonitor adaptive polling
- m29-02 objective document (internal) -- Implementation targets, E2E scenarios
- Existing Lido provider pattern (lido-staking/config.ts, lido-contract.ts) -- Manual ABI encoding + address pattern
- Existing 0x provider pattern (zerox-swap/config.ts) -- CHAIN_ID_MAP + CHAIN_ID address mapping pattern
- Existing EvmAdapter (adapter.ts) -- viem usage in daemon package
- @waiaas/actions package.json -- Confirmed: only @waiaas/core + zod deps, NO viem
