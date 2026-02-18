# Phase 188: 사전 준비 - Research

**Researched:** 2026-02-19
**Domain:** npm package metadata + CI/CD npm CLI version management
**Confidence:** HIGH

## Summary

Phase 188 prepares the ground for npm Trusted Publishing (OIDC) by fixing two prerequisites: (1) correcting `repository` metadata in all 9 package.json files to match the actual GitHub repository `minhoyoo-iotrust/WAIaaS`, and (2) ensuring the `deploy` job in `release.yml` has npm CLI >= 11.5.1 available.

The current state shows all 8 publishable packages use `https://github.com/minho-yoo/waiaas.git` as the repository URL, which is incorrect -- the actual remote is `git@github.com:minhoyoo-iotrust/WAIaaS.git`. The root `package.json` has no `repository` field at all. This mismatch would cause provenance verification failures (E422) in Phase 189 when `--provenance` is added to `npm publish`. The `directory` fields in the 8 packages are already correct in structure but need the URL portion fixed.

For npm CLI version, Node.js 22 (used by the project) bundles npm 10.x by default. Trusted Publishing requires npm >= 11.5.1. The `deploy` job needs an explicit upgrade step.

**Primary recommendation:** Update all 9 package.json repository fields with the correct URL, and add an npm version check + upgrade step to the deploy job in release.yml.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Object 형식 사용: `{ "type": "git", "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git", "directory": "packages/..." }`
- URL 프로토콜: `git+https://` 형식 (npm 공식 권장)
- 루트 package.json 포함: 9개(루트 + 8패키지) 모두 동일 형식으로 통일
- 루트 package.json에는 `directory` 필드 생략 (모노레포 자체이므로 불필요)
- 8개 패키지는 각각 실제 패키지 경로를 `directory`에 명시
- 최소 버전 보장 방식: npm --version 확인 후, 11.5.1 미만이면 `npm install -g npm@latest`로 업그레이드
- 적용 범위: deploy 잡에만 추가 (publish-check는 dry-run이므로 불필요)
- 실패 처리: 업그레이드 실패 시 deploy 잡 전체 실패 -- 최소 버전 미충족 상태로 발행 방지
- repository 필드만 수정 -- bugs, homepage 등 다른 필드는 이 phase에서 다루지 않음
- 기존 형식(string/object 혼재)을 전체 object 형식으로 통일
- 기존 프로젝트 포맷팅(들여쓰기, 정렬) 유지 -- npm pkg fix 사용하지 않음

### Claude's Discretion
- npm 버전 확인 스크립트의 구체적 구현 (shell script vs inline command)
- repository.directory 경로의 정확한 값 (실제 패키지 경로 조사 필요)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PREP-01 | 9개 package.json의 repository.url을 실제 GitHub 레포 URL로 수정 (minhoyoo-iotrust/WAIaaS) | Current state audit completed: all 8 packages use wrong URL (`minho-yoo/waiaas`), root has no repository field. Correct URL: `git+https://github.com/minhoyoo-iotrust/WAIaaS.git`. Case sensitivity is critical for provenance verification. |
| PREP-02 | deploy 잡에서 npm CLI >= 11.5.1 확보 (npm upgrade 스텝 추가 또는 Node.js 번들 버전 확인) | Node.js 22 bundles npm 10.x (10.9.2 locally, 10.9.4 in 22.21.0). npm 11.5.1+ is required for trusted publishing OIDC. Explicit `npm install -g npm@latest` needed in deploy job. |
| PREP-03 | 8개 패키지의 package.json repository.directory 필드 정확성 확인 | All 8 packages already have correct `directory` values matching their actual filesystem paths. Only the URL portion needs fixing. |
</phase_requirements>

## Current State Audit

### repository Field Status (All 9 package.json files)

| Package | Current repository.url | Current directory | Correct? |
|---------|----------------------|-------------------|----------|
| Root (`waiaas`) | **MISSING** (no repository field) | N/A | NO |
| `@waiaas/core` | `https://github.com/minho-yoo/waiaas.git` | `packages/core` | URL wrong, directory correct |
| `@waiaas/daemon` | `https://github.com/minho-yoo/waiaas.git` | `packages/daemon` | URL wrong, directory correct |
| `@waiaas/cli` | `https://github.com/minho-yoo/waiaas.git` | `packages/cli` | URL wrong, directory correct |
| `@waiaas/sdk` | `https://github.com/minho-yoo/waiaas.git` | `packages/sdk` | URL wrong, directory correct |
| `@waiaas/mcp` | `https://github.com/minho-yoo/waiaas.git` | `packages/mcp` | URL wrong, directory correct |
| `@waiaas/skills` | `https://github.com/minho-yoo/waiaas.git` | `packages/skills` | URL wrong, directory correct |
| `@waiaas/adapter-solana` | `https://github.com/minho-yoo/waiaas.git` | `packages/adapters/solana` | URL wrong, directory correct |
| `@waiaas/adapter-evm` | `https://github.com/minho-yoo/waiaas.git` | `packages/adapters/evm` | URL wrong, directory correct |
| `@waiaas/admin` (private) | `https://github.com/minho-yoo/waiaas.git` | `packages/admin` | URL wrong, directory correct |

