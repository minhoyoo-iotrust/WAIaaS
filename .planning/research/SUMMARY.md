# Project Research Summary

**Project:** v32.10 에이전트 스킬 정리 + OpenClaw 플러그인
**Domain:** AI Agent SDK integration — skill file restructuring, plugin packaging, documentation
**Researched:** 2026-03-18
**Confidence:** HIGH

## Executive Summary

This milestone has two tightly coupled goals: (1) clean the agent-facing skill files of all masterAuth content so AI agents stop encountering 401 failures, and (2) package WAIaaS as a first-class OpenClaw plugin that installs via `openclaw plugins install @waiaas/openclaw-plugin`. Both goals share a core principle — strict agent/admin boundary enforcement. Research confirms that the recommended approach is content extraction (not reorganization): masterAuth content moves to a new `docs/admin-manual/` directory while agent skills become sessionAuth-only. The OpenClaw plugin is then built as a thin stateless SDK wrapper exposing exactly the ~22 sessionAuth tools that remain after cleanup.

The recommended stack requires zero new libraries. The OpenClaw plugin uses `openclaw/plugin-sdk/core` as a peerDependency for types, and `@waiaas/sdk` as the sole runtime dependency. Build tooling (TypeScript 5.7, vitest 3.0) and documentation tooling (site/build.mjs with gray-matter + marked) are all existing infrastructure. The package structure mirrors existing monorepo packages, uses ESM output, and integrates with the existing release-please + npm trusted publishing pipeline without modifications to the pipeline itself.

The key risks concentrate in two areas: silent failures and boundary leakage. The pre-existing `EXCLUDE_DIRS = ['admin-manual']` in `site/build.mjs` (line 30) will silently suppress admin manual pages if not removed. The `sync-skills.mjs` script has no exclusion logic and will blindly recopy any admin files that accidentally land in `skills/`. On the plugin side, the principal risk is declaring `@waiaas/sdk` as a regular dependency instead of a peer dependency, causing duplicate SDK instances. All five critical pitfalls have deterministic prevention strategies: grep-based validation scripts, explicit tool allowlists, and post-build page count checks.

## Key Findings

### Recommended Stack

No new libraries are required. The OpenClaw plugin is a new package (`packages/openclaw-plugin/`) using the existing monorepo toolchain. The manifest-level integration uses `openclaw/plugin-sdk/core` as an optional peerDependency (types only; runtime provided by OpenClaw Gateway). Actual API calls flow through `@waiaas/sdk`, a zero-dependency package, keeping the plugin bundle minimal. Documentation generation extends `site/build.mjs` with a one-line change.

**Core technologies:**
- `openclaw/plugin-sdk/core` (peerDependency): OpenClaw plugin type definitions — provides `OpenClawPluginDefinition` and `OpenClawPluginApi` types without bundling the full Gateway runtime
- `@waiaas/sdk ^2.11.0` (runtime dependency): All tool handlers delegate to this; zero-dependency and safe to bundle; declared as peerDependency to avoid version coupling
- `TypeScript ^5.7` (devDependency): Existing monorepo tsconfig reused; ESM output required by OpenClaw's jiti loader
- `site/build.mjs` (existing): Handles admin-manual HTML generation by removing `'admin-manual'` from `EXCLUDE_DIRS`; no new documentation tooling needed

### Expected Features

Research confirms a clear priority ordering. The skill cleanup is the prerequisite for everything else — the plugin's tool list cannot be finalized until the agent-only boundary is established.

**Must have (table stakes):**
- Agent-only skill files (13 files, 0 masterAuth references outside the standard security notice) — agents currently experience 401 failures on every admin endpoint they encounter; ~43 masterAuth references across 7 mixed files require surgical extraction
- `openclaw.plugin.json` manifest with `id`, `configSchema` (sessionToken required, daemonUrl with default), `uiHints` (sessionToken `sensitive: true`)
- `register(api)` synchronous entry point registering ~22 sessionAuth-only tools via `api.registerTool()`
- `docs/admin-manual/` with 8 markdown files containing extracted masterAuth content and standard frontmatter (`section: "docs"`)
- npm package `@waiaas/openclaw-plugin` publishable via existing CI/CD pipeline
- `docs/guides/` renamed to `docs/agent-guides/` with all references updated

