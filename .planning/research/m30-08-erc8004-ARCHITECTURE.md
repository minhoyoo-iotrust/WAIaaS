# Architecture Patterns: ERC-8004 Trustless Agents Integration

**Domain:** ERC-8004 on-chain agent identity/reputation/validation integration into existing WAIaaS wallet system
**Researched:** 2026-03-04
**Overall confidence:** HIGH (objective document provides detailed design; EIP spec verified against on-chain contracts)

---

## Recommended Architecture

ERC-8004 integration follows WAIaaS's established extension patterns: ActionProvider for write operations, dedicated route file for read-only queries, new PolicyType for reputation-based tier evaluation, DB migration for state tracking, and Admin UI page for management. The integration touches 7 packages but introduces no new architectural paradigms.

### System Overview

```
                    AI Agent / Admin UI
                         |
                    REST API Layer
                    /          \
         ActionProvider        Read-Only Routes
         (write ops)          (viem readContract)
              |                     |
         6-Stage Pipeline     Erc8004RegistryClient
              |                     |
         Stage 3: Policy     PublicClient (viem)
         (REPUTATION_THRESHOLD)    |
              |              EVM RPC Endpoint
         Stage 5: Execute         |
              |              On-chain Registries
         On-chain Tx         (Identity, Reputation,
                              Validation)
```

### Component Boundaries

| Component | Responsibility | Package | Communicates With |
|-----------|---------------|---------|-------------------|
| `Erc8004ActionProvider` | Resolve write actions to ContractCallRequest | packages/actions/ | ActionProviderRegistry, pipeline |
| `Erc8004RegistryClient` | viem contract read/encode wrapper for 3 registries | packages/actions/ | viem PublicClient (EVM RPC) |
| `ReputationCacheService` | In-memory + DB fallback reputation score cache | packages/daemon/ | Erc8004RegistryClient, DatabasePolicyEngine |
| `REPUTATION_THRESHOLD` evaluator | Stage 3 policy tier override based on counterparty reputation | packages/daemon/ | DatabasePolicyEngine, ReputationCacheService |
| ERC-8004 read-only routes | REST API for agent info, reputation, validation queries | packages/daemon/ | Erc8004RegistryClient |
| Registration file route | Public JSON endpoint for agent discovery | packages/daemon/ | DB (agent_identities), connect-info |
| ERC-8004 Admin page | Agent identity management UI | packages/admin/ | REST API |
| DB migration v39 | agent_identities + reputation_cache tables, approval_type column | packages/daemon/ | migrate.ts |
| Zod schemas + enums | PolicyType, NotificationEventType extensions | packages/core/ | All packages |

### Data Flow

**Write operations (e.g., register_agent):**
```
POST /v1/actions/erc8004_agent/register_agent
  -> actionRoutes handler
  -> ActionProviderRegistry.executeResolve()
  -> Erc8004ActionProvider.resolve('register_agent', params, context)
     -> Registration file JSON generation
     -> encodeFunctionData('register', [agentURI, metadata])
     -> return ContractCallRequest { type: 'CONTRACT_CALL', to: registryAddr, calldata }
  -> Stage 1-6 pipeline (standard flow)
  -> On-chain Identity Registry call
```

**Read operations (e.g., get_reputation):**
```
GET /v1/erc8004/agent/:agentId/reputation
  -> erc8004Routes handler (sessionAuth)
  -> Erc8004RegistryClient.getReputationSummary(agentId)
     -> viem readContract(getSummary) on Reputation Registry
  -> JSON response { count, summaryValue, summaryValueDecimals }
```

