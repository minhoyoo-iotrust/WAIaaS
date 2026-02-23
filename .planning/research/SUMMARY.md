# Project Research Summary

**Project:** WAIaaS Jupiter Swap Action Provider (m28-01)
**Domain:** Solana DEX Token Swap via Jupiter Aggregator — IActionProvider Implementation
**Researched:** 2026-02-23
**Confidence:** HIGH

## Executive Summary

Jupiter Swap Action Provider (m28-01) is the first built-in Action Provider in the WAIaaS DeFi expansion. The implementation integrates Jupiter Aggregator's REST API into the existing IActionProvider framework, converting Jupiter swap instructions into ContractCallRequest objects that flow through the established 6-stage pipeline. The approach requires no new npm dependencies — two Jupiter REST endpoints (`/swap/v1/quote` and `/swap/v1/swap-instructions`) are consumed via native Node.js `fetch()` with Zod response validation for runtime API drift detection. A new `@waiaas/actions` monorepo package isolates built-in providers from daemon internals and establishes the container for all future built-in Action Providers.

The recommended approach is a 2-phase build: Phase 246 implements the core provider (JupiterApiClient + JupiterSwapActionProvider + unit tests with msw mocks), and Phase 247 wires the daemon integration (built-in registration, config parsing, policy integration, MCP verification, skill file update). This sequencing minimizes risk because the provider logic is fully testable in isolation before touching daemon startup code. The critical architectural constraint is using `/swap-instructions` rather than `/swap` — the latter returns a serialized transaction that is incompatible with the resolve-then-execute pattern and cannot be mapped to ContractCallRequest.

The top risks are: (1) using the wrong Jupiter endpoint (`/swap` vs `/swap-instructions`), which is a critical design violation already guarded by design doc 63; (2) compute budget instructions from Jupiter's response must be included alongside the swap instruction or transactions fail on complex multi-hop routes; (3) the ContractCallRequest `accounts[]` field name must be verified against the actual schema before implementation to avoid a silent Zod validation mismatch. All three risks are fully addressed by the existing design decisions and the Zod-first validation strategy.

## Key Findings

### Recommended Stack

The implementation leverages entirely existing infrastructure with zero new npm dependencies. Jupiter integration is handled via native `fetch()` (Node.js 22 built-in), `AbortSignal.timeout(10_000)`, and Zod response schemas. The only new artifact is the `packages/actions/` package that houses built-in providers, with `@waiaas/core` and `zod` as peer dependencies only.

**Core technologies:**
- `@waiaas/core` (IActionProvider, ContractCallRequest types) — unchanged interface; JupiterSwapActionProvider implements resolve()
- `@waiaas/daemon` (ActionProviderRegistry, 6-stage pipeline) — unchanged; built-in registration added to Step 4f of daemon startup
- Jupiter API v1 (native fetch, no SDK) — `/swap/v1/quote` + `/swap/v1/swap-instructions` only; SDK adds unnecessary bundle bloat for 2 endpoints
- Jito MEV protection (via Jupiter parameter) — `jitoTipLamports` in swap-instructions request; Jupiter handles Jito block engine internally; no direct Jito SDK needed
- Zod 3.x (runtime response validation) — API drift detection; critical for long-term maintainability as Jupiter API evolves
- `@solana/kit` 6.x (unchanged) — handles signing and transaction submission downstream in the pipeline

**What not to add:**
- `@jup-ag/api` (Jupiter SDK) — unnecessary; 2 endpoints via native fetch is sufficient
- `jito-ts` — Jupiter API abstracts Jito; direct Jito SDK would add coupling without benefit
- Any Raydium/Orca/individual DEX SDK — Jupiter aggregates 20+ DEXes; per-DEX SDKs defeat the purpose

### Expected Features

**Must have (table stakes):**
- Quote API call with Zod-validated response — foundation of all swap flows; catches API drift early
- `/swap-instructions` call and ContractCallRequest conversion — core resolve() output; must use this endpoint not `/swap`
- Slippage protection (default 50bps, max 500bps, schema-enforced) — user expects safe defaults; upper bound prevents runaway slippage
- Price impact validation (reject > 1%) — prevents catastrophic loss on illiquid routes; PRICE_IMPACT_TOO_HIGH error
- MCP tool auto-exposure (`mcpExpose=true`) — AI agents need tool access without manual wiring
- SDK `executeAction('jupiter_swap', params)` support — SDK users expect consistent interface across all actions
- `[actions.jupiter_swap]` config.toml section — all parameters overridable at deploy time without code changes

