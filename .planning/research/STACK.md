# Stack Research

**Domain:** Desktop App Distribution Channels (download page, Homebrew Cask, installation guide)
**Researched:** 2026-04-01
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vanilla JavaScript (inline `<script>`) | ES2020+ | Download page OS detection + GitHub API fetch | Site uses zero client-side JS currently (build-time only). Adding a bundler/framework for ~50 lines of OS detection + API call is unnecessary. Inline script in the HTML page keeps the zero-dependency philosophy. |
| GitHub REST API (`/repos/.../releases`) | v3 | Fetch latest desktop release assets at page load | Public endpoint, no auth needed for public repos, returns `browser_download_url` + `name` per asset. Rate limit 60/hr unauthenticated is sufficient for a download page. |
| `navigator.userAgentData.platform` + `navigator.userAgent` fallback | Web API | OS auto-detection (macOS/Windows/Linux) | `userAgentData` is the modern replacement for the deprecated `navigator.platform`. Chrome/Edge support it; Firefox/Safari need `navigator.userAgent` fallback. No library needed for 3-OS detection. |
| Homebrew Cask DSL (Ruby) | Homebrew 5.x | macOS package distribution via `brew install --cask waiaas` | Cask is the standard for distributing macOS `.dmg`/`.app` bundles. Tap repos (`homebrew-waiaas`) are the official mechanism for third-party casks. |
| GitHub Actions (`actions/github-script@v7`) | v7 | CI automation for Cask formula auto-update | Already used in `desktop-release.yml`. Reuse same pattern to dispatch a workflow that updates the Cask formula in the tap repo after desktop release publish. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **None needed** | - | Download page is vanilla HTML/JS | The existing `site/build.mjs` pipeline handles markdown docs. The download page is hand-crafted HTML (like `site/index.html`). No npm dependencies added. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `shasum --algorithm 256` | Generate SHA256 for Cask formula | CI computes against each macOS `.dmg` asset after release build. Embedded in formula update workflow. |
| `gh api repos/{owner}/{repo}/releases` | Test GitHub Releases API locally | `gh` CLI already available. Verify asset names match OS detection mapping. |

## Architecture Decisions

### Download Page: Hand-crafted HTML (not markdown via build pipeline)

The download page needs client-side JavaScript for OS detection and GitHub API calls. The existing build pipeline (`site/build.mjs`) converts markdown to static HTML with build-time rendering and zero client-side JS. The download page breaks this pattern intentionally.

**Approach:** Create `site/download/index.html` as a standalone HTML file (like `site/index.html`), reusing the CRT theme CSS (`article.css`) and CSS variables from `template.html`. The build pipeline does NOT need modification -- GitHub Pages deploys the entire `site/` directory as-is.

### OS Detection: 3-tier fallback, no library

```javascript
function detectOS() {
  // Tier 1: Modern API (Chrome 90+, Edge 90+)
  const uad = navigator.userAgentData;
  if (uad?.platform) {
    if (uad.platform === 'macOS') return 'macos';
    if (uad.platform === 'Windows') return 'windows';
    if (uad.platform === 'Linux') return 'linux';
  }
  // Tier 2: Legacy (Firefox, Safari)
  const ua = navigator.userAgent;
  if (/Mac/.test(ua)) return 'macos';
  if (/Win/.test(ua)) return 'windows';
  if (/Linux/.test(ua)) return 'linux';
  // Tier 3: Unknown -- show all platforms
  return null;
}
```

No need for UAParser.js (~350KB) or similar libraries. We detect 3 OSes, not browser versions or device types.

### GitHub Releases API: Client-side fetch with `desktop-v*` tag filter

The desktop releases use `desktop-v*` tags (e.g., `desktop-v0.1.0`). The standard `/releases/latest` endpoint returns the most recent release across ALL tags, which may be a daemon release (e.g., `waiaas-v2.13.0-rc`).

**Solution:** Fetch `/releases?per_page=10` and filter client-side by tag prefix:

```javascript
async function fetchLatestDesktopRelease() {
  const res = await fetch(
    'https://api.github.com/repos/minhoyoo-iotrust/WAIaaS/releases?per_page=10'
  );
  const releases = await res.json();
  return releases.find(r => r.tag_name.startsWith('desktop-v') && !r.draft && !r.prerelease);
}
```

Asset name patterns produced by tauri-action (from `desktop-release.yml` build matrix):

| Platform | Target Triple | Expected Asset Pattern |
|----------|--------------|----------------------|
| macOS ARM | aarch64-apple-darwin | `WAIaaS Desktop_*.dmg` (aarch64) |
| macOS Intel | x86_64-apple-darwin | `WAIaaS Desktop_*.dmg` (x86_64) |
| Windows | x86_64-pc-windows-msvc | `WAIaaS Desktop_*.msi` or `*.exe` |
| Linux | x86_64-unknown-linux-gnu | `WAIaaS Desktop_*.deb` or `*.AppImage` |

**Note:** Exact asset filenames must be verified after the first desktop release. The JS asset-matching logic should use substring/regex matching (e.g., `.dmg`, `.msi`, `.AppImage`) not exact filenames.

### Homebrew Cask Tap: Separate repo `homebrew-waiaas`

Homebrew requires tap repos to be named `homebrew-{name}`. Users install via:

```bash
brew tap minhoyoo-iotrust/waiaas
brew install --cask waiaas
```

**Cask formula structure** (`Casks/waiaas.rb`):

```ruby
cask "waiaas" do
  arch arm: "aarch64", intel: "x86_64"

  version "0.1.0"

  on_arm do
    sha256 "ARM_SHA256_PLACEHOLDER"
    url "https://github.com/minhoyoo-iotrust/WAIaaS/releases/download/desktop-v#{version}/WAIaaS.Desktop_#{version}_aarch64.dmg",
        verified: "github.com/minhoyoo-iotrust/WAIaaS/"
  end

  on_intel do
    sha256 "INTEL_SHA256_PLACEHOLDER"
    url "https://github.com/minhoyoo-iotrust/WAIaaS/releases/download/desktop-v#{version}/WAIaaS.Desktop_#{version}_x64.dmg",
        verified: "github.com/minhoyoo-iotrust/WAIaaS/"
  end

  name "WAIaaS Desktop"
  desc "Self-hosted Wallet-as-a-Service for AI Agents"
  homepage "https://waiaas.ai"

  auto_updates true
  depends_on macos: ">= :catalina"

  app "WAIaaS Desktop.app"

  zap trash: [
    "~/Library/Application Support/dev.waiaas.desktop",
    "~/Library/Caches/dev.waiaas.desktop",
  ]
end
```

Key DSL details (from Cask Cookbook):
- `on_arm`/`on_intel` blocks: available since Homebrew 3.6+, current is 5.1.0
- `auto_updates true`: declares that the app self-updates (Tauri updater handles this)
- `depends_on macos: ">= :catalina"`: matches `tauri.conf.json` minimumSystemVersion `10.15`
- `verified:` in `url`: required when URL domain differs from `homepage`
- `zap trash:` cleanup paths based on Tauri identifier `dev.waiaas.desktop`

### CI Formula Auto-Update: `repository_dispatch` pattern

After the `publish-release` job in `desktop-release.yml`, add a step that:
1. Downloads the published macOS `.dmg` assets (both architectures)
2. Computes SHA256 for each
3. Dispatches a `repository_dispatch` event to the `homebrew-waiaas` repo with version + SHA256 values

The tap repo has a receiving workflow that:
1. Receives the dispatch payload (`version`, `sha256_arm`, `sha256_intel`)
2. Updates `Casks/waiaas.rb` using `sed` (version + sha256 lines)
3. Commits and pushes directly (no PR needed for own tap)

**Why `repository_dispatch` over alternatives:**
- `macauley/action-homebrew-bump-cask@v1`: designed for PRs to `homebrew/homebrew-cask` (official tap). Overkill for our own tap.
- `NSHipster/update-homebrew-formula-action`: formula-focused (not Cask). Would need adaptation.
- Direct `sed` in the same workflow: would require checking out a different repo, managing auth tokens. `repository_dispatch` is cleaner separation.

