# Domain Pitfalls: Amount Unit Standardization & AI Agent DX

**Domain:** Blockchain wallet API amount unit migration + humanAmount parameter addition
**Researched:** 2026-03-14
**Overall confidence:** HIGH (codebase direct analysis + objective document cross-reference)

---

## Critical Pitfalls

Mistakes that cause fund loss, data corruption, or require rewrites.

---

### Pitfall 1: Hardcoded Decimals in migrateAmount Backward Compatibility Path

**What goes wrong:** The 4 migrating providers use hardcoded decimals in `parseTokenAmount()` calls: Aave V3 hardcodes `18`, Kamino hardcodes `6`, Lido hardcodes `18`, Jito hardcodes `9`. After migration to smallest-unit input, the forward path (caller sends smallest unit) no longer calls `parseTokenAmount` -- the input bigint is used directly. However, the `migrateAmount()` backward-compatibility path (decimal point detected -> auto-convert) MUST know the token's actual decimals. If `migrateAmount()` inherits the hardcoded decimals from the current code, it will produce catastrophically wrong values for tokens with different decimals.

**Concrete example:** Aave V3 supports multi-asset lending. A caller supplies USDC (6 decimals) with the deprecated format `"1.5"`. If `migrateAmount("1.5")` uses the hardcoded `18` from the current `parseTokenAmount(input.amount, 18)` call, it computes `1.5 * 10^18 = 1,500,000,000,000,000,000` instead of the correct `1.5 * 10^6 = 1,500,000`. This is a 10^12x overcharge.

**Current code evidence:**
```
// aave-v3/index.ts line 161 -- ALL actions use 18, regardless of asset
const amount = parseTokenAmount(input.amount, 18);

// kamino/index.ts line 165 -- ALL actions use 6, regardless of asset
const amount = parseTokenAmount(input.amount, 6);
```

**Consequences:** Fund loss. If the wallet has sufficient balance, the overstated amount will be submitted to the smart contract. Even if the contract reverts (insufficient allowance), the pipeline has already approved the inflated amount.

**Prevention:**
1. `migrateAmount()` signature MUST include a `decimals` parameter: `migrateAmount(value: string, decimals: number): { amount: bigint; migrated: boolean }`
2. Each provider action MUST resolve the actual token decimals before calling `migrateAmount()`: native token -> chain config, registered ERC-20/SPL -> token registry lookup, unknown token -> reject migration with error guiding to `humanAmount` parameter
3. Remove ALL hardcoded decimals from `parseTokenAmount` call sites during migration
4. Post-migration, `parseTokenAmount` calls must be fully eliminated from the forward path (input is already smallest unit)

**Detection:** Unit test: Aave supply USDC (6 decimals) with deprecated decimal input `"1.5"` through `migrateAmount()`. Assert result equals `1_500_000n`, NOT `1_500_000_000_000_000_000n`.

**Phase:** Phase 1 (Provider unit migration) -- this is the core correctness gate.

---

### Pitfall 2: Silent Near-Zero Transactions from Integer Input After Migration

**What goes wrong:** The design correctly specifies that integer strings (no decimal point) are always treated as smallest units after migration -- no heuristics. But this creates a silent failure mode: callers who previously sent `"100"` meaning "100 USDC" will now send 100 micro-USDC (0.0001 USDC). The transaction succeeds, no error, no deprecation warning (no decimal detected), but the amount is negligible.

**Why it happens:** The `migrateAmount()` decimal detection only triggers on the `.` character. Integer values like `"100"`, `"1000"`, `"50"` pass through as smallest units without any warning. This is the designed behavior (safe, no guessing), but the transition period will have callers who haven't updated.

**Consequences:** Transactions succeed with negligible amounts. A user sends `"100"` expecting 100 USDC supply on Aave, gets 0.0001 USDC supplied. No error, no warning, silent value destruction. The user may not notice until checking their DeFi position.

**Prevention:**
1. `amountFormatted` in the response (R3) serves as the primary safeguard -- the response will show `"0.0000000000000001"` which alerts the caller
2. Deprecation warning log MUST include the computed human-readable equivalent when the amount is suspiciously small: `"amount '100' processed as 100 wei (= 0.0000000000000001 ETH). If you meant 100 ETH, use humanAmount parameter."`
3. Consider a configurable `SUSPICIOUS_AMOUNT_THRESHOLD` (e.g., < $0.01 equivalent) that triggers a non-blocking warning in the response metadata
4. Skill files and MCP tool descriptions must prominently document the unit change with before/after examples
5. SDK CHANGELOG must include a migration guide with clear examples

