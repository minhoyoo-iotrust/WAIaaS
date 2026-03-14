# Project Research Summary

**Project:** WAIaaS — Amount Unit Standardization & AI Agent DX
**Domain:** Blockchain wallet API DX improvement — unit consistency, typed MCP schemas, humanAmount parameter
**Researched:** 2026-03-14
**Confidence:** HIGH

## Executive Summary

This milestone improves AI agent developer experience by standardizing amount units across 14 DeFi action providers and enhancing MCP tool schema expressiveness. The core problem is that 4 providers (Aave V3, Kamino, Lido, Jito) currently accept human-readable inputs ("1.5 ETH") while 10 providers already require smallest-unit inputs (wei/lamports), forcing agents to memorize per-provider conventions. The solution is smallest-unit as canonical across all providers, with a safe backward-compatibility migration path and a new optional `humanAmount` parameter for human-readable convenience. CLOB exchange providers (Hyperliquid, Drift, Polymarket) are explicitly exempt as they use exchange-native units which are already human-readable.

The recommended implementation sequence is: schema description hardening first (zero behavior change, immediate DX gain), then provider unit migration with `migrateAmount()` backward compatibility, then typed MCP schemas using direct Zod reference (same-process, avoids lossy JSON Schema roundtrip), then `humanAmount` parameter across 10 smallest-unit providers, then `amountFormatted`/`decimals`/`symbol` in responses, and finally SDK/skill file sync. No new npm dependencies are required — the existing Zod 3.x, viem 2.x, and existing utilities (`parseTokenAmount`, `formatAmount`) handle all needs.

The highest risk in this milestone is the backward-compatibility migration for the 4 providers. Each provider currently hardcodes token decimals in `parseTokenAmount()` calls (Aave=18, Kamino=6, Lido=18, Jito=9). The `migrateAmount()` helper that detects human-readable inputs MUST receive the actual token decimals per-call — if it inherits hardcoded values, a USDC supply using deprecated format `"1.5"` would compute 10^12x too large. All 5 critical pitfalls and 10 moderate pitfalls are well-identified with specific prevention strategies, giving this milestone high implementability confidence.

## Key Findings

### Recommended Stack

No new npm dependencies are required for this milestone. All needed capabilities exist in the current stack. The existing `packages/actions/src/common/amount-parser.ts` provides `parseTokenAmount()` and a `parseAmount()` utility. The existing `packages/core/src/utils/format-amount.ts` provides `formatAmount()`. The `zod-to-json-schema` package would only be needed for JSON Schema roundtrip — this approach is rejected in favor of direct Zod reference since MCP runs in the same process as the daemon. See `.planning/research/STACK.md` for the full no-new-dependency analysis.

**Core technologies (all existing):**
- **Zod 3.x**: Schema validation and XOR `amount`/`humanAmount` constraint via `.superRefine()` — already installed, project SSoT
- **viem `parseUnits`/`formatUnits`**: Canonical BigInt unit conversion for EVM tokens — already used throughout
- **Existing `formatAmount()` utility**: Must be the single function used by both `amountFormatted` and `balanceFormatted` to ensure output consistency
- **Existing `parseTokenAmount()`**: Must be eliminated from the 4 migrating provider forward paths after migration; replaced by direct bigint passthrough

### Expected Features

See `.planning/research/FEATURES.md` for the complete feature table with complexity ratings and dependency graph.

**Must have (table stakes):**
- Consistent smallest-unit inputs across all 14 non-CLOB providers — agents currently memorize per-provider conventions
- `amountFormatted` + `decimals` + `symbol` in transaction responses — agents currently must do their own decimals lookup + BigInt division after every call
- Typed MCP parameter schemas — current `z.record(z.unknown())` gives AI models zero type/unit information; MCP spec defines `inputSchema` as JSON Schema by design
- Schema descriptions with explicit unit examples on all amount fields — cheapest change with highest agent DX impact

**Should have (differentiators):**
- `humanAmount` alternative parameter across 10 smallest-unit providers — agents naturally express "0.5 ETH" not 500000000000000000n
- `balanceFormatted` in balance responses — follows the `amountFormatted` pattern, trivial to add after amountFormatted is in place
- `unitConvention` metadata field in ActionDefinition (`'smallest' | 'human-readable' | 'exchange-native'`) — allows agents to programmatically discover CLOB exceptions
- Skill file amount unit guide — AI-native product should have dedicated unit convention documentation

