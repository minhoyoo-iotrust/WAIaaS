# Feature Landscape: ERC-8004 Trustless Agents Integration

**Domain:** AI Agent On-Chain Identity, Reputation, and Validation
**Researched:** 2026-03-04
**Mode:** Ecosystem (Subsequent Milestone)
**Overall Confidence:** MEDIUM-HIGH

---

## Table Stakes

Features users expect from an ERC-8004 integration. Missing = product feels incomplete to anyone looking for ERC-8004 support.

| # | Feature | Why Expected | Complexity | Dependencies on Existing | Notes |
|---|---------|-------------|------------|-------------------------|-------|
| TS-01 | **Identity Registry: Agent Registration (NFT Minting)** | Core purpose of ERC-8004 -- without this, there is no on-chain identity. `register(agentURI, metadata[])` mints an ERC-721 token. | Med | IActionProvider `resolve()`, CONTRACT_CALL pipeline, viem 2.x `encodeFunctionData` | ActionProvider pattern is proven (Jupiter, 0x, Aave, etc.). Identity Registry mainnet: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (same address across 16 EVM chains). |
| TS-02 | **Identity Registry: agentWallet Linking** | Connects the WAIaaS wallet address to the on-chain agent ID. Without this, the agent has an ID but no operational wallet association -- defeats the purpose. `setAgentWallet(agentId, wallet, deadline, signature)` requires EIP-712/ERC-1271 proof of wallet ownership. | High | ApprovalWorkflow (Owner signature collection), SIWE/WalletConnect, pending_approvals table | **Key complexity**: requires EIP-712 typed data signature from the wallet owner (different from standard SIWE). Needs `approval_type` column extension in pending_approvals. Only WalletConnect and Admin UI can collect EIP-712 signatures -- Ntfy/Telegram are text-only channels. |
| TS-03 | **Registration File Auto-Generation + Hosting** | ERC-8004 agents are discovered via their registration file (JSON at agentURI). Without auto-generation, users must manually create and host this file -- unacceptable DX for a self-hosted daemon. | Med | connect-info endpoint (existing), daemon HTTP server | Best practice: `type`, `name`, `description`, `image`, `services` are mandatory fields per spec. Must include `registrations` array linking back to on-chain agentId. Daemon endpoint `GET /v1/erc8004/registration-file/:walletId` (public, no auth) as default host. |
| TS-04 | **Registration File Service Endpoints** | The registration file MUST declare service endpoints (MCP, REST API, A2A) -- this is how other agents discover how to interact. The "Four Golden Rules" from official best practices mandate at least one service endpoint. | Low | MCP server endpoint, REST API base URL (both already exist) | Auto-detect WAIaaS MCP + REST endpoints. Include x402Support flag if x402 is enabled. Include OASF capabilities if skills are defined. |
| TS-05 | **Reputation Registry: Read Agent Reputation** | Basic query capability -- `getSummary()` to check an agent's reputation score before interacting. Without this, the reputation system is unusable. | Low | viem 2.x `readContract`, new REST route `/v1/erc8004/agent/:agentId/reputation` | Reputation Registry mainnet: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`. Returns `count`, `summaryValue`, `summaryValueDecimals`. On-chain reputation is raw data -- normalization is consumer's responsibility. |
| TS-06 | **Reputation Registry: Give Feedback** | Agents need to rate other agents they interact with. `giveFeedback()` posts an on-chain review. Without this, WAIaaS agents cannot participate in the reputation economy. | Med | IActionProvider `resolve()`, CONTRACT_CALL pipeline | Feedback uses `int128 value` + `uint8 valueDecimals` (signed fixed-point, 0-18 decimals). Community convention: 0-100 scale with decimals=0 for simple ratings, or star ratings mapped to 20/40/60/80/100. Tags (`tag1`, `tag2`) enable domain-specific filtering (e.g., "swap", "speed"). |
| TS-07 | **Reputation Registry: Revoke Feedback** | Agents must be able to retract incorrect feedback. `revokeFeedback()` marks a feedback entry as revoked (soft delete). | Low | IActionProvider `resolve()` | Simple: encode + submit. feedbackIndex from previous giveFeedback event. |
| TS-08 | **REPUTATION_THRESHOLD Policy Type** | The WAIaaS value proposition for ERC-8004 -- use on-chain reputation data to enforce trust-based security tiers. Low-reputation counterparties trigger higher security (APPROVAL/DELAY). | High | PolicyEngine Stage 3, 17 existing policy types, DB CHECK constraint migration | 18th PolicyType. Rules: `min_score` (0-100 normalized), `below_threshold_tier`, `unrated_tier`, optional tag filters, `check_counterparty` boolean. Tier escalation only (never downgrades). Position: after APPROVED_SPENDERS, before SPENDING_LIMIT (slot 6 of 15). |
| TS-09 | **Reputation Score Cache** | On-chain `readContract(getSummary)` is slow (RPC latency) and costs RPC credits. Every transaction would need a reputation check in Stage 3 if the policy is active. | Med | None new (in-memory Map + DB table) | Architecture: in-memory cache (TTL 300s) -> DB fallback (stale data) -> RPC call. Key: `{agentId}:{registryAddress}:{tag1}:{tag2}`. RPC timeout: 3s default (configurable). Failure mode: DB fallback -> unrated_tier if both fail. |
| TS-10 | **DB Schema v39 Migration** | New tables and columns required for the feature set. | Med | DB v38 (current, ERC-4337), pushSchema 3-step pattern, policies table recreation pattern | Tables: `agent_identities` (wallet<->agentId mapping), `reputation_cache` (score fallback). Columns: `pending_approvals.approval_type` (SIWE vs EIP712). policies table recreation for REPUTATION_THRESHOLD CHECK constraint (proven pattern from v6b, v8, v11, v20, v27, v33). |
| TS-11 | **REST API: Read-Only Endpoints** | Agents and Admin UI need to query agent info, reputation, validation status, and registration files without going through the transaction pipeline. | Med | Hono route registration, sessionAuth middleware | 5 new GET routes: `/v1/erc8004/agent/:agentId`, `/v1/erc8004/agent/:agentId/reputation`, `/v1/erc8004/agent/:agentId/feedback`, `/v1/erc8004/validation/:requestHash`, `/v1/erc8004/registration-file/:walletId` (public). |
| TS-12 | **MCP Tool Exposure** | AI agents interact via MCP. The 8 write actions auto-expose via `mcpExpose: true`. 3 read-only tools need manual registration. | Low | MCP server, ActionProvider mcpExpose mechanism | 11 MCP tools total (8 auto + 3 manual). Follows existing pattern from Jupiter, Aave providers. |
| TS-13 | **TypeScript SDK Methods** | Programmatic access for agents not using MCP. | Low | @waiaas/sdk client extension pattern | 11 methods: 8 write (via ActionProvider) + 3 read (direct GET). Follows existing pattern. |
| TS-14 | **Admin Settings (9 Keys)** | Runtime configuration for ERC-8004 feature: enable/disable, registry addresses, cache TTL, min reputation score. | Low | SettingsService SSoT, Admin UI Settings page | 9 keys under `actions.erc8004_*` namespace. Feature gate: `actions.erc8004_agent_enabled` defaults to `false` (opt-in). |
| TS-15 | **connect-info Extension** | When a wallet has an ERC-8004 identity, the connect-info endpoint should expose it so agents can discover their own on-chain identity. | Low | GET /v1/connect-info (existing), ConnectInfoResponse schema | Add optional `erc8004` field: `{ agentId, identityRegistry, chainId, registrationFileUrl, status }`. |
| TS-16 | **Notification Events (5 New)** | Critical lifecycle events need notifications: AGENT_REGISTERED, AGENT_WALLET_LINKED, AGENT_WALLET_UNLINKED, REPUTATION_FEEDBACK_RECEIVED, REPUTATION_THRESHOLD_TRIGGERED. | Low | NotificationEventType enum (49 -> 54), EventBus, existing 4-channel notification | Standard pattern: add to enum, emit from relevant code paths, existing channels deliver. |
| TS-17 | **Skill File: erc8004.skill.md** | CLAUDE.md rule: API/MCP changes require skill file sync. New domain = new skill file. | Low | skills/ directory, existing 7 skill files | New file + updates to policies.skill.md and admin.skill.md. |
| TS-18 | **Admin UI: ERC-8004 Identity Page** | Admin must be able to register agents, link wallets, view registration files, manage metadata. Without UI, only CLI/API access. | High | Admin UI (Preact 10.x + @preact/signals + Vite 6.x), 11 existing menus | New `/erc8004` page with 5 sections: registration status table, registration form, wallet linking (WalletConnect), registration file previewer, metadata editor. |