**Reputation policy evaluation (Stage 3):**
```
Stage 3 Policy Evaluation
  -> ... APPROVED_SPENDERS check (step 4e) ...
  -> REPUTATION_THRESHOLD evaluation (step 4f, NEW)
     -> ReputationCacheService.getScore(counterpartyAgentId)
        -> In-memory cache HIT? -> use cached score
        -> MISS -> viem readContract(getSummary) with 3s timeout
           -> Success -> cache in memory + DB, return score
           -> Failure -> DB fallback query
              -> DB HIT -> use stale score (warn log)
              -> DB MISS -> return 'unrated'
     -> score < min_score? -> maxTier(currentTier, below_threshold_tier)
     -> unrated? -> maxTier(currentTier, unrated_tier)
  -> SPENDING_LIMIT evaluation (step 5) ...
```

---

## Integration Points: New vs. Modified

### NEW Components (no existing code to modify)

| Component | Path | Description |
|-----------|------|-------------|
| `Erc8004ActionProvider` | `packages/actions/src/providers/erc8004/index.ts` | IActionProvider implementation |
| `Erc8004RegistryClient` | `packages/actions/src/providers/erc8004/erc8004-registry-client.ts` | viem contract wrapper |
| Identity/Reputation/Validation ABI files | `packages/actions/src/providers/erc8004/*-abi.ts` | const ABI arrays |
| Registration file generator | `packages/actions/src/providers/erc8004/registration-file.ts` | JSON builder |
| Zod input/output schemas | `packages/actions/src/providers/erc8004/schemas.ts` | Input validation |
| Config type + defaults | `packages/actions/src/providers/erc8004/config.ts` | Erc8004Config |
| Constants (addresses) | `packages/actions/src/providers/erc8004/constants.ts` | Multi-chain registry addresses |
| ERC-8004 read routes | `packages/daemon/src/api/routes/erc8004.ts` | 5 GET endpoints |
| ReputationCacheService | `packages/daemon/src/services/reputation-cache-service.ts` | Cache with DB fallback |
| DB tables | `agent_identities`, `reputation_cache` | State tracking |
| Admin ERC-8004 page | `packages/admin/src/pages/erc8004.tsx` | Identity + Reputation UI |
| Skill file | `skills/erc8004.skill.md` | AI agent instructions |
| REPUTATION_THRESHOLD policy form | `packages/admin/src/components/reputation-threshold-form.tsx` | Policy creation UI |

### MODIFIED Components (surgical additions to existing code)

| Component | Path | Change | Impact |
|-----------|------|--------|--------|
| `registerBuiltInProviders()` | `packages/actions/src/index.ts` | Add erc8004_agent entry to providers array | LOW -- append-only |
| `POLICY_TYPES` | `packages/core/src/enums/policy.ts` | Add 'REPUTATION_THRESHOLD' (18th entry) | LOW -- array append |
| `NOTIFICATION_EVENT_TYPES` | `packages/core/src/enums/notification.ts` | Add 5 new event types (54 -> 59 total) | LOW -- array append |
| `DatabasePolicyEngine` | `packages/daemon/src/pipeline/database-policy-engine.ts` | Add REPUTATION_THRESHOLD evaluation block after APPROVED_SPENDERS | MEDIUM -- new evaluation step |
| `pendingApprovals` schema | `packages/daemon/src/infrastructure/database/schema.ts` | Add `approvalType` column | LOW -- 1 column |
| `ApprovalWorkflow` | `packages/daemon/src/workflow/approval-workflow.ts` | Support EIP-712 approval_type, extend requestApproval | MEDIUM -- new code path |
| Policy rules schemas | `packages/core/src/schemas/policy.schema.ts` | Add ReputationThresholdRulesSchema + superRefine case | LOW -- schema addition |
| `migrate.ts` | `packages/daemon/src/infrastructure/database/migrate.ts` | Add v39 migration, bump LATEST_SCHEMA_VERSION 38->39 | LOW -- migration append |
| `schema.ts` | `packages/daemon/src/infrastructure/database/schema.ts` | Add agentIdentities + reputationCache table defs | LOW -- table append |
| `connect-info.ts` | `packages/daemon/src/api/routes/connect-info.ts` | Add erc8004 field to ConnectInfoResponse | LOW -- optional field |
| Admin layout | `packages/admin/src/components/layout.tsx` | Add ERC-8004 nav item + page import | LOW -- 1 entry |
| Admin policies page | `packages/admin/src/pages/policies.tsx` | Add REPUTATION_THRESHOLD form component | LOW -- 1 form case |
| Admin actions page | `packages/admin/src/pages/actions.tsx` | Add erc8004_agent to BUILTIN_PROVIDERS | LOW -- 1 entry |
| SDK client | `packages/sdk/src/client.ts` | Add 11 methods (8 write + 3 read) | LOW -- method additions |
| MCP server | `packages/daemon/src/api/routes/mcp.ts` | Add 3 read-only tools | LOW -- tool registration |
| Settings definitions | (settings init) | Add 9 Admin Settings keys for erc8004 | LOW -- key additions |

