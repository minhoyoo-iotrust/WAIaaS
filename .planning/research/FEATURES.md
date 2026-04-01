# Feature Research

**Domain:** Desktop App Distribution Channels (Download Page, Homebrew Cask, Installation Guide)
**Researched:** 2026-04-01
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Download page with OS auto-detection | Every desktop app site recommends the right binary for the visitor's OS | MEDIUM | Client-side JS on static site. Use `navigator.userAgentData?.platform` (Chrome/Edge) with `navigator.platform`/`navigator.userAgent` regex fallback for Safari/Firefox. Detect macOS(arm/intel), Windows, Linux. Primary CTA button shows detected OS, secondary links show all platforms |
| GitHub Releases API integration | Users expect "latest version" to always be current without manual page updates | LOW | `fetch('https://api.github.com/repos/{owner}/{repo}/releases')` client-side, filter for `desktop-v*` tags. Rate limit: 60 req/hr unauthenticated (sufficient). Cannot use `/releases/latest` because it returns latest across ALL tags (including npm releases) |
| All-platforms download table | Users who detect wrongly (or use multiple OS) need manual selection | LOW | Static HTML table below auto-detect CTA. Columns: OS, Architecture, Format, Link. Formats: macOS .dmg (arm64/x64), Windows .msi (x64), Linux .AppImage + .deb (x64) |
| Homebrew Cask tap for macOS | macOS developers expect `brew install --cask` as primary install method | MEDIUM | Separate repo `homebrew-waiaas`. Cask formula in `Casks/waiaas-desktop.rb`. Key benefit: `brew install --cask` strips quarantine attribute automatically, bypassing Gatekeeper for unsigned apps |
| CI-automated Cask formula updates | Formula must stay in sync with releases; manual updates break trust | MEDIUM | `repository_dispatch` from `desktop-release.yml` to `homebrew-waiaas` repo. Update version + SHA256 on new `desktop-v*` tag. More reliable than scheduled `brew livecheck` |
| Desktop installation guide | Users need OS-specific step-by-step instructions for first install | LOW | `docs/admin-manual/desktop-installation.md` (10th admin manual file). Cover: download methods, install, Setup Wizard walkthrough, Gatekeeper/SmartScreen bypass, troubleshooting, upgrade path |
| Version display on download page | Users need to know what version they're downloading | LOW | Extracted from GitHub Releases API `tag_name`. Display as "v0.1.0" next to download buttons |
| Checksum verification instructions | Security-conscious users want to verify download integrity | LOW | SHA256 checksums from GitHub release assets. Display on download page or link to release notes |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| CRT-themed download page consistent with site | Brand cohesion; terminal/hacker aesthetic reinforces "self-hosted security" positioning | LOW | Reuse existing CRT theme CSS from `template.html`. Download page is hand-crafted HTML in `site/download/index.html` with inline JS for OS detection + GitHub API fetch |
| Alternative install methods section | Power users appreciate choice (Homebrew vs direct download vs npm/Docker daemon-only) | LOW | Section on download page: `brew install --cask waiaas/waiaas/waiaas-desktop` for macOS, direct download for all OS, plus note about existing npm/Docker daemon-only install |
| Release notes link per version | Transparency builds trust for security software | LOW | Link to GitHub Release page: `https://github.com/{owner}/{repo}/releases/tag/desktop-v{version}` |
| Auto-update status indicator | Desktop app already has Ed25519 auto-update; mentioning this reduces anxiety | LOW | Text note: "Automatic updates included. After install, WAIaaS Desktop checks for updates and applies them automatically with Ed25519 signature verification." |
| Nav link to Download page | Site navigation should include Download as primary action | LOW | Add `[Download]` link to `template.html` nav alongside GitHub/npm/Docker/Blog/Docs. Every page on waiaas.ai then links to download |
| SUBMISSION_KIT Desktop channel entries | Distribution tracking completeness for SEO/discovery | LOW | Add Desktop App entries to existing `site/distribution/SUBMISSION_KIT.md`: download page URL, Homebrew tap URL, installation guide URL |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Server-side OS detection | More accurate than client-side JS | WAIaaS site is static (GitHub Pages). No server. SSR adds hosting cost for marginal improvement | Client-side detection with graceful fallback to all-platforms table |
| Apple notarization + code signing | Removes Gatekeeper warnings entirely | Requires Apple Developer Program ($99/yr), provisioning profiles, hardened runtime config. Significant ongoing maintenance for open-source project | Document Gatekeeper bypass in install guide (`xattr -cr` or right-click Open). Homebrew Cask strips quarantine automatically |
| Windows code signing | Removes SmartScreen warning | Requires EV code signing certificate ($200-500/yr), hardware token. High cost for current scale | Document SmartScreen bypass in install guide. SmartScreen learns from download volume over time |
| Homebrew core submission | Being in homebrew/homebrew-cask gives wider reach | Requires Apple notarization as prerequisite for official cask repo. High maintenance from Homebrew CI + PR review process | Self-hosted tap (`homebrew-waiaas`) provides same `brew install --cask` UX with full control |
| Winget / Chocolatey / Scoop packages | Windows package manager support | Each has its own submission/maintenance overhead. Low priority until Windows user base is established | Direct .msi download + manual install docs. Add package managers later based on demand |
| Linux Snap / Flatpak packages | Containerized Linux distribution | Additional build targets and maintenance. AppImage + .deb already cover primary use cases | AppImage is universal, .deb covers Debian/Ubuntu. Add Snap/Flatpak based on demand |
| Download analytics / telemetry | Know download counts per platform | Privacy concern for security-focused product. Adds server-side complexity | Use GitHub release asset download counts (public API) for analytics without custom telemetry |
| CDN-hosted binaries | Faster downloads globally | GitHub Releases already serves via GitHub CDN. Additional CDN adds cost and sync complexity | GitHub Releases CDN is sufficient for current scale |