---

## Differentiators

Features that set WAIaaS apart in the ERC-8004 ecosystem. Not expected, but valuable.

| # | Feature | Value Proposition | Complexity | Dependencies | Notes |
|---|---------|-------------------|------------|--------------|-------|
| DF-01 | **OASF Capabilities in Registration File** | Other ERC-8004 agents list basic endpoints. WAIaaS can auto-generate OASF (Open Agentic Schema Framework v0.8.0) capabilities from existing skill files, making agents more discoverable in marketplace UIs like AgentStore. | Med | skills/ files content, registration file generator | OASF structure: `{ name: "OASF", version: "v0.8.0", skills: ["category/subcategory"], domains: ["field/subfield"] }`. Maps WAIaaS skill files to OASF taxonomy. |
| DF-02 | **Validation Registry: Request Validation** | Most ERC-8004 adopters skip the Validation Registry entirely (it is the least mature of the three). Supporting `request_validation` positions WAIaaS as a complete ERC-8004 implementation. | Med | IActionProvider `resolve()` | Note: Validation Registry contract address is NOT yet in the deployed addresses list -- needs verification in research phase. The `validationRequest()` function takes a validator address, agentId, requestURI, and requestHash. |
| DF-03 | **Reputation-Based Policy Engine** | No other wallet-as-a-service integrates on-chain reputation into transaction security tiers. REPUTATION_THRESHOLD policy = unique WAIaaS differentiator. Agents with low reputation trigger APPROVAL tier automatically. | High | REPUTATION_THRESHOLD (TS-08), reputation cache (TS-09) | This is the signature feature. ERC-8004 defines the data layer; WAIaaS adds the enforcement layer. The combination is novel. |
| DF-04 | **Multi-Chain Registration File** | WAIaaS manages wallets across 16+ EVM networks. The registration file can advertise presence on all of them via the `registrations` array, with one agentId per chain. Most agents register on a single chain. | Low | Multi-chain wallet model (v1.4.6), chain adapters | The same Identity/Reputation Registry addresses are deployed at identical addresses across Ethereum, Base, Arbitrum, Optimism, Polygon, Scroll, Linea, Mantle, Avalanche, Celo, Gnosis, Taiko, MegaETH, BSC, Abstract, Monad. |
| DF-05 | **Admin UI: Reputation Dashboard** | Visual reputation monitoring with score cards, feedback tables, tag filtering, external agent lookup. Most ERC-8004 integrations are CLI-only. | Med | Admin UI framework, GET reputation endpoints | Sections: my agent reputation summary, received feedback list (filterable), external agent reputation lookup. |
| DF-06 | **Registration File Domain Verification** | Best practices recommend publishing `/.well-known/agent-registration.json` on the service domain for bidirectional verification. WAIaaS can auto-serve this at the daemon's base URL. | Low | Daemon HTTP server | Simple: add a route that serves the same registration file at `/.well-known/agent-registration.json`. Adds trust signal without user effort. |
| DF-07 | **EIP-712/ERC-1271 Dual Signature Support** | The spec requires EIP-712 for EOA wallets and ERC-1271 for smart contract wallets when calling `setAgentWallet`. WAIaaS supports both via ERC-4337 Smart Account (v30.6). | Med | ERC-4337 SmartAccountService (v30.6), WalletConnect | Most implementations only support EOA. WAIaaS's Smart Account support means agent wallets can be smart contracts too. |
| DF-08 | **Feedback Tag Convention Enforcement** | The ERC-8004 best practices define standard tags (`starred`, `reachable`, `ownerVerified`, `uptime`, `successRate`, `responseTime`, etc.). WAIaaS can provide tag auto-completion and validation in both MCP tools and Admin UI. | Low | Zod schema validation, MCP tool input descriptions | Helps agents produce standardized feedback that aggregators can consume consistently. |

