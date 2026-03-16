# Project Research Summary

**Project:** WAIaaS Type Safety + Zod SSoT Consolidation (v32.4)
**Domain:** TypeScript Production Monorepo — Code Quality Refactoring
**Researched:** 2026-03-16
**Confidence:** HIGH

## Executive Summary

This milestone is a pure refactoring effort targeting type safety degradation in a mature 12-package TypeScript monorepo. No new dependencies are needed; all required tools (Zod 3.25.x, TypeScript 5.9.3 strict mode, Drizzle ORM 0.45.x) are already present. The work falls into four distinct problem categories: (1) `JSON.parse()` calls without runtime validation in security-critical code paths, (2) ~55 production `as any` casts that bypass the type system, (3) duplicate utility definitions across 5+ packages violating SSoT, and (4) one confirmed layer violation where a service imports from the API layer.

The recommended approach is a bottom-up, dependency-order refactoring: fix the shared `@waiaas/core` exports first, then infrastructure utilities, then the policy engine's Zod validation, then `as any` elimination, and finally SSoT consolidation of duplicated utilities. This order is dictated by build dependency direction — changes to core affect all downstream packages, so they must be correct before downstream work begins.

The highest-risk area is adding Zod validation to `database-policy-engine.ts`. The 21 `JSON.parse(policy.rules)` calls must use `.safeParse()` rather than `.parse()` because existing DB data may predate recent schema changes (e.g., `instant_max` became optional in Phase 235). Failing to use the permissive parse path would cause policy evaluation failures that directly block transactions. The second major risk is `as any` removal triggering unexpected runtime behavior changes, particularly in the WalletConnect (8 occurrences) and AA bundler client (4 occurrences) paths, which require wrapper-function isolation rather than direct cast removal.

## Key Findings

### Recommended Stack

No new packages should be added. The existing toolchain is sufficient. The `strict: true` TypeScript configuration is already in place including `noUncheckedIndexedAccess`. The codebase already contains Zod schemas for all 13 policy types in `@waiaas/core/schemas/policy.schema.ts`; the problem is that the policy engine does not use them at read time. Drizzle ORM 0.45.x does not yet expose a public `.$client` accessor, so the `wc.ts` raw SQLite access must be fixed by passing the `sqlite` handle through dependency injection — the same dual-handle pattern already used by 12+ other services.

**Core technologies and their role in this milestone:**
- **Zod 3.25.76**: Runtime validation SSoT — use `safeParse()` to replace all bare `JSON.parse() as Type` in production paths; a `safeJsonParse<T>()` helper utility in `@waiaas/core` reduces per-call boilerplate
- **TypeScript 5.9.3**: Already strict; the work is eliminating workarounds (`as any`, `as unknown as`) that already exist, not tightening compiler settings
- **Drizzle ORM 0.45.1**: Fix the WC routes to receive `sqlite` directly via DI instead of accessing Drizzle internals with `(db as any).session?.client`
- **@solana/kit 6.0.1**: Branded generics are a deliberate design choice; centralize the unavoidable cast into a single `appendInstruction<T>()` wrapper function rather than scattering `as any` across 8 call sites

### Expected Features

**Must have (table stakes):**
- `as any` removal in production code (~55 occurrences across daemon, adapters, actions, core) — scope explicitly excludes test files (~785 occurrences) and build scripts
- `DatabasePolicyEngine` Zod validation — 21 `JSON.parse(policy.rules)` calls replaced with `safeParse` using existing `POLICY_RULES_SCHEMAS` from `@waiaas/core`
- `NATIVE_DECIMALS` SSoT consolidation — 5 duplicate `Record<string, number>` definitions unified to one source
- `sleep()` SSoT consolidation — 5 duplicate inline functions replaced with a single `core/src/utils/sleep.ts` export
- `wc.ts` Drizzle raw client access fix — 8 `(db as any).session?.client` replaced with proper DI

