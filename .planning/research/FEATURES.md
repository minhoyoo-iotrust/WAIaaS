# Feature Landscape: Sign-Only Pipeline + DX Enhancements

**Domain:** Self-hosted AI agent wallet daemon -- sign-only transaction signing, unsigned tx parsing, calldata encoding, default deny toggles, MCP skill resources, enhanced policy notifications
**Researched:** 2026-02-14
**Overall Confidence:** HIGH (primary sources: existing codebase analysis + official docs for viem/MCP/Solana)

---

## Table Stakes

Features users expect when a wallet service supports dApp-generated transaction signing. Missing = the daemon cannot participate in the standard dApp integration flow.

| # | Feature | Why Expected | Complexity | Depends On |
|---|---------|--------------|------------|------------|
| TS-01 | **Sign-only endpoint** (`POST /v1/transactions/sign`) | Industry standard 2-step flow: dApp builds unsigned tx, wallet signs it. Jupiter, Agentra, NFT marketplaces all return unsigned transactions for client to sign. Without this, agents cannot interact with ANY external protocol. | Med | IChainAdapter.signTransaction (exists), new pipeline variant |
| TS-02 | **SIGN_ONLY transaction type** (6th discriminatedUnion type) | Distinguishes sign-only from execute flows in pipeline, DB, audit trail. Fireblocks, Circle, all WaaS providers have separate RAW/sign-only types. | Med | TransactionTypeEnum extension, Zod schema |
| TS-03 | **Unsigned tx parsing/validation** (pre-sign analysis) | Security critical: before signing, parse the serialized tx to verify destination, amount, calldata match expectations. Prevents blind signing. Fireblocks requires policy rules for raw transactions -- policies reject all raw transactions by default. | High | viem parseTransaction (EVM), @solana/kit getTransactionDecoder (Solana) |
| TS-04 | **Policy evaluation for sign-only** | Sign-only txs MUST go through policy engine (CONTRACT_WHITELIST, WHITELIST, SPENDING_LIMIT). Without policy evaluation, sign-only bypasses all security. Default deny for sign-only is essential. | High | DatabasePolicyEngine, unsigned tx parsing (TS-03) |
| TS-05 | **Return signed tx bytes (not broadcast)** | Sign-only returns signed bytes to caller. Caller (dApp/agent) is responsible for broadcast. This is the fundamental difference from execute flow. Jupiter Ultra expects `/execute` with signed tx; the agent needs the raw signed bytes. | Low | signTransaction result (Uint8Array already) |
| TS-06 | **Notification for sign-only events** | TX_SIGN_REQUESTED, TX_SIGNED events for audit trail. Owner must know what's being signed even if not broadcast through daemon. | Low | NotificationService (exists), new event types |

## Differentiators

Features that set WAIaaS apart from other WaaS solutions. Not expected, but create significant value for AI agent workflows.

