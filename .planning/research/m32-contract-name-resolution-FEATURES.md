# Feature Landscape: Contract Name Resolution

**Domain:** Wallet/DeFi contract address display and identification
**Researched:** 2026-03-15

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Action Provider name in notifications | DeFi wallets (Rabby, MetaMask) show protocol names on tx approval. Owner sees "Aave V3" not raw hex. Existing `actionProvider` field already carries this data. | Low | `actionProvider` field in ContractCallRequest, `IActionProvider.metadata.name` | Zero-cost: data already flows through pipeline, just not surfaced in notification vars |
| Well-known contract registry (static) | Etherscan labels 10,000+ addresses. Every block explorer resolves known contracts. Users expect protocol names for direct CONTRACT_CALL without Action Provider. | Medium | `@waiaas/core` data module, chain adapter network IDs | 300+ entries target across 5 EVM chains + Solana. TS const objects for type safety + zero runtime cost |
| CONTRACT_WHITELIST name fallback | Users already enter `name` field in whitelist policies. Not surfacing it in notifications wastes their effort. | Low | `DatabasePolicyEngine` whitelist query, existing `name` field in contract rules | Already stored in DB, just needs lookup path |
| Abbreviated address fallback | Unknown contracts must still display something useful. `0x8787...4E2` is standard across all wallets/explorers. | Low | Existing `formatAddress()` utility | Already implemented in Admin UI, extend to notification context |
| Notification template `{to_display}` variable | All notification types (TX_REQUESTED, TX_APPROVAL_REQUIRED, TX_SUBMITTED, TX_CONFIRMED) should show resolved name. | Medium | i18n templates (en.ts, ko.ts), `message-templates.ts`, pipeline stages 1/3/5 | Template variable substitution infra already exists |
| Admin UI transaction list contract names | Rabby shows protocol names in tx history. Admin should too. | Medium | `ContractNameResolver` service, Admin transactions page, API response enrichment | `formatAddress()` in `transactions.tsx` line 627 currently shows raw counterparty |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Priority-based resolution (4-tier) | Most wallets use single source (Etherscan API or hardcoded). 4-tier cascade (Action Provider > Well-known > Whitelist > Fallback) maximizes coverage without RPC | Low | All 4 sources implemented | Unique to WAIaaS: combines provider metadata + static registry + user config |
| Synchronous-only resolution | No RPC calls, no latency. Notification delivery unaffected. Contrast with ENS reverse lookup (500ms+ per call, often fails for contracts) | Low | Design constraint, not code | Key differentiator: "zero-cost name resolution" |
| Action Provider `displayName` metadata | Each provider self-declares human-readable name. `jupiter_swap` -> "Jupiter", `aave_v3` -> "Aave V3". Type-safe, self-documenting. | Low | `IActionProvider.metadata` interface extension | 14+ providers already have `metadata.name`; add `displayName` field |
| Source attribution in API | Responses include `source: 'action_provider' | 'well_known' | 'whitelist' | 'fallback'` so consumers know resolution confidence | Low | `ResolvedName.source` field | Useful for auditing and debugging |
| Cross-chain same-address disambiguation | Same address on Ethereum vs Base may be different protocols. Registry is network-aware. | Medium | Per-network well-known data files | Prevents misidentification on L2s where deployer addresses sometimes differ |
| Wallet detail page contract name enrichment | Wallet's Activity tab shows resolved names instead of raw addresses for CONTRACT_CALL transactions | Medium | Admin wallet detail page, `ContractNameResolver` | Enhances the 4-tab wallet detail (Overview/Activity/Assets/Setup) |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| ENS/SNS reverse resolution | DeFi contracts rarely set reverse records. RPC cost per lookup. L2 contracts unsupported. Success rate < 5% for DeFi addresses. Adds `@ensdomains/ensjs` dependency. | Use static well-known registry. 300+ curated entries > unreliable on-chain lookup |
| Etherscan/block explorer API lookup | External API dependency. Rate limits. Requires API key management. Adds latency to notifications. | Embed curated subset as static data. No network dependency |
| On-chain contract name() call | Not all contracts implement name(). Proxy contracts return implementation name not protocol name. Gas cost. Network latency. | Static registry with verified protocol names |
| User-editable address book | Scope creep. Adds CRUD UI, DB table, permission model. CONTRACT_WHITELIST `name` field already serves this purpose for whitelisted contracts. | Leverage existing CONTRACT_WHITELIST name field as "user label" |
| Real-time contract verification status | Adds Etherscan API dependency for "verified" badge. Marginal value for name resolution. | Omit. Well-known registry entries are pre-verified |
| Automatic registry updates via external API | DeFiLlama/CoinGecko API polling for new protocol addresses. Adds complexity, external dependency, potential for poisoned data. | Ship curated registry as code. Update via daemon version bumps |
| Transaction simulation / decoded calldata display | Full Rabby-style "what will this transaction do" preview. Massive scope (ABI decoding, state simulation). | Out of scope. Separate milestone if needed. Name resolution is focused on "who" not "what" |