**Should have (differentiators):**
- `safeJsonParse<T>()` utility in `@waiaas/core` — reusable pattern for all future JSON parsing across the codebase
- External-action-pipeline type precision — `ResolvedAction` discriminated union narrowing to remove 4 `as any` + 4 `as unknown as` casts
- Layer violation fix for `wc-signing-bridge.ts` — move `verifySIWE` and `decodeBase58` from `api/middleware/` to `infrastructure/crypto/` with re-export bridges for backward compatibility
- `bundlerClient` typed wrapper — isolate permissionless/viem type mismatch behind a `SmartAccountClient`-typed boundary
- `isNetworkId()` type guard — replace 8 `network as any` casts in route handlers with a proper narrowing guard

**Defer (v2+):**
- Test file `as any` cleanup (~785 occurrences) — different problem requiring mock factory patterns; separate milestone
- Build script type improvements (`scripts/extract-openapi.ts`) — low ROI, not production runtime
- Admin UI `formatDisplayCurrency` deduplication — requires verifying browser bundle constraints before moving to `@waiaas/core`

### Architecture Approach

The architecture of this milestone is purely internal refactoring within the existing 5-layer daemon structure (`api/ -> services/ -> pipeline/ -> infrastructure/ -> core`). Build order follows the dependency graph in reverse: core exports are fixed first, then infrastructure utilities are extracted, then pipeline Zod validation is applied, and finally `as any` casts are removed. No new packages, no new DB migrations, no API surface changes.

**Major components affected:**
1. **`@waiaas/core/schemas/policy.schema.ts`** — export `POLICY_RULES_SCHEMAS` record (currently internal const); add `safeJsonParse<T>()` helper to `core/src/utils/`
2. **`packages/daemon/src/pipeline/database-policy-engine.ts`** — replace 21 bare `JSON.parse` calls with `parsePolicyRules()` helper; delete 12 redundant local interface definitions and use Zod-inferred types from core
3. **`packages/daemon/src/api/routes/wc.ts`** — pass `sqlite` handle through DI instead of `(db as any).session?.client`; add `infrastructure/crypto/siwe-verify.ts` and `infrastructure/crypto/address-validation.ts` as extraction targets for the layer violation in `wc-signing-bridge.ts`
4. **`packages/adapters/solana/src/utils/tx-builder.ts`** (new file) — centralize the `appendInstruction<T>()` wrapper to reduce Solana branded-generic casts from 8 scattered sites to 1
5. **Shared utilities** — `core/src/utils/sleep.ts` becomes the canonical `sleep()` export; `NATIVE_DECIMALS` canonical location confirmed and all duplicates replaced with imports

### Critical Pitfalls

1. **Zod too strict for existing DB data** — use `.safeParse()` exclusively (never `.parse()`) for DB-sourced JSON; add `.partial()` or `.passthrough()` to schemas for fields that became optional after past milestones; validate against a real DB snapshot before merging Phase 3
2. **`as any` removal silently changing runtime behavior** — categorize every cast before touching it; WC `(db as any).session?.client` (8) and `bundlerClient as any` (4) require wrapper isolation, not direct removal; run E2E regression tests for these two categories specifically
3. **SSoT consolidation breaking downstream packages** — always leave a re-export bridge at the original location when moving code; run `pnpm turbo run typecheck` across the full monorepo before declaring any phase complete; never touch `@waiaas/sdk` public API exports
4. **Layer violation fix creating import cycles** — move pure utility functions to `infrastructure/crypto/` before fixing service-layer imports; use `import type` for all interface-only imports; run `madge --circular` after Phase 2
5. **`@ts-expect-error` accumulation during refactoring** — the codebase currently has 0 occurrences; enforce this with the existing `@typescript-eslint/ban-ts-comment` ESLint rule before starting Phase 1; never accept `@ts-expect-error` as a substitute for proper type resolution

## Implications for Roadmap

Based on research, the architecture file's 5-phase build order maps cleanly to implementation phases. The dependency direction (core -> infrastructure -> pipeline -> services -> api) dictates the execution order.

### Phase 1: Core Exports + safeJsonParse Utility
**Rationale:** All downstream phases depend on `POLICY_RULES_SCHEMAS` being exported from `@waiaas/core` and the `safeJsonParse<T>()` helper existing. Must be completed before Phase 3 can start.
**Delivers:** `POLICY_RULES_SCHEMAS` exported, `safeJsonParse<T>()` in `core/src/utils/`, `sleep()` moved to `core/src/utils/sleep.ts` with re-exports in all current duplicate locations
**Addresses:** SSoT for `sleep()` utility (5 duplicates); prerequisite for policy engine Zod validation
**Avoids:** Pitfall 3 (downstream breakage) — re-export bridges maintained at all original locations

