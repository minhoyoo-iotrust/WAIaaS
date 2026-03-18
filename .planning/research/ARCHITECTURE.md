# Architecture Patterns

**Domain:** Agent Skill Cleanup + OpenClaw Plugin + Admin Manual
**Researched:** 2026-03-18

## Recommended Architecture

### High-Level Integration Map

```
                       +-----------------------+
                       |    skills/ (SSoT)     |
                       |  (agent-only, 13 files)|
                       +-----------+-----------+
                                   |
                    sync-skills.mjs (prebuild copy)
                                   |
               +-------------------+-------------------+
               |                                       |
    +----------v-----------+             +-------------v-----------+
    |  packages/skills     |             | packages/openclaw-plugin |
    |  @waiaas/skills      |             | @waiaas/openclaw-plugin  |
    |  (npx CLI install)   |             | (register() + tools)    |
    +----------------------+             +------+------------------+
                                                |
                                         imports @waiaas/sdk
                                                |
                                    +-----------v-----------+
                                    |    packages/sdk       |
                                    |    @waiaas/sdk        |
                                    |    (WAIaaSClient)     |
                                    +-----------------------+

    +---------------------------+     +---------------------------+
    |  docs/admin-manual/ (8)   |     |  docs/agent-guides/ (5)  |
    |  (masterAuth content)     |     |  (renamed from guides/)  |
    +------------+--------------+     +------------+--------------+
                 |                                 |
          site/build.mjs (EXCLUDE_DIRS 제거)       |
                 |                                 |
          site/docs/admin-*/              site/blog/ (기존 경로)
```

### Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|--------------|
| `skills/` (root) | SSoT agent-only skill files (13 files) | `packages/skills` (sync copy) | **Modified** (2 files removed, 7 files trimmed) |
| `packages/openclaw-plugin/` | OpenClaw plugin: `register(api)` entry point, ~22 tools | `@waiaas/sdk` (API calls), OpenClaw runtime | **New** |
| `packages/skills/` | npm distributable skill files + CLI | `skills/` root (sync copy at prebuild) | **Modified** (admin skills removed from install targets) |
| `docs/admin-manual/` | masterAuth content extracted from skills | `site/build.mjs` (HTML generation) | **New** (8 files + README) |
| `docs/agent-guides/` | Agent integration guides (renamed) | `site/build.mjs` (existing blog section) | **Modified** (renamed from `docs/guides/`) |
| `site/build.mjs` | Static site generator | `docs/**/*.md` (source) | **Modified** (EXCLUDE_DIRS change) |
| `release-please-config.json` | Version management | All package.json files | **Modified** (add openclaw-plugin) |
| `turbo.json` | Build orchestration | Package build tasks | **Modified** (add openclaw-plugin task) |

### Data Flow

**Skill content flow (build time):**
```
skills/*.skill.md (root SSoT, 13 agent-only files)
  --> sync-skills.mjs copies to packages/skills/skills/
  --> @waiaas/skills npm package (agent installation via npx)
```

**OpenClaw plugin flow (runtime):**
```
openclaw plugins install @waiaas/openclaw-plugin
  --> OpenClaw loads openclaw.plugin.json manifest
  --> Validates configSchema (daemonUrl, sessionToken)
  --> Calls default export register(api) from src/index.ts
  --> register() calls api.registerTool() x ~22 times
  --> Each tool handler uses WAIaaSClient from config
  --> WAIaaSClient calls daemon REST API with sessionToken
```

**Admin manual flow (build time):**
```
docs/admin-manual/*.md (frontmatter: section "docs")
  --> site/build.mjs (EXCLUDE_DIRS에서 'admin-manual' 제거)
  --> site/docs/{slug}/index.html
  --> sitemap.xml에 URL 자동 추가
  --> llms-full.txt에 내용 자동 포함
```

---

## New Component: `packages/openclaw-plugin/`

### Package Structure