**Should have (differentiators):**
- Jito MEV protection (tip lamports via Jupiter parameter) — prevents frontrunning and sandwich attacks; low cost (~$0.0002/swap)
- `programId` verification against known Jupiter program address — MITM defense; prevents spoofed swap instructions
- `restrictIntermediateTokens=true` — prevents routing through manipulated or low-liquidity tokens
- `inputMint === outputMint` pre-validation — eliminates nonsense swap requests before hitting the API
- CONTRACT_WHITELIST integration — consistent with WAIaaS default-deny policy; Jupiter program must be whitelisted
- SPENDING_LIMIT USD conversion — existing price oracle enables policy enforcement on swap input amount

**Defer to later milestones:**
- DCA (Dollar Cost Averaging) — separate milestone scope with different API flow
- Limit Orders — separate milestone scope; requires background execution model
- Route visualization in Admin UI — Admin UI extension, out of m28-01 scope
- Multi-hop customization — Jupiter auto-optimizes; manual route control adds complexity without value

### Architecture Approach

The architecture follows strict layering: JupiterSwapActionProvider implements IActionProvider and emits ContractCallRequest, which passes unchanged into the existing 6-stage pipeline (policy → sign → submit → confirm). No pipeline modifications are needed. The new `packages/actions/` package has peer dependencies only — the daemon imports and registers it at startup. The JupiterApiClient is a thin fetch wrapper with Zod validation; the provider orchestrates a 6-step resolve flow (input validation → quote → quote validation → swap-instructions → ContractCallRequest mapping → defensive re-validation).

**Major components:**
1. `JupiterApiClient` — HTTP client for Jupiter REST API (native fetch + AbortSignal timeout + Zod response validation); handles optional `x-api-key` header for rate limit relaxation
2. `JupiterSwapActionProvider` — IActionProvider implementation; orchestrates 6-step resolve flow; produces ContractCallRequest containing programId, instructionData (Base64), and accounts
3. `packages/actions/` (new monorepo package) — container for all built-in Action Providers; peer deps on `@waiaas/core` and `zod`; no daemon knowledge
4. Daemon startup extension (Step 4f) — built-in provider registration before ESM plugin loading; config-driven enable/disable; ApiKeyStore for encrypted API key
5. Zod schemas (input + quote response + swap-instructions response) — SSoT for all Jupiter API types; enables API drift detection; validates both real and mocked responses

**Key patterns to follow:**
- Provider-first testability: provider is fully testable without daemon integration via msw HTTP mocks
- Defensive re-validation: ContractCallRequestSchema.parse() at end of resolve() guards against malformed output
- Config-driven behavior: all numeric parameters (slippage, price impact, Jito tip, timeout) are config.toml overridable and SettingsService runtime-adjustable

### Critical Pitfalls

1. **/swap vs /swap-instructions endpoint choice (CRITICAL)** — `/swap` returns a serialized Base64 transaction with embedded feePayer and recentBlockhash, making ContractCallRequest mapping impossible. Must use `/swap-instructions`. Design doc 63 specifies this; enforce in code review.
2. **computeBudgetInstructions omission (MEDIUM, HIGH impact)** — Jupiter's response includes `computeBudgetInstructions` that set the CU limit and priority fee. Omitting them causes transaction failure on multi-hop routes that exceed Solana's default 200K CU limit. These must be included alongside swapInstruction in the transaction build. Resolution approach (batch vs additional fields vs adapter auto-detect) must be determined by reading `IChainAdapter.buildContractCall()` before implementation.
3. **ContractCallRequest accounts field name mismatch (HIGH)** — Design doc 63 references `accounts[].address` but the actual schema may use `accounts[].pubkey`. A mismatch causes Zod validation failure with no clear error message. Verify the exact field name in the live ContractCallRequestSchema before writing the mapping code.
4. **Jupiter API URL migration (HIGH)** — Legacy tutorials reference `quote-api.jup.ag/v6/quote`; correct URL is `api.jup.ag/swap/v1/quote`. Zod response validation catches wrong endpoint at runtime; `api_base_url` config allows correction without code changes.
5. **ATA setup instructions required (MEDIUM)** — If the wallet lacks an ATA for the output token, the swap fails. Jupiter's `setupInstructions` in the response handle ATA creation and must be prepended to the transaction before swapInstruction.

