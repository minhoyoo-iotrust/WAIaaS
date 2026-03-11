# Feature Landscape: External Action Framework

**Domain:** Wallet-as-a-Service External Action Framework (on-chain + off-chain unified action model)
**Researched:** 2026-03-11

## Table Stakes

Features that agents and operators expect from a unified action framework. Missing = off-chain actions remain second-class citizens.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **ResolvedAction union type (R1)** | `resolve()` currently returns `ContractCallRequest` only; agents cannot express off-chain intents through the standard ActionProvider path | Medium | `action-provider.types.ts`, `ActionProviderRegistry`, Zod `discriminatedUnion` | 3-member union: `contractCall` / `signedData` / `signedHttp`. Backward compatible via optional `kind` field + registry normalization. Existing 13 providers unchanged |
| **Pipeline routing by kind (R6-1)** | Without kind-based routing, off-chain actions have no execution path; they would dead-end after resolve() | Medium | ResolvedAction union, existing 6-stage pipeline, sign-message pipeline, ERC-8128 module | Router dispatches: `contractCall` -> 6-stage, `signedData` -> sign-message extended, `signedHttp` -> ERC-8128 integrated. Single entry point `POST /v1/actions/:provider/:action` |
| **ISignerCapability unified interface (R2)** | 4 signing methods scattered across separate modules; new providers must know which module to call | Medium | `sign-message.ts`, `sign-only.ts`, `http-message-signer.ts`, `IChainAdapter.signTransaction()` | Adapter pattern wrapping existing signers. New route only -- existing pipelines untouched. Registry maps `SigningSchemeEnum` -> capability |
| **Per-wallet CredentialVault (R3)** | Agents need per-wallet CEX API keys, HMAC secrets; SettingsService is daemon-global (masterAuth only) | High | `settings-crypto.ts` (AES-256-GCM reuse), DB migration `wallet_credentials` table, sessionAuth + masterAuth | Lookup priority: per-wallet -> global SettingsService fallback. Credential types: `api-key`, `hmac-secret`, `rsa-private-key`, `session-token`, `custom` |
| **Credential indirect reference (R3-4)** | Raw secrets must never appear in action params or API responses; credentialRef enables safe referencing | Low | CredentialVault | `credentialRef` = UUID or `{walletId}:{name}`. Provider resolve() receives decrypted value via context, never in request body |
| **Off-chain action status tracking (R4)** | CoW Protocol orders, CEX withdrawals have multi-state lifecycles (PARTIALLY_FILLED, SETTLED, etc.); current tracker only handles 4 states | Medium | `IAsyncStatusTracker`, `AsyncPollingService`, `transactions` table or new column | Extend `AsyncTrackingResult.state` with off-chain states. Reuse existing polling infrastructure + callbacks |
| **Venue-aware policy evaluation (R5)** | Off-chain venues (CEX, CLOB) carry different risks than on-chain contracts; policy engine must distinguish them | Medium | `DatabasePolicyEngine`, `TransactionParam`, `ActionDefinition` | Extend `TransactionParam` with `venue`, `actionCategory`, `notionalUsd`. Venue whitelist mirrors `CONTRACT_WHITELIST` pattern |
| **DB record for off-chain actions (R6-3)** | Audit trail, history, and status tracking require persistent records for off-chain actions just like on-chain tx | Medium | `transactions` table schema, DB migration | Extend transactions table with `action_kind` column + `external_action_status` or reuse `bridge_status` column with expanded CHECK constraint |

## Differentiators

