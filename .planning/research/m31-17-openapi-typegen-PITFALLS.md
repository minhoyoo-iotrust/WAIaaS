# Pitfalls Research

**Domain:** OpenAPI-based frontend type generation — adding to existing large TypeScript monorepo
**Researched:** 2026-03-15
**Confidence:** HIGH (codebase analysis) / MEDIUM (ecosystem tooling, verified against official docs + GitHub issues)

---

## Critical Pitfalls

### Pitfall 1: createApp() stub deps cause partial route registration — OpenAPI spec is incomplete

**What goes wrong:**
The spec-extraction script calls `createApp({})` with no dependencies. Routes that guard against missing deps with early-return guards or conditional route registration are silently omitted from the spec. The generated `openapi.json` is structurally valid but missing endpoints. `openapi-typescript` generates types for 60 endpoints when the real server has 80.

**Why it happens:**
`createApp()` in `server.ts` uses optional deps extensively — `deps.db`, `deps.adapterPool`, `deps.settingsService`, etc. Several route factories inspect these at registration time (e.g. `createHyperliquidRoutes`, `createPolymarketRoutes` receive `null` guards). The script author tests the script, sees no error, and assumes the spec is complete. There is no automated count comparison.

**How to avoid:**
1. Audit `server.ts` for every `if (deps.x)` conditional route registration block before writing the extraction script.
2. In the extraction script, pass "stub" objects that satisfy TypeScript's structural typing but do nothing (empty `{}` with `as SomeService`). The goal is route registration, not execution.
3. After generation, add a CI assertion: `jq '.paths | keys | length' openapi.json` must equal the known endpoint count. Fail if fewer.
4. Run the extraction script in the same test run that validates route count in daemon tests — cross-check.

**Warning signs:**
- `openapi.json` has fewer `paths` entries than `API` constants in `packages/admin/src/api/endpoints.ts` (currently 73 entries).
- Generated types file is smaller than 200 KB when spec is expected to be larger.
- Any admin page that calls an endpoint not reflected in the generated types file.

**Phase to address:** Phase 1 (spec extraction pipeline) — must be resolved before any type migration work begins.

---

### Pitfall 2: Turbo build pipeline ordering creates stale openapi.json in CI

**What goes wrong:**
The spec extraction script runs as part of `@waiaas/admin#build` or a new `generate-types` task. But `turbo.json` caches task outputs — if `packages/daemon/src/` has not changed since the last Turbo run, the daemon build is skipped (cache hit), and the extraction script never runs. The committed `openapi.json` and `types.generated.ts` are stale but CI reports success because Turbo restored them from cache without re-verifying.

**Why it happens:**
Turbo's `outputs` caching is aggressive. A task that generates spec from runtime introspection cannot use the standard cache model because it depends on the *content* of all route registrations, not just file hashes. If the extraction script is placed in `@waiaas/admin#build` as a `dependsOn`, Turbo will cache its output alongside the admin dist bundle.

**How to avoid:**
1. Add a dedicated `generate-openapi` task in `turbo.json` with `"cache": false` or `"outputs": ["openapi.json"]` and an input glob of `["packages/daemon/src/**/*.ts"]`.
2. The freshness-check CI step should run after the extraction, computing a `git diff --exit-code` on the committed `openapi.json`. If it differs, CI fails with "OpenAPI spec is stale — re-run `pnpm generate-openapi`".
3. Keep `openapi.json` committed to the repo (alongside `types.generated.ts`) so the freshness check is a diff, not a regeneration.

**Warning signs:**
- CI passes after a daemon route change but the changed endpoint is absent from the generated types.
- `git log --follow openapi.json` shows it was last updated weeks ago despite active daemon development.
- Turbo reports `@waiaas/admin#build` as `>>> FULL TURBO` (cache hit) even after a new route was added.

**Phase to address:** Phase 1 (spec extraction pipeline) — CI freshness gate is a deliverable of phase 1, not an afterthought.

---

### Pitfall 3: openapi-typescript nullable / optional type shape diverges from manual interfaces — silent breakage

**What goes wrong:**
Generated types for nullable fields use `T | null` unions, but existing manual interfaces often use `T | undefined` or omit the field entirely. After migration of a single page's interfaces to generated types, TypeScript starts reporting errors on code that previously compiled. The developer widens the generated type back to `T | null | undefined` to silence the error, defeating the purpose of type generation.

