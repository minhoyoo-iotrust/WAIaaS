# Feature Landscape

**Domain:** Amount Unit Standardization & AI Agent DX for Blockchain Wallet API
**Researched:** 2026-03-14

## Table Stakes

Features AI agents expect. Missing = repeated unit confusion errors and degraded agent autonomy.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Consistent amount units across all providers** | 14 providers with mixed smallest-unit/human-readable rules force agents to memorize per-provider conventions. Ethereum JSON-RPC, Solana RPC, Stripe all standardize on smallest units. | Med | Existing `parseTokenAmount()`, `formatAmount()` utilities; 4 providers need migration (aave-v3, kamino, lido, jito) | Coinbase AgentKit chose human-readable ("1.0 ETH") but this loses precision for arbitrary tokens. WAIaaS correctly chose smallest-unit as canonical -- matches blockchain RPC standards. CLOB exchanges (Hyperliquid, Drift, Polymarket) exempt per exchange-native conventions |
| **MCP typed parameter schemas** | Current `z.record(z.unknown())` gives AI models zero type/unit information. MCP spec (2025-11-25) defines `inputSchema` as JSON Schema -- typed schemas are the protocol's designed pattern, not an enhancement. Models self-correct via tool execution errors but preventing errors is cheaper. | Med | `ActionDefinition.inputSchema` Zod objects already exist per provider; `zodToJsonSchema()` conversion needed; MCP `server.tool()` registration in `action-provider.ts` | Per MCP spec, `inputSchema` MUST be valid JSON Schema with `type`, `properties`, `description`. Current generic schema wastes the protocol's primary DX mechanism |
| **Amount schema descriptions with unit examples** | Without description, `"sellAmount"` could mean wei, gwei, or ETH. Coinbase AgentKit uses `"The amount to transfer in whole units e.g. 1 ETH"` -- explicit unit guidance in schema descriptions is standard practice for AI-facing APIs | Low | Zod `.describe()` on each amount field across 14 providers | Cheapest improvement with highest impact. viem/ethers.js docs always specify "wei" or "ether" for each function |
| **`amountFormatted` in transaction responses** | Alchemy Transfers API returns `value` (converted from raw to decimal using contract decimals) + `asset` (token symbol). Returning only raw amounts forces agents to do decimals lookup + BigInt division for every response | Med | Token registry (decimals/symbol per CAIP-19), chain config (native decimals), `formatAmount()` utility | Runtime-computed field, no DB migration. `null` when decimals unknown (unregistered tokens, CONTRACT_CALL). Existing issue #168 (Admin UI raw display) and #165 (notification raw display) confirm this is a real pain point |
| **`decimals` + `symbol` in transaction responses** | Alchemy returns `decimal` and `asset` fields alongside amounts. AI agents need these to interpret amounts without additional API calls | Low | Same token registry / chain config lookup as `amountFormatted` | Always return alongside `amountFormatted` -- three fields form a unit. `null` when unknown |

## Differentiators

Features that set product apart. Not expected in generic blockchain APIs, but high value for AI agent use case.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **`humanAmount` alternative parameter** | AI agents naturally think in "0.5 ETH" not "500000000000000000 wei". Coinbase AgentKit already accepts human-readable input. `humanAmount` lets agents skip unit conversion entirely while keeping smallest-unit as the canonical format. Explicit separate parameter avoids the ambiguity of overloading `amount` | Med | Token registry for decimals lookup (TOKEN_TRANSFER), chain config for native decimals (TRANSFER), `parseAmount()` utility | XOR validation with `amount` (Zod `.refine()`). Naming convention: `humanAmount`, `humanSellAmount`, `humanFromAmount`, `humanAmountIn`. Not applied to CLOB exchanges (already human-readable) |
| **Backward-compatible migration with decimal detection** | 4 providers changing from human-readable to smallest-unit. Agents using old format (`"1.5"`) get auto-conversion + deprecation warning instead of silent miscalculation or hard break. Conservative approach: only decimal-point presence triggers migration (no size heuristics) | Med | `migrateAmount()` helper shared across 4 providers; deprecation logging | Time-bounded (2 minor versions). Size-based heuristic (`>= 10^decimals`) rejected -- USDC decimals=6 makes `"1000000"` ambiguous (1 USDC smallest vs 1M USDC human) |
| **Dynamic MCP schema from provider metadata** | Adding a new Action Provider auto-registers MCP tools with full typed schemas -- zero MCP-side code changes needed. Competing SDKs require manual tool registration per action | Med-High | `GET /v1/actions/providers` extended with `inputSchema` JSON; MCP tool registration refactored from `z.record(z.unknown())` to per-action Zod schemas via `jsonSchemaToZod` or direct Zod object reference | `zodToJsonSchema()` for REST metadata API, then `jsonSchemaToZod()` for MCP consumption. Or shortcut: same-process direct Zod reference. Fallback to generic schema on conversion failure |
| **`balanceFormatted` in balance response** | Balance API already returns `balance` + `decimals` but agents must still manually format. Adding `balanceFormatted` completes the DX pattern | Low | Existing balance route, `formatAmount()` utility | Trivial addition, high DX value |
| **Skill file amount unit guide** | AI agents read skill files for API usage context. Dedicated section explaining unit rules, `humanAmount` examples, and per-provider exceptions gives agents pre-call knowledge | Low | Existing skill files (transactions, actions, wallet, quickstart) | Text-only change, but uniquely impactful for AI-native product |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Automatic unit inference from value magnitude** | `"100"` could be 100 wei (dust) or 100 ETH ($200K+). Size-based heuristic (`>= 10^decimals`) fails for low-decimal tokens (USDC=6: `"1000000"` = 1 USDC or 1M USDC?). Misjudgment = direct fund loss | Use explicit `humanAmount` parameter for human-readable input. Integer strings are always smallest-unit. Only decimal-point presence safely indicates human-readable |
| **USD conversion in all responses** | Depends on price oracle availability, adds latency, unreliable for illiquid tokens. Conflates amount representation with valuation | Keep existing `amountUsd` field from price oracle integration (v1.5). `amountFormatted` shows token-denominated value only |
| **Overloading `amount` field to accept both formats** | `"100"` becomes permanently ambiguous. No safe detection possible for integer values. Breaks Zod schema precision | Separate `humanAmount` parameter with XOR validation. Clear intent, zero ambiguity |
| **CLI interactive unit selector** | CLI is not in scope for this milestone. Agent-facing API is the priority | SDK `humanAmount` option covers programmatic use |
| **Permanent backward-compatible auto-conversion** | Maintaining heuristic code forever adds complexity and edge-case risk. Migration is a transition tool, not a feature | Deprecation window (2 minor versions), then remove with breaking change notice |
| **`humanAmount` for CLOB exchange providers** | Hyperliquid, Drift, Polymarket already use human-readable exchange-native units. Adding `humanAmount` creates meaningless double indirection (human -> human) | Document CLOB exception clearly in schema descriptions |

