# Technology Stack: SEO/AEO Optimization

**Project:** WAIaaS v32.7 SEO/AEO
**Researched:** 2026-03-17

## Recommended Stack

### Constraint: No Framework, Pure HTML + Build Script

The existing site (`site/index.html`) is a hand-crafted single HTML file with inline CSS, deployed via `actions/upload-pages-artifact` directly from the `site/` directory. There is no SSG framework (no Hugo, no Eleventy, no Astro). Introducing one would be a fundamental architecture change that is unnecessary for this scope.

**Decision: Custom Node.js build script** (`scripts/build-site.mjs`) that converts markdown to HTML using templates. This matches the project's pattern of self-contained build scripts (cf. `generate-og-image.mjs` already in `site/`).

### Markdown-to-HTML Pipeline

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| marked | ^17.0.4 | Markdown parser | Zero dependencies, fast, extensible via `marked.use()`. 11k+ npm dependents. No need for remark/unified complexity for static content pages. |
| gray-matter | ^4.0.3 | YAML front-matter extraction | De facto standard (3,200+ dependents). Extracts title, description, date, schema type, keywords from markdown front-matter. Stable API since 2019, no breaking changes. |
| marked-highlight | ^2.2.1 | Code syntax highlighting bridge | Official marked extension from markedjs org. Integrates highlight function into marked pipeline. |
| highlight.js | ^11.11.1 | Syntax highlighting | Ships pre-built CSS themes, works at build time (zero client JS). Use `github-dark` theme to match CRT aesthetic. Lighter than Shiki (no WASM). |

### Why NOT These Alternatives

| Category | Rejected | Why Not |
|----------|----------|---------|
| SSG Framework | Eleventy, Hugo, Astro | Overkill. Site is 1 index.html + will become ~20 pages. Custom script is simpler, no framework lock-in, no config files, no theme system. Build script will be <200 lines. |
| Markdown Parser | markdown-it, remark | marked is simpler, zero deps, sufficient for content pages. remark/unified brings plugin ecosystem complexity. |
| Syntax Highlighter | Shiki | Requires WASM loading at build time, heavier install (~50MB). highlight.js is sufficient for code examples in blog/docs. |
| Front-matter | front-matter (npm) | gray-matter is more widely adopted, handles edge cases better, supports TOML/JSON front-matter if needed. |
| Template Engine | EJS, Handlebars, Nunjucks | Plain JavaScript template literals are sufficient. The HTML template is one file with `${variable}` interpolation. No logic branching needed in templates. |

## Build Script Architecture

### Input/Output

```
docs/                          # Source markdown (existing, 17 files)
  why-waiaas/001-*.md         # Blog-style articles (4 files)
  security-model.md           # Technical docs
  architecture.md             # Technical docs
  deployment.md               # Guide
  guides/*.md                 # How-to guides (5 files)
  admin-manual/*.md           # Admin guides (1 file)

site/                          # Output (GitHub Pages root)
  index.html                  # Existing landing page (untouched)
  style.css                   # Extracted shared stylesheet
  blog/                       # Generated from docs/why-waiaas/
    ai-agent-wallet-security-crisis/index.html
    ai-agent-wallet-models-compared/index.html
    ...
  docs/                       # Generated from docs/ technical articles
    security-model/index.html
    architecture/index.html
    deployment/index.html
    ...
  sitemap.xml                 # Auto-generated with all URLs
```

### Front-Matter Schema

Add YAML front-matter to existing markdown files:

```yaml
---
title: "Why AI Agents Need Self-Hosted Wallets"
description: "AI agents managing crypto face a security crisis..."
date: 2026-03-17
type: blog | docs | guide       # Determines JSON-LD schema type and URL prefix
keywords: [ai wallet, security, self-hosted]
schema: TechArticle | BlogPosting  # JSON-LD @type override (optional)
---
```

### Template Strategy

One HTML template file (`site/_template.html`) with:
- Same CSS variables, JetBrains Mono font, scanline effect as index.html
- Nav bar with active state for current section (Blog / Docs / GitHub / npm)
- `<article>` wrapper for rendered markdown content
- JSON-LD block injected per page from front-matter
- Canonical URL, OG tags, meta description from front-matter
- BreadcrumbList JSON-LD for navigation hierarchy

**No client-side JavaScript** for content pages. Pages are pure static HTML with zero JS.

## Structured Data (JSON-LD)

### Schema Types Per Page Type

