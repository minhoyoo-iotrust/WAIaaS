# Phase 276: Aave V3 Provider Implementation - Research

**Researched:** 2026-02-27
**Domain:** Aave V3 DeFi Lending Protocol + EVM Smart Contract Integration
**Confidence:** HIGH

## Summary

Phase 276 implements AaveV3LendingProvider, the first concrete ILendingProvider that resolves supply/borrow/repay/withdraw actions into ContractCallRequest arrays for the existing 6-stage pipeline. The provider targets 5 EVM chains (Ethereum, Arbitrum, Optimism, Polygon, Base) and requires manual hex ABI encoding (Lido pattern -- no viem ABI dependency in calldata generation).

The foundation is solid: Phase 274 established ILendingProvider/IPositionProvider interfaces, defi_positions table, and DeFi enums. Phase 275 built PositionTracker, HealthFactorMonitor, and LendingPolicyEvaluator. Phase 276 creates the Aave-specific implementation that plugs into all three services.

The primary challenge is dual: (1) encoding 4 different Pool ABI function signatures with varying parameter layouts using manual hex, and (2) implementing read-only query methods (getPosition, getHealthFactor, getMarkets) that need to decode on-chain data. The read methods require an RPC client dependency injected into the provider, which is a new pattern vs existing action providers (Jupiter, 0x, Lido) that only produce calldata.

**Primary recommendation:** Implement AaveV3LendingProvider in `packages/actions/src/providers/aave-v3/` following the Lido pattern for calldata encoding, with a lightweight RPC client interface injected for read operations. Split into: (1) aave-contracts.ts (manual hex encoding + address registry), (2) aave-rpc.ts (read-only RPC queries via eth_call), (3) index.ts (provider class implementing both ILendingProvider and IPositionProvider), (4) schemas.ts (Zod input schemas), (5) config.ts (chain address maps + settings).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AAVE-01 | AaveV3LendingProvider resolves supply to Pool.supply() calldata | Function selector `0x617ba037`, manual hex encoding of `supply(address,uint256,address,uint16)`, approve+supply multi-step pattern |
| AAVE-02 | AaveV3LendingProvider resolves borrow to Pool.borrow() calldata (variable rate only) | Function selector `0xa415bcad`, `borrow(address,uint256,uint256,uint16,address)` with interestRateMode=2 hardcoded |
| AAVE-03 | AaveV3LendingProvider resolves repay to Pool.repay() calldata | Function selector `0x573ade81`, `repay(address,uint256,uint256,address)`, approve+repay multi-step, uint256.max for full repay |
| AAVE-04 | AaveV3LendingProvider resolves withdraw to Pool.withdraw() calldata | Function selector `0x69328dec`, `withdraw(address,uint256,address)`, uint256.max for full withdraw |
| AAVE-05 | supply/repay include ERC-20 approve multi-step ContractCallRequest[] | Existing pattern from Lido: `encodeApproveCalldata` (`0x095ea7b3`), [approveReq, actionReq] array return |
| AAVE-06 | 5-chain Pool/DataProvider/Oracle address mapping | All 5 chain addresses verified from aave-address-book GitHub repository |
| AAVE-07 | getUserAccountData() for 18-decimal bigint health factor | Function selector `0xbf92857c`, returns 6 uint256 values, healthFactor at position [5] in 18-decimal |
| AAVE-08 | Asset-level APY/LTV/liquidity market data query | `getReserveData(address)` selector `0x35ea6a75` + ray-to-APY conversion formula |
| AAVE-09 | HF simulation before borrow/withdraw to prevent self-liquidation | Pre-action HF estimation using current collateral/debt + projected change |
| AAVE-10 | Manual hex ABI encoding (no viem ABI, Lido pattern) | Verified Lido pattern in `lido-contract.ts`: padHex, addressToHex, uint256ToHex utilities |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| N/A (manual hex) | - | ABI calldata encoding | AAVE-10 requirement: Lido pattern, no viem ABI dependency for calldata |
| viem `client.call()` | 2.x (existing) | eth_call for read operations | Already in project for EvmAdapter. Read queries (getUserAccountData, getReserveData) need RPC |
| zod | 3.x (existing) | Input schema validation | Project SSoT pattern. Zod schemas for supply/borrow/repay/withdraw inputs |
| @waiaas/core | existing | ILendingProvider, IPositionProvider, ContractCallRequest types | Phase 274 established interfaces |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | existing | Position cache reads | HealthFactorMonitor reads defi_positions; provider doesn't write directly |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual hex encoding | viem encodeFunctionData | AAVE-10 explicitly requires manual hex (Lido pattern). Consistency with existing providers. |
| @aave/contract-helpers | Manual ABI | Official Aave SDK adds 500KB+ dependency. Project pattern is lightweight manual encoding. |
| Hardcoded addresses | PoolAddressesProvider.getPool() | Dynamic lookup adds RPC call per initialization. Hardcoded is simpler, addresses rarely change. |