---

## Anti-Features

Features to explicitly NOT build in this milestone. Reasons documented.

| # | Anti-Feature | Why Avoid | What to Do Instead |
|---|-------------|-----------|-------------------|
| AF-01 | **Automatic Validation (Stage 3.5 Pipeline Insertion)** | Inserting a new stage between Stage 3 (Policy) and Stage 4 (Sign) fundamentally changes the pipeline architecture. Validation requires polling (15s intervals, up to 10 minutes) which blocks transaction processing. The risk/reward ratio is poor for an initial integration. | Provide manual `request_validation` action only. Agents decide when to request validation. Revisit automatic validation in a future milestone when pipeline refactoring is warranted. |
| AF-02 | **Automatic Feedback Posting** | Auto-posting feedback after every transaction creates spam risk, gas waste, and poor signal quality. The ERC-8004 community explicitly warns against automated feedback. Feedback requires agent judgment about interaction quality. | Expose `give_feedback` as an explicit action. Let agents decide when and what to rate. |
| AF-03 | **Reputation Aggregation Service** | Building an off-chain reputation aggregator (Sybil filtering, weighted scoring, reviewer reputation analysis) is a separate product. The ERC-8004 design philosophy deliberately separates raw data storage (on-chain) from aggregation (off-chain). | Read raw on-chain data via `getSummary()`. Use the 0-100 normalized score directly. Let specialized aggregation services emerge in the ecosystem. |
| AF-04 | **Agent-to-Agent Auto-Discovery Protocol** | Building a full discovery protocol (scanning registries, matching capabilities, negotiating interactions) is enormous scope. ERC-8004 provides the data layer; discovery logic is application-specific. | Support registration file hosting + connect-info extension. Manual discovery via registration file URLs. |
| AF-05 | **Validator Node Operation** | Running a validator that processes `validationRequest` events, re-executes agent tasks, and posts `validationResponse` is a separate system entirely (requires zkML, TEE, or re-execution infrastructure). | Participate as a validation requester only. Integrate with third-party validators (Phala Network TEE, Automata DCAP, etc.). |
| AF-06 | **Solana ERC-8004 Equivalent** | ERC-8004 is an EVM-only standard. While `8004-solana` npm package exists (community port), it is a separate protocol with different contracts and different trust guarantees. | EVM-only scope for this milestone. Solana agent identity is a separate research topic. |
| AF-07 | **appendResponse (Reputation Defense)** | `appendResponse()` lets agents respond to feedback they received. This requires UI/UX for reviewing incoming feedback and composing responses -- separate workflow from the core integration. | Defer to subsequent milestone. Note in objective doc. |
| AF-08 | **Custom Reputation Scoring Algorithm** | Building a custom scoring algorithm (time-decay, Sybil resistance, reviewer weighting) is out of scope. The standard deliberately leaves this to off-chain aggregators. | Use raw `getSummary()` values normalized to 0-100 for REPUTATION_THRESHOLD policy evaluation. Simple and predictable. |
| AF-09 | **NFT Marketplace Integration** | ERC-8004 agent IDs are ERC-721 NFTs, which means they could theoretically be listed/traded on OpenSea/Blur. This is outside WAIaaS's scope. | Agent ID NFTs are functional identifiers, not tradeable assets in the WAIaaS context. |