**Detection:** Integration test: send `"100"` to Aave supply after migration. Verify amount is 100 wei (correct behavior), verify NO deprecation warning logged (correct -- no decimal), verify response `amountFormatted` shows the microscopic value.

**Phase:** Phase 1 (Provider unit migration) for the warning logic. Phase 3 (amountFormatted) for the response safeguard. Phase 5 (SDK/Skill) for documentation.

---

### Pitfall 3: `max` Keyword Handling in migrateAmount and humanAmount Paths

**What goes wrong:** Aave V3 and Kamino support `amount="max"` for repay/withdraw, triggering `MAX_UINT256` or full-balance operations. The current code explicitly checks `input.amount === 'max'` before calling `parseTokenAmount()`. After migration, three paths must handle "max":

1. **Forward path** (smallest unit input): `"max"` must still work -- not a numeric string
2. **migrateAmount path**: `migrateAmount("max")` must NOT try decimal detection or numeric conversion
3. **humanAmount path**: `humanAmount="max"` should also be supported (same semantic: full balance)

If any path fails to handle "max", repay/withdraw full-balance operations break.

**Current code evidence:**
```typescript
// aave-v3/index.ts line 220
const amount = input.amount === 'max' ? MAX_UINT256 : parseTokenAmount(input.amount, 18);

// kamino/index.ts line 214
const amount: bigint | 'max' = input.amount === 'max' ? 'max' : parseTokenAmount(input.amount, 6);
```

**Consequences:** Breaking change for full-balance operations. Agents that rely on `amount="max"` for debt repayment get Zod validation errors or runtime crashes.

**Prevention:**
1. `migrateAmount()` must check for `"max"` FIRST, before any decimal/numeric processing: `if (value === 'max') return { amount: 'max', migrated: false }`
2. Zod schema: keep `.or(z.literal('max'))` alongside numeric string validation for both `amount` and `humanAmount`
3. `humanAmount="max"` maps directly to full-balance, no decimals lookup needed
4. The XOR validation (amount vs humanAmount) must account for "max" in both fields

**Detection:** Test all 4 actions that accept "max" (aave repay, aave withdraw, kamino repay, kamino withdraw) through ALL three paths: forward, migrateAmount, humanAmount.

**Phase:** Phase 1 (Provider unit migration) -- must be in the same change as the core migration.

---

### Pitfall 4: humanAmount XOR amount Validation Gap Across Layers

**What goes wrong:** The XOR validation (only one of `amount` or `humanAmount` allowed) must be enforced at EVERY entry point: REST API request parsing, Action Provider input schema, MCP tool schema, SDK type system. If any single layer allows both, the behavior is undefined. Which takes precedence? If they disagree (`amount: "1000000"` and `humanAmount: "0.5"`), silent data corruption occurs.

**Why it happens:** WAIaaS has 4 entry points to the same execution logic:
- REST API routes -> pipeline -> provider
- MCP tools -> API client -> REST API
- SDK -> HTTP client -> REST API
- Admin UI -> REST API

Each has its own schema validation layer. The XOR constraint must be enforced before values reach the pipeline.

**Consequences:** Ambiguous behavior. Two amount values disagree, one silently wins, transaction executes with the wrong amount.

**Prevention:**
1. Define XOR validation in a single shared Zod refinement (`.superRefine()`) in `@waiaas/core`, exported as a reusable schema fragment
2. REST API: apply XOR at request schema level (Zod parse before pipeline entry)
3. Action Provider: each provider's inputSchema inherits the shared XOR refinement for its amount/humanAmount pair
4. MCP: if using direct Zod reference (same process), XOR is automatically inherited. If using JSON Schema roundtrip, add post-parse validation in the MCP handler
5. SDK: TypeScript discriminated union at type level: `{ amount: string; humanAmount?: never } | { amount?: never; humanAmount: string }`
6. Test: POST with both `amount` AND `humanAmount` at every entry point -> expect 400

