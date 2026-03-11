# Project Research Summary

**Project:** WAIaaS v31.11 External Action Framework Design
**Domain:** ActionProvider framework extension (on-chain tx-centric -> action-centric model)
**Researched:** 2026-03-11
**Confidence:** HIGH

## Executive Summary

WAIaaS v31.11 is a design-only milestone that extends the ActionProvider framework from on-chain transaction-only resolution to a unified action model supporting off-chain operations (CEX API calls, EIP-712 CLOB orders, ERC-8128 signed HTTP requests). The core insight from research is that the existing codebase already contains every cryptographic primitive and infrastructure pattern needed. The recommended approach is a **widening strategy**: existing 13 providers and 4 pipeline paths remain untouched, while a new `ResolvedAction` union type (`contractCall | signedData | signedHttp`) and kind-based routing branch off after `ActionProviderRegistry.executeResolve()`. Zero new npm dependencies are required.

The framework introduces three new subsystems alongside the type system: (1) `ISignerCapability` -- a unified signing abstraction that wraps existing signers as adapters while adding HMAC-SHA256/512 and RSA-PSS capabilities via `node:crypto`, (2) `CredentialVault` -- per-wallet encrypted credential storage using the proven `settings-crypto.ts` AES-256-GCM encryption with HKDF domain separation, and (3) venue-aware policy evaluation extending `DatabasePolicyEngine` with `VENUE_WHITELIST` and `ACTION_CATEGORY_LIMIT` policy types. These build on established patterns (discriminatedUnion, adapter pattern, CONTRACT_WHITELIST precedent) rather than inventing new abstractions.

The primary risks are backward compatibility breakage in the resolve() return type (13 providers + ESM plugins), policy bypass for off-chain actions that skip Stage 3, and CredentialVault encryption key derivation conflicting with SettingsService re-encrypt/backup flows. All three are preventable through strict design constraints documented in PITFALLS.md: kind normalization in the registry only, mandatory policy evaluation on all new paths, and HKDF context separation with re-encrypt integration.

## Key Findings

### Recommended Stack

No new npm packages are required. All cryptographic primitives exist in the codebase via `node:crypto` (HMAC, RSA-PSS, AES-256-GCM, HKDF), `viem` 2.x (EIP-712, ECDSA), `sodium-native` (Ed25519), and `settings-crypto.ts` (credential encryption). See STACK.md for full analysis.

**Core technologies (all existing):**
- `node:crypto` createHmac/createSign: HMAC-SHA256/512 and RSA-PSS signing for CEX API auth -- already used in Polymarket signer and WebhookDeliveryQueue
- `settings-crypto.ts` encryptSettingValue/decryptSettingValue: AES-256-GCM for CredentialVault -- same encryption, different HKDF info string for domain separation
- Zod `z.discriminatedUnion('kind', [...])`: ResolvedAction union type -- same pattern as existing 8-type transaction discriminatedUnion on `type` field
- Drizzle ORM: DB migration v55 for `wallet_credentials` table + `external_action_status` column

### Expected Features

**Must have (table stakes):**
- ResolvedAction union type (R1) -- foundation for off-chain action expression through ActionProvider path
- ISignerCapability unified interface (R2) -- consolidates 7 scattered signing methods behind one abstraction
- Pipeline routing by kind (R6-1) -- enables off-chain action execution via same `POST /v1/actions/:provider/:action` endpoint
- Per-wallet CredentialVault (R3) -- agents need per-wallet CEX API keys; SettingsService is daemon-global only
- Credential indirect reference (R3-4) -- raw secrets never appear in action params or API responses
- Off-chain action status tracking (R4) -- async lifecycle states (PARTIALLY_FILLED, SETTLED, etc.)
- Venue-aware policy evaluation (R5) -- off-chain venues carry different risk profiles than on-chain contracts
- DB record for off-chain actions (R6-3) -- audit trail using extended `transactions` table