| Page Type | Schema.org Type | Key Properties | Confidence |
|-----------|----------------|----------------|------------|
| Landing (index.html) | SoftwareApplication + FAQPage + HowTo | Already exists. Add Organization. | HIGH |
| Blog articles (why-waiaas/) | BlogPosting | headline, datePublished, author, description | HIGH |
| Technical docs | TechArticle | headline, proficiencyLevel, dependencies | HIGH |
| Guides | HowTo | name, step[], totalTime, tool[] | HIGH |
| SEO landing pages | WebPage + FAQPage | mainEntity, speakable | MEDIUM |

### New Structured Data

**Organization (inject on all pages via template):**
```json
{
  "@type": "Organization",
  "name": "WAIaaS",
  "url": "https://waiaas.ai",
  "logo": "https://waiaas.ai/og-image.png",
  "sameAs": [
    "https://github.com/minhoyoo-iotrust/WAIaaS",
    "https://www.npmjs.com/package/@waiaas/cli"
  ]
}
```

**BreadcrumbList (on all content pages):**
```json
{
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://waiaas.ai/"},
    {"@type": "ListItem", "position": 2, "name": "Blog", "item": "https://waiaas.ai/blog/"},
    {"@type": "ListItem", "position": 3, "name": "${title}"}
  ]
}
```

**BlogPosting (blog articles -- `docs/why-waiaas/*.md`):**
```json
{
  "@type": "BlogPosting",
  "headline": "${title}",
  "datePublished": "${date}",
  "dateModified": "${date}",
  "author": { "@type": "Organization", "name": "WAIaaS" },
  "publisher": { "@type": "Organization", "name": "WAIaaS" },
  "description": "${description}",
  "mainEntityOfPage": "${canonicalUrl}"
}
```

**TechArticle (technical docs):**
```json
{
  "@type": "TechArticle",
  "headline": "${title}",
  "proficiencyLevel": "Advanced",
  "dependencies": "Node.js 22+",
  "datePublished": "${date}",
  "author": { "@type": "Organization", "name": "WAIaaS" }
}
```

### Existing JSON-LD Enhancement

The current index.html has SoftwareApplication, FAQPage, and HowTo schemas. Enhancements:
- Add `Organization` as `publisher` to SoftwareApplication
- Expand FAQPage from 5 to 10+ Q&A pairs (AEO coverage)
- Add `speakable` property for answer engine discoverability

## AEO-Specific Patterns

### No Additional Libraries Needed

AEO optimization is content structure, not technology. The build script handles:

1. **Question-first headings**: `## What is an AI Wallet?` format in markdown
2. **40-word answer blocks**: First paragraph after H2 is a concise, self-contained answer (AEO best practice per CXL 2026 guide)
3. **Per-page FAQ extraction**: Markdown `## FAQ` sections auto-converted to FAQPage JSON-LD
4. **Entity-centric knowledge graph**: Organization schema with service categories, GitHub/npm sameAs links

### Sitemap Generation

The build script auto-generates `sitemap.xml` by scanning all generated HTML files. No library -- XML string interpolation:

```javascript
const urls = generatedPages.map(p => `
  <url>
    <loc>https://waiaas.ai/${p.path}</loc>
    <lastmod>${p.date}</lastmod>
    <changefreq>${p.type === 'blog' ? 'monthly' : 'weekly'}</changefreq>
    <priority>${p.path === '' ? '1.0' : '0.8'}</priority>
  </url>`).join('');
```

## CSS Strategy

### Shared Stylesheet Extraction

Currently CSS is inline in index.html (~600 lines). Extract to `site/style.css`:
- Shared by index.html and all generated pages
- Add article-specific styles (~100 lines): prose typography, code blocks with highlight.js theme, tables, blockquotes
- Maintain CRT theme (JetBrains Mono, `--bg: #0c0c0c`, `--green: #00ff41`, scanline effect)
- highlight.js `github-dark` theme colors integrated into `style.css` (no separate CSS file load)

**No CSS framework.** The existing custom CSS is small and consistent.

## GitHub Actions Integration

### Pages Workflow Update

Current `pages.yml` deploys `site/` directory directly. Add build step before deploy:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 22
  - name: Install site build dependencies
    run: cd scripts/site-build && npm ci
  - name: Build site (markdown -> HTML)
    run: node scripts/build-site.mjs
  - uses: actions/configure-pages@v5
  - uses: actions/upload-pages-artifact@v3
    with:
      path: site
  - uses: actions/deploy-pages@v4