## Feature Dependencies

```
[Download Page]
    |-- requires --> [GitHub Releases CI] (EXISTS: desktop-release.yml)
    |-- requires --> [Site Build Pipeline] (EXISTS: site/build.mjs + pages.yml)
    |-- enhances --> [Nav Link in template.html]

[Homebrew Cask Tap]
    |-- requires --> [GitHub Releases CI] (EXISTS)
    |-- requires --> [homebrew-waiaas repo] (NEW: separate GitHub repo)
    |-- requires --> [CI formula auto-update] (NEW: workflow)

[Desktop Installation Guide]
    |-- requires --> [Download Page URL] (to link to)
    |-- requires --> [Homebrew Cask Tap] (to document brew install)
    |-- enhances --> [Download Page] (linked from download page)

[SUBMISSION_KIT Update]
    |-- requires --> [Download Page]
    |-- requires --> [Homebrew Cask Tap]
    |-- requires --> [Desktop Installation Guide]
```

### Dependency Notes

- **Download Page requires GitHub Releases CI:** Download URLs come from GitHub Releases API. The `desktop-release.yml` workflow already publishes to GitHub Releases with proper asset naming across 4 targets (macOS arm64/x64, Windows x64, Linux x64).
- **Homebrew Cask requires separate repo:** Homebrew taps must be standalone repos named `homebrew-{name}`. The main WAIaaS repo cannot serve as the tap. Repo name: `minhoyoo-iotrust/homebrew-waiaas`.
- **CI formula auto-update requires cross-repo coordination:** When `desktop-release.yml` publishes a new release, the Cask formula in `homebrew-waiaas` must be updated with new version + SHA256. Use `repository_dispatch` event from main repo to tap repo (requires PAT or fine-grained token with `contents:write` on tap repo).
- **Installation Guide should be last:** It documents all methods, so both Download Page and Homebrew Cask should be functional before writing the guide.
- **SUBMISSION_KIT is terminal:** Updates only after all three deliverables have stable URLs.

## MVP Definition

### Launch With (v1)

Minimum viable product for this milestone.

