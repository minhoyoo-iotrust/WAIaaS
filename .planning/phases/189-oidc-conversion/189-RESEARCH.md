# Phase 189: OIDC 전환 - Research

**Researched:** 2026-02-19
**Domain:** npm Trusted Publishing (OIDC) + GitHub Actions CI/CD
**Confidence:** HIGH

## Summary

Phase 189 converts the release.yml deploy job from classic NPM_TOKEN-based authentication to OIDC Trusted Publishing. This involves three coordinated changes: (1) registering all 8 packages as Trusted Publishers on npmjs.com (manual web UI work), (2) adding `id-token: write` permission to the deploy job and switching from `pnpm publish` to `npm publish --provenance --access public`, and (3) removing the `Setup npmrc` step and `NODE_AUTH_TOKEN` environment variable.

Phase 188 (completed) already established the prerequisites: all 9 package.json files have correct `repository.url` matching the GitHub remote (`git+https://github.com/minhoyoo-iotrust/WAIaaS.git`), and the deploy job has an npm >= 11.5.1 version guard. The OIDC transition in Phase 189 is a workflow-only change plus manual npmjs.com configuration -- no runtime code changes.

The key technical insight is that npm 11.5.1+ automatically detects OIDC environments in GitHub Actions and handles authentication transparently. When `id-token: write` permission is granted, the npm CLI requests an OIDC token from GitHub, exchanges it with the npm registry for a short-lived publish credential, and signs a provenance attestation via Sigstore. No `.npmrc` configuration is needed for OIDC; in fact, having `NODE_AUTH_TOKEN` set can interfere with OIDC detection (npm falls back to token auth if a token is present).

**Primary recommendation:** Switch to `npm publish --provenance --access public` in the deploy job (not `pnpm publish`), remove the `Setup npmrc` step and `NODE_AUTH_TOKEN`, add `id-token: write` to the deploy job's permissions block, and register all 8 packages on npmjs.com as Trusted Publishers.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OIDC-01 | npmjs.com에서 8개 패키지 각각 Trusted Publisher 등록 (repo: minhoyoo-iotrust/WAIaaS, workflow: release.yml, environment: production) | Each package must be registered individually on npmjs.com. Navigate to `npmjs.com/package/<name>/access` for each package. Settings: Owner=minhoyoo-iotrust, Repository=WAIaaS, Workflow=release.yml, Environment=production. All fields are case-sensitive. The `environment` field must match the deploy job's `environment: production` in release.yml. |
| OIDC-02 | release.yml deploy 잡에 permissions: { contents: read, id-token: write } 추가 | The deploy job needs job-level `permissions` block (not top-level) per least-privilege principle. `id-token: write` enables GitHub to issue OIDC tokens. `contents: read` is needed for checkout. This does NOT affect other jobs. |
| OIDC-03 | deploy 잡에서 Setup npmrc 스텝 및 NODE_AUTH_TOKEN 환경변수 제거 | OIDC authentication replaces token-based auth. Having NODE_AUTH_TOKEN set causes npm to fall back to token auth, bypassing OIDC. Both the `Setup npmrc` step (line 249-251) and the `NODE_AUTH_TOKEN` env var in the publish step (line 277-278) must be removed. |
| OIDC-04 | deploy 잡의 pnpm publish를 npm publish --provenance --access public 전환 (pre-release 시 --tag rc 포함) | Prior decision: use `npm publish` directly instead of `pnpm publish`. The `--provenance` flag explicitly enables provenance attestation. Each publish in the sequential loop gets a fresh OIDC token. Pre-release versions use `--tag rc` additionally. |
| OIDC-05 | publish-check 잡은 --provenance 없이 기존 pnpm publish --dry-run 유지 확인 | Prior decision: publish-check keeps `pnpm publish --dry-run --no-git-checks`. No `--provenance` flag (dry-run + provenance is incompatible -- provenance requires actual OIDC token exchange). No changes needed to publish-check. |
</phase_requirements>

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| npm CLI | >= 11.5.1 | Package publishing with OIDC/provenance | Minimum version for Trusted Publishing. Already guaranteed by Phase 188's version guard step in deploy job. |
| GitHub Actions OIDC | N/A | Identity token provider | Built into GitHub Actions. Enabled by `id-token: write` permission. |
| Sigstore | N/A | Provenance attestation | npm uses Sigstore transparency log for provenance signatures. Automatic with `--provenance`. |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| pnpm | 9.15.4 | Package management (install/build) | Keep for install/build. NOT used for publish in deploy job (prior decision). |
| actions/setup-node | v4 | Node.js setup | Already in `.github/actions/setup/action.yml`. No `registry-url` specified (correct for OIDC -- avoids .npmrc interference). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `npm publish` directly | `pnpm publish` (delegates to npm internally) | Prior decision locks `npm publish` -- clearer OIDC token path, no pnpm indirection. pnpm delegates to npm anyway but adds a layer of uncertainty. |
| `--provenance` flag | `NPM_CONFIG_PROVENANCE=true` env var | Flag is more explicit in the workflow YAML. Env var is useful for tools like Changesets that don't expose CLI flags. We use direct npm publish so flag is cleaner. |
| `--provenance` flag | `publishConfig.provenance: true` in package.json | Embeds CI concern in source code. Flag keeps it in CI where it belongs. |