**Key findings:**
1. ALL 8 package URLs use `minho-yoo/waiaas` -- the actual repo is `minhoyoo-iotrust/WAIaaS` (case-sensitive)
2. ALL 8 package `directory` fields are already correct
3. Root package.json has no `repository` field at all
4. All 8 packages use object format already (no string/object mix despite CONTEXT.md mentioning it)
5. The admin package is `private: true` so it is not published, but should still be updated for consistency

### Target repository Field Values

| Package | Target Value |
|---------|-------------|
| Root | `{ "type": "git", "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git" }` |
| `@waiaas/core` | `{ "type": "git", "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git", "directory": "packages/core" }` |
| `@waiaas/daemon` | `{ "type": "git", "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git", "directory": "packages/daemon" }` |
| `@waiaas/cli` | `{ "type": "git", "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git", "directory": "packages/cli" }` |
| `@waiaas/sdk` | `{ "type": "git", "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git", "directory": "packages/sdk" }` |
| `@waiaas/mcp` | `{ "type": "git", "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git", "directory": "packages/mcp" }` |
| `@waiaas/skills` | `{ "type": "git", "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git", "directory": "packages/skills" }` |
| `@waiaas/adapter-solana` | `{ "type": "git", "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git", "directory": "packages/adapters/solana" }` |
| `@waiaas/adapter-evm` | `{ "type": "git", "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git", "directory": "packages/adapters/evm" }` |

Note: The admin package (`packages/admin`) also needs updating for consistency, using `"directory": "packages/admin"`.

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| npm CLI | >= 11.5.1 | Package publishing with OIDC/provenance | Required minimum for Trusted Publishing |
| Node.js | 22.x | Runtime | Already configured in project |
| actions/setup-node | v4 | Node.js setup in CI | Already used in `.github/actions/setup/action.yml` |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| pnpm | 9.15.4 | Package management | Existing tool, keep for install/build but NOT for publish |
| turbo | 2.x | Monorepo task runner | Existing tool for build orchestration |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `npm install -g npm@latest` | Pin specific version `npm@11.5.1` | `@latest` gets newer versions automatically but is less deterministic; `@11.5.1` is exact but may miss important fixes. Recommend `@latest` per user decision. |
| Inline version check | Separate shell script | Inline is simpler and more transparent in workflow YAML; script adds an extra file to maintain. Recommend inline. |

## Architecture Patterns

### Pattern 1: npm Version Check + Upgrade in GitHub Actions
**What:** Check npm version before publish, upgrade if below minimum
**When to use:** When the runner-bundled npm version may be insufficient
**Recommendation:** Use inline shell commands in the deploy job step.

```yaml
- name: Ensure npm >= 11.5.1
  run: |
    CURRENT=$(npm --version)
    REQUIRED="11.5.1"
    echo "Current npm: $CURRENT, Required: >= $REQUIRED"
    if [ "$(printf '%s\n' "$REQUIRED" "$CURRENT" | sort -V | head -n1)" != "$REQUIRED" ]; then
      echo "Upgrading npm to latest..."
      npm install -g npm@latest
      echo "Upgraded to: $(npm --version)"
    else
      echo "npm version sufficient"
    fi
```

This approach:
- Logs the current version for debugging
- Uses `sort -V` for semantic version comparison (available on Ubuntu runners)
- Only upgrades when needed (idempotent)
- Fails the job if upgrade fails (set -e in shell)
- Prints the final version for audit trail

### Pattern 2: package.json repository Field (Object Format)
**What:** Structured repository metadata with monorepo directory support
**When to use:** All packages in the monorepo

For root:
```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git"
  }
}
```

For sub-packages:
```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git",
    "directory": "packages/core"
  }
}
```

### Anti-Patterns to Avoid
- **Using `npm pkg fix`:** This reformats the entire package.json, potentially changing indentation, field order, and other formatting. The user decision explicitly excludes this.
- **Using string format for repository:** `"repository": "github:minhoyoo-iotrust/WAIaaS"` -- not compatible with directory support and less explicit.
- **Adding `--provenance` in this phase:** Provenance is Phase 189 scope. This phase only ensures metadata and npm version prerequisites.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Semantic version comparison | Custom Node.js script | Shell `sort -V` | Built into GNU coreutils on Ubuntu runners, single-line solution |
| npm upgrade | Custom download/install | `npm install -g npm@latest` | npm self-upgrade is the standard pattern |
| package.json editing | Custom JSON parser/writer | Direct file edits (Edit tool) | Preserve exact formatting, no dependencies |

