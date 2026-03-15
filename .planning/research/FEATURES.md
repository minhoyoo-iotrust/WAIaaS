# Feature Research

**Domain:** OpenAPI client type generation pipeline for Admin UI (subsequent milestone)
**Researched:** 2026-03-15
**Confidence:** HIGH (openapi-typescript ecosystem) / HIGH (codebase state, direct inspection)

---

## Context: What Already Exists

This milestone adds to an existing, mature system. Existing infrastructure that the new features depend on:

- **OpenAPIHono 4.x** with Zod SSoT: all routes already emit valid OpenAPI 3.0 spec at `GET /doc`
- **`scripts/validate-openapi.ts`**: already extracts spec via `createApp()` and validates with swagger-parser in CI
- **`@waiaas/shared`**: cross-package constants (network types, RPC setting keys) — already used in Admin UI
- **Admin UI**: Preact + Vite, `apiGet<T>()` / `apiPost<T>()` wrappers, 122 manual `interface` declarations, 116 call sites with type casts (`as T`, `as any`, `as unknown as X`)
- **`GET /v1/actions/providers`**: returns `ProviderResponseSchema` — name, description, version, chains, mcpExpose, requiresApiKey, hasApiKey, actions[] — but NO `enabledKey` or `category`
- **`BUILTIN_PROVIDERS` array** in `packages/admin/src/pages/actions.tsx` (14 entries, client-side static): duplicates runtime state from backend, drifts silently
- **`SETTING_DEFINITIONS`** in `setting-keys.ts`: machine-readable SSoT for all settings keys (key, category, configPath, defaultValue, isCredential) — not yet exposed as API

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that the milestone objective requires. Missing these = structural problem remains unsolved.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| OpenAPI spec build-time extraction | CI needs a stable artifact to generate types from; runtime-only spec is not pipeable | LOW | Already works via `createApp()` in validate-openapi.ts — extend to write `openapi.json` file |
| `openapi-typescript` type generation script | Industry standard (v7.x, MIT, 6 kb, zero runtime) — `npx openapi-typescript openapi.json -o types.generated.ts` | LOW | openapi-typescript v7 supports OpenAPI 3.0/3.1, discriminators; `--check` flag for CI (merged Jul 2024) |
| Generated types committed and checked in | Without checked-in file, CI cannot verify freshness with `--check`; devs cannot import without running build step | LOW | One `types.generated.ts` file in `packages/admin/src/` |
| CI freshness check (`--check` flag) | Prevents spec-type drift without developer discipline; fails CI if spec changed but types not regenerated | LOW | `openapi-typescript --check` exits 1 if output differs from destination file; confirmed working as of v7 |
| Type-safe API client wrapper | 28 call sites currently use manual generic casts (`apiGet<SomeInterface>(...)`) — replacing with generated types eliminates class of bugs | MEDIUM | `openapi-fetch` companion library (6 kb, zero runtime) uses `paths` type from generated file; `client.GET("/endpoint", {...})` pattern; path params typechecked |
| Admin UI manual interfaces replaced with generated types | 62 manual `interface` definitions duplicate backend Zod schemas — any backend change requires manual Admin UI update | HIGH | Incremental migration by page; existing `apiGet<T>` wrappers still work during transition; use `components["schemas"]["SomeName"]` syntax |

### Differentiators (Competitive Advantage)