### Phase 2: Infrastructure Utility Extraction + Layer Violation Fix
**Rationale:** The layer violation (`wc-signing-bridge.ts` importing from `api/middleware/`) must be fixed before `as any` removal in Phase 4 touches the same files. Moving utilities to `infrastructure/crypto/` first eliminates the circular dependency risk.
**Delivers:** `infrastructure/crypto/siwe-verify.ts`, `infrastructure/crypto/address-validation.ts` as canonical locations; original middleware files become re-export shims; `wc-signing-bridge.ts` import paths corrected
**Avoids:** Pitfall 4 (import cycle creation) — pure functions extracted before import paths are changed; `madge --circular` gate required

### Phase 3: DatabasePolicyEngine Zod Validation
**Rationale:** The highest-ROI change in the milestone. The policy engine is a security-critical hot path that parses 21 JSON columns without runtime validation. Fixing it before `as any` removal (Phase 4) establishes the correct `safeParse` pattern that Phase 4 builds on.
**Delivers:** 21 `JSON.parse(policy.rules) as Type` calls replaced with `parsePolicyRules()` helper; 12 local duplicate interface definitions deleted; `x402-domain-policy.ts` and `erc8128-domain-policy.ts` JSON.parse calls also covered; write-time validation strategy confirmed for hot-path performance
**Addresses:** DatabasePolicyEngine Zod validation (table stakes), policy rules interface deduplication (table stakes)
**Avoids:** Pitfall 1 (Zod too strict) — `.safeParse()` + fallback path for legacy DB data; Pitfall 7 (hot-path performance) — write-time validation strategy, not read-time `.parse()`

### Phase 4: `as any` Elimination (Production Code)
**Rationale:** After Phases 1-3 establish correct patterns, the scattered `as any` casts can be addressed category by category. Working category-by-category rather than file-by-file ensures consistent fix strategies and prevents regression.
**Delivers:** WC `(db as any).session?.client` → proper DI (8 casts); `bundlerClient as any` → `SmartAccountClient` wrapper (4-6 casts); `external-action-pipeline` discriminated union narrowing (4+4 casts); EIP-712 viem `TypedDataDefinition` pattern (3 casts); `network as any` → `isNetworkId()` guard (8 casts); daemon lifecycle `http.Server` type extension (2 casts)
**Addresses:** All HIGH/MEDIUM priority `as any` categories from FEATURES.md
**Avoids:** Pitfall 2 (runtime behavior change) — WC and bundlerClient categories handled with wrapper isolation, not direct removal; E2E regression required for these two

### Phase 5: Solana Adapter + SSoT Cleanup + Final Polish
**Rationale:** @solana/kit branded generic issues require library-internal knowledge; research confirms a wrapper function is the correct resolution. `NATIVE_DECIMALS` SSoT and any remaining small casts are low-risk and can be done last.
**Delivers:** `appendInstruction<T>()` wrapper in `packages/adapters/solana/src/utils/tx-builder.ts` centralizing 8 Solana casts; `NATIVE_DECIMALS` SSoT confirmed/unified (5 duplicate locations); action-provider-registry generic cleanup (3 casts); zero `@ts-expect-error` confirmed in CI
**Addresses:** Solana adapter differentiator features, `NATIVE_DECIMALS` SSoT (table stakes)
**Avoids:** Pitfall 5 (`@ts-expect-error` accumulation) — final audit gate

### Phase Ordering Rationale

- Phase 1 before Phase 3: `POLICY_RULES_SCHEMAS` export and `safeJsonParse` utility must exist before the policy engine can use them
- Phase 2 before Phase 4: the layer violation fix creates the infrastructure targets that Phase 4's `wc-signing-bridge.ts` correction depends on
- Phase 3 before Phase 4: the `parsePolicyRules` helper established in Phase 3 sets the pattern for other JSON.parse replacements in Phase 4
- Phase 5 last: Solana adapter work is high-complexity and isolated; `NATIVE_DECIMALS` SSoT and final polish carry the lowest regression risk and belong at the end