### Installation Guide: Markdown in `docs/admin-manual/`

The installation guide is the 10th file in `docs/admin-manual/`. It follows the existing pattern:
- Markdown with front-matter (`title`, `description`, `date`, `section: docs`, `category: Getting Started`)
- Built to `site/docs/{slug}/index.html` by `site/build.mjs` automatically
- No additional tooling needed

## Installation

```bash
# No new npm dependencies required.
# The download page is vanilla HTML/JS in site/download/index.html.
# The Cask tap is a separate repo with only Ruby + YAML files.
# The installation guide uses the existing build pipeline.
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Vanilla JS OS detection (~15 lines) | UAParser.js | If you need browser version/device type detection beyond OS. We only need macOS/Windows/Linux. |
| Client-side GitHub API fetch | Build-time API fetch in `site/build.mjs` | If rate limiting becomes an issue (60/hr unauthenticated). Build-time caches but shows stale versions until next deploy. Client-side is always current. |
| `repository_dispatch` for Cask update | `macauley/action-homebrew-bump-cask@v1` | If submitting to the official `homebrew/homebrew-cask` tap. For our own tap, dispatch is simpler. |
| Hand-crafted download HTML | Markdown page via build pipeline | If the page had no dynamic content. But OS detection + API calls require client-side JS, which the build pipeline does not support. |
| Standalone `site/download/index.html` | Adding JS template support to `build.mjs` | If many more interactive pages are needed later. One page does not justify build pipeline complexity. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| UAParser.js / Bowser / Platform.js | 100-350KB overkill for detecting 3 OSes. Adds npm dependency to a zero-dependency static site. | 15-line vanilla JS function using `navigator.userAgentData` + `navigator.userAgent` fallback. |
| Homebrew Formula (not Cask) | Formulas are for CLI tools built from source. Casks are for macOS `.app` / `.dmg` bundles. WAIaaS Desktop is a Tauri `.app` bundle distributed as `.dmg`. | Homebrew Cask DSL in a tap repo. |
| `brew bump-cask-pr` GitHub Action | Designed for PRs to `homebrew/homebrew-cask` official repo. Our tap is self-managed; we can commit directly. | `repository_dispatch` + direct `sed` update in tap repo workflow. |
| React/Preact/any framework for download page | The site is static HTML with zero client-side JS. Adding a framework for one interactive page creates build complexity and breaks the site architecture. | Vanilla JS inline `<script>` block. |
| Separate API proxy for GitHub Releases | Adds server-side complexity. The GitHub API is public and CORS-enabled for unauthenticated requests. Rate limit (60/hr per IP) is sufficient. | Direct `fetch()` from the browser to `api.github.com`. |
| `/releases/latest` API endpoint | Returns the latest release across ALL tags (daemon + desktop). Desktop uses `desktop-v*` tags which may not be the latest overall release. | `/releases?per_page=10` with client-side `tag_name.startsWith('desktop-v')` filter. |

## Stack Patterns by Variant

**If the repo becomes private:**
- GitHub API requires auth for private repos. Switch to build-time fetch in `site/build.mjs` and re-deploy on each desktop release via `workflow_dispatch` trigger on the pages workflow.
- Cask tap would need authenticated download URLs, which Homebrew does not handle well. Host `.dmg` files on a CDN or use `brew cask` with a download strategy token.

**If macOS code signing is added:**
- Cask formula needs no changes. Homebrew handles signed `.dmg` files transparently.
- Gatekeeper warnings disappear. The installation guide should note that unsigned builds may require "Allow Anyway" in System Preferences.

**If Linux package managers (apt/snap) are added later:**
- Download page JS needs an additional OS-to-format mapping (already extensible with the asset-matching approach).
- Separate PPA or snap registration. Out of scope for v33.3.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `actions/github-script@v7` | Node.js 20 runner | Already used in `desktop-release.yml`. Same version for tap dispatch. |
| Homebrew Cask DSL (`on_arm`/`on_intel`) | Homebrew 3.6+ (current: 5.1.0) | Architecture-specific blocks stable for 3+ years. |
| `navigator.userAgentData` | Chrome 90+, Edge 90+ | Firefox/Safari need `navigator.userAgent` fallback. Both paths covered. |
| GitHub REST API v3 | Stable, no deprecation | Unauthenticated rate limit: 60 req/hr per IP. One call per page visit. |
| Tauri `createUpdaterArtifacts: "v1Compatible"` | tauri-action@v0 | Asset naming follows v1 pattern. Cask URL patterns must match actual filenames. Verify after first release. |
| `site/build.mjs` | Node.js 22 + pnpm | Installation guide markdown processed by existing pipeline. No changes needed. |

## Integration Points with Existing System

| Existing Component | Integration | Changes Required |
|-------------------|-------------|-----------------|
| `site/index.html` | Style reference | Copy CRT theme CSS variables and navigation pattern into download page. No changes to index.html. |
| `site/article.css` | Direct link | Download page uses `<link rel="stylesheet" href="/article.css">`. No changes to CSS. |
| `site/template.html` | Style reference | Reuse nav HTML structure for consistent navigation. No template changes. |
| `site/build.mjs` | None | Download page is standalone HTML, not processed by build pipeline. Installation guide markdown IS processed automatically (placed in `docs/`). |
| `site/sitemap.xml` | Manual addition | Add `<url><loc>https://waiaas.ai/download/</loc></url>`. Either extend `build.mjs` sitemap generation to detect standalone HTML files, or add manually. |
| `.github/workflows/desktop-release.yml` | Add post-publish step | New job after `publish-release`: download macOS assets, compute SHA256, dispatch to tap repo. |
| `.github/workflows/pages.yml` | No changes | Download page is committed as static HTML in `site/`; pages workflow deploys entire directory. |
| `apps/desktop/src-tauri/tauri.conf.json` | Reference only | Version `0.1.0`, identifier `dev.waiaas.desktop`, minimumSystemVersion `10.15` inform Cask formula. |
| `site/distribution/SUBMISSION_KIT.md` | Add desktop channel | Add Homebrew Cask tap + download page entries. |

