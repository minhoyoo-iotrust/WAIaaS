# Research Summary: Amount Unit Standardization & AI Agent DX

**Domain:** AI Agent Wallet DX -- Amount handling
**Researched:** 2026-03-14
**Overall confidence:** HIGH

## Executive Summary

This milestone requires **zero new npm packages**. The only stack action is making `zod-to-json-schema@3.25.1` an explicit direct dependency of `@waiaas/daemon` -- it is already installed as a transitive dependency of `@modelcontextprotocol/sdk@1.26.0`. All other capabilities (amount parsing, formatting, Zod XOR validation, token registry lookup) exist in the current codebase.

The MCP SDK already handles Zod-to-JSON-Schema conversion internally via `toJsonSchemaCompat()`. For the metadata API (R2-1), use the same `zod-to-json-schema` library directly. For MCP tool registration (R2-2), a 50-line manual JSON-Schema-to-Zod mapper covering 6 types is sufficient -- the `json-schema-to-zod` npm package is unnecessary for this scope.

The `humanAmount` XOR validation pattern uses Zod `.refine()`, an established pattern already present in `GasConditionSchema`. The `migrateAmount()` helper for backward compatibility is a pure utility function (~15 lines) requiring no external dependencies. Response enrichment (`amountFormatted`) is a composition of existing `formatAmount()` + token registry/chain config lookups, computed at runtime with no DB migration.

## Key Findings

**Stack:** No new dependencies. `zod-to-json-schema` promoted from transitive to direct dependency.
**Architecture:** humanAmount resolved pre-pipeline; amountFormatted computed at response time; no DB migration.
**Critical pitfall:** `max` keyword regression in Aave/Kamino repay/withdraw after unit migration.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Foundation utilities** - migrateAmount helper, amountFormatted enricher, schema descriptions
   - Addresses: R1-3 backward compat, R1-4 descriptions, R3 response enrichment
   - Avoids: Touching provider logic before utilities are ready

2. **Provider unit conversion** - 4 provider migrations + humanAmount on 10 non-CLOB providers
   - Addresses: R1-1, R1-2, R4-6
   - Avoids: Size-based heuristic pitfall (Pitfall in PITFALLS.md)

3. **REST API integration** - humanAmount in request schemas, amountFormatted in responses, metadata API inputSchema
   - Addresses: R2-1, R3, R4-1 through R4-5
   - Avoids: Modifying pipeline internals (anti-pattern)

4. **MCP typed schema** - JSON Schema -> Zod converter, typed tool registration
   - Addresses: R2-2 through R2-5
   - Avoids: Dual schema maintenance (anti-pattern)

5. **SDK + Skill files** - humanAmount option, unit guide documentation
   - Addresses: R5-1 through R5-4
   - Avoids: Premature documentation before API is finalized

6. **Tests** - Unit, integration, E2E
   - Addresses: R6-1 through R6-8

**Phase ordering rationale:**
- Phase 1 creates shared utilities with zero risk, enabling all subsequent phases
- Phase 2 is the highest-risk change (provider logic), should be done early
- Phase 3 must precede Phase 4 (MCP consumes metadata API)
- Phases 4 and 5 can run in parallel (both depend only on Phase 3)

**Research flags for phases:**
- Phase 2: `max` keyword regression risk (aave/kamino) -- needs careful testing
- Phase 4: JSON Schema -> Zod mapper scope depends on actual schema complexity across 14 providers

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified all dependencies in lockfile and node_modules |
| Features | HIGH | Requirements clearly defined in objective doc |
| Architecture | HIGH | All integration points verified by reading source files |
| Pitfalls | HIGH | Derived from codebase analysis, not just training data |

## Gaps to Address

- Survey all 14 provider inputSchema types to finalize MCP schema mapper coverage (Phase 4 prep)
- Verify `@hono/zod-openapi` renders `.refine()` XOR constraint in generated OpenAPI spec (Phase 3 testing)
- Determine deprecation warning deduplication strategy (per-call vs per-process vs per-provider)
