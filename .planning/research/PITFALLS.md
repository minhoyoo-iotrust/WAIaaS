# Pitfalls Research

**Domain:** Desktop App Distribution Channels (Download Page + Homebrew Cask + Installation Guide)
**Researched:** 2026-04-01
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: GitHub Releases API Rate Limiting on Download Page

**What goes wrong:**
Download page uses unauthenticated GitHub Releases API (`api.github.com/repos/.../releases/latest`) to fetch asset URLs. Unauthenticated requests are limited to 60 requests/hour per IP. A popular page or corporate network sharing a single IP exhausts the limit quickly, leaving visitors with a broken download page showing no versions or links.

**Why it happens:**
Client-side JS calling the API directly from the browser. Each page load = 1 API call. No caching layer between user and GitHub.

**How to avoid:**
1. Build-time approach (recommended): Fetch release data during `site/build.mjs` and embed asset URLs directly in the HTML. Re-build on `desktop-release.yml` publish event or daily cron (already have `schedule` in pages.yml).
2. If client-side is needed: Cache the API response in localStorage with a 1-hour TTL. Show hardcoded fallback URLs (direct GitHub release page link) when API fails.
3. Never call `api.github.com` on every page load without a cache.

**Warning signs:**
- Download page shows "loading..." indefinitely on some networks
- Console shows 403 from `api.github.com` with `X-RateLimit-Remaining: 0`

**Phase to address:**
Download Page phase -- implement build-time asset URL embedding from the start.

---

### Pitfall 2: Homebrew Cask SHA256 Checksum Race Condition

**What goes wrong:**
CI workflow updates the Cask formula with a SHA256 hash computed from a GitHub Release asset, but the asset is not yet fully propagated when the hash is computed. Or worse, the CI runs before `publish-release` job finishes (draft release assets have different URLs than published ones). The Cask formula ships with a wrong checksum, and `brew install --cask` fails for every user.

**Why it happens:**
The `desktop-release.yml` workflow has three jobs: `create-release` (draft) -> `build-tauri` (upload assets) -> `publish-release` (undraft). A Cask update CI triggered on `release.published` event might fire before assets are fully available via the public download URL, or GitHub CDN caching causes transient checksum mismatches.

**How to avoid:**
1. Trigger Cask update workflow only after `publish-release` job completes, using `workflow_run` event on `desktop-release.yml` with `conclusion: success`.
2. In the Cask update job: download the actual `.dmg`/`.zip` asset, compute `shasum -a 256` locally, then write that hash into the formula.
3. Add a verification step: `brew audit --cask` on the generated formula before committing.
4. Add a 30-second sleep or retry loop (max 3 attempts) before downloading, to handle CDN propagation delay.

**Warning signs:**
- `brew install --cask waiaas` fails with "SHA256 mismatch" within hours of a new release
- Cask update CI completes but `shasum` value differs from manual download

**Phase to address:**
Homebrew Cask phase -- build the CI pipeline with retry + verification from day 1.

---

### Pitfall 3: macOS Sequoia Gatekeeper Bypass Instructions Are Outdated

**What goes wrong:**
Installation guide tells users to "right-click and Open" to bypass Gatekeeper, but macOS Sequoia (15.0+) removed the Control-click/right-click bypass method. Users on Sequoia follow the guide, it does not work, and they cannot install the app. Support load spikes.

**Why it happens:**
Most online guides and even Apple's own older docs describe the pre-Sequoia method. Developers test on their own machines (often with Gatekeeper disabled) and never encounter the issue.

**How to avoid:**
1. Document the Sequoia-specific flow: System Settings -> Privacy & Security -> scroll to bottom -> "Open Anyway" button -> confirm with admin password.
2. Version-gate the instructions: detect macOS version in the guide or provide separate sections for "macOS 14 and earlier" vs "macOS 15 (Sequoia) and later".
3. Long-term: invest in Apple Developer ID signing + notarization (secrets already in desktop-release.yml: `APPLE_CERTIFICATE`, `APPLE_ID`, etc.) to eliminate the Gatekeeper warning entirely.