**Should have (differentiators):**
- `uiHints` with `sensitive: true` on sessionToken (most plugins omit this; WAIaaS has high-value security credentials)
- `providerAuthEnvVars: ["WAIAAS_SESSION_TOKEN", "WAIAAS_DAEMON_URL"]` for CI/CD headless config
- SEO build inclusion: admin-manual pages + OpenClaw landing page in sitemap.xml and llms-full.txt (~31 total URLs, up from 22)
- Domain-grouped tool files (wallet/transfer/defi/nft/utility) mirroring MCP tool structure for parity verification

**Defer (v2+):**
- Hyperliquid, Polymarket, ERC-8004, ERC-8128, x402 tools — specialized protocols; suitable as separate OpenClaw plugins when demand exists
- Interactive features in admin-manual — static markdown is the correct format; Admin UI handles interactive config

### Architecture Approach

The architecture is a clean four-component separation. `skills/` (root) becomes the SSoT for agent-only content (13 files). A new `packages/openclaw-plugin/` is a thin stateless bridge: its `register()` creates a single `WAIaaSClient` from OpenClaw-validated config and calls `api.registerTool()` 22 times, each handler delegating directly to one SDK method. `docs/admin-manual/` becomes the canonical location for masterAuth content, fed into the SEO build. The existing `site/build.mjs` handles HTML generation for admin-manual by removing the pre-existing exclusion.

**Major components:**
1. `skills/` (root, modified) — SSoT agent-only skill files; 2 files removed (`admin.skill.md`, `setup.skill.md`), 7 files trimmed of masterAuth content; `sync-skills.mjs` copies to npm distributable with added admin-marker validation
2. `packages/openclaw-plugin/` (new) — OpenClaw manifest + synchronous `register(api)` entry + 5 domain tool files (wallet/transfer/defi/nft/utility); depends only on `@waiaas/sdk` as peerDependency; single `WAIaaSClient` instance created once in `register()` from `api.config`
3. `docs/admin-manual/` (new) — 8 markdown files with standard frontmatter (`section: "docs"`, `category: "Admin Manual"`); content extracted (not copied) from skill files; fed into `site/build.mjs`
4. `docs/agent-guides/` (renamed from `docs/guides/`) — 5 existing guide files; zero published URL impact since build routes via frontmatter `section`/`slug`, not filesystem path
5. `site/build.mjs` (modified one line) — `EXCLUDE_DIRS = []`; auto-generates HTML, sitemap.xml, llms-full.txt for all docs

### Critical Pitfalls

1. **Reference breakage cascade from docs/guides/ rename** — Run `grep -rn 'docs/guides' .` before and after; update README.md (4 links on lines 136, 218-221), site/index.html (1 link on line 1238), guide internal cross-references; leave archived planning docs unchanged (historical records)
2. **masterAuth content leaking into agent skills after incomplete extraction** — After extraction, run `grep -c 'masterAuth\|master_password\|X-Master-Password' skills/*.skill.md`; only the standard security notice pattern is acceptable; automate as CI check; ~43 references across 7 files require section-by-section review
3. **SDK declared as regular dependency causing version coupling** — Declare `@waiaas/sdk` as `peerDependency: ">=2.11.0"` and separately as `devDependency`; regular dependency causes duplicate SDK instances, type conflicts, and forces coordinated releases
4. **sync-skills.mjs blind copy of any admin files** — Script uses blanket `*.skill.md` glob with no exclusion logic; add post-copy validation scanning for `> **Operator only.**` admin marker and failing if found; prevents future regressions
5. **EXCLUDE_DIRS silently blocks admin-manual pages with zero warning** — `site/build.mjs` line 30 has `['admin-manual']` pre-configured; remove before Phase 4 SEO build; verify with post-build page count (`~31 = 22 existing + 9 new`)

## Implications for Roadmap

The dependency chain is deterministic. Content restructuring is the prerequisite for plugin tool list finalization, which is the prerequisite for CI/CD and documentation polish. Four phases map directly to the architecture's component boundaries.