## Architecture Patterns

### Pattern 1: OIDC Authentication Flow
**What:** npm CLI automatically detects OIDC environment in GitHub Actions, requests an OIDC token from GitHub, exchanges it with npm registry for a short-lived publish credential, and signs provenance via Sigstore.
**When to use:** Deploy job with `id-token: write` permission.
**Flow:**
1. GitHub Actions issues OIDC token containing repository, workflow, environment claims
2. npm CLI detects OIDC availability (no `.npmrc` token present, `id-token: write` granted)
3. npm exchanges OIDC token with npm registry
4. npm registry verifies token against Trusted Publisher config
5. npm receives short-lived publish credential
6. npm publishes package + signs provenance attestation via Sigstore
7. Provenance attestation logged in Sigstore transparency log

### Pattern 2: Sequential Multi-Package Publishing with OIDC
**What:** Publishing 8 packages in a shell loop, each getting its own fresh OIDC token.
**When to use:** Monorepo with multiple publishable packages.
**Example:**
```yaml
- name: Publish packages
  run: |
    PACKAGES=(
      packages/core
      packages/daemon
      packages/cli
      packages/sdk
      packages/mcp
      packages/skills
      packages/adapters/solana
      packages/adapters/evm
    )
    for pkg_path in "${PACKAGES[@]}"; do
      echo "--- Publishing $pkg_path ---"
      cd "$pkg_path"
      PKG_VERSION=$(node -p "require('./package.json').version")
      if [[ "$PKG_VERSION" == *-* ]]; then
        npm publish --provenance --access public --tag rc 2>&1
      else
        npm publish --provenance --access public 2>&1
      fi
      cd "$GITHUB_WORKSPACE"
    done
```

**Key points:**
- Each `npm publish` invocation requests its own OIDC token from GitHub
- OIDC tokens are short-lived but the loop runs within the same job step, so token renewal is handled by npm automatically
- All 8 packages must be registered as Trusted Publishers on npmjs.com pointing to the same workflow
- No `NODE_AUTH_TOKEN` env var needed (would interfere with OIDC)

### Pattern 3: Job-Level Permissions (Least Privilege)
**What:** Adding OIDC permissions only to the deploy job, not top-level.
**When to use:** When only one job in a multi-job workflow needs OIDC.
**Example:**
```yaml
deploy:
  runs-on: ubuntu-latest
  needs: [test, chain-integration, platform, publish-check, docker-publish]
  if: github.event_name == 'release'
  environment: production
  permissions:
    contents: read
    id-token: write
  steps:
    ...
```

**Why:** Top-level `id-token: write` would grant OIDC token generation to all 6 jobs (test, chain-integration, platform, publish-check, docker-publish, deploy). Only deploy needs it. Job-level permissions override top-level for that specific job.

### Anti-Patterns to Avoid
- **Setting NODE_AUTH_TOKEN alongside OIDC:** npm will use the token instead of OIDC if NODE_AUTH_TOKEN is set. This silently disables OIDC.
- **Using `registry-url` in setup-node with OIDC:** When `registry-url` is specified, `actions/setup-node` creates an `.npmrc` that references `NODE_AUTH_TOKEN`. This can conflict with OIDC auto-detection. The current setup correctly omits `registry-url`.
- **Adding `--provenance` to dry-run:** `pnpm publish --dry-run --provenance` fails because provenance requires actual OIDC token exchange and Sigstore signing, which doesn't happen in dry-run mode.
- **Using `pnpm publish` for OIDC:** While pnpm delegates to npm internally and can work, the OIDC token path is less predictable. Prior decision locks `npm publish` for clarity.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OIDC token acquisition | Manual OIDC token fetch via GitHub API | npm CLI auto-detection | npm 11.5.1+ handles the full OIDC flow automatically |
| Provenance signing | Manual Sigstore integration | `--provenance` flag | npm handles Sigstore signing, certificate creation, and transparency log entry |
| .npmrc for OIDC | Manual `.npmrc` with token placeholders | No .npmrc at all | OIDC requires NO .npmrc configuration. Having one can interfere. |
| Token management | Custom token rotation scripts | OIDC (no tokens) | Trusted Publishing eliminates all token management |