**Key insight:** This phase is pure metadata + configuration. No runtime code changes, no new dependencies, no tests to write.

## Common Pitfalls

### Pitfall 1: Case Sensitivity in Repository URL
**What goes wrong:** npm provenance verification (Sigstore) compares the `repository.url` from package.json against the OIDC token from GitHub Actions. Case mismatches cause E422 errors.
**Why it happens:** GitHub org/repo names are case-sensitive in provenance verification. The actual repo is `minhoyoo-iotrust/WAIaaS` (not `minhoyoo-iotrust/waiaas` or `Minhoyoo-Iotrust/WAIaaS`).
**How to avoid:** Use the exact casing from `gh api repos/minhoyoo-iotrust/WAIaaS --jq '.full_name'` which returns `minhoyoo-iotrust/WAIaaS`.
**Warning signs:** E422 errors during `npm publish --provenance` in Phase 189.

### Pitfall 2: Node.js 22 Bundles npm 10.x, Not 11.x
**What goes wrong:** Assuming Node.js 22 includes npm 11.5.1+. It does not -- Node.js 22.14.0 bundles npm 10.9.2, and even 22.21.0 only has npm 10.9.4.
**Why it happens:** npm 11 was only added to Node.js in later releases (possibly 22.22+ or Node.js 24). The `actions/setup-node@v4` with `node-version: 22` does not guarantee npm 11.
**How to avoid:** Always include an explicit npm upgrade step in the deploy job. Do not rely on the bundled version.
**Warning signs:** OIDC authentication silently fails or produces unclear errors when npm is too old.

### Pitfall 3: Editing package.json Formatting
**What goes wrong:** Using `npm pkg set` or `npm pkg fix` reformats the entire file, changing indentation, field ordering, and trailing newlines.
**Why it happens:** npm's built-in JSON formatting doesn't match the project's formatting conventions.
**How to avoid:** Edit package.json files directly with precise string replacement, preserving existing formatting (2-space indentation, existing field order).
**Warning signs:** Large diffs in package.json files with only whitespace/formatting changes.

### Pitfall 4: Forgetting the Root package.json
**What goes wrong:** The root `package.json` currently has no `repository` field at all. It might be overlooked since it's `private: true` and not published.
**Why it happens:** Focus on the 8 publishable packages, forgetting the user decision explicitly includes the root.
**How to avoid:** The user decision says "9개(루트 + 8패키지) 모두 동일 형식으로 통일". Root gets the field without `directory`.
**Warning signs:** Only 8 files modified instead of 9.

### Pitfall 5: npm Upgrade Placement in Workflow
**What goes wrong:** Placing the npm upgrade step too early (before `pnpm install`) or in the wrong job.
**Why it happens:** The upgrade is needed for `npm publish` (OIDC), not for building or testing. `pnpm install` uses pnpm, not npm.
**How to avoid:** Place the npm upgrade step in the `deploy` job only, after the Setup step but before the publish step. Per user decision, it is NOT needed in `publish-check` (dry-run only).
**Warning signs:** Unnecessary CI time added to non-deploy jobs.

## Code Examples

### Example 1: Root package.json Repository Addition
```json
{
  "name": "waiaas",
  "private": true,
  "license": "MIT",
  "type": "module",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git"
  },
  "packageManager": "pnpm@9.15.4",
  ...
}
```

### Example 2: Sub-package Repository Update (core)
```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/minhoyoo-iotrust/WAIaaS.git",
    "directory": "packages/core"
  }
}
```

### Example 3: release.yml Deploy Job npm Upgrade Step
```yaml
deploy:
  runs-on: ubuntu-latest
  needs: [test, chain-integration, platform, publish-check, docker-publish]
  if: github.event_name == 'release'
  environment: production
  steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Setup
      uses: ./.github/actions/setup

    - name: Build
      run: pnpm turbo run build

    - name: Ensure npm >= 11.5.1
      run: |
        CURRENT=$(npm --version)
        REQUIRED="11.5.1"
        echo "Current npm: $CURRENT, Required: >= $REQUIRED"
        if [ "$(printf '%s\n' "$REQUIRED" "$CURRENT" | sort -V | head -n1)" != "$REQUIRED" ]; then
          echo "Upgrading npm to latest..."
          npm install -g npm@latest
          echo "Upgraded to: $(npm --version)"
        else
          echo "npm version sufficient"
        fi

    - name: Setup npmrc
      run: echo "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}" > ~/.npmrc
      env:
        NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

    - name: pnpm publish
      ...
```

