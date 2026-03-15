# Stack Research

**Domain:** OpenAPI client type generation — Admin UI frontend type safety (v31.17)
**Researched:** 2026-03-15
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| openapi-typescript | ^7.13.0 | Generate TypeScript types from OpenAPI spec at build time | The standard for this use case: zero-runtime (pure `.d.ts` output), Node.js API accepts in-memory spec object (critical for the Hono extraction pattern), `--check` flag for CI freshness gate added in v7, TypeScript 5.x peer dep matches project |
| openapi-fetch | ^0.17.0 | Type-safe HTTP client wrapping native fetch | 6 KB runtime, auto-infers request/response types from generated types — eliminates the 28 manual `as T` casts in admin's `apiGet<T>` / `apiPost<T>`. Middleware pattern (`onRequest` / `onResponse`) handles `X-Master-Password` header injection and 401-logout cleanly. CSP-safe: wraps native fetch, no external CDN, no dynamic eval |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | Spec extraction already works via existing `createApp() + app.request('/doc')` pattern | The existing `validate-openapi.ts` approach is the right foundation for the generation script; no new dep needed |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `scripts/generate-api-types.ts` (new script) | Extract spec from Hono app in-memory, call `openapiTS(specObject)`, write `packages/admin/src/api/types.generated.ts` | Uses `openapiTS(specObject)` then `astToString()`. Reuses the same `createApp() + app.request('/doc')` extraction already proven in `validate-openapi.ts` |
| openapi-typescript `--check` flag | CI freshness gate — exits with code 1 if committed `types.generated.ts` is out of sync with current spec | Implemented in v7 (PR #1768, merged 2024-07-17). Alternative: regenerate in CI then `git diff --exit-code` on the generated file |

## Installation

```bash
# Root workspace devDependency (codegen script, not shipped to browser)
pnpm add -D openapi-typescript@^7.13.0 -w

# Admin package runtime dep (ships to browser bundle — 6 KB)
pnpm add openapi-fetch@^0.17.0 --filter @waiaas/admin
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| openapi-typescript (types only) | @hey-api/openapi-ts | If you want a full generated SDK with TanStack Query hooks, Zod schemas, and client classes. Overkill here — we only need types and a thin fetch client, and generated Zod would conflict with the Zod SSoT rule |
| openapi-fetch | Keep custom `apiCall<T>` wrapper | If the team only wants type annotations added on top and prefers not adopting a new library. However, `apiCall<T>` structurally requires 28 manual `as T` casts that openapi-fetch eliminates at the type system level |
| openapi-typescript Node API (in-memory spec object) | CLI with a committed `openapi.json` file | If the spec were static. In WAIaaS the spec is derived from the live Hono app (routes registered at runtime), so in-memory Node API extraction is the correct approach |
| `--check` flag in CI | git diff detection after regeneration | Both patterns work. `--check` is cleaner (no file writes in CI), git diff is simpler to understand |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| openapi-typescript-codegen (ferdikoomen) | Archived and unmaintained in 2024, security vulnerabilities unfixed | openapi-typescript + openapi-fetch |
| @hey-api/openapi-ts | Generates full SDK (clients, hooks, Zod schemas) — heavy and generated Zod schemas conflict with the Zod SSoT rule | openapi-typescript (types only) |
| swagger-codegen / openapi-generator (Java) | Java runtime in CI, generates verbose boilerplate, poor ESM support | openapi-typescript |
| Redocly CLI for spec extraction | External binary adds CI complexity; the existing `createApp()` + HTTP request pattern already works | Existing `createApp() + app.request('/doc')` pattern |
| Committed static `openapi.json` file | Becomes stale drift risk; WAIaaS spec is derived from route registration, not a static file | In-memory extraction via Node API |

## Stack Patterns by Variant

**For the generation script (`scripts/generate-api-types.ts`):**
- Use the openapi-typescript Node.js API: `import openapiTS, { astToString } from 'openapi-typescript'`
- Extract spec: `const app = createApp(); const res = await app.request('/doc'); const spec = await res.json();`
- Generate: `const ast = await openapiTS(spec); const content = astToString(ast);`
- Write to `packages/admin/src/api/types.generated.ts`
- Add `generate:api-types` to root `package.json` scripts, run it as prebuild of `@waiaas/admin`

**For CI freshness validation (two options):**

Option A — `--check` flag (cleaner, no file writes in CI):
```bash
# In CI: extract fresh spec, then check against committed types
tsx scripts/generate-api-types.ts --check
# Exits 1 if types.generated.ts is out of sync
```

Option B — git diff pattern (simpler to understand):
```bash
# In CI: regenerate, then fail if file changed
tsx scripts/generate-api-types.ts
git diff --exit-code packages/admin/src/api/types.generated.ts
```

**For the Admin UI client migration:**
- Create `packages/admin/src/api/typed-client.ts`: `createClient<paths>({ baseUrl: '' })` where `paths` is from generated types
- Inject `X-Master-Password` header via `onRequest` middleware (replaces current manual header logic in `apiCall`)
- Inject 401-logout via `onResponse` middleware (replaces current `if (response.status === 401)` in `apiCall`)
- Keep `ApiError` class — throw it from the `onResponse` middleware for error responses
- Keep `apiCall`/`apiGet`/`apiPost` during migration; replace call sites page by page
- Typed client and old wrapper coexist until all pages are migrated

**For CSP constraint (`default-src 'none'`):**
- openapi-fetch wraps native `fetch` — no dynamic script loading, no CDN deps, no `eval`
- Generated types file is pure TypeScript — no runtime component, no external fetch during codegen

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| openapi-typescript@7.x | typescript@^5.x | Peer dep `^5.x` — matches project's `typescript@^5.7.0` exactly |
| openapi-fetch@0.17.x | openapi-typescript@7.x | Must use same generation major — types from v7 are the expected input format for openapi-fetch v0.17 |
| openapi-fetch@0.17.x | Node.js 18+ | Wraps native fetch — Node 22 (project requirement) fully supported |
| openapi-typescript@7.x | @hono/zod-openapi@0.19.x | openapi-typescript consumes the OpenAPI 3.x JSON that Hono emits via `/doc` — format-compatible, no direct coupling |

## Integration Points with Existing Codebase

The project already has all prerequisites:

1. **Spec extraction pattern**: `createApp() + app.request('/doc')` in `scripts/validate-openapi.ts` — copy verbatim into the generation script
2. **tsx runtime**: Root `package.json` already uses `tsx` for all scripts (`tsx scripts/validate-openapi.ts`) — no new runner needed
3. **@apidevtools/swagger-parser**: Already a root devDependency — generation script can optionally validate before writing
4. **Admin API surface**: `packages/admin/src/api/endpoints.ts` has 73 endpoint constants and `packages/admin/src/api/client.ts` has 5 typed wrappers — these are the migration targets
5. **Build pipeline order**: `@waiaas/daemon` prebuild already copies admin dist; generation script runs before admin Vite build and after daemon TypeScript compilation (which produces the spec)

## Sources

- https://openapi-ts.dev/node — Node.js API: `openapiTS(object)` accepts in-memory JSON, `astToString()` helper — HIGH confidence (official docs)
- https://openapi-ts.dev/openapi-fetch/ — bundle size (6 KB), type inference eliminates generics, Node.js 18+ requirement — HIGH confidence (official docs)
- https://openapi-ts.dev/openapi-fetch/middleware-auth — `onRequest`/`onResponse` middleware pattern, auth header injection example — HIGH confidence (official docs)
- https://openapi-ts.dev/migration-guide — v7 breaking changes: TypeScript AST output, `--default-non-nullable` now default, URL-typed file paths — HIGH confidence (official docs)
- https://github.com/openapi-ts/openapi-typescript/issues/1615 — `--check` flag: implemented in PR #1768, merged 2024-07-17, issue closed 2024-08-05 — HIGH confidence (GitHub)
- `npm view openapi-typescript version` → `7.13.0` (verified 2026-03-15)
- `npm view openapi-fetch version` → `0.17.0` (verified 2026-03-15)
- `npm view openapi-typescript peerDependencies` → `{ typescript: '^5.x' }` (verified 2026-03-15)

---
*Stack research for: OpenAPI client type generation for WAIaaS Admin UI (v31.17)*
*Researched: 2026-03-15*