**Installation:**
No new packages needed. All dependencies are already in the monorepo.

## Architecture Patterns

### Recommended Project Structure

```
packages/actions/src/providers/aave-v3/
  index.ts                   # AaveV3LendingProvider class (ILendingProvider + IPositionProvider)
  aave-contracts.ts          # Manual hex ABI encoding (Lido pattern) + function selectors
  aave-rpc.ts                # Read-only RPC query helpers (getUserAccountData, getReserveData)
  config.ts                  # Chain address maps (Pool/DataProvider/Oracle per chain) + AaveConfig type
  schemas.ts                 # Zod input schemas (supply/borrow/repay/withdraw)

packages/actions/src/index.ts  # Updated: export AaveV3LendingProvider, register in registerBuiltInProviders
```

### Pattern 1: Manual Hex ABI Encoding (Lido Pattern)

**What:** Encode Solidity function calldata using raw hex string manipulation with hardcoded function selectors.
**When to use:** All 4 Pool action calldatas (supply, borrow, repay, withdraw) + ERC-20 approve.
**Example:**
```typescript
// Source: packages/actions/src/providers/lido-staking/lido-contract.ts
// Pattern: selector + padded args, each 32 bytes

const SELECTORS = {
  supply:                '0x617ba037', // supply(address,uint256,address,uint16)
  borrow:                '0xa415bcad', // borrow(address,uint256,uint256,uint16,address)
  repay:                 '0x573ade81', // repay(address,uint256,uint256,address)
  withdraw:              '0x69328dec', // withdraw(address,uint256,address)
  approve:               '0x095ea7b3', // approve(address,uint256)
  getUserAccountData:    '0xbf92857c', // getUserAccountData(address)
  getReservesList:       '0xd1946dbc', // getReservesList()
  getReserveData:        '0x35ea6a75', // getReserveData(address)
} as const;

function encodeSupplyCalldata(
  asset: string,
  amount: bigint,
  onBehalfOf: string,
  referralCode: number = 0,
): string {
  const selector = SELECTORS.supply;
  const paddedAsset = addressToHex(asset);
  const paddedAmount = uint256ToHex(amount);
  const paddedOnBehalfOf = addressToHex(onBehalfOf);
  const paddedReferral = uint256ToHex(BigInt(referralCode)).slice(48); // uint16 = last 4 hex
  // Actually uint16 is still padded to 32 bytes in ABI encoding
  const paddedReferralFull = uint256ToHex(BigInt(referralCode));
  return `${selector}${paddedAsset}${paddedAmount}${paddedOnBehalfOf}${paddedReferralFull}`;
}
```

### Pattern 2: Multi-Step Approve + Action (Research Flag C1)

