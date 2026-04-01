# Project Research Summary

**Project:** WAIaaS Desktop App Distribution Channels (m33-03)
**Domain:** Desktop App Distribution (Download Page, Homebrew Cask, Installation Guide)
**Researched:** 2026-04-01
**Confidence:** HIGH

## Executive Summary

WAIaaS Desktop (Tauri 2 app, already shipped as v33.2) needs a distribution layer: a download page users can discover, a macOS Homebrew Cask channel developers expect, and an installation guide covering OS-specific security dialogs. These are well-understood problems with established patterns. The core implementation challenge is not technical complexity but correctness in edge cases — particularly the GitHub Releases API filtering (two release tracks coexist: npm releases via release-please and desktop releases via `desktop-release.yml`), Homebrew Cask naming and SHA256 integrity, and OS-specific security bypass instructions that differ between macOS versions.

The recommended approach is a hand-crafted static HTML download page with build-time or client-side (with localStorage cache) GitHub API integration, a self-hosted Homebrew Cask tap (`minhoyoo-iotrust/homebrew-waiaas`), CI-automated formula updates via `repository_dispatch`, and an installation guide in the existing `docs/admin-manual/` pipeline. No new npm dependencies are required. The site's existing pattern — `site/index.html` as a manually managed HTML file outside the `build.mjs` markdown pipeline — is extended to `site/download/index.html`. All three deliverables integrate cleanly with existing infrastructure, and `pages.yml` deploys everything automatically since it watches the entire `site/` directory.

The primary risk is the two-release-track problem: the download page must filter GitHub Releases by `desktop-v*` tag prefix or it will show npm tarball artifacts to users. Secondary risks are Homebrew SHA256 race conditions (assets must be fully published before checksum computation), macOS Sequoia Gatekeeper bypass changes (the right-click/open method no longer works on macOS 15+), and PAT expiration silently breaking Cask auto-updates. All risks have clear mitigations that must be built in from the start.

## Key Findings

### Recommended Stack

The entire feature set requires zero new npm dependencies. The download page is a standalone hand-crafted HTML file (`site/download/index.html`) using inline vanilla JS (~50 lines) for OS detection and GitHub API fetching. The Homebrew Cask tap is a separate GitHub repository (`minhoyoo-iotrust/homebrew-waiaas/`) containing only Ruby and YAML files. CI automation extends the existing `desktop-release.yml` workflow with a new `update-homebrew` job. The installation guide uses the existing `docs/admin-manual/` + `site/build.mjs` pipeline without any modification.

**Core technologies:**
- Vanilla JS inline script with `navigator.userAgentData?.platform` + `navigator.userAgent` fallback — OS detection without libraries; 3-tier fallback covers Chrome/Edge (modern API), Firefox/Safari (UA string), unknown (show all platforms); ~15 lines, no UAParser.js needed
- GitHub REST API v3 `/repos/.../releases` — fetch desktop release assets; must filter `tag_name.startsWith('desktop-v')`, never use `/releases/latest` which returns npm releases
- Homebrew Cask DSL (Ruby), Homebrew 5.x — macOS `.dmg` distribution via separate tap repo; `on_arm`/`on_intel` dual-arch blocks, `auto_updates true`, `depends_on macos: ">= :catalina"`, `zap trash:` for clean uninstall
- `actions/github-script@v7` + `repository_dispatch` / `peter-evans/repository-dispatch@v3` — CI cross-repo automation from `desktop-release.yml` to tap repo; PAT with `contents:write` on tap repo required
- `shasum --algorithm 256` / `sha256sum` (Ubuntu runner) — SHA256 computation after full `.dmg` download for Cask formula; must follow redirects, compute from actual file not redirect URL

### Expected Features

