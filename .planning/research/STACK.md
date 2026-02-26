# Technology Stack: Advanced DeFi Protocol Integration

**Project:** WAIaaS Advanced DeFi (Lending/Yield/Perp/Intent)
**Researched:** 2026-02-26
**Overall confidence:** HIGH (verified via npm registry, official docs, contract sources)

## Critical Design Principle: Zero External SDK

WAIaaS follows a **zero external SDK** pattern for DeFi integrations. Existing providers (Lido, Jito, Jupiter, 0x, LI.FI) demonstrate two approaches:

1. **Direct ABI/instruction encoding** (Lido: manual `encodeSubmitCalldata`, Jito: raw SPL instruction bytes)
2. **REST API calldata** (Jupiter, 0x, LI.FI: fetch calldata from API, pass to pipeline)

Both patterns return `ContractCallRequest` objects with zero external Solana/EVM SDK dependencies in `@waiaas/actions`. The daemon holds `viem ^2.21.0` and `@solana/kit ^6.0.1` -- these MUST NOT leak into the actions package.

**This principle must continue.** Adding heavy SDKs like `@drift-labs/sdk` (26+ deps, `@solana/web3.js 1.x` legacy) or `@kamino-finance/klend-sdk` (20+ deps, `@coral-xyz/anchor 0.28`) would:
- Create dependency conflicts with `@solana/kit 6.x` (incompatible with legacy `@solana/web3.js 1.x`)
- Bloat the package from 2 deps to 30+ deps
- Introduce version pinning fragility (Anchor 0.28 vs 0.29 vs 0.30 conflicts)

---

## Recommended Stack

### New npm Dependencies: 0

No new npm packages needed. All integrations use one of:
- Manual ABI encoding (EVM protocols: Aave V3, Morpho Blue, Pendle Router)
- REST API calldata (Pendle Hosted SDK, CoW Protocol OrderBook API)
- Manual instruction encoding (Solana protocols: Kamino, Drift)
- Existing viem utilities (EIP-712 signing via `viem/accounts` already in daemon)

### Protocol Integration Approaches

| Protocol | Chain | Approach | Complexity | Rationale |
|----------|-------|----------|------------|-----------|
| **Aave V3** | EVM | Direct ABI encode | Medium | Simple 4-function ABI (supply/borrow/repay/withdraw). Same pattern as Lido. Pool ABI is stable since 2023. |
| **Morpho Blue** | EVM | Direct ABI encode | Medium | Minimal 5-function ABI. Single contract `0xBBBBBBBBbb9cc5e90e3b3Af64bdAF62C37EEFFCb`. |
| **Kamino** | Solana | klend-sdk instruction builder OR REST API | High | Anchor IDL-based program. Raw instruction encoding is complex (many accounts). Evaluate REST API option. |
| **Pendle** | EVM | Hosted SDK REST API | Low | Official hosted API returns tx calldata directly. Same pattern as Jupiter/0x/LI.FI. |
| **Drift** | Solana | Gateway REST API | Medium | Self-hosted Rust gateway exposes REST endpoints returning tx data. Too complex for raw instruction encoding. |
| **CoW Protocol** | EVM | Direct EIP-712 + OrderBook REST API | Medium | EIP-712 signing via viem + REST API for order submission. No SDK needed. |

---

## Protocol-by-Protocol Stack Details

### 1. Aave V3 (ILendingProvider -- EVM)

**Integration: Direct ABI encoding (same as Lido pattern)**