**Detection:** Integration test at each layer boundary. Fuzz test with all 4 combinations: amount-only, humanAmount-only, both, neither.

**Phase:** Phase 1 (REST + Provider) and Phase 2 (MCP schema). The shared Zod refinement must be created in Phase 1 and reused in Phase 2.

---

### Pitfall 5: MCP Zod -> JSON Schema -> Zod Roundtrip Loses Validation Logic

**What goes wrong:** The design specifies provider Zod schema -> `zodToJsonSchema()` -> JSON Schema in metadata API -> `jsonSchemaToZod()` -> MCP tool Zod schema. This roundtrip is inherently lossy. Zod features that DO NOT survive JSON Schema conversion:
- `.superRefine()` (the XOR amount/humanAmount validation)
- `.refine()` (custom validators)
- `.transform()` (value transformations)
- `.pipe()` (schema composition)
- Custom error messages
- `.or(z.literal('max'))` may serialize oddly depending on library version

**Current code evidence:**
```typescript
// packages/mcp/src/tools/action-provider.ts line 84
params: z.record(z.unknown()).optional()
```
Currently uses `z.record(z.unknown())` -- migration to typed schema is the goal of R2.

**Consequences:** MCP tools accept invalid input that the REST API rejects. Agent sends both `amount` and `humanAmount` through MCP, MCP validation passes (no XOR check), hits REST API, gets 400 error. Confusing DX -- the agent correctly followed the MCP tool schema but got rejected.

**Prevention:**
1. **Strongly prefer direct Zod reference**: The milestone document notes MCP runs in the same process as daemon (line 82: "MCP가 daemon과 같은 프로세스에서 실행될 경우 ActionDefinition.inputSchema의 Zod 객체를 직접 참조"). This eliminates the lossy conversion entirely. Use this approach.
2. If JSON Schema roundtrip is unavoidable (future remote MCP server scenario), add post-parse validation in the MCP tool handler: after Zod validation, check XOR constraint programmatically before API call
3. `zodToJsonSchema` does NOT exist in the project's dependencies yet -- needs to be added. Pin version and test edge cases.
4. Add snapshot tests: serialize provider Zod schema to JSON Schema, verify critical constraints are preserved (or documented as lost)

**Detection:** Validation parity test: for 20 edge-case inputs, compare validation results between direct Zod parse and roundtripped Zod parse. Flag any discrepancies.

**Phase:** Phase 2 (MCP schema conversion). The direct-reference approach makes this phase significantly simpler and safer.

---

## Moderate Pitfalls

---

### Pitfall 6: HF Simulation Arithmetic Breaks After Unit Change

**What goes wrong:** Kamino's Health Factor simulation uses `Number(amount) / 1e6` to approximate USD value from the parsed amount. Currently, `parseTokenAmount("100", 6)` returns `100_000_000n` (100 USDC in smallest unit), and `Number(100_000_000) / 1e6 = 100.0` -- correct USD approximation for USDC.

After migration, the input IS already smallest units. If `amount = 100_000_000n` (100 USDC) and the code still does `Number(amount) / 1e6`, the result is still `100.0` -- correct by coincidence because Kamino hardcodes 6 decimals.

BUT: if Kamino is extended to support tokens with different decimals (e.g., WBTC = 8 decimals on a hypothetical Kamino deployment), `Number(100_000_000) / 1e6 = 100.0` is WRONG (should be `1.0 BTC`).

Similarly, Aave's `checkBorrowSafety` passes `amount` (currently human-readable-derived) to base currency simulation. After migration, this value changes scale.

**Current code evidence:**
```typescript
// kamino/index.ts line 191
const approximateUsdValue = Number(amount) / 1e6;
```

**Prevention:**
1. After migration, replace all hardcoded divisors (`/1e6`, `/1e18`) with dynamic computation based on actual token decimals
2. Grep for `Number(amount)` patterns in the 4 migrating providers and verify each one
3. For Kamino: use token registry decimals lookup to compute `Number(amount) / 10^decimals * priceUsd`
4. For Aave: ensure `checkBorrowSafety` and `checkWithdrawSafety` receive amount in the correct scale

**Detection:** Unit test: Kamino supply with 8-decimal token, verify HF simulation uses correct USD approximation.

**Phase:** Phase 1 (Provider unit migration). Must be fixed alongside the core migration.

