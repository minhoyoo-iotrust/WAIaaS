# Architecture Patterns: External Action Framework

**Domain:** ActionProvider framework extension (on-chain tx-centric -> action-centric model)
**Researched:** 2026-03-11
**Confidence:** HIGH (based on direct codebase analysis of existing architecture)

---

## Recommended Architecture

### Overview

External Action framework extends WAIaaS from `ContractCallRequest`-only ActionProvider resolution to a `ResolvedAction` union type system. The extension follows a **widening strategy**: existing pipelines remain untouched, new `kind`-based routing branches off after `ActionProviderRegistry.executeResolve()`.

```
                                  ActionProviderRegistry.executeResolve()
                                              |
                                     ResolvedAction union
                                    /         |            \
                     kind:'contractCall'  kind:'signedData'  kind:'signedHttp'
                           |                  |                   |
                    [existing path]    SignedDataPipeline    SignedHttpPipeline
                    6-stage pipeline   (sign-message ext)   (ERC-8128 integration)
                           |                  |                   |
                    IChainAdapter       ISignerCapability    ISignerCapability
                    .signTransaction()  .sign()              .sign()
                           |                  |                   |
                    transactions DB     transactions DB      transactions DB
                    (status tracking)   (+ externalActionStatus)
```

### Component Boundaries

| Component | Responsibility | Package | Communicates With |
|-----------|---------------|---------|-------------------|
| **ResolvedAction (Zod union)** | Type system: `kind` discriminant for 3 action types | `@waiaas/core` | ActionProviderRegistry, Pipeline Router |
| **ActionProviderRegistry** (modified) | Normalize `kind`, route to correct pipeline | `@waiaas/daemon` | IActionProvider, Pipeline stages, ISignerCapability |
| **ISignerCapability** (new interface) | Unified signing abstraction over 7 schemes | `@waiaas/core` | SignerCapabilityRegistry, Pipelines |
| **SignerCapabilityRegistry** (new) | `signingScheme -> ISignerCapability` mapping | `@waiaas/daemon` | ISignerCapability adapters, Pipeline Router |
| **Eip712SignerCapability** (new adapter) | Wraps existing `sign-message.ts` typedData path | `@waiaas/daemon` | sign-message.ts (unchanged) |
| **PersonalSignCapability** (new adapter) | Wraps existing `sign-message.ts` personal path | `@waiaas/daemon` | sign-message.ts (unchanged) |
| **Erc8128SignerCapability** (new adapter) | Wraps existing `http-message-signer.ts` | `@waiaas/daemon` | http-message-signer.ts (unchanged) |
| **HmacSignerCapability** (new) | HMAC-SHA256 signing for CEX API auth | `@waiaas/daemon` | node:crypto |
| **RsaPssSignerCapability** (new) | RSA-PSS signing for external API auth | `@waiaas/daemon` | node:crypto |
| **CredentialVault** (new) | Per-wallet encrypted credential CRUD | `@waiaas/daemon` | settings-crypto.ts (reuse), wallet_credentials table |
| **CredentialResolver** (new) | Resolve credentialRef: per-wallet -> global fallback | `@waiaas/daemon` | CredentialVault, SettingsService |
| **ExternalActionTracker** (new) | IAsyncStatusTracker impl for off-chain action states | `@waiaas/actions` | AsyncPollingService (existing) |
| **Pipeline Router** (new function) | Route ResolvedAction.kind to correct execution path | `@waiaas/daemon` | stage5Execute (existing), SignedDataPipeline, SignedHttpPipeline |

### Data Flow

#### Path A: Existing ContractCallRequest (unchanged)

```
1. POST /v1/actions/:provider/:action
2. ActionProviderRegistry.executeResolve() -> ContractCallRequest (kind absent)
3. Registry normalizes: adds kind:'contractCall'
4. Pipeline Router -> existing 6-stage pipeline (zero changes)
5. Stage 5: IChainAdapter.signTransaction() / ApiDirectResult branch
```

#### Path B: SignedDataAction (new)