## Implications for Roadmap

The 2-phase structure from ARCHITECTURE.md is confirmed as optimal. Dependencies flow cleanly: Phase 246 produces a fully tested, standalone provider; Phase 247 wires it into the running system and validates end-to-end. All critical pitfalls land in Phase 246 where unit tests can catch them before any daemon interaction.

### Phase 246: Core Provider Implementation

**Rationale:** The provider is independently testable without daemon integration. Building and testing it in isolation catches the critical pitfalls (wrong endpoint, missing computeBudget, field name mismatches, ATA handling) before touching the daemon startup path. This is the higher-risk phase — all critical and medium pitfalls concentrate here and must be resolved before Phase 247.

**Delivers:** `packages/actions/` package structure, JupiterSwapConfig with defaults, JupiterSwapInputSchema (Zod), Jupiter API response Zod schemas (quote + swap-instructions), JupiterApiClient (fetch + AbortSignal + response validation), JupiterSwapActionProvider (6-step resolve flow), unit tests with msw mocks, schema validation tests, computeBudgetInstructions handling decision

**Addresses features:**
- Table stakes: Quote API, swap-instructions, ContractCallRequest conversion, slippage validation, price impact check, Zod response schemas
- Differentiators: Jito tip, programId verification, restrictIntermediateTokens, inputMint=outputMint guard

**Avoids pitfalls:**
- P2 (wrong endpoint) — code structure enforces `/swap-instructions`; no code path touches `/swap`
- P4 (compute budget) — `computeBudgetInstructions` included in transaction build after reading IChainAdapter
- P5 (ATA setup) — `setupInstructions` prepended before swapInstruction in build
- P7 (field name mismatch) — ContractCallRequestSchema read before writing mapping code; unit test verifies Zod parse succeeds
- P11 (mock quality) — Zod schemas validate mock fixtures match real API shape; msw intercepts HTTP

### Phase 247: Daemon Integration and DX

**Rationale:** Once the provider is tested in isolation, daemon wiring is low-risk configuration work. MCP auto-discovery and SDK support require no code changes to existing infrastructure — only verification and documentation are needed. Policy integration tests can only run in this phase because they require the full daemon context.

**Delivers:** Built-in provider registration in `daemon.ts` Step 4f, config.toml `[actions.jupiter_swap]` section parsing, SettingsService runtime-adjustable settings (slippage, price impact), ApiKeyStore integration for optional Jupiter API key, MCP tool verification (`action_jupiter_swap_jupiter_swap`), SDK end-to-end test (`executeAction('jupiter_swap', params)`), policy integration tests (CONTRACT_WHITELIST enforcement + SPENDING_LIMIT USD conversion on swap amount), `skills/transactions.skill.md` update with Jupiter Swap usage

**Uses:**
- `@waiaas/actions` package (from Phase 246)
- `ActionProviderRegistry.register()` (unchanged API)
- `SettingsService` (existing runtime settings infrastructure)
- `ApiKeyStore` (existing AES-256-GCM encrypted key storage)

**Implements:**
- Daemon Step 4f extension (built-in providers before ESM plugins)
- config.toml section loader extension (`[actions.jupiter_swap]`)
- Environment variable override (`WAIAAS_ACTIONS_JUPITER_SWAP_*`)

**Avoids pitfalls:**
- P8 (registration order) — built-in providers registered before ESM plugins; name conflict detected at registration time
- P9 (MCP tool name) — follow design doc as-is (`action_jupiter_swap_jupiter_swap`); functional even if slightly redundant
- P10 (config flat structure) — `[actions.jupiter_swap]` is standard TOML table; environment variables follow `WAIAAS_{SECTION}_{KEY}` pattern

### Phase Ordering Rationale