### Research Flags

Phases likely needing deeper investigation during execution:
- **Phase 3:** Validate existing DB data against Zod schemas before merging — test fixtures alone do not cover legacy policy data formats from Phases 76-235
- **Phase 4 (WC + bundlerClient):** Drizzle `.$client` API availability in v0.45.x needs confirmation against actual release notes; permissionless `SmartAccountClient` generic parameter requirements need viem version compatibility check

Phases with standard patterns (no additional research needed):
- **Phase 1:** `sleep()` and utility SSoT consolidation is mechanical; re-export bridge pattern is established in codebase
- **Phase 2:** Layer violation fix follows the documented re-export bridge pattern from ARCHITECTURE.md
- **Phase 5:** `NATIVE_DECIMALS` consolidation is mechanical import replacement

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Based on direct codebase grep analysis; no external dependency research needed — zero new packages |
| Features | HIGH | All ~55 production `as any` locations identified and categorized by direct grep; JSON.parse locations confirmed (21 policy + 25 other) |
| Architecture | HIGH | Build order derived from actual package dependency graph; layer violation confirmed in `wc-signing-bridge.ts` by direct file analysis |
| Pitfalls | HIGH | Based on direct code analysis + established TypeScript migration patterns; DB data compatibility risk is the one area requiring runtime validation |

**Overall confidence:** HIGH

### Gaps to Address

- **DB legacy data compatibility:** The test suite uses fresh fixtures conforming to current schemas. Before merging Phase 3, a one-time scan of an actual production-like SQLite DB should confirm that all stored `policy.rules` JSON values pass `safeParse` with the current schemas (or document which fields need `.partial()`/`.default()` additions).
- **Drizzle `.$client` in v0.45.x:** The PITFALLS research notes that Drizzle planned a public `.$client` accessor. The STACK research recommends the DI pattern (Option A) as preferred and a typed extraction utility (Option B) as fallback. Confirm `.$client` availability before deciding which option to implement in Phase 4.
- **Admin UI `formatDisplayCurrency`:** Whether `@waiaas/admin` can import from `@waiaas/core` depends on the Vite/CSP browser bundle configuration. This was flagged as "confirm first" in FEATURES.md and is deferred from the current scope if the import is not viable.

## Sources

### Primary (HIGH confidence — direct codebase analysis)
- `packages/core/src/schemas/policy.schema.ts` — 13 policy type Zod schemas confirmed, `POLICY_RULES_SCHEMAS` exists as internal const
- `packages/daemon/src/pipeline/database-policy-engine.ts` — 21 JSON.parse + type assertion calls confirmed, 12 duplicate local interfaces confirmed
- `packages/daemon/src/api/routes/wc.ts` — 8 `(db as any).session?.client` occurrences confirmed
- `packages/daemon/src/services/wc-signing-bridge.ts` — layer violation import from `api/middleware/` confirmed
- `packages/daemon/src/infrastructure/database/connection.ts` — `DatabaseConnection { sqlite, db }` dual-handle pattern confirmed
- `packages/actions/src/common/async-status-tracker.ts` — `IAsyncStatusTracker` position confirmed, no move needed
- Grep results: 830 total `as any` (140 production source, ~690 tests); 362 `JSON.parse` (128 files); 0 `@ts-expect-error` in production

### Secondary (MEDIUM confidence — established patterns)
- Drizzle ORM 0.45.x release notes — `.$client` planned API; dual-handle pattern used by 12+ existing services
- @solana/kit 6.x documentation — branded generic types are intentional API design; wrapper function is documented workaround
- permissionless 0.3.4 — `SmartAccountClient` type available for proper generic binding
- WAIaaS CLAUDE.md — Zod SSoT principle, test coverage rules, migration strategy (primary project constraints)

### Tertiary (LOW confidence — requires runtime validation)
- DB legacy policy data compatibility — inferred from schema evolution history (Phase 235: `instant_max` became optional); needs empirical validation against real DB snapshot

---
*Research completed: 2026-03-16*
*Ready for roadmap: yes*