```
1. POST /v1/actions/:provider/:action
2. ActionProviderRegistry.executeResolve() -> SignedDataAction (kind:'signedData')
3. Pipeline Router -> SignedDataPipeline
4. Policy evaluation (venue whitelist + action category + spending check)
5. CredentialResolver: resolve credentialRef (per-wallet -> global fallback)
6. SignerCapabilityRegistry.get(signingScheme) -> ISignerCapability
7. ISignerCapability.sign(payload, key/credential)
8. Submit to venue API (if submitUrl provided)
9. DB record: transactions row + external_action_status metadata
10. Optional: register ExternalActionTracker for async status polling
```

#### Path C: SignedHttpAction (new)

```
1. POST /v1/actions/:provider/:action
2. ActionProviderRegistry.executeResolve() -> SignedHttpAction (kind:'signedHttp')
3. Pipeline Router -> SignedHttpPipeline
4. Policy evaluation (ERC8128_ALLOWED_DOMAINS + venue whitelist)
5. Erc8128SignerCapability.sign() (wraps existing http-message-signer.ts)
6. Execute HTTP request with signed headers
7. DB record: transactions row + response metadata
```

---

## Integration Points (Existing -> Modified -> New)

### 1. IActionProvider.resolve() Return Type -- MODIFIED

**Current:**
```typescript
resolve(...): Promise<ContractCallRequest | ContractCallRequest[] | ApiDirectResult>;
```

**Extended:**
```typescript
resolve(...): Promise<ResolvedAction | ResolvedAction[] | ApiDirectResult>;

type ResolvedAction =
  | ContractCallRequest      // kind?: 'contractCall' (optional for backward compat)
  | SignedDataAction          // kind: 'signedData'
  | SignedHttpAction          // kind: 'signedHttp'
```

**Backward Compatibility:** `ContractCallRequest` gains optional `kind?: 'contractCall'`. Existing providers return without `kind`; the registry normalizes by adding `kind: 'contractCall'` post-parse. Zero changes to existing 20+ providers.

**File:** `packages/core/src/interfaces/action-provider.types.ts`

### 2. ActionProviderRegistry.executeResolve() -- MODIFIED

**Current behavior:** Returns `(ContractCallRequest | ApiDirectResult)[]`
**Extended behavior:** Returns `(ResolvedAction | ApiDirectResult)[]`

Changes:
- After `resolve()` returns, check `kind` field
- If absent (legacy ContractCallRequest), normalize: add `kind: 'contractCall'`, then `ContractCallRequestSchema.parse()` as before
- If `kind: 'signedData'`, validate with `SignedDataActionSchema.parse()`
- If `kind: 'signedHttp'`, validate with `SignedHttpActionSchema.parse()`
- Auto-tag `actionProvider`/`actionName` on all types (not just ContractCallRequest)

**File:** `packages/daemon/src/infrastructure/action/action-provider-registry.ts`

### 3. Pipeline Stage 5 -- MODIFIED (branch point)

**Current:** `stage5Execute()` branches on `ctx.actionResult` (ApiDirectResult) and `ctx.wallet.accountType` (smart account).

**Extended:** Add a third branch on `ctx.resolvedActionKind`:

```typescript
export async function stage5Execute(ctx: PipelineContext): Promise<void> {
  // Existing: Smart account path
  if (ctx.wallet.accountType === 'smart') { ... }

  // Existing: ApiDirectResult path
  if (ctx.actionResult) { ... }

  // NEW: SignedData path
  if (ctx.resolvedActionKind === 'signedData') {
    await stage5ExecuteSignedData(ctx);
    return;
  }

  // NEW: SignedHttp path
  if (ctx.resolvedActionKind === 'signedHttp') {
    await stage5ExecuteSignedHttp(ctx);
    return;
  }

  // Existing: on-chain TX path (unchanged)
  ...
}
```

**File:** `packages/daemon/src/pipeline/stages.ts`

### 4. PipelineContext -- MODIFIED

Add fields to carry ResolvedAction data through the pipeline:

```typescript
export interface PipelineContext {
  // ... existing fields ...

  // NEW: External action fields
  resolvedActionKind?: 'contractCall' | 'signedData' | 'signedHttp';
  signedDataAction?: SignedDataAction;
  signedHttpAction?: SignedHttpAction;
  credentialRef?: string;  // resolved credential reference
}
```

**File:** `packages/daemon/src/pipeline/stages.ts`

### 5. TransactionParam -- MODIFIED (policy context)

**Current:** 12 fields for on-chain TX policy evaluation.