---

## Feature Dependencies

```
TS-10 (DB v39 Migration) ─────────────────────┬──> TS-01 (Agent Registration)
                                                ├──> TS-02 (agentWallet Linking)
                                                ├──> TS-08 (REPUTATION_THRESHOLD Policy)
                                                └──> TS-09 (Reputation Cache)

TS-01 (Agent Registration) ───────────────────> TS-03 (Registration File Generation)
                                                 └──> TS-15 (connect-info Extension)

TS-03 (Registration File) ───────────────────> TS-04 (Service Endpoints in Reg File)
                                                └──> DF-01 (OASF Capabilities)
                                                └──> DF-06 (Domain Verification)

TS-02 (agentWallet Linking) ──────────────────> requires ApprovalWorkflow EIP-712 extension

TS-05 (Read Reputation) ─────────────────────> TS-09 (Reputation Cache)
TS-06 (Give Feedback) ───────────────────────> independent (just encode + submit)
TS-08 (REPUTATION_THRESHOLD) ────────────────> TS-05 (Read Reputation) + TS-09 (Cache)

TS-11 (REST API Routes) ─────────────────────> TS-01, TS-05, TS-10 (need data sources)
TS-12 (MCP Tools) ───────────────────────────> TS-01 through TS-07 (ActionProvider)
TS-13 (SDK Methods) ─────────────────────────> TS-11 (REST routes)
TS-18 (Admin UI Page) ───────────────────────> TS-11 (REST routes), TS-10 (DB)

TS-14 (Admin Settings) ──────────────────────> independent (early setup)
TS-16 (Notification Events) ─────────────────> independent (enum + EventBus)
TS-17 (Skill File) ──────────────────────────> TS-11, TS-12 (need final API surface)
```