**Must have (table stakes):**
- Download page with OS auto-detection — primary CTA shows the right binary for the visitor's OS; Apple Silicon shown as recommended for macOS
- GitHub Releases API integration showing current version — users expect "latest" without stale links; filter `desktop-v*` tags client-side
- All-platforms download table below the primary CTA — users with wrong detection or multiple machines need manual selection
- Homebrew Cask tap (`homebrew-waiaas` repo + formula) — macOS developers treat `brew install --cask` as primary method; Homebrew strips quarantine attribute automatically, bypassing Gatekeeper
- CI-automated Cask formula updates on every `desktop-v*` release — manual updates break trust; formula must stay in sync
- Desktop installation guide (`docs/admin-manual/desktop-installation.md`) — step-by-step for macOS (including Sequoia), Windows (SmartScreen), Linux (AppImage FUSE/chmod), Setup Wizard walkthrough
- Nav link to Download page in `site/template.html` — every page on waiaas.ai links to download

**Should have (differentiators):**
- CRT-themed download page consistent with site aesthetic — brand cohesion reinforces self-hosted security positioning
- Auto-update status indicator on download page — "Automatic updates included via Ed25519 signature verification" note; reduces anxiety
- Release notes link per version — transparency for security-conscious users
- Alternative install methods section — Homebrew vs direct download vs npm/Docker daemon-only
- SUBMISSION_KIT desktop channel entries — distribution tracking completeness

**Defer (v2+):**
- Apple notarization + code signing — requires Apple Developer Program ($99/yr) and CI complexity; document Gatekeeper bypass in guide instead
- Windows EV code signing — $300-500/yr; document SmartScreen bypass instead
- Winget/Chocolatey/Scoop packages — add when Windows user base justifies maintenance overhead
- Snap/Flatpak packages — add when Linux user base requests them
- Homebrew core submission (`homebrew/homebrew-cask`) — requires Apple notarization as prerequisite; too much maintenance overhead for current scale

### Architecture Approach

Three new components integrate with existing infrastructure, each with a clear boundary. The download page is a standalone HTML file (not processed by `build.mjs`) that fetches from the public GitHub Releases API and renders OS-specific download buttons. The Homebrew Cask tap is a separate repository updated automatically by a new CI job added to `desktop-release.yml`. The installation guide is a Markdown file in `docs/admin-manual/` that `site/build.mjs` converts to HTML automatically — zero pipeline changes needed. The existing `pages.yml` workflow deploys everything because it watches the entire `site/` directory.

**Major components:**
1. `site/download/index.html` — standalone static HTML + inline JS; OS detection via `navigator.userAgentData` with UA fallback; GitHub Releases API filtered for `desktop-v*` tags; CRT theme reused from `template.html`; deployed by `pages.yml` automatically
2. `minhoyoo-iotrust/homebrew-waiaas` repo — separate GitHub repository with `Casks/w/waiaas-desktop.rb`; dual-arch formula using `on_arm`/`on_intel` blocks; `README.md` with install instructions
3. `desktop-release.yml` `update-homebrew` job — triggers after `publish-release` completes; downloads macOS DMGs, computes SHA256, updates formula via `sed`, commits to tap repo using `HOMEBREW_TAP_TOKEN` PAT
4. `docs/admin-manual/desktop-installation.md` — 10th admin manual file; processed by existing `build.mjs` pipeline; 7 sections covering system requirements, install methods, Gatekeeper (macOS 14 vs 15+), SmartScreen, AppImage FUSE, Setup Wizard, auto-update

**Modified files (minimal surface):**
- `site/template.html` — add Download link to nav-links (affects all build-generated pages)
- `site/index.html` — add Download Desktop CTA section
- `.github/workflows/desktop-release.yml` — add `update-homebrew` job after `publish-release`
- `site/build.mjs` — add `/download/` static URL entry in `generateSitemap()` (1 line)
- `site/distribution/SUBMISSION_KIT.md` — add desktop channel entries

### Critical Pitfalls

1. **Two release tracks: never use `/releases/latest`** — that endpoint returns the most recent release across ALL tags, which is typically an npm package release (`waiaas-2.13.0-rc`), not a desktop release. Must fetch `/releases` (or `/releases?per_page=10`) and filter `tag_name.startsWith('desktop-v') && !r.draft && !r.prerelease`. This applies to both the download page JS and the CI formula update job.