**Key insight:** The entire OIDC flow is handled by npm CLI 11.5.1+. The workflow's job is to grant permissions and call `npm publish --provenance`. Everything else (token exchange, signing, verification) is automatic.

## Common Pitfalls

### Pitfall 1: NODE_AUTH_TOKEN Preventing OIDC
**What goes wrong:** npm detects `NODE_AUTH_TOKEN` in the environment and uses token-based auth instead of OIDC. Publishing may succeed (if the token is valid) but without provenance, or fail with "token expired" if NPM_TOKEN has been revoked.
**Why it happens:** npm's auth resolution prioritizes explicit tokens over OIDC auto-detection.
**How to avoid:** Remove the `Setup npmrc` step and ALL `NODE_AUTH_TOKEN` / `NPM_TOKEN` references from the deploy job's env.
**Warning signs:** "Access token expired or revoked" error, or publishing succeeds but npm package page shows no provenance badge.

### Pitfall 2: Trusted Publisher Config Mismatch
**What goes wrong:** npm returns 404 during OIDC token exchange because the workflow doesn't match the Trusted Publisher configuration.
**Why it happens:** Case-sensitive mismatch in owner, repository, workflow filename, or environment name between npmjs.com config and actual GitHub Actions context.
**How to avoid:** Use exact values: Owner=`minhoyoo-iotrust`, Repository=`WAIaaS` (capital W, A, S), Workflow=`release.yml`, Environment=`production`. Verify each package individually.
**Warning signs:** 404 Not Found during `npm publish`, error message referencing "could not match your workflow run."

### Pitfall 3: Missing Environment in Trusted Publisher Config
**What goes wrong:** The deploy job uses `environment: production` in the workflow YAML, but the Trusted Publisher config on npmjs.com either omits the environment or uses a different name.
**Why it happens:** The environment field in Trusted Publisher config must exactly match the GitHub Actions `environment:` value when one is specified.
**How to avoid:** Set Environment=`production` in all 8 Trusted Publisher configurations on npmjs.com, matching the deploy job's `environment: production`.
**Warning signs:** 404 or "workflow run does not match" error despite correct owner/repo/workflow values.

### Pitfall 4: repository.url Case Sensitivity
**What goes wrong:** Sigstore provenance verification fails with E422 because repository URL case in package.json doesn't match the OIDC token's repository claim.
**Why it happens:** GitHub OIDC token uses the canonical case `minhoyoo-iotrust/WAIaaS`, while package.json might have different casing.
**How to avoid:** Phase 188 already fixed this -- all package.json files use `git+https://github.com/minhoyoo-iotrust/WAIaaS.git` which matches the canonical GitHub case. npm normalizes `git+https://...git` internally for comparison.
**Warning signs:** E422 Unprocessable Entity during publish with provenance.

### Pitfall 5: Partial Publish Failure in Loop
**What goes wrong:** One package in the 8-package loop fails to publish, but earlier packages were already published. This creates an inconsistent state.
**Why it happens:** OIDC token exchange fails for one package (e.g., Trusted Publisher not registered, or transient Sigstore error).
**How to avoid:** Register all 8 packages as Trusted Publishers BEFORE the first OIDC publish attempt. Verify each registration. In case of failure, the publish can be retried (npm handles idempotent publishes for same version -- 403 "version already exists" is expected for already-published packages).
**Warning signs:** Error on the Nth package in the loop while first N-1 succeeded.

### Pitfall 6: actions/setup-node Default Token Interference
**What goes wrong:** `actions/setup-node` may set a default `NODE_AUTH_TOKEN` when `registry-url` is specified. This default token overrides OIDC detection.
**Why it happens:** The current setup action (`.github/actions/setup/action.yml`) does NOT specify `registry-url`, so this is not currently a problem. But if someone adds `registry-url` to the shared setup action, all jobs would get an `.npmrc` with a token reference.
**How to avoid:** Never add `registry-url` to the shared setup action. OIDC needs a clean environment without token references.
**Warning signs:** `.npmrc` file appearing in the build output with `_authToken` references.

## Code Examples