**Should have (differentiators):**
- Credential rotation with zero downtime (R3-6) -- atomic swap without session interruption
- HMAC/RSA signer capabilities (R2-3/R2-4) -- enables CEX integration through standard provider path
- Action category spending limits (R5-3) -- per-category (trade/withdraw/transfer/sign) USD notional limits
- Admin UI Credentials tab (R3-8) -- operator visibility into per-wallet credentials

**Defer (v2+):**
- Leverage-aware policy (R5-1) -- Hyperliquid already works; future-proofing only
- Real-time WebSocket status streaming -- polling at 30s already sufficient
- Multi-step off-chain action orchestration -- agents compose steps themselves

### Architecture Approach

The architecture follows a widening strategy where existing pipelines are preserved and new kind-based routing branches off after ActionProviderRegistry resolution. The key design principle is "wrap, don't refactor" -- ISignerCapability adapters delegate to existing signing modules (sign-message.ts, http-message-signer.ts, viem signTypedData) without modifying them. CredentialVault lives alongside SettingsService, sharing only encryption primitives. See ARCHITECTURE.md for component diagrams and data flows.

**Major components:**
1. **ResolvedAction (Zod union)** -- 3-member discriminated union on `kind` field in `@waiaas/core`
2. **ISignerCapability + SignerCapabilityRegistry** -- signing scheme to capability mapping, 7 adapter/new implementations
3. **CredentialVault + CredentialResolver** -- per-wallet encrypted CRUD with per-wallet -> global fallback lookup
4. **Pipeline Router** -- stage5 branching: contractCall (existing), signedData (new), signedHttp (new)
5. **ExternalActionTracker** -- IAsyncStatusTracker implementation for off-chain action state machines
6. **Venue-aware DatabasePolicyEngine** -- VENUE_WHITELIST + ACTION_CATEGORY_LIMIT policy types

### Critical Pitfalls

1. **resolve() backward compatibility breakage** -- Kind normalization must happen in ActionProviderRegistry only. Existing 13 providers return without `kind`; registry adds `kind: 'contractCall'`. Zero changes to existing provider files. Test gate: all existing provider tests pass without modification.
2. **CredentialVault encryption key derivation conflict** -- Must use different HKDF info string (`'waiaas-credentials'` vs `'waiaas-settings'`). Must integrate with `re-encrypt.ts` for master password changes and `BackupService` for backup/restore. Failure = credential data loss on password change.
3. **Off-chain actions bypassing policy evaluation** -- New signedData/signedHttp paths must include Stage 3 policy evaluation. TransactionParam extended with `venue`, `actionCategory`, `notionalUsd`. Integration test: no signing path without `policyEngine.evaluate()` call.
4. **ISignerCapability replacing existing signing paths** -- Strict R2-6 principle: adapters delegate only, existing sign-message.ts / stages.ts signing calls unchanged. Grep-based audit of existing call sites.
5. **DB storage strategy indecision** -- Must decide early: extend `transactions` table with `action_kind` column + nullable `txHash`. Audit all `txHash IS NOT NULL` assumptions in existing queries. SPENDING_LIMIT must aggregate across on-chain and off-chain.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: ResolvedAction Type System
**Rationale:** Every other component depends on the type definitions. Pure type additions with no runtime behavior changes -- lowest risk starting point.
**Delivers:** ResolvedAction Zod union (contractCall/signedData/signedHttp), ISignerCapability interface, SigningSchemeEnum, ActionDefinition extension with optional venue/signingScheme/actionCategory fields.
**Addresses:** R1 (ResolvedAction union type), R2-1/R2-2 (ISignerCapability interface + enum)
**Avoids:** Pitfall 1 (backward compat) via kind normalization strategy, Pitfall 8 (kind-type dual discriminant) via level separation