| # | Feature | Value Proposition | Complexity | Depends On |
|---|---------|-------------------|------------|------------|
| DF-01 | **Unsigned tx deep parsing with human-readable summary** | Parse EVM calldata with viem `decodeFunctionData` and Solana instructions to produce human-readable summaries like "Swap 100 USDC for SOL on Jupiter" instead of raw hex. AI agents can explain what they're signing. | High | viem decodeFunctionData, ABI registry or inline ABI, Solana instruction decoding |
| DF-02 | **EVM calldata encoding helper** (`POST /v1/encode-calldata`) | AI agents can ask WAIaaS to encode `transfer(address,uint256)` with args into calldata hex. Eliminates need for agents to handle ABI encoding themselves. Uses viem `encodeFunctionData` which is already imported. | Med | viem encodeFunctionData (already imported in EvmAdapter) |
| DF-03 | **Default deny policy toggles via Settings DB** | Admin can flip `policy.default_deny_tokens`, `policy.default_deny_contracts`, `policy.default_deny_spenders` to `false` in Settings to convert from default-deny to default-allow. Currently hardcoded. Reduces friction for trusted environments. | Med | SettingsService (exists), hot-reload (exists), DatabasePolicyEngine modification |
| DF-04 | **MCP skill resources** (read-only context for AI agents) | Expose skill files (transactions.skill.md, policies.skill.md etc.) as MCP resources so AI agents can read API documentation in-context. Resource URI: `waiaas://skills/{skill-name}`. Agents learn how to use the wallet without being pre-prompted. | Med | MCP resource registration (pattern exists: wallet-balance, wallet-address, system-status) |
| DF-05 | **MCP resource templates for transactions** | `waiaas://transactions/{id}` resource template allows AI agents to read transaction details via MCP resource protocol, not just tools. More natural for context injection. | Low | MCP resource template API (spec supports it), existing GET /v1/transactions/:id |
| DF-06 | **Sign-only simulation pre-check** | Before signing, simulate the unsigned tx to detect reverts. Return simulation result alongside signature. Prevents signing dead transactions. | Low | simulateTransaction (exists on both adapters) |
| DF-07 | **Enhanced policy denial notifications** | When policy denies a tx, notification includes specific policy type, rule details, and actionable hint (e.g., "Token 0xABC not in ALLOWED_TOKENS. Add via POST /v1/policies"). Currently just "Policy denied". | Low | NotificationService (exists), richer vars in notify() |
| DF-08 | **Sign-only with optional broadcast** | Optional `broadcast: true` flag on sign endpoint that also submits the signed tx. Convenience for agents that want sign+execute in one call without the full pipeline build step. | Med | submitTransaction (exists) |

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **WalletConnect session management** | Massive scope creep: WalletConnect v2 session/pairing is a full subsystem. The sign-only endpoint covers the same use case without protocol overhead. | Expose sign-only endpoint; WalletConnect can be added as a separate milestone via walletconnect.project_id setting that already exists. |
| **Full ABI registry/database** | Maintaining a comprehensive ABI database is a maintenance burden. Token ABIs (ERC-20) are already embedded. | Accept inline ABI fragments in calldata encode requests. Use ERC20_ABI already in codebase for common operations. Let agents provide ABI for uncommon contracts. |
| **Automatic transaction broadcasting from sign-only** | Sign-only should respect the 2-step flow. Auto-broadcasting defeats the purpose and breaks dApp patterns like Jupiter that handle their own submission with MEV protection. | Return signed bytes only. Offer optional broadcast flag as a separate parameter (DF-08). |
| **Real-time tx parsing for ALL instruction types** | Parsing Solana CPI/inner instructions, Account Abstraction, and every EVM proxy pattern is unbounded scope. | Parse top-level instructions only: native transfer, ERC-20 transfer/approve, and known selectors. Return raw hex for unknown calldata. |
| **Default-allow as the default** | Converting the ENTIRE system to default-allow undermines WAIaaS's security model. | Settings toggles (DF-03) are per-policy-type, explicitly opt-in per deployment, and logged to audit trail. Default remains deny. |
| **Sign arbitrary messages** (EIP-191, EIP-712) | Message signing (not transaction signing) has different security implications and use cases (login, off-chain attestation). Scope creep for this milestone. | Add as separate feature in a future milestone. The signTransaction pipeline does not overlap with signMessage. |
| **Multichain calldata encoding** | Solana instruction encoding is fundamentally different from EVM calldata (Borsh vs ABI). Supporting both in one endpoint adds confusion. | Calldata encode endpoint is EVM-only. Solana instructions use existing CONTRACT_CALL with programId/instructionData/accounts. |

## Feature Dependencies

```
TS-02 (SIGN_ONLY type)
  |
  +--> TS-01 (sign endpoint) -- needs the type to exist
  |     |
  |     +--> TS-03 (unsigned tx parsing) -- sign endpoint must parse before signing
  |     |     |
  |     |     +--> TS-04 (policy for sign-only) -- policy needs parsed data to evaluate
  |     |     |
  |     |     +--> DF-01 (deep parsing summary) -- extends parsing with human-readable output
  |     |
  |     +--> TS-05 (return signed bytes) -- endpoint response format
  |     |
  |     +--> TS-06 (sign-only notifications) -- new event types
  |     |
  |     +--> DF-06 (simulation pre-check) -- optional but natural addition
  |     |
  |     +--> DF-08 (optional broadcast) -- extends sign endpoint
  |
DF-02 (calldata encode) -- independent, no deps on sign-only
  |
DF-03 (default deny toggles) -- independent
  |   needs: SettingsService, DatabasePolicyEngine
  |
DF-04 (MCP skill resources) -- independent
  |   needs: MCP server registration, skill files read
  |
DF-05 (MCP resource templates) -- independent
  |   needs: MCP resource template API
  |
DF-07 (enhanced notifications) -- independent
      needs: NotificationService, message-templates
```

