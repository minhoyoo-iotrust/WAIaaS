# Project Research Summary

**Project:** WAIaaS v32.0 — Contract Name Resolution
**Domain:** Wallet notification enrichment / DeFi contract address display
**Researched:** 2026-03-15
**Confidence:** HIGH

## Executive Summary

Contract name resolution for WAIaaS is a read-only enrichment feature that maps raw contract addresses to human-readable protocol names in notifications and Admin UI. All four research tracks converge on one clear approach: a zero-dependency, synchronous, in-memory lookup using a 4-tier priority cascade (Action Provider metadata > well-known static registry > CONTRACT_WHITELIST user labels > abbreviated address fallback). No new npm packages, no new database tables, and no RPC calls are required. The feature layers cleanly onto existing infrastructure — the `actionProvider` pipeline field, the `CONTRACT_WHITELIST` `name?` field, the `{type}` template variable pattern, and the `amountFormatted` API enrichment pattern from v31.15 all serve as direct precedents.

The recommended approach is to implement a `ContractNameRegistry` service in `@waiaas/core` backed by a static `well-known-contracts.ts` data module (~200-300 curated entries across EVM chains + Solana), surface contract names via an upgraded `{to}` notification variable value (format: "Protocol Name (0xabcd...1234)"), and enrich the transaction API response with a `contractName` field consumed by the Admin UI. The Action Provider `metadata.name` field is the highest-value source because it already flows through the pipeline for every DeFi ACTION_PROVIDER path — wiring it to the notification output covers ~80% of CONTRACT_CALL notifications with zero new data required.

The primary risk is data correctness: EVM address case-sensitivity bugs and cross-chain address misidentification are the most likely failure modes. Both are preventable with a normalized lowercase-keyed, per-network compound-key registry structure. A secondary risk is notification template backward compatibility — fully mitigated by modifying the value produced for the existing `{to}` variable rather than introducing a new `{to_display}` variable, which eliminates the risk of unreplaced placeholder text appearing in sent notifications.

## Key Findings

### Recommended Stack

Zero new dependencies. The well-known contract registry follows the exact pattern of `builtin-tokens.ts` — a static TypeScript `Record` keyed by network-then-lowercase-address, bundled in `@waiaas/core`. Every required integration point is covered by existing project tools: viem `getAddress()` for EVM checksum normalization, the existing i18n template variable substitution system for notification injection, and openapi-typescript auto-generation for Admin UI type propagation.

**Core technologies:**
- TypeScript `Record<string, WellKnownContract[]>` in `@waiaas/core`: static well-known data — zero runtime cost, zero deps, follows `BUILTIN_TOKENS` pattern; ~120 addresses already exist across provider configs
- `ActionProviderMetadataSchema` extension with optional `displayName`: provider-declared human name — self-documenting, covers all 14+ Action Provider paths, requires updating 20+ existing providers
- Existing `CONTRACT_WHITELIST` `name?` field: user-labeled contracts — already stored in DB, just needs lookup path wired to resolver
- Existing `message-templates.ts` placeholder system: notification variable injection — upgrade `{to}` value format rather than adding new variables, maintains backward compatibility

### Expected Features

**Must have (table stakes):**
- Action Provider name in notifications — owner sees "Aave V3" not raw hex; `actionProvider` field already flows through pipeline, not surfaced in notification vars yet
- Well-known contract registry (static) — every block explorer resolves known contracts; 200-300 curated entries across 5 EVM chains + Solana
- CONTRACT_WHITELIST name fallback — users already enter `name` field in whitelist policies; not surfacing it in notifications wastes their effort
- Abbreviated address fallback — unknown contracts must still show something; `0x8787...4E2` is the standard pattern
- Notification template `{to}` enrichment — all 4 notification event types (TX_REQUESTED, TX_APPROVAL_REQUIRED, TX_SUBMITTED, TX_CONFIRMED) should show resolved name
- Admin UI transaction list contract names — transaction history should show protocol names matching block explorer UX

**Should have (differentiators):**
- 4-tier priority resolution cascade with `source` attribution field in API responses — unique combination; enables consumer confidence decisions and debugging
- Cross-chain same-address disambiguation via per-network compound keys — prevents misidentification on L2s where deployer addresses sometimes collide
- Wallet detail Activity tab enrichment — extends the 4-tab wallet detail display (Overview/Activity/Assets/Setup)