```

The build script converts markdown to HTML in the `site/` output directory. Source markdown in `docs/`, generated HTML in `site/blog/` and `site/docs/`.

### Build Script Dependencies Package

```json
{
  "private": true,
  "type": "module",
  "dependencies": {
    "marked": "^17.0.4",
    "gray-matter": "^4.0.3",
    "marked-highlight": "^2.2.1",
    "highlight.js": "^11.11.1"
  }
}
```

Place at `scripts/site-build/package.json`. Isolated from monorepo package dependencies (site build tools are unrelated to daemon runtime).

## Installation

```bash
# Create site build package (isolated from monorepo)
mkdir -p scripts/site-build
cd scripts/site-build
npm init -y
npm install marked@^17.0.4 gray-matter@^4.0.3 marked-highlight@^2.2.1 highlight.js@^11.11.1
```

**Total new dependencies: 4 packages** (marked: 0 deps, gray-matter: 4 deps, marked-highlight: 0 deps, highlight.js: 0 deps).

## What NOT to Add

| Technology | Why Not |
|------------|---------|
| React/Preact for content pages | Static content does not need interactivity. Admin UI uses Preact; site pages are pure HTML. |
| Tailwind CSS | Existing custom CSS is small and consistent. Tailwind adds build complexity for marginal benefit on ~20 pages. |
| Any SSG (Hugo/Eleventy/Astro) | A 200-line build script is simpler, faster, no version/plugin compatibility issues. |
| Search library (Pagefind, Lunr) | Premature for ~20 pages. Users can use browser find or site nav. |
| Analytics (GA, Plausible) | Out of scope. Can add later as a single `<script>` tag. |
| RSS feed library | RSS is simple XML template literal interpolation, same as sitemap. No library needed. |
| Image optimizer (sharp) | No user-uploaded images. OG image is a static PNG. |
| HTML minifier | Pages are <50KB each. Minification savings negligible for static content. |
| CMS (Decap, Tina) | Content is markdown in git. No CMS needed. |
| markdown-it plugins ecosystem | Ecosystem complexity not warranted. marked extensions (marked-highlight) are sufficient. |

## Integration Points with Existing Site

| Existing Asset | Integration |
|----------------|-------------|
| `site/index.html` | Untouched. Extract inline CSS to `style.css`, link from both index and templates. |
| `site/sitemap.xml` | Replaced by auto-generated sitemap from build script. |
| `site/robots.txt` | No change needed. Already allows all crawlers. |
| `site/llms.txt` | Update to include links to new blog/docs pages. |
| `site/og-image.png` | Reused as default OG image for all pages. |
| `site/favicon.*` | Shared across all pages via template. |
| `site/CNAME` | No change (waiaas.ai). |
| `site/.well-known/` | No change. |
| `.github/workflows/pages.yml` | Add Node.js setup + build step before deploy. |
| `docs/*.md` (17 files) | Source files. Add YAML front-matter headers. Content unchanged. |

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| marked + gray-matter | HIGH | Verified on npm (v17.0.4 / v4.0.3), stable APIs, zero/minimal deps |
| highlight.js | HIGH | Standard choice, github-dark theme fits CRT aesthetic |
| JSON-LD schemas | HIGH | schema.org types verified (TechArticle, BlogPosting, HowTo, FAQPage, BreadcrumbList) |
| AEO content patterns | MEDIUM | Based on 2026 AEO guides; content structure patterns are evidence-based but effectiveness depends on execution quality |
| Build script approach | HIGH | Matches existing project patterns (generate-og-image.mjs), minimal complexity, proven approach for small static sites |
| GitHub Actions integration | HIGH | Current workflow is simple; adding a build step is straightforward |

## Sources

- [marked npm](https://www.npmjs.com/package/marked) -- v17.0.4, zero dependencies, 11k+ dependents
- [gray-matter npm](https://www.npmjs.com/package/gray-matter) -- v4.0.3, YAML front-matter parser, 3.2k dependents
- [marked-highlight GitHub](https://github.com/markedjs/marked-highlight) -- Official marked syntax highlighting extension
- [highlight.js npm](https://www.npmjs.com/package/highlight.js) -- v11.11.1, build-time syntax highlighting
- [Schema.org TechArticle](https://schema.org/TechArticle) -- Technical article schema type
- [Schema.org SoftwareApplication](https://schema.org/SoftwareApplication) -- Software product schema
- [Google Structured Data Intro](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) -- JSON-LD implementation guide
- [CXL AEO Guide 2026](https://cxl.com/blog/answer-engine-optimization-aeo-the-comprehensive-guide/) -- Answer Engine Optimization best practices
- [Schema Markup for AEO](https://pbjmarketing.com/blog/schema-markup-for-aeo) -- Structured data for answer engines
- [Structured Data in AEO](https://higoodie.com/blog/structured-data-in-aeo) -- Entity-centric knowledge graphs
- [GitHub Pages Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) -- Custom build workflows
- [Schema Markup for SaaS](https://www.datadab.com/blog/schema-markup-for-saas-content-a-technical-guide/) -- SaaS-specific schema patterns