**What:** Supply and repay require ERC-20 token approval before the Pool call. Return `ContractCallRequest[]` array.
**When to use:** supply (approve token to Pool, then Pool.supply), repay (approve token to Pool, then Pool.repay).
**Important:** Research flag C1 warns about USDT-like tokens requiring zero-first approve. For safety, the implementation should always set approval to the exact amount needed, not unlimited.
**Example:**
```typescript
// Pattern from Lido unstake and 0x swap
private resolveSupply(params, context): ContractCallRequest[] {
  const approveReq: ContractCallRequest = {
    type: 'CONTRACT_CALL',
    to: params.asset,  // ERC-20 token address
    calldata: encodeApproveCalldata(poolAddress, amount),
    value: '0',
  };
  const supplyReq: ContractCallRequest = {
    type: 'CONTRACT_CALL',
    to: poolAddress,
    calldata: encodeSupplyCalldata(params.asset, amount, context.walletAddress),
    value: '0',
  };
  return [approveReq, supplyReq];
}
```

### Pattern 3: Provider Registration with Settings Reader

**What:** Register AaveV3LendingProvider in registerBuiltInProviders() with Admin Settings toggle.
**When to use:** Daemon startup lifecycle.
**Example:**
```typescript
// Source: packages/actions/src/index.ts registerBuiltInProviders pattern
{
  key: 'aave_v3',
  enabledKey: 'actions.aave_v3_enabled',
  factory: () => {
    const config: AaveV3Config = {
      enabled: true,
      // Read chain-specific settings...
    };
    return new AaveV3LendingProvider(config);
  },
}
```

### Pattern 4: Dual Interface Implementation (ILendingProvider + IPositionProvider)

**What:** Single class implements both ILendingProvider (API-facing queries) and IPositionProvider (PositionTracker sync).
**When to use:** AaveV3LendingProvider must serve both roles.
**Design source:** m29-00 design doc section 13.3.
**Example:**
```typescript
class AaveV3LendingProvider implements ILendingProvider, IPositionProvider {
  // IActionProvider (via ILendingProvider)
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];
  resolve(actionName, params, context): Promise<ContractCallRequest | ContractCallRequest[]>;

  // ILendingProvider query methods
  getPosition(walletId, context): Promise<LendingPositionSummary[]>;
  getHealthFactor(walletId, context): Promise<HealthFactor>;
  getMarkets(chain, network?): Promise<MarketInfo[]>;

  // IPositionProvider (for PositionTracker)
  getPositions(walletId): Promise<PositionUpdate[]>;
  getProviderName(): string; // 'aave_v3'
  getSupportedCategories(): PositionCategory[]; // ['LENDING']
}
```

### Pattern 5: RPC Client Injection for Read Operations

**What:** The provider needs to make eth_call for getUserAccountData, getReserveData, etc. Unlike existing action providers (which only produce calldata), ILendingProvider query methods need RPC access.
**When to use:** getPosition, getHealthFactor, getMarkets implementations.
**Design decision:** Inject a lightweight RPC caller interface into the provider constructor. This avoids coupling to viem PublicClient directly and allows mocking in tests.
**Example:**
```typescript
interface IRpcCaller {
  call(params: { to: string; data: string; network?: string }): Promise<string>; // returns hex response
}

class AaveV3LendingProvider {
  constructor(config: AaveV3Config, rpcCaller?: IRpcCaller) { ... }
}
```

### Anti-Patterns to Avoid

- **Importing viem ABI types for encoding:** AAVE-10 requires manual hex. The `encodeFunctionData` from viem must NOT be used for action calldata.
- **Hardcoding chain ID in the provider class:** Use network-to-address lookup map. The provider should work with any of the 5 supported networks.
- **Using Number for health factor comparisons:** Research flag C2 -- health factor is 18-decimal bigint (1_200_000_000_000_000_000n). Never convert to Number for safety-critical checks.
- **Forgetting to register with both ActionProviderRegistry AND PositionTracker:** The provider needs dual registration in the daemon lifecycle.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ABI calldata encoding | Complex ABI encoder library | Manual hex (Lido pattern) | Project requirement AAVE-10. Simple function selectors + padded args. |
| Health factor threshold logic | Custom threshold evaluation | HealthFactorMonitor (Phase 275) | Already built. Provider just returns raw HF value. |
| Position DB writes | Direct SQLite inserts | PositionWriteQueue + PositionTracker (Phase 275) | Batch upsert with dedup already implemented. |
| Policy evaluation for borrow LTV | Custom LTV checker | LendingPolicyEvaluator (Phase 275) | Already integrated in database-policy-engine.ts. |
| ERC-20 approve encoding | New approve helper | Existing `encodeApproveCalldata` pattern | Already proven in Lido and 0x providers. Selector 0x095ea7b3. |