## Detailed Feature Specifications

### TS-01: Sign-Only Endpoint

**Endpoint:** `POST /v1/transactions/sign`

**Auth:** sessionAuth (same as /v1/transactions/send)

**Request body:**
```json
{
  "type": "SIGN_ONLY",
  "chain": "solana",
  "unsignedTx": "<base64-encoded-serialized-transaction>",
  "network": "devnet"
}
```

- `chain` is required because we need to know which adapter to use for signing.
- `unsignedTx` is base64 for both Solana (VersionedTransaction bytes) and EVM (RLP-encoded unsigned tx bytes).
- `network` is optional (for network-scoped policy evaluation).

**Response (201):**
```json
{
  "id": "<tx-uuid>",
  "status": "SIGNED",
  "signedTx": "<base64-encoded-signed-transaction>",
  "parsed": {
    "from": "0x1234...",
    "to": "0xABCD...",
    "value": "0",
    "calldata": "0x095ea7b3...",
    "functionName": "approve",
    "args": ["0xSpender", "1000000"],
    "estimatedFee": "42000000000000"
  }
}
```

**Pipeline:** Shortened 4-stage pipeline (sign-only variant):
1. **Parse and Validate** -- Deserialize unsigned tx, extract fields for policy evaluation
2. **Auth** -- sessionAuth verification (existing middleware)
3. **Policy** -- Evaluate parsed fields against policy engine (same as send pipeline)
4. **Sign** -- Decrypt key, sign, return bytes

Stages 4 (Wait/Delay), 5 (Build), and 6 (Confirm) from the send pipeline are NOT needed because:
- Building is done externally (dApp provides unsigned tx)
- Broadcasting is the caller's responsibility
- Confirmation tracking is out of scope (no txHash yet)

**DELAY/APPROVAL tier handling:** When policy evaluates to DELAY or APPROVAL, the sign-only pipeline halts the same as the send pipeline. The transaction record is created with type=SIGN_ONLY and status=QUEUED. After delay expires or owner approves, the signing occurs and the signed bytes can be retrieved via `GET /v1/transactions/:id` (with `signedTx` field added to response).

**DB record:** Transaction row with type=SIGN_ONLY, status=SIGNED (or QUEUED/CANCELLED for delayed/denied), metadata contains parsed info and the original unsignedTx base64.

### TS-02: SIGN_ONLY Transaction Type

**Enum extension:**
```typescript
export const TRANSACTION_TYPES = [
  'TRANSFER', 'TOKEN_TRANSFER', 'CONTRACT_CALL',
  'APPROVE', 'BATCH', 'SIGN_ONLY',  // NEW
] as const;
```

**Zod schema (separate from discriminatedUnion):**
```typescript
export const SignOnlyRequestSchema = z.object({
  type: z.literal('SIGN_ONLY'),
  chain: ChainTypeEnum,
  unsignedTx: z.string().min(1),  // base64-encoded serialized tx
  network: NetworkTypeEnum.optional(),
});
export type SignOnlyRequest = z.infer<typeof SignOnlyRequestSchema>;
```

Note: SIGN_ONLY does NOT join the existing discriminatedUnion for /v1/transactions/send. It has its own endpoint (/v1/transactions/sign) and its own schema. The 5-type discriminatedUnion (`TransactionRequestSchema`) remains unchanged.

**Transaction status extension:**
```typescript
// Add SIGNED to TRANSACTION_STATUSES
export const TRANSACTION_STATUSES = [
  'PENDING', 'QUEUED', 'EXECUTING', 'SUBMITTED',
  'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED',
  'PARTIAL_FAILURE', 'SIGNED',  // NEW
] as const;
```

### TS-03: Unsigned Transaction Parsing

