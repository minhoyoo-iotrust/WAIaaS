# Requirements: WAIaaS v30.8 ERC-8004 Trustless Agents

**Defined:** 2026-03-04
**Core Value:** AI 에이전트가 안전하고 자율적으로 온체인 거래를 수행할 수 있어야 한다

## v1 Requirements

Requirements for v30.8 milestone. Each maps to roadmap phases.

### ActionProvider (PKG)

- [ ] **PKG-01**: Erc8004ActionProvider is registered with registerBuiltInProviders and can be toggled via `actions.erc8004_agent_enabled` setting (default: false)
- [ ] **PKG-02**: ActionProvider exposes 8 write actions (register_agent, set_agent_wallet, unset_agent_wallet, set_agent_uri, set_metadata, give_feedback, revoke_feedback, request_validation) with correct risk levels and default tiers
- [ ] **PKG-03**: 9 Admin Settings keys are defined for ERC-8004 configuration with correct types and defaults

### Identity Registry (IDEN)

- [ ] **IDEN-01**: Agent can register on Identity Registry (NFT minting) via `register_agent` action with APPROVAL tier
- [ ] **IDEN-02**: Owner can link agentWallet via `set_agent_wallet` with corrected EIP-712 typed data signing (`AgentWalletSet` 4-field typehash) through extended ApprovalWorkflow
- [ ] **IDEN-03**: Owner can unlink agentWallet via `unset_agent_wallet` with APPROVAL tier
- [ ] **IDEN-04**: Agent can update registration file URI via `set_agent_uri` with DELAY tier
- [ ] **IDEN-05**: Agent can set/update metadata key-value pairs via `set_metadata` with NOTIFY tier
- [ ] **IDEN-06**: Registration file JSON is auto-generated with WAIaaS MCP/REST endpoints and served at public endpoint `GET /v1/erc8004/registration-file/:walletId`
- [ ] **IDEN-07**: `GET /v1/connect-info` includes `erc8004` field with agentId, registryAddress, chainId, registrationFileUrl, status when wallet is registered
- [ ] **IDEN-08**: Agent info (ID, wallet, URI, metadata) can be queried via `GET /v1/erc8004/agent/:agentId`

### Reputation Registry (REPU)

- [ ] **REPU-01**: Agent can post feedback on another agent via `give_feedback` action with NOTIFY tier
- [ ] **REPU-02**: Agent can revoke posted feedback via `revoke_feedback` action with INSTANT tier
- [ ] **REPU-03**: Reputation summary (count, score, decimals) can be queried via `GET /v1/erc8004/agent/:agentId/reputation` with tag filtering
- [ ] **REPU-04**: Reputation scores are cached in-memory (configurable TTL, default 300s) with DB fallback for RPC failures
- [ ] **REPU-05**: REPUTATION_THRESHOLD policy (18th PolicyType) evaluates reputation in Stage 3 policy pipeline at position 6 (after APPROVED_SPENDERS, before SPENDING_LIMIT)
- [ ] **REPU-06**: Low reputation (score < min_score) triggers security tier escalation to below_threshold_tier (default: APPROVAL), tier only escalates (never downgrades)
- [ ] **REPU-07**: Unrated agents (no reputation data or RPC failure) receive configurable unrated_tier treatment (default: APPROVAL)

### Validation Registry (VALD)

- [ ] **VALD-01**: Agent can request on-chain validation via `request_validation` action with DELAY tier -- feature-gated (default disabled, Validation Registry not yet deployed on mainnet)
- [ ] **VALD-02**: Validation status (validator, response, tag, lastUpdate) can be queried via `GET /v1/erc8004/validation/:requestHash`

### Database (DB)

- [ ] **DB-01**: Migration v39 creates `agent_identities` table (id, wallet_id, chain_agent_id, registry_address, chain_id, agent_uri, registration_file_url, status, created_at, updated_at) with indexes
- [ ] **DB-02**: Migration v39 creates `reputation_cache` table (composite PK: agent_id + registry_address + tag1 + tag2) with score, decimals, count, cached_at
- [ ] **DB-03**: Migration v39 adds `approval_type` TEXT column to `pending_approvals` (default 'SIWE', CHECK IN ('SIWE', 'EIP712'))
- [ ] **DB-04**: Migration v39 recreates `policies` table with REPUTATION_THRESHOLD in CHECK constraint (CREATE->INSERT->DROP->RENAME pattern)

### Interfaces (API)

- [ ] **API-01**: 5 read-only REST API endpoints serve ERC-8004 data (agent info, reputation, feedback, validation status, registration file)
- [ ] **API-02**: 8 write actions auto-exposed as MCP tools via `mcpExpose: true`
- [ ] **API-03**: 3 read-only MCP tools manually registered (erc8004_get_agent_info, erc8004_get_reputation, erc8004_get_validation_status)
- [ ] **API-04**: TypeScript SDK extended with 11 methods (8 write via ActionProvider + 3 read via direct GET)

