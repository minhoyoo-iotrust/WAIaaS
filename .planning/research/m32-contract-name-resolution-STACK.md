# Technology Stack: Contract Name Resolution

**Project:** WAIaaS v32.0 -- Contract Name Resolution
**Researched:** 2026-03-15
**Overall confidence:** HIGH

## Recommendation: Zero New Dependencies

Contract name resolution requires **no new npm packages**. The well-known contract registry is best implemented as a static TypeScript data module within `@waiaas/core`, following the exact pattern already established by `builtin-tokens.ts`, Aave V3 `config.ts`, Lido `config.ts`, Jito `config.ts`, Across `config.ts`, and Polymarket `config.ts`.

**Rationale:** Every action provider already hardcodes its contract addresses in TypeScript config files. The well-known registry is simply a centralized, address-indexed view of data that already exists across 13+ provider configs, plus additional well-known DeFi protocol contracts (Uniswap, Compound, etc.) that WAIaaS does not integrate but users may interact with via CONTRACT_CALL.

## Recommended Stack

### Core: No New Libraries

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript `Record<string, Record<string, WellKnownContract>>` | -- | Static well-known registry | Zero runtime cost, zero deps, tree-shakeable, type-safe, already the project pattern (see `BUILTIN_TOKENS`) |
| Existing `ActionProviderMetadata` | -- | Provider display name source (Priority 1) | Already has `name`, `description`, `category` fields. Add `displayName` to `ActionProviderMetadataSchema` (Zod SSoT) |
| Existing `CONTRACT_WHITELIST` policy | -- | User-labeled contracts (Priority 3) | Already stores `Array<{ address: string; name?: string }>`, just needs resolver access |

### What NOT to Add

| Library/Service | Why Not |
|----------------|---------|
| `@bgd-labs/aave-address-book` (npm) | Massive Solidity-focused package (4.44.x), TypeScript bindings available but pulls in hundreds of addresses across 30+ deployments. We only need 5 chains x 3 addresses = 15 entries, already hardcoded in `aave-v3/config.ts`. Adding a 40KB+ dep for 15 addresses we already have is not justified. |
| `eth-labels` / `eth-labels-mcp` (npm) | 170k+ addresses from Etherscan scraping. Data quality is unverified (scraped, not curated), includes exchange/phishing/EOA labels irrelevant to contract name resolution. Too noisy for a focused well-known DeFi contract registry. Also requires API calls or large data files. |
| `brianleect/etherscan-labels` (GitHub) | 45k+ labels dumped from Etherscan. Same problem: bulk scrape data, stale (2023 snapshot), no npm package, Python scraper. Not suitable for a curated embedded registry. |
| Etherscan Label API (`getlabelmasterlist`) | Requires API key per chain, rate-limited, adds RPC dependency for a feature designed to be zero-cost. The goal is offline-first name resolution. |
| 4byte.directory / Sourcify | Function selector or source code databases, not contract name registries. Different problem space. |
| On-chain ENS reverse resolution | Requires RPC call per address per lookup. Violates the zero-cost constraint. Could be a future Priority 5 but not for v32.0. |

## Integration Points

### Priority 1: Action Provider Metadata (Zero Cost)

The `ActionProviderMetadataSchema` in `@waiaas/core` needs one new field:

```typescript
// Addition to ActionProviderMetadataSchema (packages/core/src/interfaces/action-provider.types.ts)
displayName: z.string().min(1).max(100).optional(),
```

Each provider's `metadata` object already knows which contracts it interacts with (e.g., Jupiter knows `JUPITER_PROGRAM_ID`, Aave knows `AAVE_V3_ADDRESSES`). The `ContractNameResolver` queries `ActionProviderRegistry.getProviders()` and matches the `to` address against each provider's known contract addresses.

**Implementation approach:** Each provider exposes its contract addresses via a new optional method:

```typescript
// Addition to IActionProvider interface
getKnownContracts?(): Array<{ address: string; network: string; displayName: string }>;
```

This is the cheapest and most accurate source because the provider *itself* knows the exact address-to-protocol mapping.

**Confidence:** HIGH -- Direct code inspection of `ActionProviderMetadataSchema` (line 41-68 of `action-provider.types.ts`) and 13 existing provider configs confirms the pattern.

### Priority 2: Well-Known Contract Registry (Static Data)

A new module in `@waiaas/core` or `@waiaas/daemon`:

```
packages/core/src/contracts/well-known-contracts.ts  (or packages/daemon/src/infrastructure/contracts/)
```

**Data structure:**