### Phase 2: CredentialVault Infrastructure
**Rationale:** Independent of pipeline changes, can be built and tested in isolation. DB migration must happen before any code references new columns. Needed before any real venue provider can be implemented.
**Delivers:** DB migration v55 (wallet_credentials table + external_action_status column), CredentialVault CRUD with AES-256-GCM encryption, CredentialResolver (per-wallet -> global fallback), 4 REST API credential endpoints.
**Addresses:** R3 (CredentialVault), R3-4 (credential indirect reference)
**Avoids:** Pitfall 2 (encryption key derivation) via HKDF context separation + re-encrypt integration, Pitfall 6 (auth model) via createdBy field + permission matrix

### Phase 3: Signer Capabilities
**Rationale:** Adapters wrap existing code (low risk), new capabilities are independent modules. All unit-testable without pipeline integration.
**Delivers:** SignerCapabilityRegistry, 5 adapter capabilities (Eip712, PersonalSign, Erc8128, Hmac, RsaPss).
**Addresses:** R2 (ISignerCapability complete), R2-3 (HMAC), R2-4 (RSA-PSS)
**Avoids:** Pitfall 4 (replacing existing paths) via strict delegation-only adapters, Pitfall 9 (requiresSigningKey scope) via separate requiresCredential flag

### Phase 4: Pipeline Integration
**Rationale:** Most complex phase -- depends on Phases 1-3. Changes core execution path. This is where the new routing actually enables off-chain action execution.
**Delivers:** ActionProviderRegistry modification (kind normalization + validation), PipelineContext extension, Pipeline Router (stage5 branching), SignedDataPipeline, SignedHttpPipeline.
**Addresses:** R6-1 (pipeline routing), R6-3 (DB record for off-chain actions)
**Avoids:** Pitfall 3 (policy bypass) by ensuring policy evaluation on all new paths, Pitfall 5 (DB strategy) by confirming transactions table extension with action_kind column

### Phase 5: Policy + Tracking Extension
**Rationale:** Additive changes to existing policy engine and polling service. Depends on pipeline integration being in place.
**Delivers:** TransactionParam extension (venue/actionCategory/notionalUsd), VENUE_WHITELIST policy type, ACTION_CATEGORY_LIMIT policy type, ExternalActionTracker (IAsyncStatusTracker), AsyncPollingService query extension.
**Addresses:** R5 (venue-aware policy), R4 (off-chain status tracking)
**Avoids:** Pitfall 7 (polling interference) via tracker-specific queries, Pitfall 3 (policy bypass) via mandatory evaluation steps

### Phase 6: Interface Extension
**Rationale:** UI/interface changes depend on all infrastructure being in place. This phase makes the framework visible to operators and agents.
**Delivers:** Admin UI Credentials tab + off-chain action display, MCP credential management tools, SDK credential CRUD methods, connect-info externalActions capability, skill file updates.
**Addresses:** R3-8 (Admin UI), connect-info, interface sync (CLAUDE.md mandate)
**Avoids:** Pitfall 10 (connect-info omission), Pitfall 12/13 (Admin/MCP/SDK extension gaps)

### Phase Ordering Rationale

- Types first (Phase 1) because every component depends on ResolvedAction and ISignerCapability definitions
- CredentialVault (Phase 2) before pipeline (Phase 4) because credential resolution is needed during action execution
- Signer capabilities (Phase 3) before pipeline (Phase 4) because the pipeline router dispatches to signers
- Pipeline integration (Phase 4) is the critical path -- most complex, highest risk, most testing needed
- Policy + tracking (Phase 5) after pipeline because policies evaluate within the pipeline context
- Interfaces last (Phase 6) because they expose functionality that must already work

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (CredentialVault):** Re-encrypt integration and BackupService inclusion need careful design -- must trace all master password change paths and backup/restore flows
- **Phase 4 (Pipeline Integration):** Stage 5 branching is the highest-risk modification -- needs comprehensive analysis of all existing stage5Execute call paths and ApiDirectResult handling
- **Phase 5 (Policy Extension):** VENUE_WHITELIST default-deny semantics need careful design to avoid blocking legitimate on-chain actions that have no venue