---

### Pitfall 7: Provider-Specific humanAmount Field Name Proliferation

**What goes wrong:** The design specifies per-provider naming: `humanAmount`, `humanSellAmount`, `humanFromAmount`, `humanAmountIn`. This creates 6+ distinct field names across 10 providers. AI agents must discover the correct `human*` field per provider per action -- partially defeating the DX improvement goal.

**The provider-to-field mapping:**
| Provider | Amount field | humanAmount field |
|----------|-------------|-------------------|
| aave-v3 | `amount` | `humanAmount` |
| kamino | `amount` | `humanAmount` |
| lido-staking | `amount` | `humanAmount` |
| jito-staking | `amount` | `humanAmount` |
| jupiter-swap | `amount` | `humanAmount` |
| zerox-swap | `sellAmount` | `humanSellAmount` |
| across | `amount` | `humanAmount` |
| lifi | `fromAmount` | `humanFromAmount` |
| pendle | `amountIn` | `humanAmountIn` |
| dcent-swap | `fromAmount` | `humanFromAmount` |

**Prevention:**
- **Option A (recommended):** Use universal `humanAmount` field name across ALL providers. Internally, the provider maps `humanAmount` to its specific amount field. Simpler for agents: "always use `humanAmount` for human-readable input."
- **Option B (per-provider naming):** If kept, ensure MCP tool descriptions list both field names. Skill files must include a provider->field lookup table. Add `amountFieldName` metadata to ActionDefinition so agents can programmatically determine the naming.
- Whichever option is chosen, decide BEFORE implementation to avoid mid-milestone refactoring.

**Phase:** Phase 4 (humanAmount support). Naming decision must be finalized in Phase 1 planning.

---

### Pitfall 8: amountFormatted null Safety for Unknown Token Decimals

**What goes wrong:** `amountFormatted` is `string | null` -- null when decimals are unknown (unregistered tokens, arbitrary CONTRACT_CALL). Every consumer must handle null. AI agents pattern-matching on `amountFormatted` for result display may show "null" or silently omit the amount.

**Prevention:**
1. Response schema description: `'Human-readable formatted amount (e.g., "1.5 ETH"). null if token decimals unknown -- register the token for formatted amounts.'`
2. SDK: provide `formatAmountSafe(amount: string, decimals?: number)` helper that returns raw amount string when decimals unknown
3. Never use non-null assertion on `amountFormatted` in consuming code
4. Native token (ETH/SOL) and registered tokens should ALWAYS have amountFormatted -- add assertion test
5. Token lookup: native -> chain config (always available), registered -> token registry, unknown -> `null`

**Phase:** Phase 3 (amountFormatted response). Define the null handling contract clearly.

---

### Pitfall 9: CLOB Exchange Exception Creates Agent Confusion

**What goes wrong:** 3 providers (Hyperliquid, Drift, Polymarket) are explicitly excluded from smallest-unit standardization. They use human-readable / exchange-native units. When MCP lists 14 providers, 11 use smallest units and 3 don't. Without clear programmatic signals, AI agents may apply the wrong unit convention.

**Prevention:**
1. Add `unitConvention: 'smallest' | 'human-readable' | 'exchange-native'` to `ActionDefinition` metadata, exposed in `GET /v1/actions/providers` response
2. MCP tool description for CLOB exceptions must include prominent prefix: `"[HUMAN-READABLE UNITS]"`
3. Skill files must have a dedicated "Unit Convention Exceptions" section listing CLOB providers
4. Schema description on amount fields: `'Amount in human-readable units (e.g., "1.5" = 1.5 tokens). This provider uses exchange-native units, NOT blockchain smallest units.'`

**Detection:** E2E test: AI agent queries tool metadata, programmatically identifies unit convention for each provider.

**Phase:** Phase 2 (MCP schema) for metadata field. Phase 5 (Skill files) for documentation.

---

### Pitfall 10: Token Registry Dependency Creates Hidden humanAmount Failure

**What goes wrong:** `humanAmount` for TOKEN_TRANSFER requires decimals from token registry. Unregistered token + `humanAmount` = error. The error may not guide the user to the solution (register the token first or use `amount` with known decimals).