**Why it happens:**
The WAIaaS API uses Zod `.nullable()` (not `.optional()`) for fields like `ownerAddress`, `ownerVerified`, `peerName`. openapi-typescript correctly generates `field: string | null`. The old manual interface `WalletDetail` used `ownerAddress: string | null` but `WcSession` used `peerName: string | null | undefined` (the actual backend might return `null`, but the frontend defensive-coded `| undefined`). When the real type is stricter, components using optional-chaining `peerName?.slice(0,8)` still compile, so the mismatch is invisible.

Conversely, if the backend Zod schema has `.optional()` and generates `field?: T` in OpenAPI, but the manual interface had `field: T` (non-optional), the migration makes things stricter and breaks callsites.

**How to avoid:**
1. Before migrating an interface, run `pnpm typecheck` on the admin package to establish a clean baseline.
2. Migrate one interface at a time. Re-run `pnpm typecheck` after each. Treat new errors as spec discoveries, not obstacles.
3. If a generated type is `T | null` but the callsite uses `|| ''` null-coalescing (not `?? ''`), the types still compile but semantics differ — add a lint rule `@typescript-eslint/prefer-nullish-coalescing` to surface these.
4. Do NOT widen generated types. If the type mismatch reveals a bug in the frontend (treating `null` as `undefined`), fix the frontend code.

**Warning signs:**
- More than 3 `as unknown as T` casts appearing during migration.
- `// @ts-ignore` comments appearing in migrated files.
- `apiGet<WalletDetail>` returning a generated type that differs structurally from what `.tsx` components destructure.

**Phase to address:** Phase 2 (type-safe API client wrapper) and Phase 3 (incremental interface migration).

---

### Pitfall 4: openapi-typescript discriminatedUnion (oneOf) generates wide union, not narrowed type

**What goes wrong:**
The WAIaaS pipeline uses a 9-type discriminated union (`type: 'TRANSFER' | 'TOKEN_TRANSFER' | ...`). In OpenAPI, this is expressed as `oneOf` with a discriminator. openapi-typescript generates the union correctly as a TypeScript union, but does NOT narrow it — it generates `TransferBody | TokenTransferBody | ...` without TypeScript discriminant narrowing. Any code that previously used `if (tx.type === 'TRANSFER') { tx.toAddress }` still works at runtime, but TypeScript's type guard does not narrow because the generated union members are not tagged with a literal `type` field in their individual schemas.

**Why it happens:**
OpenAPI 3.0 `discriminator` with `oneOf` maps to a TypeScript union in openapi-typescript, but the narrowing only works if each `oneOf` schema has the discriminator property as a string literal type (e.g. `type: { const: 'TRANSFER' }`). If the Zod→OpenAPI conversion produces `type: { type: 'string', enum: ['TRANSFER'] }` at the top level rather than a `const`, openapi-typescript generates `type: string` for all variants, collapsing discriminant narrowing.

**How to avoid:**
1. Before migrating transaction-related interfaces, inspect the generated `openapi.json` for the transaction schema. Confirm each `oneOf` variant has `type: { const: 'TRANSFER' }` (or `enum: ['TRANSFER']` with a single value).
2. If narrowing is absent, continue using the Zod-inferred types from `@waiaas/core` or `@waiaas/shared` for the discriminated union, and use generated types only for the response wrapper (pagination, metadata fields).
3. Do not attempt to replace the core transaction Zod discriminatedUnion with generated OpenAPI types — the Zod types ARE the SSoT and are already type-safe.