**EVM parsing (viem -- already imported):**
```typescript
import { parseTransaction, decodeFunctionData } from 'viem';

// Parse RLP-encoded unsigned tx bytes
const serializedHex = toHex(unsignedTxBytes);
const parsed = parseTransaction(serializedHex);
// Result: { to, value, data, nonce, gasLimit, maxFeePerGas, chainId, ... }

// If calldata present, attempt decode with known ABIs
if (parsed.data && parsed.data.length >= 10) {
  const selector = parsed.data.slice(0, 10);
  try {
    const decoded = decodeFunctionData({ abi: ERC20_ABI, data: parsed.data });
    // decoded: { functionName: 'transfer', args: ['0xRecipient', 1000000n] }
  } catch {
    // Unknown function -- return raw calldata + selector only
  }
}
```

**Solana parsing (@solana/kit -- already imported):**
```typescript
const txDecoder = getTransactionDecoder();  // already instantiated as module-level const
const decoded = txDecoder.decode(unsignedTxBytes);
// decoded: CompiledTransaction with staticAccounts, instructions, etc.
// Extract: programIds, instruction data, account metas, fee payer
```

**Parsed output structure (chain-agnostic):**
```typescript
interface ParsedUnsignedTx {
  chain: ChainType;
  from?: string;        // sender (EVM: derived from metadata, Solana: fee payer)
  to?: string;          // primary destination address
  value?: string;       // native value in smallest unit (wei/lamports)
  calldata?: string;    // raw calldata hex (EVM only)
  functionName?: string; // decoded function name if ABI match found
  args?: unknown[];     // decoded arguments if ABI match found
  selector?: string;    // 4-byte function selector hex (EVM only)
  instructions?: Array<{  // Solana instruction breakdown
    programId: string;
    data: string;       // base64 instruction data
    accounts: string[]; // account pubkeys
  }>;
  nonce?: number;       // EVM nonce
  chainId?: number;     // EVM chainId
  estimatedFee?: string; // estimated fee from tx gas params
  warnings: string[];   // e.g., "Unknown function selector", "High value transfer"
}
```

**Known ABI matching (built-in):**
- ERC-20: transfer, transferFrom, approve, balanceOf (ERC20_ABI already in codebase)
- Native transfer: value > 0, no calldata
- Unknown: return raw calldata with selector extracted

### TS-04: Policy Evaluation for Sign-Only

The parsed unsigned tx fields map directly to existing TransactionParam:

| Parsed Field | TransactionParam Field | Policy Check |
|-------------|----------------------|--------------|
| `to` | `toAddress` | WHITELIST |
| `to` (if contract call detected) | `contractAddress` | CONTRACT_WHITELIST |
| `selector` | `selector` | METHOD_WHITELIST |
| `value` | `amount` | SPENDING_LIMIT |
| Token transfer detected via calldata | `tokenAddress` | ALLOWED_TOKENS |
| Approve detected via calldata | `spenderAddress` | APPROVED_SPENDERS |
| `network` (from request) | `network` | ALLOWED_NETWORKS |

**Type inference from EVM calldata:**
- Selector `0xa9059cbb` (ERC-20 transfer) -> evaluatedType = TOKEN_TRANSFER
- Selector `0x095ea7b3` (ERC-20 approve) -> evaluatedType = APPROVE
- No calldata, value > 0 -> evaluatedType = TRANSFER
- Any other calldata -> evaluatedType = CONTRACT_CALL

**Solana type inference:**
- System Program transfer instruction -> evaluatedType = TRANSFER
- Token Program transfer/transferChecked -> evaluatedType = TOKEN_TRANSFER
- Token Program approve -> evaluatedType = APPROVE
- Any other program -> evaluatedType = CONTRACT_CALL

**Key design decision:** Sign-only is evaluated using the SAME policy engine as execute, against parsed content from the externally-built transaction. No new policy types needed. The `evaluatedType` from parsing drives which policies apply.

### TS-05: Return Signed Transaction Bytes

Response format:
```json
{
  "signedTx": "<base64-encoded>",
  "encoding": "base64"
}
```

Base64 is the standard encoding for both chains:
- **Solana:** `getBase64EncodedWireTransaction()` already in the codebase for submit
- **EVM:** `toHex()` to hex, then base64 encode the raw bytes

### TS-06: Sign-Only Notification Events

New event types added to NOTIFICATION_EVENT_TYPES:
```typescript
'TX_SIGN_REQUESTED',  // When sign-only tx enters pipeline
'TX_SIGNED',          // When sign-only tx is successfully signed
```