**Warning signs:**
- User reports of "app is damaged" or "cannot be opened" specifically from macOS 15+ users
- The `APPLE_CERTIFICATE` secret is empty/unset in GitHub Actions (meaning builds are unsigned)

**Phase to address:**
Installation Guide phase -- must verify whether Apple signing secrets are configured; guide content depends on this.

---

### Pitfall 4: OS Detection Misidentifies Platform or Architecture

**What goes wrong:**
Download page detects user's OS via `navigator.userAgent` or `navigator.platform` but shows wrong download. Common failures: (1) Apple Silicon Mac shown x86_64 download, (2) Linux ARM shown x86_64 `.deb`, (3) Chromebook detected as Linux when it cannot run native apps, (4) iPad with desktop Safari detected as macOS.

**Why it happens:**
`navigator.platform` is deprecated and unreliable. `navigator.userAgent` does not distinguish ARM vs x86 on macOS (Apple intentionally hides this). `navigator.userAgentData` (User-Agent Client Hints) is not available on Firefox/Safari.

**How to avoid:**
1. Use `navigator.userAgentData?.platform` with fallback to `navigator.platform` for OS detection.
2. For macOS: do NOT attempt ARM vs x86 detection -- show both download links (aarch64 + x86_64) with aarch64 as the default/recommended since Apple Silicon is now dominant.
3. Always show a "All downloads" section below the auto-detected recommendation so users can self-correct.
4. Show the detected OS prominently ("Detected: macOS") so users notice if it is wrong.

**Warning signs:**
- Users downloading wrong architecture and getting "this app is not supported on your Mac" errors
- Analytics showing macOS users downloading Linux builds

**Phase to address:**
Download Page phase -- OS detection logic must be tested across browsers.

---

### Pitfall 5: Homebrew Cask Naming Collision with Official Tap

**What goes wrong:**
The Cask name in your custom tap (`homebrew-waiaas`) collides with an existing formula/cask in `homebrew-core` or `homebrew-cask`. Users cannot install it, or worse, install the wrong package.

**Why it happens:**
Unlike formulae, Homebrew casks must have globally unique names. Developers pick a common name without checking the official repos first. Homebrew 5.0+ also changed tap behavior -- `homebrew/cask` is no longer a separate tap but integrated into core.

**How to avoid:**
1. Before creating the cask: run `brew search waiaas` and `brew info waiaas` to verify no conflicts.
2. Use the full qualified name pattern: `waiaas-desktop` (not just `waiaas`).
3. Test installation via `brew install minhoyoo-iotrust/waiaas/waiaas-desktop` (fully qualified tap path).
4. Document both `brew tap minhoyoo-iotrust/waiaas && brew install --cask waiaas-desktop` and the one-liner form.

**Warning signs:**
- `brew audit --cask` reports naming conflicts
- `brew install --cask waiaas` installs something unexpected

**Phase to address:**
Homebrew Cask phase -- verify naming before writing the formula.

---

### Pitfall 6: Windows SmartScreen Reputation Gate Blocks Installation

**What goes wrong:**
Windows shows "Windows protected your PC" / "SmartScreen prevented an unrecognized app from starting" with no obvious way to proceed. The "Run anyway" button is hidden behind "More info" click. Many non-technical users give up at this point.

**Why it happens:**
Windows SmartScreen uses a reputation-based system. New/unsigned executables have zero reputation. Even with standard code signing, SmartScreen warnings persist until the binary accumulates enough "reputation" (enough users have run it). Only EV (Extended Validation) code signing certificates get immediate SmartScreen bypass.

**How to avoid:**
1. Installation guide must include clear screenshots of the SmartScreen dialog with step-by-step: "Click More info -> Click Run anyway".
2. Explain the file properties "Unblock" checkbox method as an alternative (right-click -> Properties -> General -> Unblock).
3. Long-term: get an EV code signing certificate (~$300-500/year) for instant SmartScreen trust.
4. Include the note that this warning is normal for new open-source software and does not indicate malware.

