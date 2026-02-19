# Phase 190: 검증 및 정리 - Research

**Researched:** 2026-02-19
**Domain:** npm OIDC Trusted Publishing E2E 검증, supply chain 보안 완료, GitHub Secrets 정리
**Confidence:** HIGH

## Summary

Phase 190 is the final verification and cleanup phase of the v2.4 npm Trusted Publishing migration. Phase 189 completed the technical conversion (Trusted Publisher registration on npmjs.com, release.yml deploy job converted to OIDC + provenance). Phase 190 validates that everything works end-to-end via an actual release, confirms provenance badges appear on npmjs.com, removes the legacy NPM_TOKEN secret from GitHub, and enhances the deploy summary with provenance details.

This phase is primarily operational/verification work, not code-heavy. The only code change is enhancing the deploy summary step in release.yml to include provenance information (source repository, commit SHA, workflow run link). The remaining requirements involve triggering a release (rc or stable), visually confirming provenance badges on npmjs.com, and deleting the NPM_TOKEN secret from GitHub repository settings.

The key insight is that VERIFY-01 and VERIFY-02 are observation-only requirements that require a real release to trigger the OIDC publish flow. VERIFY-03 is a manual GitHub Settings action. Only VERIFY-04 involves actual code modification to release.yml's deploy summary step.

**Primary recommendation:** Trigger a release (via release-please PR merge), verify 8 packages publish successfully with OIDC + provenance, confirm badges on npmjs.com, then delete NPM_TOKEN from GitHub Secrets, and enhance the deploy summary with provenance metadata.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VERIFY-01 | OIDC 전환 후 실제 릴리스 (rc 또는 stable)로 8개 패키지 발행 성공 확인 | Release-please creates a Release PR on push to main. Merging the Release PR triggers a GitHub Release event, which fires release.yml. The deploy job (with OIDC + provenance) runs after all quality gates pass. Human observes that all 8 packages publish without error. This is a checkpoint:human-action -- requires triggering a release and observing the result. |
| VERIFY-02 | npmjs.com 패키지 페이지에서 provenance 배지 표시 확인 | After successful OIDC publish with `--provenance`, npmjs.com shows: (1) green checkmark badge next to version number, (2) "Built and signed on GitHub Actions" text, (3) provenance section at bottom with Build Summary (link to workflow run), Source Commit (link to commit), Build File (link to workflow file). Visit each package's page on npmjs.com to verify. This is a checkpoint:human-action. |
| VERIFY-03 | GitHub Secrets에서 NPM_TOKEN 시크릿 제거 (OIDC 발행 성공 검증 후) | Confirmed: NPM_TOKEN exists in GitHub Secrets (updated 2026-02-17). No workflow references it anymore (Phase 189 removed all references). Can be deleted via `gh secret delete NPM_TOKEN` or GitHub web UI Settings > Secrets. Prior decision: only delete AFTER successful OIDC publish (VERIFY-01 confirmed). |
| VERIFY-04 | Deploy summary에 provenance 정보 추가 | Current deploy summary (release.yml:276-283) is basic. Enhance with: source repository URL, commit SHA, workflow run URL. GitHub Actions provides env vars: `$GITHUB_REPOSITORY`, `$GITHUB_SHA`, `$GITHUB_SERVER_URL`, `$GITHUB_RUN_ID`. Construct links: `$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID` for workflow run, `$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/commit/$GITHUB_SHA` for commit. |
</phase_requirements>

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| GitHub Actions | N/A | CI/CD pipeline for release | Already configured in release.yml with OIDC deploy job |
| npm CLI | >= 11.5.1 | Package publishing with OIDC + provenance | Version guard already in deploy job (Phase 188) |
| release-please | v4 | Release PR + GitHub Release creation | Already configured in release-please.yml with prerelease: true |
| gh CLI | latest | GitHub Secrets management | Available locally. `gh secret delete NPM_TOKEN` for VERIFY-03 |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `npm audit signatures` | npm >= 9.5.0 | Verify provenance attestations of published packages | Post-release verification to confirm provenance is recorded |
| `npm view <pkg> --json` | npm >= 9.5.0 | Check attestation URLs programmatically | Optional: verify `.dist.attestations.url` exists in package metadata |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gh secret delete` CLI | GitHub web UI (Settings > Secrets) | CLI is scriptable and auditable, but web UI is fine for one-time deletion. Either works. |
| Manual npmjs.com check | `npm audit signatures` CLI verification | CLI confirms cryptographic validity; visual check confirms badge appearance. Both recommended. |

## Architecture Patterns

### Pattern 1: Enhanced Deploy Summary with Provenance Metadata
**What:** Add source repository, commit, and workflow run links to the GitHub Actions step summary.
**When to use:** After each successful deploy to provide traceability.
**Example:**
```yaml
- name: Deploy summary
  run: |
    echo "## Deploy Summary" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "- **Version:** ${{ github.event.release.tag_name }}" >> $GITHUB_STEP_SUMMARY
    echo "- **npm:** 8 packages published with OIDC provenance" >> $GITHUB_STEP_SUMMARY
    echo "- **Docker (GHCR):** ghcr.io/${{ github.repository }}" >> $GITHUB_STEP_SUMMARY
    echo "- **Docker (Hub):** waiaas/daemon" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "### Provenance" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "- **Source:** [${{ github.repository }}](${{ github.server_url }}/${{ github.repository }})" >> $GITHUB_STEP_SUMMARY
    echo "- **Commit:** [\`${GITHUB_SHA::7}\`](${{ github.server_url }}/${{ github.repository }}/commit/${{ github.sha }})" >> $GITHUB_STEP_SUMMARY
    echo "- **Workflow:** [release.yml#deploy](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})" >> $GITHUB_STEP_SUMMARY
    echo "- **Sigstore:** Attestations logged in [Rekor transparency log](https://search.sigstore.dev/)" >> $GITHUB_STEP_SUMMARY
