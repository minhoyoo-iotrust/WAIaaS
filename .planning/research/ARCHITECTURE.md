# Architecture Patterns: Contract Name Resolution

**Domain:** Contract name resolution for WAIaaS daemon
**Researched:** 2026-03-15

## Recommended Architecture

Contract name resolution is a **read-only enrichment layer** that maps raw contract addresses to human-readable names. It integrates at four touch points: pipeline notifications, API responses, Admin UI display, and policy management. No new services or DB tables are needed -- it layers onto existing structures.

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `ContractNameRegistry` | Static lookup: address+network -> name | Pipeline (stages.ts), API routes, Admin UI |
| `well-known-contracts.ts` | Bundled JSON data: ~200 well-known contracts per chain | ContractNameRegistry (imported at startup) |
| CONTRACT_WHITELIST `name` field | User-defined names for whitelisted contracts | DatabasePolicyEngine, ContractNameRegistry (fallback) |
| Notification templates | Display `{contractName}` variable in TX messages | message-templates.ts, i18n/en.ts + ko.ts |
| API response enrichment | Add `contractName` field to TxDetailResponse | openapi-schemas.ts, transactions.ts route |
| Admin UI | Display contract names inline with addresses | transactions.tsx, policies.tsx |

### Data Flow

```
Contract address arrives in pipeline request
       |
       v
ContractNameRegistry.resolve(address, network)
       |
       +-- 1. Check CONTRACT_WHITELIST policy (user-defined names, DB)
       +-- 2. Check well-known-contracts static map (bundled data)
       +-- 3. Check action provider metadata (if actionProvider set on request)
       |
       v
Returns: string | null  (null = unknown contract)
```

**Resolution priority:**
1. **CONTRACT_WHITELIST name** -- User explicitly named this contract. Highest trust.
2. **Well-known registry** -- Bundled static data (Uniswap, Aave, WETH, etc.)
3. **Action provider label** -- If `actionProvider` is set, derive name from provider metadata.
4. **null** -- Unknown contract. Display truncated address as fallback.

## Integration Points (New vs Modified)

### NEW Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `ContractNameRegistry` class | `packages/core/src/registries/contract-name-registry.ts` | Central lookup service, synchronous, no I/O |
| `well-known-contracts.ts` | `packages/core/src/registries/well-known-contracts.ts` | Static data: `Map<string, Map<string, string>>` keyed by network then lowercase address |

### MODIFIED Components

| Component | Location | Change |
|-----------|----------|--------|
| `PipelineContext` | `packages/daemon/src/pipeline/stages.ts` | Add `contractNameRegistry?: ContractNameRegistry` |
| `stage1Validate` | `stages.ts` | Resolve contract name, pass as `{contractName}` to notification vars |
| `stage5Execute` notify calls | `stages.ts` | Add `contractName` var to TX_CONFIRMED notifications |
| `stage3Policy` notify calls | `stages.ts` | Add `contractName` var to POLICY_VIOLATION notifications |
| `message-templates.ts` | `packages/daemon/src/notifications/templates/` | Add `{contractName}` to un-substituted placeholder fallback list |
| `i18n/en.ts` + `ko.ts` | `packages/core/src/i18n/` | Add `{contractName}` in TX_REQUESTED, TX_CONFIRMED, POLICY_VIOLATION bodies |
| `TxDetailResponseSchema` | `openapi-schemas.ts` | Add `contractName: z.string().nullable()` field |
| `transactions.ts` route | API routes | Resolve contract name when building response |
| `transactions.tsx` | Admin UI | Display `contractName` next to address in list/detail |
| `policies.tsx` | Admin UI | Show contract name in CONTRACT_WHITELIST display |
| `DatabasePolicyEngine` | `database-policy-engine.ts` | Expose helper to get name from CONTRACT_WHITELIST rules (already has `name?` field) |

## Patterns to Follow

### Pattern 1: Synchronous Registry Lookup (matches existing patterns)

**What:** ContractNameRegistry is a pure in-memory lookup with no async I/O, matching the synchronous style used by SettingsService.get() and the pipeline's existing helper functions.

**When:** Every contract address display -- notifications, API responses, Admin UI.

**Why:** The pipeline is latency-sensitive. Contract name resolution must never block or add network calls. Static data + DB cache is sufficient.

**Example:**
```typescript
// packages/core/src/registries/contract-name-registry.ts
export class ContractNameRegistry {
  // network -> lowercase(address) -> name
  private readonly wellKnown: Map<string, Map<string, string>>;

  constructor() {
    this.wellKnown = loadWellKnownContracts();
  }

  /**
   * Resolve contract address to human-readable name.
   * Priority: whitelist name > well-known > action provider > null.
   */
  resolve(
    address: string,
    network: string,
    opts?: {
      whitelistName?: string;      // from CONTRACT_WHITELIST policy
      actionProviderName?: string;  // from action provider metadata
    },
  ): string | null {
    // 1. User-defined name from CONTRACT_WHITELIST
    if (opts?.whitelistName) return opts.whitelistName;

    // 2. Well-known registry
    const networkMap = this.wellKnown.get(network);
    if (networkMap) {
      const name = networkMap.get(address.toLowerCase());
      if (name) return name;
    }

    // 3. Action provider label
    if (opts?.actionProviderName) return opts.actionProviderName;

    return null;
  }
}
```