Features that set WAIaaS apart. Not baseline expectations, but high value for AI agent use cases.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Credential rotation with zero downtime (R3-6)** | Agents can rotate CEX API keys without interrupting active sessions; critical for security-conscious operators | Low | CredentialVault | Optional history retention, atomic swap of encrypted value, expiresAt auto-cleanup |
| **HMAC/RSA signer capabilities (R2-3/R2-4)** | Enables CEX API integration (Binance HMAC-SHA256, institutional RSA-PSS) through standard ActionProvider path | Medium | ISignerCapability, CredentialVault (for secrets) | New capability implementations. `HmacSignerCapability` uses credential from vault, `RsaPssSignerCapability` uses RSA private key |
| **Action category spending limits (R5-3)** | Per-category (trade/withdraw/transfer/sign) spending limits with USD notional tracking; prevents runaway agent spending across venues | Medium | DatabasePolicyEngine, IPriceOracle, `SPENDING_LIMIT` pattern | Extends existing cumulative spending limit infrastructure to off-chain actions |
| **Leverage-aware policy (R5-1)** | Policy engine can gate high-leverage perp trades differently than spot trades; prevents agents from taking excessive risk | Low | `TransactionParam` extension, ActionDefinition | `leverage` field in policy context. Policy rules: `maxLeverage` per venue or global |
| **Admin UI Credentials tab (R3-8)** | Operators can see/manage per-wallet credentials without CLI; consistent with existing Admin UI patterns (wallets, settings) | Medium | CredentialVault REST API, Admin UI wallet detail page | List: type/name/createdAt/expiresAt. Masked values. Register/delete/rotate buttons |
| **Unified action history view** | Single history endpoint showing both on-chain tx and off-chain actions; agents get complete picture | Low | DB schema (action_kind column), existing `GET /v1/wallets/:id/transactions` | Filter by `action_kind` in query params. Existing pagination/sorting reusable |

## Anti-Features

Features to explicitly NOT build. These would add complexity without proportional value or would break existing patterns.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Separate VenueProvider abstraction** | Duplicates ActionProvider's role; creates two parallel frameworks that providers must choose between | Extend `ActionProvider.resolve()` return type to `ResolvedAction` union. Venues are just providers that return `SignedDataAction` or `SignedHttpAction` |
| **SettingsService per-wallet mode** | Mixing daemon-global config with per-wallet credentials creates scope confusion, auth model conflicts, migration complexity | Separate CredentialVault (sessionAuth) alongside SettingsService (masterAuth). Share only encryption primitives |
| **Refactoring existing pipelines** | 6-stage, sign-only, sign-message, ERC-8128 pipelines are stable with 7400+ tests; refactoring risks regression for zero user benefit | ISignerCapability wraps existing signers as adapters. New off-chain path only; existing paths preserved exactly |
| **Separate external_actions table** | Another table means duplicated queries, join complexity, inconsistent history; `transactions` table already tracks off-chain via `ApiDirectResult` (Hyperliquid, Polymarket) | Extend `transactions` table with `action_kind` discriminator column. Keep single source for action history |
| **Real-time WebSocket status streaming** | Over-engineering for initial release; polling interval (30s) already works for bridge/gas tracking | Reuse `AsyncPollingService` with extended states. WebSocket can be added later as opt-in optimization |
| **Credential encryption with per-wallet keys** | Per-wallet derived keys add key management complexity; master password HKDF derivation is already proven secure | Reuse `deriveSettingsKey()` from `settings-crypto.ts`. Same HKDF(SHA-256) derivation, same security model |
| **Multi-step off-chain action orchestration** | Chaining multiple off-chain actions (e.g., CEX deposit -> trade -> withdraw) adds state machine complexity with unclear demand | Each off-chain action is atomic. Agents compose steps via sequential API calls. Orchestration is the agent's responsibility |

## Feature Dependencies

```
ResolvedAction union type (R1)
  +-- Pipeline routing by kind (R6-1) [requires kind field to dispatch]
  +-- DB record for off-chain actions (R6-3) [requires action_kind column]
  +-- Venue-aware policy evaluation (R5) [requires venue/category from ResolvedAction]

ISignerCapability interface (R2)
  +-- Pipeline routing (R6-1) [routes to appropriate signer]
  +-- HMAC/RSA capabilities (R2-3/R2-4) [implements interface]

CredentialVault (R3)
  +-- Credential indirect reference (R3-4) [references vault entries]
  +-- Credential rotation (R3-6) [vault CRUD operation]
  +-- Admin UI Credentials tab (R3-8) [REST API over vault]
  +-- HMAC/RSA signer capabilities [reads secrets from vault]

Off-chain status tracking (R4)
  +-- Pipeline routing (R6-1) [registers tracker after execution]
  +-- DB record (R6-3) [stores status progression]
```

## MVP Recommendation