```

**Key points:**
- Use GitHub Actions contexts (`${{ github.server_url }}`, `${{ github.repository }}`, `${{ github.sha }}`, `${{ github.run_id }}`) for dynamic URLs
- Short commit SHA (`${GITHUB_SHA::7}`) for display, full SHA for link
- Include Rekor transparency log link for provenance verification
- Markdown links work in GITHUB_STEP_SUMMARY

### Pattern 2: Release Trigger Flow (release-please 2-Gate)
**What:** The existing release flow: merge PR to main -> release-please creates Release PR -> merge Release PR (Gate 1) -> release.yml fires -> deploy job needs manual approval (Gate 2).
**When to use:** To trigger VERIFY-01.
**Flow:**
1. Merge `milestone/v2.4` to `main` (or any conventional-commit push to main)
2. release-please action detects `feat:` / `fix:` commits, creates Release PR
3. Release PR includes version bump + CHANGELOG update
4. Merge Release PR -> GitHub Release is created automatically
5. `release.yml` triggers on `release: published` event
6. Quality gates (test, chain-integration, platform, publish-check, docker-publish) run
7. Deploy job requires manual approval (environment: production)
8. Deploy job publishes 8 packages with OIDC + provenance

**Note:** The release-please config has `"prerelease": true`, so it may create rc versions. Both rc and stable releases exercise the same OIDC flow.

### Pattern 3: Post-Release Provenance Verification
**What:** After publishing, verify provenance was correctly attached.
**Commands:**
```bash
# Verify provenance attestations exist
npm audit signatures

# Check specific package attestation
npm view @waiaas/core --json | jq '.dist.attestations'