### Example 1: Deploy Job with OIDC (Target State)
```yaml
# Gate 2: Manual approval deploy -- npm publish with OIDC + provenance
deploy:
  runs-on: ubuntu-latest
  needs: [test, chain-integration, platform, publish-check, docker-publish]
  if: github.event_name == 'release'
  environment: production
  permissions:
    contents: read
    id-token: write  # npm OIDC Trusted Publishing
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

    - name: Publish packages
      run: |
        PACKAGES=(
          packages/core
          packages/daemon
          packages/cli
          packages/sdk
          packages/mcp
          packages/skills
          packages/adapters/solana
          packages/adapters/evm
        )
        for pkg_path in "${PACKAGES[@]}"; do
          echo "--- Publishing $pkg_path ---"
          cd "$pkg_path"
          PKG_VERSION=$(node -p "require('./package.json').version")
          if [[ "$PKG_VERSION" == *-* ]]; then
            npm publish --provenance --access public --tag rc 2>&1
          else
            npm publish --provenance --access public 2>&1
          fi
          cd "$GITHUB_WORKSPACE"
        done

    - name: Deploy summary
      run: |
        echo "## Deploy Summary" >> $GITHUB_STEP_SUMMARY
        echo "" >> $GITHUB_STEP_SUMMARY
        echo "- **Version:** ${{ github.event.release.tag_name }}" >> $GITHUB_STEP_SUMMARY
        echo "- **npm:** 8 packages published with OIDC provenance" >> $GITHUB_STEP_SUMMARY
        echo "- **Docker (GHCR):** ghcr.io/${{ github.repository }}" >> $GITHUB_STEP_SUMMARY
        echo "- **Docker (Hub):** waiaas/daemon" >> $GITHUB_STEP_SUMMARY
```

### Example 2: Diff from Current to Target (Deploy Job)
Key changes:
1. **ADD** `permissions:` block with `contents: read` + `id-token: write` to deploy job
2. **REMOVE** "Setup npmrc" step entirely (lines 249-252)
3. **REPLACE** `pnpm publish` with `npm publish --provenance --access public` in the publish step
4. **REMOVE** `NODE_AUTH_TOKEN` env var from the publish step (lines 277-278)
5. **UPDATE** step name from "pnpm publish" to "Publish packages"
6. **UPDATE** deploy summary line from "8 packages published to npmjs.com" to "8 packages published with OIDC provenance"

### Example 3: npmjs.com Trusted Publisher Registration (Per Package)
```
URL: https://www.npmjs.com/package/@waiaas/core/access
  Provider: GitHub Actions
  Owner: minhoyoo-iotrust
  Repository: WAIaaS
  Workflow: release.yml
  Environment: production
```

Repeat for all 8 packages:
- `@waiaas/core`
- `@waiaas/daemon`
- `@waiaas/cli`
- `@waiaas/sdk`
- `@waiaas/mcp`
- `@waiaas/skills`
- `@waiaas/adapter-solana`
- `@waiaas/adapter-evm`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Classic Automation Token (NPM_TOKEN) | OIDC Trusted Publishing | npm CLI 11.5.1, July 2025 GA | No stored secrets, short-lived tokens, provenance attestation |
| `.npmrc` with `_authToken` | No `.npmrc` needed for OIDC | npm 11.5.1+ | npm auto-detects OIDC environment |
| `pnpm publish` | `npm publish` directly | Project decision v2.4 | Clearer OIDC token path without pnpm indirection |
| No provenance | `--provenance` flag (SLSA Level 3) | npm 9.5.0+ for provenance, 11.5.1 for OIDC | Build origin attestation on npm package page |

**Deprecated/outdated:**
- **Classic Automation Tokens:** Still work but npm recommends migration to Trusted Publishing. Tokens are long-lived and pose supply chain risk.
- **`pnpm publish --provenance`:** pnpm 9.x does not natively support OIDC. It delegates to npm CLI internally, but the token path is less predictable. npm publish is recommended for OIDC workflows.

## Open Questions