### Pattern 2: Notification Variable Enrichment (matches existing `{type}` pattern)

**What:** Add `{contractName}` as a template variable, following the exact pattern of `{type}` label resolution in `message-templates.ts`.

**When:** CONTRACT_CALL, NFT_TRANSFER, APPROVE notifications.

**Example:**
```typescript
// In stages.ts, notification calls:
const contractName = ctx.contractNameRegistry?.resolve(
  contractAddress,
  ctx.resolvedNetwork,
  { actionProviderName: ctx.actionProviderKey },
) ?? '';

void ctx.notificationService?.notify('TX_CONFIRMED', ctx.walletId, {
  txId: ctx.txId,
  txHash,
  amount: reqAmount,
  to: reqTo,
  contractName,  // NEW: human-readable contract name
  display_amount: displayAmount,
  network: ctx.resolvedNetwork,
}, { txId: ctx.txId });
```

```typescript
// In message-templates.ts, add to fallback cleanup:
for (const placeholder of ['{display_amount}', '{type}', '{amount}', '{to}', '{contractName}']) {
  // ...existing cleanup
}
```

### Pattern 3: API Response Enrichment (matches `amountFormatted` pattern from v31.15)

**What:** Add `contractName` to TxDetailResponse, resolved at query time from the transaction's `toAddress` + `network`.

**Why:** Same pattern as `amountFormatted` and `balanceFormatted` -- computed display field added to responses without DB schema change.

**Example:**
```typescript
// In openapi-schemas.ts:
export const TxDetailResponseSchema = z.object({
  // ... existing fields
  contractName: z.string().nullable().openapi({
    description: 'Human-readable contract name (resolved from registry)',
  }),
});

// In transactions.ts route handler:
const contractName = (tx.type === 'CONTRACT_CALL' || tx.type === 'NFT_TRANSFER' || tx.type === 'APPROVE')
  ? contractNameRegistry.resolve(tx.toAddress, tx.network ?? tx.chain) ?? null
  : null;
```

### Pattern 4: Well-Known Data Structure (matches token_registry builtin pattern)

**What:** Static JSON data embedded in `@waiaas/core`, structured by network. Covers major DeFi protocols, DEX routers, bridge contracts, staking contracts.

**Why:** Follows the `source: 'builtin'` pattern from token_registry. No external API dependency. Ships with the daemon.

**Example:**
```typescript
// packages/core/src/registries/well-known-contracts.ts
export interface WellKnownContract {
  address: string;
  name: string;
  category: 'defi' | 'token' | 'bridge' | 'nft' | 'infrastructure';
  protocol?: string;  // e.g. 'uniswap', 'aave', 'lido'
}

// Structure: Record<network, WellKnownContract[]>
const WELL_KNOWN: Record<string, WellKnownContract[]> = {
  'ethereum-mainnet': [
    { address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', name: 'Uniswap V2 Router', category: 'defi', protocol: 'uniswap' },
    { address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', name: 'Uniswap V3 Router', category: 'defi', protocol: 'uniswap' },
    { address: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', name: 'Aave V3 Pool', category: 'defi', protocol: 'aave' },
    { address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', name: 'Lido stETH', category: 'defi', protocol: 'lido' },
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', name: 'WETH', category: 'token' },
    // ... ~50-100 entries per major network
  ],
  'polygon-mainnet': [ /* ... */ ],
  'arbitrum-mainnet': [ /* ... */ ],
  'base-mainnet': [ /* ... */ ],
  'solana-mainnet': [
    { address: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', name: 'Jupiter V6', category: 'defi', protocol: 'jupiter' },
    { address: 'CLMM9tUoggJu2wagPkkqs9eFG4BWhVBZWkP1qv3Sp7tR', name: 'Orca Whirlpools', category: 'defi', protocol: 'orca' },
    // ...
  ],
};
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: External API for Name Resolution
**What:** Calling Etherscan/Solscan APIs to resolve contract names at pipeline time.
**Why bad:** Adds latency to the transaction pipeline, introduces external dependency, rate limits, and privacy leakage (contract addresses sent to third party).
**Instead:** Use static well-known registry + user-defined CONTRACT_WHITELIST names. The pipeline must remain fast and self-contained.

### Anti-Pattern 2: New Database Table for Contract Names
**What:** Creating a `contract_names` table with migration.
**Why bad:** Unnecessary complexity. CONTRACT_WHITELIST already has an optional `name` field. Well-known data is static and belongs in code. No user-editable contract name feature is needed beyond what CONTRACT_WHITELIST provides.
**Instead:** Use the existing `name?` field on CONTRACT_WHITELIST rules + static well-known data in `@waiaas/core`.

### Anti-Pattern 3: Resolving Names in DatabasePolicyEngine
**What:** Making the policy engine responsible for looking up contract names.
**Why bad:** Violates single responsibility. The policy engine evaluates allow/deny decisions. Name resolution is a display concern.
**Instead:** ContractNameRegistry is a separate service. The policy engine can expose the whitelist name (it already parses the rules), but name resolution logic belongs in the registry.

### Anti-Pattern 4: Async Name Resolution in Notification Path
**What:** Making `ContractNameRegistry.resolve()` async.
**Why bad:** Notification calls are fire-and-forget (`void ctx.notificationService?.notify(...)`). Adding async name resolution before the notification call adds complexity for no benefit. The data is all in-memory.
**Instead:** Keep resolution synchronous. All data sources (well-known map, CONTRACT_WHITELIST name passed via context) are available synchronously.

## Detailed Integration: Pipeline Stages

### Stage 1 (Validate) -- Resolve and Store

```
request arrives
  -> extract contractAddress (from req.to for CONTRACT_CALL/NFT_TRANSFER/APPROVE)
  -> resolve name via ContractNameRegistry
  -> pass contractName in notification vars for TX_REQUESTED
