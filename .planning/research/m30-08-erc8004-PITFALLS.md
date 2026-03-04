# Domain Pitfalls: ERC-8004 Trustless Agents Integration

**Domain:** Adding ERC-8004 on-chain AI agent identity/reputation/validation to existing WAIaaS wallet system
**Researched:** 2026-03-04
**Overall confidence:** MEDIUM (ERC-8004 is Draft EIP; v2 spec changes in progress; ABI not independently verified against deployed contracts)

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or security vulnerabilities.

---

### Pitfall C1: ABI Mismatch Between Objective Document and Deployed Contracts

**What goes wrong:** The objective document (m30-08) contains ABI function signatures transcribed from the EIP Draft spec and community resources. The actual deployed contracts at `0x8004A169...` (Identity) and `0x8004BAa1...` (Reputation) are **upgradeable proxy contracts** (`IdentityRegistryUpgradeable.sol`). The implementation behind the proxy can be upgraded by the ERC-8004 team at any time, changing function signatures, adding parameters, or altering behavior. If WAIaaS hardcodes ABIs from the spec document without verifying against the actual on-chain bytecode, every `encodeFunctionData` call produces incorrect calldata, and every transaction silently reverts or fails.

**Why it happens:** The objective file was written from the EIP text and GitHub README, not from verified on-chain ABI extraction. The `Upgradeable` suffix in the contract name explicitly signals that the implementation can change. The EIP is still in Draft status (confirmed as of March 2026), meaning function signatures are not finalized.

**Consequences:**
- All 8 write actions produce invalid calldata -- transactions revert on-chain, gas is wasted
- All 3 read-only queries return incorrect data or revert
- The entire ERC-8004 ActionProvider is non-functional
- Users lose gas fees on failed transactions

**Prevention:**
1. **Phase 1 MUST be a research/verification phase** that extracts ABIs directly from on-chain deployed contracts using Etherscan verified source or `cast abi <address>` (Foundry)
2. Compare extracted ABI field-by-field against the objective document's ABI
3. Store ABIs in separate `*-abi.ts` files with a `VERIFIED_AT` timestamp and block number comment
4. Add a CI check or startup-time health check that calls a known view function (e.g., `name()` on Identity Registry ERC-721) to verify the ABI is correct
5. Design the `Erc8004RegistryClient` to accept ABI as a constructor parameter, enabling hot-swap if ABI changes

**Detection:** Transactions revert with `0x` empty return data or generic revert. `readContract` calls throw `ContractFunctionExecutionError`. Look for `CALL_EXCEPTION` errors in daemon logs.

**Confidence:** HIGH -- the contract is explicitly labeled `Upgradeable` and the EIP is Draft status. The v2 spec is already in development with proposed changes to "more flexible onchain data storage for reputation" and "cleaner integration with x402."

**Phase to address:** Research/Verification Phase (must be first)

---

### Pitfall C2: EIP-712 Domain Separator and Typehash for setAgentWallet

**What goes wrong:** The `setAgentWallet` function requires an EIP-712 typed data signature from the wallet owner. The objective document specifies a typehash with three fields (`agentId`, `newWallet`, `deadline`) but the EIP spec itself **does not provide explicit domain separator or typehash definitions** -- it only states "the agent owner must prove control of the new wallet by providing a valid EIP-712 signature." If WAIaaS constructs the wrong domain separator (wrong `name`, `version`, `chainId`, or `verifyingContract`), or uses wrong field ordering in the typehash, the signature verification on-chain will always fail. This is a silent failure -- the transaction reverts with an opaque "invalid signature" error.

**Why it happens:**
- EIP-712 is extremely sensitive to exact field ordering, type names, and domain parameters
- The domain separator MUST match what the deployed contract computes internally
- If the contract was deployed with `name: "ERC-8004 Identity"` but WAIaaS uses `name: "IdentityRegistry"`, every signature fails
- The `chainId` in the domain separator must match the deployment chain -- this fails silently on L2s if the mainnet chainId is used
- The `verifyingContract` address must be the proxy address, not the implementation address
- The contract may include a `nonce` field in the typehash that the objective document omits