---

## Patterns to Follow

### Pattern 1: ActionProvider Registration (established pattern)

ERC-8004 follows the exact same registration pattern as all 9 existing providers. No new patterns needed.

```typescript
// packages/actions/src/index.ts -- add to providers array
{
  key: 'erc8004_agent',
  enabledKey: 'actions.erc8004_agent_enabled',
  factory: () => {
    const config: Erc8004Config = {
      enabled: true,
      identityRegistryAddress: settingsReader.get('actions.erc8004_identity_registry_address'),
      reputationRegistryAddress: settingsReader.get('actions.erc8004_reputation_registry_address'),
      validationRegistryAddress: settingsReader.get('actions.erc8004_validation_registry_address'),
      registrationFileBaseUrl: settingsReader.get('actions.erc8004_registration_file_base_url'),
      reputationCacheTtlSec: Number(settingsReader.get('actions.erc8004_reputation_cache_ttl_sec')),
    };
    return new Erc8004ActionProvider(config);
  },
},
```

**Confidence:** HIGH -- identical to 9 existing providers

### Pattern 2: Read-Only Query Routes (separate from ActionProvider)

Read-only operations bypass the pipeline entirely. They use `viem readContract()` directly and return JSON. This follows WAIaaS's existing separation where `IActionProvider.resolve()` returns `ContractCallRequest` (write-only).

```typescript
// packages/daemon/src/api/routes/erc8004.ts
const getAgentInfoRoute = createRoute({
  method: 'get',
  path: '/erc8004/agent/{agentId}',
  tags: ['ERC-8004'],
  // ...
});

router.openapi(getAgentInfoRoute, async (c) => {
  const { agentId } = c.req.valid('param');
  // Direct viem readContract -- no pipeline involvement
  const client = new Erc8004RegistryClient(publicClient, config);
  const info = await client.getAgentInfo(BigInt(agentId));
  return c.json(info, 200);
});
```

**Why separate routes instead of a query method on IActionProvider:**
- `IActionProvider.resolve()` contract says "MUST return ContractCallRequest"
- Read operations return data, not transactions
- Existing defi-positions, staking, and incoming routes already follow this read-only pattern
- Keeps ActionProvider pure (write) and routes pure (read)

**Confidence:** HIGH -- consistent with existing defi-positions/staking routes

### Pattern 3: Provider-Trust Bypass (automatic)

The existing `provider-trust` mechanism in DatabasePolicyEngine automatically bypasses CONTRACT_WHITELIST for registered ActionProviders. Since `Erc8004ActionProvider` targets the Identity/Reputation/Validation Registry addresses, these addresses do NOT need manual addition to CONTRACT_WHITELIST policies.

```
DatabasePolicyEngine.evaluateContractWhitelist():
  if (transaction.actionProvider === 'erc8004_agent' && providerIsEnabled)
    -> SKIP CONTRACT_WHITELIST check (trusted provider)
```

This is automatic -- no code changes needed for the whitelist bypass.

**Confidence:** HIGH -- verified in database-policy-engine.ts line 1137-1140

### Pattern 4: Reputation Cache (in-memory + DB fallback)