```
packages/openclaw-plugin/
  openclaw.plugin.json          # OpenClaw manifest (id, configSchema, name)
  package.json                  # @waiaas/openclaw-plugin, dep: @waiaas/sdk
  tsconfig.json                 # extends ../../tsconfig.base.json
  tsconfig.build.json           # build config (exclude test)
  vitest.config.ts              # test config
  src/
    index.ts                    # default export: register(api) function
    client.ts                   # WAIaaSClient factory (config -> client instance)
    types.ts                    # OpenClaw API type stubs
    tools/
      wallet.ts                 # get_wallet_info, get_balance, connect_info, get_assets
      transfer.ts               # transfer, token_transfer, list_transactions, get_transaction
      defi.ts                   # swap, bridge, stake, unstake, lend, borrow, repay, ...
      nft.ts                    # list_nfts, transfer_nft
      utility.ts                # sign_message, get_price, contract_call, approve, batch
  test/
    register.test.ts            # register() 호출 시 도구 등록 검증 + admin 도구 미등록 검증
    client.test.ts              # client factory 테스트
    tools/
      wallet.test.ts
      transfer.test.ts
      defi.test.ts
      nft.test.ts
      utility.test.ts
```

### OpenClaw Plugin API Integration

OpenClaw plugin system verified from official docs (MEDIUM confidence -- docs fetched live but API may evolve):

**Manifest (`openclaw.plugin.json`):**
```json
{
  "id": "waiaas",
  "name": "WAIaaS Wallet",
  "description": "AI Agent Wallet-as-a-Service: balances, transfers, DeFi, NFTs, signing",
  "configSchema": {
    "type": "object",
    "properties": {
      "daemonUrl": {
        "type": "string",
        "description": "WAIaaS daemon URL",
        "default": "http://localhost:3000"
      },
      "sessionToken": {
        "type": "string",
        "description": "WAIaaS session token (JWT)"
      }
    },
    "required": ["daemonUrl", "sessionToken"]
  },
  "uiHints": {
    "sessionToken": { "label": "Session Token", "sensitive": true }
  }
}
```

**Entry point pattern:**
```typescript
// packages/openclaw-plugin/src/index.ts
import { WAIaaSClient } from '@waiaas/sdk';
import { registerWalletTools } from './tools/wallet.js';
import { registerTransferTools } from './tools/transfer.js';
import { registerDefiTools } from './tools/defi.js';
import { registerNftTools } from './tools/nft.js';
import { registerUtilityTools } from './tools/utility.js';

interface OpenClawPluginApi {
  config: { daemonUrl: string; sessionToken: string };
  registerTool(def: ToolDefinition): void;
}

interface ToolDefinition {
  id: string;
  description: string;
  input: Record<string, unknown>; // JSON Schema
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

export default function register(api: OpenClawPluginApi): void {
  const client = new WAIaaSClient({
    baseUrl: api.config.daemonUrl,
    sessionToken: api.config.sessionToken,
  });

  registerWalletTools(api, client);
  registerTransferTools(api, client);
  registerDefiTools(api, client);
  registerNftTools(api, client);
  registerUtilityTools(api, client);
}
```

### Tool Registration Pattern

Each tool is a thin wrapper around one `WAIaaSClient` method. OpenClaw uses JSON Schema for input (not Zod):

```typescript
// packages/openclaw-plugin/src/tools/wallet.ts
import type { WAIaaSClient } from '@waiaas/sdk';

export function registerWalletTools(api: OpenClawPluginApi, client: WAIaaSClient): void {
  api.registerTool({
    id: 'waiaas_get_balance',
    description: 'Get the current balance of the wallet',
    input: {
      type: 'object',
      properties: {
        network: {
          type: 'string',
          description: 'Network (e.g., "polygon-mainnet" or CAIP-2 "eip155:137"). Use "all" for all networks.',
        },
        wallet_id: {
          type: 'string',
          description: 'Target wallet ID. Required for multi-wallet sessions.',
        },
      },
    },
    handler: async (input) => {
      return client.getBalance({
        network: input.network as string,
        walletId: input.wallet_id as string,
      });
    },
  });

  api.registerTool({
    id: 'waiaas_connect_info',
    description: 'Discover available wallets, policies, and capabilities',
    input: { type: 'object', properties: {} },
    handler: async () => client.getConnectInfo(),
  });

  // ... get_wallet_info, get_assets
}
```