**Extended:** Add off-chain action context:

```typescript
interface TransactionParam {
  // ... existing fields ...

  // NEW: Off-chain action policy context
  venue?: string;              // e.g., 'cow_protocol', 'binance', 'erc8128'
  actionCategory?: 'trade' | 'withdraw' | 'transfer' | 'sign' | 'query';
  notionalUsd?: number;        // estimated USD value for spending limit
  leverage?: number;           // for leveraged trading venues
  hasWithdrawCapability?: boolean;  // venue can withdraw to external address
}
```

**File:** `packages/daemon/src/pipeline/database-policy-engine.ts`, `packages/daemon/src/pipeline/stages.ts`

### 6. DatabasePolicyEngine -- MODIFIED (2 new policy types)

Add evaluation steps after existing step 4i-c:

- **4j. VENUE_WHITELIST**: Deny if `venue` not in allowed venues (default-deny, follows CONTRACT_WHITELIST pattern)
- **4k. ACTION_CATEGORY_LIMIT**: Per-category spending limits (follows SPENDING_LIMIT pattern, keyed by `actionCategory`)

**File:** `packages/daemon/src/pipeline/database-policy-engine.ts`

### 7. ActionDefinition -- MODIFIED

Add optional field for off-chain action metadata:

```typescript
export const ActionDefinitionSchema = z.object({
  // ... existing fields ...

  // NEW: signing scheme hint for pipeline routing
  signingScheme: z.enum([
    'eip712', 'personal', 'hmac-sha256', 'rsa-pss',
    'ecdsa-secp256k1', 'ed25519', 'erc8128',
  ]).optional(),

  // NEW: venue identifier for policy evaluation
  venue: z.string().optional(),

  // NEW: action category for category-based policies
  actionCategory: z.enum(['trade', 'withdraw', 'transfer', 'sign', 'query']).optional(),
});
```

**File:** `packages/core/src/interfaces/action-provider.types.ts`

### 8. AsyncPollingService.pollAll() -- MODIFIED (query expansion)

**Current:** Queries `bridge_status IN ('PENDING', 'BRIDGE_MONITORING') OR status = 'GAS_WAITING'`.

**Extended:** Add `OR external_action_status IN ('PENDING', 'PARTIALLY_FILLED')` to pick up external action tracking targets. The `resolveTrackerName()` method reads `metadata.tracker` to find the correct tracker (existing pattern).

**File:** `packages/daemon/src/services/async-polling-service.ts`

### 9. transactions Table -- MODIFIED (1 new column)

Add `external_action_status` column to store off-chain action lifecycle state:

```sql
ALTER TABLE transactions ADD COLUMN external_action_status TEXT
  CHECK(external_action_status IN (
    'PENDING', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED',
    'SETTLED', 'EXPIRED', 'COMPLETED', 'FAILED'
  ));

CREATE INDEX idx_transactions_external_action_status
  ON transactions(external_action_status)
  WHERE external_action_status IS NOT NULL;
```

This follows the `bridge_status` column pattern. NULL for on-chain TX (no impact on existing queries).

**DB migration:** v55

**File:** `packages/daemon/src/infrastructure/database/schema.ts`, migration script

### 10. wallet_credentials Table -- NEW

```sql
CREATE TABLE wallet_credentials (
  id TEXT PRIMARY KEY,                    -- UUID v7
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('api-key', 'hmac-secret', 'rsa-private-key', 'session-token', 'custom')),
  name TEXT NOT NULL,                     -- human-readable name (e.g., 'binance_api_key')
  encrypted_value TEXT NOT NULL,          -- AES-256-GCM via settings-crypto.ts
  metadata TEXT,                          -- JSON: { exchange, permissions, ... }
  expires_at INTEGER,                     -- Unix timestamp (seconds), NULL = no expiry
  created_at INTEGER NOT NULL,            -- Unix timestamp (seconds)
  updated_at INTEGER NOT NULL,            -- Unix timestamp (seconds)
  UNIQUE(wallet_id, name)                 -- one credential per name per wallet
);

CREATE INDEX idx_wallet_credentials_wallet_id ON wallet_credentials(wallet_id);
```

**DB migration:** v55 (same migration as external_action_status)

### 11. REST API Routes -- MODIFIED