Features that go beyond basic type generation and solve the specific problems in this codebase.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `GET /v1/actions/providers` response expanded with `enabledKey` and `category` | Admin UI `BUILTIN_PROVIDERS` static array (14 entries) can be replaced with live API data; no more drift when new providers ship | MEDIUM | `enabledKey` = settings key controlling provider on/off (e.g. `actions.jupiter_swap_enabled`); `category` = 'Swap'/'Bridge'/'Staking'/'Lending'/'Yield'/'Perp'; add to `ProviderResponseSchema` Zod + OpenAPI |
| `GET /v1/admin/settings/schema` new endpoint | Admin UI has hardcoded settings search index (`settings-search-index.ts`, 85+ entries) that drifts from `SETTING_DEFINITIONS`; a schema endpoint exposes `SETTING_DEFINITIONS` as structured JSON | MEDIUM | Response: `{ keys: Array<{ key, category, label, description, isCredential, defaultValue }> }` — server has all data in `SETTING_DEFINITIONS`; Admin UI settings-search-index becomes derived from API |
| Contract test (OpenAPI spec key coverage) | Automatically verifies that every response field key used in Admin UI exists in the OpenAPI spec; catches spec-frontend mismatch at CI time | MEDIUM | Script: parse OpenAPI spec, extract all `components/schemas` property names, assert Admin UI field access paths exist; consistent with `verify-enum-ssot.ts` already in `scripts/` |
| Incremental migration by page (not big-bang) | 62 interfaces cannot be replaced safely in one PR; page-by-page approach maintains working Admin UI throughout | LOW | Priority order: high-traffic pages (wallets, transactions, dashboard) first; old `apiGet<ManualInterface>` and new `client.GET<paths["/..."]>` patterns can coexist during transition |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full OpenAPI codegen (class-based clients, axios wrappers, SDK generation) | Sounds comprehensive — generate everything from spec | Generates enormous amounts of runtime code that must be maintained, versioned, and updated; Admin UI is Preact + Vite (browser); generated classes conflict with existing apiGet/apiPut wrappers; hey-api/openapi-ts full codegen would replace entire API layer | Use `openapi-typescript` (types only, zero runtime) + `openapi-fetch` (6 kb wrapper); existing `apiGet/apiPost` wrappers can be kept or replaced incrementally |
| Replace ALL 122 interfaces in one milestone | Maximum correctness immediately | Too high risk; 8,050+ tests cannot catch every Admin UI regression; Preact+Signals pattern means many components share state — refactoring all at once breaks the ability to bisect issues | Incremental page-by-page replacement; use TypeScript `satisfies` operator to gradually tighten types without breaking runtime |
| Auto-generate Zod schemas from OpenAPI spec (frontend validation) | Round-trip type safety | Admin UI does not validate request bodies at runtime — it sends them to the daemon which validates with its own Zod schemas; duplicating Zod on the frontend adds bundle weight and sync burden | Trust backend validation; use generated types for TypeScript compile-time checking only |
| Expose full `SettingDefinition` structure (including `configPath`) via schema endpoint | Completeness | `configPath` is an internal implementation detail for config.toml lookup; exposing it creates coupling between Admin UI and config file structure | Schema endpoint returns only: key, category, label, description, isCredential, defaultValue — not configPath |
| Version-pin generated types to OpenAPI spec version | Sounds rigorous | OpenAPI spec version does not change with every route addition; would require complex version-matching tooling | CI `--check` flag enforces freshness on every PR; that is sufficient |

---

## Feature Dependencies

```
[Write openapi.json at build time]
    └──required by──> [openapi-typescript type generation]
                          └──required by──> [CI --check freshness validation]
                          └──required by──> [openapi-fetch type-safe client]
                                                └──enables──> [Replace manual apiGet<T> casts]
                                                └──enables──> [Replace manual interface declarations]

[GET /v1/actions/providers expanded (enabledKey, category)]
    └──required by──> [Replace BUILTIN_PROVIDERS static array]

[GET /v1/admin/settings/schema]
    └──enables──> [Replace settings-search-index.ts hardcoded entries]

[Replace manual interfaces (incremental)]
    └──enhances──> [Contract test (spec key coverage)]
```

### Dependency Notes

- **openapi.json extraction requires `createApp()`**: already works in `validate-openapi.ts`; extend to write file to disk as build step
- **`--check` flag requires committed output file**: the generated `types.generated.ts` must be checked in to the repo; otherwise `--check` always fails (no file to compare against on first run)
- **`openapi-fetch` requires `paths` export from generated file**: `openapi-typescript` v7 generates a `paths` interface by default; `openapi-fetch` uses it via `createClient<paths>()`
- **Provider API expansion is independent**: can ship `enabledKey`/`category` fields without waiting for type generation pipeline; Admin UI just picks them up from the existing `ProviderInfo` interface
- **Settings schema endpoint is independent**: no dependency on type generation pipeline; Admin UI uses it to build dynamic search index

