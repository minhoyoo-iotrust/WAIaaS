# Project Research Summary

**Project:** WAIaaS v32.7 SEO/AEO Optimization
**Domain:** Static site SEO/AEO enhancement (GitHub Pages)
**Researched:** 2026-03-17
**Confidence:** HIGH

## Executive Summary

WAIaaS needs to convert its existing 17 markdown documentation files into SEO-optimized static HTML pages served from GitHub Pages, while simultaneously optimizing for AI answer engines (AEO). The site already has a solid foundation -- a CRT-themed landing page with JSON-LD structured data (SoftwareApplication, FAQPage, HowTo), OG/Twitter cards, and an llms.txt file. The gap is that all documentation content lives as raw markdown in `docs/`, invisible to search engines and AI crawlers.

The recommended approach is a custom Node.js build script (~200-300 lines) using `marked` + `gray-matter` + `highlight.js` -- no SSG framework. This matches the project's existing pattern of self-contained build scripts (cf. `generate-og-image.mjs`) and avoids framework lock-in for what will be ~20 pages. The build script converts markdown with YAML front-matter into themed HTML pages using a shared template, auto-generates sitemap.xml and llms-full.txt, and injects per-page JSON-LD structured data.

Key risks are (1) canonical URL / sitemap mismatches that cause Google to ignore the sitemap entirely, (2) JSON-LD structured data with missing required properties that trigger Search Console errors, and (3) CRT dark theme accessibility issues on long-form content pages. All three are preventable by building the right patterns into the template and build script from the start -- automated sitemap generation, front-matter validation with fail-fast, and document-specific CSS that maintains the brand aesthetic while meeting WCAG AA contrast ratios.

## Key Findings

### Recommended Stack

No framework needed. A custom Node.js ESM build script with 4 lightweight dependencies, isolated from the monorepo. Total new dependencies: 4 packages with near-zero transitive deps.

**Core technologies:**
- **marked** (^17.0.4): Markdown-to-HTML parser -- zero dependencies, fast, extensible via `marked.use()`
- **gray-matter** (^4.0.3): YAML front-matter extraction -- de facto standard, stable since 2019
- **highlight.js** (^11.11.1): Build-time syntax highlighting -- zero client JS, `github-dark` theme fits CRT aesthetic
- **marked-highlight** (^2.2.1): Official marked extension bridging highlight.js into the marked pipeline

**Explicitly rejected:** SSG frameworks (overkill for ~20 pages), Shiki (WASM overhead), Tailwind (existing CSS is small and consistent), any CMS, React/Preact for content pages, analytics.

### Expected Features

**Must have (table stakes):**
- Markdown-to-HTML build script (foundation for everything else)
- HTML page template matching CRT theme (consistent layout, nav, footer)
- Global navigation bar with active states
- Extended sitemap.xml (auto-generated with all pages)
- Per-page meta tags and OG/Twitter cards (from front-matter)
- Blog section (9 articles from `docs/why-waiaas/` + `docs/guides/`)
- Docs section (8 technical articles from `docs/`)

**Should have (differentiators):**
- SEO landing pages (2-3 category-defining pages: "What is AI Wallet?", "AI Agent Wallet Security", "MCP Wallet")
- Extended JSON-LD (Article/TechArticle/BreadcrumbList per page type)
- FAQ expansion (5 to 20-30 Q&A with AEO 40-word answer rule)
- llms-full.txt (full content dump for AI crawlers)
- AI directory submission kit (SUBMISSION_KIT.md)

**Defer (v2+):**
- Comparison pages ("WAIaaS vs X") -- need traffic data first
- Community posting drafts -- after content stabilizes
- Client-side search (Pagefind) -- premature for ~20 pages
- Per-page OG images -- shared OG image is sufficient

### Architecture Approach

The architecture adds a thin build layer on top of the existing pure-HTML static site. `index.html` remains hand-crafted and untouched (except for one nav link update). All other HTML is generated from `docs/*.md` source files via a build script, output into `site/docs/` and `site/blog/` directories using the `directory/index.html` pattern for clean URLs. Generated files are gitignored -- they exist only in the CI artifact. The GitHub Actions pipeline gains a Node.js build step before the existing `upload-pages-artifact` action.

