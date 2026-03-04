# Project Research Summary

**Project:** WAIaaS v30.8 -- ERC-8004 Trustless Agents
**Domain:** On-chain AI agent identity, reputation, and validation integration
**Researched:** 2026-03-04
**Confidence:** MEDIUM-HIGH

## Executive Summary

ERC-8004 is a Draft EIP (published August 2025, mainnet deployed January 29, 2026) that defines three on-chain registries for AI agent identity (ERC-721 NFT), reputation (permissionless feedback), and validation (TEE/zkML attestation). With ~14,500 registered agents in 33 days and backing from MetaMask, Ethereum Foundation, Google, and Coinbase authors, adoption is significant and integration is timely. The registries are deployed as UUPS upgradeable proxies at deterministic addresses across Ethereum mainnet and 13+ L2/sidechains, with Sepolia testnet contracts available. WAIaaS integrates this as a new `Erc8004ActionProvider` following the proven ActionProvider pattern used by all 9 existing providers (Jupiter, Aave, Lido, Pendle, etc.).

The recommended approach requires **zero new npm dependencies**. The existing stack (viem 2.x, Zod, Drizzle, OpenAPIHono) provides full coverage for all ERC-8004 interactions. The community SDK ecosystem (erc-8004-js, agent0-sdk, 0xgasless) is immature and ethers.js-based -- using them would introduce dependency conflicts without added value. Instead, contract ABIs are extracted directly from Etherscan-verified source code and used via viem's `readContract`/`encodeFunctionData`/`signTypedData` -- the same pattern proven in every existing ActionProvider. The signature feature is REPUTATION_THRESHOLD, a new (18th) policy type that uses on-chain reputation data to enforce trust-based security tiers, making WAIaaS the only wallet-as-a-service that integrates ERC-8004 reputation into transaction security.

Key risks center on three areas: (1) **ABI stability** -- the EIP is Draft and contracts are upgradeable, so the ABI could change; mitigation is building against deployed bytecode (not spec text) with an abstraction layer; (2) **EIP-712 signature correctness** for `setAgentWallet` -- research found the objective document's typehash is incorrect (3 fields vs. 4 fields on-chain, wrong type name); (3) **Validation Registry unavailability** -- only Identity and Reputation registries have confirmed mainnet deployments; Validation should be deferred or made optional. The DB migration (v38->v39) involves the well-established but risk-prone policies table recreation pattern, requiring careful index management and foreign key handling.

## Key Findings

### Recommended Stack

Zero new dependencies. The entire ERC-8004 integration is built on the existing WAIaaS technology stack. All community SDKs were evaluated and rejected due to ethers.js dependency conflicts, immaturity (3-53 GitHub stars), and unnecessary abstraction over what viem provides natively.

**Core technologies (all existing):**
- **viem ^2.21.0**: Contract calls, ABI encoding, EIP-712 signing -- full coverage of all ERC-8004 patterns, no version bump needed
- **Zod (existing)**: New schemas for 8 write actions + 3 read queries, registration file validation
- **Drizzle ORM (existing)**: New `agent_identities` + `reputation_cache` tables, standard migration pattern
- **OpenAPIHono (existing)**: 5 new GET routes for read-only queries + 1 public registration file endpoint

**What to build (not install):**
- ABI const files extracted from Etherscan-verified contract source
- `Erc8004RegistryClient` thin wrapper around viem readContract/encodeFunctionData
- `Erc8004ActionProvider` implementing IActionProvider with 8 write actions
- `ReputationCacheService` with in-memory Map + DB fallback pattern

### Expected Features

**Must have (table stakes -- 18 features):**
- TS-01: Agent Registration (NFT minting via Identity Registry)
- TS-02: agentWallet Linking (EIP-712 signature proof of wallet ownership) -- HIGHEST COMPLEXITY
- TS-03/04: Registration File auto-generation + service endpoint declaration
- TS-05/06/07: Reputation read, give feedback, revoke feedback
- TS-08: REPUTATION_THRESHOLD policy type (18th policy, signature differentiator)
- TS-09: Reputation score cache (in-memory + DB + RPC with 3s timeout)
- TS-10: DB Schema v39 migration (agent_identities, reputation_cache, approval_type column)
- TS-11/12/13: REST API (5 GET routes), MCP (11 tools), SDK (11 methods)
- TS-14: Admin Settings (9 keys under `actions.erc8004_*`)
- TS-15/16: connect-info extension, 5 new notification events
- TS-17/18: Skill file + Admin UI ERC-8004 page

