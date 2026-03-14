# Architecture Research

**Domain:** OpenAPI type generation integration — monorepo frontend type safety
**Researched:** 2026-03-15
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Build Pipeline (new)                               │
│                                                                       │
│  @waiaas/daemon (createApp stub)                                      │
│      │  app.request('/doc') → JSON                                    │
│      ▼                                                                │
│  scripts/extract-openapi.ts ──────► openapi.json (committed)         │
│                                          │                            │
│                               openapi-typescript CLI                  │
│                                          │                            │
│                                          ▼                            │
│                        packages/admin/src/api/types.generated.ts      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    packages/daemon (unchanged runtime)                │
│                                                                       │
│  createApp(deps: CreateAppDeps) → OpenAPIHono                         │
│      routes registered with createRoute() + .openapi()               │
│      GET /doc → spec served at runtime                                │
│      openapi-schemas.ts → Zod SSoT response schemas                  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    packages/admin (modified)                          │
│                                                                       │
│  api/types.generated.ts  ◄── openapi-typescript output (committed)   │
│  api/client.ts           ──── thin typed wrapper over existing fetch  │
│  api/typed-client.ts     ──── NEW: typed wrappers using generated T   │
│  utils/settings-helpers.ts ── MODIFIED: remove manual interfaces      │
│  pages/*.tsx             ──── MODIFIED: use generated types           │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    packages/shared (extended)                         │
│                                                                       │
│  src/networks.ts         ── existing: NETWORK_TYPES, EVM_NETWORK_TYPES│
│  src/index.ts            ── existing re-exports                       │
│  src/providers.ts        ── NEW: BUILTIN_PROVIDERS array (moved from  │
│                               admin/pages/actions.tsx)                │
│  src/policy-types.ts     ── NEW: POLICY_TYPES, APPROVAL_METHODS etc  │
│                               (moved from admin inline consts)        │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    CI freshness gate (new)                            │
│                                                                       │
│  scripts/check-openapi-freshness.ts                                   │
│      re-extracts spec at CI time                                      │
│      diffs against committed openapi.json                             │
│      fails if stale → blocks PR merge                                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `scripts/extract-openapi.ts` | Build-time spec extraction via `createApp({})` stub | tsx script, calls `app.request('/doc')`, writes `openapi.json` |
| `openapi.json` (root or packages/daemon) | Committed snapshot, source for type gen | JSON, regenerated via `pnpm run generate:types` |
| `openapi-typescript` CLI | Converts OpenAPI JSON to TypeScript path/component types | `npx openapi-typescript openapi.json -o types.generated.ts` |
| `packages/admin/src/api/types.generated.ts` | Generated TypeScript types, never hand-edited | OpenAPI paths/components as TS interfaces |
| `packages/admin/src/api/typed-client.ts` | Thin typed wrappers over existing `apiGet/apiPost` | Uses generated `components['schemas']` to constrain return types |
| `packages/shared/src/providers.ts` | Source-of-truth provider list (moved from Admin UI inline array) | Pure TS array, no native deps |
| `scripts/check-openapi-freshness.ts` | CI gate: fails if `openapi.json` is stale | Re-extracts, diffs, exits 1 on mismatch |

## Recommended Project Structure

```
packages/
├── daemon/
│   └── src/api/
│       ├── server.ts          # createApp() — unchanged, stub-capable
│       └── routes/
│           └── openapi-schemas.ts  # Zod SSoT — unchanged
├── shared/
│   └── src/
│       ├── index.ts           # re-exports (add providers.ts, policy-types.ts)
│       ├── networks.ts        # existing — unchanged
│       ├── providers.ts       # NEW: BUILTIN_PROVIDERS array
│       └── policy-types.ts    # NEW: POLICY_TYPES, APPROVAL_METHODS, TX_TYPES
├── admin/
│   └── src/
│       ├── api/
│       │   ├── client.ts      # existing apiGet/apiPost/apiPut — unchanged
│       │   ├── endpoints.ts   # existing API const map — unchanged
│       │   ├── typed-client.ts    # NEW: typed wrappers using generated paths
│       │   └── types.generated.ts # GENERATED: openapi-typescript output
│       └── pages/
│           └── *.tsx          # MODIFIED: swap manual interfaces for generated types
scripts/
├── extract-openapi.ts         # NEW: stub createApp, GET /doc, write JSON
├── check-openapi-freshness.ts # NEW: CI gate script
└── validate-openapi.ts        # existing
openapi.json                   # COMMITTED: extracted spec snapshot
```

### Structure Rationale

- **`openapi.json` committed at repo root:** Checked-in so CI can diff without rebuilding daemon. Placement at root keeps it alongside other scripts-level artifacts.
- **`types.generated.ts` inside `packages/admin/src/api/`:** Generated file lives alongside existing `client.ts` and `endpoints.ts` — discoverable by consumers (pages) without cross-package import.
- **`typed-client.ts` as a new file (not modifying `client.ts`):** Preserves the working `apiGet<T>` pattern while layering generated types on top. Migration is incremental — each page can be migrated independently.
- **`providers.ts` and `policy-types.ts` in `packages/shared/`:** These are the hardcoded arrays currently duplicated in Admin UI. Moving them to `@waiaas/shared` makes them importable from daemon for validation and from Admin UI for display — zero duplication, zero native deps.

## Architectural Patterns

### Pattern 1: Stub-deps Spec Extraction

**What:** Call `createApp({})` (no deps passed) in a build-time script to obtain a fully-registered OpenAPIHono app, then call `app.request('/doc')` to extract the JSON spec. Routes that guard on `if (deps.db)` are simply absent from the spec — acceptable because core response schemas are registered as named OpenAPI components in `openapi-schemas.ts` regardless.

**When to use:** Any time the OpenAPI spec needs to be materialized as a file (build-time type gen, CI freshness check).

**Trade-offs:** Routes requiring deps (most routes) are absent from the stub spec paths. The component schemas (Zod SSoT response shapes) are still emitted because `openapi-schemas.ts` registers them at module load time. For Admin UI usage this is acceptable — path-level URL parameter types are not needed; only response body shapes are.

**Example:**
```typescript
// scripts/extract-openapi.ts
import { createApp } from '../packages/daemon/src/api/server.js';
import { writeFile } from 'node:fs/promises';

const app = createApp({}); // stub: no db, keyStore, etc.
const res = await app.request('/doc', { headers: { Host: '127.0.0.1:3100' } });
const spec = await res.json();
await writeFile('openapi.json', JSON.stringify(spec, null, 2));
console.log('openapi.json written');
```

This pattern is already proven: `scripts/validate-openapi.ts` uses the identical `createApp({})` approach to extract and validate the spec.

### Pattern 2: Generated-type Constraint on Existing Client

**What:** Keep the existing `apiGet<T>` / `apiPost<T>` functions unchanged. Add a thin `typed-client.ts` that hard-codes the `T` type parameter using types from `types.generated.ts`. Callers import from `typed-client.ts` instead of casting manually.

**When to use:** When migrating Admin UI pages from manual interface definitions to generated types. Use per-page — each page migration is independent and reversible.

**Trade-offs:** Does not enforce URL correctness (URL is still a plain string from `endpoints.ts`). Provides return-type safety without requiring full `openapi-fetch` adoption. Low migration risk. If `openapi-fetch` adoption is desired later, `typed-client.ts` is the single replacement point.

**Example:**
```typescript
// packages/admin/src/api/typed-client.ts
import { apiGet, apiPost } from './client';
import type { components } from './types.generated';

export type WalletRow = components['schemas']['WalletResponse'];
export type WalletList = components['schemas']['WalletListResponse'];
export type SessionRow = components['schemas']['SessionResponse'];

export const getWallets = () => apiGet<WalletList>('/v1/wallets');
export const getWallet = (id: string) => apiGet<WalletRow>(`/v1/wallets/${id}`);
```

### Pattern 3: @waiaas/shared Re-export for Hardcoded Arrays

**What:** Move arrays currently hardcoded in Admin UI (e.g., `BUILTIN_PROVIDERS` in `actions.tsx`, transaction type arrays in policy forms) to `packages/shared/src/`. Export from `@waiaas/shared`. Both daemon and Admin UI import from `@waiaas/shared`.

**When to use:** Any constant array that is currently duplicated between daemon source (for API validation) and Admin UI (for display). Prevents drift between client and server representations.

**Trade-offs:** Requires `packages/shared` build step before `packages/admin` build — already enforced by existing `turbo.json`. Adding a new file to `packages/shared` triggers a rebuild of `@waiaas/admin` via the existing Turbo dependency.

**Example:**
```typescript
// packages/shared/src/providers.ts
export const BUILTIN_PROVIDER_KEYS = [
  'jupiter_swap', 'zerox_swap', 'dcent_swap', 'lifi',
  'lido_staking', 'jito_staking', 'aave_v3', 'kamino',
  'pendle_yield', 'drift', 'hyperliquid_perp',
  'hyperliquid_spot', 'hyperliquid_sub', 'across_bridge',
] as const;
export type BuiltinProviderKey = (typeof BUILTIN_PROVIDER_KEYS)[number];
```

## Data Flow

### Type Generation Flow (build-time)

```
pnpm run generate:types
    │
    ├─► scripts/extract-openapi.ts
    │       createApp({}) → app.request('/doc') → openapi.json
    │
    └─► openapi-typescript openapi.json
            -o packages/admin/src/api/types.generated.ts
```

### CI Freshness Gate Flow

```
CI: pnpm run check:openapi-freshness
    │
    ├─► re-run scripts/extract-openapi.ts → spec_live.json (tmp)
    │
    └─► diff openapi.json spec_live.json
            equal → pass
            different → exit 1 (PR blocked until developer runs generate:types)
```

### Admin UI Typed Fetch Flow (runtime, new)

```
Admin Page Component
    │
    ├─► typed-client.ts (NEW): getWallets() → apiGet<WalletList>(...)
    │       │                  return type: WalletList (from generated types)
    │       ▼
    │   api/client.ts (existing): apiCall<T>(path, options)
    │       │  fetch() + auth header + error handling
    │       ▼
    │   Daemon /v1/wallets (runtime response)
    │       ▼
    └─► WalletList — TypeScript type verified at compile-time
```

### Key Data Flows

1. **Spec extraction:** `createApp({})` emits routes registered unconditionally (health, /doc, public routes) plus all OpenAPI component schemas. The `GET /doc` endpoint is always registered regardless of deps (confirmed in `server.ts` line 980).
2. **Type propagation:** Generated `types.generated.ts` exports `paths` and `components` namespaces. `typed-client.ts` reads `components['schemas']['X']` for response types.
3. **Hardcoded constant migration:** `BUILTIN_PROVIDERS` in `actions.tsx` → `@waiaas/shared` → imported in both daemon (for settings key validation) and Admin UI (for display). Merge at render time with runtime state from `GET /v1/actions/providers`.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (62 manual interfaces, 28 manual casts) | Pattern 2 (typed-client.ts) handles this — no library changes needed |
| Full OpenAPI URL safety | Adopt `openapi-fetch` `createClient<paths>()` — URLs type-checked against spec paths |
| Monorepo-wide type sharing | Promote `types.generated.ts` to `@waiaas/shared` if SDK also needs generated types |

### Scaling Priorities

1. **First bottleneck:** Stub spec coverage — `createApp({})` only emits routes registered without deps. Resolution: accept coverage gap for path types; rely on integration tests for runtime correctness. Core schema types are always emitted via named components.
2. **Second bottleneck:** CI freshness gate speed — re-extracting spec on every CI run adds ~2-5 seconds. Cache with `turbo` outputs if needed.

## Anti-Patterns

### Anti-Pattern 1: Importing @waiaas/core or @waiaas/daemon from Admin UI

**What people do:** Try to share Zod schemas directly from `@waiaas/core` or route handler types from `@waiaas/daemon` into the Admin UI bundle.

**Why it's wrong:** `@waiaas/core` imports `sodium-native` and other native Node.js binaries. `@waiaas/daemon` imports `better-sqlite3`. Both break at Vite build time for the browser target. This is the exact reason `@waiaas/shared` exists as a pure-TS, no-native-deps package.

**Do this instead:** Use the generated `types.generated.ts` file (derived from the daemon OpenAPI spec at build time, pure JSON schema output) or move pure constants to `@waiaas/shared`.

### Anti-Pattern 2: Generating Types at Vite Build Time

**What people do:** Add a Vite plugin or `vite.config.ts` hook that runs `openapi-typescript` during `vite build`.

**Why it's wrong:** Makes frontend build depend on daemon being importable into Vite context (native dep problem above). Slows down Vite dev server startup. Creates circular build dependency.

**Do this instead:** Run type generation as a separate pre-build script (`pnpm run generate:types`) and commit the output file. Vite consumes the committed `.ts` file like any other source file.

### Anti-Pattern 3: Dynamically Resolving Provider Lists via Runtime API Only

**What people do:** Remove `BUILTIN_PROVIDERS` from Admin UI and replace with a `GET /v1/actions/providers` call that also returns category/description metadata.

**Why it's wrong:** The Admin UI needs provider metadata (description, docs URL, chain type) even before providers are registered in the daemon (e.g., for settings forms). Pure runtime discovery cannot provide static metadata. Expanding the API response to include all display metadata couples daemon to Admin UI display concerns.

**Do this instead:** Move static display metadata (`BUILTIN_PROVIDERS`) to `@waiaas/shared` (compile-time). Use `GET /v1/actions/providers` for runtime state (enabled, hasApiKey, actions list). Merge both at render time. Static config in `@waiaas/shared`, dynamic state from API.

### Anti-Pattern 4: Manually Maintaining types.generated.ts

**What people do:** Hand-edit the generated file to add or fix types.

**Why it's wrong:** The file will be overwritten on the next `pnpm run generate:types`. Manual edits are lost and create divergence between spec and types.

**Do this instead:** Fix the Zod schema in `openapi-schemas.ts` in the daemon, then re-run `generate:types`. All fixes flow from the Zod SSoT.

## Integration Points

### New Components

| Component | Location | Integrates With |
|-----------|----------|-----------------|
| `scripts/extract-openapi.ts` | `scripts/` (root) | `packages/daemon/src/api/server.ts` — calls `createApp({})` |
| `scripts/check-openapi-freshness.ts` | `scripts/` (root) | CI pipeline (`ci.yml`) + committed `openapi.json` |
| `packages/admin/src/api/types.generated.ts` | `packages/admin/src/api/` | `typed-client.ts`, migrated pages |
| `packages/admin/src/api/typed-client.ts` | `packages/admin/src/api/` | `client.ts` (calls through), `types.generated.ts` (type constraints) |
| `packages/shared/src/providers.ts` | `packages/shared/src/` | Admin UI `actions.tsx` (import), daemon settings validation |
| `packages/shared/src/policy-types.ts` | `packages/shared/src/` | Admin UI policy forms, daemon Zod schemas (reference) |

### Modified Components

| Component | Change | Why |
|-----------|--------|-----|
| `packages/admin/src/pages/actions.tsx` | Remove `BUILTIN_PROVIDERS` array, import from `@waiaas/shared` | Eliminate hardcoded duplicate |
| `packages/admin/src/pages/*.tsx` (per page) | Replace manual `interface Wallet {...}` etc. with types from `typed-client.ts` | Type safety from generated source |
| `packages/admin/src/utils/settings-helpers.ts` | Replace manual `SettingsData`, `ApiKeyEntry`, `RpcTestResult` interfaces with generated equivalents where available | Eliminate drift |
| `packages/shared/src/index.ts` | Add exports for new `providers.ts` and `policy-types.ts` | Make new constants discoverable |
| `turbo.json` | Add `generate:types` task between `@waiaas/shared#build` and `@waiaas/admin#build` | Ensure generated file is fresh before Vite build |
| `package.json` (root) | Add `generate:types` and `check:openapi-freshness` scripts | Developer workflow + CI hook |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| daemon → openapi.json | Build-time: `extract-openapi.ts` calls `createApp({})` | No runtime dependency; daemon source evaluated via tsx, not compiled dist |
| openapi.json → types.generated.ts | Build-time: `openapi-typescript` CLI transform | Pure file transformation; no daemon code involved |
| types.generated.ts → typed-client.ts | Compile-time: TypeScript import | Generated file is committed; Vite/tsc reads it like any source file |
| @waiaas/shared → @waiaas/admin | Compile-time + bundle-time: workspace import | Already established; adding new exports follows same pattern |
| daemon → @waiaas/shared | Compile-time: workspace import | Adding provider key constants to shared for settings validation |

## Build Order Changes

### Current Turbo Order
```
@waiaas/shared#build
    → @waiaas/admin#build (Vite)
    → @waiaas/daemon#build (prebuild copies admin/dist, then tsc)

@waiaas/core#build → @waiaas/daemon#build
```

### New Turbo Order (with type generation)
```
@waiaas/shared#build
    → generate:types (extract-openapi.ts + openapi-typescript CLI)
    → @waiaas/admin#build (Vite — consumes types.generated.ts)
    → @waiaas/daemon#build (prebuild copies admin/dist, then tsc)

@waiaas/core#build → @waiaas/daemon#build
```

The `generate:types` task:
1. Depends on `@waiaas/shared#build` (shared types needed for daemon source compilation via tsx).
2. Does NOT depend on `@waiaas/daemon#build` — runs `extract-openapi.ts` directly against TS source via `tsx`, avoiding circular dependency.
3. Is declared as a dependency of `@waiaas/admin#build` in `turbo.json`.

**Concrete turbo.json addition:**
```json
"generate:types": {
  "dependsOn": ["@waiaas/shared#build"],
  "outputs": ["openapi.json", "packages/admin/src/api/types.generated.ts"],
  "cache": true
},
"@waiaas/admin#build": {
  "dependsOn": ["generate:types", "@waiaas/shared#build"],
  "outputs": ["dist/**"]
}
```

The existing `validate-openapi.ts` script already proves the `tsx`-direct approach works: it runs `createApp({})` using tsx without a prior daemon build step.

## Sources

- [openapi-typescript documentation](https://openapi-ts.dev/openapi-fetch/) — HIGH confidence, official docs
- [openapi-fetch createClient API](https://openapi-ts.dev/openapi-fetch/api) — HIGH confidence, official docs
- [@hono/zod-openapi GET /doc pattern](https://hono.dev/examples/zod-openapi) — HIGH confidence, official Hono docs
- Existing `scripts/validate-openapi.ts` — confirmed `createApp({})` stub pattern works (code in repo, verified directly)
- Existing `packages/daemon/src/api/server.ts` — confirmed `app.doc('/doc', {...})` is always registered regardless of deps (line 980)
- Existing `packages/admin/src/api/client.ts` — confirmed `apiGet<T>` / `apiPost<T>` wrapper pattern (code in repo)
- Existing `packages/admin/src/pages/actions.tsx` — confirmed `BUILTIN_PROVIDERS` hardcoded array (code in repo)

---
*Architecture research for: OpenAPI type generation integration in WAIaaS monorepo*
*Researched: 2026-03-15*