**Warning signs:**
- `switch (tx.type) { case 'TRANSFER': }` no longer provides `tx.toAddress` autocomplete after migration.
- TypeScript error `Property 'toAddress' does not exist on type 'TransferBody | TokenTransferBody | ...'` after migration.
- openapi-typescript GitHub issue [#1368](https://github.com/openapi-ts/openapi-typescript/issues/1368) and [hey-api #3270](https://github.com/hey-api/openapi-ts/issues/3270) confirm this is a known open issue as of 2025.

**Phase to address:** Phase 3 (incremental interface migration) — avoid migrating discriminated union types; use generated types for flat response shapes only.

---

### Pitfall 5: Admin UI tests use inline mock data matching manual interfaces — generated types break tests silently

**What goes wrong:**
Every admin test uses patterns like:
```ts
(apiGet as ReturnType<typeof vi.fn>).mockResolvedValue({
  id: 'w1',
  ownerState: 'NONE' as const,
  // ... 8 more fields
});
```
These mock objects are typed as `any` (because `apiGet<T>` casts the return). After migration to generated types, the real `apiGet<paths['/v1/wallets/{id}']['get']['responses']['200']['content']['application/json']>` is typed. If the generated type adds a new required field (e.g. `chainId: string`), mock objects in tests are missing it — but because the mock return is still `any` from `vi.fn()`, TypeScript does not catch it, and the test passes. The frontend component renders with missing data and the bug is invisible.

**Why it happens:**
`vi.fn()` mock return types default to `any`. The test suite has 80+ test files in admin with hundreds of `mockResolvedValue({...})` calls. Structural mock validation is not enforced.

**How to avoid:**
1. When migrating a page's interfaces, also update its test file's mock objects to use the generated type: `mockResolvedValue({...} satisfies GeneratedWalletDetail)`. The `satisfies` keyword enforces shape without casting.
2. Add a helper `typedMock<T>(value: T): T` that uses `satisfies` internally — forces test authors to align mocks with types.
3. Migrate mock objects in the same PR as the interface migration — never in a separate step.

**Warning signs:**
- After migration, tests pass but the browser shows empty/missing fields on the migrated page.
- Mock objects in tests have fewer keys than the generated type definition.
- `coverage/` shows 100% branch coverage for a page that was just migrated, with no test changes.

**Phase to address:** Phase 3 (incremental interface migration) — enforce in the migration PR definition of done.

---

### Pitfall 6: CSP `default-src 'none'` blocks inline scripts — generated types file loaded as inline JSON fails

**What goes wrong:**
If the build pipeline inlines the `openapi.json` spec into the admin bundle (e.g. as a JSON import or embedded in a JS module), and the CSP header applies `script-src 'self'` without allowing inline scripts, a browser-side Swagger UI or runtime schema validator silently fails. This is less likely for type-only generation (types are compile-time), but becomes relevant if any admin page attempts to fetch `/doc` at runtime to display API documentation.

**Why it happens:**
The admin is served with `cspMiddleware` which sets `default-src 'none'`. Any `<script>` tag injected by a Vite plugin (e.g. vite-plugin-content-security-policy) or inline JSON blob would be blocked.

**How to avoid:**
1. Keep generated types as `.ts` files compiled into the bundle — never load `openapi.json` at runtime from within the admin UI.
2. If a Swagger UI or API explorer page is planned, serve it from `/doc` (the existing Hono endpoint) with separate CSP, not inside the `/admin/` SPA.
3. The `openapi.json` file is only used at build time (spec extraction → `openapi-typescript` → `types.generated.ts`). It must not be bundled into the admin dist.

**Warning signs:**
- `vite build` output includes `openapi.json` in the `dist/` directory.
- Any `import spec from '../../openapi.json'` statement in admin source files.
- CSP error in browser console: `Refused to execute inline script`.

**Phase to address:** Phase 1 (spec extraction pipeline) — enforce the constraint that `openapi.json` is build-time-only.

---

### Pitfall 7: Settings key string indexing uses `as Record<string, string>` casts — migration to generated types does not fix this

**What goes wrong:**
The admin settings API returns a flat key-value map (`Record<string, string>`). Code like `settings.value['actions'] as Record<string, string>` appears 3+ times across pages. The generated OpenAPI type for `GET /v1/admin/settings` will correctly type the response, but the *values* within the settings map are still `string`. After migration, the same `as Record<string, string>` cast is still needed unless the backend schema changes to a typed object. If the developer assumes "migration to generated types will fix all casts", they will be surprised.

**Why it happens:**
Settings are inherently dynamic — the schema has ~150+ keys. OpenAPI represents this as `additionalProperties: string` or as a large inline object. The generated type for a flat settings map is `{ [key: string]: string }`, which is functionally equivalent to the manual cast.

**How to avoid:**
1. The new `GET /v1/admin/settings/schema` endpoint (planned feature) returns typed metadata per key. Use this for settings-specific type safety, not the raw settings response.
2. Do not count settings-page type casts in the "62 manual interfaces to migrate" metric — they require a separate backend change, not just type generation.
3. In the migration, mark these casts with a `// TODO(settings-schema): remove after #NNN` comment so they are tracked separately.

**Warning signs:**
- After migrating `system.tsx`, `wallets.tsx`, and `actions.tsx`, there are still 20+ `as Record<string, string>` casts remaining.
- The "migration complete" checklist checks off the page without addressing settings casts.

**Phase to address:** Phase 4 (settings schema endpoint + hardcoded array replacement) — settings type safety is a separate concern from response type generation.

---

### Pitfall 8: `openapi-typescript` v7 `defaultNonNullable: true` default changes optional field behavior

**What goes wrong:**
openapi-typescript v7 changed the default of `defaultNonNullable` to `true`. Fields that were previously `field?: string` in generated types (because the OpenAPI spec did not mark them as required) become `field: string` — non-optional but possibly undefined at runtime. This causes TypeScript to report no error when accessing `tx.nonce` even if the backend can omit it.

**Why it happens:**
The v7 migration guide documents this breaking change, but it is easy to miss. WAIaaS Zod schemas use `.optional()` for many response fields. Whether these translate to OpenAPI `required: []` omissions or `nullable` depends on `@hono/zod-openapi` version and Zod schema shape.

**How to avoid:**
1. After first generation run, inspect 5 known-optional response fields (e.g. `WalletRow.ownerAddress`, `Session.expiresAt`) in the generated types. If they are non-optional in generated output despite being optional in reality, add `defaultNonNullable: false` to the `openapi-typescript` config.
2. Pin the `openapi-typescript` version and document the pinned version with rationale in `STACK.md`.
3. Run `pnpm typecheck` on the full monorepo after generation to catch newly surfaced type errors before committing.

**Warning signs:**
- `pnpm typecheck` produces 50+ new errors after first generation run.
- Fields known to be absent in some API responses are typed as required in generated file.
- The `types.generated.ts` file has no `?` optional markers on fields that have `| null` unions.

**Phase to address:** Phase 1 (spec extraction pipeline) — configure `openapi-typescript` options as part of pipeline setup.

---

### Pitfall 9: Circular import created when `packages/daemon` imports `packages/admin` types for contract tests

**What goes wrong:**
If the planned "Contract Test" (OpenAPI spec ↔ frontend usage key validation) imports generated types from `packages/admin/src/types.generated.ts` into `packages/daemon` test files, a circular workspace dependency is created: `@waiaas/admin` depends on `@waiaas/shared`; if `@waiaas/daemon` test files start importing from `@waiaas/admin`, Turbo must now build admin before running daemon tests. This works initially but breaks if `@waiaas/admin` adds a dependency that conflicts with daemon's build.

**Why it happens:**
Contract tests feel natural to place in daemon tests since they validate the daemon's OpenAPI spec. But `packages/daemon` should not depend on `packages/admin` — the dependency direction must be one-way (admin depends on daemon's OpenAPI output, not vice versa).