**Warning signs:**
- Windows users reporting they cannot install the app
- Download stats show Windows downloads but zero Windows usage

**Phase to address:**
Installation Guide phase -- SmartScreen bypass instructions with screenshots are mandatory.

---

### Pitfall 7: Download Page Breaks When GitHub Release Has No Desktop Assets

**What goes wrong:**
Client-side JS fetches `/releases/latest` but the latest release is for the npm package (not desktop), returning assets with names like `waiaas-2.13.0.tgz` instead of `.dmg`/`.msi`/`.AppImage`. Download page shows wrong links or no links.

**Why it happens:**
The project has two release tracks: npm releases via release-please and desktop releases via `desktop-release.yml`. `GET /releases/latest` returns the most recent non-draft, non-prerelease release regardless of which track created it. The desktop release uses `desktop-v*` tags, but the API does not filter by tag prefix.

**How to avoid:**
1. Do NOT use `/releases/latest`. Instead, use `/releases` and filter client-side (or at build time) for releases whose `tag_name` starts with `desktop-v`.
2. Build-time approach: `site/build.mjs` fetches releases, filters for `desktop-v*` tags, picks the latest, embeds the asset URLs.
3. Add a hardcoded fallback URL pattern: `https://github.com/.../releases/tag/desktop-v0.1.0` as a "manual download" link.

**Warning signs:**
- Download page shows npm tarball links instead of desktop installers
- Page shows "No downloads available" after an npm release

**Phase to address:**
Download Page phase -- critical design decision, must filter by tag prefix.

---

### Pitfall 8: Cross-Repo PAT Rotation Breaks Cask Auto-Update

**What goes wrong:**
Homebrew Cask auto-update CI uses a Personal Access Token (PAT) to push to the `homebrew-waiaas` repo from the main repo's workflow. The PAT expires (default 90 days for fine-grained tokens), and Cask updates silently stop. New desktop releases ship but the Cask formula stays on the old version indefinitely.

**Why it happens:**
Fine-grained PATs have mandatory expiration. Classic PATs can be set to never expire but are being deprecated. The CI failure is silent unless you monitor workflow runs.

**How to avoid:**
1. Use a GitHub App installation token instead of a PAT -- GitHub Apps do not expire and have granular permissions.
2. If using PAT: set a 1-year expiration, add a calendar reminder, and add a CI health check that runs monthly to verify the PAT is still valid.
3. Alternative: use `repository_dispatch` event from the main repo to trigger a workflow in the tap repo (both using `GITHUB_TOKEN`, no PAT needed if the tap repo has its own workflow that self-updates).
4. Monitor: add a Slack/email notification on workflow failure in the tap repo.

**Warning signs:**
- Cask formula version is 2+ releases behind
- `desktop-release.yml` succeeds but tap repo has no recent commits
- GitHub Actions shows "Resource not accessible by integration" errors

**Phase to address:**
Homebrew Cask phase -- authentication strategy must be decided upfront.

---

### Pitfall 9: Linux Installation Guide Omits AppImage Permissions and FUSE

**What goes wrong:**
Users download the `.AppImage` file but it does not run because it lacks execute permission. Or they double-click it in a file manager and nothing happens because their desktop environment does not know how to handle AppImage files.

**Why it happens:**
Downloaded files on Linux do not have execute permission by default. AppImage is not universally integrated into Linux desktop environments. FUSE (required for AppImage) may not be installed on some distros (Ubuntu 22.04+ removed `libfuse2` from default install).

**How to avoid:**
1. Installation guide must include: `chmod +x WAIaaS-Desktop*.AppImage && ./WAIaaS-Desktop*.AppImage`
2. Document FUSE dependency: `sudo apt install libfuse2` for Ubuntu/Debian.
3. Provide alternative: extract-and-run method (`--appimage-extract` flag) for systems without FUSE.
4. Consider also providing `.deb` package if Tauri supports it (it does -- check `tauri.conf.json` bundle targets).