### Tool List (~22 sessionAuth tools)

| Group | Tool ID | SDK Method |
|-------|---------|------------|
| **Wallet** | `waiaas_get_balance` | `getBalance()` |
| **Wallet** | `waiaas_connect_info` | `getConnectInfo()` |
| **Wallet** | `waiaas_get_wallet_info` | `getWalletInfo()` |
| **Wallet** | `waiaas_get_assets` | `getAssets()` |
| **Transfer** | `waiaas_transfer` | `sendToken({ type: 'TRANSFER' })` |
| **Transfer** | `waiaas_token_transfer` | `sendToken({ type: 'TOKEN_TRANSFER' })` |
| **Transfer** | `waiaas_get_transaction` | `getTransaction()` |
| **Transfer** | `waiaas_list_transactions` | `listTransactions()` |
| **DeFi** | `waiaas_swap` | `executeAction('swap', ...)` |
| **DeFi** | `waiaas_bridge` | `executeAction('bridge', ...)` |
| **DeFi** | `waiaas_stake` | `executeAction('stake', ...)` |
| **DeFi** | `waiaas_unstake` | `executeAction('unstake', ...)` |
| **DeFi** | `waiaas_lend` | `executeAction('supply', ...)` |
| **DeFi** | `waiaas_borrow` | `executeAction('borrow', ...)` |
| **DeFi** | `waiaas_repay` | `executeAction('repay', ...)` |
| **DeFi** | `waiaas_withdraw_lending` | `executeAction('withdraw', ...)` |
| **DeFi** | `waiaas_get_defi_positions` | `getDefiPositions()` |
| **NFT** | `waiaas_list_nfts` | `listNfts()` |
| **NFT** | `waiaas_transfer_nft` | `sendToken({ type: 'NFT_TRANSFER' })` |
| **Utility** | `waiaas_sign_message` | `signMessage()` |
| **Utility** | `waiaas_contract_call` | `sendToken({ type: 'CONTRACT_CALL' })` |
| **Utility** | `waiaas_approve` | `sendToken({ type: 'APPROVE' })` |
| **Utility** | `waiaas_batch` | `sendToken({ type: 'BATCH' })` |

### Key Design Decisions

1. **`@waiaas/sdk` as regular dependency (not peer)**: The plugin bundles SDK for zero-config installation. OpenClaw users run `openclaw plugins install @waiaas/openclaw-plugin` and get everything. Version is locked to monorepo release.

2. **No MCP code reuse**: MCP tools use `@modelcontextprotocol/sdk` + Zod schemas + `McpServer.tool()`. OpenClaw tools use JSON Schema + `api.registerTool()`. Different APIs require separate implementations. The _logic_ (SDK method calls) is identical but the _registration wrappers_ differ.

3. **sessionAuth only**: The plugin wraps `WAIaaSClient` (session-based). No `WAIaaSAdminClient` or masterAuth methods exposed. This is the core safety guarantee.

4. **Tool naming: `waiaas_` prefix**: Avoids collisions in OpenClaw's global tool namespace. Matches the `waiaas` plugin ID.

5. **Client created once in `register()`**: Single `WAIaaSClient` instance shared across all tools. Created from OpenClaw-validated config. No module-level singletons.

---

## Modified Component: `site/build.mjs`

### Change Required

`EXCLUDE_DIRS` at line 30 currently contains `['admin-manual']` -- this was a forward-looking exclusion added before admin manual content existed. To include admin manual pages in the site build:

```javascript
// Before (line 30)
const EXCLUDE_DIRS = ['admin-manual'];

// After
const EXCLUDE_DIRS = [];
```

No other changes to build.mjs needed. The script auto-discovers all `docs/**/*.md` files, parses frontmatter, and generates HTML pages. Each admin manual file needs standard frontmatter:

```yaml
---
title: "WAIaaS Admin Guide: Wallet Management"
description: "Create wallets, manage sessions, configure owner protection"
date: "2026-03-18"
section: "docs"
slug: "admin-wallet-management"
category: "Admin Manual"
---
```

### Impact on Generated Assets

