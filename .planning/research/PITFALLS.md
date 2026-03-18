# Domain Pitfalls

**Domain:** AI agent wallet system -- skill file reorganization, documentation restructuring, OpenClaw plugin packaging
**Researched:** 2026-03-18

## Critical Pitfalls

Mistakes that cause breakage, security leaks, or require rework.

### Pitfall 1: Reference Breakage Cascade from docs/guides/ Rename

**What goes wrong:** `docs/guides/` -> `docs/agent-guides/` rename breaks references across at least 5 distinct locations: `README.md` (4 links on lines 136, 218-221), `site/index.html` (line 1238 hardcoded GitHub tree link), cross-references within the 5 guide files themselves, and internal objective/planning docs (24 files currently reference `docs/guides/`).

**Why it happens:** Simple `git mv` renames the directory but does not update string references. The codebase has organic link growth over 112 milestones with no automated path checking for these references.

**Consequences:**
- README.md on GitHub shows 4 broken links (first thing users/potential adopters see)
- `site/index.html` links to a 404 on GitHub (`docs/guides` -> nonexistent path)
- Guide files that cross-reference each other (e.g., `openclaw-integration.md` references `agent-self-setup.md` on line 102) break if relative path context changes
- Internal docs reference stale paths (confusing for future milestones)

**Prevention:**
1. Before rename: run `grep -rn 'docs/guides' .` to capture ALL references (currently 24+ files)
2. Categorize references into: must-update (README, site, guide files) vs. historical (archived planning docs -- leave as-is)
3. After rename: run the same grep to verify 0 remaining references in non-archived files
4. Specifically update: `site/index.html` line 1238, `README.md` lines 136/218-221, all 5 guide internal cross-references
5. Do NOT update archived planning/milestone docs (they are historical records)

**Detection:** CI link checker validates internal HTML links (259 checked) but NOT GitHub README links or markdown cross-references. Add a post-rename grep validation step.

**Phase:** Must be Phase 1 (doc restructuring), with a verification grep as the last step.

---

### Pitfall 2: masterAuth Content Leaking Into Agent Context via Incomplete Extraction

**What goes wrong:** After "extracting" admin content from the 7 mixed skill files, residual masterAuth references remain in the agent-facing skills. An AI agent reads the skill file, encounters masterAuth endpoints, and attempts to call them with its sessionAuth token -- resulting in 401 failures and wasted agent context window.

**Why it happens:** The extraction is manual and masterAuth references are deeply interleaved. Current counts: `wallet.skill.md` has 22 masterAuth references, `policies.skill.md` has 10, `transactions.skill.md` has 3, `actions.skill.md` has 1, `external-actions.skill.md` has 5, `erc8004.skill.md` has 1, `erc8128.skill.md` has 1. Total: ~43 masterAuth references across 7 files that need surgical extraction.

**Consequences:**
- Agent tries to create wallets, manage policies, or register API keys -- all fail with 401
- Agent wastes LLM context on 1000+ lines of irrelevant admin documentation
- Information leak: agent learns about internal admin API surface (masterAuth endpoints, config paths, security settings)
- The security notice line ("AI agents must NEVER request the master password") becomes ironic if the file then documents exactly how to use the master password

**Prevention:**
1. After extraction, run automated check: `grep -c 'masterAuth\|master_password\|X-Master-Password' skills/*.skill.md` -- only the standard security notice pattern is acceptable
2. Define the acceptable pattern explicitly: the line `> AI agents must NEVER request the master password. Use only your session token.` is the ONLY permitted masterAuth reference
3. Create a CI validation script that parses skill files and fails if masterAuth appears outside the security notice
4. Review each of the 7 files section-by-section, not line-by-line (sections are the logical unit)

**Detection:** The objective defines success criterion #1: "masterAuth endpoints 0 count in skills/". Automate this as a test.

**Phase:** Phase 2 (skill extraction). Validation script should be created in Phase 2 and integrated into CI in Phase 4.

---

### Pitfall 3: OpenClaw Plugin Tight-Coupling to SDK Internal Version

**What goes wrong:** `@waiaas/openclaw-plugin` declares `@waiaas/sdk` as a regular dependency (not peer dependency), causing version lock-in. When the daemon upgrades and the user has SDK v2.12 but the plugin bundles v2.11, users get duplicate SDK instances in their node_modules, type mismatches, and two different WAIaaS HTTP clients.

**Why it happens:** The monorepo uses `workspace:*` protocol for internal dependencies. When published via release-please, this becomes a pinned version (e.g., `"@waiaas/sdk": "2.11.0-rc.22"`). The plugin bundles a specific SDK version rather than deferring to the host project.