**Defer (v2+):**
- ENS/SNS reverse resolution — DeFi contracts rarely set reverse records; <5% success rate; adds `@ensdomains/ensjs` dependency
- Etherscan/Solscan API lookup — adds external dependency, rate limits, API key management, privacy exposure
- User-editable address book — CONTRACT_WHITELIST `name` field already serves this purpose
- Transaction calldata decoding ("what will this do") — full Rabby-style simulation; separate milestone scope

### Architecture Approach

The `ContractNameRegistry` is a pure in-memory, synchronous, read-only service instantiated once at daemon startup. It has no I/O, no async methods, and no database writes. It is injected into the pipeline context and called at notification-emission points in `stages.ts` and at the transaction API route layer. Resolution order: CONTRACT_WHITELIST name (highest trust, user-defined) > well-known registry (static, verified) > Action Provider display name (provider self-declared) > null (fallback to truncated address). All data sources are in-memory; the resolve function returns `string | null` synchronously.

**Major components:**
1. `ContractNameRegistry` (`packages/core/src/registries/contract-name-registry.ts`) — synchronous in-memory lookup, O(1) `Map.get`, `resolve(address, network, opts)` signature
2. `well-known-contracts.ts` (`packages/core/src/registries/`) — static data module, ~200-300 entries, keyed by `{network}:{lowercaseAddress}`
3. `ActionProviderMetadataSchema.displayName` extension — optional field with snake_case auto-conversion fallback (`jupiter_swap` → `Jupiter Swap`), applied to all 20+ existing providers
4. Pipeline `stages.ts` modifications — upgrade `{to}` variable value at Stage 1/3/5/6 notification calls; no new pipeline context fields needed
5. `TxDetailResponseSchema.contractName: z.string().nullable()` — resolved at query time, matches `amountFormatted` enrichment pattern from v31.15
6. Admin UI `transactions.tsx` + `policies.tsx` updates — consume `contractName` from auto-generated OpenAPI types

### Critical Pitfalls

1. **EVM address case-sensitivity in registry lookup** — Store all registry keys as lowercase; apply `.toLowerCase()` for EVM address lookups; use exact Base58 for Solana (case-sensitive). Test with checksum/lowercase/uppercase variants. Intermittent failure, easy to miss if tests always use one form.

2. **Notification template backward compatibility** — Do NOT add a new `{to_display}` variable. Upgrade the value produced for the existing `{to}` variable to "Protocol Name (0xabcd...1234)" format. This eliminates the risk of unreplaced `{to_display}` placeholder text appearing in sent notifications. Any new variables added must be included in the `message-templates.ts` fallback cleanup list and updated in both `en.ts` and `ko.ts`.

3. **Action Provider `displayName` gaps for all 20+ providers** — Add `displayName` as optional with snake_case auto-conversion fallback. Update all 20+ providers in the same phase, not deferred — separated phases risk partial coverage that is hard to detect. Without `displayName`, Action Provider path silently falls back to Well-known registry.

4. **Synchronous-only constraint** — `ContractNameRegistry.resolve()` must be a pure synchronous `string | null` function. Pipeline Stage 1 constructs notification vars synchronously; any async resolution would block the transaction pipeline. RPC calls are strictly forbidden in the resolver. If on-chain resolution is ever needed, implement as a background cache pre-loader.

5. **Cross-chain address key design** — Use compound key `{network}:{lowercaseAddress}` (e.g., `ethereum-mainnet:0xe592...`). Simple address-only keys allow SushiSwap on Polygon to match a different protocol on Ethereum when the deployer addresses happen to be identical. Wrong names are worse than no names.

## Implications for Roadmap

Based on combined research, 3 phases are recommended in strict dependency order.

### Phase 1: Well-Known Data Collection + ContractNameRegistry Core

**Rationale:** All downstream integration depends on the registry class and data existing. Pure data + core service work with no dependencies on other phases. Independently testable in isolation. The data collection (verified addresses from official protocol docs) is the only research-intensive subtask and must come before registry implementation.
**Delivers:** `ContractNameRegistry` class with synchronous `resolve(address, network, opts)` API, `normalizeForLookup(address, chain)` utility (EVM lowercase / Solana exact), `well-known-contracts.ts` with 200-300 verified entries across 5 EVM chains + Solana, `ActionProviderMetadataSchema.displayName` optional field with auto-conversion fallback on all 20+ providers, unit tests including address variant testing (checksum/lowercase/uppercase), CI address-format and deduplication validation.
**Addresses:** Table stakes features 1-4 (provider names, well-known registry, whitelist fallback, truncation fallback).
**Avoids:** Pitfalls 1 (case sensitivity), 3 (displayName gaps), 5 (cross-chain address collision).