```typescript
// ReputationCacheService -- follows BalanceMonitorService caching pattern
export class ReputationCacheService {
  private readonly cache = new Map<string, CachedScore>();
  private readonly ttlMs: number;

  constructor(
    private readonly registryClient: Erc8004RegistryClient,
    private readonly db: BetterSQLite3Database<typeof schema>,
    ttlSec: number = 300,
  ) {
    this.ttlMs = ttlSec * 1000;
  }

  async getScore(agentId: string, registryAddress: string, tag1 = '', tag2 = ''): Promise<ReputationResult> {
    const key = `${agentId}:${registryAddress}:${tag1}:${tag2}`;

    // 1. In-memory cache check
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      return { score: cached.score, source: 'memory' };
    }

    // 2. On-chain query with timeout
    try {
      const result = await Promise.race([
        this.registryClient.getReputationSummary(BigInt(agentId), [], tag1, tag2),
        rejectAfterMs(3000), // configurable via settings
      ]);
      const normalized = this.normalizeScore(result);
      this.cache.set(key, { score: normalized, timestamp: Date.now() });
      this.persistToDb(agentId, registryAddress, tag1, tag2, normalized, result);
      return { score: normalized, source: 'onchain' };
    } catch {
      // 3. DB fallback
      const dbRow = this.queryDbCache(agentId, registryAddress, tag1, tag2);
      if (dbRow) {
        return { score: this.normalizeScore(dbRow), source: 'db_stale' };
      }
      return { score: null, source: 'unrated' };
    }
  }
}
```

**Confidence:** HIGH -- Map cache + DB fallback is a proven WAIaaS pattern (BalanceMonitorService, PriceOracle)

### Pattern 5: REPUTATION_THRESHOLD Policy Evaluation Position

REPUTATION_THRESHOLD sits at position 4f in the evaluation order -- after all deny-list checks (ALLOWED_NETWORKS, CONTRACT_WHITELIST, METHOD_WHITELIST, ALLOWED_TOKENS, APPROVED_SPENDERS) but before SPENDING_LIMIT.

**Rationale for this position:**
1. Deny-list policies (steps 4a-4e) reject unconditionally -- reputation cannot override a blocked contract
2. REPUTATION_THRESHOLD can only RAISE the tier (never lower) -- `maxTier(currentTier, reputationTier)`
3. SPENDING_LIMIT (step 5) runs after reputation so that reputation-elevated tiers feed into spending classification
4. DeFi-specific policies (LENDING/PERP) are domain-specific and independent of reputation

```typescript
// In DatabasePolicyEngine.evaluate() -- add after evaluateApprovedSpenders()
// Step 4f: REPUTATION_THRESHOLD
const reputationResult = this.evaluateReputationThreshold(walletId, transaction);
if (reputationResult?.denied) return reputationResult;
if (reputationResult?.tier) {
  currentTier = maxTier(currentTier, reputationResult.tier);
}
```

**Confidence:** HIGH -- evaluation order documented in objective, consistent with existing policy engine structure

### Pattern 6: EIP-712 Typed Data in ApprovalWorkflow

`setAgentWallet` requires an EIP-712 signature from the wallet owner. This extends the existing ApprovalWorkflow with a new `approval_type` discriminator.

**Critical correction from research:** The on-chain typehash is `AgentWalletSet` (NOT `SetAgentWallet`), and includes `owner` in the struct:

```typescript
// VERIFIED from on-chain contract (IdentityRegistryUpgradeable.sol line 60)
const AGENT_WALLET_SET_TYPEHASH = {
  AgentWalletSet: [
    { name: 'agentId', type: 'uint256' },
    { name: 'newWallet', type: 'address' },
    { name: 'owner', type: 'address' },     // IMPORTANT: includes owner
    { name: 'deadline', type: 'uint256' },
  ],
};

const EIP712_DOMAIN = {
  name: 'ERC8004IdentityRegistry',     // VERIFIED from contract initialize()
  version: '1',
  // chainId and verifyingContract filled at runtime
};
```