Message templates (en/ko):
- TX_SIGN_REQUESTED: "Sign request received for {type} to {to} (value: {value})"
- TX_SIGNED: "Transaction signed successfully. Destination: {to}, Value: {value}"

These integrate with existing priority-based notification delivery (Telegram/Discord/ntfy).

### DF-02: EVM Calldata Encoding Helper

**Endpoint:** `POST /v1/encode-calldata`

**Auth:** sessionAuth

**Request:**
```json
{
  "abi": [{"name": "transfer", "type": "function", "inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"}], "outputs": [{"name": "", "type": "bool"}]}],
  "functionName": "transfer",
  "args": ["0xRecipientAddress", "1000000"]
}
```

**Response:**
```json
{
  "calldata": "0xa9059cbb000000000000000000000000recipientaddress0000000000000000000000000000000000000000000000000000000000000f4240",
  "selector": "0xa9059cbb",
  "functionName": "transfer"
}
```

Implementation: thin wrapper around viem `encodeFunctionData`. The function is already imported in the EVM adapter. This endpoint is stateless (no wallet or session state needed beyond auth).

**Use case flow:** Agent calls encode-calldata to build calldata, then uses the result in a CONTRACT_CALL request to /v1/transactions/send, or builds a full unsigned tx externally and submits to /v1/transactions/sign.

### DF-03: Default Deny Policy Toggles

New setting keys in SETTING_DEFINITIONS:
```typescript
{ key: 'policy.default_deny_tokens', category: 'security', configPath: 'security.default_deny_tokens', defaultValue: 'true', isCredential: false },
{ key: 'policy.default_deny_contracts', category: 'security', configPath: 'security.default_deny_contracts', defaultValue: 'true', isCredential: false },
{ key: 'policy.default_deny_spenders', category: 'security', configPath: 'security.default_deny_spenders', defaultValue: 'true', isCredential: false },
{ key: 'policy.default_deny_sign_only', category: 'security', configPath: 'security.default_deny_sign_only', defaultValue: 'true', isCredential: false },
```

**Behavior change in DatabasePolicyEngine:**
```typescript
// BEFORE (hardcoded default deny):
if (!allowedTokensPolicy) {
  return { allowed: false, tier: 'INSTANT',
    reason: 'Token transfer not allowed: no ALLOWED_TOKENS policy configured' };
}

// AFTER (settings-aware):
if (!allowedTokensPolicy) {
  const defaultDeny = this.settingsService?.get('policy.default_deny_tokens') !== 'false';
  if (defaultDeny) {
    return { allowed: false, tier: 'INSTANT',
      reason: 'Token transfer not allowed: no ALLOWED_TOKENS policy configured' };
  }
  // default-allow mode: skip this check, continue evaluation
}
```

Same pattern for CONTRACT_WHITELIST and APPROVED_SPENDERS.

The `default_deny_sign_only` toggle is a master switch: when `true` (default), sign-only requests require explicit CONTRACT_WHITELIST or other policy to allow the target. When `false`, sign-only requests follow the same rules as send requests.

**Hot-reload:** These settings use the existing hot-reload mechanism. Changing a toggle in Admin UI -> Settings immediately affects the next policy evaluation without daemon restart.

**Audit trail:** Each toggle change is logged to audit_log with the setting key, old value, new value, and actor (masterAuth).

### DF-04: MCP Skill Resources

Register the 5 skill files as MCP read-only resources:

```typescript
const SKILL_FILES = [
  { name: 'Quickstart Guide', uri: 'waiaas://skills/quickstart', file: 'quickstart.skill.md' },
  { name: 'Transactions API', uri: 'waiaas://skills/transactions', file: 'transactions.skill.md' },
  { name: 'Policies API', uri: 'waiaas://skills/policies', file: 'policies.skill.md' },
  { name: 'Wallet API', uri: 'waiaas://skills/wallet', file: 'wallet.skill.md' },
  { name: 'Admin API', uri: 'waiaas://skills/admin', file: 'admin.skill.md' },
];

for (const skill of SKILL_FILES) {
  server.resource(skill.name, skill.uri, {
    description: withWalletPrefix(`API reference: ${skill.name}`, walletContext?.walletName),
    mimeType: 'text/markdown',
  }, async () => {
    const content = await readFile(resolve(skillsDir, skill.file), 'utf-8');
    return { contents: [{ uri: skill.uri, mimeType: 'text/markdown', text: content }] };
  });
}
```