## Sources

- [Homebrew Cask Cookbook](https://docs.brew.sh/Cask-Cookbook) -- Cask DSL stanza order, `on_arm`/`on_intel`, `auto_updates`, `zap`, `depends_on` (HIGH confidence)
- [Homebrew Taps Documentation](https://docs.brew.sh/Taps) -- Tap naming convention `homebrew-{name}` (HIGH confidence)
- [Homebrew 5.1.0 release notes](https://brew.sh/2026/03/10/homebrew-5.1.0/) -- Current Homebrew version confirming DSL compatibility (HIGH confidence)
- [MDN: Navigator.userAgentData](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/userAgentData) -- Modern OS detection API, browser compatibility (HIGH confidence)
- [MDN: Navigator.platform (deprecated)](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/platform) -- Deprecated but needed for Firefox/Safari fallback (HIGH confidence)
- [GitHub REST API: Releases](https://docs.github.com/en/rest/releases/releases) -- `/repos/{owner}/{repo}/releases` response structure, `assets[].browser_download_url` (HIGH confidence)
- [Simon Willison: Auto-maintaining Homebrew formulas with GitHub Actions](https://til.simonwillison.net/homebrew/auto-formulas-github-actions) -- CI pattern for tap auto-update via repository_dispatch (MEDIUM confidence)
- [Automating Homebrew Tap Updates (BuiltFast)](https://builtfast.dev/blog/automating-homebrew-tap-updates-with-github-actions/) -- Alternative CI approaches (MEDIUM confidence)
- [NSHipster/update-homebrew-formula-action](https://github.com/NSHipster/update-homebrew-formula-action) -- Formula-focused action, evaluated but not applicable to Cask (MEDIUM confidence)
- Existing codebase: `desktop-release.yml`, `pages.yml`, `site/build.mjs`, `site/index.html`, `site/template.html`, `tauri.conf.json` -- Direct inspection (HIGH confidence)

---
*Stack research for: Desktop App Distribution Channels*
*Researched: 2026-04-01*
