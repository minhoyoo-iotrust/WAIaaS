# Domain Pitfalls: Amount Unit Standardization

**Domain:** Blockchain amount unit handling
**Researched:** 2026-03-14

## Critical Pitfalls

Mistakes that cause fund loss or major breaks.

### Pitfall 1: Decimal Point Detection False Negative with Scientific Notation

**What goes wrong:** `migrateAmount("1e18", decimals, provider)` -- no decimal point detected, treated as smallest unit string. `BigInt("1e18")` throws because BigInt does not accept scientific notation.
**Why it happens:** Some JSON serializers or AI agents may produce scientific notation for large numbers.
**Consequences:** Runtime crash (BigInt parse error) or silent misinterpretation if caught and passed through.
**Prevention:** In `migrateAmount()`, reject strings containing `e` or `E` with a clear error: "Amount must be a plain decimal string, not scientific notation."
**Detection:** Unit test with `"1e18"`, `"1.5e6"`, `"2E10"` inputs.

### Pitfall 2: `max` Keyword Regression in Migrated Providers

**What goes wrong:** Aave V3 and Kamino `repay`/`withdraw` actions accept `"max"` as amount to repay/withdraw full balance. After migration to smallest unit, the `migrateAmount()` helper or new validation may reject `"max"` as invalid.
**Why it happens:** `migrateAmount()` expects a numeric string. `"max"` is neither decimal nor integer.
**Consequences:** Users cannot repay full debt or withdraw full balance -- core DeFi functionality broken.
**Prevention:** Check for `"max"` keyword BEFORE calling `migrateAmount()`. The `"max"` path is unit-independent (provider internally queries full balance as bigint). Document this in each provider's migration.
**Detection:** R6-7 test specifically covers `max` keyword compatibility.

### Pitfall 3: humanAmount with Unregistered Token

**What goes wrong:** Agent sends `{ humanAmount: "1.5", token: "0xunknown..." }` for TOKEN_TRANSFER. Token is not in registry, decimals unknown. System guesses or crashes.
**Why it happens:** `humanAmount` requires decimals to convert, but token registry is not exhaustive.
**Consequences:** Either error (good) or wrong conversion (catastrophic).
**Prevention:** R4-5 explicitly requires error when decimals cannot be determined: "Token not in registry. Use `amount` in smallest units or register the token first." Never guess decimals.
**Detection:** R6-6 test covers this exact case.

## Moderate Pitfalls

### Pitfall 4: Zod `.refine()` Not Visible in OpenAPI

**What goes wrong:** The `amount` XOR `humanAmount` constraint is defined via `.refine()`, which does not produce a JSON Schema representation. OpenAPI spec shows both fields as optional with no mutual exclusivity hint.
**Why it happens:** JSON Schema draft-07 has no standard way to express XOR between two optional fields. `oneOf` could work but `@hono/zod-openapi` does not generate it from `.refine()`.
**Prevention:** Add clear `.describe()` annotations on both fields: "Mutually exclusive with humanAmount" / "Mutually exclusive with amount". The MCP tool description and skill files should also document this clearly.
**Detection:** Manual review of generated OpenAPI spec.

### Pitfall 5: JSON Schema Conversion Losing Zod `.describe()` Annotations

**What goes wrong:** `zodToJsonSchema()` converts Zod schemas but may not preserve all `.describe()` strings depending on schema structure (e.g., inside `.optional().describe()` vs `.describe().optional()`).
**Why it happens:** Zod's metadata attachment order matters: `.describe()` must be on the innermost schema for `zodToJsonSchema` to pick it up as JSON Schema `description`.
**Prevention:** Use `.describe()` BEFORE `.optional()`: `z.string().describe('...').optional()`. Verify with a unit test that converts each action schema and checks that `description` fields are present in the JSON output.
**Detection:** R6-3 test should verify schema descriptions survive conversion.

### Pitfall 6: MCP Schema Mapper Missing Zod Types

**What goes wrong:** The manual 50-line JSON Schema -> Zod mapper handles basic types but misses `z.array()`, `z.union()`, or `z.literal()` used in some action schemas.
**Why it happens:** Action providers may use more complex Zod types than initially surveyed.
**Prevention:** R2-3 mandates fallback to `z.record(z.unknown())` for any schema the mapper cannot handle. Log a warning when fallback triggers so it can be fixed. Survey all 14 providers' `inputSchema` before writing the mapper.
**Detection:** Integration test that runs the mapper against ALL provider schemas and verifies no fallback triggered for known schemas.

### Pitfall 7: amountFormatted Precision for Large Amounts

**What goes wrong:** `formatAmount(999999999999999999999n, 18)` produces a correct but very long decimal string. Display in Admin UI or agent responses may look confusing.
**Why it happens:** bigint has unlimited precision; `formatAmount()` returns the exact decimal representation.
**Prevention:** This is actually correct behavior -- do NOT round or truncate. The `amountFormatted` field should show the exact value. Leave formatting/truncation to the presentation layer (Admin UI, agent).
**Detection:** Unit test with extreme values.

## Minor Pitfalls

### Pitfall 8: Deprecation Warning Log Noise

**What goes wrong:** High-frequency callers using decimal amounts during the transition period flood logs with deprecation warnings.
**Prevention:** Use `console.warn` (not `console.error`). Consider deduplication: warn once per provider per process lifecycle, not per call. A `Set` of warned provider+field combinations is sufficient.

### Pitfall 9: humanAmount Field in Action Provider Response Leaking

**What goes wrong:** After converting `humanAmount` to `amount` (smallest unit), the `humanAmount` field accidentally persists in the pipeline context or DB metadata.
**Prevention:** Strip `humanAmount` from the request body after conversion, before passing to pipeline. The field is a convenience input, never stored.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| R1: Provider unit migration | `max` keyword regression (Pitfall 2) | Test `max` for aave/kamino before and after migration |
| R1-3: migrateAmount | Scientific notation crash (Pitfall 1) | Validate input format before BigInt() |
| R2-1: metadata API inputSchema | describe() order matters (Pitfall 5) | Audit all schemas for `.describe()` before `.optional()` |
| R2-2: MCP typed schema | Mapper missing types (Pitfall 6) | Survey all 14 providers, implement fallback |
| R4: humanAmount XOR | OpenAPI not showing XOR (Pitfall 4) | Descriptive annotations on both fields |
| R4-5: unregistered token | Silent wrong conversion (Pitfall 3) | Hard error, never guess decimals |

## Sources

- Codebase analysis: `packages/actions/src/common/amount-parser.ts` (parseTokenAmount behavior)
- Codebase analysis: `packages/core/src/utils/format-amount.ts` (formatAmount precision)
- Codebase analysis: `packages/core/src/schemas/transaction.schema.ts` (GasConditionSchema refine pattern)
- MCP SDK source: `zod-json-schema-compat.js` (zodToJsonSchema conversion behavior)
- Objective doc: `internal/objectives/m31-15-amount-unit-standardization.md` (R1-5 max keyword, D2 heuristic rejection)
