# Technology Stack: ERC-8004 Trustless Agents Integration

**Project:** WAIaaS v30.8 -- ERC-8004 Trustless Agents
**Researched:** 2026-03-04
**Mode:** Ecosystem (subsequent milestone -- NEW capabilities only)

---

## Executive Summary

ERC-8004 integration requires **zero new npm dependencies**. The existing WAIaaS stack (viem 2.x, Zod, Drizzle ORM) already provides every capability needed. The contracts are deployed on Ethereum mainnet and 13+ L2/sidechains as upgradeable proxies with deterministic addresses. No official TypeScript SDK exists from the ERC-8004 team; the community SDKs (erc-8004-js, agent0-sdk) are immature and add unnecessary abstraction over what viem already provides natively. The correct approach is to encode ABIs directly using viem's `readContract`/`encodeFunctionData`/`hashTypedData` -- exactly the pattern used by all existing WAIaaS ActionProviders.

---

## 1. ERC-8004 On-Chain Contract Status

**Confidence: HIGH** (Etherscan verified + official GitHub repo)

### EIP Status

| Field | Value |
|-------|-------|
| EIP Number | 8004 |
| Status | **Draft** (not Final) |
| Category | Standards Track: ERC |
| Created | 2025-08-13 |
| Authors | Marco De Rossi (MetaMask), Davide Crapis (EF), Jordan Ellis (Google), Erik Reppel (Coinbase) |
| Requires | EIP-155, EIP-712, ERC-721, ERC-1271 |

> **Draft means the ABI could still change.** However, contracts are deployed and immutable (upgradeable via proxy but identity is locked). In practice, the deployed ABI is the real interface.

### Mainnet Deployment (Ethereum -- January 29, 2026)

| Registry | Address | Etherscan Verified | Proxy |
|----------|---------|-------------------|-------|
| **Identity Registry** | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | YES | UUPS (ERC-1967) |
| **Reputation Registry** | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | YES | UUPS (ERC-1967) |
| **Validation Registry** | **Not deployed on mainnet** | -- | -- |

**Critical finding:** The Validation Registry has NO confirmed mainnet deployment on Ethereum. The official erc-8004-contracts README lists only Identity and Reputation registry addresses. The 0xgasless SDK shows Validation Registry addresses on Avalanche (`0xa490b79113d8ef4e7c7912759a3fcaff8a58cd05`) but these are third-party deployments, not official.

**Implication for WAIaaS:** Validation Registry integration should be deferred or made configurable (address optional, disabled by default).

### Multi-Chain Deployments (Same Deterministic Addresses)

Identity and Reputation registries are deployed with the **same addresses** across:

| Network | Chain ID | Status |
|---------|----------|--------|
| Ethereum | 1 | Deployed |
| Base | 8453 | Deployed |
| Arbitrum | 42161 | Deployed |
| Optimism | 10 | Deployed |
| Polygon | 137 | Deployed |
| Avalanche | 43114 | Deployed |
| BSC | 56 | Deployed |
| Linea | 59144 | Deployed |
| Scroll | 534352 | Deployed |
| Gnosis | 100 | Deployed |
| Celo | 42220 | Deployed |
| Taiko | 167000 | Deployed |
| Monad | TBD | Deployed |
| MegaETH | TBD | Deployed |

### Testnet Deployment (Sepolia)

| Registry | Address |
|----------|---------|
| Identity | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Reputation | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

### On-Chain Activity (Identity Registry, Ethereum Mainnet)

| Metric | Value |
|--------|-------|
| Total Transactions | ~14,527 |
| Token Name | AgentIdentity (AGENT) |
| Token Standard | ERC-721 |
| Contract Age | ~33 days (since Jan 29, 2026) |
| Activity Level | Active (Register + SetAgentURI calls within last hour at research time) |

### Contract Technical Details

| Detail | Value |
|--------|-------|
| Solidity Version | `^0.8.20` |
| OpenZeppelin | `^5.4.0` (Contracts + Contracts-Upgradeable) |
| Proxy Pattern | UUPS (ERC-1967) |
| Upgrade Guard | `OwnableUpgradeable` + `UUPSUpgradeable` |
| Identity Base | `ERC721URIStorageUpgradeable` |
| Signature Support | `EIP712Upgradeable` + `ECDSA` + `IERC1271` |

