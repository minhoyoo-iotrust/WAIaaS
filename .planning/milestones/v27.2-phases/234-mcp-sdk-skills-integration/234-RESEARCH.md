# Phase 234: MCP + SDK + Skills Integration - Research

**Researched:** 2026-02-22
**Domain:** MCP tool parameters, TypeScript/Python SDK types, Skill file documentation
**Confidence:** HIGH

## Summary

Phase 234 integrates CAIP-19 `assetId` support into the three consumer-facing interfaces: MCP tools (AI agent tools), TypeScript/Python SDKs (developer APIs), and skill files (AI-readable documentation). The core infrastructure is already in place from Phases 231-233: the `caip/` module in `@waiaas/core` provides parsing/formatting/validation, the `TokenInfoSchema` in the transaction schema already accepts `optional assetId`, the `ALLOWED_TOKENS` policy schema already accepts `optional assetId`, and the daemon REST API routes already pass `assetId` through the pipeline.

The work is purely surface-level integration: adding optional parameters to MCP tool definitions, adding optional fields to standalone SDK type interfaces, and documenting the CAIP-19 concept in skill files. No new libraries, no DB changes, no pipeline modifications.

**Primary recommendation:** Add `assetId` as an optional `z.string()` parameter to 3 MCP tools (send_token, approve_token, send_batch), add the field to 3 SDK interfaces (TokenInfo, SendTokenParams, AssetInfo) in TypeScript and their Python counterparts, update tool descriptions to explain CAIP-19, then update 3 skill files with CAIP-19 documentation.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MCPS-01 | Token-related MCP tools accept optional assetId parameter | send_token, approve_token, send_batch tools need `assetId` in their `token` object or as top-level parameter. The daemon's `TokenInfoSchema` already accepts it. MCP tools just need to pass it through. |
| MCPS-02 | MCP tool descriptions document CAIP-19 assetId format and usage | Each tool's description string and parameter `.describe()` calls need CAIP-19 format explanation. AI agents read these descriptions to understand parameter formats. |
| MCPS-03 | TypeScript SDK types include assetId fields in token-related interfaces | `TokenInfo`, `SendTokenParams`, `AssetInfo` in `packages/sdk/src/types.ts` need optional `assetId?: string` fields. The SDK has zero dependencies, so no Zod validation -- just type declarations. |
| MCPS-04 | Python SDK types include assetId fields in token-related models | `TokenInfo`, `SendTokenRequest`, `AssetInfo` in `python-sdk/waiaas/models.py` need optional `asset_id` fields with `alias="assetId"`. Uses Pydantic v2 pattern. |
| SKIL-01 | Skills files document CAIP-19 assetId usage | `transactions.skill.md` and `policies.skill.md` need CAIP-19 sections showing assetId usage in requests and policy rules. |
| SKIL-02 | quickstart.skill.md introduces CAIP-19 asset identification concept | Brief introduction of CAIP-19 in quickstart with an example showing how to use assetId in a TOKEN_TRANSFER. |
</phase_requirements>

## Standard Stack

### Core (already in codebase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@waiaas/core` caip/ module | N/A (internal) | CAIP-2/19 parsing, formatting, validation, network mapping | Phase 231 SSoT for all CAIP operations |
| `@modelcontextprotocol/sdk` | 1.26.0 | MCP server with `server.tool()` registration | Already used by all 23 MCP tools |
| `zod` | 3.25.76 | MCP tool parameter schemas | Already used by all MCP tool parameter definitions |
| Pydantic v2 | (in venv) | Python SDK model definitions | Already used by all Python SDK models |

### Supporting
No new libraries needed. This phase only modifies existing code.

### Alternatives Considered
None. The interfaces are fixed by the existing architecture.

## Architecture Patterns

### Pattern 1: MCP Tool assetId Parameter Addition

**What:** Add optional `assetId` string parameter to token-related MCP tools.
**When to use:** Any MCP tool that accepts a `token` object or deals with token identification.

**Current pattern (send_token.ts):**
```typescript
token: z.object({
  address: z.string().describe('Token mint (SPL) or contract address (ERC-20)'),
  decimals: z.number().describe('Token decimals (e.g., 6 for USDC)'),
  symbol: z.string().describe('Token symbol (e.g., USDC)'),
}).optional().describe('Required for TOKEN_TRANSFER'),
```