**No nonce mechanism** -- the contract uses deadline-only replay protection (max 5 minutes forward).

**Approval flow:**
1. Agent calls `POST /v1/actions/erc8004_agent/set_agent_wallet`
2. Pipeline reaches Stage 3 -> APPROVAL tier
3. `ApprovalWorkflow.requestApproval(txId, { approvalType: 'EIP712', typedData: {...} })`
4. pending_approvals row created with `approval_type = 'EIP712'`
5. Owner receives notification (all channels for alert; WalletConnect/Admin UI for signing)
6. Owner signs EIP-712 typed data via WalletConnect `eth_signTypedData_v4` or Admin UI
7. Signature submitted to `POST /v1/approvals/:id/sign` (new endpoint or extended approve)
8. Signature injected into `setAgentWallet` calldata
9. Pipeline resumes Stage 5 -> submit to Identity Registry

**Channel constraints:** EIP-712 typed data signing is only possible via WalletConnect or Admin UI. Text-based channels (Ntfy, Telegram) can only notify -- they cannot collect structured signatures.

**Confidence:** HIGH -- EIP-712 domain/typehash verified from deployed contract source

### Pattern 7: Registration File Serving

Registration files are served as public JSON at `GET /v1/erc8004/registration-file/:walletId` with no auth required. This matches the ERC-8004 spec's expectation that registration files are publicly discoverable.

```typescript
// erc8004.ts routes -- public endpoint (no sessionAuth middleware)
const registrationFileRoute = createRoute({
  method: 'get',
  path: '/erc8004/registration-file/{walletId}',
  tags: ['ERC-8004'],
  security: [], // No auth required
  // ...
});
```

The registration file is generated dynamically from:
- `agent_identities` DB row (agentId, status)
- `wallets` DB row (chain, environment)
- Daemon config (base URL, port)
- connect-info capabilities

**Integration with connect-info:** The `ConnectInfoResponse` gains an optional `erc8004` field:
```typescript
erc8004?: {
  agentId: string;
  identityRegistry: string;
  chainId: number;
  registrationFileUrl: string;
  status: 'PENDING' | 'REGISTERED' | 'WALLET_LINKED' | 'DEREGISTERED';
};
```

**Confidence:** HIGH -- follows existing public endpoint patterns (health, OpenAPI spec)

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Mixing Read and Write in resolve()

**What:** Temptation to add read-only query methods to `IActionProvider.resolve()` that return data instead of `ContractCallRequest`.

**Why bad:** `resolve()` contract requires `ContractCallRequest` return. ActionProviderRegistry validates the return value via `ContractCallRequestSchema.parse()`. Returning anything else will throw `ACTION_RETURN_INVALID`.

**Instead:** Use dedicated REST routes (`/v1/erc8004/...`) for read-only queries, backed by `Erc8004RegistryClient.readContract()`.

### Anti-Pattern 2: Reputation Check Blocking Pipeline

**What:** Making the reputation RPC call synchronous without timeout in Stage 3 policy evaluation.

**Why bad:** If the EVM RPC is slow or down, every transaction in the pipeline would be blocked waiting for reputation data. Stage 3 must complete quickly.

**Instead:** 3-second timeout on readContract, in-memory cache hit path (zero latency), DB fallback for stale data, and `unrated_tier` as final fallback. Never block the pipeline on external RPC.

### Anti-Pattern 3: Hardcoding Registry Addresses

**What:** Putting registry contract addresses directly in provider code.

**Why bad:** ERC-8004 is deployed on 10+ chains with consistent addresses, but addresses could change for testnets or custom deployments.

**Instead:** Use Admin Settings keys (`actions.erc8004_identity_registry_address`, etc.) with mainnet defaults. Override per-deployment via Settings UI.

### Anti-Pattern 4: Reputation Lowering Security Tier