**Defer (v2+):**
- `migrateAmount()` removal after deprecation window — separate breaking-change milestone, not this milestone
- MCP `outputSchema` adoption — MCP spec supports it but not critical for agent input DX
- CLI interactive unit selector — CLI is not in scope; agent-facing API is the priority

### Architecture Approach

See `.planning/research/ARCHITECTURE.md` for the full component boundary and data flow analysis (based on the External Action Framework research, which shares the same provider/pipeline architecture as this milestone).

This milestone is a DX/interface enhancement layered on top of the existing pipeline, not a structural change. The 6-stage pipeline, ActionProviderRegistry, and transaction data model remain unchanged. Changes are confined to: (1) provider input schema definitions and amount parsing logic, (2) `migrateAmount()` helper shared across 4 providers, (3) `amountFormatted` computed on transaction responses using the token registry, (4) MCP tool registration in `action-provider.ts` using direct Zod object references, and (5) XOR validation refinement shared from `@waiaas/core`. No DB migration is required.

**Major components affected:**
1. **`@waiaas/actions` provider schemas (14 providers)** — Amount field descriptions with explicit unit examples; 4 providers migrate input semantics with `migrateAmount()` backward compat
2. **`@waiaas/core` shared validation** — New `amountXorRefinement` exported Zod refinement for `amount`/`humanAmount` XOR; enforced at every entry point
3. **`@waiaas/daemon` transaction response** — `amountFormatted`, `decimals`, `symbol` computed from token registry at response time; no DB migration needed
4. **`@waiaas/mcp` tool registration** — `action-provider.ts` changes from `z.record(z.unknown())` to per-action Zod schema via direct `ActionDefinition.inputSchema` reference
5. **`@waiaas/sdk` + skill files** — `humanAmount` option added to relevant method signatures (discriminated union); unit guide section added to 4 skill files

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for all 15 pitfalls with code evidence, prevention strategies, and detection tests.

1. **Hardcoded decimals in migrateAmount backward-compat path** — `migrateAmount()` MUST accept `decimals` as a parameter, resolved per-call (native from chain config, registered from token registry). The 4 providers currently hardcode 18/6/18/9 in `parseTokenAmount()` calls. These MUST NOT carry over. Failure = 10^12x amount overcharge for multi-decimal assets (e.g., USDC on Aave).

2. **Silent near-zero transactions from integer inputs post-migration** — Callers who previously sent `"100"` meaning "100 USDC" will silently send 100 micro-USDC. `amountFormatted` in responses is the primary safeguard. Add suspicious-amount warnings when computed human-readable value is below a configurable threshold.

3. **`max` keyword must survive all three code paths** — Aave repay/withdraw and Kamino repay/withdraw support `amount="max"`. The `migrateAmount()` helper must check `=== 'max'` before any numeric/decimal processing. `humanAmount="max"` must also be supported. XOR validation must account for "max" in both fields.

4. **XOR amount/humanAmount validation must be enforced at every entry point** — REST API, MCP, SDK, Admin UI all reach the pipeline. A shared `.superRefine()` in `@waiaas/core` is the correct pattern. MCP benefits from direct Zod reference (same process) to automatically inherit this refinement without a lossy JSON Schema roundtrip.

5. **MCP Zod -> JSON Schema roundtrip is lossy** — `.superRefine()`, `.refine()`, `.transform()` do not survive `zodToJsonSchema()`. Since MCP runs in the same process as the daemon, direct Zod object reference is the correct approach. This eliminates the lossy conversion entirely and removes the need for `zod-to-json-schema` package.

## Implications for Roadmap

Based on combined research, 5 phases are recommended in strict dependency order:

### Phase 1: Schema Hardening (descriptions + CLOB documentation)

**Rationale:** Zero behavior change, zero test updates needed, immediately improves agent DX across all 14 providers. Cheapest highest-value change. Must come first so subsequent phases build on correctly described schemas. Sets the naming and description conventions that Phases 2-4 will follow.
**Delivers:** All 14 provider amount fields with explicit unit descriptions and examples; CLOB exception documentation in schema descriptions with `[EXCHANGE-NATIVE UNITS]` prefix; MCP built-in tool description updates (send-token, transfer-nft, etc.); `unitConvention` metadata field in ActionDefinition
**Addresses:** Table stakes "schema descriptions with unit examples" feature; Differentiator "unitConvention metadata"
**Avoids:** Pitfall 9 (CLOB exception agent confusion — metadata field introduced here)

### Phase 2: Provider Unit Migration (4 providers + migrateAmount helper)