**How to avoid:**
1. Place contract tests in a standalone file (e.g. `packages/daemon/src/__tests__/openapi-contract.test.ts`) that imports `openapi.json` directly (a build artifact, not a package import) — not `@waiaas/admin`.
2. The contract test validates that the keys used in `packages/admin/src/api/endpoints.ts` are present in `openapi.json` paths — it only needs to read two static files, no cross-package imports.
3. Keep `packages/admin` as a private package with no reverse dependencies.

**Warning signs:**
- `packages/daemon/package.json` gains `"@waiaas/admin": "workspace:*"` as a dependency.
- Turbo graph shows a cycle: `@waiaas/daemon#test` → `@waiaas/admin#build` → `@waiaas/daemon#build`.
- CI time increases significantly after adding contract tests.

**Phase to address:** Phase 5 (contract tests) — define the test architecture before writing any contract test code.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep `apiGet<ManualType>` casts during migration, replace "later" | Faster page-by-page migration | Generated type and manual type diverge silently; "later" never comes | Never — migrate the cast in the same PR as the interface |
| Use `as unknown as GeneratedType` when types don't align | Silences TypeScript errors | Defeats the purpose of type generation; hides API contract violations | Never |
| Regenerate `types.generated.ts` only on demand (not in CI) | Simpler pipeline | Developers work with stale types for days; interface mismatches ship | Never — freshness check must be automated |
| Migrate all 62 interfaces in a single PR | Faster completion appearance | Massive diff, high conflict risk, hard to review, high coverage impact | Never — incremental by page is mandatory |
| Skip mock object updates in tests during interface migration | Fewer test changes per PR | Tests pass but test data is structurally invalid; regression blind spots | Never |
| Commit `openapi.json` only in release branches | Reduces noisy commits | No local freshness check; CI is the only gate (slow feedback loop) | Only if generation is deterministic and fast (<5s) |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `@hono/zod-openapi` spec export | Calling `app.getOpenAPIDocument()` on an `OpenAPIHono` instance that hasn't registered all routes | Call `createApp(stubDeps)` in the extraction script, register all routes first, then call `app.getOpenAPIDocument()` |
| `openapi-typescript` config | Using default `exportType: 'interface'` — generates `interface` not `type`, causing issues with mapped types | Use `exportType: 'type'` to get `type` aliases that work with intersection and conditional types |
| Turbo `outputs` caching | Marking `openapi.json` as an output of a cached task | `openapi.json` generation needs `"cache": false` or must include all `packages/daemon/src/**` as inputs |
| Vite admin bundle | Importing `openapi.json` as a static asset via `?url` or JSON import | Generated types file (`types.generated.ts`) must be the only artifact used at compile time |
| `@waiaas/shared` re-exports | Exporting hardcoded arrays from `@waiaas/shared` (e.g. `PROVIDER_CATEGORIES`) before they exist | Define the `GET /v1/actions/providers` response extension first; then derive the frontend constant from that API response |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Spec extraction script starts the full daemon (connects to DB, RPC) | `pnpm generate-openapi` takes 10+ seconds, times out in CI | Extraction script must use `createApp(stubDeps)` with no real infra connections — pure route registration | Every CI run if not prevented |
| `types.generated.ts` is 5000+ lines and imported by every admin page | `@waiaas/admin` typecheck time increases from 8s to 45s | Import only the specific `components['schemas']` subtypes needed per page — do not star-import the entire generated file | After migrating 20+ pages |
| Contract test loads `openapi.json` and does full JSON traversal on every test run | Daemon test suite slows noticeably | Load spec once in `beforeAll`, cache in memory | Not a scale issue — but sloppy implementation is easy to write |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `openapi.json` committed to repo exposes internal endpoint paths and schema details | Low risk (it is the public API doc anyway) but increases attack surface if private admin endpoints are documented with parameter details | Acceptable — the spec is already served at `/doc`. Ensure no credential field names or internal service URLs appear in schema descriptions |
| Spec extraction script imports daemon source with `import` statements in a Node script — side effects run | If any module registers signal handlers or opens file handles on import, the extraction script can hang | Use dynamic imports with explicit `{ createApp }` named import; avoid importing `daemon.ts` or `lifecycle/` modules |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Migration introduces TypeScript errors in admin during incremental rollout | Developers can't run `pnpm typecheck` cleanly during multi-day migration | Use a feature-flag comment pattern `// MIGRATION: interface replaced in #NNN` to track in-progress pages; keep typecheck clean at all times |
| Hardcoded arrays (`CATEGORY_ORDER`, `SYSTEM_PREFIXES`) replaced with API calls introduce loading states | Admin pages that previously rendered instantly now show spinner during category fetch | If the data is static (defined in backend code, never changes without deploy), export it from `@waiaas/shared` not from an API call |