---

## MVP Recommendation

### Phase 1: Foundation (must be first)
1. **TS-10** DB Schema v39 Migration -- everything depends on this
2. **TS-14** Admin Settings (9 keys) -- feature gate and configuration
3. **TS-16** Notification Events -- enum extension, independent

### Phase 2: Identity Registry Core
4. **TS-01** Agent Registration (NFT minting)
5. **TS-03** Registration File Auto-Generation + Hosting
6. **TS-04** Service Endpoints in Registration File
7. **TS-15** connect-info Extension
8. **DF-06** Domain Verification (low effort, high trust value)

### Phase 3: Reputation + Policy
9. **TS-05** Read Agent Reputation
10. **TS-06** Give Feedback
11. **TS-07** Revoke Feedback
12. **TS-09** Reputation Score Cache
13. **TS-08** REPUTATION_THRESHOLD Policy Type

### Phase 4: agentWallet Linking + Validation
14. **TS-02** agentWallet Linking (highest complexity -- EIP-712 approval flow)
15. **DF-02** Validation Registry (request_validation)

### Phase 5: Interfaces
16. **TS-11** REST API Read-Only Endpoints
17. **TS-12** MCP Tool Exposure
18. **TS-13** TypeScript SDK Methods
19. **TS-18** Admin UI ERC-8004 Page
20. **DF-05** Admin UI Reputation Dashboard
21. **TS-17** Skill File

### Defer to Post-MVP
- **DF-01** OASF Capabilities (nice but not blocking)
- **DF-04** Multi-Chain Registration (depends on user demand)
- **DF-07** ERC-1271 Smart Account Signature (verify demand first)
- **DF-08** Tag Convention Enforcement (polish item)

---

## Ecosystem Context: How Others Integrate

### Existing ERC-8004 Integrations (Confidence: MEDIUM)