- Provider-first ordering reflects the dependency direction: `packages/actions/` has zero knowledge of `packages/daemon/`; daemon imports actions unidirectionally. Building the dependency first is the correct order.
- All critical pitfalls manifest in Phase 246 where they can be caught by unit tests before any daemon interaction. Phase 247 has only low-risk configuration wiring.
- The 2-phase split aligns with the natural testing boundary: Phase 246 tests with msw mocks at the HTTP layer; Phase 247 tests with the full daemon context and real policy engine.
- Config and policy integration land in Phase 247 because they require the running daemon context and follow well-established patterns from previous milestones.

### Research Flags

Phases needing deeper investigation during planning:

- **Phase 246 — computeBudgetInstructions transport (P4, open design question):** How `computeBudgetInstructions` from Jupiter's response travel through ContractCallRequest to the Solana adapter is not fully resolved. Three options exist: (1) include in a BATCH type alongside swapInstruction, (2) add explicit computeBudget fields to ContractCallRequest, (3) let the adapter auto-detect from instruction complexity. Read `IChainAdapter.buildContractCall()` and `SolanaAdapter` implementation at Phase 246 start to select the correct approach before writing any code.

Phases with standard patterns (skip research-phase):

- **Phase 247 (daemon integration):** Built-in provider registration follows a well-established pattern from the existing codebase (daemon Step 4 lifecycle, config loader, SettingsService). No novel patterns required; direct implementation appropriate.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies confirmed; native fetch + Zod is established WAIaaS pattern; Jupiter API v1 URL verified against official docs |
| Features | HIGH | Design doc 63 + Jupiter API docs + existing framework constraints define clear and bounded scope |
| Architecture | HIGH | Full 6-step resolve flow specified; only computeBudgetInstructions passing is an open decision requiring codebase read |
| Pitfalls | HIGH | All 12 pitfalls sourced from codebase analysis + design docs + Jupiter API docs; P4 and P7 are the live risks requiring pre-implementation verification |

**Overall confidence:** HIGH

### Gaps to Address

- **computeBudgetInstructions transport (P4) — open design decision:** How `computeBudgetInstructions` from Jupiter's response are included in the final Solana transaction is not specified in design doc 63. Read `IChainAdapter.buildContractCall()` and `SolanaAdapter` at the start of Phase 246 and make an explicit design decision before writing the ContractCallRequest mapping code. Document the decision in Phase 246 implementation.

- **ContractCallRequest accounts field name (P7) — 5-minute verification required:** `accounts[].pubkey` vs `accounts[].address` — read the actual `ContractCallRequestSchema` from `packages/core/src/schemas/transaction.schema.ts` before writing any mapping code. A mismatch produces a hard-to-debug Zod parse failure at runtime.

- **ApiKeyStore API for named keys — confirm before Phase 247:** Confirm the existing ApiKeyStore supports named key storage for `jupiter_swap` specifically. If it only supports a single key, a minor extension is needed before implementing the API key header injection in JupiterApiClient.

## Sources

### Primary (HIGH confidence)
- WAIaaS design document 63 (internal) — Full Jupiter Swap architecture, resolve flow, ContractCallRequest mapping, DEFI-01~05 safety rules, Jito MEV protection specification
- Jupiter API v1 official documentation — `/swap/v1/quote` and `/swap/v1/swap-instructions` endpoint specs, response schemas, `jitoTipLamports` parameter, URL migration from v6
- WAIaaS codebase — `packages/core` (IActionProvider interface, ContractCallRequest schema), `packages/daemon` (ActionProviderRegistry, 6-stage pipeline, daemon Step 4 lifecycle), `packages/mcp` (action-provider.ts auto-discovery)

### Secondary (MEDIUM confidence)
- Jito MEV protection via Jupiter abstraction — confirmed Jupiter handles Jito block engine submission internally when `jitoTipLamports` is provided; direct Jito SDK not required
- Solana compute budget behavior — multi-hop routes exceeding 200K CU limit is documented Solana behavior; Jupiter's `computeBudgetInstructions` is the standard mitigation provided by Jupiter API

### Tertiary (LOW confidence)
- Jupiter API URL migration (v6 → v1) — based on documented URL change and `api_base_url` config provides runtime correction capability; exact migration date not confirmed
- ATA creation via `setupInstructions` — standard Solana pattern; Jupiter handling confirmed in API docs but not verified against live response shape in test environment before implementation

---
*Research completed: 2026-02-23*
*Ready for roadmap: yes*