**Sources:**
- [Etherscan Identity Registry](https://etherscan.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) -- HIGH confidence
- [erc-8004-contracts GitHub](https://github.com/erc-8004/erc-8004-contracts) -- HIGH confidence (179 stars, 75 forks)
- [EIP-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004) -- HIGH confidence

---

## 2. EIP-712 Typed Data for setAgentWallet

**Confidence: HIGH** (verified from on-chain verified Solidity source)

### Domain Separator

```typescript
const ERC8004_DOMAIN = {
  name: 'ERC8004IdentityRegistry',
  version: '1',
  // chainId and verifyingContract are chain-specific
} as const;
```

Initialized via `__EIP712_init("ERC8004IdentityRegistry", "1")` in the contract constructor.

### Type Hash

```solidity
bytes32 private constant AGENT_WALLET_SET_TYPEHASH =
  keccak256("AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)");
```

### viem signTypedData Parameters

```typescript
import { hashTypedData } from 'viem';

// For Owner to sign (proving control of newWallet)
const signature = await ownerAccount.signTypedData({
  domain: {
    name: 'ERC8004IdentityRegistry',
    version: '1',
    chainId: BigInt(chainId),
    verifyingContract: identityRegistryAddress,
  },
  types: {
    AgentWalletSet: [
      { name: 'agentId', type: 'uint256' },
      { name: 'newWallet', type: 'address' },
      { name: 'owner', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  primaryType: 'AgentWalletSet',
  message: {
    agentId: agentIdBigInt,
    newWallet: walletAddress,
    owner: ownerAddress,   // NFT owner address
    deadline: deadlineBigInt,
  },
});
```

**Important difference from objective doc:** The actual on-chain type hash includes an `owner` field (`address owner`) that the objective doc's `SET_AGENT_WALLET_TYPEHASH` did NOT include. The struct is `AgentWalletSet(uint256 agentId, address newWallet, address owner, uint256 deadline)` -- 4 fields, not 3.

### Signature Verification Flow

The contract:
1. Computes `structHash = keccak256(abi.encode(AGENT_WALLET_SET_TYPEHASH, agentId, newWallet, owner, deadline))`
2. Computes `digest = _hashTypedDataV4(structHash)` (EIP-712 compliant)
3. Tries `ECDSA.recover(digest, signature)` -- if recovered address matches `newWallet`, pass
4. If ECDSA fails, tries `IERC1271(newWallet).isValidSignature(digest, signature)` -- if returns `0x1626ba7e`, pass
5. Reverts if neither succeeds

### WAIaaS Integration Pattern

WAIaaS already has proven EIP-712 signing in `payment-signer.ts` using `account.signTypedData()`. The same pattern applies for ERC-8004 `setAgentWallet`. The signing must happen on the **wallet side** (the newWallet address), meaning WAIaaS daemon signs with the wallet's private key to prove it controls the address being linked.

**Sources:**
- [IdentityRegistryUpgradeable.sol source](https://github.com/erc-8004/erc-8004-contracts/blob/main/contracts/IdentityRegistryUpgradeable.sol) -- HIGH confidence
- [viem signTypedData docs](https://viem.sh/docs/actions/wallet/signTypedData.html) -- HIGH confidence
- [viem hashTypedData docs](https://viem.sh/docs/utilities/hashTypedData) -- HIGH confidence

---

## 3. Existing TypeScript/JavaScript SDKs

**Confidence: MEDIUM** (community repos verified, maturity assessed)

### SDK Landscape

| SDK | npm Package | Stars | Activity | viem Support | Recommendation |
|-----|-------------|-------|----------|--------------|----------------|
| erc-8004-js | `erc-8004-js` | 6 | Last update Oct 2025 | ethers + viem adapters | **DO NOT USE** |
| agent0-ts | `agent0-sdk` | 53 | Active, v1.5.3 | Not confirmed (ethers-based) | **DO NOT USE** |
| 0xgasless SDK | `@0xgasless/agent-sdk` | 1 | 3 commits | ethers only | **DO NOT USE** |
| create-8004-agent | `create-8004-agent` | -- | CLI scaffold | N/A | Not relevant |
| @agentic-trust/8004-ext-sdk | `@agentic-trust/8004-ext-sdk` | -- | v1.0.40, active | Unknown | **DO NOT USE** |
| chitin-mcp-server | `chitin-mcp-server` | -- | Unknown | Unknown | Not relevant |

### Why NOT to Use Any Existing SDK

1. **Unnecessary abstraction.** WAIaaS already has viem 2.x with full EVM contract interaction capabilities. Adding an SDK that wraps viem (or worse, uses ethers) adds a dependency without value.

2. **Immature ecosystem.** The highest-starred SDK (agent0-sdk, 53 stars) is still pre-1.0-stable quality. erc-8004-js has 6 stars and hasn't been updated since Oct 2025.

3. **Different dependency trees.** Most SDKs use ethers.js, not viem. WAIaaS is a viem-only codebase. Mixing ethers would add ~200KB+ bundle weight and maintenance burden.

4. **ABI is the interface.** ERC-8004 is a Solidity interface standard. The ABI is the SDK. viem's `readContract` and `encodeFunctionData` are all that's needed -- exactly as done for Aave V3, Lido, Pendle, and every other ActionProvider.

5. **Stability risk.** Draft EIP + community SDK = double uncertainty. Using raw ABI + viem means only the on-chain contract interface matters.

### Recommended Approach

Define ABIs as TypeScript `const` arrays in `packages/actions/src/providers/erc8004/`:
- `identity-abi.ts` -- Identity Registry ABI (from verified Etherscan source)
- `reputation-abi.ts` -- Reputation Registry ABI
- `validation-abi.ts` -- Validation Registry ABI

This is the same pattern used by Aave V3 (`aave-contracts.ts`), Lido (`lido-contracts.ts`), Pendle, etc.

**Sources:**
- [erc-8004-js GitHub](https://github.com/tetratorus/erc-8004-js) -- Verified
- [agent0-ts GitHub](https://github.com/agent0lab/agent0-ts) -- Verified
- [0xgasless agent-sdk GitHub](https://github.com/0xgasless/agent-sdk) -- Verified
- [awesome-erc8004](https://github.com/sudeepb02/awesome-erc8004) -- Verified

---

## 4. Registration File (JSON) Hosting Patterns

**Confidence: MEDIUM** (EIP spec + community examples)

### Official Schema (from EIP-8004 spec)

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "string",
  "description": "string",
  "image": "string (URL, optional)",
  "services": [
    {
      "name": "string",
      "endpoint": "string (URL)",
      "version": "string (optional)",
      "skills": ["string (optional, OASF taxonomy)"],
      "domains": ["string (optional)"]
    }
  ],
  "x402Support": true,
  "active": true,
  "registrations": [
    {
      "agentId": 42,
      "agentRegistry": "eip155:1:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
    }
  ],
  "supportedTrust": ["reputation"]
}
```

### URI Schemes Supported by Spec

| Scheme | Description | WAIaaS Fit |
|--------|-------------|------------|
| `https://` | Standard web hosting | Best fit -- daemon serves it |
| `ipfs://` | Content-addressed, immutable | Good for offline persistence, but WAIaaS is a daemon |
| `data:` (base64) | Fully on-chain via base64 encoded URI | Not practical (gas cost for large JSON) |

### WAIaaS Hosting Strategy

**Recommended: Daemon endpoint (Option A)**

```
GET /v1/erc8004/registration-file/:walletId  (public, no auth)
```

Rationale:
- WAIaaS is an always-on daemon -- the registration file is always available when the agent is operational
- The registration file references the daemon's own REST API and MCP endpoints
- No external service dependency (IPFS pinning, Filecoin, etc.)
- Automatic sync with wallet configuration changes

The `registrationFileBaseUrl` Admin Setting allows override for operators who want IPFS or external hosting.

### Ecosystem Hosting Patterns Observed

| Project | Hosting | Notes |
|---------|---------|-------|
| Filecoin Pin | IPFS + Filecoin | Storage proofs for persistence |
| Chitin | Base L2 on-chain | Specialized for Base |
| AgentStore | HTTPS | Marketplace-hosted |
| Generic agents | IPFS via Filebase | Third-party IPFS pinning |

**Sources:**
- [EIP-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004) -- HIGH confidence
- [Filecoin Pin for ERC-8004](https://docs.filecoin.io/builder-cookbook/filecoin-pin/erc-8004-agent-registration) -- MEDIUM confidence
- [Filebase ERC-8004 Guide](https://filebase.com/blog/how-to-power-erc-8004-trustless-agents-with-filebase/) -- MEDIUM confidence

---

## 5. viem Compatibility with ERC-8004 ABI Patterns

**Confidence: HIGH** (proven in existing codebase)

### viem Functions Needed

| viem Function | ERC-8004 Use | Already Used in WAIaaS |
|---------------|-------------|----------------------|
| `readContract()` | Read agent info, reputation, validation status | YES (EVM adapter, tokens) |
| `encodeFunctionData()` | Encode register/setAgentWallet/giveFeedback calldata | YES (all ActionProviders) |
| `getContract()` | Create contract instance for batch reads | YES (EVM adapter) |
| `signTypedData()` | Sign EIP-712 AgentWalletSet struct | YES (payment-signer.ts) |
| `hashTypedData()` | Hash EIP-712 data for verification | Available, not yet used directly |
| `decodeFunctionResult()` | Decode complex return types (getSummary, readAllFeedback) | YES (pipeline stages) |
| `decodeEventLog()` | Decode Registered/NewFeedback events | YES (incoming TX monitor) |

### ABI Compatibility Verification

ERC-8004 ABI patterns are standard Solidity types:
- `uint256`, `address`, `string`, `bytes32`, `bytes` -- all native viem types
- `int128` (Reputation value) -- supported by viem's bigint handling
- `uint8` (valueDecimals, response) -- standard
- `MetadataEntry[] calldata` (struct array) -- viem handles struct arrays via ABI typing
- `address[] calldata` (address array) -- standard
- `uint64` (feedbackIndex) -- standard

**No exotic types.** Every ERC-8004 function parameter and return type is fully supported by viem 2.x.

### Existing WAIaaS viem Version

```json
"viem": "^2.21.0"
```

viem 2.21+ includes:
- Full EIP-712 signTypedData support (since v1.x)
- ERC-1271 signature verification utilities
- Contract instance pattern with type safety
- All required encoding/decoding utilities

**No version bump needed.**

---

## 6. npm Packages Related to ERC-8004

**Confidence: MEDIUM** (npm registry search)

### Available Packages (as of March 2026)

| Package | Version | Purpose | WAIaaS Relevance |
|---------|---------|---------|-----------------|
| `erc-8004-js` | Unknown | Registry client (ethers+viem adapters) | NOT NEEDED -- use viem directly |
| `agent0-sdk` | 1.5.3 | Full agent framework (identity, reputation, IPFS) | NOT NEEDED -- too heavy, ethers-based |
| `@0xgasless/agent-sdk` | Unknown | Avalanche-focused agent SDK | NOT NEEDED -- wrong chain focus, ethers-based |
| `@agentic-trust/8004-ext-sdk` | 1.0.40 | ENS + identity management | NOT NEEDED -- different scope |
| `create-erc8004-agent` | 2.0.0 | CLI scaffold generator | NOT RELEVANT -- project scaffolding |
| `create-8004-agent` | Unknown | Similar CLI scaffold | NOT RELEVANT |
| `chitin-mcp-server` | Unknown | MCP server for Chitin identity | NOT RELEVANT -- Base-specific |

### Verdict: Add ZERO npm Packages

None of the available packages provide value over using viem directly:
- They introduce ethers.js dependency conflicts
- They wrap simple readContract/encodeFunctionData calls in unnecessary abstraction
- They are immature (3-53 stars, recent creation)
- They are opinionated about storage (IPFS, Filecoin) in ways that conflict with WAIaaS's self-hosted model

---

## Recommended Stack

### New Stack Additions (for ERC-8004)

**None.** Zero new dependencies.

### Existing Stack Used

| Technology | Version | Purpose | Why Sufficient |
|------------|---------|---------|---------------|
| viem | ^2.21.0 | Contract calls, ABI encoding, EIP-712 signing | Full coverage of all ERC-8004 patterns |
| Zod | existing | Input/output schema validation | New schemas for register_agent, give_feedback, etc. |
| Drizzle ORM | existing | DB schema for agent_identities, reputation_cache | Standard table additions |
| @waiaas/core | existing | IActionProvider interface, ContractCallRequest type | Erc8004ActionProvider implements IActionProvider |
| @waiaas/actions | existing | ActionProvider registration framework | New provider in providers/erc8004/ |

### What to Build (Not Install)

| Component | File Location | What It Is |
|-----------|---------------|------------|
| Identity ABI | `packages/actions/src/providers/erc8004/identity-abi.ts` | TypeScript const ABI from verified Etherscan source |
| Reputation ABI | `packages/actions/src/providers/erc8004/reputation-abi.ts` | TypeScript const ABI |
| Validation ABI | `packages/actions/src/providers/erc8004/validation-abi.ts` | TypeScript const ABI (for future use) |
| Registry Client | `packages/actions/src/providers/erc8004/erc8004-registry-client.ts` | Thin wrapper using viem readContract/encodeFunctionData |
| Zod Schemas | `packages/actions/src/providers/erc8004/schemas.ts` | Input validation for all 8 actions |
| Config | `packages/actions/src/providers/erc8004/config.ts` | Contract addresses + Admin Settings keys |
| Constants | `packages/actions/src/providers/erc8004/constants.ts` | Mainnet/testnet deterministic addresses |
| Registration File | `packages/actions/src/providers/erc8004/registration-file.ts` | JSON generation utility |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Contract Interaction | viem direct (readContract/encodeFunctionData) | agent0-sdk or erc-8004-js | Unnecessary dependency, ethers conflict, immature |
| ABI Source | Etherscan verified source code | npm ABI package | No official ABI npm package exists |
| EIP-712 Signing | viem signTypedData | ethers.js _signTypedData | viem is the project standard, already proven in x402 |
| Registration File Storage | Daemon endpoint (HTTPS) | IPFS/Filecoin | Self-hosted model, no external dependency needed |
| Reputation Caching | In-memory Map + DB fallback | Redis/external cache | SQLite DB is sufficient for single-instance daemon |

---

## Integration Points (Existing WAIaaS)

### Confirmed Compatible

| Integration | WAIaaS Component | ERC-8004 Use | Risk |
|-------------|-----------------|--------------|------|
| ActionProvider Framework | `IActionProvider.resolve()` | 8 write actions + 3 read-only queries | NONE -- proven pattern |
| 6-Stage Pipeline | Stage 1-6 flow | register_agent, set_agent_wallet go through full pipeline | NONE |
| Policy Engine | Stage 3 PolicyEvaluator | New REPUTATION_THRESHOLD policy type (18th) | LOW -- additive change |
| Owner Approval | ApprovalWorkflow | set_agent_wallet needs EIP-712 signature from Owner | MEDIUM -- new approval_type |
| Admin Settings | SettingsService | 9 new settings keys (erc8004_*) | NONE -- proven pattern |
| DB Schema | Drizzle + SQLite | New agent_identities + reputation_cache tables | NONE -- standard migration |
| REST API | OpenAPIHono routes | New /v1/erc8004/* read-only routes | NONE -- proven pattern |
| MCP | MCP tool registration | 8 write tools + 3 read tools | NONE -- proven pattern |
| Admin UI | Preact + @preact/signals | New ERC-8004 management page | NONE -- component pattern |
| Notifications | EventBus + NotificationService | New AGENT_REGISTERED, REPUTATION_UPDATED event types | NONE -- additive |

### New Capability Needed

| Capability | What | Why | Complexity |
|------------|------|-----|------------|
| EIP-712 typed data in approval flow | WalletConnect delivers EIP-712 signing request (not SIWE) | setAgentWallet requires wallet signature | MEDIUM |
| Reputation cache layer | In-memory + DB cache for readContract results | Avoid RPC calls on every transaction | LOW |
| Registration file endpoint | Public unauthenticated GET route | ERC-8004 agents discover WAIaaS endpoint | LOW |

---

## Critical Research Findings for Objective Correction

### 1. Validation Registry NOT Deployed on Mainnet

The objective doc lists `Validation Registry` address as "research phase required." Confirmed: it is NOT deployed on Ethereum mainnet by the official ERC-8004 team. Only Identity and Reputation registries have official mainnet deployments. Third-party deployments exist on Avalanche only.

**Recommendation:** Make Validation Registry fully optional with `actions.erc8004_validation_registry_address` defaulting to empty string. When empty, `request_validation` action returns `PROVIDER_NOT_CONFIGURED` error. This preserves the interface for when mainnet deployment arrives.

### 2. EIP-712 Type Hash Includes `owner` Field

The objective doc defines:
```typescript
const SET_AGENT_WALLET_TYPEHASH = {
  SetAgentWallet: [
    { name: 'agentId', type: 'uint256' },
    { name: 'newWallet', type: 'address' },
    { name: 'deadline', type: 'uint256' },
  ],
};
```

The actual on-chain contract uses:
```solidity
bytes32 private constant AGENT_WALLET_SET_TYPEHASH =
  keccak256("AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)");
```

**Differences:**
- Type name is `AgentWalletSet` (not `SetAgentWallet`)
- Includes `address owner` field (the NFT owner address)
- 4 fields, not 3

**Recommendation:** Update the objective to match on-chain reality before implementation.

### 3. Domain Name is "ERC8004IdentityRegistry"

Not a generic name. The exact string `"ERC8004IdentityRegistry"` with version `"1"` must be used in the EIP-712 domain, plus chain-specific `chainId` and `verifyingContract`.

### 4. EIP is Draft Status -- ABI Stability Risk

While the mainnet contracts are immutable (upgradeable proxy, but ABI changes would break existing integrations), the EIP itself is still Draft. A v2 spec is being discussed with changes including:
- MCP support for broader compatibility
- NFT-based agent ownership refinements
- More flexible on-chain data storage for reputation
- Cleaner x402 integration

**Recommendation:** Build against the deployed ABI (source of truth), not the EIP text. If the EIP changes, the on-chain contracts are what matter.

### 5. ~14,500 Registered Agents in 33 Days

Significant adoption for a Draft standard. The ecosystem is real and growing. Integration is timely.

---

## Installation

```bash
# No new dependencies needed.
# Zero npm install required for ERC-8004 integration.
```

All new code goes into `packages/actions/src/providers/erc8004/` using existing project dependencies.

---

## Sources

### HIGH Confidence
- [EIP-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004) -- Official Ethereum standard
- [Etherscan: Identity Registry](https://etherscan.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) -- Verified contract, 14,527 tx
- [erc-8004-contracts GitHub](https://github.com/erc-8004/erc-8004-contracts) -- Official repo, 179 stars, 75 forks
- [IdentityRegistryUpgradeable.sol](https://github.com/erc-8004/erc-8004-contracts/blob/main/contracts/IdentityRegistryUpgradeable.sol) -- Verified source
- [viem signTypedData](https://viem.sh/docs/actions/wallet/signTypedData.html) -- Official viem docs
- [viem hashTypedData](https://viem.sh/docs/utilities/hashTypedData) -- Official viem docs

### MEDIUM Confidence
- [awesome-erc8004](https://github.com/sudeepb02/awesome-erc8004) -- Community curated list
- [Filecoin Pin ERC-8004 Guide](https://docs.filecoin.io/builder-cookbook/filecoin-pin/erc-8004-agent-registration) -- Registration file hosting patterns
- [Ethereum Magicians Forum](https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098) -- EIP discussion thread
- [Bitcoin.com News: ERC-8004 powers thousands of agents](https://news.bitcoin.com/what-is-erc-8004-ethereums-new-agent-standard-powers-thousands-of-onchain-ai-identities/) -- Adoption data

### LOW Confidence
- [agent0-ts GitHub](https://github.com/agent0lab/agent0-ts) -- Community SDK, 53 stars
- [erc-8004-js GitHub](https://github.com/tetratorus/erc-8004-js) -- Community SDK, 6 stars, stale
- [0xgasless agent-sdk](https://github.com/0xgasless/agent-sdk) -- Community SDK, 1 star