**What:** Allowing REPUTATION_THRESHOLD to LOWER the policy tier (e.g., high reputation -> skip APPROVAL).

**Why bad:** A compromised agent with farmed reputation could bypass spending limits. Security tiers should only go UP, never down.

**Instead:** `maxTier(currentTier, reputationTier)` -- reputation can only escalate, never de-escalate.

### Anti-Pattern 5: Validation Registry Blocking Pipeline (Stage 3.5)

**What:** Automatically inserting a validation step between Stage 3 and Stage 4 for high-value transactions.

**Why bad:** This requires a new pipeline stage, introduces polling delays (10+ minutes for validator response), and significantly increases pipeline complexity. The objective document explicitly defers this.

**Instead:** m30-08 provides manual `request_validation` action only. Automatic validation integration is a separate future milestone.

---

## Build Order (Dependency-Driven)

The build order is dictated by component dependencies. Each phase can be implemented independently once its dependencies are met.

### Phase 1: Foundation Layer (no dependencies)

**Components:** Core enums + Zod schemas + DB migration

1. Add `REPUTATION_THRESHOLD` to `POLICY_TYPES` in `packages/core/src/enums/policy.ts`
2. Add 5 notification events to `NOTIFICATION_EVENT_TYPES` in `packages/core/src/enums/notification.ts`
3. Add `ReputationThresholdRulesSchema` to `packages/core/src/schemas/policy.schema.ts`
4. Add `agentIdentities` + `reputationCache` table definitions to `schema.ts`
5. Add `approvalType` column to `pendingApprovals` in `schema.ts`
6. Write v39 migration in `migrate.ts`, bump `LATEST_SCHEMA_VERSION` to 39
7. Write migration chain test

**Rationale:** Everything else depends on these types and DB tables. Zero risk of integration conflicts.

### Phase 2: ActionProvider + Registry Client

**Dependencies:** Phase 1 (Zod schemas for input validation)

1. Create `packages/actions/src/providers/erc8004/` directory structure
2. Write ABI const files (`identity-abi.ts`, `reputation-abi.ts`, `validation-abi.ts`)
3. Implement `Erc8004RegistryClient` (viem readContract + encodeFunctionData wrappers)
4. Implement `Erc8004ActionProvider` with 8 write actions
5. Write `registration-file.ts` JSON builder
6. Write `config.ts` + `constants.ts` (multi-chain addresses)
7. Register in `registerBuiltInProviders()` (1 entry addition)
8. Add Admin Settings keys (9 keys)
9. Unit tests for resolve(), registry client, registration file

**Rationale:** ActionProvider is the core integration. All write operations flow through it. Read-only routes and policy depend on the registry client.

### Phase 3: Read-Only Routes + Registration File Serving

**Dependencies:** Phase 2 (Erc8004RegistryClient)

1. Create `packages/daemon/src/api/routes/erc8004.ts`
2. Implement 4 read-only endpoints (agent info, reputation, feedback, validation status)
3. Implement registration file public endpoint (no auth)
4. Register routes in `packages/daemon/src/api/routes/index.ts`
5. Extend `ConnectInfoResponse` with `erc8004` optional field
6. Integration tests for all 5 GET endpoints

**Rationale:** Read-only routes depend on RegistryClient but are independent of policy changes and approval flow.

### Phase 4: REPUTATION_THRESHOLD Policy Engine + Cache

**Dependencies:** Phase 1 (PolicyType enum), Phase 2 (RegistryClient)

1. Implement `ReputationCacheService` (Map + DB fallback + RPC timeout)
2. Add REPUTATION_THRESHOLD evaluation to `DatabasePolicyEngine`
3. Position at step 4f (after APPROVED_SPENDERS, before SPENDING_LIMIT)
4. Implement `maxTier()` escalation-only logic
5. Unit tests: cache hit/miss/stale, policy tier escalation, unrated fallback

**Rationale:** Policy engine change is the most architecturally sensitive modification. It should be isolated and thoroughly tested.