2. **Homebrew SHA256 race condition** — the `publish-release` job in `desktop-release.yml` must fully complete before the `update-homebrew` job starts. Use `needs: publish-release` in the job definition. Then download the actual `.dmg` file (follow redirects) and compute `sha256sum` locally — never from a redirect URL or CDN partial download. Add a 30-second sleep or retry loop (3 attempts) for CDN propagation delay. A wrong checksum causes `brew install --cask` to fail for every user.

3. **macOS Sequoia Gatekeeper: right-click bypass removed** — macOS 15 (Sequoia) removed the Control-click / right-click "Open" bypass method that all guides describe. Installation guide must have a Sequoia-specific section: System Settings → Privacy & Security → scroll to bottom → "Open Anyway" button → confirm with admin password. Omitting this means all macOS 15+ users on unsigned builds hit an invisible barrier.

4. **GitHub API rate limiting on the download page** — 60 unauthenticated req/hr per IP. Shared corporate networks or cloud IP ranges exhaust this immediately. Preferred mitigation: build-time embedding in `site/build.mjs` using `GITHUB_TOKEN` (5,000 req/hr in CI). If client-side fetch is used: cache API response in `localStorage` with 1-hour TTL, and always show a static fallback link to the GitHub Releases page when the API is unreachable.

5. **PAT expiration silently breaks Cask auto-updates** — fine-grained PATs have mandatory expiration (default 90 days). The CI failure is silent unless workflow run monitoring is in place. Mitigation: use a GitHub App installation token (no expiration) instead of a PAT. If PAT is used, set 1-year expiration and add a calendar reminder; monitor `desktop-release.yml` run results.

## Implications for Roadmap

Based on research, 5 phases are suggested with clear dependency ordering:

### Phase 1: Homebrew Cask Tap Repository
**Rationale:** No dependencies on other phases; fully independent. Creating the tap repo first removes the blocking dependency for Phase 3. Must be created before any CI automation can push formula updates to it.
**Delivers:** `minhoyoo-iotrust/homebrew-waiaas` GitHub repository with `Casks/w/waiaas-desktop.rb` (placeholder SHA256), `README.md` with `brew tap` and `brew install --cask` instructions
**Addresses:** Homebrew Cask table-stakes feature; macOS primary install channel
**Avoids:** Cask naming collision pitfall — run `brew search waiaas` and `brew search waiaas-desktop` before committing; use `waiaas-desktop` as cask name; verify `brew audit --cask` passes on initial formula

### Phase 2: Desktop Installation Guide
**Rationale:** Independent of Phase 1 and 4; can be written with knowledge of what the Homebrew Cask install command will be. Should precede the download page so the guide URL is stable when the download page links to it.
**Delivers:** `docs/admin-manual/desktop-installation.md` — 7 sections: system requirements (macOS 10.15+/Windows 10+/Linux WebKit2GTK), install methods (Homebrew Cask first, then direct download), Gatekeeper bypass split between macOS 14 and macOS 15+, SmartScreen bypass with step descriptions, AppImage `chmod +x` + `libfuse2` dependency, 5-step Setup Wizard walkthrough, auto-update explanation, troubleshooting, uninstall
**Addresses:** Table-stakes installation guide; Sequoia Gatekeeper pitfall; SmartScreen pitfall; Linux AppImage FUSE pitfall
**Avoids:** Using single Gatekeeper bypass instructions that only work on macOS 14 and earlier

### Phase 3: CI Formula Auto-Update
**Rationale:** Depends on Phase 1 (tap repo must exist to accept CI pushes). Can proceed immediately after Phase 1. Ensures the Cask formula is updated within minutes of every desktop release — this must be in place before the first real release after this milestone.
**Delivers:** `update-homebrew` job added to `.github/workflows/desktop-release.yml` with `needs: publish-release`; `HOMEBREW_TAP_TOKEN` secret configured on main repo; authentication strategy decided (PAT vs GitHub App); `brew audit --cask` verification step in CI
**Uses:** `peter-evans/repository-dispatch@v3` or inline `gh` API call; `sha256sum` on Ubuntu runner; `sed` formula update pattern
**Avoids:** SHA256 race condition pitfall — `needs: publish-release` sequencing + CDN delay retry; PAT expiration pitfall — choose GitHub App or set 1-year PAT with monitoring; using `GITHUB_TOKEN` which cannot write to other repos