Phases with standard patterns (skip research-phase):
- **Phase 1 (Type System):** Well-documented Zod discriminatedUnion pattern, proven in existing 8-type transaction union
- **Phase 3 (Signer Capabilities):** Adapter pattern over existing modules, straightforward delegation
- **Phase 6 (Interface Extension):** Standard Admin UI tab addition, MCP tool registration, SDK method addition -- all follow established patterns from v31.0+

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All dependencies verified as existing in codebase. Zero new packages. node:crypto primitives verified on Node.js 22.22.0. |
| Features | HIGH | Requirements R1-R6 clearly defined in objective doc. Feature landscape maps directly to requirements with existing pattern precedents for each. |
| Architecture | HIGH | Based on direct codebase analysis of action-provider-registry.ts, stages.ts, database-policy-engine.ts, settings-crypto.ts. All integration points identified with line-level precision. |
| Pitfalls | HIGH | All 15 pitfalls derived from codebase analysis. Critical pitfalls (1-5) have concrete prevention strategies with testable detection criteria. |

**Overall confidence:** HIGH

### Gaps to Address

- **txHash NOT NULL assumptions:** Need a comprehensive grep of all `txHash` references in queries, Admin UI, SDK responses, and MCP tools before confirming transactions table extension. Some code paths may assume txHash is always present.
- **ESM plugin backward compatibility:** External plugins loaded via `loadPlugins()` are not tested in CI. Plugin compatibility relies on kind normalization working correctly for unknown return types.
- **AsyncPollingService at scale:** At 1000+ wallets with many off-chain trackers, polling batching or per-wallet limits may be needed. Not a design-phase concern but flagged for implementation milestone.
- **Credential scope during multi-wallet sessions:** Session 1:N wallet model means a session can access multiple wallets' credentials. Need to verify that CredentialResolver correctly scopes credential lookup to the active wallet in the action request, not any wallet in the session.

## Sources

### Primary (HIGH confidence -- direct codebase analysis)
- `packages/core/src/interfaces/action-provider.types.ts` -- IActionProvider, ActionDefinition, ApiDirectResult
- `packages/daemon/src/infrastructure/action/action-provider-registry.ts` -- executeResolve() flow, kind normalization point
- `packages/daemon/src/pipeline/stages.ts` -- PipelineContext, stage5Execute branching
- `packages/daemon/src/pipeline/database-policy-engine.ts` -- TransactionParam, policy evaluation chain
- `packages/daemon/src/pipeline/sign-message.ts` -- sign-message pipeline (6-step)
- `packages/core/src/erc8128/http-message-signer.ts` -- ERC-8128 HTTP signing
- `packages/daemon/src/infrastructure/settings/settings-crypto.ts` -- AES-256-GCM encryption, HKDF derivation
- `packages/daemon/src/services/async-polling-service.ts` -- AsyncPollingService tracker registration
- `packages/actions/src/common/async-status-tracker.ts` -- IAsyncStatusTracker interface
- `packages/actions/src/providers/polymarket/signer.ts` -- HMAC-SHA256 + EIP-712 precedent
- `packages/daemon/src/services/webhook-delivery-queue.ts` -- HMAC-SHA256 precedent

### Secondary (MEDIUM confidence -- external documentation)
- CoW Protocol signing schemes: https://docs.cow.fi/cow-protocol/reference/core/signing-schemes
- CoW Protocol order lifecycle: https://docs.cow.fi/cow-protocol/reference/contracts/core/settlement
- Coinbase Agentic Wallets: https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets

### Tertiary (LOW confidence -- inference)
- ESM plugin ecosystem compatibility -- inferred from loadPlugins() analysis, no external plugins tested
- Scaling behavior at 1000+ wallets with off-chain trackers -- extrapolated from current AsyncPollingService patterns

---
*Research completed: 2026-03-11*
*Ready for roadmap: yes*
