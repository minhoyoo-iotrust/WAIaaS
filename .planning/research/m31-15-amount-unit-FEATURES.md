# Feature Landscape: Amount Unit Standardization & AI Agent DX

**Domain:** AI Agent Wallet DX -- Amount handling
**Researched:** 2026-03-14

## Table Stakes

Features users (AI agents) expect. Missing = agents will make unit errors.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Consistent amount units across all providers | Agents cannot memorize per-provider unit rules | Med | R1: 4 providers need migration, 6 already correct |
| Schema descriptions with unit info | Agents need to know units BEFORE calling API | Low | R1-4: `.describe()` annotations on Zod schemas |
| amountFormatted in responses | Agents cannot interpret raw wei/lamports | Low | R3: Pure runtime computation, no DB change |
| humanAmount alternative parameter | Agents should not need to do unit conversion | Med | R4: XOR validation + parseAmount() |
| MCP typed schemas | Current `z.record(z.unknown())` gives agents zero guidance | Med | R2: JSON Schema in metadata + typed MCP tools |

## Differentiators

Features that set WAIaaS apart from other wallet services.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Backward-compatible migration (migrateAmount) | Zero breaking changes for existing integrations | Low | R1-3: Decimal point detection only |
| Per-action JSON Schema in metadata API | Enables future tooling (auto-form, validation) | Low | R2-1: zodToJsonSchema at endpoint level |
| CLOB exchange explicit exceptions (D6/D7) | Honest about domain-specific semantics | Low | Hyperliquid/Drift/Polymarket keep human-readable |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Size-based heuristic detection (`value >= 10^decimals`) | USDC decimals=6 makes `"1000000"` ambiguous -- wrong guess = fund loss | Use explicit `humanAmount` parameter |
| Automatic USD conversion in responses | Price oracle dependency, stale prices, scope creep | Existing `amountUsd` in certain responses is sufficient |
| Permanent backward compat (auto decimal conversion) | Creates long-term ambiguity | Deprecation period (v31.15-v31.17), then remove |
| `json-schema-to-zod` npm package | 200KB for 6 JSON Schema types | 50-line manual mapper |

## Feature Dependencies

```
R1 (unit standardization) --> R1-3 (migrateAmount backward compat)
R1 (unit standardization) --> R3 (amountFormatted needs all providers on smallest unit)
R2-1 (metadata API inputSchema) --> R2-2 (MCP typed schema consumes metadata)
R4 (humanAmount) --> R1 (must be on smallest unit first to add humanAmount alternative)
R3 (amountFormatted) --> Token registry + chain config (already exist)
R5 (SDK/skill sync) --> R4 (humanAmount API must be defined first)
```

## MVP Recommendation

Prioritize:
1. **R1 (unit standardization)** -- Foundation, must be first
2. **R2 (MCP typed schema)** -- Highest DX impact for AI agents
3. **R4 (humanAmount)** -- Eliminates unit conversion burden entirely
4. **R3 (amountFormatted)** -- Response enrichment, low effort

Defer: R5 (SDK/skill sync) to last phase -- it depends on all API changes being finalized.