**Value:** AI agents using WAIaaS MCP server can `resources/read` the skill files to learn API patterns, transaction types, and policy configuration, all without needing the information pre-loaded in their system prompt. This is how the MCP spec intends resources to be used: "share data that provides context to language models."

**URI scheme:** `waiaas://skills/{name}` follows MCP best practice of custom URI schemes being descriptive and RFC3986-compliant.

### DF-05: MCP Resource Templates for Transactions

```typescript
// Register a resource template for transaction details
server.resourceTemplate(
  'Transaction Details',
  'waiaas://transactions/{id}',
  { description: 'Transaction details by ID', mimeType: 'application/json' },
  async (uri, params) => {
    const id = params.id;
    const result = await apiClient.get(`/v1/transactions/${id}`);
    return toResourceResult(uri, result);
  },
);
```

MCP resource templates use RFC 6570 URI templates. The `{id}` parameter can be auto-completed through the MCP completion API. This allows agents to reference transactions as context resources rather than making explicit tool calls.

### DF-07: Enhanced Policy Denial Notifications

**Current notification (generic):**
```
Policy Violation
Transaction denied by policy
```

**Enhanced notification (specific and actionable):**
```
Policy Violation: TOKEN_TRANSFER denied by ALLOWED_TOKENS
Token 0xA0b8...eB48 (USDC) not in allowed list.
Hint: Add to ALLOWED_TOKENS policy via POST /v1/policies
Wallet: trading-bot | Amount: 5,000,000 | To: 0x9aE4...Zcde
```

Implementation: enrich the `vars` record passed to `notificationService.notify('POLICY_VIOLATION', ...)` with:
- `policyType`: which policy type triggered the denial
- `tokenAddress` / `contractAddress` / `spenderAddress`: the specific entity that was blocked
- `hint`: actionable remediation step

Template interpolation already supports arbitrary `{key}` variables. The only change is passing richer data from the policy evaluation result to the notification call.

---

## MVP Recommendation

### Phase 1: Sign-Only Core (highest priority -- enables dApp integration)

Prioritize:
1. **TS-02** SIGN_ONLY type + Zod schema + SIGNED status -- foundation
2. **TS-03** Unsigned tx parsing (EVM + Solana) -- security gate
3. **TS-04** Policy evaluation for sign-only -- security enforcement
4. **TS-01** Sign endpoint with shortened pipeline -- the API surface
5. **TS-05** Return signed bytes -- response format
6. **TS-06** Sign-only notifications -- audit trail

This forms a complete, secure sign-only pipeline that enables Jupiter, Agentra, and NFT marketplace integration.

### Phase 2: DX Enhancements (high value, independently shippable)

7. **DF-02** Calldata encoding helper -- agents can build calldata without external tools
8. **DF-03** Default deny toggles -- operational flexibility via Settings UI
9. **DF-07** Enhanced policy notifications -- better error experience for operators

### Phase 3: MCP Context Enhancement (moderate priority, independently shippable)

10. **DF-04** MCP skill resources -- agent self-service documentation
11. **DF-05** MCP resource templates -- transaction context injection
12. **DF-06** Simulation pre-check -- safety net for sign-only

### Defer to Future Milestone

- **DF-01** Deep parsing with human-readable summaries -- HIGH complexity, requires ABI inference heuristics and per-protocol knowledge. Better as an incremental enhancement after sign-only usage patterns are established.
- **DF-08** Optional broadcast on sign endpoint -- Nice-to-have but complicates the clean sign-only / execute separation. Can be added once the base sign-only flow is proven.

---

## Complexity Assessment