```

No pipeline context change needed at Stage 1 beyond passing the `contractName` var.

### Stage 3 (Policy) -- Use Whitelist Name

```
policy evaluation runs
  -> if CONTRACT_WHITELIST check passes, extract matched contract's name
  -> if POLICY_VIOLATION, include contractName in notification vars
```

The `evaluateContractWhitelist` method already parses `rules.contracts[].name`. Surface the matched name via a return value enhancement or a separate helper method.

### Stage 5/6 (Execute/Confirm) -- Include in TX_CONFIRMED

```
transaction confirmed
  -> include contractName in notification vars
  -> contractName already resolved at Stage 1, carried through context or re-resolved
```

**Decision:** Re-resolve at notification time rather than carrying through context. The registry is synchronous and cheap. This avoids adding another field to PipelineContext.

### API Response -- Resolve at Query Time

```
GET /v1/wallets/:id/transactions
  -> for each tx with type CONTRACT_CALL/NFT_TRANSFER/APPROVE
  -> resolve contractName from toAddress + network
  -> include in response
```

## Suggested Build Order

Based on dependency analysis:

1. **Well-known contracts data + ContractNameRegistry** (packages/core)
   - No dependencies on other changes
   - Foundation for everything else
   - Testable in isolation

2. **i18n template updates** (packages/core)
   - Add `{contractName}` to relevant notification templates
   - Depends on: registry design (to know the variable name)

3. **Pipeline integration** (packages/daemon)
   - Add registry to PipelineContext
   - Update Stage 1/3/5/6 notification calls
   - Update message-templates.ts placeholder fallback
   - Depends on: registry + i18n

4. **API response enrichment** (packages/daemon)
   - Add `contractName` to TxDetailResponse schema
   - Resolve in transaction query routes
   - Depends on: registry

5. **Admin UI display** (packages/admin)
   - Show contract names in transaction list/detail
   - Show contract names in policy display
   - Depends on: API response changes (regenerated types)

6. **SDK/MCP exposure** (packages/sdk, packages/mcp)
   - SDK types updated via OpenAPI regeneration
   - MCP tools may surface contract name in responses
   - Depends on: API response changes

## Scalability Considerations

| Concern | Current (~100 contracts) | At 1K contracts | At 10K contracts |
|---------|--------------------------|-----------------|-------------------|
| Memory | ~10 KB static map | ~100 KB | ~1 MB (still fine) |
| Lookup | O(1) Map.get | O(1) | O(1) |
| Startup | Instant | Instant | Instant |
| Maintenance | Manual updates | Version with releases | Consider external data source |

The well-known registry is static data shipped with the daemon. At current scale (~200-500 entries across all networks), memory and performance are not concerns. If the registry grows beyond ~5K entries, consider loading from a JSON file rather than inline TypeScript, but this is unlikely to be needed.

## Sources

- `packages/daemon/src/pipeline/stages.ts` -- PipelineContext, stage functions, notification calls
- `packages/daemon/src/pipeline/database-policy-engine.ts` -- ContractWhitelistRules with `name?` field
- `packages/daemon/src/notifications/templates/message-templates.ts` -- Template variable interpolation
- `packages/daemon/src/notifications/notification-service.ts` -- NotificationService.notify() signature
- `packages/core/src/i18n/en.ts` -- Messages type structure
- `packages/daemon/src/api/routes/openapi-schemas.ts` -- TxDetailResponseSchema
- `packages/admin/src/pages/transactions.tsx` -- Admin UI transaction display
- `packages/daemon/src/infrastructure/database/schema.ts` -- token_registry pattern reference