### Phase 2: Notification Pipeline Integration

**Rationale:** Notification enrichment is the highest-value user-facing change — it directly affects the Owner approval UX, which is the core WAIaaS security interaction. Depends on Phase 1 registry being stable. Ships before Admin UI because notification quality is more critical than display-layer enrichment.
**Delivers:** Upgraded `{to}` variable value format ("Protocol Name (0xabcd...1234)") injected at TX_REQUESTED / TX_APPROVAL_REQUIRED / TX_SUBMITTED / TX_CONFIRMED notification points in `stages.ts`, updated `en.ts` + `ko.ts` i18n templates, `message-templates.ts` fallback placeholder list updated, integration tests verifying all 4 event types receive resolved names.
**Uses:** `ContractNameRegistry` from Phase 1.
**Avoids:** Pitfalls 2 (template backward compat — value-upgrade approach), 4 (async resolver blocked by synchronous constraint), 9 (`to`/`to_display` variable confusion).

### Phase 3: API Response Enrichment + Admin UI Display

**Rationale:** Admin UI consumes the API enrichment, so API schema and UI changes ship together. OpenAPI type regeneration automatically propagates `contractName` to frontend. Comes last because it depends on the registry (Phase 1) and benefits from validated patterns from Phase 2; it also follows the v31.17 OpenAPI type generation pipeline established in the previous milestone.
**Delivers:** `contractName: z.string().nullable()` field in `TxDetailResponseSchema`, server-side resolution in transaction query routes (GET /v1/wallets/:id/transactions), Admin UI `transactions.tsx` showing protocol names in transaction list/detail, Admin UI `policies.tsx` showing contract names in CONTRACT_WHITELIST display, Wallet Activity tab enrichment, auto-regenerated OpenAPI types for SDK/MCP propagation.
**Uses:** `ContractNameRegistry` from Phase 1, OpenAPI type pipeline from v31.17.
**Avoids:** Pitfall 8 (Admin UI performance — server-side resolution eliminates per-row client computation).

### Phase Ordering Rationale

- Phase 1 is strictly foundational: `ContractNameRegistry` and its data must exist before any integration can be written. The data collection subtask (verifying 80-180 additional well-known addresses from protocol docs) is the only work that cannot be parallelized.
- Phase 2 before Phase 3 because the Owner notification path is the core security UX of WAIaaS. An Owner seeing "Aave V3" instead of a raw hex address in an approval request is the primary user value of this milestone.
- Phase 3 last because it depends on the API schema change (contract adds `contractName` to `TxDetailResponse`) and the v31.17 OpenAPI type generation pipeline handles propagation to Admin UI automatically.
- No separate SDK/MCP phase is needed: SDK types auto-regenerate from OpenAPI in Phase 3. MCP tool responses may include `contractName` implicitly through the enriched API.

### Research Flags

Phases likely needing targeted investigation during planning:

- **Phase 1 (well-known data collection):** 120 addresses already exist in provider configs (verified in STACK.md). The remaining ~80-180 entries for non-integrated protocols (Uniswap V2/V3, Compound V3, Curve, 1inch, Raydium, Marinade, Orca, Metaplex, Chainlink, OpenSea Seaport, ERC-4337 EntryPoint, Morpho) need sourcing from official protocol deployment docs. Data accuracy is critical — incorrect addresses are worse than no data.
- **Phase 2 (Solana `to` field semantics):** PITFALLS.md (Pitfall 7) flags that Solana CONTRACT_CALL `req.to` may contain a recipient address rather than a Program ID. If so, well-known Solana Program IDs in the registry will not match. Validate against `extractTransactionParam()` for Solana CONTRACT_CALL before implementing Stage 1 notification wiring. Action Provider 1st-priority resolution likely covers all Solana DeFi paths regardless.

Phases with standard patterns (skip additional research):