### Admin UI (UI)

- [ ] **UI-01**: ERC-8004 Identity management page (`/erc8004`) with agent registration status table (walletId, agentId, status badge, registryAddress)
- [ ] **UI-02**: Agent registration form with EVM wallet selection, name/description input, service endpoint auto-detection
- [ ] **UI-03**: Wallet linking management (setAgentWallet with WalletConnect EIP-712 signing, unsetAgentWallet)
- [ ] **UI-04**: Registration file JSON preview with tree viewer and hosting URL copy button
- [ ] **UI-05**: Reputation dashboard with agent scores, received feedback list (filterable by tag), external agent reputation query
- [ ] **UI-06**: REPUTATION_THRESHOLD policy form in Policies page (min_score slider, tier dropdowns, tag filters, check_counterparty toggle)
- [ ] **UI-07**: Actions page `BUILTIN_PROVIDERS` includes `erc8004_agent` entry

### Notifications (NOTIF)

- [ ] **NOTIF-01**: 5 new NotificationEventTypes added to @waiaas/core (AGENT_REGISTERED, AGENT_WALLET_LINKED, AGENT_WALLET_UNLINKED, REPUTATION_FEEDBACK_RECEIVED, REPUTATION_THRESHOLD_TRIGGERED) with correct categories and priorities

### Skill Files (SKILL)

- [ ] **SKILL-01**: New `skills/erc8004.skill.md` created with all endpoints, MCP tools, SDK methods, and security notice
- [ ] **SKILL-02**: `skills/policies.skill.md` updated with REPUTATION_THRESHOLD and `skills/admin.skill.md` updated with ERC-8004 settings

### Tests (TEST)

- [ ] **TEST-01**: 20 test scenarios (E1-E20) implemented with L0+L1 >= 55 tests passing, covering all three registries, policy evaluation, caching, DB migration, and Admin UI rendering

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Validation Automation

- **VALD-AUTO-01**: Automatic validation requests for high-value transactions (Stage 3.5 pipeline insertion)
- **VALD-AUTO-02**: Validation polling with configurable threshold and timeout

### Reputation Automation

- **REPU-AUTO-01**: Automatic feedback posting after successful transaction completion
- **REPU-AUTO-02**: appendResponse support (respond to received feedback)

### Discovery

- **DISC-01**: `/.well-known/agent-card.json` standard path serving
- **DISC-02**: Agent discovery protocol via registration file crawling

## Out of Scope

| Feature | Reason |
|---------|--------|
| ERC-8004 contract deployment | Use existing mainnet deployments |
| Validator node operation | WAIaaS participates as validation requester only |
| Solana chain ERC-8004 | EVM-only standard |
| Agent-to-agent auto-discovery | Registration file based manual discovery only |
| Automatic feedback posting | Spam risk, requires agent judgment |
| appendResponse (Reputation) | Separate UX design needed, independent of core flow |
| ERC-8004 v2 spec changes | Draft EIP, implement current deployed version |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PKG-01 | Phase 318 | Pending |
| PKG-02 | Phase 318 | Pending |
| PKG-03 | Phase 317 | Pending |
| IDEN-01 | Phase 318 | Pending |
| IDEN-02 | Phase 321 | Pending |
| IDEN-03 | Phase 321 | Pending |
| IDEN-04 | Phase 318 | Pending |
| IDEN-05 | Phase 318 | Pending |
| IDEN-06 | Phase 319 | Pending |
| IDEN-07 | Phase 319 | Pending |
| IDEN-08 | Phase 319 | Pending |
| REPU-01 | Phase 320 | Pending |
| REPU-02 | Phase 320 | Pending |
| REPU-03 | Phase 319 | Pending |
| REPU-04 | Phase 320 | Pending |
| REPU-05 | Phase 320 | Pending |
| REPU-06 | Phase 320 | Pending |
| REPU-07 | Phase 320 | Pending |
| VALD-01 | Phase 318 | Pending |
| VALD-02 | Phase 319 | Pending |
| DB-01 | Phase 317 | Pending |
| DB-02 | Phase 317 | Pending |
| DB-03 | Phase 317 | Pending |
| DB-04 | Phase 317 | Pending |
| API-01 | Phase 319 | Pending |
| API-02 | Phase 322 | Pending |
| API-03 | Phase 322 | Pending |
| API-04 | Phase 322 | Pending |
| UI-01 | Phase 322 | Pending |
| UI-02 | Phase 322 | Pending |
| UI-03 | Phase 322 | Pending |
| UI-04 | Phase 322 | Pending |
| UI-05 | Phase 322 | Pending |
| UI-06 | Phase 322 | Pending |
| UI-07 | Phase 322 | Pending |
| NOTIF-01 | Phase 317 | Pending |
| SKILL-01 | Phase 323 | Pending |
| SKILL-02 | Phase 323 | Pending |
| TEST-01 | Phase 323 | Pending |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 -- Traceability populated by roadmapper (39/39 mapped)*