**Existing `POST /v1/actions/:provider/:action`** handles all 3 kinds. No new endpoints for action execution. The pipeline router inside the handler dispatches based on `kind`.

**New credential management endpoints:**

```
POST   /v1/wallets/:walletId/credentials     -- Create credential (sessionAuth)
GET    /v1/wallets/:walletId/credentials     -- List credentials (masked values)
DELETE /v1/wallets/:walletId/credentials/:id -- Delete credential
PUT    /v1/wallets/:walletId/credentials/:id -- Rotate credential
```

### 12. SettingsService + CredentialVault Coexistence

```
Credential Resolution Priority:
1. CredentialVault.get(walletId, credentialRef)  -- per-wallet credential
2. SettingsService.getApiKey(providerName)       -- global daemon credential (fallback)
```

Both use `settings-crypto.ts` (`encryptSettingValue`/`decryptSettingValue`/`deriveSettingsKey`) for AES-256-GCM encryption. CredentialVault stores in `wallet_credentials` table; SettingsService stores in `settings` table. No code duplication -- both import from the same module.

---

## Patterns to Follow

### Pattern 1: Kind-Based Normalization (backward compat)

**What:** When `resolve()` returns without `kind` field, registry normalizes by adding `kind: 'contractCall'`. This preserves all existing provider behavior with zero changes.

**When:** Any existing provider returns `ContractCallRequest` without `kind`.

**Example:**
```typescript
// In ActionProviderRegistry.executeResolve():
function normalizeResolvedAction(raw: unknown): ResolvedAction {
  if (isApiDirectResult(raw)) return raw; // unchanged

  const obj = raw as Record<string, unknown>;
  if (!obj.kind) {
    // Legacy ContractCallRequest -- normalize
    return { ...ContractCallRequestSchema.parse(obj), kind: 'contractCall' };
  }

  // New action types have explicit kind
  return ResolvedActionSchema.parse(obj);
}
```

### Pattern 2: ISignerCapability Adapter (wrap, don't refactor)

**What:** Each existing signer is wrapped in an ISignerCapability adapter. The original code paths remain unchanged; adapters delegate to the existing functions.

**When:** Building signer capabilities for existing signing mechanisms.

**Example:**
```typescript
interface ISignerCapability {
  readonly scheme: SigningScheme;
  sign(params: SigningParams): Promise<SigningResult>;
  verify?(params: VerifyParams): Promise<boolean>;
}

class Eip712SignerCapability implements ISignerCapability {
  readonly scheme = 'eip712';

  async sign(params: SigningParams): Promise<SigningResult> {
    // Delegate to existing viem signTypedData (same code as sign-message.ts step 5)
    const account = privateKeyToAccount(params.privateKey);
    const signature = await account.signTypedData(params.typedData);
    return { signature, scheme: 'eip712' };
  }
}
```

### Pattern 3: CredentialRef Indirect Reference

**What:** Actions never receive raw credentials. They reference credentials by `credentialRef` (UUID or `{walletId}:{name}`), and the pipeline resolves the actual value just before signing.

**When:** Any action that needs external API credentials (CEX API keys, HMAC secrets).

**Example:**
```typescript
// In SignedDataAction:
{
  kind: 'signedData',
  signingScheme: 'hmac-sha256',
  payload: { /* order data */ },
  credentialRef: 'binance_api_key',  // resolved at pipeline time
  venue: 'binance',
  operation: 'create_order',
}

// Pipeline resolution (CredentialResolver):
const credential = credentialVault.get(walletId, 'binance_api_key')
  ?? settingsService.getDecryptedApiKey('binance');
```

### Pattern 4: ExternalActionTracker Registration (follows BridgeStatusTracker)

**What:** When a SignedDataAction includes `tracking` metadata, register an ExternalActionTracker with AsyncPollingService after execution.

**When:** Off-chain actions with async completion (e.g., CoW Protocol order fill, CEX withdrawal).