### Phase 5: ApprovalWorkflow EIP-712 Extension

**Dependencies:** Phase 1 (approval_type column), Phase 2 (ActionProvider produces APPROVAL-tier txs)

1. Extend `ApprovalWorkflow.requestApproval()` to accept `approvalType` parameter
2. Add `approval_type` column handling in pending_approvals queries
3. Implement EIP-712 typed data construction for `setAgentWallet`
4. Extend `POST /v1/approvals/:id` (approve endpoint) to accept EIP-712 signatures
5. Integrate with WalletConnect `eth_signTypedData_v4` flow
6. Unit tests: EIP-712 signature construction, approval type routing

**Rationale:** EIP-712 signing is the most complex new capability. It builds on the existing approval infrastructure but adds a new signature type.

### Phase 6: Admin UI + MCP + SDK

**Dependencies:** Phases 2-5 (all backend components ready)

1. Create `packages/admin/src/pages/erc8004.tsx` (Identity management + Reputation dashboard)
2. Add REPUTATION_THRESHOLD form to policies page
3. Add erc8004_agent to actions page BUILTIN_PROVIDERS
4. Add nav item to layout.tsx
5. Add 3 read-only MCP tools
6. Add 11 SDK methods (8 write + 3 read)
7. Create `skills/erc8004.skill.md`
8. Update `skills/policies.skill.md` and `skills/admin.skill.md`
9. UI rendering tests

**Rationale:** Frontend and SDK are pure consumers of backend APIs. Building them last ensures API stability.

### Phase 7: Notification Events + Integration Testing

**Dependencies:** All phases

1. Wire 5 notification events to their trigger points
2. E2E integration tests (pipeline flow with ERC-8004 actions)
3. Verify provider-trust bypass works for registry addresses
4. Verify feature gate (`erc8004_agent_enabled = false` -> provider not registered)
5. Cross-validate DB migration v38 -> v39 (policies table recreation, data integrity)

---

## Critical Architectural Decisions

### D1: Validation Registry Address -- Research Required

The Validation Registry contract address is NOT confirmed deployed. Research shows:
- Identity Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (CONFIRMED, multi-chain)
- Reputation Registry: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` (CONFIRMED, multi-chain)
- Validation Registry: **Under technical due diligence, not yet accessible**

**Impact:** `request_validation` action may need to be deferred or conditionally enabled based on contract availability. The Admin Settings key `actions.erc8004_validation_registry_address` provides runtime configurability regardless.

**Confidence:** MEDIUM -- Identity/Reputation verified, Validation status uncertain

### D2: EIP-712 TypeHash Correction

The objective document uses `SetAgentWallet` as the typehash name with 3 fields. The actual on-chain contract uses `AgentWalletSet` with 4 fields (includes `owner`). This is a CRITICAL correction.

```
// OBJECTIVE DOCUMENT (INCORRECT):
SetAgentWallet(uint256 agentId, address newWallet, uint256 deadline)

// ON-CHAIN CONTRACT (CORRECT):
AgentWalletSet(uint256 agentId, address newWallet, address owner, uint256 deadline)
```

The domain name is `ERC8004IdentityRegistry` (not a generic name).

**Confidence:** HIGH -- verified from deployed contract source code

### D3: Agent Identifier Format Correction

The objective document uses `:` separator between registry and agentId:
```
eip155:1:0xAbC...Def:42
```

The EIP spec uses `#` separator:
```
eip155:1:0xAbC...Def#42
```

Implementation should follow the EIP spec (`#` separator).

**Confidence:** HIGH -- verified from EIP spec

### D4: Multi-Chain Registry Support

ERC-8004 registries are deployed on 10+ EVM chains with **consistent addresses** (same address on Ethereum, Base, Polygon, Arbitrum, etc.). WAIaaS's multi-chain EVM wallet model supports this naturally -- a wallet on `ethereum-mainnet` and a wallet on `polygon-mainnet` interact with the same registry address but on different chains.