## Feature Dependencies

```
Schema descriptions (R1-4) --- independent, do first
       |
       +-- MCP typed schema (R2) --- depends on provider inputSchema exposure
       |       |
       |       +-- MCP humanAmount in schema (R4-7) --- depends on R2 + R4
       |
       +-- Provider unit migration (R1-1..R1-3) --- depends on migrateAmount() helper
       |       |
       |       +-- humanAmount for providers (R4-6) --- depends on R1 completion
       |
       +-- amountFormatted response (R3) --- depends on token registry + formatAmount()
       |       |
       |       +-- balanceFormatted (R3-5) --- trivial addition after R3 pattern
       |
       +-- humanAmount core (R4-1..R4-5) --- depends on parseAmount() + token registry
               |
               +-- SDK + Skill files (R5) --- depends on R3 + R4 completion
```

## MVP Recommendation

### Phase 1: Schema Hardening (cheapest, highest impact)
1. **Schema descriptions with unit examples** (R1-4) -- All 14 providers, zero behavior change
2. **CLOB exception documentation** (D6, D7) -- Hyperliquid/Drift/Polymarket schema descriptions
3. **Built-in MCP tool description updates** (R2-5) -- send-token, transfer-nft etc.

### Phase 2: Provider Unit Standardization + Responses
4. **Provider unit migration** (R1-1..R1-3) -- 4 providers to smallest-unit + `migrateAmount()` backward compat
5. **`amountFormatted` + `decimals` + `symbol` in responses** (R3) -- Transaction + Action + Balance responses
6. **MCP typed schema** (R2) -- Provider metadata API `inputSchema` + MCP dynamic registration

### Phase 3: humanAmount + SDK/Skill Sync
7. **`humanAmount` core** (R4-1..R4-5) -- REST API TRANSFER/TOKEN_TRANSFER/APPROVE
8. **`humanAmount` for Action Providers** (R4-6) -- 10 smallest-unit providers
9. **SDK + Skill file sync** (R5) -- humanAmount options, unit guide sections

**Defer:**
- `migrateAmount()` removal (R1-3 deprecation end) -- separate milestone after v31.17, breaking change
- MCP `outputSchema` adoption -- MCP spec supports it but not critical for this milestone

## Sources

- [MCP Spec 2025-11-25 Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) -- inputSchema is JSON Schema, outputSchema supported (HIGH confidence)
- [Coinbase AgentKit wallet schemas](https://github.com/coinbase/agentkit/blob/main/typescript/agentkit/src/action-providers/wallet/schemas.ts) -- uses human-readable amounts "1 ETH" (MEDIUM confidence, verified via raw GitHub)
- [Alchemy Transfers API](https://www.alchemy.com/docs/reference/transfers-api-quickstart) -- returns `value` (decimal-converted), `asset` (symbol), `decimal` fields (MEDIUM confidence)
- [viem parseUnits/formatUnits](https://viem.sh/docs/ethers-migration.html) -- standard BigInt-based unit conversion pattern (HIGH confidence)
- [ethers.js Display Logic](https://docs.ethers.org/v5/api/utils/display-logic/) -- parseUnits/formatUnits as canonical amount handling (HIGH confidence)
- Internal: Issue #168 (Admin raw amount display), Issue #165 (notification raw amount) -- confirm real user pain (HIGH confidence)
- Internal: `packages/actions/src/common/amount-parser.ts`, `packages/core/src/utils/format-amount.ts` -- existing utilities (HIGH confidence)
- Internal: `packages/mcp/src/tools/action-provider.ts:84` -- current `z.record(z.unknown())` generic schema (HIGH confidence)