| Item | Value | Source |
|------|-------|--------|
| Contract | Pool: `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` (Ethereum mainnet) | [Etherscan](https://etherscan.io/address/0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2) |
| L2 Pools | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` (Arbitrum, Polygon, Optimism) | [Aave Addresses](https://aave.com/docs/resources/addresses) |
| Functions | `supply(address,uint256,address,uint16)`, `borrow(address,uint256,uint256,uint16,address)`, `repay(address,uint256,uint256,address)`, `withdraw(address,uint256,address)` | [Aave Docs](https://aave.com/docs/aave-v3/smart-contracts/pool) |
| Health Factor | `getUserAccountData(address)` returns `healthFactor` as uint256 (1e18 scale) | Aave Pool contract |
| New deps | 0 | Manual ABI encoding like `lido-contract.ts` |
| Confidence | HIGH | Function signatures verified against official docs + Etherscan ABI |

**Why NOT @aave/client:** The official `@aave/client` (v0.9.2) has peerDeps on `viem ^2.31.6`, `ethers ^6.14.4`, AND `thirdweb ^5.105.25` -- adding 3 heavy peer deps for 4 function calls is unacceptable. Direct ABI encoding is trivial for these simple functions.

```typescript
// Example: supply function selector = keccak256("supply(address,uint256,address,uint16)") = 0x617ba037
function encodeAaveSupply(asset: string, amount: bigint, onBehalfOf: string): string {
  const selector = '0x617ba037';
  return `${selector}${padAddress(asset)}${padUint256(amount)}${padAddress(onBehalfOf)}${padUint16(0n)}`;
}
```

### 2. Morpho Blue (ILendingProvider -- EVM)

**Integration: Direct ABI encoding**

| Item | Value | Source |
|------|-------|--------|
| Contract | `0xBBBBBBBBbb9cc5e90e3b3Af64bdAF62C37EEFFCb` (Ethereum, Base, Optimism) | [Etherscan](https://etherscan.io/address/0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb) |
| Functions | `supply(MarketParams,uint256,uint256,address,bytes)`, `supplyCollateral(MarketParams,uint256,address,bytes)`, `borrow(MarketParams,uint256,uint256,address,address)`, `repay(MarketParams,uint256,uint256,address,bytes)`, `withdrawCollateral(MarketParams,uint256,address,address)` | [Morpho Docs](https://docs.morpho.org/build/borrow/tutorials/assets-flow/) |
| MarketParams struct | `(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)` | [GitHub](https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol) |
| New deps | 0 | Manual ABI encoding; MarketParams is a 5-field tuple |
| Confidence | HIGH | Verified via GitHub source + Etherscan |

**Why NOT @morpho-org/blue-sdk-viem:** The SDK (v4.4.0) has peerDeps `viem ^2.0.0`, `@morpho-org/blue-sdk ^5.16.0`, `@morpho-org/morpho-ts ^2.4.6`. The blue-sdk itself uses lodash. For 5 ABI-encoded function calls, the overhead is not justified.

**Encoding complexity:** MarketParams is a struct, requiring ABI tuple encoding. This is more complex than Aave's flat parameters but still straightforward with manual encoding. viem's `encodeAbiParameters` could be used in the daemon if needed, but the actions package should use pure manual encoding.

### 3. Kamino (ILendingProvider -- Solana)

**Integration: REST API preferred, raw instruction encoding as fallback**

| Item | Value | Source |
|------|-------|--------|
| Program ID | `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` | [Solscan](https://solscan.io/account/KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD) |
| SDK | `@kamino-finance/klend-sdk` v7.3.20 | npm registry |
| SDK deps | 20+ including `@coral-xyz/anchor ^0.28`, `@solana/kit ^2.3.0` (CONFLICT with our ^6.0.1) | npm registry |
| New deps | 0 | Use Kamino REST API or manual instruction building |
| Confidence | MEDIUM | REST API needs verification; raw instruction encoding requires IDL analysis |

**Why NOT @kamino-finance/klend-sdk:** Uses `@coral-xyz/anchor ^0.28.0` and `@solana/kit ^2.3.0` -- both incompatible with WAIaaS's `@solana/kit ^6.0.1`. Would require a dependency shimming layer or create version conflicts. Also pulls in farms-sdk, scope-sdk, kliquidity-sdk as transitive deps.

**Recommended approach:**
1. **Primary:** Check if Kamino provides a REST API endpoint (similar to Jupiter) that returns transaction instructions. The Kamino docs mention REST APIs for market data and positions.
2. **Fallback:** Parse the Anchor IDL from the klend program and manually encode instruction data + account metas (similar to Jito's SPL Stake Pool pattern but using Anchor discriminator hashing).

### 4. Pendle (IYieldProvider -- EVM)

**Integration: Hosted SDK REST API (same pattern as Jupiter/0x/LI.FI)**

| Item | Value | Source |
|------|-------|--------|
| API Base | `https://api-v2.pendle.finance/core/v2/sdk/` | [Pendle Docs](https://docs.pendle.finance/pendle-v2/Developers/Backend/HostedSdk) |
| Primary endpoint | `GET /v2/sdk/{chainId}/convert` | Pendle Hosted SDK |
| Parameters | `tokensIn`, `amountsIn`, `tokensOut`, `receiver`, `slippage`, `enableAggregator` | Pendle API docs |
| Response | `tx.data` (calldata), `tx.to`, `tx.from`, `tx.value` | Pendle API docs |
| Chains | Ethereum (1), Arbitrum (42161), Base (8453) | [Pendle Deployments](https://docs.pendle.finance/pendle-v2/Developers/Deployments) |
| New deps | 0 | REST API via ActionApiClient (existing base class) |
| Confidence | HIGH | Official hosted SDK, same pattern as existing providers |

**Why NOT @pendle/sdk-v2:** The npm package uses ethers.js (not viem), is published only as beta versions, and the Pendle team themselves recommend the Hosted SDK for backend integrations because it "ensures consistent output with Pendle's UI" and "keeps up-to-date with protocol changes."

**Why Hosted SDK is ideal:** Pendle yield tokenization involves complex router interactions (Diamond Pattern, multiple facets). The hosted API abstracts this complexity and returns ready-to-execute calldata -- exactly the pattern WAIaaS already uses for Jupiter, 0x, and LI.FI.

### 5. Drift (IPerpProvider -- Solana)

**Integration: Gateway REST API (self-hosted or Drift-hosted)**

| Item | Value | Source |
|------|-------|--------|
| Program ID | `dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH` | [Drift Docs](https://docs.drift.trade/) |
| Gateway repo | `drift-labs/gateway` (Rust) | [GitHub](https://github.com/drift-labs/gateway) |
| Key endpoints | `POST /v2/orders` (place), `GET /v2/positions`, `GET /v2/user/marginInfo`, `GET /v2/collateral` | Gateway README |
| New deps | 0 | REST API via ActionApiClient |
| Confidence | MEDIUM | Gateway is well-documented but requires self-hosted instance or Drift API access |

**Why NOT @drift-labs/sdk:** The SDK (v2.158.0-beta) has 26+ dependencies including `@coral-xyz/anchor 0.29.0`, `@solana/web3.js 1.98.0` (legacy, incompatible with `@solana/kit 6.x`), `@project-serum/serum`, `@pythnetwork/client`, `@switchboard-xyz/*`, `solana-bankrun`, etc. This is a MASSIVE dependency tree that would double the project's node_modules.

**Recommended approach:**
1. **Primary:** Use Drift Gateway REST API -- the gateway is a self-hosted Rust binary that handles all the complexity and exposes simple REST endpoints.
2. **Configuration:** Add `actions.drift_perp_gateway_url` setting (user provides their own gateway endpoint or uses Drift's hosted API).
3. **Health monitoring:** `GET /v2/user/marginInfo` provides margin health data for the PositionTracker.

### 6. CoW Protocol (Intent/EIP-712 -- EVM)

**Integration: Direct EIP-712 signing via viem + OrderBook REST API**

| Item | Value | Source |
|------|-------|--------|
| Settlement contract | `0x9008D19f58AAbD9eD0D60971565AA8510560ab41` (all chains) | [Etherscan](https://etherscan.io/address/0x9008d19f58aabd9ed0d60971565aa8510560ab41) |
| OrderBook API | `https://api.cow.fi/mainnet/api/v1/orders` | [CoW Docs](https://docs.cow.fi/) |
| EIP-712 Domain | `{name: "Gnosis Protocol", version: "v2", chainId, verifyingContract: "0x9008...ab41"}` | [Signing Schemes](https://docs.cow.fi/cow-protocol/reference/core/signing-schemes) |
| Order type | 12 fields: `sellToken, buyToken, receiver, sellAmount, buyAmount, validTo, appData, feeAmount, kind, partiallyFillable, sellTokenBalance, buyTokenBalance` | [GPv2Order.sol](https://github.com/cowprotocol/contracts/blob/main/src/contracts/libraries/GPv2Order.sol) |
| viem support | `signTypedData()` from `viem/accounts` -- already available in daemon | [viem docs](https://viem.sh/docs/accounts/local/signTypedData) |
| New deps | 0 | EIP-712 via viem (existing), REST API via ActionApiClient |
| Confidence | HIGH | EIP-712 domain params verified via docs + contract source |

**Why NOT @cowprotocol/cow-sdk:** The SDK (v7.3.7) is a meta-package wrapping 7 sub-packages. Its peerDeps include `cross-fetch ^3.x`, `ipfs-only-hash ^4.x`, `multiformats ^9.x`, `@openzeppelin/merkle-tree ^1.x`. For signing orders (EIP-712) and submitting to the API, we only need viem's `signTypedData` + fetch.

**EIP-712 signing pattern for WAIaaS:**
- SIGN type in discriminatedUnion is already supported (7th type)
- CoW orders are signed EIP-712 messages, then submitted to the CoW OrderBook API via REST
- The intent flow: sign order -> submit to API -> CoW solvers find best execution -> settlement on-chain

---

## PositionTracker (New Core Component)

**No new dependencies needed.** Extends the existing `IAsyncStatusTracker` pattern.

| Component | Approach | Deps |
|-----------|----------|------|
| PositionTracker table | New SQLite table via Drizzle migration | Existing drizzle-orm |
| Health factor polling | EventBus timer + protocol-specific API calls | Existing EventBus |
| Aave health | `getUserAccountData()` ABI call via daemon's viem | Existing viem |
| Morpho health | Market data + position shares calculation | Manual encoding |
| Pendle maturity | Track `expiry` timestamp from API response | REST API |
| Drift margin | `GET /v2/user/marginInfo` from gateway | REST API |
| Kamino health | Market data from Kamino API | REST API |

**DB Migration (v25+):**

```sql
CREATE TABLE defi_positions (
  id TEXT PRIMARY KEY,           -- UUIDv7
  wallet_id TEXT NOT NULL,       -- FK wallets.id
  provider TEXT NOT NULL,        -- 'aave_v3' | 'morpho' | 'kamino' | 'pendle' | 'drift'
  position_type TEXT NOT NULL,   -- 'SUPPLY' | 'BORROW' | 'LP' | 'PERP'
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  protocol_position_id TEXT,     -- protocol-specific ID
  asset_id TEXT,                 -- CAIP-19
  amount TEXT NOT NULL,          -- human-readable
  metadata TEXT,                 -- JSON: health_factor, margin_ratio, maturity, etc.
  status TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | CLOSED | LIQUIDATED
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  last_checked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

---

## DeFi Monitoring (Extends BalanceMonitorService Pattern)

**No new dependencies needed.** Follows the existing BalanceMonitorService polling pattern.

| Monitor | Trigger | Source | Alert |
|---------|---------|--------|-------|
| Health Factor | health < 1.5 (warning), < 1.2 (critical) | Aave `getUserAccountData`, Morpho calculation | DEFI_HEALTH_WARNING, DEFI_LIQUIDATION_RISK |
| Maturity | expiry within 24h (warning), expired (critical) | Pendle position metadata | DEFI_MATURITY_WARNING, DEFI_MATURITY_EXPIRED |
| Margin | margin ratio < 20% (warning), < 10% (critical) | Drift `/v2/user/marginInfo` | DEFI_MARGIN_WARNING, DEFI_MARGIN_CRITICAL |
| Position value | value change > 10% in 1h | Price oracle + position amount | DEFI_POSITION_VALUE_CHANGE |

---

## What NOT to Add

| Package | Why NOT |
|---------|---------|
| `@aave/client` | peerDeps: viem + ethers + thirdweb. 4 function calls don't justify 3 peer deps. |
| `@morpho-org/blue-sdk-viem` | peerDeps: viem + blue-sdk + morpho-ts + lodash. 5 ABI calls don't justify it. |
| `@kamino-finance/klend-sdk` | 20+ deps, Anchor 0.28, @solana/kit 2.3 (CONFLICT with our 6.x). |
| `@drift-labs/sdk` | 26+ deps, @solana/web3.js 1.x (legacy, incompatible), anchor 0.29. |
| `@pendle/sdk-v2` | ethers-based (not viem), beta-only releases, team recommends Hosted SDK. |
| `@cowprotocol/cow-sdk` | 7 sub-packages + 4 peer deps for EIP-712 signing + REST call. |
| `ethers` | Project uses viem exclusively. Adding ethers would create dual-library confusion. |
| `@coral-xyz/anchor` | WAIaaS uses @solana/kit 6.x. Anchor pulls in legacy web3.js. |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Aave integration | Manual ABI encoding | @aave/client | Triple peerDep (viem+ethers+thirdweb) for 4 functions |
| Morpho integration | Manual ABI encoding | @morpho-org/blue-sdk-viem | lodash + 2 extra peer packages for 5 functions |
| Kamino integration | REST API + manual instruction | @kamino-finance/klend-sdk | @solana/kit version conflict (2.3 vs 6.0), 20+ transitive deps |
| Pendle integration | Hosted SDK REST API | @pendle/sdk-v2 | ethers dependency, beta versions only, team recommends Hosted SDK |
| Drift integration | Gateway REST API | @drift-labs/sdk | @solana/web3.js 1.x legacy, 26+ deps, massive bundle |
| CoW integration | viem signTypedData + REST | @cowprotocol/cow-sdk | 7 sub-packages + IPFS deps for 1 signing function + 1 REST call |
| EIP-712 signing | viem (already in daemon) | ethers | Project standardized on viem; no need for ethers |

---

## Integration Points with Existing Architecture

### IActionProvider Pattern (Unchanged)

All 6 new providers implement `IActionProvider` and return `ContractCallRequest` or `ContractCallRequest[]`. The pipeline, policy engine, signing, and submission paths remain unchanged.

### New Interface Abstractions

```typescript
// ILendingProvider extends IActionProvider with position awareness
interface ILendingProvider extends IActionProvider {
  getHealthFactor(walletAddress: string, network: NetworkType): Promise<number | null>;
  getPositions(walletAddress: string, network: NetworkType): Promise<LendingPosition[]>;
}

// IYieldProvider extends IActionProvider with maturity tracking
interface IYieldProvider extends IActionProvider {
  getMaturity(positionId: string): Promise<Date | null>;
  getPositions(walletAddress: string, network: NetworkType): Promise<YieldPosition[]>;
}

// IPerpProvider extends IActionProvider with margin info
interface IPerpProvider extends IActionProvider {
  getMarginInfo(walletAddress: string): Promise<MarginInfo | null>;
  getPositions(walletAddress: string): Promise<PerpPosition[]>;
}
```

### Settings Registration

New Admin Settings keys follow existing pattern:

```
actions.aave_v3_enabled = "true"
actions.aave_v3_pool_address_ethereum = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"
actions.morpho_enabled = "true"
actions.kamino_enabled = "true"
actions.kamino_api_base_url = ""
actions.pendle_enabled = "true"
actions.pendle_api_base_url = "https://api-v2.pendle.finance/core/v2/sdk/"
actions.drift_perp_enabled = "false"  -- disabled by default (requires gateway)
actions.drift_perp_gateway_url = ""
actions.cow_swap_enabled = "true"
actions.cow_swap_api_base_url = "https://api.cow.fi"
```

### Notification Events (New)

```
DEFI_HEALTH_WARNING     -- health factor approaching threshold
DEFI_LIQUIDATION_RISK   -- health factor critical
DEFI_MATURITY_WARNING   -- yield position approaching maturity
DEFI_MATURITY_EXPIRED   -- yield position matured
DEFI_MARGIN_WARNING     -- perp margin approaching maintenance
DEFI_MARGIN_CRITICAL    -- perp margin below maintenance
DEFI_POSITION_OPENED    -- new DeFi position detected
DEFI_POSITION_CLOSED    -- position closed/repaid
```

---

## Installation

```bash
# No new packages to install.
# All protocols use existing dependencies:
# - viem ^2.21.0 (EVM ABI encoding + EIP-712 signing)
# - @solana/kit ^6.0.1 (Solana if needed for instruction building)
# - zod ^3.24.0 (schema validation)
# - ActionApiClient (REST API calls -- existing in @waiaas/actions)

# New files to create (all within packages/actions/src/providers/):
# - aave-v3/         (ILendingProvider, ABI encoding)
# - morpho/          (ILendingProvider, ABI encoding)
# - kamino/          (ILendingProvider, REST API or instruction building)
# - pendle/          (IYieldProvider, Hosted SDK REST API)
# - drift-perp/      (IPerpProvider, Gateway REST API)
# - cow-swap/        (Intent provider, EIP-712 + OrderBook API)
```

---

## Sources

- [Aave V3 Pool Contract Docs](https://aave.com/docs/aave-v3/smart-contracts/pool) -- HIGH confidence
- [Aave V3 Pool on Etherscan](https://etherscan.io/address/0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2) -- HIGH confidence
- [Morpho Blue Contract Docs](https://docs.morpho.org/build/borrow/tutorials/assets-flow/) -- HIGH confidence
- [Morpho Blue on Etherscan](https://etherscan.io/address/0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb) -- HIGH confidence
- [Morpho Blue Solidity Source](https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol) -- HIGH confidence
- [Kamino klend-sdk on npm](https://www.npmjs.com/package/@kamino-finance/klend-sdk) -- HIGH confidence (deps verified)
- [Kamino klend Program on Solscan](https://solscan.io/account/KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD) -- HIGH confidence
- [Pendle Hosted SDK](https://docs.pendle.finance/pendle-v2/Developers/Backend/HostedSdk) -- HIGH confidence
- [Pendle V2 API Docs](https://api-v2.pendle.finance/core/docs) -- HIGH confidence
- [Drift Gateway](https://github.com/drift-labs/gateway) -- MEDIUM confidence (requires self-hosting evaluation)
- [Drift SDK on npm](https://www.npmjs.com/package/@drift-labs/sdk) -- HIGH confidence (deps verified)
- [Drift Protocol Docs](https://docs.drift.trade/) -- MEDIUM confidence
- [CoW Protocol Signing Schemes](https://docs.cow.fi/cow-protocol/reference/core/signing-schemes) -- HIGH confidence
- [CoW GPv2Settlement on Etherscan](https://etherscan.io/address/0x9008d19f58aabd9ed0d60971565aa8510560ab41) -- HIGH confidence
- [CoW GPv2Order.sol](https://github.com/cowprotocol/contracts/blob/main/src/contracts/libraries/GPv2Order.sol) -- HIGH confidence
- [@aave/client on npm](https://www.npmjs.com/package/@aave/client) -- HIGH confidence (deps verified via npm registry)
- [@morpho-org/blue-sdk-viem on npm](https://www.npmjs.com/package/@morpho-org/blue-sdk-viem) -- HIGH confidence
- [viem signTypedData](https://viem.sh/docs/accounts/local/signTypedData) -- HIGH confidence