# Visit npmjs.com pages for visual badge check
# https://www.npmjs.com/package/@waiaas/core
```

### Anti-Patterns to Avoid
- **Deleting NPM_TOKEN before OIDC verification:** Prior decision explicitly states NPM_TOKEN should only be removed after successful OIDC publish is confirmed. Premature deletion removes rollback path.
- **Assuming provenance = security:** Provenance provides a verifiable link to source code and build instructions, NOT a guarantee that the package is free of malicious code. Don't overclaim in documentation.
- **Expecting provenance badge immediately:** There may be a brief propagation delay (minutes) between publish and badge appearance on npmjs.com. Don't panic if the badge isn't instant.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Provenance verification | Custom Sigstore/Rekor API calls | `npm audit signatures` | npm CLI handles verification automatically |
| Secret deletion | GitHub REST API calls | `gh secret delete NPM_TOKEN` | gh CLI is simpler and already authenticated |
| Release triggering | Manual npm publish from local | release-please + release.yml pipeline | The whole point is verifying the CI/CD pipeline works end-to-end |
| Deploy summary URLs | Hardcoded URLs | GitHub Actions context variables | `github.server_url`, `github.repository`, `github.sha`, `github.run_id` are dynamic |

**Key insight:** This phase is about verification and cleanup, not building new infrastructure. The tools are already in place from Phases 188-189. Phase 190 exercises them end-to-end and cleans up the legacy secret.

## Common Pitfalls

### Pitfall 1: Release Not Triggering Deploy Job
**What goes wrong:** Merging the milestone branch to main doesn't immediately trigger a release. release-please creates a Release PR, which must be separately merged to create the actual GitHub Release.
**Why it happens:** The 2-gate model requires two separate merges: one for the code, one for the release decision.
**How to avoid:** Follow the full flow: merge milestone to main -> wait for release-please PR -> merge the Release PR -> wait for release.yml to complete.
**Warning signs:** No "release" event in GitHub Actions after merging milestone branch.

### Pitfall 2: OIDC Publish Fails Due to Missing Trusted Publisher
**What goes wrong:** One or more packages fail with 404 during OIDC token exchange.
**Why it happens:** Trusted Publisher registration on npmjs.com was incomplete or has incorrect values (owner/repo/workflow/environment case mismatch).
**How to avoid:** Phase 189-01 already registered all 8 packages. Before triggering the release, verify registrations are still active on npmjs.com.
**Warning signs:** "could not match your workflow run" error in deploy job logs.

### Pitfall 3: NPM_TOKEN Deleted Before Verification
**What goes wrong:** OIDC publish fails, and there's no fallback because NPM_TOKEN was already deleted.
**Why it happens:** Eager cleanup before confirming OIDC works.
**How to avoid:** Strict ordering: VERIFY-01 (publish success) -> VERIFY-02 (badge check) -> VERIFY-03 (delete token). Never reverse this order.
**Warning signs:** Wanting to "clean up" before the release is verified.

### Pitfall 4: Deploy Summary Using Wrong Context Syntax
**What goes wrong:** GitHub Actions context expressions (`${{ }}`) are not evaluated in `run:` shell scripts the same way as in `env:` or `with:` blocks. However, in the `run:` block, `${{ }}` IS evaluated by GitHub Actions before the shell runs.
**Why it happens:** Confusion about expression evaluation timing.
**How to avoid:** In `run:` blocks, `${{ github.sha }}` works because GitHub Actions evaluates it before passing to the shell. For shell-native env vars like `$GITHUB_SHA`, use shell syntax. Both approaches work; stay consistent with existing patterns in the workflow.
**Warning signs:** Empty values in deploy summary output.

### Pitfall 5: Provenance Badge Not Appearing
**What goes wrong:** Packages published successfully but no provenance badge on npmjs.com.
**Why it happens:** Could be: (1) propagation delay, (2) NODE_AUTH_TOKEN was accidentally present causing token-based auth fallback, (3) `--provenance` flag was missing.
**How to avoid:** Phase 189 already verified: no NODE_AUTH_TOKEN in deploy job, `--provenance` flag present. Allow a few minutes for badge propagation after publish.
**Warning signs:** Package published successfully but no green checkmark on npmjs.com version tab.

## Code Examples

### Example 1: Current Deploy Summary (Before VERIFY-04)
```yaml
# release.yml lines 276-283 (current state after Phase 189)
- name: Deploy summary
  run: |
    echo "## Deploy Summary" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "- **Version:** ${{ github.event.release.tag_name }}" >> $GITHUB_STEP_SUMMARY
    echo "- **npm:** 8 packages published with OIDC provenance" >> $GITHUB_STEP_SUMMARY
    echo "- **Docker (GHCR):** ghcr.io/${{ github.repository }}" >> $GITHUB_STEP_SUMMARY
    echo "- **Docker (Hub):** waiaas/daemon" >> $GITHUB_STEP_SUMMARY