**Rationale:** Most critical correctness work. Must happen before humanAmount (which depends on stable smallest-unit semantics) and before amountFormatted (which interprets amount as smallest unit to format). The `migrateAmount(value, decimals)` helper created here is the shared backward-compatibility foundation for all 4 providers.
**Delivers:** Aave V3, Kamino, Lido, Jito migrated to smallest-unit input with `migrateAmount()` backward compat and deprecation warnings; existing tests updated to use smallest-unit format; dedicated backward-compat tests; HF simulation arithmetic corrected for actual token decimals
**Uses:** Token registry for decimal lookup, chain config for native token decimals
**Avoids:** Pitfall 1 (hardcoded decimals), Pitfall 2 (silent near-zero), Pitfall 3 (max keyword), Pitfall 6 (HF simulation arithmetic), Pitfall 11 (test false confidence), Pitfall 14 (deprecation log flood)

### Phase 3: Typed MCP Schemas + amountFormatted Responses

**Rationale:** Both depend on Phase 2 completion. MCP schemas need correct amount field types (smallest-unit semantics). `amountFormatted` needs amount to be in smallest units to format correctly. Grouped because both rely on the same token registry lookup infrastructure.
**Delivers:** MCP tool schemas using direct Zod object reference from `ActionDefinition.inputSchema`; `amountFormatted`, `decimals`, `symbol` in transaction and action responses; `balanceFormatted` in balance responses; null handling contract with actionable schema descriptions
**Uses:** Existing `formatAmount()` utility as the single formatter for both amountFormatted and balanceFormatted
**Avoids:** Pitfall 5 (lossy roundtrip — direct reference), Pitfall 8 (amountFormatted null safety), Pitfall 12 (zodToJsonSchema version issues — avoided entirely), Pitfall 15 (balanceFormatted consistency)

### Phase 4: humanAmount Parameter

**Rationale:** Depends on Phase 2 (smallest-unit semantics must be stable) and Phase 3 (token registry lookup pattern established). The naming decision — universal `humanAmount` vs per-provider naming like `humanSellAmount`, `humanFromAmount` — MUST be made as an explicit kick-off decision before any code is written to avoid mid-phase refactoring.
**Delivers:** `humanAmount` optional parameter across 10 smallest-unit providers; shared `@waiaas/core` XOR Zod refinement (`amount` XOR `humanAmount`); enforcement at REST API, MCP, and SDK entry points; actionable error messages when token registry missing for humanAmount conversion
**Implements:** Shared Zod XOR refinement in `@waiaas/core`; per-provider `humanAmount` Zod schema addition
**Avoids:** Pitfall 4 (XOR validation gaps), Pitfall 7 (field name proliferation — naming convention decided upfront), Pitfall 10 (token registry dependency — actionable errors)

### Phase 5: SDK + Skill File Sync

**Rationale:** Depends on all prior phases. Interface documentation must reflect the final stable API surface. Cheapest to do last when all behaviors are locked. Skill file and SDK changes are text/type work with no functional dependencies on each other.
**Delivers:** SDK `humanAmount` option in TypeScript method signatures (discriminated union `{ amount: string; humanAmount?: never } | { amount?: never; humanAmount: string }`); unit guide sections in transactions.skill.md, actions.skill.md, wallet.skill.md, quickstart.skill.md; CHANGELOG migration guide with before/after examples; JSDoc code examples for both amount patterns
**Avoids:** Pitfall 13 (SDK type complexity — discriminated union with JSDoc)

### Phase Ordering Rationale

- Phase 1 before all others: zero-risk, immediate value, establishes schema conventions all later phases follow
- Phase 2 before Phase 4: `humanAmount` depends on stable smallest-unit semantics; backward compat must be correct first
- Phase 2 before Phase 3: `amountFormatted` interprets amount as smallest unit — if providers still accept human-readable, formatting would be wrong scale
- Phases 3 and 4 can partially overlap in implementation but Phase 3's token registry pattern should be established first
- Phase 5 always last: interface documentation reflects the complete, stable final behavior

### Research Flags

Phases with standard patterns (no additional research needed):
- **Phase 1:** Pure schema text changes, zero risk, well-understood Zod `.describe()` pattern; CLOB providers already identified
- **Phase 5:** SDK discriminated union and skill file updates follow established project patterns (see v31.12 External Action skill file updates)