### Phase 1: Document Structure Rename
**Rationale:** Isolated filesystem operation with no code dependencies; establishes the `docs/agent-guides/` path that subsequent phases reference; zero URL impact makes it safe to do first
**Delivers:** `docs/guides/` renamed to `docs/agent-guides/`; README.md and site/index.html updated; site build verified (URL output unchanged)
**Addresses:** docs/guides/ rename (table stakes feature)
**Avoids:** Pitfall 1 (reference breakage cascade) — use grep before/after to verify 0 remaining references in non-archived files

### Phase 2: Skills Cleanup + Admin Manual Creation
**Rationale:** Must happen before plugin work because the plugin's 22-tool allowlist is defined by what remains in agent skills after cleanup; admin manual must be written before trimming skills (content must exist before the source is removed)
**Delivers:** 13 agent-only skill files with 0 masterAuth references outside security notice; `docs/admin-manual/` with 8 files + README index; `sync-skills.mjs` updated with admin-marker validation; `openclaw.ts` installer output fixed (remove WAIAAS_MASTER_PASSWORD from line 59); site/build.mjs EXCLUDE_DIRS cleared; `packages/skills/` CLI updated to remove admin/setup from install targets
**Addresses:** Agent-only skill files, docs/admin-manual/ (table stakes); progressive disclosure (differentiator)
**Avoids:** Pitfall 2 (masterAuth residue), Pitfall 4 (sync-skills blind copy), Pitfall 10 (installer MASTER_PASSWORD output), Pitfall 13 (admin-manual section misrouting — use `section: "docs"` not `"blog"`)

### Phase 3: OpenClaw Plugin Package
**Rationale:** Depends on Phase 2 finalized tool list; plugin is a thin bridge with no business logic; `register()` must be synchronous (OpenClaw constraint: async register() is silently ignored); single WAIaaSClient created from OpenClaw-validated config
**Delivers:** `packages/openclaw-plugin/` with `openclaw.plugin.json` manifest, `src/index.ts` (synchronous `register()`), 5 domain tool files (~22 tools with `waiaas_` prefix), test suite including admin tool exclusion test; turbo.json build task (depends on `@waiaas/sdk#build`); release-please-config.json entry
**Uses:** `openclaw/plugin-sdk/core` (types), `@waiaas/sdk` as peerDependency + devDependency, TypeScript ESM build
**Implements:** OpenClaw plugin architecture component
**Avoids:** Pitfall 3 (SDK coupling — use peerDependency `>=2.11.0`), Pitfall 6 (admin tools in register() — explicit sessionAuth-only allowlist), Pitfall 7 (manifest format mismatch — fully researched in STACK.md with HIGH confidence), Pitfall 11 (turbo build order — declare SDK dependency explicitly)

### Phase 4: CI/CD, Documentation, SEO
**Rationale:** All functional changes complete; this phase validates integration, enables npm publishing, and surfaces documentation to search engines and AI crawlers; release-please must be configured in BOTH config and manifest files
**Delivers:** Updated `docs/agent-guides/openclaw-integration.md` (plugin method first, skills legacy method second); `docs/seo/openclaw-plugin.md` SEO landing page; `skills/integrations.skill.md`; `packages/openclaw-plugin/README.md`; `.release-please-manifest.json` entry; verified sitemap.xml (~31 URLs) and llms-full.txt; npm publish dry-run
**Avoids:** Pitfall 5 (EXCLUDE_DIRS already cleared in Phase 2), Pitfall 8 (stale sitemap — post-build page count check), Pitfall 9 (release-please manifest desync — add to BOTH `release-please-config.json` AND `.release-please-manifest.json`)

### Phase Ordering Rationale

- Phase 1 before Phase 2: The rename establishes the `docs/agent-guides/` path; Phase 2 creates admin-manual as a sibling
- Phase 2 before Phase 3: The plugin's 22-tool allowlist is derived from cleaned agent skills; cannot finalize the list until cleanup is complete
- Phase 3 before Phase 4: README, integration guide, and SEO page reference the plugin package; npm dry-run requires the package to exist
- Admin manual creation before skill trimming (within Phase 2): Content must be preserved before it is removed from skills

### Research Flags