**Should have (differentiators -- 8 features):**
- DF-03: Reputation-based policy engine (novel -- no other WaaS does this)
- DF-05: Admin UI reputation dashboard with score cards + feedback tables
- DF-06: `/.well-known/agent-registration.json` domain verification
- DF-07: EIP-712/ERC-1271 dual signature support (EOA + Smart Account)

**Defer to v2+:**
- DF-01: OASF capabilities in registration file
- DF-04: Multi-chain registration (depends on user demand)
- AF-01: Automatic validation pipeline insertion (Stage 3.5)
- AF-02: Automatic feedback posting (spam risk)
- AF-03: Reputation aggregation service (separate product)
- AF-07: appendResponse (feedback defense)

### Architecture Approach

The integration follows WAIaaS's established extension patterns without introducing new architectural paradigms. Write operations flow through `Erc8004ActionProvider.resolve()` into the 6-stage pipeline. Read operations bypass the pipeline via dedicated REST routes backed by `Erc8004RegistryClient`. The REPUTATION_THRESHOLD policy evaluation sits at position 4f in Stage 3 (after APPROVED_SPENDERS, before SPENDING_LIMIT) and uses `maxTier()` to only escalate, never de-escalate security tiers. The provider-trust mechanism automatically bypasses CONTRACT_WHITELIST for registered ERC-8004 registry addresses.

**Major components (across 7 packages):**
1. **Erc8004ActionProvider** (packages/actions/) -- resolves 8 write actions to ContractCallRequest
2. **Erc8004RegistryClient** (packages/actions/) -- viem contract read/encode wrapper for 3 registries
3. **ReputationCacheService** (packages/daemon/) -- in-memory Map + DB fallback + 3s RPC timeout
4. **REPUTATION_THRESHOLD evaluator** (packages/daemon/) -- Stage 3 policy tier override
5. **ERC-8004 routes** (packages/daemon/) -- 5 read-only GET endpoints + 1 public registration file endpoint
6. **ERC-8004 Admin page** (packages/admin/) -- identity management + reputation dashboard
7. **DB migration v39** (packages/daemon/) -- agent_identities, reputation_cache, approval_type column

### Critical Pitfalls

1. **C1: ABI Mismatch (CRITICAL)** -- Contracts are upgradeable proxies; objective doc ABI may not match deployed bytecode. Research already found the EIP-712 typehash is wrong in the objective (3 fields vs. 4 on-chain, wrong type name `SetAgentWallet` vs. `AgentWalletSet`). **Mitigation**: Extract ABIs directly from Etherscan verified source; verify on forked Anvil testnet before implementation.

2. **C2: EIP-712 Domain Separator (CRITICAL)** -- Domain name is `ERC8004IdentityRegistry` version `1` with 4-field struct including `owner`. Any mismatch causes silent signature failure. **Mitigation**: Test EIP-712 signatures against forked mainnet using viem Anvil; use Sepolia testnet for validation.

3. **C3: Policies Table Recreation (CRITICAL)** -- Adding REPUTATION_THRESHOLD requires SQLite table recreation. Foreign key cascade during DROP TABLE can delete all existing policies. **Mitigation**: Follow established v26 pattern exactly: `managesOwnTransaction`, `PRAGMA foreign_keys = OFF`, recreate all 3 indexes, migration chain test.

4. **C4: Draft EIP Spec Changes (MODERATE-HIGH)** -- EIP is Draft with v2 in development; contracts are upgradeable. **Mitigation**: Build against deployed ABI (not spec text), abstraction layer via RegistryClient, feature flag defaults OFF, health check on startup.

5. **M3: EIP-712 Approval Channel Mismatch (MODERATE)** -- Ntfy/Telegram cannot collect EIP-712 signatures; only WalletConnect and Admin UI can. **Mitigation**: Filter ApprovalChannelRouter to route EIP-712 approvals only to capable channels; text channels send notification with Admin UI link.

## Implications for Roadmap

Based on combined research, the integration decomposes into 7 phases driven by strict dependency ordering. Estimated total: ~3,000-4,000 LOC TypeScript, ~55-65 new tests.

### Phase 1: ABI Verification + Foundation
**Rationale:** Everything depends on correct ABIs and DB schema. Research found the objective document has incorrect EIP-712 typehash (C1, C2). This MUST be verified before any implementation begins.
**Delivers:** Verified ABI files, DB migration v39, core enum extensions (PolicyType, NotificationEventType), Admin Settings (9 keys)
**Addresses:** TS-10 (DB migration), TS-14 (Admin Settings), TS-16 (notification events), Zod schema extensions
**Avoids:** C1 (ABI mismatch), C2 (EIP-712 domain separator), C3 (policies table recreation), N5 (Validation Registry address confirmation)