**Key insight:** Phase 274+275 built all the framework pieces. Phase 276 is purely the Aave-specific "adapter" that produces calldata and reads on-chain data. The plumbing (registration, policy, monitoring) is already done.

## Common Pitfalls

### Pitfall 1: ABI Encoding Parameter Order Mismatch

**What goes wrong:** Solidity function parameters are encoded in declaration order. Getting the order wrong produces valid-looking hex that calls the wrong function or with wrong args.
**Why it happens:** borrow() has 5 params in a specific order: (asset, amount, interestRateMode, referralCode, onBehalfOf). Swapping referralCode and onBehalfOf would silently pass encoding but fail on-chain.
**How to avoid:** Use computed function selectors (verified in research) and write unit tests that decode the calldata to verify parameter positions.
**Warning signs:** On-chain revert with no clear reason, or funds sent to wrong address.

### Pitfall 2: uint256.max for Full Repay/Withdraw

**What goes wrong:** Aave uses `type(uint256).max` (2^256-1) as a sentinel for "repay entire debt" or "withdraw all". The hex encoding must be exactly 64 'f' characters.
**Why it happens:** Manual bigint arithmetic with MAX_UINT256 = `0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`.
**How to avoid:** Define constant: `const MAX_UINT256 = (1n << 256n) - 1n;`. Test that encoding produces exactly `ff...ff` (64 hex chars).
**Warning signs:** Partial repay when full repay intended.

### Pitfall 3: Health Factor 18-Decimal Precision (Research Flag C2)

**What goes wrong:** getUserAccountData returns healthFactor as uint256 with 18 decimals. Converting to Number loses precision at very high values and introduces floating-point errors near the liquidation threshold (1.0).
**Why it happens:** JavaScript Number has ~15 significant digits; 18-decimal bigints can exceed this.
**How to avoid:** Keep HF as bigint for threshold comparisons. Only convert to Number for display/API responses. Compare: `hfRaw >= 1_200_000_000_000_000_000n` not `Number(hfRaw) / 1e18 >= 1.2`.
**Warning signs:** False negatives on liquidation warnings near HF=1.0.

### Pitfall 4: Chain-Specific Pool Addresses

**What goes wrong:** Ethereum mainnet Pool address (0x87870...) differs from other chains (0x794a6...). Using wrong address results in failed transactions.
**Why it happens:** Aave V3 uses different deployers per chain. Only Polygon/Arbitrum/Optimism share the same Pool address. Ethereum and Base have unique addresses.
**How to avoid:** Network-keyed address map with exhaustive validation. Throw immediately if network not in map.
**Warning signs:** "CALL_EXCEPTION" errors on specific chains.

### Pitfall 5: APY Calculation from Ray Units