**Major components:**
1. **`site/build.mjs`** -- Build script: parses front-matter, renders markdown, injects into template, generates sitemap/llms-full.txt
2. **`site/_template.html`** -- HTML shell with CRT theme variables, nav, JSON-LD placeholders, `{{variable}}` interpolation
3. **`docs/**/*.md`** -- Source content with YAML front-matter (title, description, date, category)
4. **`.github/workflows/pages.yml`** -- Modified to add `fetch-depth: 0` + Node.js build step + `docs/**` trigger path

### Critical Pitfalls

1. **Canonical URL / Sitemap mismatch** -- Build script must auto-generate sitemap.xml using the exact same URL generation logic as canonical tags. One URL convention (trailing slash, custom domain) applied everywhere.
2. **JSON-LD missing required properties** -- Front-matter validation must fail-fast on missing title/description/date. Per-schema-type required property checklists built into the build script.
3. **AEO neglected in favor of SEO-only** -- Content must follow question-first headings, 40-word concise answer blocks, FAQ sections with FAQPage schema, and Organization entity clarity.
4. **CRT theme accessibility on long content** -- Document pages need reduced CRT effects (no scanline on article body), WCAG AA contrast ratios (4.5:1+), `overflow-x: auto` on code blocks.
5. **Front-matter metadata loss** -- Build script must extract and inject title/description/canonical/OG from front-matter into `<head>`. Missing front-matter = build warning or failure.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Build Infrastructure
**Rationale:** Everything depends on this -- no content pages, no SEO assets, no deployment without the build pipeline.
**Delivers:** Build script (`build.mjs`), HTML template (`_template.html`), `package.json` with 4 dependencies, article CSS with reduced CRT effects for readability.
**Addresses:** Table stakes (build script, template, navigation)
**Avoids:** Pitfalls 1 (canonical/sitemap -- URL convention established), 4 (accessibility -- article CSS designed), 5 (metadata loss -- front-matter parsing built in), 6 (GitHub Pages constraints -- architecture decided), 7 (OG tags -- template includes them)

### Phase 2: Content Pages
**Rationale:** Depends on Phase 1 template. Converts existing 17 markdown files into web pages -- immediate SEO value with zero new content creation.
**Delivers:** Blog section (9 pages), Docs section (8 pages), docs index page, blog index page. Front-matter added to all markdown files.
**Addresses:** Table stakes (Blog section, Docs section)
**Uses:** marked, gray-matter, highlight.js from STACK.md

### Phase 3: SEO/AEO Assets
**Rationale:** Depends on Phase 2 page list. Generates machine-readable assets and adds structured data to all pages.
**Delivers:** Auto-generated sitemap.xml, llms-full.txt, llms.txt, per-page JSON-LD (TechArticle/Article/BreadcrumbList), Organization schema.
**Addresses:** Differentiators (JSON-LD, llms-full.txt, BreadcrumbList)
**Avoids:** Pitfalls 2 (JSON-LD validation), 3 (AEO neglect)

### Phase 4: CI Integration + Go-Live
**Rationale:** Must come last among infrastructure phases -- modifies production deployment pipeline. All content and assets must be verified first.
**Delivers:** Updated `pages.yml` (build step, fetch-depth: 0, trigger paths including `docs/**`), `.gitignore` for generated files (`site/docs/`, `site/blog/`), `index.html` nav Docs link changed to `/docs/`, removal of committed sitemap.xml/llms.txt.
**Avoids:** Integration gotchas (CNAME preservation in build output, trigger paths)

### Phase 5: SEO Landing Pages + FAQ Expansion
**Rationale:** New content creation after infrastructure is proven. Requires writing 2-3 category-defining pages and expanding FAQ from 5 to 20-30 Q&A.
**Delivers:** "What is AI Wallet?" landing page, "AI Agent Wallet Security" landing page, "MCP Wallet" landing page, expanded FAQ with AEO 40-word answer patterns.
**Addresses:** Differentiators (SEO landing pages, FAQ expansion)

### Phase Ordering Rationale

- **Phases 1-4 are strictly sequential** due to hard dependencies: template before content, content before SEO assets, assets verified before CI deployment change.
- **Phases 1-3 can potentially merge** since the build script naturally handles template rendering, content generation, and sitemap/JSON-LD generation in a single pass. The logical separation helps planning but implementation may combine them.
- **Phase 4 is the "flip the switch" phase** -- small scope but high impact (production deployment change). Keep it separate for clean rollback if needed.
- **Phase 5 is the only phase requiring new content creation** -- everything else reuses existing markdown. Intentionally last to avoid blocking infrastructure on copywriting.