### Phase 2: ActionProvider + Registry Client
**Rationale:** The ActionProvider is the core integration point. All write operations flow through it. Read-only routes and policy evaluation depend on the RegistryClient it produces.
**Delivers:** Erc8004ActionProvider (8 write actions), Erc8004RegistryClient, ABI const files, registration file generator, multi-chain address constants
**Uses:** viem encodeFunctionData/readContract, IActionProvider interface, ContractCallRequest type
**Implements:** ActionProvider registration, provider-trust bypass, registration file auto-generation (TS-01, TS-03, TS-04)

### Phase 3: Read-Only Routes + Registration File Hosting
**Rationale:** Read-only endpoints are independent of policy changes and approval flow. They serve as the data layer for both the Admin UI and external agent discovery.
**Delivers:** 5 GET endpoints (/v1/erc8004/*), public registration file endpoint, connect-info extension, `/.well-known/agent-registration.json`
**Addresses:** TS-11 (REST routes), TS-15 (connect-info), DF-06 (domain verification)
**Avoids:** M4 (registration file schema drift), N6 (connect-info backward compatibility)

### Phase 4: Reputation Policy Engine + Cache
**Rationale:** The REPUTATION_THRESHOLD policy is the signature differentiator and the most architecturally sensitive modification. It should be isolated and thoroughly tested. Depends on RegistryClient from Phase 2.
**Delivers:** ReputationCacheService, REPUTATION_THRESHOLD evaluator in DatabasePolicyEngine (position 4f), maxTier escalation logic
**Addresses:** TS-05 (read reputation), TS-06 (give feedback), TS-07 (revoke feedback), TS-08 (policy type), TS-09 (cache)
**Avoids:** M1 (score normalization -- normalize to 0-100), M2 (Sybil gaming -- supplementary policy only), N2 (RPC latency -- 3s timeout + cache)

### Phase 5: ApprovalWorkflow EIP-712 Extension
**Rationale:** agentWallet linking is the highest-complexity feature and introduces a new approval type (EIP-712 vs. SIWE). Building it after the core ActionProvider and policy engine ensures the foundation is stable.
**Delivers:** EIP-712 typed data approval flow, approval_type routing in ApprovalChannelRouter, WalletConnect eth_signTypedData_v4 support
**Addresses:** TS-02 (agentWallet linking), DF-02 (Validation Registry request_validation -- if deployed)
**Avoids:** M3 (channel mismatch -- route EIP-712 to WC/Admin only), I1 (pending_approvals schema extension)

### Phase 6: Admin UI + MCP + SDK
**Rationale:** Frontend and SDK are pure consumers of backend APIs. Building them last ensures API stability and complete feature coverage.
**Delivers:** Admin UI ERC-8004 page (5 sections), reputation dashboard, REPUTATION_THRESHOLD policy form, 3 read-only MCP tools, 11 SDK methods
**Addresses:** TS-12 (MCP), TS-13 (SDK), TS-18 (Admin UI), DF-05 (reputation dashboard)
**Avoids:** N4 (EVM-only -- filter wallet selectors to EVM wallets only)

### Phase 7: Notification Integration + E2E Testing
**Rationale:** Wire notification events to trigger points and run full integration tests across all phases. This is the final validation step.
**Delivers:** 5 notification events wired, E2E pipeline tests, provider-trust verification, feature gate verification, skill file (TS-17)
**Addresses:** TS-16 (wiring), TS-17 (skill file), cross-phase integration validation
**Avoids:** N3 (notification spam -- per-counterparty dedup), I5 (EventBus listener count)

### Phase Ordering Rationale

- **Phase 1 first** because research found concrete errors in the objective document (wrong EIP-712 typehash, missing `owner` field, wrong type name). ABI verification is non-negotiable before any implementation.
- **Phase 2 before 3-5** because RegistryClient is the shared dependency for routes, policy evaluation, and approval flow.
- **Phase 4 (policy) isolated** because it modifies the critical-path DatabasePolicyEngine -- changes here affect every transaction in the system.
- **Phase 5 (EIP-712 approval) after Phase 4** because it builds on the policy tier output (APPROVAL tier triggers the approval workflow).
- **Phase 6 (UI/SDK) last** because it consumes all APIs from Phases 2-5 and benefits from stable interfaces.
- **Phase 7 (E2E) as final** because it validates cross-phase integration that cannot be tested in isolation.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (ABI Verification):** MUST verify deployed contract ABI against Etherscan source; confirm Validation Registry deployment status; extract exact EIP-712 domain separator via `eip712Domain()` call or source inspection
- **Phase 5 (EIP-712 Approval):** WalletConnect `eth_signTypedData_v4` integration needs verification with actual WalletConnect v2 SDK; Admin UI EIP-712 signing UX needs design

Phases with standard patterns (skip research-phase):
- **Phase 2 (ActionProvider):** Identical pattern to 9 existing providers -- well-documented, proven
- **Phase 3 (Read-Only Routes):** Standard Hono route registration -- no research needed
- **Phase 6 (Admin UI + MCP + SDK):** Follows existing component patterns exactly
- **Phase 7 (Notifications + E2E):** Standard EventBus wiring + test patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies; all capabilities verified against existing viem 2.x usage in codebase |
| Features | MEDIUM-HIGH | 18 table-stakes features well-defined; Validation Registry availability uncertain |
| Architecture | HIGH | Follows 9 proven ActionProvider implementations; all integration points verified against codebase |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls (ABI, EIP-712, migration) are well-understood with proven mitigations; Draft EIP stability is inherently unpredictable |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Validation Registry deployment**: Not confirmed on mainnet. Must verify during Phase 1 or defer `request_validation` to a future milestone. The `actions.erc8004_validation_registry_address` Admin Setting with empty default handles this gracefully.
- **EIP-712 domain separator verification**: Research extracted it from source code but it needs on-chain verification via Anvil fork test. The typehash correction (4 fields, `AgentWalletSet` name, includes `owner`) is HIGH confidence but must be tested.
- **WalletConnect eth_signTypedData_v4**: The existing WcSigningBridge handles SIWE. Supporting EIP-712 typed data may require WalletConnect SDK changes. Verify during Phase 5 planning.
- **v2 EIP changes timeline**: No concrete timeline for v2 spec. Monitor [Ethereum Magicians thread](https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098) for breaking changes.
- **`unrated_tier` default**: Research recommends defaulting to NOTIFY instead of APPROVAL (objective says APPROVAL) to avoid excessive friction for users who enable REPUTATION_THRESHOLD without understanding the implications for unknown counterparties.
- **Agent identifier separator**: Objective uses `:` but EIP spec uses `#` separator (e.g., `eip155:1:0xAbC...Def#42`). Implementation must follow EIP spec.

## Sources

### Primary (HIGH confidence)
- [EIP-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004) -- Official Draft EIP, full ABI definitions
- [Etherscan: Identity Registry](https://etherscan.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) -- Verified contract, 14,527 transactions
- [erc-8004-contracts GitHub](https://github.com/erc-8004/erc-8004-contracts) -- Official repo (179 stars, 75 forks), deployment addresses, Hardhat source
- [IdentityRegistryUpgradeable.sol source](https://github.com/erc-8004/erc-8004-contracts/blob/main/contracts/IdentityRegistryUpgradeable.sol) -- EIP-712 typehash/domain (verified)
- [viem signTypedData](https://viem.sh/docs/actions/wallet/signTypedData.html) / [hashTypedData](https://viem.sh/docs/utilities/hashTypedData) -- Official viem docs

### Secondary (MEDIUM confidence)
- [awesome-erc8004](https://github.com/sudeepb02/awesome-erc8004) -- Community ecosystem catalog
- [ERC-8004 Best Practices](https://github.com/erc-8004/best-practices) -- Registration file + reputation conventions
- [MetaMask: Design Server Wallets](https://docs.metamask.io/tutorials/design-server-wallets/) -- Server wallet for ERC-8004 tutorial
- [Filecoin Pin for ERC-8004](https://docs.filecoin.io/builder-cookbook/filecoin-pin/erc-8004-agent-registration) -- Registration file IPFS hosting
- [Composable Security Explainer](https://composable-security.com/blog/erc-8004-a-practical-explainer-for-trustless-agents/) -- Practical implementation guide
- [Ethereum Magicians Discussion](https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098) -- EIP discussion thread

### Tertiary (LOW confidence)
- [agent0-ts GitHub](https://github.com/agent0lab/agent0-ts) -- Community SDK (53 stars), ethers-based
- [erc-8004-js GitHub](https://github.com/tetratorus/erc-8004-js) -- Community SDK (6 stars), stale since Oct 2025
- [Eco: ERC-8004 Overview](https://eco.com/support/en/articles/13221214-what-is-erc-8004-the-ethereum-standard-enabling-trustless-ai-agents) -- v2 spec changes, 45,000+ agents claim
- [CCN: ERC-8004 Risks](https://www.ccn.com/education/crypto/erc-8004-ai-agents-on-chain-ethereum-how-works-risks-explained/) -- Sybil attack vectors

---
*Research completed: 2026-03-04*
*Ready for roadmap: yes*
