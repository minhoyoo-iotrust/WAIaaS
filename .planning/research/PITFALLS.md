# Domain Pitfalls: Jupiter Swap Action Provider (m28-01)

**Domain:** Adding Jupiter Swap to existing WAIaaS wallet system
**Researched:** 2026-02-23
**Overall confidence:** HIGH (설계 문서 63 + Jupiter API docs + Solana DeFi 에코시스템 분석)

## Critical Pitfalls

### P1: Jupiter API v6 → v1 URL Migration
**Risk:** HIGH | **Phase:** 246

Jupiter recently migrated from `/quote` (v6) to `/swap/v1/quote` (v1 branding). Many tutorials and code examples still reference the old URL structure.

**Wrong:** `https://quote-api.jup.ag/v6/quote`
**Correct:** `https://api.jup.ag/swap/v1/quote`

**Prevention:**
- Zod response schema validation catches API changes at runtime
- `api_base_url` config allows URL override without code change
- AbortController timeout prevents hanging on wrong endpoints

### P2: /swap vs /swap-instructions Endpoint Choice
**Risk:** CRITICAL | **Phase:** 246

`/swap` returns a fully serialized transaction (Base64) with embedded feePayer and recentBlockhash — **incompatible with resolve-then-execute pattern**.

`/swap-instructions` returns individual instructions that can be mapped to ContractCallRequest.

**Prevention:** Design doc 63 already specifies /swap-instructions. Enforce this in code review.

### P3: Stale Quote / Expired Instructions
**Risk:** MEDIUM | **Phase:** 246

Jupiter quotes have a short TTL. If too much time passes between quote and submission, the route may be stale, causing transaction failure.

**Prevention:**
- resolve() calls quote + swap-instructions in sequence (no caching between steps)
- Pipeline stages 4-5 (sign + submit) execute immediately after resolve
- If transaction fails with stale blockhash, the standard retry mechanism applies

### P4: Solana Compute Unit Budget
**Risk:** MEDIUM | **Phase:** 246

Jupiter swap instructions often require high compute units (especially multi-hop routes). Default Solana CU limit (200K) may be insufficient.

**Prevention:**
- Jupiter's `/swap-instructions` response includes `computeBudgetInstructions` — compute unit limit and priority fee instructions
- These must be included in the transaction alongside the swapInstruction
- IChainAdapter.buildContractCall() should handle computeBudget instructions

**Decision needed:** How to pass computeBudgetInstructions through ContractCallRequest. Options:
1. Include as additional instructions in a batch
2. Add computeBudget fields to ContractCallRequest
3. Let the adapter auto-detect from instruction complexity

### P5: ATA (Associated Token Account) Creation
**Risk:** MEDIUM | **Phase:** 246

If the wallet doesn't have an ATA for the output token, the swap will fail. Jupiter's `/swap-instructions` response includes `setupInstructions` that create ATAs.

**Prevention:**
- Include setupInstructions before swapInstruction in the transaction
- Jupiter handles this automatically when `asLegacyTransaction: false`
- Verify setupInstructions are included in transaction build

### P6: Jito Tip Instruction Handling
**Risk:** LOW | **Phase:** 246

When `jitoTipLamports` is specified, Jupiter embeds the Jito tip in the swap instructions. If Jito block engine is unavailable, the tip instruction still exists but gets submitted to regular RPC (tip goes to a random validator).

**Prevention:**
- Jito tip is small (1000 lamports ≈ $0.0002) — acceptable cost even without MEV protection
- No separate Jito block engine submission needed — Jupiter handles this via `prioritizationFeeLamports.jitoTipLamports`
- config.toml allows disabling Jito tip (set jito_tip_lamports = 0)

## Integration Pitfalls

### P7: ContractCallRequest accounts Field Mismatch
**Risk:** HIGH | **Phase:** 246

Design doc 63 uses `accounts[].address` but the existing ContractCallRequestSchema uses `accounts[].pubkey`. Mismatch will cause Zod validation failure.

**Prevention:**
- Read the exact ContractCallRequestSchema from codebase before implementation
- Map Jupiter response `accounts[].pubkey` to the correct schema field name
- Unit test: Zod parse of constructed ContractCallRequest must pass

### P8: Built-in Provider vs ESM Plugin Registration Order
**Risk:** LOW | **Phase:** 247

Built-in providers should be registered before ESM plugins to prevent name conflicts.

**Prevention:**
- Register built-in providers first in daemon.ts Step 4f
- ESM plugins loaded after — `ACTION_NAME_CONFLICT` error if duplicate name

### P9: MCP Tool Naming Convention
**Risk:** LOW | **Phase:** 247

MCP tools are named `action_{providerName}_{actionName}`. With provider=`jupiter_swap` and action=`jupiter_swap`, the tool becomes `action_jupiter_swap_jupiter_swap` (redundant).

**Prevention:**
- Consider naming: provider=`jupiter`, action=`swap_tokens` → `action_jupiter_swap_tokens`
- Or: provider=`jupiter_swap`, action=`swap` → `action_jupiter_swap_swap`
- Design doc 63 uses provider=`jupiter_swap`, action=`jupiter_swap`
- Follow design doc as-is; MCP tool name is functional even if slightly redundant

### P10: config.toml Flat Structure Compliance
**Risk:** LOW | **Phase:** 247

CLAUDE.md requires flat config.toml structure (no nesting). But `[actions.jupiter_swap]` uses dot notation.

**Prevention:**
- config.toml sections use dot notation which is standard TOML (not nesting)
- `[actions.jupiter_swap]` is a TOML table — flat within the section
- Environment variable override: `WAIAAS_ACTIONS_JUPITER_SWAP_DEFAULT_SLIPPAGE_BPS`

## Test Pitfalls

### P11: Jupiter API Mocking
**Risk:** MEDIUM | **Phase:** 246

Jupiter API responses are complex (quoteResponse contains routePlan, marketInfos). Mock fixtures must be realistic.

**Prevention:**
- Capture real Jupiter API responses for test fixtures (Devnet SOL/USDC)
- Zod schemas validate both real and mock responses
- msw (Mock Service Worker) for HTTP-level mocking

### P12: Solana Instruction Serialization in Tests
**Risk:** LOW | **Phase:** 246

ContractCallRequest accounts field must match exact Solana instruction format. Test assertions must verify pubkey/isSigner/isWritable for each account.

**Prevention:**
- Use snapshot tests for known Jupiter swap routes
- Verify programId = JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4
- Test both happy path and edge cases (no route, high impact, timeout)