```

### Example 2: Enhanced Deploy Summary (After VERIFY-04)
```yaml
- name: Deploy summary
  run: |
    echo "## Deploy Summary" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "- **Version:** ${{ github.event.release.tag_name }}" >> $GITHUB_STEP_SUMMARY
    echo "- **npm:** 8 packages published with OIDC provenance" >> $GITHUB_STEP_SUMMARY
    echo "- **Docker (GHCR):** ghcr.io/${{ github.repository }}" >> $GITHUB_STEP_SUMMARY
    echo "- **Docker (Hub):** waiaas/daemon" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "### Provenance" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "- **Source:** [${{ github.repository }}](${{ github.server_url }}/${{ github.repository }})" >> $GITHUB_STEP_SUMMARY
    echo "- **Commit:** [\`${GITHUB_SHA::7}\`](${{ github.server_url }}/${{ github.repository }}/commit/${{ github.sha }})" >> $GITHUB_STEP_SUMMARY
    echo "- **Workflow:** [release.yml#deploy](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})" >> $GITHUB_STEP_SUMMARY
    echo "- **Sigstore:** Attestations logged in [Rekor transparency log](https://search.sigstore.dev/)" >> $GITHUB_STEP_SUMMARY
```

### Example 3: Delete NPM_TOKEN Secret (VERIFY-03)
```bash
# After confirming VERIFY-01 and VERIFY-02
gh secret delete NPM_TOKEN

# Verify deletion
gh secret list
# Expected: NPM_TOKEN no longer in the list
```

### Example 4: Post-Release Provenance Verification Commands
```bash
# Install the published packages and verify signatures
npm audit signatures

# Check specific package for attestation data
npm view @waiaas/core --json | jq '.dist.attestations.url'

# Visit npmjs.com for visual confirmation
# https://www.npmjs.com/package/@waiaas/core
# Look for: green checkmark badge, "Built and signed on GitHub Actions"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| NPM_TOKEN in GitHub Secrets | OIDC Trusted Publishing (no stored tokens) | Phase 189 (2026-02-19) | Eliminates long-lived secret exposure risk |
| Basic deploy summary (version + registry) | Provenance-enriched summary (source, commit, workflow, Sigstore) | Phase 190 target | Traceability from deploy summary to source + attestation |
| `npm audit` (vulnerabilities only) | `npm audit signatures` (provenance + registry signatures) | npm 9.5.0+ | Consumers can verify package origin cryptographically |

**Deprecated/outdated:**
- **NPM_TOKEN reference in release.yml:** Already removed in Phase 189. The secret still exists in GitHub for rollback but will be deleted in this phase.
- **"packages published to npmjs.com" summary text:** Replaced with "packages published with OIDC provenance" in Phase 189.

## Open Questions

1. **Release Type for VERIFY-01 (rc vs stable)**
   - What we know: release-please config has `"prerelease": true`, so next release will likely be an rc version. Both rc and stable use the same OIDC flow.
   - What's unclear: Whether the user wants to trigger an rc release specifically for verification, or wait for a stable release.
   - Recommendation: An rc release is sufficient for OIDC verification. The OIDC flow is identical for rc and stable. Trigger an rc release as the verification vehicle.
   - Confidence: HIGH -- the deploy job's OIDC path is version-agnostic.

2. **Timing of NPM_TOKEN Deletion**
   - What we know: Prior decision says delete only after OIDC publish success confirmed. NPM_TOKEN still exists in GitHub Secrets.
   - What's unclear: Whether to include a "cooldown" period between successful publish and deletion (e.g., wait 24 hours to catch delayed issues).
   - Recommendation: Delete immediately after VERIFY-01 and VERIFY-02 are confirmed. No workflow references NPM_TOKEN, so there's no functional dependency. If a problem occurs later, a new token can be generated.
   - Confidence: HIGH -- no code path uses NPM_TOKEN anymore.