Note: The `Setup npmrc` step and `pnpm publish` remain unchanged in this phase. They will be modified in Phase 189 (OIDC transition).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| npm classic automation tokens | npm Trusted Publishing (OIDC) | npm CLI 11.5.1 (2025) | Short-lived tokens, no stored secrets, provenance attestation |
| `pnpm publish` for OIDC | `npm publish` directly | pnpm delegates to npm for publish | pnpm runs npm under the hood; for OIDC, may need explicit npm CLI version |
| String repository field | Object with type/url/directory | npm convention | Better monorepo support, explicit metadata |

**Important note about pnpm + OIDC:**
pnpm's `publish` command delegates to npm CLI internally. This means:
- pnpm inherits npm's OIDC support transparently
- The system npm version determines OIDC capability
- `npm install -g npm@latest` upgrades the npm that pnpm calls
- However, the project roadmap (Phase 189) plans to switch from `pnpm publish` to `npm publish` directly for the deploy job

## Open Questions

1. **npm CLI version on future Node.js 22 runners**
   - What we know: Node.js 22.21.0 bundles npm 10.9.4. There are efforts to add npm 11 to Node.js 22.
   - What's unclear: Whether future `actions/setup-node@v4` with `node-version: 22` will ever bundle npm >= 11.5.1.
   - Recommendation: Always include the explicit upgrade step regardless. It's idempotent -- if npm is already >= 11.5.1, it skips the upgrade.

2. **`git+https://` vs `https://` format for provenance**
   - What we know: npm normalizes repository URLs to `git+https://...git` format internally. The Sigstore/provenance check compares the normalized URL against the OIDC token's repository claim. Some users report the `git+https://` format works, while one guide suggests plain `https://` format.
   - What's unclear: Whether npm 11.5.1+ has fixed the normalization issue (npm/cli#8036), making both formats work.
   - Recommendation: Use `git+https://` as decided by the user. This matches npm's internal normalization, avoiding any mismatch. The existing npm/cli issue (#8036) was actually a case-sensitivity problem, not a format problem.

## Sources

### Primary (HIGH confidence)
- **Codebase audit** -- All 9 package.json files read directly; repository fields, directory values, and formatting verified
- **Git remote** -- `git remote -v` confirms `git@github.com:minhoyoo-iotrust/WAIaaS.git`
- **GitHub API** -- `gh api repos/minhoyoo-iotrust/WAIaaS --jq '.full_name'` confirms `minhoyoo-iotrust/WAIaaS`
- **release.yml** -- Current deploy job structure verified (lines 221-275)
- **`.github/actions/setup/action.yml`** -- Setup uses Node.js 22, pnpm auto-detected from packageManager

### Secondary (MEDIUM confidence)
- [npm Trusted Publishing docs](https://docs.npmjs.com/trusted-publishers/) -- Requirements: npm >= 11.5.1, `id-token: write`
- [npm Generating Provenance Statements](https://docs.npmjs.com/generating-provenance-statements/) -- repository.url matching requirement
- [Phil Nash blog](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/) -- Practical gotchas: npm upgrade needed, provenance flag behavior, per-package config burden
- [remarkablemark guide](https://remarkablemark.org/blog/2025/12/19/npm-trusted-publishing/) -- npm >= 11.5.1, Node >= 24 (for bundled npm), workflow setup
- [npm/cli#8036](https://github.com/npm/cli/issues/8036) -- Repository URL case sensitivity in provenance (resolved: user error)
- [npm/cli#7978](https://github.com/npm/cli/issues/7978) -- URL normalization bug (resolved: case sensitivity)
- [leechael complete guide](https://leechael.org/posts/2025/npm-trusted-publishers-the-complete-guide/) -- Three-source match requirement (OIDC token, npm config, package.json)
- [pnpm/pnpm#9812](https://github.com/pnpm/pnpm/issues/9812) -- pnpm delegates publish to npm CLI; OIDC works if system npm is >= 11.5.1
- [The Candid Startup blog](https://www.thecandidstartup.org/2026/01/26/bootstrapping-npm-provenance-github-actions.html) -- Node 24 recommended for bundled npm; explicit upgrade for Node 22
- [nodejs/node#58423](https://github.com/nodejs/node/issues/58423) -- npm 11 update request for Node.js 22; not yet confirmed bundled

### Tertiary (LOW confidence)
- Node.js 22 npm bundling timeline -- Could not confirm exact version where npm 11 enters Node.js 22.x LTS. Safest to always upgrade explicitly.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Directly verified from codebase and npm docs
- Architecture: HIGH -- Straightforward metadata edits and one CI step addition
- Pitfalls: HIGH -- Well-documented in multiple blog posts and npm/cli issues; case sensitivity and npm version are the main risks
- Repository URL format: MEDIUM -- User decision is `git+https://`, which aligns with npm normalization. Some guides suggest plain `https://` but evidence shows `git+https://` is what npm uses internally.

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (30 days -- stable domain, npm trusted publishing is GA)