| Project | What They Do | Relevance to WAIaaS |
|---------|-------------|---------------------|
| **MetaMask Server Wallets** | Official tutorial on designing server wallets for ERC-8004 agents. Backend signer + registration flow. | Closest conceptual match -- WAIaaS is essentially a server wallet for AI agents. |
| **AgentStore** | Open-source marketplace using ERC-8004 identity + x402 payments for USDC settlement | Shows registration file discovery pattern in practice. WAIaaS agents could list here. |
| **Chitin** | Soul identity layer on Base L2 with W3C DID resolution + MCP server for Claude | Shows MCP + ERC-8004 integration pattern. Includes Foundry-based contracts (146 tests). |
| **Phala Network TEE Agent** | ERC-8004 compliant TEE agent running in Confidential VM | Shows validation via TEE attestation pattern. WAIaaS could request validation from Phala validators. |
| **ChaosChain Genesis Studio** | First end-to-end commercial ERC-8004 prototype | Reference for full lifecycle implementation. |
| **EigenCloud** | Build trustless agents with ERC-8004 on EigenLayer | Shows validation via crypto-economic stake. |

### SDK Ecosystem

| Package | Platform | Maturity | Notes |
|---------|----------|----------|-------|
| `@agentic-trust/8004-sdk` | npm (TypeScript) | Active | Core SDK for identity/reputation/validation |
| `@agentic-trust/8004-ext-sdk` | npm (TypeScript) | Active | Extended SDK with ENS + L2 operations |
| `8004-solana` | npm (TypeScript) | Active | Solana port (separate protocol) |
| `erc-8004-py` | PyPI (Python) | Active | Python SDK |
| `chaoschain-sdk` | npm + PyPI | Active | Full-featured ChaosChain SDK |

WAIaaS does NOT need these SDKs because it uses viem 2.x directly to call the registry contracts. The ABI + `encodeFunctionData` approach is simpler and avoids dependency bloat.

### Registration File Patterns in the Wild