---

## "Looks Done But Isn't" Checklist

- [ ] **Spec extraction:** `openapi.json` `paths` count matches the number of entries in `API` constants object in `endpoints.ts` — verify with assertion script.
- [ ] **Generated types freshness:** CI freshness check uses `git diff --exit-code openapi.json types.generated.ts` — verify it fails when spec changes but files are not regenerated.
- [ ] **Type-safe client wrapper:** `apiGet<T>` usages reduced to zero — verify with `grep -rn 'apiGet<' packages/admin/src --include="*.tsx" | wc -l` equals 0 after Phase 2.
- [ ] **Mock alignment:** Every test `mockResolvedValue({...})` uses `satisfies GeneratedType` — verify no untyped mock objects remain.
- [ ] **Coverage thresholds:** Admin `vitest.config.ts` thresholds not lowered — verify branches ≥ 80, functions ≥ 71, lines ≥ 87 after all changes.
- [ ] **Settings casts:** `as Record<string, string>` casts in settings-related code are tracked separately with `// TODO(settings-schema)` comments — not falsely marked as "migrated".
- [ ] **Circular imports:** `packages/daemon/package.json` has no dependency on `@waiaas/admin` — verify with `pnpm why @waiaas/admin` from daemon package root.
- [ ] **CSP compliance:** `dist/` directory after `pnpm build` contains no `openapi.json` — verify with `ls packages/admin/dist/ | grep openapi`.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Incomplete spec (Pitfall 1) | LOW — if caught before migration begins | Re-audit conditional route registration; fix stub deps; regenerate |
| Stale types shipped (Pitfall 2) | MEDIUM — if caught in code review or prod | Add freshness check to CI immediately; regenerate and commit updated files; no API change needed |
| Type shape divergence causes runtime bug (Pitfall 3) | MEDIUM — debugging required | Revert migrated interface to manual; inspect backend Zod schema vs generated OpenAPI field; fix discrepancy in spec or frontend |
| Tests pass with wrong mock data (Pitfall 5) | MEDIUM — silent regression | Add `satisfies` to mock objects; run browser E2E or admin UAT scenario to catch missing fields |
| Turbo cache returns stale types (Pitfall 2) | LOW — if CI freshness gate exists | Clear Turbo cache (`turbo daemon clean`); regenerate; recommit |
| Circular import breaks build (Pitfall 9) | HIGH — if far into development | Restructure contract tests to use file path imports; remove workspace dep from daemon |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Incomplete spec from stub deps | Phase 1: Spec extraction pipeline | CI assertion: `paths` count in `openapi.json` ≥ 73 (current endpoint count) |
| Turbo cache stale types | Phase 1: Spec extraction pipeline | CI: `git diff --exit-code openapi.json` after extraction task runs |
| Nullable/optional type shape divergence | Phase 2: Type-safe client wrapper | `pnpm typecheck` clean before and after each page migration PR |
| discriminatedUnion not narrowed | Phase 3: Incremental interface migration | Explicitly skip transaction type union — document the exclusion decision |
| Test mock objects structurally invalid | Phase 3: Incremental interface migration | All migrated-page test files use `satisfies GeneratedType` on mock data |
| CSP blocks runtime JSON loading | Phase 1: Spec extraction pipeline | `ls packages/admin/dist/ | grep -c openapi` = 0 |
| Settings casts not fixed by type gen | Phase 4: Settings schema endpoint | `settings-schema` endpoint delivers typed metadata; settings casts tagged with TODO |
| Circular import from contract tests | Phase 5: Contract tests | `packages/daemon/package.json` has no `@waiaas/admin` dependency |
| openapi-typescript v7 defaultNonNullable | Phase 1: Spec extraction pipeline | Pin version; compare known-optional fields in generated output |