## Feature Dependencies

```
Action Provider displayName ─┐
                              ├─> ContractNameResolver (orchestrator)
Well-known Registry ──────────┤         │
                              │         ├─> Notification template {to_display}
CONTRACT_WHITELIST query ─────┘         │
                                        ├─> Admin UI transaction list enrichment
formatAddress() fallback ───────────────┘
```

Key dependency chain:
- `ContractNameResolver` depends on all 4 data sources being available
- Notification integration depends on `ContractNameResolver` + i18n template changes
- Admin UI display depends on `ContractNameResolver` being exposed via API or shared service
- Well-known data files must be collected (research phase) before registry implementation

## MVP Recommendation

Prioritize:
1. **Action Provider displayName mapping** -- Zero new data needed. 14+ providers already have `metadata.name`. Just wire `actionProvider` field to notification vars. Covers ~80% of DeFi CONTRACT_CALL notifications immediately.
2. **Well-known contract registry** -- Static TS data files with 300+ entries. Covers direct CONTRACT_CALL (non-Action-Provider path). Research phase for data collection, then straightforward implementation.
3. **Notification template integration** -- `{to_display}` variable across 4 notification event types. Existing template variable substitution infrastructure handles this.
4. **Admin UI enrichment** -- `formatAddress()` calls in transactions.tsx and wallets.tsx replaced with resolved names.

Defer:
- **CONTRACT_WHITELIST name lookup** -- Include in MVP but low priority. Simple DB query addition to resolver.
- **Wallet detail Activity tab enrichment** -- Same pattern as transaction list, can ship together.

## Phase Structure Implication

Based on feature dependencies, natural phase ordering:

1. **Well-known data research + collection** -- Gather 300+ contract addresses from official docs. No code changes. Pure data work.
2. **ContractNameResolver + Registry implementation** -- Core service + well-known data files + Action Provider displayName. Unit tests.
3. **Pipeline notification + Admin UI integration** -- Wire resolver into stages.ts, update i18n templates, enrich Admin UI displays. Integration tests.

## Sources

- [Etherscan Public Name Tags and Labels](https://info.etherscan.com/public-name-tags-labels/)
- [Etherscan Label Word Cloud](https://etherscan.io/labelcloud)
- [Rabby Wallet - Pre-sign security checks](https://support.rabby.io/hc/en-us/articles/11495471837071)
- [Rabby vs MetaMask comparison](https://messari.io/compare/rabby-wallet-vs-metamask)
- [Tenderly Transaction Simulation](https://tenderly.co/transaction-simulator)
- Internal: `m32-00-contract-name-resolution.md` objective document
- Internal: `packages/actions/src/` -- IActionProvider.metadata.name patterns
- Internal: `packages/admin/src/utils/format.ts` -- existing formatAddress()
- Internal: `packages/admin/src/pages/transactions.tsx` -- current raw address display
- Internal: `skills/policies.skill.md` -- CONTRACT_WHITELIST name field documentation