Phases needing careful validation during implementation:
- **Phase 2:** `migrateAmount()` decimal lookup for multi-asset providers. Aave V3 supports ~20 assets per network. Token registry coverage for all Aave-supported assets on each chain must be verified during implementation. If coverage is incomplete, an on-chain fallback (`decimals()` ERC-20 call) may be needed.
- **Phase 3:** Token registry coverage determines `amountFormatted` null rate. If many tokens lack registry entries, `amountFormatted` will return null frequently, limiting DX improvement. Assess coverage before implementation.
- **Phase 4:** `humanAmount` naming decision (Pitfall 7) — "universal `humanAmount`" vs "per-provider naming like `humanSellAmount`" — must be an explicit written decision before coding begins.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All capabilities in existing dependencies; verified by direct codebase inspection of utility functions and provider files |
| Features | HIGH | Feature dependency graph is clear; CLOB exception scope is well-defined (3 providers); MCP spec inputSchema behavior is stable |
| Architecture | HIGH | Based on direct codebase analysis; integration points identified with specific file paths (aave-v3/index.ts lines 161/193/220/252, kamino/index.ts line 191, mcp/action-provider.ts line 84) |
| Pitfalls | HIGH | All 5 critical pitfalls identified with concrete code evidence and specific line references; prevention strategies are testable |

**Overall confidence:** HIGH

### Gaps to Address

- **Token registry coverage for Aave V3 assets**: Aave V3 supports ~20 assets per network. If the WAIaaS token registry only covers common tokens (ETH, USDC, WBTC), `migrateAmount()` will fail to determine decimals for less common assets. Resolution during Phase 2: enumerate all Aave-supported assets, verify registry coverage, add missing entries or implement on-chain fallback (`decimals()` ERC-20 call).

- **humanAmount field name convention**: Pitfall 7 identifies 6+ distinct field names across providers (`humanAmount`, `humanSellAmount`, `humanFromAmount`, `humanAmountIn`). The recommendation is universal `humanAmount` for simplicity, but this is a design decision that must be locked before Phase 4 starts.

- **Suspicious amount threshold and price oracle availability**: Pitfall 2 recommends a configurable `SUSPICIOUS_AMOUNT_THRESHOLD` for near-zero transaction warnings. This requires price oracle integration (available via v1.5 DeFi Price Oracle). Confirm the price oracle can compute USD value for all 14 provider tokens at request time, including tokens not in the DeFi Price Oracle's supported list.

## Sources

### Primary (HIGH confidence)
- Codebase: `packages/actions/src/providers/aave-v3/index.ts` — hardcoded decimals=18 at lines 161, 193, 220, 252
- Codebase: `packages/actions/src/providers/kamino/index.ts` — hardcoded decimals=6 at lines 165, 187, 214, 236; HF simulation `Number(amount) / 1e6` at line 191
- Codebase: `packages/actions/src/providers/lido-staking/index.ts` — hardcoded decimals=18 at lines 116, 135
- Codebase: `packages/actions/src/providers/jito-staking/jito-stake-pool.ts` — hardcoded decimals=9 at line 400
- Codebase: `packages/actions/src/common/amount-parser.ts` — parseTokenAmount utility
- Codebase: `packages/core/src/utils/format-amount.ts` — formatAmount/parseAmount utilities
- Codebase: `packages/mcp/src/tools/action-provider.ts` line 84 — `z.record(z.unknown())` current state
- Milestone objective: `internal/objectives/m31-15-amount-unit-standardization.md` — D1-D7 decisions, R1-R6 requirements
- [MCP Spec 2025-11-25 Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — inputSchema is JSON Schema, outputSchema supported
- [viem parseUnits/formatUnits](https://viem.sh/docs/ethers-migration.html) — standard BigInt unit conversion pattern

### Secondary (MEDIUM confidence)
- [Coinbase AgentKit wallet schemas](https://github.com/coinbase/agentkit/blob/main/typescript/agentkit/src/action-providers/wallet/schemas.ts) — uses human-readable "1 ETH" convention (industry comparison for humanAmount pattern)
- [Alchemy Transfers API](https://www.alchemy.com/docs/reference/transfers-api-quickstart) — returns `value` (decimal-converted), `asset` (symbol), `decimal` fields (industry comparison for amountFormatted/decimals/symbol pattern)
- [ethers.js Display Logic](https://docs.ethers.org/v5/api/utils/display-logic/) — parseUnits/formatUnits as canonical amount handling
- Internal: Issue #168 (Admin raw amount display), Issue #165 (notification raw amount) — real user pain point confirmation

### Tertiary (LOW confidence)
- Zod-to-JSON-Schema lossy conversion: documented limitation in zod-to-json-schema README — supports the direct-reference recommendation but specific edge cases may vary by library version

---
*Research completed: 2026-03-14*
*Ready for roadmap: yes*