**Consequences:**
- Users cannot mix plugin and SDK versions independently
- Duplicate SDK instances in node_modules (two WAIaaS HTTP clients, doubled memory)
- TypeScript type conflicts if user imports from both plugin and SDK directly
- Every SDK release requires a coordinated plugin release even if the plugin code has not changed
- `instanceof` checks fail across package boundaries (different class instances)

**Prevention:**
1. Declare `@waiaas/sdk` as `peerDependency` with a range: `"@waiaas/sdk": ">=2.11.0"`
2. Also add it as `devDependency` for local development and testing
3. Keep the plugin as a thin wrapper: tool registration + config schema only, zero business logic
4. Do not re-export SDK types from the plugin -- let users import directly from `@waiaas/sdk`
5. Test with both the minimum supported SDK version and the latest in CI matrix

**Phase:** Phase 3 (plugin creation). The package.json structure must be correct from day one.

---

### Pitfall 4: sync-skills.mjs Copies ALL Skills Including Removed/Moved Files

**What goes wrong:** After moving `admin.skill.md` and `setup.skill.md` out of `skills/`, the `packages/skills/scripts/sync-skills.mjs` prebuild step uses `readdirSync(rootSkillsDir).filter(f => f.endsWith('.skill.md'))` -- a blanket glob with no exclusion logic. If someone later creates a new admin-only file in `skills/` by mistake, it gets copied and published to npm via `@waiaas/skills`.

**Why it happens:** The sync script was designed when all skill files were agent-facing. The agent/admin split introduces a new constraint that the script does not enforce.

**Consequences:**
- Admin content published in the `@waiaas/skills` npm package
- `npx @waiaas/skills openclaw` installs admin-only files to agent skill directories
- `npx @waiaas/skills claude-code` copies admin content into `.claude/skills/`
- Agents get admin endpoints in their context (security + DX regression)
- Violates the core goal of this milestone

**Prevention:**
1. Add validation to `sync-skills.mjs`: after copying, scan each file for the `> **Operator only.**` prefix (line 14 of current `admin.skill.md`) and fail if found
2. Or maintain an explicit allowlist of agent skill files in the sync script
3. The OpenClaw installer (`openclaw.ts`) and all other target installers should also validate
4. Add a CI check: `npm publish --dry-run` + inspect package contents for admin markers

**Detection:** `npm pack --dry-run` in CI to inspect package contents before publishing.

**Phase:** Phase 2 (skill cleanup). Update sync-skills.mjs simultaneously with removing admin files from skills/.

---

### Pitfall 5: SEO Build EXCLUDE_DIRS Silently Blocks admin-manual Pages

**What goes wrong:** `site/build.mjs` line 30 contains `const EXCLUDE_DIRS = ['admin-manual']` -- this was pre-configured to exclude admin-manual from the site build. If Phase 4 adds admin-manual pages to the SEO build without removing this exclusion, the pages are silently skipped. No error, no warning, no build failure.

**Why it happens:** The exclusion was added proactively during v32.7 (SEO milestone), likely anticipating that admin content should not be public-facing. Now the requirement has changed: admin-manual pages SHOULD be built as documentation/SEO targets.

**Consequences:**
- Admin manual HTML pages are never generated
- sitemap.xml does not include admin manual URLs
- llms-full.txt does not include admin manual content
- Developer writes 8 admin-manual markdown files with proper frontmatter, runs the build, and assumes they are live -- but they are not
- Completely silent failure: no error message, no warning, no indication of skipped files

**Prevention:**
1. Remove `'admin-manual'` from `EXCLUDE_DIRS` in `site/build.mjs` line 30
2. After build, verify page count: compare expected page count with actual generated HTML files
3. Add a build summary that explicitly lists skipped directories (if any remain in EXCLUDE_DIRS)
4. Verify the admin-manual URLs appear in the generated sitemap.xml

**Detection:** Post-build step: `find site/docs/ -name 'index.html' | wc -l` and compare with expected count.

**Phase:** Phase 4 (CI/CD + SEO). This is the first thing to address when adding admin-manual to the build pipeline.

## Moderate Pitfalls

### Pitfall 6: OpenClaw Plugin register() Exposing Admin Tools

**What goes wrong:** The plugin's `register()` function inadvertently registers admin-only tools (e.g., `create_wallet`, `create_session`, `delete_policy`, `create_backup`) because it mirrors all available SDK methods or MCP tools instead of curating a sessionAuth-only subset.

**Why it happens:** The SDK exposes both admin and agent methods. Without an explicit allowlist, auto-generating tools from SDK methods pulls in everything.