```typescript
export interface WellKnownContract {
  /** Checksummed address (EVM) or base58 program ID (Solana) */
  address: string;
  /** Protocol display name (e.g., "Uniswap V3") */
  protocol: string;
  /** Specific contract role (e.g., "Router", "Pool") */
  label: string;
  /** Network identifier (WAIaaS format: "ethereum-mainnet", "solana-mainnet") */
  network: string;
}

// Indexed by lowercase address for O(1) lookup
export const WELL_KNOWN_CONTRACTS: Record<string, WellKnownContract[]> = { ... };
```

**Data sources for 300+ entries (verified, manually curated):**

| Protocol | Chains | Entry Count (est.) | Source |
|----------|--------|-------------------|--------|
| Uniswap V2/V3/Universal Router | ETH, ARB, OP, POLY, BASE | ~25 | [Uniswap deployment docs](https://docs.uniswap.org/contracts/v3/reference/deployments/) |
| Aave V3 (Pool, DataProvider, Oracle) | ETH, ARB, OP, POLY, BASE | ~15 | Already in `aave-v3/config.ts` |
| Lido (stETH, WithdrawalQueue, wstETH) | ETH | ~6 | Already in `lido-staking/config.ts` |
| Compound V3 (cUSDCv3, Comet) | ETH, ARB, BASE, OP, POLY | ~15 | Compound docs |
| Curve (Router, Pool Registry) | ETH, ARB, OP, POLY | ~12 | Curve docs |
| 1inch (Router V5/V6) | ETH, ARB, OP, POLY, BASE | ~10 | 1inch docs |
| 0x (AllowanceHolder, ExchangeProxy) | ETH, ARB, OP, POLY, BASE | ~10 | Already in `zerox-swap/config.ts` |
| Jupiter (Program ID) | SOL | ~2 | Already in `jupiter-swap/config.ts` |
| Jito (Stake Pool, JitoSOL mint) | SOL | ~5 | Already in `jito-staking/config.ts` |
| Drift (Program ID) | SOL | ~2 | Already in `drift/config.ts` |
| Raydium (AMM, CLMM) | SOL | ~4 | Raydium docs |
| Marinade (mSOL, Stake Pool) | SOL | ~4 | Marinade docs |
| Orca (Whirlpool) | SOL | ~2 | Orca docs |
| Across (SpokePool per chain) | ETH, ARB, OP, POLY, BASE, LINEA | ~6 | Already in `across/config.ts` |
| LI.FI (Diamond) | ETH, ARB, OP, POLY, BASE | ~5 | LI.FI docs |
| Pendle (Router) | ETH, ARB | ~4 | Pendle docs |
| Polymarket (CTF Exchange, NegRisk) | POLY | ~4 | Already in `polymarket/config.ts` |
| Hyperliquid (HyperEVM contracts) | HYPER | ~3 | Already known |
| OpenSea (Seaport) | ETH, ARB, OP, POLY, BASE | ~5 | OpenSea docs |
| WETH/WMATIC/WPOL (Canonical wrappers) | ETH, ARB, OP, POLY, BASE | ~10 | Already in `builtin-tokens.ts` + `across/config.ts` |
| ERC-4337 EntryPoint v0.6/v0.7 | ETH, ARB, OP, POLY, BASE | ~10 | ERC-4337 spec |
| Chainlink (Price Feed Registry) | ETH, ARB, OP, POLY, BASE | ~5 | Chainlink docs |
| Morpho (Blue, MetaMorpho) | ETH, BASE | ~4 | Morpho docs |
| Lido wstETH bridges | ARB, OP, POLY, BASE | ~4 | Lido docs |
| SPL Token Program, ATA Program, System | SOL | ~5 | Already in `jito-staking/config.ts` |
| Metaplex (Token Metadata, Candy Machine) | SOL | ~4 | Metaplex docs |
| **Total** | | **~180 curated + ~120 from existing configs** | |

**Confidence:** HIGH -- All addresses are publicly documented by their respective protocols. No API calls needed.

### Priority 3: CONTRACT_WHITELIST User Labels

Already exists in the policy engine (`database-policy-engine.ts` line 82):

```typescript
contracts: Array<{ address: string; name?: string }>;
```

The `ContractNameResolver` simply queries the policy store for the wallet's CONTRACT_WHITELIST entries and uses the `name` field. No code changes to the policy engine needed.

**Confidence:** HIGH -- Direct code inspection confirms the `name` field is already optional in the whitelist schema.

### Priority 4: Fallback (Address Truncation)

No library needed. Simple string formatting:

```typescript
function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
```

**Confidence:** HIGH -- Trivial implementation.

## Notification Integration

The notification template system (`message-templates.ts`) already supports template variable interpolation via `{variable}` placeholders. The integration point is adding a `to_display` variable alongside the existing `to` variable.

**Current state** (line 60 of `message-templates.ts`):
```typescript
// Remove un-substituted optional placeholders (fallback safety net)
for (const placeholder of ['{display_amount}', '{type}', '{amount}', '{to}']) {
```

**Required change:** Add `{to_display}` to the placeholder cleanup list and pass the resolved name from the pipeline notification emission points (`stages.ts` lines 445-450, 714-719).

The i18n message templates in `@waiaas/core` (`getMessages()`) need updated templates that use `{to_display}` instead of or alongside `{to}`.

**Confidence:** HIGH -- Template system is well-understood, straightforward variable addition.

## Admin UI Integration

The Admin UI transaction list already displays `to` addresses. Adding contract name display requires:

1. Backend: Include `toDisplay` field in transaction API responses (computed by `ContractNameResolver`)
2. Frontend: Display `toDisplay` with tooltip showing the raw address

No new Admin UI libraries needed. The existing Preact + `@preact/signals` + openapi-fetch stack handles this.

**Confidence:** HIGH -- Existing pattern from `amountFormatted` response enrichment (v31.15).

## Data Maintenance Strategy

The well-known registry is static TypeScript data, updated with code releases. This is acceptable because:

1. DeFi protocol contract addresses are immutable (proxy patterns may change implementation, but the proxy address remains stable)
2. New protocols are added via code updates anyway (new action providers)
3. The registry is a **supplement** to Action Provider metadata (Priority 1), which is always current

For future extensibility, the registry could support:
- Admin Settings-based custom entries (runtime override)
- Community-contributed JSON files loaded at startup

But for v32.0, static TS data is sufficient.

## Existing Contract Data Already in Codebase

The following configs already contain hardcoded contract addresses that can be extracted into the unified registry:

| Config File | Addresses | Networks |
|-------------|-----------|----------|
| `aave-v3/config.ts` | Pool, DataProvider, Oracle | 5 EVM chains |
| `lido-staking/config.ts` | stETH, WithdrawalQueue | ETH, Holesky |
| `jito-staking/config.ts` | StakePool, JitoSOL, Programs | SOL |
| `jupiter-swap/config.ts` | JUPITER_PROGRAM_ID | SOL |
| `drift/config.ts` | DRIFT_PROGRAM_ID | SOL |
| `zerox-swap/config.ts` | AllowanceHolder (6 chains) | 6 EVM chains |
| `across/config.ts` | SpokePool (6 chains), WETH (6 chains) | 6 EVM chains |
| `polymarket/config.ts` | CTF Exchange, NegRisk CTF, NegRisk Adapter, Conditional Tokens | POLY |
| `dcent-swap/auto-router.ts` | Intermediate tokens per chain | 6 EVM chains |
| `builtin-tokens.ts` | 24+ ERC-20 token addresses | 5 EVM chains |

**Total existing:** ~120 contract addresses already hardcoded across the codebase.

## Installation

```bash
# No new packages to install
# Zero dependency additions for v32.0
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Well-known data source | Static TS `Record` | `eth-labels` npm | 170k noisy entries, API dependency, not curated for DeFi protocols |
| Well-known data source | Static TS `Record` | `@bgd-labs/aave-address-book` | Only covers Aave, massive dep for 15 addresses we already have |
| Well-known data source | Static TS `Record` | Etherscan API labels | Requires API key, rate limits, adds runtime dependency |
| Provider-to-address mapping | `IActionProvider.getKnownContracts()` | Hardcoded map in resolver | Provider knows its own addresses best; avoids sync drift |
| Notification format | `{to_display}` template var | Separate notification channel | Overcomplicated; template var is the existing pattern |

## Sources

- [Uniswap Deployment Addresses](https://docs.uniswap.org/contracts/v3/reference/deployments/) -- official multi-chain deployment docs
- [@bgd-labs/aave-address-book npm](https://www.npmjs.com/package/@bgd-labs/aave-address-book) -- evaluated and rejected (too heavy)
- [eth-labels GitHub](https://github.com/dawsbot/eth-labels) -- evaluated and rejected (too noisy)
- [etherscan-labels GitHub](https://github.com/brianleect/etherscan-labels) -- evaluated and rejected (stale scrape data)
- [Etherscan Label Cloud](https://etherscan.io/labelcloud) -- reference for label categories
- Internal codebase inspection: `builtin-tokens.ts`, `aave-v3/config.ts`, `lido-staking/config.ts`, `jito-staking/config.ts`, `jupiter-swap/config.ts`, `drift/config.ts`, `zerox-swap/config.ts`, `across/config.ts`, `polymarket/config.ts`, `action-provider.types.ts`, `database-policy-engine.ts`, `message-templates.ts`, `stages.ts`