| Feature | Backend | Frontend (Admin) | Tests | Total |
|---------|---------|-------------------|-------|-------|
| TS-01 Sign endpoint | High (new pipeline variant, route) | Low (tx detail shows SIGN_ONLY) | High (pipeline tests) | **High** |
| TS-02 SIGN_ONLY type | Low (enum + schema) | Low (type display) | Low (schema tests) | **Low** |
| TS-03 Unsigned tx parsing | High (chain-specific parsing) | None | High (parsing edge cases) | **High** |
| TS-04 Policy for sign-only | Med (map parsed -> TransactionParam) | None | High (policy combo tests) | **Med** |
| TS-05 Return signed bytes | Low (base64 encode) | None | Low | **Low** |
| TS-06 Notifications | Low (2 new event types) | None | Low | **Low** |
| DF-02 Calldata encode | Low (viem wrapper) | None | Med (encoding edge cases) | **Low** |
| DF-03 Default deny toggles | Med (settings + engine injection) | Med (Settings UI checkboxes) | Med (toggle behavior tests) | **Med** |
| DF-04 MCP skill resources | Low (file read + register) | None | Low (resource read tests) | **Low** |
| DF-05 MCP resource templates | Low (template registration) | None | Low | **Low** |
| DF-06 Simulation pre-check | Low (existing simulateTransaction) | None | Low | **Low** |
| DF-07 Enhanced notifications | Low (richer vars in notify) | None | Low | **Low** |

**Estimated total:** ~800-1200 LOC production, ~400-600 LOC tests

---

## Existing Feature Compatibility Matrix

| Existing Feature | Impact | Change Level |
|-----------------|--------|-------------|
| `POST /v1/transactions/send` (5-type) | No change. SIGN_ONLY uses its own endpoint. | **None** |
| `GET /v1/transactions/:id` | Add `signedTx` field for SIGN_ONLY type txs. | **Additive** |
| `GET /v1/transactions` (list) | SIGN_ONLY shows in list with type=SIGN_ONLY. | **Additive** |
| Pipeline (6-stage) | Sign-only uses a separate 4-stage variant. Send pipeline unchanged. | **None** |
| PolicyEngine (11 types) | No new policy types. Sign-only evaluated with existing policies via parsed TransactionParam. | **None** |
| Settings DB (31 keys) | +4 new setting keys for default deny toggles. | **Additive** |
| MCP Server (11 tools, 3 resources) | +5 skill resources, +1 resource template. No tool changes. | **Additive** |
| Notification (21 event types) | +2 event types (TX_SIGN_REQUESTED, TX_SIGNED). | **Additive** |
| SDK (TypeScript/Python) | New `sign()` method. Existing methods unchanged. | **Additive** |
| Admin UI | Transaction detail shows SIGN_ONLY type, Settings page shows new toggles. | **Additive** |
| skill files (5 files) | Update transactions.skill.md with sign-only documentation. | **Documentation** |

**No breaking changes.** All new features are additive to existing API surface.

---

## Sources

### HIGH Confidence (official docs + codebase analysis)
- WAIaaS codebase direct analysis: IChainAdapter interface, 6-stage pipeline, DatabasePolicyEngine, MCP server, EVM/Solana adapters, SettingsService, NotificationService
- [viem encodeFunctionData](https://viem.sh/docs/contract/encodeFunctionData.html) -- calldata encoding API
- [viem decodeFunctionData](https://viem.sh/docs/contract/decodeFunctionData) -- calldata decoding API
- [MCP Resources Specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/resources) -- resource templates, URI schemes, subscription model

### MEDIUM Confidence (WebSearch + cross-verification)
- [Jupiter Ultra Swap API](https://dev.jup.ag/docs/ultra) -- unsigned tx flow: order -> sign -> execute
- [Jupiter V6 Swap API](https://hub.jup.ag/docs/apis/swap-api) -- swap tx generation pattern
- [Fireblocks Raw Signing](https://developers.fireblocks.com/docs/raw-signing) -- sign-only policy model: "policies reject all raw transactions by default"
- [Circle Signing APIs](https://developers.circle.com/wallets/signing-apis) -- WaaS sign endpoint: /sign/transaction
- [WalletConnect Sign API](https://specs.walletconnect.com/2.0/specs/clients/sign) -- session-based signing protocol
- [Solana VersionedTransaction](https://docs.rs/solana-sdk/latest/solana_sdk/transaction/struct.VersionedTransaction.html) -- transaction deserialization
- [Solana Mobile Wallet Adapter](https://docs.solanamobile.com/developers/mobile-wallet-adapter-deep-dive) -- sign-only vs sign-and-send pattern comparison