1. **repository.url Format vs Provenance Verification**
   - What we know: Phase 188 set all package.json `repository.url` to `git+https://github.com/minhoyoo-iotrust/WAIaaS.git`. The OIDC token from GitHub uses `https://github.com/minhoyoo-iotrust/WAIaaS` (no prefix/suffix). npm 11.5.1+ normalizes both formats for comparison. Known issues (#8036, #7978) were actually case-sensitivity bugs, not format bugs.
   - What's unclear: Whether npm's normalization is 100% reliable across all edge cases.
   - Recommendation: Proceed with current `git+https://...git` format (already deployed in Phase 188). Case sensitivity is correct. If E422 errors occur, the fallback is to change to plain `https://` format -- but this is unlikely based on evidence.
   - Confidence: HIGH -- multiple sources confirm npm normalizes the format.

2. **NPM_TOKEN Removal Timing**
   - What we know: Prior decision says "NPM_TOKEN은 OIDC 검증 완료 후에만 제거 -- 롤백 가능성 유지."
   - What's unclear: Whether to remove NPM_TOKEN from GitHub Secrets as part of this phase or defer to a follow-up phase.
   - Recommendation: This phase removes `NODE_AUTH_TOKEN` from the workflow YAML. The actual NPM_TOKEN secret in GitHub Settings can be left for rollback purposes until the first successful OIDC publish is verified. Secret deletion is a manual step documented but not automated.

## Sources

### Primary (HIGH confidence)
- **Codebase audit** -- release.yml (lines 221-288), `.github/actions/setup/action.yml`, all 8 package.json files verified
- **Phase 188 research & verification** -- `.planning/phases/188-pre-setup/188-RESEARCH.md`, `188-VERIFICATION.md`
- [npm Trusted Publishing docs](https://docs.npmjs.com/trusted-publishers/) -- OIDC setup, requirements, per-package configuration
- [npm Generating Provenance Statements](https://docs.npmjs.com/generating-provenance-statements/) -- `--provenance` flag, repository.url matching
- [pnpm/pnpm#9812](https://github.com/pnpm/pnpm/issues/9812) -- Confirmed: pnpm delegates publish to npm CLI; no native OIDC support

### Secondary (MEDIUM confidence)
- [Phil Nash blog](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/) -- Practical gotchas: per-package registration required, `--provenance` flag sometimes needed despite docs saying automatic, npm upgrade needed
- [vcfvct blog](https://vcfvct.wordpress.com/2026/01/17/publishing-to-npm-with-github-actions-oidc-trusted-publishing-what-i-learned/) -- NODE_AUTH_TOKEN removal, error messages, fallback behavior
- [The Candid Startup](https://www.thecandidstartup.org/2026/01/26/bootstrapping-npm-provenance-github-actions.html) -- `setup-node` with `registry-url` needed for `.npmrc` creation; monorepo `--workspaces` approach; Lerna alternative
- [leechael complete guide](https://leechael.org/posts/2025/npm-trusted-publishers-the-complete-guide/) -- Three-source match requirement, Environment field must match workflow YAML
- [GitHub community discussion #176761](https://github.com/orgs/community/discussions/176761) -- NODE_AUTH_TOKEN conflict with OIDC, case-sensitivity issues
- [remarkablemark guide](https://remarkablemark.org/blog/2025/12/19/npm-trusted-publishing/) -- npm >= 11.5.1 requirement, environment configuration
- [npmdigest guide](https://npmdigest.com/guides/npm-trusted-publishing) -- Each package needs individual Trusted Publisher config, all can point to same workflow
- [npm/cli#8036](https://github.com/npm/cli/issues/8036) -- repository.url case sensitivity bug (resolved: was user error)
- [npm/cli#7978](https://github.com/npm/cli/issues/7978) -- URL normalization with case sensitivity (resolved)
- [npm/cli#8730](https://github.com/npm/cli/issues/8730) -- OIDC publish bug with publishConfig.provenance
- [Ankush Kun guide](https://ankush.one/blogs/npm-oidc-publishing/) -- Minimal workflow YAML, npm upgrade step, setup-node with registry-url
- [robino.dev blog](https://blog.robino.dev/posts/npm-trusted-publishing) -- NPM_CONFIG_PROVENANCE env var approach, Changesets integration
- [MakerX blog](https://blog.makerx.com.au/catch-up-on-the-new-npm-trusted-publishing-feature/) -- Each package can only have one trusted publisher at a time
- [Socket blog](https://socket.dev/blog/npm-trusted-publishing) -- npm auto-detects OIDC before falling back to tokens

### Tertiary (LOW confidence)
- OIDC token re-issuance in sequential publish loop -- Multiple sources confirm fresh tokens per publish, but no authoritative npm docs detail the exact token lifecycle within a single job step.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- npm Trusted Publishing is GA since July 2025, well-documented
- Architecture: HIGH -- Straightforward workflow YAML changes, well-understood OIDC flow
- Pitfalls: HIGH -- Multiple community sources document the same pitfalls consistently (NODE_AUTH_TOKEN conflict, case sensitivity, environment mismatch)
- Monorepo loop publishing: MEDIUM -- Works in practice (multiple sources confirm), but no official npm documentation specifically addresses sequential multi-package OIDC publishing in a loop

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (30 days -- npm Trusted Publishing is stable/GA)