**Example:**
```typescript
// After successful signing + submission:
if (signedDataAction.tracking) {
  const metadata = {
    tracker: 'external-action',
    venue: signedDataAction.venue,
    operation: signedDataAction.operation,
    checkUrl: signedDataAction.tracking.statusUrl,
    ...signedDataAction.tracking.metadata,
  };
  await db.update(transactions).set({
    externalActionStatus: 'PENDING',
    bridgeMetadata: JSON.stringify(metadata),
  }).where(eq(transactions.id, txId));
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Separate VenueProvider Abstraction

**What:** Creating a new `IVenueProvider` interface parallel to `IActionProvider`.

**Why bad:** Duplicates registration, discovery, MCP exposure, policy evaluation, and admin UI integration. Existing `IActionProvider` already has `metadata`, `actions`, `resolve()`, `requiresApiKey`, `mcpExpose` -- everything needed.

**Instead:** Extend `IActionProvider.resolve()` return type to `ResolvedAction` union. Venue-specific providers are just ActionProviders that return `SignedDataAction` or `SignedHttpAction`.

### Anti-Pattern 2: Refactoring Existing Pipelines

**What:** Modifying `sign-message.ts`, `sign-only.ts`, or `http-message-signer.ts` to use ISignerCapability internally.

**Why bad:** These are stable, well-tested paths with 7,400+ tests depending on them. Changing them risks regression for zero benefit (existing callers don't need ISignerCapability).

**Instead:** ISignerCapability adapters wrap existing functions. New action paths use ISignerCapability; old paths remain unchanged. Gradual migration is possible later but not required.

### Anti-Pattern 3: Per-Wallet SettingsService Extension

**What:** Adding `walletId` scope to `SettingsService` to handle per-wallet credentials.

**Why bad:** SettingsService is daemon-global by design (masterAuth only, admin-scoped). Adding per-wallet scope mixes auth models (sessionAuth vs masterAuth), complicates key management, and creates ambiguity about which settings are global vs per-wallet.

**Instead:** Separate `CredentialVault` with per-wallet scope (sessionAuth). Reuse `settings-crypto.ts` encryption primitives only.

### Anti-Pattern 4: Separate external_actions Table

**What:** Creating a new `external_actions` table instead of extending `transactions`.

**Why bad:** Fragments query patterns (admin UI, SDK, MCP all query `transactions`), breaks existing indexes, complicates cross-action-type reporting, and doubles audit log complexity.

**Instead:** Add `external_action_status` column to `transactions` (follows `bridge_status` pattern). NULL for on-chain TX -- zero impact on existing queries.

---

## Component Interaction Diagram

```
                     REST API / MCP / SDK
                            |
                    actions.ts route handler
                            |
                 ActionProviderRegistry.executeResolve()
                            |
                    +-------+-------+
                    |               |
              ApiDirectResult   ResolvedAction[]
              (existing path)       |
                    |        normalizeKind()
                    |               |
                    |    +----------+----------+
                    |    |          |          |
                    | contractCall signedData signedHttp
                    |    |          |          |
                    | [existing]   |          |
                    |    |         |          |
                    v    v         v          v
               PipelineContext (carries action data through stages)
                    |
              stage1Validate (shared: DB INSERT, txId generation)
                    |
              stage2Auth (shared: sessionAuth validation)
                    |
              stage3Policy (extended: venue/category policies)
                    |          |
                    |   CredentialResolver
                    |   (per-wallet -> global)
                    |          |
              stage4Wait (shared: tier-based wait)
                    |
              stage5Execute (branched by resolvedActionKind)
               /         |          \
        on-chain    signedData    signedHttp
        (existing)      |            |
        IChainAdapter   |     Erc8128SignerCapability
                        |            |
                 SignerCapabilityRegistry.get(scheme)
                        |
                 ISignerCapability.sign()
                        |
                 Submit to venue API (optional)
                        |
              stage6Confirm / ExternalActionTracker registration
                        |
                   transactions DB update