- **sitemap.xml**: +9 new URLs automatically (8 admin manual + 1 OpenClaw SEO page)
- **llms-full.txt**: +9 content blocks automatically
- **docs/index.html listing page**: Admin manual pages appear in Docs listing automatically
- **No URL changes** for existing pages -- only additions

---

## Modified Component: `docs/guides/` to `docs/agent-guides/`

### Reference Impact Analysis

Files referencing `docs/guides/` that need updating:

| File | Type | Change |
|------|------|--------|
| `README.md` | 4 links | `docs/guides/X` -> `docs/agent-guides/X` |
| `site/index.html` | 1 GitHub tree link (line 1238) | `docs/guides` -> `docs/agent-guides` |

### SEO URL Stability

The site build outputs guides to `site/blog/{slug}/` based on frontmatter `section: "blog"`. Source file location does not affect output URLs -- only frontmatter `section` and `slug` determine paths. **Renaming `docs/guides/` to `docs/agent-guides/` has zero impact on published URLs.** Only source references (README, site/index.html) need updating.

### Internal Cross-References

Guide files reference each other with relative paths (e.g., `[Agent Self-Setup Guide](agent-self-setup.md)`). Since all 5 files move together to the same directory, relative links remain valid. No changes needed within guide files for relative references.

Absolute site URLs in guide frontmatter (like `slug: "openclaw-integration"`) also remain unchanged.

---

## Modified Component: `skills/` Cleanup

### Before/After

**Before (15 files):** 2 pure admin + 6 pure agent + 7 mixed
**After (13 files):** 0 admin + 13 agent-only

| File | Before | After |
|------|--------|-------|
| `admin.skill.md` | Pure admin | **Removed** (-> `docs/admin-manual/daemon-operations.md`) |
| `setup.skill.md` | Pure admin | **Removed** (-> `docs/admin-manual/setup-guide.md`) |
| `wallet.skill.md` | Mixed | **Trimmed**: wallet CRUD/session/owner/MCP/token registry CRUD removed |
| `transactions.skill.md` | Mixed | **Trimmed**: policy setup guidance removed |
| `policies.skill.md` | Mixed | **Trimmed**: POST/PUT/DELETE CRUD removed, GET only |
| `actions.skill.md` | Mixed | **Trimmed**: provider setup/API keys/env vars removed |
| `external-actions.skill.md` | Mixed | **Trimmed**: credential CRUD/global credential removed |
| `erc8004.skill.md` | Mixed | **Trimmed**: provider/registry setup/policy creation removed |
| `erc8128.skill.md` | Mixed | **Trimmed**: feature activation/domain policy setup removed |
| `quickstart.skill.md` | Pure agent | No change |
| `nft.skill.md` | Pure agent | No change |
| `polymarket.skill.md` | Pure agent | No change |
| `rpc-proxy.skill.md` | Pure agent | No change |
| `x402.skill.md` | Pure agent | No change |
| `session-recovery.skill.md` | Pure agent | No change |

### Cascade Effects

1. **`packages/skills/scripts/sync-skills.mjs`**: Copies whatever `*.skill.md` exists in `skills/`. Removing `admin.skill.md` and `setup.skill.md` means they stop being synced. **No script change needed.**

2. **`packages/skills/src/cli.ts`**: The OpenClaw install command copies specific skill files. Must update to remove `waiaas-admin` and `waiaas-setup` from the OpenClaw target list. Also update the total count (8 -> 6 or similar).

3. **Existing user installations**: Users who already have `waiaas-setup/SKILL.md` and `waiaas-admin/SKILL.md` in `~/.openclaw/skills/` keep them (stale). The `--force` reinstall will no longer include them. This is acceptable -- plugin method replaces skill-file method.

---

## Modified Component: `release-please-config.json`

Add `packages/openclaw-plugin/package.json` to `extra-files`:

```json
{
  "packages": {
    ".": {
      "extra-files": [
        "packages/openclaw-plugin/package.json",
        ... // existing entries
      ]
    }
  }
}
```

Release-please bumps the version in `packages/openclaw-plugin/package.json` alongside all other packages on release.

---

## Modified Component: `turbo.json`

Add openclaw-plugin build task:

```json
{
  "@waiaas/openclaw-plugin#build": {
    "dependsOn": ["@waiaas/sdk#build"],
    "outputs": ["dist/**"]
  }
}
```

The plugin depends only on `@waiaas/sdk`. No dependency on daemon, admin, MCP, or other packages.

---

## Patterns to Follow

### Pattern 1: SDK Wrapper (Thin Plugin)

**What:** Each OpenClaw tool is a thin wrapper around one `WAIaaSClient` method. No business logic in the plugin.

**When:** Always. The plugin is a bridge layer, not a feature layer.

**Example:**
```typescript
api.registerTool({
  id: 'waiaas_transfer',
  description: 'Send native tokens to an address',
  input: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient address' },
      amount: { type: 'string', description: 'Amount in human-readable units (e.g., "0.1")' },
      network: { type: 'string', description: 'Target network' },
      wallet_id: { type: 'string', description: 'Wallet ID (multi-wallet sessions)' },
    },
    required: ['to', 'amount'],
  },
  handler: async (input) => client.sendToken({
    type: 'TRANSFER',
    to: input.to as string,
    humanAmount: input.amount as string,
    network: input.network as string,
    walletId: input.wallet_id as string,
  }),
});
```

### Pattern 2: Domain-Grouped Tool Files

**What:** Tools organized by domain (wallet, transfer, defi, nft, utility) matching the existing MCP tool organization.

**When:** For all tool registrations in the plugin.

**Why:** Mirrors `packages/mcp/src/tools/` structure, making it easy to verify coverage parity between MCP and OpenClaw.

### Pattern 3: Frontmatter-Driven Section Routing

**What:** Admin manual pages use `section: "docs"` in frontmatter to route to `site/docs/` output path.

**When:** For all new `docs/admin-manual/*.md` files.

**Why:** `site/build.mjs` routes based on frontmatter `section` field. `"docs"` produces `TechArticle` JSON-LD. The slug determines the output path.

### Pattern 4: Content Extraction (Not Duplication)

**What:** masterAuth content is _moved_ from skills to admin-manual, not _copied_. Skills reference admin manual ("See [Admin Guide: Wallet Management](/docs/admin-wallet-management/) for setup.") instead of duplicating.

**When:** During the skill cleanup phase.

**Why:** Single source of truth. Admin manual becomes the canonical reference for admin operations.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Reusing MCP Tool Definitions

**What:** Importing Zod schemas or registration functions from `packages/mcp/`.

**Why bad:** MCP uses `@modelcontextprotocol/sdk` with Zod-based schemas and `McpServer.tool()`. OpenClaw uses JSON Schema with `api.registerTool()`. Different APIs make sharing create dependency on MCP internals + schema conversion complexity.

**Instead:** Write clean JSON Schema definitions in the plugin. Use `@waiaas/sdk` directly.

### Anti-Pattern 2: Embedding masterAuth Logic in Plugin

**What:** Adding admin tools (wallet creation, policy CRUD) with a separate admin token config option.

**Why bad:** Defeats the purpose of the cleanup. Violates the security boundary.

**Instead:** Plugin only accepts `sessionToken`. Only sessionAuth-compatible SDK methods are wrapped.

### Anti-Pattern 3: Module-Level Client Singleton

**What:** Creating WAIaaSClient at module import time.

**Why bad:** OpenClaw may call `register()` multiple times or with different configs.

**Instead:** Create client inside `register()` from the provided `api.config`.

### Anti-Pattern 4: Removing skills/ Files Before Admin Manual Exists

**What:** Deleting admin content from skills before creating the admin manual.

**Why bad:** Content is lost temporarily. Harder to verify completeness.

**Instead:** Create admin manual files first (extracting content), then trim skills. Phase 2 order matters.

---

## Suggested Build Order

Dependencies flow bottom-up. Phases should follow this order:

### Phase 1: Document Structure Cleanup (no code dependencies)

1. `docs/guides/` -> `docs/agent-guides/` rename (`git mv`)
2. Update references in `README.md` (4 links), `site/index.html` (1 link)
3. Verify site build still works (URLs unchanged due to frontmatter routing)

**Rationale:** Isolated rename with predictable impact. All downstream phases reference `docs/agent-guides/` paths.