**Target pattern:**
```typescript
token: z.object({
  address: z.string().describe('Token mint (SPL) or contract address (ERC-20)'),
  decimals: z.number().describe('Token decimals (e.g., 6 for USDC)'),
  symbol: z.string().describe('Token symbol (e.g., USDC)'),
  assetId: z.string().optional().describe(
    'CAIP-19 asset type URI (e.g., "eip155:1/erc20:0xa0b8..."). Optional -- when provided, address is cross-validated against assetId.'
  ),
}).optional().describe('Required for TOKEN_TRANSFER'),
```

**Rationale:** The daemon's `TokenInfoSchema` already accepts and validates `assetId`. MCP tools just need to include it in the Zod schema so AI agents can pass it through. The field is optional to maintain backward compatibility.

**Affected tools (3):**
1. `send_token` -- token object parameter
2. `approve_token` -- token object parameter
3. `send_batch` -- instructions array contains token objects (documented in description)

**NOT affected:**
- `call_contract` -- no token object (uses raw calldata)
- `get_balance` -- query only, no token identification needed
- `get_assets` -- query response (assetId appears in response from daemon, no input needed)
- `get_tokens` -- query only
- `sign_transaction` -- raw transaction, no token parameters

### Pattern 2: MCP Tool Description CAIP-19 Documentation

**What:** Update tool description strings to explain CAIP-19 format for AI agent comprehension.
**When to use:** Any tool where assetId can be used.

**Key insight:** MCP tool descriptions are consumed by LLMs. They need to be concise but explain the CAIP-19 format clearly enough for an AI to construct valid URIs. The format is:
```
{CAIP-2 chain ID}/{asset namespace}:{asset reference}
```
Examples:
- `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48` (USDC on Ethereum)
- `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (USDC on Solana)
- `eip155:137/slip44:966` (native POL on Polygon)

### Pattern 3: SDK Type Extension (TypeScript)

**What:** Add optional `assetId` field to existing SDK interfaces.
**When to use:** `TokenInfo`, `SendTokenParams`, `AssetInfo` interfaces.

**Current TokenInfo:**
```typescript
export interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
}
```

**Target TokenInfo:**
```typescript
export interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
  /** CAIP-19 asset type URI (e.g., "eip155:1/erc20:0xa0b8..."). Optional. */
  assetId?: string;
}
```

**Key constraint:** The SDK is zero-dependency (no Zod). Fields are type-only declarations. Validation happens in the daemon. The SDK's `validateSendToken()` function does inline validation of required fields but should NOT validate `assetId` format (that's the daemon's responsibility via `Caip19Schema`).

### Pattern 4: Python SDK Model Extension (Pydantic)

**What:** Add optional `assetId` field to Pydantic models with alias.
**When to use:** `TokenInfo`, `SendTokenRequest`, `AssetInfo` models.

**Current TokenInfo (Python):**
```python
class TokenInfo(BaseModel):
    address: str
    decimals: int
    symbol: str
```

**Target TokenInfo (Python):**
```python
class TokenInfo(BaseModel):
    address: str
    decimals: int
    symbol: str
    asset_id: Optional[str] = Field(default=None, alias="assetId")

    model_config = {"populate_by_name": True}