Based on best practices and ecosystem usage, registration files typically include:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Agent Name",
  "description": "What this agent does",
  "image": "https://example.com/avatar.png",
  "services": [
    { "name": "MCP", "endpoint": "https://api.example.com/mcp", "version": "2025-06-18" },
    { "name": "A2A", "endpoint": "https://api.example.com/.well-known/agent-card.json" },
    { "name": "agentWallet", "endpoint": "eip155:1:0xWalletAddress" },
    { "name": "OASF", "version": "v0.8.0", "skills": [...], "domains": [...] }
  ],
  "registrations": [
    { "agentId": 42, "agentRegistry": "eip155:1:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" }
  ],
  "active": true,
  "x402Support": true,
  "supportedTrust": ["reputation"]
}
```

**Mandatory fields**: `type`, `name`, `description`, `image`, `services`
**Recommended fields**: `registrations`, `active`, `x402Support`, `supportedTrust`

### Reputation Scoring in Practice

The ERC-8004 approach to reputation is deliberately unopinionated:

1. **Raw data is on-chain**: `giveFeedback()` stores `value` (int128) + `valueDecimals` (uint8) + tags
2. **Aggregation is off-chain**: `getSummary()` returns count + raw average -- no weighting, no Sybil filtering
3. **Each consumer normalizes differently**: WAIaaS normalizes to 0-100 for REPUTATION_THRESHOLD
4. **Tag conventions** (from best practices): `starred` (general), `reachable` (availability), `uptime`, `successRate`, `responseTime`, `tradingYield`, etc.
5. **Anti-spam**: The standard relies on "reviewer reputation" -- consumers should weight feedback from trusted addresses higher. No protocol-level spam prevention.

**WAIaaS normalization strategy**: Take `getSummary()` result, convert `summaryValue / 10^summaryValueDecimals`, clamp to 0-100 range. Zero feedback count = unrated (apply `unrated_tier`).

### Validation Methods in Practice (Confidence: LOW-MEDIUM)

Three validation approaches exist in the ecosystem:

| Method | Implementation | Who Provides It | Maturity |
|--------|---------------|-----------------|----------|
| **TEE Attestation** | Agent runs in Trusted Execution Environment, produces attestation | Phala Network (CVM), Oasis ROFL, Automata DCAP | Most mature |
| **zkML Proofs** | Zero-knowledge proof that a specific ML model ran on specific inputs | ICME, various research projects | Experimental |
| **Stake-Secured Re-Execution** | Validator stakes ETH, re-runs the agent task, reports result | EigenLayer/EigenCloud | Early |

**Validation Registry status**: The Validation Registry contract address is NOT listed in the official deployment addresses (only Identity + Reputation are deployed). This suggests the Validation Registry is still being finalized. The EIP includes the interface but mainnet deployment may be pending.

### AI Agent Framework Integration

No direct ERC-8004 integrations exist in CrewAI, AutoGPT, or LangChain as of March 2026. The integration pattern is:
1. Agent framework calls WAIaaS SDK/MCP
2. WAIaaS handles ERC-8004 registration/reputation on behalf of the agent
3. The agent framework never interacts with ERC-8004 contracts directly

This is the correct architecture -- WAIaaS is the identity/reputation middleware layer.

---

## Complexity Assessment Summary

| Feature Group | Estimated Effort | Risk |
|--------------|-----------------|------|
| Identity Registry (TS-01, TS-03, TS-04, TS-15) | Medium | Low -- proven ActionProvider pattern |
| agentWallet Linking (TS-02) | High | Medium -- EIP-712 is new approval type |
| Reputation Read + Feedback (TS-05, TS-06, TS-07) | Medium | Low -- standard readContract/encode |
| REPUTATION_THRESHOLD Policy (TS-08, TS-09) | High | Medium -- Stage 3 integration + cache |
| DB Migration (TS-10) | Medium | Low -- proven pattern, 6 prior recreations |
| REST/MCP/SDK (TS-11, TS-12, TS-13) | Medium | Low -- follows existing patterns |
| Admin UI (TS-18) | High | Medium -- new page with complex forms |
| Validation (DF-02) | Medium | High -- contract may not be deployed yet |
| Admin Settings + Notifications (TS-14, TS-16) | Low | Low -- standard additions |

**Total estimated new tests**: ~55-65 (per objective TEST-03)
**Total estimated new code**: ~3,000-4,000 LOC TypeScript

---

## Sources

- [ERC-8004 Official EIP Specification](https://eips.ethereum.org/EIPS/eip-8004)
- [ERC-8004 Contracts GitHub (deployment addresses)](https://github.com/erc-8004/erc-8004-contracts)
- [ERC-8004 Best Practices - Registration](https://github.com/erc-8004/best-practices)
- [ERC-8004 Best Practices - Reputation](https://github.com/erc-8004/best-practices/blob/main/Reputation.md)
- [Awesome ERC-8004 (ecosystem catalog)](https://github.com/sudeepb02/awesome-erc8004)
- [MetaMask: Design Server Wallets for ERC-8004](https://docs.metamask.io/tutorials/design-server-wallets/)
- [Ethereum Magicians Discussion](https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098)
- [@agentic-trust/8004-sdk npm](https://www.npmjs.com/package/@agentic-trust/8004-sdk)
- [Phala Network TEE Agent](https://github.com/Phala-Network/erc-8004-tee-agent)
- [Composable Security Practical Explainer](https://composable-security.com/blog/erc-8004-a-practical-explainer-for-trustless-agents/)
- [EigenCloud Build Trustless Agents](https://docs.eigencloud.xyz/eigenai/howto/build-trustless-agents)
- [Filecoin Pin for ERC-8004 Agents](https://docs.filecoin.io/builder-cookbook/filecoin-pin/erc-8004-agent-registration)
- [ICME: Trustless Agents with zkML](https://blog.icme.io/trustless-agents-with-zkml/)