---

## MVP Definition

### Launch With (v1 = this milestone)

The milestone goal is structural: eliminate the drift between OpenAPI spec and Admin UI types.

- [ ] **`scripts/extract-openapi.ts`** — write `openapi.json` from `createApp()` to disk; part of build pipeline — *prerequisite for everything else*
- [ ] **`packages/admin/src/types.generated.ts`** — generated by openapi-typescript v7, checked in, regenerated on spec change — *prerequisite for type-safe client*
- [ ] **CI freshness check** — `openapi-typescript --check` in CI; fails PR if spec changed but types not regenerated — *prevents drift regression*
- [ ] **`openapi-fetch` client wrapper (at least one page)** — `createClient<paths>()` wrapper replacing manual `apiGet<T>` in at least one high-traffic page — *validates the pattern end-to-end*
- [ ] **`GET /v1/actions/providers` expanded** — add `enabledKey` and `category` to `ProviderResponseSchema` and OpenAPI spec — *unblocks BUILTIN_PROVIDERS removal*
- [ ] **Replace `BUILTIN_PROVIDERS` static array** — Admin UI fetches live provider list with enabledKey/category; removes the 14-entry client-side list — *validates provider discovery pattern*
- [ ] **`GET /v1/admin/settings/schema` endpoint** — expose `SETTING_DEFINITIONS` as structured JSON with label/description/isCredential — *enables search index API-driven generation*
- [ ] **Contract test script** — verify that all response field keys used in Admin UI pages exist in OpenAPI spec — *CI guard against spec-frontend mismatch*

### Add After Validation (v1.x)

Once the pattern is validated on a few pages:

- [ ] **Page-by-page interface migration (remaining pages)** — replace remaining manual interfaces across all Admin UI pages; each page is a separate PR — *trigger: openapi-fetch pattern is confirmed working*
- [ ] **Replace settings-search-index.ts hardcoded entries** — derive from `GET /v1/admin/settings/schema` at runtime — *trigger: settings schema endpoint is proven stable*
- [ ] **Replace remaining `apiGet<T>` manual casts** — once each page's manual interfaces are replaced — *trigger: generated types cover that page's endpoints*

### Future Consideration (v2+)

- [ ] **Python SDK OpenAPI type generation** — the Python SDK currently has its own manual type definitions; same pipeline could target Python — *defer: Python SDK is a separate concern*
- [ ] **OpenAPI spec diff in PR comments** — post breaking changes as PR comment on `openapi.json` changes — *defer: nice DX, but contract test already catches mismatches; adds CI complexity*

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| openapi.json build-time extraction | HIGH | LOW | P1 |
| openapi-typescript type generation + check-in | HIGH | LOW | P1 |
| CI --check freshness validation | HIGH | LOW | P1 |
| openapi-fetch client wrapper (first page) | HIGH | MEDIUM | P1 |
| Provider API expanded (enabledKey, category) | HIGH | LOW | P1 |
| Replace BUILTIN_PROVIDERS with live API | HIGH | LOW | P1 |
| GET /v1/admin/settings/schema endpoint | HIGH | MEDIUM | P1 |
| Contract test (spec key coverage) | MEDIUM | MEDIUM | P2 |
| Incremental interface migration (remaining pages) | HIGH | HIGH | P2 |
| Replace settings-search-index hardcoded entries | MEDIUM | LOW | P2 |
| Replace all 28 apiGet<T> manual casts | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (this milestone)
- P2: Should have, add when possible (can be follow-on milestones)
- P3: Nice to have, future consideration

---

## Implementation Notes by Feature

### openapi-typescript v7

- Command: `npx openapi-typescript openapi.json -o packages/admin/src/types.generated.ts`
- Supports OpenAPI 3.0 and 3.1; handles discriminators (WAIaaS uses them heavily in 9-type discriminatedUnion)
- `--check` flag (merged July 2024, confirmed working in v7): exits 1 if output differs from committed file
- Zero runtime cost: generates pure TypeScript type declarations only
- Add as `devDependency` in `packages/admin/package.json`