```

---

## Scalability Considerations

| Concern | At 10 wallets | At 100 wallets | At 1000 wallets |
|---------|---------------|----------------|-----------------|
| wallet_credentials rows | ~50 | ~500 | ~5,000 |
| Credential decrypt per action | 1 HKDF + 1 AES-GCM (<1ms) | Same per-request | Same per-request, no scaling issue |
| AsyncPollingService targets | +5 external trackers | +50 external trackers | Consider polling batching or per-wallet polling limits |
| ISignerCapability instances | 7 singletons (scheme registry) | Same singletons | Same singletons |
| Policy evaluation (VENUE_WHITELIST) | O(n) venue scan | Same -- n is small (venues << 100) | Same |

---

## Suggested Build Order

Based on dependency analysis, the recommended implementation order:

### Phase 1: Type System Foundation (no runtime changes)
1. **ResolvedAction Zod union** in `@waiaas/core` (R1)
2. **ISignerCapability interface** in `@waiaas/core` (R2-1, R2-2)
3. **SigningSchemeEnum** in `@waiaas/core` (R2-2)
4. **ActionDefinition extension** (optional venue/signingScheme/actionCategory fields)

*Rationale:* All other components depend on these types. No runtime behavior changes -- pure type additions.

### Phase 2: Infrastructure (CredentialVault + DB migration)
5. **DB migration v55**: `wallet_credentials` table + `external_action_status` column
6. **CredentialVault** implementation (CRUD, settings-crypto.ts reuse)
7. **CredentialResolver** (per-wallet -> global fallback logic)
8. **REST API credential endpoints** (4 CRUD routes under `/v1/wallets/:walletId/credentials`)

*Rationale:* CredentialVault is independent of pipeline changes. Can be built and tested in isolation. DB migration must happen before any code references new columns.

### Phase 3: Signer Capabilities
9. **SignerCapabilityRegistry** implementation
10. **Adapter capabilities**: Eip712SignerCapability, PersonalSignCapability, Erc8128SignerCapability
11. **New capabilities**: HmacSignerCapability, RsaPssSignerCapability

*Rationale:* Adapters wrap existing code (low risk). New capabilities are independent modules. All can be unit-tested without pipeline integration.

### Phase 4: Pipeline Integration
12. **ActionProviderRegistry modification**: normalize `kind`, validate new types
13. **PipelineContext extension**: new fields for action kind and data
14. **Pipeline Router**: stage5 branching for signedData/signedHttp
15. **SignedDataPipeline**: credential resolution + signer dispatch + venue submission
16. **SignedHttpPipeline**: ERC-8128 integration path

*Rationale:* Most complex phase. Depends on Phases 1-3. Changes core execution path -- needs comprehensive testing.

### Phase 5: Policy + Tracking Extension
17. **TransactionParam extension**: venue, actionCategory, notionalUsd
18. **VENUE_WHITELIST policy type** in DatabasePolicyEngine
19. **ACTION_CATEGORY_LIMIT policy type** in DatabasePolicyEngine
20. **ExternalActionTracker** implementation (IAsyncStatusTracker)
21. **AsyncPollingService query extension** for external action targets

*Rationale:* Policy changes are additive (new evaluation steps after existing ones). Tracking extension follows established BridgeStatusTracker pattern.

### Phase 6: Interface Extension
22. **Admin UI**: Credentials tab in wallet detail, policy forms for new types
23. **MCP tools**: credential management tools, external action query tools
24. **SDK methods**: credential CRUD, action execution (no changes needed -- same endpoint)
25. **connect-info extension**: external_actions capability
26. **Skill files update**: admin.skill.md, wallet.skill.md

*Rationale:* UI/interface changes depend on all infrastructure being in place.

---

## Sources

- Direct codebase analysis (HIGH confidence):
  - `packages/core/src/interfaces/action-provider.types.ts` -- IActionProvider, ActionDefinition, ApiDirectResult
  - `packages/daemon/src/infrastructure/action/action-provider-registry.ts` -- executeResolve flow
  - `packages/daemon/src/pipeline/stages.ts` -- PipelineContext, stage5Execute, ApiDirectResult branch
  - `packages/daemon/src/pipeline/database-policy-engine.ts` -- TransactionParam, policy evaluation chain
  - `packages/daemon/src/pipeline/sign-message.ts` -- sign-message pipeline (6-step)
  - `packages/core/src/erc8128/http-message-signer.ts` -- ERC-8128 signer
  - `packages/daemon/src/infrastructure/settings/settings-crypto.ts` -- AES-256-GCM encryption
  - `packages/daemon/src/services/async-polling-service.ts` -- AsyncPollingService polling lifecycle
  - `packages/actions/src/common/async-status-tracker.ts` -- IAsyncStatusTracker interface
  - `packages/daemon/src/infrastructure/database/schema.ts` -- transactions table schema
- Milestone objective: `internal/objectives/m31-11-external-action-design.md` -- R1-R6 requirements