3. **Deploy Summary: Should It Include Per-Package Provenance URLs?**
   - What we know: npm publish outputs `Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=NNNN` for each package. Capturing 8 individual URLs would require parsing stdout in the publish loop.
   - What's unclear: Whether per-package granularity is worth the complexity.
   - Recommendation: Use a single general Sigstore link in the summary rather than per-package URLs. The npmjs.com package pages already show per-package provenance details. The deploy summary's purpose is orientation, not exhaustive traceability.
   - Confidence: MEDIUM -- a simpler approach serves the stated requirement. Per-package URLs could be added later if needed.

## Sources

### Primary (HIGH confidence)
- **Codebase audit** -- `release.yml` (current state, 284 lines), `release-please-config.json`, `release-please.yml`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`
- **Phase 189 artifacts** -- `189-RESEARCH.md`, `189-VERIFICATION.md`, `189-01-SUMMARY.md`, `189-02-SUMMARY.md` (complete record of OIDC conversion)
- **GitHub Secrets inventory** -- `gh secret list` confirms NPM_TOKEN exists alongside DOCKERHUB_TOKEN, DOCKERHUB_USERNAME, RELEASE_PAT
- [npm Generating Provenance Statements](https://docs.npmjs.com/generating-provenance-statements/) -- `--provenance` flag behavior, output format
- [npm Viewing Package Provenance](https://docs.npmjs.com/viewing-package-provenance/) -- npmjs.com provenance display (Build Summary, Source Commit, Build File)
- [npm Trusted Publishing docs](https://docs.npmjs.com/trusted-publishers/) -- OIDC authentication flow
- [gh secret delete](https://cli.github.com/manual/gh_secret_delete) -- CLI command for deleting GitHub repository secrets
- [GitHub Actions variables](https://docs.github.com/en/actions/learn-github-actions/variables) -- `GITHUB_SHA`, `GITHUB_RUN_ID`, `GITHUB_SERVER_URL`, `GITHUB_REPOSITORY`

### Secondary (MEDIUM confidence)
- [npm/cli#4622b42](https://github.com/npm/cli/commit/4622b425751bc6e3eebb9abfa5fc3fbf94890e34) -- Exact provenance notice format: "Signed provenance statement with source and build information from GitHub Actions" + "Provenance statement published to transparency log: {logUrl}"
- [Socket.IO blog on npm provenance](https://socket.io/blog/npm-package-provenance/) -- Provenance section at bottom of npmjs.com page, green checkmark badge in Versions tab
- [tsmx blog](https://tsmx.net/npmjs-built-and-signed-on-github-actions/) -- Visual provenance badge description: green checkmark next to version, provenance section with source repo, commit, workflow
- [The Candid Startup](https://www.thecandidstartup.org/2026/01/26/bootstrapping-npm-provenance-github-actions.html) -- Transparency log URL format: `https://search.sigstore.dev/?logIndex=NNNN`
- [npm/provenance GitHub repo](https://github.com/npm/provenance) -- Reference implementation, example packages

### Tertiary (LOW confidence)
- Per-package transparency log URL capture from npm publish stdout -- Multiple sources mention the output format but no authoritative documentation on parsing it reliably in a shell loop. Recommend against parsing for deploy summary.

## Metadata

**Confidence breakdown:**
- VERIFY-01 (E2E release): HIGH -- well-understood release-please + release.yml flow, already exercised in previous releases
- VERIFY-02 (provenance badge): HIGH -- multiple sources describe the badge appearance consistently, standard npm behavior
- VERIFY-03 (NPM_TOKEN deletion): HIGH -- `gh secret delete` is straightforward, confirmed NPM_TOKEN exists in secrets, no code references
- VERIFY-04 (deploy summary): HIGH -- GitHub Actions context variables are well-documented, existing summary pattern is clear
- Overall: HIGH -- this is verification/cleanup work using established tools, no novel technical challenges

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (30 days -- all tools and patterns are stable/GA)