- [x] Download page with OS auto-detection + GitHub Releases API integration -- core deliverable
- [x] All-platforms download table as fallback below CTA -- essential for misdetected OS
- [x] Homebrew Cask tap (`homebrew-waiaas` repo + Cask formula) -- primary macOS channel
- [x] CI auto-update for Cask formula on new desktop release -- prevents staleness
- [x] Desktop installation guide (`docs/admin-manual/desktop-installation.md`) -- step-by-step instructions
- [x] Nav link to Download page in `template.html` -- discoverability from every site page
- [x] SUBMISSION_KIT Desktop entries -- distribution tracking

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Architecture-specific macOS detection (Apple Silicon vs Intel CTA) -- after confirming both .dmg variants build reliably
- [ ] Release changelog inline on download page -- when release cadence stabilizes
- [ ] Build-from-source instructions -- when developer community requests it

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Apple notarization + code signing -- when budget allows ($99/yr + CI complexity)
- [ ] Windows code signing -- when Windows user base justifies cost ($200-500/yr)
- [ ] Winget/Chocolatey/Scoop packages -- when Windows download volume is significant
- [ ] Snap/Flatpak packages -- when Linux user base requests them
- [ ] Homebrew core submission -- requires Apple notarization first

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Download page (OS detect + GitHub API) | HIGH | MEDIUM | P1 |
| Homebrew Cask tap + CI auto-update | HIGH | MEDIUM | P1 |
| Desktop installation guide | HIGH | LOW | P1 |
| Nav link in template.html | MEDIUM | LOW | P1 |
| SUBMISSION_KIT update | LOW | LOW | P1 |
| CRT theme consistency on download page | MEDIUM | LOW | P1 |
| Checksum display/link | MEDIUM | LOW | P2 |
| Alternative install methods section | MEDIUM | LOW | P2 |
| Architecture-specific macOS CTA | MEDIUM | MEDIUM | P2 |
| Apple notarization | HIGH | HIGH | P3 |
| Windows code signing | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Warp (terminal) | Cursor (editor) | Zed (editor) | Our Approach |
|---------|-----------------|-----------------|--------------|--------------|
| Download page OS detect | Yes, primary CTA per OS | Yes, auto-detect + fallback | Yes, OS-specific buttons | Client-side JS, primary CTA + all-platform table |
| Homebrew Cask | Yes, official tap | Yes, official tap | Yes, in homebrew-cask core | Self-hosted tap (homebrew-waiaas) |
| Installation guide | Integrated in docs | Integrated in docs | GitHub wiki | `docs/admin-manual/` consistent with existing structure |
| Code signing | Yes (Apple + Windows) | Yes (Apple + Windows) | Yes (Apple) | Deferred; document bypass in install guide |
| Auto-update | Yes | Yes | Yes | Already built (Tauri updater + Ed25519) |
| Multiple architectures | arm64 + x64 | arm64 + x64 | arm64 + x64 | arm64 + x64 macOS, x64 Windows + Linux |
| Package managers | Homebrew | Homebrew | Homebrew | Homebrew Cask (self-hosted tap) |

## Implementation Notes

### Download Page Technical Design

Hand-crafted HTML file at `site/download/index.html` (not markdown-generated) because it needs client-side JavaScript for OS detection and dynamic GitHub API content.

**OS Detection (2026 best practice):**
```javascript
function detectOS() {
  // Modern API (Chrome 90+, Edge 90+)
  const platform = navigator.userAgentData?.platform;
  if (platform) {
    if (platform === 'macOS') return 'macos';
    if (platform === 'Windows') return 'windows';
    if (platform === 'Linux') return 'linux';
  }
  // Fallback for Safari, Firefox
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return 'macos';
  if (/Win/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';
  return 'unknown';
}
```

**GitHub API for desktop-specific releases:**
```javascript
// Cannot use /releases/latest -- returns latest across ALL tags (npm + desktop)
// Must filter for desktop-v* tags specifically
const releases = await fetch(
  'https://api.github.com/repos/minhoyoo-iotrust/WAIaaS/releases'
).then(r => r.json());
const latest = releases.find(r => r.tag_name.startsWith('desktop-v') && !r.draft && !r.prerelease);
```

**Asset filename patterns (from desktop-release.yml matrix):**
- macOS arm64: `WAIaaS-Desktop_*.dmg` (aarch64-apple-darwin target)
- macOS x64: `WAIaaS-Desktop_*.dmg` (x86_64-apple-darwin target)
- Windows: `WAIaaS-Desktop_*.msi` (x86_64-pc-windows-msvc target)
- Linux: `WAIaaS-Desktop_*.AppImage` + `WAIaaS-Desktop_*.deb` (x86_64-unknown-linux-gnu)

### Homebrew Cask Formula Structure