**Prevention:**
1. Error response must include actionable guidance: `"Token 0xABC... not in registry. Options: (1) Register it first: POST /v1/tokens, (2) Use 'amount' in smallest units with known decimals."`
2. Consider auto-fetching decimals on-chain (ERC-20 `decimals()` / SPL Mint `decimals`) as fallback -- adds latency but improves DX
3. SDK `humanAmount` docs must note the registry prerequisite
4. For native tokens (ETH, SOL), decimals are always known from chain config -- no registry dependency

**Phase:** Phase 4 (humanAmount support). Error message design is critical for DX.

---

### Pitfall 11: Existing Tests Assume Human-Readable Input Format

**What goes wrong:** All existing unit/integration tests for the 4 migrating providers use human-readable amount strings: `"1.5"`, `"100"`, `"100.5"`. After migration, these tests will still PASS (via `migrateAmount()` backward compatibility) but won't test the new smallest-unit behavior. This creates false confidence -- tests pass but don't verify the primary code path.

**Prevention:**
1. **First:** Update ALL existing tests to use smallest-unit input. Tests should NOT trigger `migrateAmount()`.
2. **Then:** Add dedicated backward-compatibility tests that explicitly verify `migrateAmount()` behavior with decimal inputs.
3. Grep test files for amount string literals: `grep -rn '"[0-9]*\.[0-9]*"' packages/actions/src/providers/{aave-v3,kamino,lido-staking,jito-staking}/__tests__/`
4. Add assertion that no deprecation warning is logged during the main test suite (only backward-compat tests should trigger it).

**Detection:** After migration, temporarily disable `migrateAmount()` backward compatibility. ALL main tests should still pass. Only backward-compat tests should fail.

**Phase:** Phase 1 (Provider unit migration) + Phase 6 (Testing). Tests MUST be updated WITH the migration, not after.

---

## Minor Pitfalls

---

### Pitfall 12: zodToJsonSchema Version and Draft Compatibility

**What goes wrong:** The `zod-to-json-schema` npm package has version-specific behavior differences. JSON Schema draft-07 vs 2020-12 output, `.optional()` vs `.nullable()` handling, `.default()` serialization, and Zod v3 vs v4 compatibility can produce unexpected schemas that MCP SDK rejects or misinterprets.

**Prevention:** Pin `zod-to-json-schema` version. Add snapshot tests for generated JSON Schema output. Verify the MCP SDK's expected JSON Schema draft matches the output.

**Phase:** Phase 2 (MCP schema conversion).

---

### Pitfall 13: SDK TypeScript Overload Complexity from amount/humanAmount Union

**What goes wrong:** Adding `humanAmount` as an alternative to `amount` in SDK method signatures creates complex TypeScript overloads or union types that degrade IDE autocomplete DX.

**Prevention:** Use discriminated union with JSDoc: `{ amount: string; humanAmount?: never } | { amount?: never; humanAmount: string }`. Include code examples in JSDoc for both patterns.

**Phase:** Phase 5 (SDK sync).

---

### Pitfall 14: Deprecation Warning Log Flood During Transition

**What goes wrong:** If many existing callers still use decimal amounts during transition, deprecation logs flood output. WAIaaS is a local daemon where log readability matters.

**Prevention:** Rate-limit warnings: max 1 per provider per minute, or log summary per session: `"[DEPRECATION] Provider aave_v3/supply: 47 calls used deprecated format this session."`

**Phase:** Phase 1 (Provider unit migration).

---

### Pitfall 15: balanceFormatted Consistency with amountFormatted

**What goes wrong:** R3-5 adds `balanceFormatted` to balance API, but existing balance response already returns `balance` (smallest unit) + `decimals`. If `balanceFormatted` uses a different formatting convention than `amountFormatted` (e.g., different trailing zero behavior, different null rules), consumers get inconsistent results.

**Prevention:** Both `balanceFormatted` and `amountFormatted` must use the same `formatAmount()` utility. Add a unit test that formats the same value through both paths and asserts identical output.