### Research Flags

Phases with standard patterns (skip research-phase):
- **Phase 1:** Well-documented: marked/gray-matter APIs are simple, HTML template is string interpolation, GitHub Pages directory/index.html pattern is standard.
- **Phase 2:** Mechanical: front-matter addition to existing files, slug derivation from filenames.
- **Phase 4:** Standard: GitHub Actions pages workflow modification, `.gitignore` updates.

Phases that may need attention during planning:
- **Phase 3 (JSON-LD):** Schema.org required properties per type (TechArticle vs Article vs HowTo) need careful enumeration. Detail-sensitive but not complex.
- **Phase 5 (SEO Landing Pages):** Content strategy for "AI wallet" category definition is marketing/copywriting work, not engineering. Keyword targeting should be validated with Search Console data after initial pages are indexed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | 4 mature npm packages with verified versions. Zero framework risk. Matches existing project build-script patterns. |
| Features | HIGH | Feature list derived from direct site audit + established SEO/AEO checklists. Existing 17 markdown files are confirmed source content. |
| Architecture | HIGH | Build script approach proven for small static sites. Directory structure and URL patterns verified against GitHub Pages behavior. |
| Pitfalls | HIGH | All pitfalls well-documented in SEO literature with concrete prevention strategies implementable in the build script. |

**Overall confidence:** HIGH

### Gaps to Address

- **AEO effectiveness measurement:** No objective way to measure AEO success until pages are live and indexed for 2-4 weeks. Plan for a manual "query WAIaaS in ChatGPT/Perplexity" check post-launch.
- **Keyword research for SEO landing pages:** Phase 5 landing page topics ("AI wallet", "MCP wallet") are educated guesses. Validate with Google Search Console data after initial pages are indexed.
- **Content quality for AEO:** The 40-word answer rule and question-first headings are evidence-based patterns, but effectiveness depends on execution quality of the actual prose.
- **CSS extraction strategy:** ARCHITECTURE.md recommends duplicating CSS variables between index.html and _template.html rather than extracting a shared stylesheet. STACK.md suggests extracting to `style.css`. The duplication approach is safer (no risk to production landing page) but creates maintenance overhead. Decide during Phase 1 planning.

## Sources

### Primary (HIGH confidence)
- [marked npm](https://www.npmjs.com/package/marked) -- v17.0.4, API and dependency verification
- [gray-matter npm](https://www.npmjs.com/package/gray-matter) -- v4.0.3, front-matter parsing
- [Schema.org](https://schema.org/) -- TechArticle, BlogPosting, FAQPage, BreadcrumbList, SoftwareApplication types
- [Google Structured Data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) -- JSON-LD implementation guide
- [GitHub Pages docs](https://docs.github.com/en/pages) -- deployment, clean URLs, custom domains
- [llms.txt specification](https://llmstxt.org/) -- official spec
- Existing codebase audit: `site/index.html`, `site/llms.txt`, `site/sitemap.xml`, `.github/workflows/pages.yml` -- direct inspection

### Secondary (MEDIUM confidence)
- [CXL AEO Guide 2026](https://cxl.com/blog/answer-engine-optimization-aeo-the-comprehensive-guide/) -- 40-word answer rule, question-first headings
- [LLMrefs AEO Guide](https://llmrefs.com/answer-engine-optimization) -- AEO content patterns
- [SEO for Static Websites 2026](https://simplystatic.com/tutorials/seo-for-static-websites/) -- static site SEO checklist
- [GitHub Pages SEO Setup](https://wrigo.io/blog/github-pages-seo-setup-guide-how-to-rank-your-developer-documentation-site) -- GitHub Pages-specific SEO
- [SEO Mistakes 2026](https://www.ranktracker.com/blog/seo-mistakes-2026/) -- pitfall patterns
- [JSON-LD Schema Issues](https://zeo.org/resources/blog/most-common-json-ld-schema-issues-and-solutions) -- structured data pitfalls
- [AEO Guide 2026 -- Frase.io](https://www.frase.io/blog/what-is-answer-engine-optimization-the-complete-guide-to-getting-cited-by-ai) -- AI citation optimization

---
*Research completed: 2026-03-17*
*Ready for roadmap: yes*