**What goes wrong:** Aave V3 interest rates are in ray (10^27) units. Incorrect conversion produces wildly wrong APY values.
**Why it happens:** The formula involves compound interest: `APY = ((1 + rate / 10^27 / SECONDS_PER_YEAR)^SECONDS_PER_YEAR) - 1`. Using simple division gives wrong results.
**How to avoid:** Use the standard Aave APY formula. For a simpler approximation: `APY ≈ rate / 10^27` (linear approximation, good enough for display at typical DeFi rates). For precise calculation, use the compound formula with Number precision (APY display doesn't need bigint precision).
**Warning signs:** APY showing as 0 or unreasonably high values.

### Pitfall 6: Forgetting Approve for Repay (Research Flag C1)

**What goes wrong:** repay() requires ERC-20 approval just like supply(). If the resolve() returns only the repay calldata without approve, the transaction reverts on-chain.
**Why it happens:** Unlike borrow/withdraw (which release tokens to the user), supply and repay require the user to transfer tokens TO the Pool contract.
**How to avoid:** Both supply and repay resolve to [approveReq, actionReq] arrays. Only borrow and withdraw are single-element returns.
**Warning signs:** repay transactions reverting with "ERC20: insufficient allowance".

## Code Examples

### Manual Hex Encoding for Aave Pool Functions

```typescript
// Source: Lido pattern (packages/actions/src/providers/lido-staking/lido-contract.ts)
// Applied to Aave V3 Pool functions

// Shared utilities (reuse from Lido or extract to common)
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

// ---- Function Selectors (verified via keccak256) ----

const AAVE_SELECTORS = {
  // Pool write functions
  supply:              '0x617ba037', // supply(address,uint256,address,uint16)
  borrow:              '0xa415bcad', // borrow(address,uint256,uint256,uint16,address)
  repay:               '0x573ade81', // repay(address,uint256,uint256,address)
  withdraw:            '0x69328dec', // withdraw(address,uint256,address)
  // Pool read functions
  getUserAccountData:  '0xbf92857c', // getUserAccountData(address)
  getReservesList:     '0xd1946dbc', // getReservesList()
  getReserveData:      '0x35ea6a75', // getReserveData(address)
  // ERC-20
  approve:             '0x095ea7b3', // approve(address,uint256)
} as const;

// ---- Encode supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) ----

function encodeSupplyCalldata(
  asset: string,
  amount: bigint,
  onBehalfOf: string,
  referralCode: number = 0,
): string {
  return `${AAVE_SELECTORS.supply}${addressToHex(asset)}${uint256ToHex(amount)}${addressToHex(onBehalfOf)}${uint256ToHex(BigInt(referralCode))}`;
}

// ---- Encode borrow(address, uint256, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) ----

function encodeBorrowCalldata(
  asset: string,
  amount: bigint,
  onBehalfOf: string,
  interestRateMode: bigint = 2n, // 2 = variable
  referralCode: number = 0,
): string {
  return `${AAVE_SELECTORS.borrow}${addressToHex(asset)}${uint256ToHex(amount)}${uint256ToHex(interestRateMode)}${uint256ToHex(BigInt(referralCode))}${addressToHex(onBehalfOf)}`;
}

// ---- Encode repay(address, uint256, uint256 interestRateMode, address onBehalfOf) ----

function encodeRepayCalldata(
  asset: string,
  amount: bigint,
  onBehalfOf: string,
  interestRateMode: bigint = 2n,
): string {
  return `${AAVE_SELECTORS.repay}${addressToHex(asset)}${uint256ToHex(amount)}${uint256ToHex(interestRateMode)}${addressToHex(onBehalfOf)}`;
}

// ---- Encode withdraw(address, uint256, address to) ----

function encodeWithdrawCalldata(
  asset: string,
  amount: bigint,
  to: string,
): string {
  return `${AAVE_SELECTORS.withdraw}${addressToHex(asset)}${uint256ToHex(amount)}${addressToHex(to)}`;
}
```

### 5-Chain Address Map

```typescript
// Source: https://github.com/bgd-labs/aave-address-book (verified 2026-02-27)
// Verified per-chain from AaveV3{Chain}.ts files

interface AaveChainAddresses {
  pool: string;
  dataProvider: string;
  oracle: string;
  chainId: number;
}

const AAVE_V3_ADDRESSES: Record<string, AaveChainAddresses> = {
  'ethereum-mainnet': {
    pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    dataProvider: '0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD',
    oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
    chainId: 1,
  },
  'arbitrum-mainnet': {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    dataProvider: '0x243Aa95cAC2a25651eda86e80bEe66114413c43b',
    oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7',
    chainId: 42161,
  },
  'optimism-mainnet': {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    dataProvider: '0x243Aa95cAC2a25651eda86e80bEe66114413c43b',
    oracle: '0xD81eb3728a631871a7eBBaD631b5f424909f0c77',
    chainId: 10,
  },
  'polygon-mainnet': {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    dataProvider: '0x243Aa95cAC2a25651eda86e80bEe66114413c43b',
    oracle: '0xb023e699F5a33916Ea823A16485e259257cA8Bd1',
    chainId: 137,
  },
  'base-mainnet': {
    pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    dataProvider: '0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A',
    oracle: '0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156',
    chainId: 8453,
  },
} as const;
```

### getUserAccountData Response Decoding

```typescript
// getUserAccountData(address) returns 6 x uint256 (192 bytes total, 384 hex chars)
// [0] totalCollateralBase (8 decimals, base currency units)
// [1] totalDebtBase (8 decimals)
// [2] availableBorrowsBase (8 decimals)
// [3] currentLiquidationThreshold (basis points, e.g. 8250 = 82.5%)
// [4] ltv (basis points, e.g. 8000 = 80%)
// [5] healthFactor (18 decimals, 1e18 = HF 1.0)

function decodeGetUserAccountData(hexResponse: string): {
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThreshold: bigint;
  ltv: bigint;
  healthFactor: bigint;
} {
  // Strip 0x prefix
  const data = hexResponse.startsWith('0x') ? hexResponse.slice(2) : hexResponse;
  // Each value is 64 hex chars (32 bytes)
  return {
    totalCollateralBase: BigInt('0x' + data.slice(0, 64)),
    totalDebtBase: BigInt('0x' + data.slice(64, 128)),
    availableBorrowsBase: BigInt('0x' + data.slice(128, 192)),
    currentLiquidationThreshold: BigInt('0x' + data.slice(192, 256)),
    ltv: BigInt('0x' + data.slice(256, 320)),
    healthFactor: BigInt('0x' + data.slice(320, 384)),
  };
}
```

### Health Factor Simulation (AAVE-09)

```typescript
// Pre-borrow HF simulation: estimate new HF if borrow succeeds
// Formula: newHF = (totalCollateral * liquidationThreshold) / (totalDebt + newBorrowAmount)
// All values in base currency (8 decimals for Aave V3)

function simulateHealthFactor(
  currentData: {
    totalCollateralBase: bigint;
    totalDebtBase: bigint;
    currentLiquidationThreshold: bigint; // basis points
  },
  newBorrowBase: bigint,
): bigint {
  const collateralThresholdAdjusted =
    (currentData.totalCollateralBase * currentData.currentLiquidationThreshold) / 10000n;
  const newTotalDebt = currentData.totalDebtBase + newBorrowBase;
  if (newTotalDebt === 0n) {
    return MAX_UINT256; // No debt = infinite HF
  }
  // HF with 18 decimals
  return (collateralThresholdAdjusted * 10n ** 18n) / newTotalDebt;
}

// Reject if simulated HF < 1.0 (liquidation zone)
const LIQUIDATION_THRESHOLD_HF = 1_000_000_000_000_000_000n; // 1.0 in 18 decimals
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stable rate borrowing | Variable only (stable deprecated) | 2023 Aave governance | interestRateMode always = 2. No UI option needed for rate mode. |
| aave-js / @aave/protocol-js | Direct ABI calls / aave-address-book | 2023-2024 | Old SDK deprecated. Current ecosystem uses raw ABI or @aave/contract-helpers. Project uses manual hex. |
| Per-chain address lookup via PoolAddressesProvider | Hardcoded address maps from aave-address-book | Ongoing | Simpler, no extra RPC call needed. Addresses change only on new deployments (rare). |

**Deprecated/outdated:**
- **Stable rate (interestRateMode=1):** Disabled in Aave V3 governance across all markets. Always use variable (2).
- **@aave/protocol-js:** Superseded by @aave/contract-helpers and @aave/math-utils. Not needed for this project (manual hex pattern).

## Open Questions

1. **RPC Client Injection Pattern**
   - What we know: Existing action providers (Lido, 0x, Jupiter) don't need RPC access in resolve(). But ILendingProvider query methods (getPosition, getHealthFactor, getMarkets) need to make eth_call to read on-chain state.
   - What's unclear: How to inject the RPC client. Options: (a) pass via constructor config (chosen approach), (b) pass via ActionContext extension, (c) have daemon call adapter directly and pass results.
   - Recommendation: Constructor injection with a lightweight `IRpcCaller` interface. This matches how LidoStakingConfig and other providers receive configuration. The daemon's registerBuiltInProviders can construct the caller from the AdapterPool/RpcPool.

2. **Amount Parsing for Variable-Decimal Tokens**
   - What we know: Lido has parseEthAmount (18 decimals). Aave operates on tokens with varying decimals (USDC=6, WETH=18, DAI=18, WBTC=8).
   - What's unclear: Whether the input schema should accept human-readable amounts (like "100.5" USDC) or raw amounts in smallest units.
   - Recommendation: Accept human-readable amounts (consistent with design doc schemas). Provider needs to know token decimals to convert. This can be a simple `parseTokenAmount(amount: string, decimals: number)` utility. Token decimals can be passed in the input schema or looked up from the token registry.

3. **Base Currency Units in getUserAccountData**
   - What we know: getUserAccountData returns values in "base currency" which is USD for most chains (8 decimals). This is NOT the same as token amounts.
   - What's unclear: Whether the base currency varies across chains.
   - Recommendation: Assume 8-decimal USD base across all 5 chains (this is the Aave V3 standard). Document this assumption.

## Sources

### Primary (HIGH confidence)
- [Aave V3 IPool.sol GitHub](https://github.com/aave/aave-v3-core/blob/master/contracts/interfaces/IPool.sol) - Function signatures verified
- [bgd-labs/aave-address-book GitHub](https://github.com/bgd-labs/aave-address-book) - AaveV3Ethereum.ts, AaveV3Arbitrum.ts, AaveV3Optimism.ts, AaveV3Polygon.ts, AaveV3Base.ts - Contract addresses verified per-chain
- [Aave Pool documentation](https://aave.com/docs/aave-v3/smart-contracts/pool) - Function signatures and parameters
- Local codebase: `packages/actions/src/providers/lido-staking/lido-contract.ts` - Manual hex encoding pattern
- Local codebase: `packages/core/src/interfaces/lending-provider.types.ts` - ILendingProvider interface (Phase 274)
- Local codebase: `packages/core/src/interfaces/position-provider.types.ts` - IPositionProvider interface (Phase 274)
- Function selectors computed via keccak256 using viem in local project

### Secondary (MEDIUM confidence)
- [Aave Addresses Dashboard](https://aave.com/docs/resources/addresses) - Contract address verification
- m29-00 design doc section 17.1 - Aave V3 method mapping to ILendingProvider
- m29-00 design doc section 13.3 - Dual interface implementation pattern

### Tertiary (LOW confidence)
- APY calculation formula from Aave docs (ray units) - formula verified but precision limits with Number need testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, uses existing project patterns (Lido, 0x, core interfaces)
- Architecture: HIGH - dual interface pattern documented in m29-00 design doc, all 3 foundation services (Phase 274/275) already implemented
- Pitfalls: HIGH - well-known DeFi patterns, verified function selectors, Lido codebase as reference
- Contract addresses: HIGH - verified from official aave-address-book repository on GitHub
- APY calculation: MEDIUM - formula documented but ray-to-APY precision needs unit testing

**Research date:** 2026-02-27
**Valid until:** 2027-03-27 (stable -- Aave V3 contracts are immutable, addresses won't change)