```ruby
cask "waiaas-desktop" do
  version "0.1.0"

  on_arm do
    sha256 "PLACEHOLDER_ARM64_SHA256"
    url "https://github.com/minhoyoo-iotrust/WAIaaS/releases/download/desktop-v#{version}/WAIaaS-Desktop_#{version}_aarch64.dmg"
  end

  on_intel do
    sha256 "PLACEHOLDER_X64_SHA256"
    url "https://github.com/minhoyoo-iotrust/WAIaaS/releases/download/desktop-v#{version}/WAIaaS-Desktop_#{version}_x64.dmg"
  end

  name "WAIaaS Desktop"
  desc "Self-hosted wallet daemon for AI agents"
  homepage "https://waiaas.ai"

  app "WAIaaS Desktop.app"

  zap trash: [
    "~/Library/Application Support/dev.waiaas.desktop",
    "~/Library/Caches/dev.waiaas.desktop",
  ]
end
```

**Tap repo structure:**
```
homebrew-waiaas/
  Casks/
    waiaas-desktop.rb
  .github/
    workflows/
      update-cask.yml    # triggered by repository_dispatch
  README.md
```

**Install command:** `brew install --cask waiaas/waiaas/waiaas-desktop`

### CI Auto-Update Flow

1. `desktop-release.yml` publishes release to GitHub Releases (already exists)
2. After publish, add `repository_dispatch` step:
   ```yaml
   - name: Notify Homebrew tap
     uses: peter-evans/repository-dispatch@v3
     with:
       token: ${{ secrets.TAP_REPO_TOKEN }}
       repository: minhoyoo-iotrust/homebrew-waiaas
       event-type: update-cask
       client-payload: '{"version": "${{ steps.version.outputs.version }}"}'
   ```
3. `homebrew-waiaas` workflow receives event, downloads assets, computes SHA256, updates Cask formula, commits and pushes

### Installation Guide Structure

`docs/admin-manual/desktop-installation.md` with front-matter for site build:
- Section 1: System requirements (macOS 10.15+, Windows 10+, Linux with WebKit2GTK)
- Section 2: Installation methods (Homebrew Cask for macOS, direct download for all OS)
- Section 3: Gatekeeper bypass (macOS: right-click Open or `xattr -cr`), SmartScreen bypass (Windows)
- Section 4: Setup Wizard walkthrough (5 steps)
- Section 5: Troubleshooting (port conflicts, sidecar won't start, update issues)
- Section 6: Upgrading (auto-update mechanism, manual upgrade, Homebrew upgrade)
- Section 7: Uninstalling

### Download Page Integration with Site

The download page is NOT processed by `site/build.mjs` (markdown-to-HTML pipeline). It's a standalone HTML file that:
- Copies CRT theme CSS inline from `template.html`
- Has its own `<script>` for OS detection + GitHub API
- Follows same nav structure (logo + nav links)
- Deployed alongside other site assets via `pages.yml`
- Added to `sitemap.xml` generation in `build.mjs` (hardcoded entry)
- Needs `[Download]` nav link added to `template.html`

## Sources

- [Homebrew: How to Create and Maintain a Tap](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap) -- HIGH confidence
- [Homebrew: Adding Software to Homebrew](https://docs.brew.sh/Adding-Software-to-Homebrew) -- HIGH confidence
- [Simon Willison: Auto-updating Homebrew formulas with GitHub Actions](https://til.simonwillison.net/homebrew/auto-formulas-github-actions) -- MEDIUM confidence
- [josh.fail: Automate updating custom Homebrew formulae](https://josh.fail/2023/automate-updating-custom-homebrew-formulae-with-github-actions/) -- MEDIUM confidence
- [Homebrew Bump Cask GitHub Action](https://github.com/marketplace/actions/homebrew-bump-cask) -- MEDIUM confidence
- [MDN: NavigatorUAData API](https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData) -- HIGH confidence
- [30 Seconds of Code: Browser OS Detection](https://www.30secondsofcode.org/js/s/browser-os-detection/) -- MEDIUM confidence
- [Tauri v2: Distribute](https://v2.tauri.app/distribute/) -- HIGH confidence
- [GitHub REST API: Release Assets](https://docs.github.com/en/rest/releases/assets) -- HIGH confidence
- [Homebrew Discussion: Auto-Update Tap Formula](https://github.com/orgs/Homebrew/discussions/2558) -- MEDIUM confidence

---
*Feature research for: Desktop App Distribution Channels*
*Researched: 2026-04-01*