### openapi-fetch pattern

```typescript
// packages/admin/src/api/typed-client.ts
import createClient from 'openapi-fetch';
import type { paths } from './types.generated';

export const typedClient = createClient<paths>({ baseUrl: '/' });

// Usage: replaces apiGet<WalletList>('/v1/wallets')
const { data, error } = await typedClient.GET('/v1/wallets', {});
// data is typed as components["schemas"]["WalletListResponse"] automatically
```

Auth header injection: `openapi-fetch` supports middleware for injecting the `X-Master-Password` header — cleaner than the current per-call approach.

### Provider API expansion

Current `ProviderResponseSchema` is missing:
- `enabledKey: string` — the settings key controlling this provider (e.g. `actions.jupiter_swap_enabled`)
- `category: string` — DeFi category for UI grouping (values: `'Swap'`, `'Bridge'`, `'Staking'`, `'Lending'`, `'Yield'`, `'Perp'`)

These fields exist in `IActionProvider` metadata; they need to be added to the interface, populated in `listProviders()`, and surfaced in the HTTP response.

### Settings schema endpoint

New route: `GET /v1/admin/settings/schema`
- Auth: masterAuth
- Response: `{ keys: SettingKeyMetadata[] }` where `SettingKeyMetadata` = `{ key, category, label, description, isCredential, defaultValue }`
- Source: `SETTING_DEFINITIONS` (already exists in `setting-keys.ts`)
- `label` and `description` fields need to be added to the `SettingDefinition` struct (currently missing — only key/category/configPath/defaultValue/isCredential exist)

### Contract test strategy

Pattern already established in `scripts/verify-enum-ssot.ts` and `scripts/verify-admin-route-consistency.ts`. New script:
1. Parse `openapi.json` (from build step) to extract all `components/schemas` property names
2. Parse Admin UI source files to extract response field access patterns
3. Assert every accessed response field exists in the corresponding OpenAPI schema
4. Run in CI alongside existing verification scripts

---

## Competitor Feature Analysis

| Feature | Standard industry approach | Current state | This milestone's approach |
|---------|---------------------------|---------------|--------------------------|
| Type generation | openapi-typescript or hey-api | Manual interfaces (122 count) | openapi-typescript v7 (zero runtime, matches existing Hono/Zod stack) |
| Type-safe client | openapi-fetch | apiGet<T> with manual casts (28+ sites) | openapi-fetch `createClient<paths>()` |
| CI freshness | `--check` flag | validate-openapi.ts validates spec only, not type freshness | `openapi-typescript --check` |
| Provider discovery | API-driven from backend | 14-entry static BUILTIN_PROVIDERS array | Expanded `GET /v1/actions/providers` |
| Settings metadata | API-driven from backend | Hardcoded settings-search-index.ts (85+ entries) | New `GET /v1/admin/settings/schema` |

---

## Sources

- [openapi-typescript official documentation](https://openapi-ts.dev/introduction) — HIGH confidence (official docs, WebFetch verified)
- [openapi-fetch official documentation](https://openapi-ts.dev/openapi-fetch/) — HIGH confidence (official docs, WebFetch verified)
- [openapi-typescript GitHub](https://github.com/openapi-ts/openapi-typescript) — MEDIUM confidence (WebSearch verified)
- [openapi-typescript --check flag issue #1615](https://github.com/openapi-ts/openapi-typescript/issues/1615) — HIGH confidence (issue closed, PR #1768 merged July 2024, WebFetch verified)
- [hey-api/openapi-ts](https://github.com/hey-api/openapi-ts) — MEDIUM confidence (WebSearch; considered and rejected — generates runtime code beyond what this milestone needs)
- Codebase direct inspection: `packages/admin/src/pages/actions.tsx`, `packages/admin/src/api/client.ts`, `packages/admin/src/api/endpoints.ts`, `packages/daemon/src/infrastructure/settings/setting-keys.ts`, `packages/daemon/src/api/routes/actions.ts` — HIGH confidence

---

*Feature research for: OpenAPI client type generation pipeline (v31.17)*
*Researched: 2026-03-15*