Phases with well-documented patterns (skip additional research):
- **Phase 1 (rename):** Pure filesystem + reference update; standard git mv pattern with grep validation
- **Phase 2 (skills cleanup):** Content extraction; all target files and counts are already known (43 masterAuth references in 7 files, 2 files to remove, 5 installers to update)
- **Phase 3 (plugin):** OpenClaw manifest format, `register(api)` API, tool registration pattern, and npm packaging are fully documented in STACK.md and ARCHITECTURE.md with HIGH confidence; the objective's pre-research flag has been resolved by this research
- **Phase 4 (CI/CD):** Follow existing `packages/skills` pattern exactly for release-please; no new pipeline components

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | OpenClaw official docs + GitHub source confirmed manifest format, `register()` API, tool registration; npm packaging decisions follow established monorepo patterns with exact precedents |
| Features | HIGH | Tool list derived from codebase inspection of existing 42 MCP tools; sessionAuth boundary verified against SDK method signatures; exact file counts and names confirmed by direct codebase analysis |
| Architecture | HIGH | All component relationships verified against actual codebase files with line numbers (site/build.mjs line 30, sync-skills.mjs glob pattern, openclaw.ts line 59, turbo.json, release-please-config.json) |
| Pitfalls | HIGH | All critical pitfalls sourced from direct codebase analysis with specific line references; grep counts verified; not inferred from general patterns |

**Overall confidence:** HIGH

### Gaps to Address

- **OpenClaw `register()` signature variant:** STACK.md notes two valid patterns — `export default { register(api) {...} }` (object with method) vs `export default function register(api)` (plain function). Research shows both work but notes `async register()` is silently ignored. Confirm the exact pattern expected by the specific OpenClaw version in the target environment before Phase 3 implementation.
- **`@waiaas/sdk` peer dependency range:** The recommended `">=2.11.0"` range assumes no breaking API changes in the SDK after 2.11. Validate SDK changelog discipline before committing to the peer range; a tighter `"^2.11.0"` range is safer if the SDK has not yet committed to SemVer stability.
- **`api.config` availability at `register()` call time:** Architecture uses `api.config` in `register()` to create one shared WAIaaSClient. STACK.md references both `ctx.config` (in handler) and `api.config` (in register). Confirm that `api.config` is populated before `register()` is called in the actual OpenClaw runtime (not just in handler context).

## Sources

### Primary (HIGH confidence)
- [OpenClaw Plugin Documentation](https://docs.openclaw.ai/tools/plugin) — manifest format, `register(api)`, configSchema, uiHints, tool registration API
- [OpenClaw GitHub plugin.md](https://github.com/openclaw/openclaw/blob/main/docs/tools/plugin.md) — plugin types, loading pipeline, capability registration
- Codebase inspection: `site/build.mjs`, `packages/skills/`, `packages/mcp/src/tools/` (45 files), `packages/sdk/`, `turbo.json`, `release-please-config.json` — all component relationships verified directly against source

### Secondary (MEDIUM confidence)
- [OpenClaw Plugin Architecture (DeepWiki)](https://deepwiki.com/openclaw/openclaw/9.1-plugin-architecture) — in-process loading model, jiti loader
- [OpenClaw Plugin SDK Deep Dive (DEV Community)](https://dev.to/wonderlab/openclaw-deep-dive-4-plugin-sdk-and-extension-development-51ki) — `register()` patterns, factory pattern for tool arrays
- [OpenClaw Plugin Manifest (LearnClawdBot)](https://www.learnclawdbot.org/docs/plugins/manifest) — field details, configPatch
- [Plugin SDK Fundamentals (zread.ai)](https://zread.ai/openclaw/openclaw/18-plugin-sdk-fundamentals) — SDK fundamentals
- [Coinbase AgentKit](https://github.com/coinbase/agentkit) — AI wallet tool exposure pattern (admin/agent separation reference)
- [Agent Skills Specification](https://agentskills.io/home) — progressive disclosure best practice

### Tertiary (LOW confidence)
- [What Are AI Agent Plugins (nevo.systems)](https://nevo.systems/blogs/nevo-journal/what-are-ai-agent-plugins) — 2026 plugin ecosystem trends; informational context only

---
*Research completed: 2026-03-18*
*Ready for roadmap: yes*