**Phase:** Phase 3 (amountFormatted response).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Provider unit migration (4 providers) | Hardcoded decimals in migrateAmount (Pitfall 1) | Token-specific decimals lookup for backward compat path |
| Provider unit migration | Silent near-zero transactions (Pitfall 2) | amountFormatted safeguard + suspicious amount warning |
| Provider unit migration | `max` keyword handling (Pitfall 3) | Early return in migrateAmount for "max" before numeric processing |
| Provider unit migration | HF simulation arithmetic (Pitfall 6) | Replace hardcoded divisors with dynamic decimals |
| Provider unit migration | Test updates (Pitfall 11) | Update tests BEFORE or WITH code changes, not after |
| Provider unit migration | Deprecation log flood (Pitfall 14) | Rate-limit per provider per minute |
| MCP typed schema | Zod roundtrip lossy conversion (Pitfall 5) | Prefer direct Zod reference (same-process) |
| MCP typed schema | zodToJsonSchema compatibility (Pitfall 12) | Pin version, snapshot tests |
| MCP typed schema | CLOB exception confusion (Pitfall 9) | unitConvention metadata field |
| amountFormatted response | Null safety (Pitfall 8) | Explicit null contract, SDK helper |
| amountFormatted response | balanceFormatted consistency (Pitfall 15) | Shared formatAmount() utility |
| humanAmount support | XOR validation across layers (Pitfall 4) | Shared superRefine in @waiaas/core |
| humanAmount support | Field name proliferation (Pitfall 7) | Decide universal vs per-provider before implementation |
| humanAmount support | Token registry dependency (Pitfall 10) | Actionable error messages |
| SDK/Skill sync | SDK type complexity (Pitfall 13) | Discriminated union with JSDoc |

---

## Integration Risk Matrix

| Existing System | Affected New Feature | Risk | Key Concern |
|----------------|---------------------|------|-------------|
| `parseTokenAmount()` (amount-parser.ts) | migrateAmount backward compat | **CRITICAL** | Hardcoded decimals must NOT propagate to migrateAmount |
| Aave HF simulation (aave-rpc.ts) | Unit migration | **HIGH** | `checkBorrowSafety` / `checkWithdrawSafety` amount scale changes |
| Kamino HF simulation (hf-simulation.ts) | Unit migration | **HIGH** | `Number(amount) / 1e6` hardcoded divisor |
| Zod schema validation (core schemas) | XOR amount/humanAmount | **HIGH** | Must enforce at every entry point consistently |
| MCP action-provider.ts | Typed schema | **HIGH** | Lossy roundtrip vs direct reference decision |
| Transaction response schemas | amountFormatted | **MEDIUM** | Null safety contract, token registry lookup |
| Token registry | humanAmount conversion | **MEDIUM** | Unregistered token -> clear error guidance |
| Existing tests (4 providers) | Unit migration | **MEDIUM** | False confidence from backward-compat pass-through |
| Skill files (7 files) | Documentation | **LOW** | Must document unit change prominently |
| SDK methods | humanAmount option | **LOW** | TypeScript type ergonomics |

---

## Sources

- Codebase inspection: `packages/actions/src/providers/aave-v3/index.ts` lines 161, 193, 220, 252 -- hardcoded decimals=18 for ALL assets -- HIGH confidence
- Codebase inspection: `packages/actions/src/providers/kamino/index.ts` lines 165, 187, 214, 236 -- hardcoded decimals=6 for ALL assets -- HIGH confidence
- Codebase inspection: `packages/actions/src/providers/lido-staking/index.ts` lines 116, 135 -- hardcoded decimals=18 -- HIGH confidence
- Codebase inspection: `packages/actions/src/providers/jito-staking/jito-stake-pool.ts` line 400 -- hardcoded decimals=9 -- HIGH confidence
- Codebase inspection: `packages/actions/src/common/amount-parser.ts` -- parseTokenAmount utility, human-readable only -- HIGH confidence
- Codebase inspection: `packages/core/src/utils/format-amount.ts` -- formatAmount/parseAmount utilities -- HIGH confidence
- Codebase inspection: `packages/mcp/src/tools/action-provider.ts` line 84 -- `z.record(z.unknown())` current state -- HIGH confidence
- Codebase inspection: `packages/actions/src/providers/kamino/index.ts` line 191 -- `Number(amount) / 1e6` HF approximation -- HIGH confidence
- Milestone objective: `internal/objectives/m31-15-amount-unit-standardization.md` -- design decisions D1-D7, R1-R6 requirements -- HIGH confidence
- Zod-to-JSON-Schema lossy conversion: known limitation documented in zod-to-json-schema README -- MEDIUM confidence