---

## Sources

- [openapi-typescript GitHub — v7 breaking changes issue #1368](https://github.com/openapi-ts/openapi-typescript/issues/1368) — documents `defaultNonNullable` default change and AST return type change
- [openapi-typescript — discriminated union generation issue #3270 (hey-api)](https://github.com/hey-api/openapi-ts/issues/3270) — confirms discriminated unions are not narrowed in generated types
- [openapi-typescript — incorrect nullable objects #1821](https://github.com/openapi-ts/openapi-typescript/issues/1821) — `nullable: true + object` generates wrong union in v7.3.0
- [Hono OpenAPI docs — mixing OpenAPIHono with plain Hono](https://hono.dev/examples/zod-openapi) — documents that plain Hono sub-apps cause spec incompleteness
- [openapi-fetch official docs](https://openapi-ts.dev/openapi-fetch/) — 6 KB wrapper, zero runtime, recommended migration pattern
- [openapi-typescript migration guide](https://openapi-ts.dev/migration-guide) — version-specific breaking changes
- [Speakeasy — OpenAPI Hono integration guide](https://www.speakeasy.com/openapi/frameworks/hono) — createApp + getOpenAPIDocument extraction pattern
- WAIaaS codebase analysis:
  - `packages/admin/src/api/client.ts` — `apiGet<T>` unsafe cast pattern (28 callsites)
  - `packages/admin/src/api/endpoints.ts` — 73 endpoint constants
  - `packages/admin/src/pages/wallets.tsx` — 12 manual interfaces, 60 type assertions
  - `packages/daemon/src/api/server.ts:980` — `app.doc('/doc', {...})` spec registration
  - `packages/admin/vitest.config.ts` — coverage thresholds (branches 80, functions 71, lines 87)
  - `turbo.json` — `@waiaas/admin#build` depends on `@waiaas/shared#build` and `@waiaas/daemon#build`

---
*Pitfalls research for: OpenAPI-based frontend type generation (v31.17)*
*Researched: 2026-03-15*