**Consequences:**
- `setAgentWallet` is completely broken -- the cornerstone feature of linking WAIaaS wallets to ERC-8004 agent IDs
- Owner signatures collected via WalletConnect are wasted (user friction)
- Debugging is extremely difficult because EIP-712 signature errors are opaque on-chain

**Prevention:**
1. Extract the exact domain separator from the deployed contract by calling `eip712Domain()` (EIP-5267) if supported, or by reading the contract's source code on Etherscan
2. Write a test that constructs an EIP-712 signature locally and verifies it against a forked mainnet (using viem's Anvil fork mode)
3. Check for `nonce` requirements -- the contract may track nonces per agentId to prevent replay
4. Verify field ordering matches exactly: `SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)` vs `SetAgentWallet(address newWallet,uint256 agentId,uint256 deadline)` -- order matters
5. Test on Sepolia testnet first (contracts deployed at `0x8004A818...`)
6. Ensure `verifyingContract` uses proxy address, NOT implementation address

**Detection:** `setAgentWallet` transactions revert with "invalid signature" or `ECDSA: invalid signature`. Owner repeatedly asked to sign but transaction keeps failing.

**Confidence:** HIGH -- this is the most commonly reported EIP-712 integration bug. The Cyfrin audit guide explicitly warns that "field order, dynamic types, and hashing rules are strict; small mistakes = invalid signatures."

**Phase to address:** Research/Verification Phase (must be verified before implementation)

---

### Pitfall C3: Policies Table Recreation Data Loss During Migration v39

**What goes wrong:** Adding `REPUTATION_THRESHOLD` to the `PolicyType` enum requires recreating the `policies` table because SQLite cannot alter CHECK constraints. The 12-step recreation pattern (CREATE new -> INSERT INTO new -> DROP old -> RENAME new) has a well-documented risk: **if foreign keys are enabled during DROP TABLE, SQLite performs implicit DELETE, triggering ON DELETE CASCADE** on related tables. Additionally, indexes on the old table are silently dropped and must be manually recreated.

**Why it happens:**
- SQLite's `DROP TABLE` with `PRAGMA foreign_keys = ON` performs implicit `DELETE FROM` before dropping
- The `policies` table has `wallet_id TEXT REFERENCES wallets(id) ON DELETE CASCADE`
- If the migration runs without `PRAGMA foreign_keys = OFF`, cascade deletion can propagate unpredictably
- If indexes (`idx_policies_wallet_enabled`, `idx_policies_type`, `idx_policies_network`) are not recreated after rename, all policy queries become full table scans
- This migration also adds `pending_approvals.approval_type` column and creates two new tables -- multiple operations in one migration increases risk

**Consequences:**
- Data loss: existing policies deleted if FK cascade triggers incorrectly
- Performance degradation: missing indexes on policies table
- Migration failure: if transaction is not properly wrapped, database left in inconsistent state
- Knock-on effects: transactions referencing policies could be orphaned

**Prevention:**
1. Follow the exact established pattern from migration v26 (proven 6+ times in this codebase): `managesOwnTransaction: true`, explicit `BEGIN`/`COMMIT`, `PRAGMA foreign_keys = OFF` before DROP
2. Recreate ALL three indexes after rename: `idx_policies_wallet_enabled`, `idx_policies_type`, `idx_policies_network`
3. Run `PRAGMA foreign_key_check` after re-enabling foreign keys
4. Write a migration chain test (extend existing `migration-chain.test.ts`) that verifies v38 -> v39 preserves all existing policies
5. Add a test fixture with policies of all 17 existing types, run migration, verify all 17 survive plus new type works
6. Split the migration into clear steps: (a) CREATE new tables first, (b) policies recreation, (c) pending_approvals ALTER, (d) schema_version update
7. Back up database before running migration in production

**Detection:** After migration, `SELECT COUNT(*) FROM policies` returns 0 or fewer rows than before. Policy evaluation stops working. Admin UI shows no policies.

**Confidence:** HIGH -- this exact pattern has been implemented 6+ times in WAIaaS (v2, v6b, v8, v11, v20, v26, v27, v33). The pattern is well-established but each implementation requires manual index recreation, which is easy to forget.

**Phase to address:** DB Migration Phase

---

### Pitfall C4: Draft EIP Standard Dependency -- Spec Changes Break Integration

**What goes wrong:** ERC-8004 is a Draft EIP with a v2 specification actively in development. The v2 changes include "more flexible onchain data storage for reputation," "cleaner integration with x402," and "MCP support for broader compatibility." If WAIaaS ships tight coupling to the v1 registration file schema, v1 function signatures, and v1 reputation aggregation, the entire integration breaks when v2 deploys -- which could happen at any time since the contracts are upgradeable proxies.

**Why it happens:**
- Draft EIPs explicitly have no stability guarantee -- function signatures, events, and data structures can change
- The contracts are upgradeable proxies, so the team can deploy a new implementation without changing addresses
- The registration file format uses `#registration-v1` versioned URI, suggesting `#registration-v2` is planned
- 45,000+ agents registered means ecosystem pressure to evolve quickly
- WAIaaS has no influence over when/how ERC-8004 spec changes

**Consequences:**
- All hardcoded ABIs become invalid when implementation is upgraded
- Registration files generated by WAIaaS become incompatible with v2 ecosystem tooling
- Reputation score normalization may change, breaking REPUTATION_THRESHOLD policy evaluation
- WAIaaS feature becomes silently broken without any code change on WAIaaS side

**Prevention:**
1. **Abstraction layer**: All ERC-8004 interactions MUST go through `Erc8004RegistryClient` -- never call viem directly from ActionProvider or policy engine
2. **Version-aware design**: Store the ABI version in Admin Settings; allow ABI updates without code deployment
3. **Registration file versioning**: Support generating both v1 and (future) v2 registration files; parse incoming files with loose schema validation (accept unknown fields)
4. **Feature flag**: `actions.erc8004_agent_enabled` defaults to `false` -- this is already planned and correct. Users opt-in knowing it is Draft
5. **Health check**: Periodic on-chain call to verify ABI compatibility (e.g., call `name()` on Identity Registry, verify return value)
6. **Document the risk**: Skill file and Admin UI should display "ERC-8004 is a Draft standard. Features may change." warning
7. **Minimal surface area**: Only implement what is needed. Do not build speculative v2 features.

**Detection:** Transactions start reverting after an external contract upgrade. `readContract` calls return unexpected data shapes. Registration file validation failures in ecosystem tools.

**Confidence:** HIGH -- the EIP is explicitly Draft, the contracts are upgradeable, and v2 is in active development.

**Phase to address:** Architecture design (abstraction layer) + ongoing maintenance

---

## Moderate Pitfalls

Issues that cause significant rework or degraded functionality but not data loss or security breaches.

---

### Pitfall M1: Reputation Score Normalization Inconsistency

**What goes wrong:** The Reputation Registry returns feedback as `int128 value` with `uint8 valueDecimals` -- a fixed-point number where the actual score is `value / 10^valueDecimals`. The objective document's `GiveFeedbackInputSchema` uses `z.number().int().min(-100).max(100)` with `valueDecimals: z.number().int().min(0).max(8).default(0)`. But external agents may post feedback with different decimal precision (e.g., `value: 75, decimals: 2` = 0.75 vs `value: 75, decimals: 0` = 75). If REPUTATION_THRESHOLD compares raw `score` values without normalizing to a common scale, the policy produces inconsistent results.

**Why it happens:**
- ERC-8004 allows any `valueDecimals` from 0-18 per feedback entry
- `getSummary()` returns aggregate `summaryValue` and `summaryValueDecimals` which may differ from individual feedback decimals
- The REPUTATION_THRESHOLD policy defines `min_score: z.number().min(0).max(100)` as a 0-100 integer, but on-chain data may use 0-1 with 18 decimals
- Different ecosystem participants use different normalization conventions

**Prevention:**
1. Normalize all reputation scores to a 0-100 integer scale in `Erc8004RegistryClient.getReputationScore()`: `normalizedScore = Number(summaryValue * 100n / BigInt(10 ** summaryValueDecimals))`
2. Clamp to [0, 100] after normalization -- on-chain data can contain negative feedback scores (`int128`, not `uint128`)
3. Handle edge cases: `summaryValueDecimals = 0` and `summaryValue > 100` (some implementations use 0-1000 scale)
4. Document the normalization formula in code comments and skill file
5. Log both raw and normalized values for debugging

**Detection:** REPUTATION_THRESHOLD policy seemingly triggers for well-reputed agents or fails to trigger for low-reputed ones.

**Phase to address:** Reputation Policy Implementation

---

### Pitfall M2: Sybil Attack and Reputation Gaming

**What goes wrong:** ERC-8004's Reputation Registry is permissionless -- any address can call `giveFeedback()` for any agentId. An attacker can create multiple cheap wallets, register fake agents, and post positive feedback to boost their own reputation score or negative feedback to trash a competitor. If WAIaaS relies solely on the raw on-chain reputation score for REPUTATION_THRESHOLD policy decisions, it becomes vulnerable to Sybil manipulation.

**Why it happens:**
- Registration is permissionless (anyone can call `register()`)
- Feedback is permissionless (any address can call `giveFeedback()`)
- ERC-8004 explicitly states: "Sybil attacks remain possible" and relies on "competitive reputation aggregation services" for filtering
- The spec does not include economic staking/slashing for feedback integrity
- Self-feedback is prevented by Identity Registry checks, but collaborative boosting between colluding agents is not

**Prevention:**
1. REPUTATION_THRESHOLD should be a **supplementary** policy, not the only defense -- existing SPENDING_LIMIT, CONTRACT_WHITELIST, and RATE_LIMIT policies remain primary
2. Use `check_counterparty: true` to verify the counterparty's reputation, not just the sender's
3. Consider `feedbackCount` as a secondary signal -- low count with high score is suspicious
4. Filter by known/trusted `clientAddresses` in `getSummary()` calls rather than accepting all feedback
5. Consider adding `min_feedback_count` to REPUTATION_THRESHOLD rules schema: reject scores based on fewer than N feedbacks
6. Display reputation data in Admin UI with context (count, recency, source diversity) so owners can make informed decisions
7. Document clearly that on-chain reputation is an informational signal, not a guarantee

**Detection:** Agent's reputation score jumps dramatically in short time. Feedback comes from addresses with no on-chain transaction history.

**Phase to address:** REPUTATION_THRESHOLD Policy Design + Documentation

---

### Pitfall M3: ApprovalWorkflow Extension -- EIP-712 vs SIWE Signing Channel Mismatch

**What goes wrong:** The objective proposes extending `pending_approvals` with `approval_type` column (`SIWE` | `EIP712`) and routing EIP-712 signing requests through the existing ApprovalWorkflow. However, the current approval channels (Ntfy, Telegram, WalletConnect, REST) were designed exclusively for SIWE approval (yes/no decision with optional SIWE signature). EIP-712 signatures require sending structured typed data to the wallet for signing -- a fundamentally different interaction. If this distinction is not properly handled, the system may send EIP-712 signing requests to Ntfy/Telegram channels that cannot collect signatures, leaving transactions permanently stuck in PENDING.

**Why it happens:**
- The existing `ApprovalChannelRouter` 5-stage priority (SDK ntfy > SDK Telegram > WC > Telegram Bot > REST) does not distinguish `approval_type`
- Ntfy and Telegram are notification-only channels -- they can display a message but cannot collect EIP-712 signatures
- WalletConnect v2 supports `eth_signTypedData_v4` but the current `WcSigningBridge` implementation may not handle arbitrary typed data requests
- The REST API approval endpoint (`POST /v1/transactions/:id/approve`) accepts SIWE signatures but not EIP-712 typed data payloads
- The `sign-response-handler.ts` was built for SIWE signature format

**Prevention:**
1. Add `approval_type` filter to `ApprovalChannelRouter`: EIP-712 requests ONLY route to channels that support typed data signing (WalletConnect, Admin UI direct signing)
2. For Ntfy/Telegram channels: send notification with link to Admin UI where the owner can complete EIP-712 signing
3. Extend `WcSigningBridge` to support `eth_signTypedData_v4` method calls
4. Add `POST /v1/transactions/:id/approve-eip712` endpoint (or extend existing approve endpoint to accept EIP-712 typed data alongside SIWE)
5. Test the full flow: agent requests `set_agent_wallet` -> APPROVAL tier -> WalletConnect sends typed data signing request -> Owner signs -> signature included in calldata -> transaction submitted

**Detection:** `set_agent_wallet` transactions stuck in PENDING indefinitely. Owner receives notification but has no way to provide EIP-712 signature through available channels.

**Phase to address:** ApprovalWorkflow Extension Phase

---

### Pitfall M4: Registration File Schema Drift and Hosting Fragility

**What goes wrong:** The registration file is a JSON document hosted at the `agentURI` set on-chain. If WAIaaS generates a registration file with fields that don't match the ecosystem's expected schema (e.g., missing `image` field, wrong `type` URI, missing `supportedTrust`), other agents and discovery tools silently skip or reject the WAIaaS agent. Additionally, the default hosting strategy (daemon endpoint) means the registration file is unavailable when the daemon is offline -- making the agent undiscoverable in the ERC-8004 ecosystem precisely when it's most vulnerable.

**Why it happens:**
- The registration file schema is only loosely defined in the EIP spec -- "MUST have" vs "SHOULD have" fields are not all clear
- The `#registration-v1` version tag suggests the format will change
- Ecosystem tools (discovery services, reputation aggregators) may validate differently
- WAIaaS daemon is a self-hosted process that can be offline, but ERC-8004 agents are expected to be always discoverable
- The spec mentions `/.well-known/agent-card.json` as a standardized path, which differs from the planned `/v1/erc8004/registration-file/:walletId`

**Prevention:**
1. Validate generated registration files against the official schema from the EIP spec
2. Include ALL fields mentioned in the spec, even optional ones (with sensible defaults): `image`, `supportedTrust`, `active`
3. Support the `/.well-known/agent-card.json` path alongside the planned REST endpoint
4. Recommend IPFS hosting for production deployments (registration file doesn't change often; Filecoin Pin integration is documented for ERC-8004)
5. Add `registrationFileBaseUrl` override to support external hosting (already planned in objective)
6. Cache the registration file in DB so it can be served quickly on daemon startup

**Detection:** WAIaaS agent registered on-chain but not discoverable by other agents. Ecosystem discovery tools report "invalid registration file" or skip the agent.

**Phase to address:** Registration File Implementation

---

### Pitfall M5: Multi-Chain Registry Address Confusion

**What goes wrong:** ERC-8004 contracts are deployed on multiple chains (Ethereum, Base, Arbitrum, Polygon, Avalanche, etc.) with different addresses. Mainnet Identity Registry at `0x8004A169...`, testnet at `0x8004A818...`. The Admin Settings store a single global `actions.erc8004_identity_registry_address`. If the user configures the Ethereum mainnet address but their wallet operates on Base or Arbitrum, all contract calls target a non-existent contract or the wrong chain's registry.

**Why it happens:**
- ERC-8004 uses same contract addresses across mainnets (all `0x8004...` prefix) but different addresses per chain category (mainnet vs testnet)
- WAIaaS wallets are chain+environment-scoped (1 wallet = 1 chain + 1 environment)
- A single global registry address setting cannot handle multiple EVM chains correctly
- Users may unknowingly mix testnet wallet with mainnet registry address

**Prevention:**
1. Store registry addresses per chainId, not globally: use a hardcoded address map in `constants.ts` keyed by chainId
2. Admin Settings override should be per-chainId: `actions.erc8004_identity_registry_address_1` (mainnet), `actions.erc8004_identity_registry_address_8453` (Base), etc.
3. Or use the established pattern from WAIaaS for per-chain config: single setting with JSON map `{ "1": "0x...", "8453": "0x...", "42161": "0x..." }`
4. Validate that the configured registry address matches the wallet's resolved chain before any contract call
5. The `agent_identities.chain_id` column already captures this -- enforce consistency between wallet chain and identity chain at resolve() time

**Detection:** Contract calls revert because the address doesn't have code on the target chain. `readContract` returns empty data.

**Phase to address:** Configuration + Constants Design

---

## Minor Pitfalls

Issues that cause developer friction or suboptimal behavior but are easily fixable.

---

### Pitfall N1: agentId Type Conversion Edge Cases

**What goes wrong:** On-chain `agentId` is `uint256` (up to 2^256 - 1), but WAIaaS passes it as `string` through REST/MCP/SDK and stores it as `TEXT` in SQLite. The `BigInt()` conversion can fail silently with malformed strings, and string comparison in SQL queries doesn't preserve numeric ordering (e.g., `"9" > "10"` in string comparison).

**Prevention:**
1. Validate agentId strings match `/^[0-9]+$/` before `BigInt()` conversion
2. Use numeric-aware SQLite queries when ordering by agentId: `CAST(chain_agent_id AS INTEGER)` -- though this may lose precision for very large uint256 values
3. Set reasonable max length on agentId strings (78 characters = max uint256 decimal digits)
4. Test with agentId values near uint256 boundaries and with leading zeros

**Phase to address:** Schema Design + Zod Validation

---

### Pitfall N2: RPC Latency in Stage 3 Policy Evaluation

**What goes wrong:** REPUTATION_THRESHOLD policy evaluation in Stage 3 calls `readContract(getSummary)` on the Reputation Registry. If the RPC node is slow or Ethereum mainnet is congested, this adds 1-10 seconds to every transaction that has REPUTATION_THRESHOLD enabled. The 3-second timeout helps but still adds latency to every transaction pipeline execution.

**Prevention:**
1. The in-memory cache (5-minute TTL) is the primary mitigation -- ensure cache hits are the common case
2. Pre-warm the cache on daemon startup for all registered agentIds in `agent_identities` table
3. Make the reputation check async where possible: evaluate other policies first, check reputation in parallel
4. Consider batch reading reputation for multiple agentIds in a single multicall
5. Log cache hit/miss ratio in metrics (existing `IMetricsCounter` from v30.2) for monitoring
6. Default `reputation_cache_ttl_sec` of 300 is reasonable; document that lower values increase RPC cost

**Phase to address:** Reputation Cache Implementation

---

### Pitfall N3: Notification Event Spam from Reputation Threshold

**What goes wrong:** If REPUTATION_THRESHOLD policy is enabled and the counterparty agent has low/unknown reputation, every transaction generates a `REPUTATION_THRESHOLD_TRIGGERED` notification. For wallets that transact frequently with new/unknown agents, this creates notification fatigue. The existing 24h dedup logic for other events may not apply since each transaction has a unique context.

**Prevention:**
1. Apply per-counterparty dedup: don't send `REPUTATION_THRESHOLD_TRIGGERED` for the same counterparty address within 1 hour
2. Use `normal` priority instead of `high` for repeat triggers against the same counterparty
3. Bundle multiple threshold events into a single digest notification if more than 3 occur within 10 minutes
4. Allow users to disable this specific notification event type in settings

**Phase to address:** Notification Integration

---

### Pitfall N4: EVM-Only Limitation Not Surfaced in Multi-Chain UI

**What goes wrong:** ERC-8004 is an Ethereum standard (EVM-only). WAIaaS supports both Solana and EVM wallets. If the Admin UI's ERC-8004 page shows all wallets including Solana wallets, users attempt to register Solana wallets for ERC-8004 and get confusing errors. The MCP tools and SDK methods also need chain filtering.

**Prevention:**
1. Filter wallet selector in Admin UI to show only EVM wallets (`chain: 'evm'`)
2. Add chain validation in `resolve()`: reject Solana wallet contexts with clear error message (`ERC8004_EVM_ONLY`)
3. MCP tool descriptions should explicitly state "EVM wallets only"
4. SDK methods should validate chain type before making API calls
5. The `erc8004` field in `ConnectInfoResponse` should only appear for EVM wallets

**Phase to address:** ActionProvider + Admin UI Implementation

---

### Pitfall N5: Validation Registry Address Unknown

**What goes wrong:** The objective document states the Validation Registry address is "to be confirmed in research phase." The contract addresses for Identity (`0x8004A169...`) and Reputation (`0x8004BAa1...`) are published, but the Validation Registry address was not found in the GitHub repository's README or official deployment documentation. Implementing `request_validation` without a verified deployment address means the feature cannot work.

**Prevention:**
1. Research phase must confirm Validation Registry deployment status and address
2. If the Validation Registry is not yet deployed, mark `request_validation` and `get_validation_status` as deferred features with `COMING_SOON` status
3. Design the Erc8004ActionProvider so individual actions can be enabled/disabled independently
4. Do NOT block the entire milestone on Validation Registry availability -- Identity and Reputation are the primary value

**Phase to address:** Research/Verification Phase

---

### Pitfall N6: connect-info Response Shape Change Backward Compatibility

**What goes wrong:** Adding the `erc8004` optional field to `ConnectInfoResponse` is additive and non-breaking, but if the `buildConnectInfoPrompt()` function unconditionally includes ERC-8004 text, it adds noise to the prompt for agents that don't use ERC-8004.

**Prevention:**
1. The `erc8004` field in `ConnectInfoResponse` should only appear when the wallet is registered (`status !== undefined`)
2. `buildConnectInfoPrompt()` should conditionally include ERC-8004 info only when `erc8004_agent_enabled` setting is true AND the wallet has an agent identity
3. TypeScript SDK update is backward compatible (new optional field)
4. Python SDK must be updated in sync to include the new field type

**Phase to address:** API Extension Phase

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Research/ABI Verification** | C1 (ABI mismatch), C2 (EIP-712 domain separator), N5 (Validation Registry address) | Extract ABI from on-chain, verify EIP-712 domain on forked Anvil testnet, confirm all 3 registry addresses |
| **DB Migration v39** | C3 (policies table recreation data loss) | Follow established v26 pattern exactly: `managesOwnTransaction`, `foreign_keys OFF`, recreate all 3 indexes, migration chain test |
| **ActionProvider Implementation** | M4 (registration file schema), N1 (agentId type edges), N4 (EVM-only) | Validate against spec, test with boundary values, chain validation in resolve() |
| **Reputation Policy Engine** | M1 (score normalization), M2 (Sybil gaming), N2 (RPC latency) | Normalize to 0-100, treat as supplementary signal only, cache aggressively |
| **ApprovalWorkflow Extension** | M3 (EIP-712 channel mismatch) | Route EIP-712 approvals to WC/Admin only, extend WcSigningBridge for typed data |
| **REST/MCP/SDK Extension** | M5 (multi-chain confusion), N4 (EVM-only not surfaced), N6 (connect-info compat) | Per-chainId address config, chain validation, conditional prompt extension |
| **Admin UI** | N3 (notification spam), N4 (Solana wallets shown) | Per-counterparty dedup, EVM wallet filter in selectors |
| **Ongoing Maintenance** | C4 (Draft EIP spec changes), C1 (contract upgrade breaks ABI) | Abstraction layer, version-aware design, feature flag default OFF, health checks |

---

## Integration-Specific Pitfalls (WAIaaS Context)

These pitfalls arise specifically from interaction between new ERC-8004 features and the existing codebase at v30.6.

---

### Integration I1: pending_approvals Schema Extension Risk

The objective adds `approval_type TEXT NOT NULL DEFAULT 'SIWE'` to `pending_approvals` via `ALTER TABLE ADD COLUMN`. This is safe for SQLite (no table recreation needed for ADD COLUMN with DEFAULT). However:

- The CHECK constraint `CHECK (approval_type IN ('SIWE', 'EIP712'))` is supported on ADD COLUMN in SQLite (only validates new rows, existing rows get DEFAULT)
- The Drizzle schema (`schema.ts`) must be updated to include the new column or queries using the ORM will not include it
- **Critical**: `sign-response-handler.ts` and `approval-channel-router.ts` currently handle all approvals as SIWE. They must be updated to check `approval_type` and route accordingly. Missing this check means EIP-712 approvals get processed as SIWE, which will produce invalid signatures.
- The existing `POST /v1/transactions/:id/approve` route handler must either be extended or a new endpoint created for EIP-712 approval submission

### Integration I2: Policy Evaluation Order Dependency

REPUTATION_THRESHOLD is inserted at position 6 in Stage 3 evaluation (after APPROVED_SPENDERS, before SPENDING_LIMIT). This is correct but introduces behavioral changes:

- If reputation RPC call fails and `unrated_tier` defaults to APPROVAL, and the transaction would have been INSTANT based on spending limit alone, the user experiences unexpected APPROVAL prompts whenever the RPC is slow or down
- The `maxTier(currentTier, reputationTier)` upward-only rule means a single enabled REPUTATION_THRESHOLD policy with `unrated_tier: APPROVAL` forces APPROVAL on EVERY transaction for new/unknown counterparties
- **Recommendation**: Default `unrated_tier` to `NOTIFY` instead of `APPROVAL` in the schema defaults to avoid excessive friction for users who enable the policy without understanding the implications. The objective document currently defaults to APPROVAL.

### Integration I3: provider-trust CONTRACT_WHITELIST Bypass

The ERC-8004 ActionProvider should leverage the existing `provider-trust` mechanism (established in v28.2) so that ERC-8004 registry contracts are automatically whitelisted when the provider is enabled. Without this:

- Users would need to manually add Identity/Reputation/Validation registry addresses to CONTRACT_WHITELIST policy
- Forgetting this step means all ERC-8004 write actions are denied by default-deny CONTRACT_WHITELIST
- The fix is ensuring `Erc8004ActionProvider` sets `providerTrust: true` in its metadata, triggering the existing bypass mechanism

### Integration I4: 18th PolicyType and enum-db-consistency.test.ts

The existing `enum-db-consistency.test.ts` verifies that all core enum values match DB CHECK constraints. Adding `REPUTATION_THRESHOLD` as the 18th PolicyType requires:

- Updating `@waiaas/core` POLICY_TYPES array
- Migration v39 recreating policies table with updated CHECK
- The consistency test should automatically pass if both are done together
- **Risk**: If the core enum is updated but migration is not run, the consistency test will catch this -- but only in CI, not in production

### Integration I5: Notification EventBus Listener Count

Adding 5 new notification event types (49 -> 54) does not inherently cause issues, but the handlers in `NotificationService` grow. The EventBus (`EventEmitter`) default `maxListeners` should be verified to accommodate the growth across all milestones. Current listener count includes: notifications, kill switch, auto-stop, approval workflow, balance monitor, incoming TX, DeFi monitoring, webhooks. Adding ERC-8004 events should be within limits but worth auditing.

---

## Sources

- [ERC-8004: Trustless Agents (EIP)](https://eips.ethereum.org/EIPS/eip-8004) -- Draft status confirmed, ABI function signatures extracted
- [ERC-8004 Contracts Repository](https://github.com/erc-8004/erc-8004-contracts) -- Upgradeable contracts, multi-chain deployment, ABI files
- [Cyfrin: Understanding EIP-191 & EIP-712](https://www.cyfrin.io/blog/understanding-ethereum-signature-standards-eip-191-eip-712) -- EIP-712 pitfalls and domain separator requirements
- [CCN: ERC-8004 Risks](https://www.ccn.com/education/crypto/erc-8004-ai-agents-on-chain-ethereum-how-works-risks-explained/) -- Sybil attack vectors, reputation gaming
- [Eco: ERC-8004 Overview](https://eco.com/support/en/articles/13221214-what-is-erc-8004-the-ethereum-standard-enabling-trustless-ai-agents) -- v2 spec changes, ecosystem adoption (45,000+ agents)
- [The Graph: Understanding x402 and ERC-8004](https://thegraph.com/blog/understanding-x402-erc8004/) -- x402 integration context
- [Composable Security: ERC-8004 Practical Explainer](https://composable-security.com/blog/erc-8004-a-practical-explainer-for-trustless-agents/) -- Security considerations
- [Filecoin Pin for ERC-8004 Agents](https://docs.filecoin.io/builder-cookbook/filecoin-pin/erc-8004-agent-registration) -- Registration file IPFS hosting
- [SQLite Foreign Key Cascade on DROP TABLE](https://kyrylo.org/software/2025/09/27/a-mere-add-foreign-key-can-wipe-out-your-whole-rails-sqlite-production-table.html) -- Table recreation data loss risk
- WAIaaS codebase: `packages/daemon/src/infrastructure/database/migrate.ts` (v26 migration pattern reference), `packages/daemon/src/infrastructure/database/schema.ts` (pending_approvals current schema), `packages/daemon/src/pipeline/stages.ts` (APPROVAL tier handling), `packages/daemon/src/services/signing-sdk/approval-channel-router.ts` (channel routing)