**Prevention:**
1. Maintain an explicit allowlist of ~22 sessionAuth tools (listed in the objective's "Exposed Tools" table)
2. Add a negative test: `register()` output must not contain any tool matching admin patterns (`create_wallet`, `create_session`, `create_policy`, `delete_policy`, `create_backup`, `rotate_jwt`, `shutdown`, etc.)
3. Each tool definition should document its auth requirement (sessionAuth only)
4. Do not auto-generate tools from SDK -- curate manually

**Phase:** Phase 3 (plugin creation). The tool allowlist is the core design decision.

---

### Pitfall 7: OpenClaw Plugin Manifest Format Mismatch

**What goes wrong:** The `openclaw.plugin.json` manifest uses a format that does not match OpenClaw's actual plugin system requirements. The objective specifies a `configSchema` with `daemonUrl` + `sessionToken`, but if OpenClaw expects different field names, additional required fields, a different JSON structure, or a different file name, the plugin fails to load silently.

**Why it happens:** The objective explicitly flags this as a pre-research requirement ("사전 리서치 (3단계 선행 필수)") but the temptation is to skip the research and build based on assumptions.

**Prevention:**
1. The objective mandates this research -- do not skip it
2. Verify manifest format against OpenClaw documentation or source code before writing any plugin code
3. Test plugin installation with an actual OpenClaw instance (not just unit tests)
4. Include a manifest validation test in the plugin's test suite
5. If OpenClaw plugin docs are unavailable, inspect other published OpenClaw plugins for the manifest pattern

**Phase:** Pre-Phase 3 research task (already identified in objective). Block Phase 3 on this research.

---

### Pitfall 8: sitemap.xml and llms-full.txt Stale After Restructuring

**What goes wrong:** After adding admin-manual pages and the OpenClaw SEO page, sitemap.xml still has the old page count (22 URLs from v32.7). llms-full.txt (188KB) does not include admin manual content, reducing AI discoverability of admin documentation.

**Prevention:**
1. sitemap.xml is auto-generated by `site/build.mjs` -- but only for pages that pass the EXCLUDE_DIRS filter (see Pitfall 5)
2. llms-full.txt generation may need explicit inclusion of admin-manual content (verify the generation logic)
3. Post-build: compare sitemap URL count with expected (22 existing + ~9 new = ~31)
4. Verify canonical URLs use the correct section/slug pattern for new pages

**Phase:** Phase 4 (SEO integration). Build and verify after all doc restructuring is complete.

---

### Pitfall 9: release-please Manifest Desync for New Package

**What goes wrong:** Adding `packages/openclaw-plugin` to `release-please-config.json` but forgetting to add the corresponding entry to `.release-please-manifest.json` (or vice versa) causes release-please to either ignore the new package or generate malformed release PRs with version "0.0.0".

**Prevention:**
1. Add entry to BOTH `release-please-config.json` AND `.release-please-manifest.json`
2. Follow the exact pattern used by `packages/skills` (the closest existing analogue)
3. Ensure `package.json` has `"name": "@waiaas/openclaw-plugin"` and `"publishConfig": { "access": "public" }`
4. Verify the npm trusted publishing workflow includes the new package path
5. Test with: merge a feat: commit touching the plugin, verify release-please PR includes it

**Phase:** Phase 4 (CI/CD). Follow the exact pattern from v2.4 (npm Trusted Publishing milestone).

---

### Pitfall 10: openclaw.ts Installer Still Outputs WAIAAS_MASTER_PASSWORD

**What goes wrong:** The current `packages/skills/src/openclaw.ts` line 59 prints `WAIAAS_MASTER_PASSWORD` in the post-install instructions shown to users. After this milestone's agent/admin separation, showing the master password field to agents directly contradicts the security model and the entire goal of this milestone.

**Why it happens:** This is a pre-existing inconsistency. The installer was written before the agent/admin separation concept. The `docs/guides/openclaw-integration.md` guide (lines 48-58) already shows sessionToken-only, but the installer code was never updated to match.

**Prevention:**
1. Remove `WAIAAS_MASTER_PASSWORD` from the OpenClaw installer output (line 59)
2. Only show `WAIAAS_BASE_URL` and `WAIAAS_SESSION_TOKEN`
3. Update the integration guide to match (already mostly correct)
4. Check all other installer targets (claude-code, agent-skills) for the same issue

**Phase:** Phase 2 (skill cleanup). Fix this alongside the admin content removal.

## Minor Pitfalls

### Pitfall 11: turbo.json Build Order for openclaw-plugin

**What goes wrong:** If `@waiaas/openclaw-plugin` depends on `@waiaas/sdk` (as a peerDep with devDep for local builds), but turbo.json does not define a custom build task, the default `build` task's `dependsOn: ["^build"]` should handle it. However, if the plugin also imports types from `@waiaas/shared` or `@waiaas/core` without declaring them, the build fails intermittently depending on cache state.

**Prevention:**
1. Declare all type dependencies explicitly in package.json (even if they are transitive through SDK)
2. Verify with `pnpm turbo run build --dry-run` that the build order is correct
3. The default turbo task config should suffice if dependencies are properly declared

---

### Pitfall 12: Skill File Version Frontmatter Desync After Extraction

**What goes wrong:** After splitting skill files (extracting admin content), the remaining agent-only skill files keep the old version frontmatter format. If the extraction changes the frontmatter structure (e.g., adding new fields, changing indentation), the `sync-skills.mjs` regex `^version:\s*".*"$` may not match, causing version stamps to be wrong in published packages.

**Prevention:**
1. Maintain consistent YAML frontmatter format in all skill files after extraction
2. Test the sync-skills.mjs prebuild step after all skill modifications
3. Verify the published package contains correct version numbers

---

### Pitfall 13: docs/admin-manual/ Frontmatter Section Field Misrouted

**What goes wrong:** Admin manual files use `section: "blog"` (copying from existing guide templates) instead of `section: "docs"`, causing them to appear in the blog listing page instead of the documentation section. Users looking for admin docs find them mixed with blog articles about "Why WAIaaS".

**Prevention:**
1. Use `section: "docs"` for admin-manual pages (they are technical documentation)
2. Verify the listing page output after build: admin manual pages should appear in the docs listing, not blog
3. Consider adding a category field (e.g., `category: "Admin Manual"`) for filtering in the docs listing

---

### Pitfall 14: Git History Loss from Combined Move + Edit Commits

**What goes wrong:** Moving skill files to docs/admin-manual/ via `git mv` AND heavily editing content in the same commit makes `git log --follow` unable to track the file history. The admin manual appears as entirely new files with no provenance, losing the attribution chain of 100+ milestones of evolution.

**Prevention:**
1. Separate the move and content edit into different commits within the same phase
2. First commit: pure `git mv` with zero or minimal content changes
3. Second commit: content reformatting for admin manual style
4. This preserves `git log --follow` for tracking origin

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Doc restructuring | Reference breakage from rename (#1) | Grep before/after, update README + site/index.html + guide cross-refs |
| Phase 1: Doc restructuring | EXCLUDE_DIRS blocks new pages (#5) | Remove 'admin-manual' from EXCLUDE_DIRS in site/build.mjs line 30 |
| Phase 2: Skill extraction | masterAuth residue in agent skills (#2) | Automated grep check: 0 masterAuth outside security notice |
| Phase 2: Skill extraction | sync-skills.mjs blind copy (#4) | Add allowlist or admin-marker validation to sync script |
| Phase 2: Skill extraction | openclaw.ts MASTER_PASSWORD output (#10) | Remove from installer output, all targets |
| Phase 3: Plugin creation | SDK version coupling (#3) | Use peerDependencies, not regular dependencies |
| Phase 3: Plugin creation | Admin tools in register() (#6) | Explicit sessionAuth-only tool allowlist (~22 tools) |
| Phase 3: Plugin creation | Manifest format unknown (#7) | Research OpenClaw plugin spec BEFORE coding |
| Phase 4: CI/CD + SEO | release-please manifest desync (#9) | Add to BOTH config files, follow packages/skills pattern |
| Phase 4: CI/CD + SEO | Stale sitemap/llms-full.txt (#8) | Post-build verification: page count ~31 (22 + 9 new) |

## Sources

- Codebase analysis: `site/build.mjs` line 30 (`EXCLUDE_DIRS = ['admin-manual']`)
- Codebase analysis: `packages/skills/scripts/sync-skills.mjs` (blind `*.skill.md` copy, no exclusion)
- Codebase analysis: `packages/skills/src/openclaw.ts` line 59 (`WAIAAS_MASTER_PASSWORD` in output)
- Reference count: `grep -rn 'docs/guides' .` yields 24 files with path references
- masterAuth count: `grep -c 'masterAuth' skills/*.skill.md` yields matches in 10 of 15 skill files (~43 total occurrences across 7 mixed files)
- CI validation: `site/build.mjs` validates 259 internal HTML links but not README or markdown cross-references
- release-please pattern: `release-please-config.json` line 60 includes `packages/skills` as reference
- turbo.json: `@waiaas/skills#build` custom task on line 8 as reference pattern
- Objective document: `internal/objectives/m32-10-openclaw-plugin.md` -- success criteria, pre-research flags