### Phase 4: Download Page + Navigation Update
**Rationale:** Depends on Phase 2 (installation guide URL must exist to link to). This is the user-facing integration phase. The `template.html` nav change affects all build-generated pages and should be done simultaneously with the download page.
**Delivers:** `site/download/index.html` with OS detection, `desktop-v*`-filtered GitHub Releases API, all-platforms table, version display, checksum link, Homebrew Cask install command, link to installation guide; `site/template.html` with Download link in nav; `site/index.html` with Download CTA; `site/build.mjs` with `/download/` sitemap entry
**Addresses:** Download page table-stakes; OS detection pitfall (show both macOS architectures, Apple Silicon as default recommendation, always show all-platforms fallback); two-release-track pitfall (filter `desktop-v*`); rate-limiting pitfall (localStorage cache + static fallback link)
**Avoids:** Using `/releases/latest`; showing npm release artifacts on download page; client-side-only API call with no fallback when rate-limited

### Phase 5: SUBMISSION_KIT Update + Final Verification
**Rationale:** Terminal phase. All three deliverables must have stable URLs before documenting them. Verification checklist confirms end-to-end correctness across all distribution channels.
**Delivers:** `site/distribution/SUBMISSION_KIT.md` updated with desktop distribution channel entries (download page URL, Homebrew tap install command, installation guide URL); end-to-end verification checklist run
**Addresses:** Distribution tracking completeness; "looks done but isn't" verification

### Phase Ordering Rationale

- Phase 1 before Phase 3: CI cannot push commits to a tap repo that does not exist
- Phase 2 before Phase 4: Download page links to the installation guide — the guide must have a stable URL first
- Phase 1 and Phase 2 can run in parallel: they have no mutual dependency
- Phase 3 after Phase 1: The formula update CI needs the tap repo as its push target
- Phase 4 is the integration point: all upstream deliverables (guide URL, tap repo, install command) must be ready
- Phase 5 is terminal: meaningful only after all channels are functional and verifiable

### Research Flags

Phases needing close attention during planning:
- **Phase 3 (CI Formula Auto-Update):** Authentication strategy (PAT vs GitHub App) is a one-time decision with long-term operational consequences. Fine-grained PAT expiration has caused silent breakage in many projects. GitHub App requires one-time App registration but never expires. This should be explicitly decided in Phase 3 planning, not deferred.
- **Phase 4 (Download Page):** Actual asset filename patterns from `tauri-action` must be verified against a real release before writing final asset-matching logic. Research assumes `WAIaaS-Desktop_*.dmg`, `WAIaaS-Desktop_*.msi`, `WAIaaS-Desktop_*.AppImage` based on `productName` in `tauri.conf.json` and `createUpdaterArtifacts: "v1Compatible"`. Final regex must match actual filenames from a build log.

Phases with standard patterns (minimal additional research needed):
- **Phase 1 (Homebrew Cask Tap):** Cask DSL is well-documented. `on_arm`/`on_intel` dual-arch blocks stable since Homebrew 3.6, current version 5.1.0. Only verification needed: `brew audit --cask` run before shipping.
- **Phase 2 (Installation Guide):** Standard documentation writing. All technical content (Gatekeeper, SmartScreen, AppImage) is known from research.
- **Phase 5 (SUBMISSION_KIT):** Pure documentation update, no technical uncertainty.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All components verified against official docs (Homebrew Cask Cookbook, MDN, GitHub REST API). Existing codebase inspected directly. Zero new npm dependencies required. |
| Features | HIGH | Competitor analysis (Warp, Cursor, Zed) confirms industry-standard expectations. Homebrew Cask and download page are well-established patterns. |
| Architecture | HIGH | Three new components have clear boundaries and precedents in existing codebase (`site/index.html` as manual HTML precedent, `repository_dispatch` pattern documented by multiple community sources). |
| Pitfalls | HIGH | Key pitfalls (two-release-track API filter, SHA256 race condition, Sequoia Gatekeeper change) verified against real GitHub issues, Apple documentation, and Homebrew CI discussions with concrete examples. |