### Phase 1: Type System + Routing Foundation
Prioritize:
1. **ResolvedAction union type (R1)** -- Foundation for everything; backward compatible
2. **ISignerCapability interface (R2)** -- Unifies signing without touching existing paths
3. **Pipeline routing by kind (R6-1)** -- Enables off-chain action execution
4. **DB record for off-chain actions (R6-3)** -- Audit trail

Rationale: These four features form the minimal viable framework. Without them, no off-chain action can flow through the standard ActionProvider path.

### Phase 2: Credential + Policy Layer
5. **CredentialVault (R3)** -- Per-wallet secret management
6. **Credential indirect reference (R3-4)** -- Safe referencing
7. **Venue-aware policy (R5)** -- Risk management for off-chain venues
8. **Off-chain status tracking (R4)** -- Lifecycle monitoring

Rationale: These require the routing foundation to be in place. CredentialVault is needed before any real venue provider (CoW, Binance) can be implemented.

### Defer
- **Admin UI Credentials tab (R3-8)**: Can use CLI/API initially; UI polish after core stabilizes
- **Action category spending limits (R5-3)**: Enhancement after basic venue policy works
- **Credential rotation (R3-6)**: Simple delete+create suffices for MVP; atomic rotation is polish
- **Leverage-aware policy**: Hyperliquid already works via `requiresSigningKey`; this is future-proofing

## Complexity Assessment

| Feature | Estimated Effort | Risk Level | Notes |
|---------|-----------------|------------|-------|
| ResolvedAction union (R1) | 1-2 days | Low | Zod schema + optional kind field; registry normalization trivial |
| ISignerCapability (R2) | 2-3 days | Low | Adapter pattern over existing code; no behavior change |
| CredentialVault (R3) | 3-4 days | Medium | DB migration, encryption reuse, auth model, REST API |
| Status tracking (R4) | 1-2 days | Low | Extends existing enum + polling service |
| Policy extension (R5) | 2-3 days | Medium | TransactionParam widening touches policy engine core |
| Pipeline routing (R6) | 2-3 days | Medium | New dispatch logic; must not break existing ApiDirectResult path |
| DB record (R6-3) | 1 day | Low | Column addition + CHECK constraint update |

**Total estimated design effort (m31-11):** This is a design-only milestone. Design documents for all 6 requirement areas.

## Existing Pattern Precedents

The framework builds on proven patterns already in WAIaaS:

| New Feature | Existing Precedent | Reuse Strategy |
|-------------|-------------------|----------------|
| ResolvedAction union | `discriminatedUnion` on `type` field (6 TX types) | Same Zod pattern, different discriminant (`kind`) |
| ISignerCapability | `IChainAdapter` (25 methods, adapter pattern) | Interface + per-chain implementations |
| CredentialVault | `SettingsService` + `settings-crypto.ts` | Reuse `encryptSettingValue()`/`decryptSettingValue()`, new DB table |
| Status tracking | `IAsyncStatusTracker` + `AsyncPollingService` | Extend state enum, same polling loop |
| Venue policy | `CONTRACT_WHITELIST` + `SPENDING_LIMIT` | Same whitelist pattern, extended param context |
| Pipeline routing | `isApiDirectResult()` branch in Stage 5 | Same dispatch pattern, expanded to 3 kinds |

## Sources

- CoW Protocol signing schemes documentation: https://docs.cow.fi/cow-protocol/reference/core/signing-schemes
- CoW Protocol order lifecycle: https://docs.cow.fi/cow-protocol/reference/contracts/core/settlement
- HashiCorp Vault secret management: https://developer.hashicorp.com/vault/api-docs/secret/key-management
- Coinbase Agentic Wallets: https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets
- Polygon Agent CLI: https://polygon.technology/blog/polygon-launches-an-onchain-toolkit-built-for-the-agent-economy
- Internal: `m31-11-external-action-design.md` (requirements R1-R6)
- Internal: `action-provider.types.ts` (current IActionProvider, ApiDirectResult)
- Internal: `async-status-tracker.ts` (current IAsyncStatusTracker)
- Internal: `sign-message.ts` (current sign-message pipeline)
- Internal: `settings-service.ts` (current SettingsService, setApiKey/getApiKey)