**Warning signs:**
- Linux users reporting "Permission denied" or "cannot execute binary file"
- Users reporting the AppImage opens but crashes immediately (FUSE missing)

**Phase to address:**
Installation Guide phase -- Linux section needs FUSE and permissions coverage.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Client-side GitHub API calls instead of build-time embedding | Faster initial implementation | Rate limiting, loading states, error handling complexity | Never for production -- always prefer build-time |
| Hardcoded download URLs instead of API integration | No API dependency | Manual updates on every release, stale links | Only as fallback, never as primary |
| Single PAT for cross-repo CI | Quick to set up | Expiration risk, rotation burden, security surface | MVP only -- migrate to GitHub App within 1 milestone |
| Skipping Apple notarization | No Apple Developer account cost ($99/year) | Every macOS user sees Gatekeeper warning | Acceptable for initial launch, plan to add within 3 months |
| Single architecture macOS download | Simpler OS detection | Rosetta 2 performance penalty for Apple Silicon users | Never -- both architectures already built in CI |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub Releases API | Using `/releases/latest` which returns npm releases | Filter `/releases` by `tag_name` prefix `desktop-v` |
| GitHub Releases API | Not handling draft/prerelease releases | Filter `draft: false, prerelease: false` explicitly |
| Homebrew Cask formula | Computing SHA256 from redirect URL instead of final download URL | Follow redirects, download full file, then compute hash |
| Homebrew Cask CI | Using `GITHUB_TOKEN` which cannot access other repos | Use PAT with `contents:write` on tap repo, or GitHub App |
| GitHub Pages build | Not triggering rebuild when desktop release publishes | Add `repository_dispatch` or `workflow_run` trigger to `pages.yml` |
| `site/build.mjs` | Fetching release data without auth (60 req/hour limit in CI) | Use `GITHUB_TOKEN` in build environment (5,000 req/hour) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Client-side API call on page load | 200ms+ delay before download links appear, flash of empty content | Build-time embedding | Immediately for users on slow networks |
| Large asset listing (all platforms in one API call) | Slow page render if release has 10+ assets | Filter and parse at build time, embed only needed URLs | When release has many artifacts |
| No CDN caching for static site | Slow page loads from GitHub Pages in Asia/Pacific | Use Cloudflare or similar CDN in front | With international users |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing PAT as plain text in workflow file | Token leak, unauthorized access to tap repo | Use GitHub Secrets, rotate regularly |
| Download page linking to HTTP (not HTTPS) URLs | Man-in-the-middle binary swap | Always use HTTPS links, verify GitHub URLs |
| Not displaying checksums on download page | Users cannot verify download integrity | Show SHA256 for each asset on the download page |
| Homebrew formula using `url` without `verified:` | Homebrew audit warning, trust issue | Add `url "...", verified: "github.com/..."` pattern |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Only showing auto-detected OS download | Wrong OS detected = user stuck | Show detected OS prominently + "All platforms" section below |
| Gatekeeper/SmartScreen instructions without screenshots | Users cannot follow text-only instructions for security dialogs | Include actual screenshots of each OS security dialog |
| Download starts immediately without confirmation | Confusing, may trigger browser download warnings | Show download button, let user click to start |
| No version number shown on download page | Users do not know if they have the latest | Show version number, release date, and changelog link |
| Installation guide assumes command-line familiarity | Desktop app users may not use terminal | Provide both GUI and CLI instructions for each step |

## "Looks Done But Isn't" Checklist