The `agent_identities` table includes `chain_id` to track which chain the registration occurred on.

**Confidence:** HIGH -- multi-chain addresses verified from erc-8004-contracts repo

### D5: Upgradeable Contracts

The deployed registries use the Upgradeable pattern (IdentityRegistryUpgradeable, ReputationRegistryUpgradeable). This means:
- ABIs may change with contract upgrades
- Proxy addresses remain stable
- ABI verification during research phase is essential

WAIaaS mitigates this by storing ABI as typed constants that can be updated in code without changing architecture.

**Confidence:** HIGH -- Upgradeable pattern confirmed from repo

### D6: Sepolia Testnet Addresses

Testnet addresses are also available for development:
- Identity Registry (Sepolia): `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- Reputation Registry (Sepolia): `0x8004B663056A597Dffe9eCcC1965A193B7388713`

These should be auto-selected when wallet.environment === 'testnet'.

**Confidence:** HIGH -- verified from erc-8004-contracts repo

### D7: MetadataSet Event Correction

The objective document shows `MetadataSet(uint256 indexed agentId, string indexed metadataKey, bytes metadataValue)`. The actual EIP spec has an additional non-indexed `string metadataKey` parameter alongside the indexed one:

```solidity
event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue);
```

**Confidence:** HIGH -- verified from EIP specification

### D8: ResponseAppended Event (Missing from Objective)

The EIP spec includes an event not mentioned in the objective:
```solidity
event ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, address indexed responder, string responseURI, bytes32 responseHash);
```

Although `appendResponse` is out of scope for m30-08, the ABI file should include this event for completeness.

**Confidence:** HIGH -- verified from EIP specification

---

## Scalability Considerations

| Concern | Current Scope | At Scale (1000+ agents) | Mitigation |
|---------|--------------|------------------------|------------|
| Reputation cache memory | Map<string, CachedScore>, ~200 bytes/entry | ~200KB for 1000 entries | TTL-based eviction, bounded |
| RPC calls per transaction | 0-1 readContract per tx (cached) | Same (cache hit rate 95%+) | 5-min TTL cache, DB fallback |
| DB reputation_cache rows | 1 row per agent-tag combo | ~5000 rows max | Composite PK, no growth issue |
| agent_identities rows | 1 per wallet-registry pair | Linear with wallets | Indexed on wallet_id |
| Registration file serving | Dynamic JSON generation | Sub-ms generation | Could add ETag caching if needed |

---

## Sources

- [ERC-8004 EIP Specification](https://eips.ethereum.org/EIPS/eip-8004) -- Draft status, full ABI definitions
- [erc-8004-contracts GitHub](https://github.com/erc-8004/erc-8004-contracts) -- Deployed contract addresses, Hardhat source
- [IdentityRegistryUpgradeable.sol source](https://github.com/erc-8004/erc-8004-contracts/blob/main/contracts/IdentityRegistryUpgradeable.sol) -- EIP-712 typehash, domain separator (verified)
- [awesome-erc8004](https://github.com/sudeepb02/awesome-erc8004) -- Ecosystem resources
- [ERC-8004 Mainnet Launch](https://bitcoinethereumnews.com/tech/erc-8004-mainnet-launch-what-this-agent-protocol-actually-does/) -- January 29, 2026 launch confirmation
- [Composable Security Explainer](https://composable-security.com/blog/erc-8004-a-practical-explainer-for-trustless-agents/) -- Practical implementation details
- Existing WAIaaS codebase verification: `packages/actions/src/index.ts` (registerBuiltInProviders pattern), `packages/daemon/src/pipeline/database-policy-engine.ts` (policy evaluation order), `packages/daemon/src/workflow/approval-workflow.ts` (approval flow), `packages/core/src/enums/policy.ts` (17 PolicyTypes), `packages/core/src/enums/notification.ts` (54 notification events), `packages/core/src/interfaces/action-provider.types.ts` (IActionProvider contract)