```

**Key pattern:** Python uses `snake_case` with `alias="camelCase"` for JSON serialization. The `model_config` with `populate_by_name: True` allows both `asset_id` and `assetId` keys when constructing.

### Pattern 5: Skill File CAIP-19 Section

**What:** Add CAIP-19 documentation sections to skill files.
**When to use:** In transactions.skill.md (main reference), policies.skill.md (ALLOWED_TOKENS), and quickstart.skill.md (intro).

**Key elements to document:**
1. CAIP-19 format explanation with examples
2. How to use `assetId` in TOKEN_TRANSFER and APPROVE requests
3. How `assetId` interacts with `token.address` (cross-validation)
4. CAIP-19 in ALLOWED_TOKENS policy
5. Network-specific examples (EVM erc20 vs Solana token namespace)

### Anti-Patterns to Avoid
- **Making assetId required in MCP tools:** Must remain optional for backward compatibility.
- **Adding CAIP-19 validation to SDK:** The TS SDK is zero-dependency; validation belongs in the daemon.
- **Duplicating CAIP module logic in MCP package:** MCP tools just pass through; the daemon validates.
- **Changing existing Zod schema structure:** Only ADD optional fields; never modify required field types.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CAIP-19 validation in MCP | Custom regex in MCP tool | Let daemon's `TokenInfoSchema` validate | Daemon already has `Caip19Schema` with superRefine cross-validation |
| CAIP-19 format in SDK | String format validation | `assetId?: string` (plain) | SDK is zero-dependency; daemon validates |
| Token resolve from assetId | Extract address from assetId in MCP | Pass assetId to daemon | Daemon's `TokenInfoSchema` handles `parseCaip19` + address extraction |

**Key insight:** The MCP tools and SDKs are thin clients. They should pass `assetId` through to the daemon without processing it. The daemon already has full CAIP-19 support from Phases 231-233.

## Common Pitfalls

### Pitfall 1: Forgetting to Include assetId in Body Construction
**What goes wrong:** MCP tool handler constructs body object but omits `assetId` from the token object.
**Why it happens:** The token object is spread/constructed manually in each tool handler.
**How to avoid:** In each affected tool's handler, ensure `args.token` is passed directly (not reconstructed field-by-field), or explicitly include `assetId` when constructing.
**Warning signs:** Tool test doesn't verify `assetId` passthrough.

**Specific risk:** In `send-token.ts`, the handler does:
```typescript
if (args.token) body.token = args.token;
```
This passes the entire token object including `assetId` -- so send_token is actually already safe IF the Zod schema includes `assetId`. The same pattern exists for `approve_token`.

### Pitfall 2: Pydantic Model Missing model_config
**What goes wrong:** Python model with `alias` field but missing `populate_by_name: True` in model_config.
**Why it happens:** `TokenInfo` model currently has NO `model_config`. Adding `alias="assetId"` without `model_config` means `asset_id` keyword argument won't work.
**How to avoid:** Always add `model_config = {"populate_by_name": True}` when adding aliased fields to models that didn't have model_config before.
**Warning signs:** `TokenInfo(asset_id="eip155:1/erc20:0x...")` raises TypeError.

### Pitfall 3: EVM Address Case Sensitivity in Tool Descriptions
**What goes wrong:** AI agent passes checksummed EVM address in assetId (e.g., `eip155:1/erc20:0xA0b86991...`).
**Why it happens:** CAIP-19 for EVM uses lowercased addresses, but many sources provide checksummed.
**How to avoid:** Document in tool descriptions and skill files that EVM addresses in CAIP-19 must be lowercase.
**Warning signs:** Daemon returns cross-validation error between `assetId` address and `token.address`.

### Pitfall 4: Skills File CAIP-19 Examples with Wrong Namespace
**What goes wrong:** Using `erc20` for Solana tokens or `spl` for EVM tokens.
**Why it happens:** Namespace confusion across chains.
**How to avoid:** Use `erc20` for EVM (eip155:*) tokens, `token` for Solana tokens, `slip44` for native assets. Reference the `asset-helpers.ts` constants.
**Warning signs:** CAIP-19 validation rejects the URI.

### Pitfall 5: Updating MCP Tool Count in server.ts Comment
**What goes wrong:** Comment says "23 tools" but tool count doesn't change (this phase doesn't add new tools).
**Why it happens:** Habit of updating comment when modifying server.ts.
**How to avoid:** This phase modifies tool parameters only, not tool count. Server.ts comment stays at 23.
**Warning signs:** Incorrect comment.

## Code Examples

### Example 1: send_token with assetId (MCP tool call)
```json
{
  "tool": "send_token",
  "arguments": {
    "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD16",
    "amount": "5000000",
    "type": "TOKEN_TRANSFER",
    "token": {
      "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "decimals": 6,
      "symbol": "USDC",
      "assetId": "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
    },
    "network": "ethereum-mainnet"
  }
}
```

### Example 2: approve_token with assetId (MCP tool call)
```json
{
  "tool": "approve_token",
  "arguments": {
    "spender": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    "token": {
      "address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "decimals": 6,
      "symbol": "USDC",
      "assetId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    },
    "amount": "1000000000"
  }
}
```

### Example 3: TypeScript SDK sendToken with assetId
```typescript
await client.sendToken({
  type: 'TOKEN_TRANSFER',
  to: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD16',
  amount: '5000000',
  token: {
    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    decimals: 6,
    symbol: 'USDC',
    assetId: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  },
  network: 'ethereum-mainnet',
});
```

### Example 4: Python SDK send_token with assetId
```python
await client.send_token(
    to="0x742d35Cc6634C0532925a3b844Bc9e7595f2bD16",
    amount="5000000",
    type="TOKEN_TRANSFER",
    token={
        "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "decimals": 6,
        "symbol": "USDC",
        "assetId": "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    },
    network="ethereum-mainnet",
)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Token identified by address + chain | Token identified by CAIP-19 URI | Phase 231 (v27.2) | Standard cross-chain asset identification |
| ALLOWED_TOKENS uses address only | ALLOWED_TOKENS uses address + optional assetId | Phase 233 (v27.2) | 4-scenario policy matching |
| TokenInfoSchema has 3 fields | TokenInfoSchema has 4 fields (+ assetId) | Phase 233 (v27.2) | Cross-validation enabled |

**Deprecated/outdated:** Nothing deprecated -- assetId is additive/optional.

## Codebase Inventory (Files to Modify)

### MCP Tools (3 files)
1. `packages/mcp/src/tools/send-token.ts` -- add `assetId` to token Zod object + update description
2. `packages/mcp/src/tools/approve-token.ts` -- add `assetId` to token Zod object + update description
3. `packages/mcp/src/tools/send-batch.ts` -- update description to mention assetId in instructions

### MCP Tests (1 file)
4. `packages/mcp/src/__tests__/tools.test.ts` -- add tests for assetId passthrough in send_token, approve_token

### TypeScript SDK (1 file)
5. `packages/sdk/src/types.ts` -- add `assetId?: string` to `TokenInfo`, `SendTokenParams`, `AssetInfo`

### Python SDK (1 file)
6. `python-sdk/waiaas/models.py` -- add `asset_id: Optional[str] = Field(default=None, alias="assetId")` to `TokenInfo`, `SendTokenRequest`, `AssetInfo`

### Skills Files (3 files)
7. `skills/transactions.skill.md` -- add CAIP-19 section with assetId usage in TOKEN_TRANSFER and APPROVE
8. `skills/policies.skill.md` -- update ALLOWED_TOKENS section to show assetId in token entries
9. `skills/quickstart.skill.md` -- add brief CAIP-19 intro section

### Total: 9 files modified, 0 files created

## Open Questions

1. **Should send_batch tool inline token schema include assetId?**
   - What we know: send_batch uses `z.array(z.record(z.unknown()))` for instructions -- it accepts arbitrary objects and passes them to the daemon. The daemon then validates each instruction via its own schemas.
   - What's unclear: Whether to add a more specific schema for instructions that includes `assetId`, or keep the flexible `z.record(z.unknown())`.
   - Recommendation: Keep flexible `z.record(z.unknown())` since it already works. Just document assetId support in the description string. This matches the current pattern and avoids schema duplication.

2. **Should get_assets response document assetId in skills?**
   - What we know: The daemon's asset response may include `assetId` if the `AssetInfo` schema returns it. But the MCP `get_assets` tool is a GET query -- no input assetId needed.
   - What's unclear: Whether the daemon's GET /v1/wallet/assets response already includes `assetId` field.
   - Recommendation: Add `assetId?: string` to the SDK's `AssetInfo` type regardless, so consumers can see it in responses. Check daemon response shape during implementation.

## Sources

### Primary (HIGH confidence)
- Codebase inspection of all 9 target files (verified current state 2026-02-22)
- `packages/core/src/caip/` module -- full CAIP-2/19 implementation (Phase 231)
- `packages/core/src/schemas/transaction.schema.ts` -- TokenInfoSchema with assetId (Phase 233)
- `packages/core/src/schemas/policy.schema.ts` -- AllowedTokensRulesSchema with assetId (Phase 233)
- `.planning/REQUIREMENTS.md` -- MCPS-01..04, SKIL-01..02 requirement definitions

### Secondary (MEDIUM confidence)
- CAIP-19 spec at standards.chainagnostic.org/CAIPs/caip-19 (referenced in codebase comments)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, only modifying existing code
- Architecture: HIGH -- patterns verified from 23 existing MCP tools and existing SDK
- Pitfalls: HIGH -- identified from codebase inspection of actual handler implementations

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (30 days, stable domain)