- [ ] **Download page:** Often missing fallback for API failure -- verify page works with GitHub API blocked
- [ ] **Download page:** Often missing version display -- verify version number and date are shown
- [ ] **Download page:** Often missing checksum display -- verify SHA256 hashes are shown for security-conscious users
- [ ] **Homebrew Cask:** Often missing `brew audit --cask` validation -- verify formula passes audit in CI
- [ ] **Homebrew Cask:** Often missing uninstall stanza -- verify `brew uninstall --cask` cleans up completely (app bundle, preferences, sidecar binary)
- [ ] **Homebrew Cask:** Often missing `zap` stanza -- verify deep uninstall removes all app data
- [ ] **Installation guide:** Often missing Sequoia-specific Gatekeeper instructions -- verify guide covers macOS 15+
- [ ] **Installation guide:** Often missing FUSE requirement for Linux AppImage -- verify `libfuse2` is documented
- [ ] **Installation guide:** Often missing auto-update verification -- verify guide explains how to check for updates within the app
- [ ] **CI pipeline:** Often missing rebuild trigger for download page on new release -- verify pages.yml triggers on desktop release

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong SHA256 in Cask formula | LOW | Push corrected formula to tap repo, users re-run `brew install` |
| Rate-limited download page | LOW | Switch to build-time embedding, redeploy site |
| Outdated Gatekeeper instructions | LOW | Update guide markdown, rebuild site |
| Naming collision in Homebrew | MEDIUM | Rename cask (breaking change for existing users), update all docs |
| PAT expiration breaks Cask CI | LOW | Generate new PAT, update secret, trigger manual workflow run |
| Wrong OS detection logic | LOW | Fix JS detection code, redeploy site |
| Download page showing npm releases | MEDIUM | Implement tag prefix filter, rebuild site, add regression test |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| GitHub API rate limiting | Download Page | Page loads correctly with API mocked as unavailable |
| SHA256 race condition | Homebrew Cask | `brew install --cask` succeeds immediately after release publish |
| Sequoia Gatekeeper change | Installation Guide | Guide has macOS 15+ specific section with correct steps |
| OS detection misidentification | Download Page | Test on Safari(macOS), Chrome(Windows), Firefox(Linux), Safari(iPad) |
| Cask naming collision | Homebrew Cask | `brew search waiaas` shows only our cask |
| SmartScreen blocking | Installation Guide | Guide has screenshots of SmartScreen "More info" flow |
| Wrong release track (npm vs desktop) | Download Page | Page shows desktop assets even after npm release |
| PAT expiration | Homebrew Cask | Use GitHub App or set monitoring on PAT expiry |
| Linux AppImage permissions | Installation Guide | Guide includes `chmod +x` and FUSE instructions |
| Pages rebuild on release | Download Page + Homebrew Cask | New desktop release triggers `pages.yml` rebuild automatically |

## Sources

- [GitHub REST API Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) -- 60 req/hour unauthenticated
- [Homebrew Tap Documentation](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap) -- naming, audit, formula structure
- [Homebrew 5.0.0 Release Notes](https://brew.sh/2025/11/12/homebrew-5.0.0/) -- tap changes, cask signing deprecation
- [Homebrew 5.1.0 Release Notes](https://brew.sh/2026/03/10/homebrew-5.1.0/) -- CI baseline updates
- [Apple Gatekeeper Documentation](https://support.apple.com/en-us/102445) -- safe app opening procedures
- [macOS Sequoia Gatekeeper Changes](https://www.techbloat.com/macos-sequoia-bypassing-gatekeeper-to-install-unsigned-apps.html) -- right-click bypass removal
- [Simon Willison's Homebrew Auto-Formulas](https://til.simonwillison.net/homebrew/auto-formulas-github-actions) -- CI automation pattern
- [Automating Homebrew Tap Updates](https://builtfast.dev/blog/automating-homebrew-tap-updates-with-github-actions/) -- cross-repo workflow pattern
- [Homebrew SHA256 Checksum Mismatch Issues](https://github.com/Homebrew/homebrew-cask/issues/41993) -- common causes
- [Windows SmartScreen Bypass Guide](https://www.fortect.com/windows-optimization-tips/windows-defender-smartscreen-prevented-an-unrecognized-app-from-starting-warning/) -- user-facing instructions

---
*Pitfalls research for: Desktop App Distribution Channels*
*Researched: 2026-04-01*