**Overall confidence:** HIGH

### Gaps to Address

- **Actual tauri-action asset filenames:** Research assumes `WAIaaS-Desktop_*` patterns based on `productName: "WAIaaS Desktop"` in `tauri.conf.json` and `createUpdaterArtifacts: "v1Compatible"`. Must be verified against a real build log or dry-run CI output before finalizing the Cask formula URL pattern and download page asset-matching regex. This is a P1 verification task in Phase 3 and Phase 4.

- **Apple signing secret availability:** `desktop-release.yml` references `APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` secrets. If these are unset or invalid, all macOS builds are unsigned and every macOS user encounters Gatekeeper. Installation guide content branches based on whether signing is active (signed = no warning, unsigned = Gatekeeper bypass instructions needed). Verify secret availability before writing Phase 2 guide content.

- **GitHub App vs PAT for cross-repo CI:** Research recommends GitHub App for operational reliability (no expiration) but PAT is simpler to set up initially. This decision must be made explicitly in Phase 3 planning — it is not a detail to decide during implementation.

## Sources

### Primary (HIGH confidence)
- [Homebrew Cask Cookbook](https://docs.brew.sh/Cask-Cookbook) — DSL stanza order, `on_arm`/`on_intel`, `auto_updates`, `zap`, `depends_on`
- [Homebrew Taps Documentation](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap) — tap naming convention, `brew tap`, repo structure
- [Homebrew 5.1.0 Release Notes](https://brew.sh/2026/03/10/homebrew-5.1.0/) — current version, DSL compatibility confirmed
- [GitHub REST API: Releases](https://docs.github.com/en/rest/releases/releases) — response structure, `assets[].browser_download_url`, rate limits
- [GitHub REST API Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) — 60 req/hr unauthenticated, 5,000 req/hr with GITHUB_TOKEN in CI
- [MDN: Navigator.userAgentData](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/userAgentData) — modern OS detection API, Chrome 90+ / Edge 90+ support
- [Apple: Open a Mac app from an unknown developer](https://support.apple.com/en-us/102445) — Gatekeeper bypass procedures including macOS 15 (Sequoia) Privacy & Security flow
- Existing codebase direct inspection: `desktop-release.yml`, `pages.yml`, `site/build.mjs`, `site/index.html`, `site/template.html`, `apps/desktop/src-tauri/tauri.conf.json`

### Secondary (MEDIUM confidence)
- [Simon Willison: Auto-maintaining Homebrew formulas with GitHub Actions](https://til.simonwillison.net/homebrew/auto-formulas-github-actions) — `repository_dispatch` CI pattern for tap updates
- [josh.fail: Automate updating custom Homebrew formulae](https://josh.fail/2023/automate-updating-custom-homebrew-formulae-with-github-actions/) — alternative cross-repo CI approaches
- [BuiltFast: Automating Homebrew Tap Updates](https://builtfast.dev/blog/automating-homebrew-tap-updates-with-github-actions/) — `sed`-based formula update pattern
- [Homebrew SHA256 Checksum Mismatch Issues](https://github.com/Homebrew/homebrew-cask/issues/41993) — CDN propagation race condition root causes
- [macOS Sequoia Gatekeeper Changes](https://www.techbloat.com/macos-sequoia-bypassing-gatekeeper-to-install-unsigned-apps.html) — right-click bypass removal in macOS 15
- [Windows SmartScreen Bypass Guide](https://www.fortect.com/windows-optimization-tips/windows-defender-smartscreen-prevented-an-unrecognized-app-from-starting-warning/) — "More info → Run anyway" user-facing instructions

### Tertiary (LOW confidence — needs validation)
- tauri-action asset naming patterns — inferred from `tauri.conf.json` `productName: "WAIaaS Desktop"` + `createUpdaterArtifacts: "v1Compatible"`; must be validated against actual CI build output before finalizing formula URLs and download page asset-matching logic

---
*Research completed: 2026-04-01*
*Ready for roadmap: yes*