- **Phase 3 (API enrichment):** Follows the exact `amountFormatted` enrichment pattern from v31.15 — well-documented, zero ambiguity, established precedent in this codebase.
- **Phase 1 (registry design):** Follows `builtin-tokens.ts` static data module pattern — established precedent, no design uncertainty.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies confirmed by direct codebase inspection of 13 provider configs. All integration pattern precedents exist and are verified. |
| Features | HIGH | Based on direct codebase inspection + block explorer industry standards. Anti-features clearly scoped out with concrete rationale. MVP vs. defer boundaries are unambiguous. |
| Architecture | HIGH | `ContractNameRegistry` design is straightforward. Every integration pattern has a direct codebase precedent: builtin-tokens, amountFormatted, {type} template var, CONTRACT_WHITELIST name field. |
| Pitfalls | HIGH | All 12 pitfalls identified from direct code analysis of `stages.ts`, `message-templates.ts`, `database-policy-engine.ts`, `action-provider.types.ts`. Not speculative — each pitfall cites exact file and line context. |

**Overall confidence:** HIGH

### Gaps to Address

- **Solana `to` field semantics for CONTRACT_CALL:** Needs runtime verification against `extractTransactionParam()` to confirm whether `req.to` is a Program ID or recipient address in Solana CONTRACT_CALL transactions. Mitigation: Action Provider 1st-priority resolution covers all Solana DeFi paths via the `actionProvider` pipeline field regardless. Well-known Solana registry entries may have limited impact.
- **BATCH transaction `{to}` representation:** PITFALLS.md (Pitfall 11) flags that BATCH has multiple `to` addresses. Confirm current BATCH notification template usage during Phase 2 planning. Likely handled as "N contracts" summary or first-contract display. Low risk.
- **Well-known data completeness (~80-180 addresses):** 120 addresses exist in provider configs; the remaining entries for non-integrated protocols need manual sourcing from official docs. CI address-format validation will catch format errors but cannot catch semantic errors (wrong address for a protocol). Recommend cross-referencing against at least two authoritative sources per protocol.
- **`displayName` auto-conversion quality:** The `jupiter_swap` → `Jupiter Swap` snake_case conversion covers simple cases but protocols with abbreviations (`aave_v3`) need manual overrides. Verify the auto-conversion output for all 20+ providers before shipping Phase 1.

## Sources

### Primary (HIGH confidence)
- Internal codebase: `packages/daemon/src/pipeline/stages.ts` — PipelineContext, notification variable construction patterns, stage functions
- Internal codebase: `packages/daemon/src/notifications/templates/message-templates.ts` — placeholder fallback mechanism, existing variable list
- Internal codebase: `packages/core/src/i18n/en.ts` + `ko.ts` — Messages type structure, existing template variables
- Internal codebase: `packages/daemon/src/pipeline/database-policy-engine.ts` — CONTRACT_WHITELIST `name` field, address comparison pattern (`toLowerCase()`)
- Internal codebase: `packages/core/src/interfaces/action-provider.types.ts` — `ActionProviderMetadataSchema`, 20+ provider metadata, `displayName` absence confirmed
- Internal codebase: `packages/daemon/src/api/routes/openapi-schemas.ts` — `TxDetailResponseSchema`, `amountFormatted` enrichment precedent
- Internal codebase: `packages/core/src/token-registry/builtin-tokens.ts` — static data module pattern, `source: 'builtin'` pattern
- Internal codebase: provider configs (aave-v3, lido-staking, jito-staking, jupiter-swap, drift, zerox-swap, across, polymarket, dcent-swap) — 120 existing hardcoded addresses
- [Uniswap V3 Deployment Addresses](https://docs.uniswap.org/contracts/v3/reference/deployments/) — official multi-chain deployment docs

### Secondary (MEDIUM confidence)
- [Etherscan Label Word Cloud](https://etherscan.io/labelcloud) — label categories and well-known address reference
- [Rabby Wallet pre-sign security checks](https://support.rabby.io/hc/en-us/articles/11495471837071) — industry UX precedent for contract name display in wallet approval flows
- Internal objective: `internal/objectives/m32-00-contract-name-resolution.md` — feature scope definition

### Tertiary (LOW confidence)
- `@bgd-labs/aave-address-book` npm — evaluated and rejected (too heavy for 15 addresses already hardcoded)
- `eth-labels` npm (dawsbot) — evaluated and rejected (170k noisy entries, not curated for DeFi contracts)
- `brianleect/etherscan-labels` GitHub — evaluated and rejected (stale 2023 scrape, no npm package)

---
*Research completed: 2026-03-15*
*Ready for roadmap: yes*