### Phase 2: Skills Cleanup + Admin Manual Creation (depends on Phase 1)

1. Create `docs/admin-manual/` directory structure
2. Create 8 admin manual markdown files (extracting from skill files + admin/setup)
3. Add frontmatter to all admin manual files (title, description, date, section, slug)
4. Remove `admin.skill.md` and `setup.skill.md` from `skills/`
5. Trim masterAuth content from 7 mixed skill files
6. Remove `'admin-manual'` from `site/build.mjs` EXCLUDE_DIRS
7. Update `packages/skills/` CLI (remove admin/setup from install targets)
8. Verify: `skills/` has 0 masterAuth references, admin manual has complete content
9. Verify: site build generates admin manual HTML pages

**Rationale:** Admin manual must exist before trimming skills (Pattern 4 above). Skills cleanup must complete before plugin work, because the plugin tool list depends on the cleaned-up agent-only skill set.

### Phase 3: OpenClaw Plugin Package (depends on Phase 2)

1. Create `packages/openclaw-plugin/` package structure + `package.json`
2. Write `openclaw.plugin.json` manifest
3. Implement `src/types.ts` (OpenClaw API type stubs)
4. Implement `src/client.ts` (WAIaaSClient factory)
5. Implement `src/index.ts` (`register()` entry point)
6. Implement tool files (wallet, transfer, defi, nft, utility)
7. Write tests: register verification, tool handler unit tests, admin tool exclusion test
8. Add to `turbo.json` (build task with SDK dependency)
9. Add to `release-please-config.json` (extra-files)

**Rationale:** Plugin wraps the agent-only tool list finalized in Phase 2. Build config integration comes last to avoid build failures during development.

### Phase 4: CI/CD + Documentation + SEO (depends on Phase 3)

1. Update `docs/agent-guides/openclaw-integration.md` (plugin method first, skills legacy)
2. Create `docs/seo/openclaw-plugin.md` (SEO landing page with frontmatter)
3. Create `skills/integrations.skill.md` (agent skill for plugin usage)
4. Create `packages/openclaw-plugin/README.md`
5. Verify site build (admin manual + OpenClaw SEO page generate correctly)
6. Verify sitemap.xml and llms-full.txt include all new pages
7. npm publish dry-run for `@waiaas/openclaw-plugin`

**Rationale:** Documentation and SEO are final polish after all functional changes are complete. The plugin package must exist before its README and integration guide can be finalized.

### Phase Ordering Rationale Summary

```
Phase 1 (rename)
  |
  v
Phase 2 (skills + admin manual)  -- content must exist before plugin tools list
  |
  v
Phase 3 (openclaw plugin)        -- depends on finalized tool list from Phase 2
  |
  v
Phase 4 (docs + CI/CD + SEO)     -- references plugin package from Phase 3
```

---

## Scalability Considerations

| Concern | Current (22 tools) | At 50 tools | At 100+ tools |
|---------|---------------------|-------------|---------------|
| Plugin registration | Single `register()` call | Same, group by domain files | Consider lazy loading per domain |
| SDK dependency | Direct import | Same | Same |
| Test coverage | Per-tool unit tests | Per-domain test files | Test generator from tool registry |
| Plugin dist size | < 50KB | < 100KB | Split into sub-plugins |

For the current scope (~22 tools), the single-plugin architecture is appropriate. No sub-plugins or lazy loading needed.

---

## Sources

- [OpenClaw Plugin Developer Docs](https://docs.openclaw.ai/tools/plugin) -- plugin manifest, register(api), tool registration API (MEDIUM confidence, fetched live)
- [OpenClaw Skills Docs](https://docs.openclaw.ai/tools/skills) -- SKILL.md format, skills-plugin relationship (MEDIUM confidence, fetched live)
- [OpenClaw Tools Overview](https://docs.openclaw.ai/tools) -- tool configuration, allow/deny (MEDIUM confidence, fetched live)
- Codebase inspection: `site/build.mjs`, `packages/skills/`, `packages/mcp/src/tools/` (45 files), `packages/sdk/`, `turbo.json`, `release-please-config.json` (HIGH confidence, direct source)
