# Architecture Patterns

**Domain:** SEO/AEO optimization for existing static site (waiaas.ai)
**Researched:** 2026-03-17

## Current Architecture Snapshot

### What Exists

| Asset | Location | Purpose | Lines |
|-------|----------|---------|-------|
| Landing page | `site/index.html` | Single monolithic HTML (CRT terminal theme) | 1,109 |
| OG image template | `site/og-template.html` | Puppeteer-rendered Open Graph image | 167 |
| OG image generator | `site/generate-og-image.mjs` | Node.js script to render og-template | - |
| Favicons | `site/favicon.*`, `apple-touch-icon.png` | Multiple formats | - |
| robots.txt | `site/robots.txt` | Basic Allow: / + sitemap | 4 |
| sitemap.xml | `site/sitemap.xml` | Single URL entry (homepage only) | 10 |
| llms.txt | `site/llms.txt` | AEO: LLM-readable site summary | 64 |
| ai-plugin.json | `site/.well-known/ai-plugin.json` | OpenAI plugin manifest (AEO) | 17 |
| CNAME | `site/CNAME` | waiaas.ai custom domain | 1 |
| GitHub Actions | `.github/workflows/pages.yml` | Deploy `site/` to GitHub Pages on push to main | 38 |
| Docs (markdown) | `docs/` | 10+ markdown files, 4 "Why WAIaaS" articles, 5 guides | - |

### What Does NOT Exist

- No build step (pure static HTML, no preprocessing)
- No template system (everything is inline in index.html)
- No multi-page routing (single page only)
- No llms-full.txt (only llms.txt summary)
- No blog/article pages on the site (articles exist only as GitHub markdown)
- No per-page OG images (single shared og-image.png)
- No structured data beyond homepage JSON-LD

### Current SEO State (Already Good)

The homepage already has solid SEO foundations:
- `<title>`, `<meta description>`, `<meta keywords>`
- Open Graph + Twitter Card meta tags
- JSON-LD: SoftwareApplication, FAQPage, HowTo schemas
- Canonical URL
- Mobile responsive CSS

## Recommended Architecture

### Design Principle: Minimal Build, Maximum Output

The existing pure-HTML approach is a strength, not a weakness. GitHub Pages requires no server-side rendering. The goal is to add a **thin build layer** that:
1. Converts `docs/` markdown into themed HTML pages
2. Generates sitemap, llms-full.txt, and per-page meta automatically
3. Outputs everything into `site/` for the existing deploy pipeline

**Do NOT adopt a full SSG framework** (Jekyll, Hugo, 11ty). The project has 10-15 content pages total, not hundreds. A custom Node.js build script (< 300 lines) keeps full control and zero framework lock-in.

### Component Boundaries

| Component | Responsibility | New/Modified |
|-----------|---------------|--------------|
| `site/index.html` | Landing page (unchanged) | **Unchanged** |
| `site/build.mjs` | Build script: md-to-HTML, sitemap, llms-full.txt | **New** |
| `site/_template.html` | HTML shell template for content pages | **New** |
| `docs/**/*.md` | Source content (unchanged) | **Unchanged** |
| `site/docs/**/*.html` | Generated HTML pages from docs/ markdown | **New (generated)** |
| `site/blog/**/*.html` | Generated HTML pages from docs/why-waiaas/ | **New (generated)** |
| `site/sitemap.xml` | Auto-generated sitemap (all pages) | **Modified (generated)** |
| `site/llms.txt` | LLM summary (auto-generated) | **Modified (generated)** |
| `site/llms-full.txt` | Full content dump for AI crawlers | **New (generated)** |
| `site/robots.txt` | Add llms-full.txt reference | **Modified** |
| `.github/workflows/pages.yml` | Add build step before deploy | **Modified** |

### Directory Structure (After Build)

```
site/
  index.html                          # Landing page (hand-crafted, unchanged)
  _template.html                      # HTML shell for generated pages (not deployed itself)
  build.mjs                           # Build script (not deployed)
  package.json                        # Build dependencies (marked, gray-matter)

  # Generated content pages
  docs/
    architecture/index.html           # From docs/architecture.md
    security-model/index.html         # From docs/security-model.md
    deployment/index.html             # From docs/deployment.md
    api-reference/index.html          # From docs/api-reference.md
    wallet-sdk-integration/index.html # From docs/wallet-sdk-integration.md
    smart-account-lite-full-guide/index.html
    erc-4337-sponsor-proxy-spec/index.html
    guides/
      claude-code-integration/index.html
      openclaw-integration/index.html
      agent-skills-integration/index.html
      agent-self-setup/index.html
      docker-sidecar-install/index.html

  blog/
    ai-agent-wallet-security-crisis/index.html     # From docs/why-waiaas/001-*
    ai-agent-wallet-models-compared/index.html     # From docs/why-waiaas/002-*
    autonomous-agents-deserve-secure-wallets/index.html  # From docs/why-waiaas/003-*
    self-custody-means-self-hosting/index.html     # From docs/why-waiaas/004-*

  # SEO/AEO assets (generated)
  sitemap.xml                         # All URLs
  llms.txt                            # Summary for LLMs
  llms-full.txt                       # Full content for AI crawlers
  robots.txt                          # Updated with llms-full.txt

  # Existing assets (unchanged)
  og-image.png
  og-template.html
  generate-og-image.mjs
  favicon.svg, favicon-16.png, favicon-32.png, apple-touch-icon.png
  CNAME
  .well-known/ai-plugin.json
```

### URL Routing Strategy

GitHub Pages serves `dir/index.html` as `dir/`. Use the **directory/index.html pattern** for clean URLs:

| Source File | Output File | Public URL |
|-------------|-------------|------------|
| `docs/architecture.md` | `site/docs/architecture/index.html` | `https://waiaas.ai/docs/architecture/` |
| `docs/why-waiaas/001-*.md` | `site/blog/ai-agent-wallet-security-crisis/index.html` | `https://waiaas.ai/blog/ai-agent-wallet-security-crisis/` |
| `docs/guides/claude-code-integration.md` | `site/docs/guides/claude-code-integration/index.html` | `https://waiaas.ai/docs/guides/claude-code-integration/` |

This works natively on GitHub Pages without any redirect hacks. GitHub Pages automatically resolves `/docs/architecture/` to `/docs/architecture/index.html`.

## Data Flow

### Build Pipeline

```
docs/**/*.md
    |
    v
[build.mjs] ---- reads ---- site/_template.html
    |
    |-- parse frontmatter (gray-matter)
    |-- convert markdown to HTML (marked + highlight.js)
    |-- inject into template (title, description, canonical, OG, JSON-LD)
    |-- write site/docs/**/index.html or site/blog/**/index.html
    |
    |-- generate site/sitemap.xml (all URLs + lastmod from git)
    |-- generate site/llms-full.txt (concatenated markdown content)
    +-- generate site/llms.txt (summary with links to all pages)
```

### Build Script Design (`site/build.mjs`)

Single ESM script, ~200-300 lines. Dependencies: `marked`, `gray-matter`, `highlight.js`.

```javascript
// Pseudocode for build.mjs
import { marked } from 'marked';
import matter from 'gray-matter';
import hljs from 'highlight.js';

// 1. Read template
const template = readFile('site/_template.html');

// 2. Discover source markdown files
const contentMap = [
  { src: 'docs/*.md', dest: 'site/docs/', urlBase: '/docs/' },
  { src: 'docs/guides/*.md', dest: 'site/docs/guides/', urlBase: '/docs/guides/' },
  { src: 'docs/why-waiaas/*.md', dest: 'site/blog/', urlBase: '/blog/' },
];

// 3. For each file: parse frontmatter, render HTML, inject into template
// 4. Generate sitemap.xml from all output URLs
// 5. Generate llms-full.txt from all markdown content
// 6. Generate llms.txt summary with links
```

### Template Design (`site/_template.html`)

The template must match the existing CRT terminal dark theme from `index.html`. Key design decisions:

- Same CSS variables (`--bg`, `--surface`, `--border`, `--green`, `--cyan`, etc.)
- Same JetBrains Mono font
- Same nav structure (logo + links)
- Same scanline CRT overlay effect
- Same footer

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}} -- WAIaaS</title>
  <meta name="description" content="{{description}}">
  <link rel="canonical" href="https://waiaas.ai{{path}}">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="{{title}}">
  <meta property="og:description" content="{{description}}">
  <meta property="og:url" content="https://waiaas.ai{{path}}">
  <meta property="og:image" content="https://waiaas.ai/og-image.png">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{{title}}">
  <meta name="twitter:description" content="{{description}}">

  <!-- JSON-LD -->
  <script type="application/ld+json">
  {{jsonLd}}
  </script>

  <!-- Inline styles matching index.html CRT theme -->
  <style>
    /* Same CSS variables and base styles as index.html */
    /* Article-specific styles for rendered markdown */
  </style>
</head>
<body>
  <nav><!-- Same nav as index.html --></nav>
  <article class="content-page">
    <div class="container">
      <div class="breadcrumb">{{breadcrumb}}</div>
      <h1>{{title}}</h1>
      <div class="article-body">
        {{content}}
      </div>
    </div>
  </article>
  <footer><!-- Same footer as index.html --></footer>
</body>
</html>
```

Placeholder substitution uses simple `{{variable}}` string replacement -- no templating engine needed.

### Markdown Frontmatter Convention

Add YAML frontmatter to each markdown file in `docs/`:

```yaml
---
title: "Architecture Overview"
description: "WAIaaS system architecture: 6-stage pipeline, chain adapters, policy engine"
category: docs          # docs | blog | guide
date: 2026-02-25
---
```

For files without frontmatter (backward compat), the build script extracts:
- **title**: First `# heading` in the markdown
- **description**: First paragraph (truncated to 160 chars)
- **date**: Git last-modified date via `git log -1 --format=%aI -- <file>`

## Patterns to Follow

### Pattern 1: Generated vs Hand-Crafted Separation

**What:** `index.html` remains hand-crafted. All other HTML pages are generated from markdown.
**When:** Always.
**Why:** The landing page has unique layout (hero, feature grid, architecture diagram, tabbed content). Content pages share a common article layout. Mixing hand-crafted and generated pages in the same directory is fine as long as `.gitignore` excludes generated directories.

**Rule:** Never edit generated files in `site/docs/` or `site/blog/`. Edit the source `docs/*.md` instead.

### Pattern 2: Additive Sitemap Generation

**What:** Build script generates sitemap.xml with all pages, including hand-crafted index.html.
**When:** Every build.
**Why:** Sitemap must stay in sync with actual pages. Manual sitemap maintenance is error-prone. The current sitemap has only 1 URL -- it should have 15+.

### Pattern 3: JSON-LD Per Page Type

**What:** Each page gets appropriate Schema.org type injected by the build script.
**When:** Template rendering.

| Page Type | Schema.org Type | Key Properties |
|-----------|----------------|----------------|
| Landing | SoftwareApplication + FAQPage + HowTo | (existing, unchanged) |
| Docs | TechArticle | headline, author, datePublished, publisher |
| Blog | Article | headline, author, datePublished, description |
| Guide | HowTo | name, step[], totalTime |

### Pattern 4: llms-full.txt as Content Index

**What:** Single markdown file concatenating all page content with clear section delimiters.
**When:** Generated during build.
**Format:**

```markdown
# WAIaaS Documentation - Full Content

## Architecture Overview
[full content of docs/architecture.md]

---

## Security Model
[full content of docs/security-model.md]

---
[etc.]
```

This allows AI crawlers to fetch all site content in a single request instead of crawling individual pages. Studies show llms-full.txt can increase AI crawl rates by 5-10x.

### Pattern 5: Blog URL Slug from Filename

**What:** Strip numeric prefix and extension from Why WAIaaS filenames for clean blog URLs.
**When:** URL generation for blog posts.
**Example:** `001-ai-agent-wallet-security-crisis.md` becomes `/blog/ai-agent-wallet-security-crisis/`

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adopting a Full SSG Framework

**What:** Using Hugo, Jekyll, 11ty, or Astro for 15 pages.
**Why bad:** Adds massive dependency surface, framework-specific config, build complexity, and upgrade burden. The existing hand-crafted index.html would need to be ported into the framework's template system, breaking the current simple deploy.
**Instead:** Single build script (~300 lines) with 3 npm dependencies (`marked`, `gray-matter`, `highlight.js`).

### Anti-Pattern 2: SPA-Style Client-Side Routing

**What:** Using JavaScript to load content dynamically (hash routing, history API).
**Why bad:** Search engines and AI crawlers need real HTML at each URL. Client-side rendering defeats SEO/AEO purpose entirely.
**Instead:** Static HTML files at each URL path (directory/index.html pattern).

### Anti-Pattern 3: Extracting CSS from index.html Prematurely

**What:** Splitting index.html's inline styles into a separate CSS file to share with template.
**Why bad:** index.html works perfectly as-is. Changing it introduces risk to the production landing page. The template needs different styles anyway (article layout vs landing page layout).
**Instead:** The template includes its own inline styles. Common CSS variables (colors, fonts) are duplicated between index.html and _template.html. This is intentional -- 15 CSS variables duplicated across 2 files is simpler than a shared CSS file with import coordination.

### Anti-Pattern 4: Dynamic Sitemap/llms.txt (Runtime Generation)

**What:** Generating sitemap.xml or llms-full.txt at request time.
**Why bad:** GitHub Pages is static. There is no runtime. Everything must be pre-generated at build time.
**Instead:** Build step generates all files. CI deploys the complete output.

### Anti-Pattern 5: Duplicating Content in index.html and docs/

**What:** Copying FAQ answers, feature descriptions, or quickstart steps into separate markdown files.
**Why bad:** Content drift between landing page and docs.
**Instead:** Keep landing page self-contained. Docs pages go deeper on specific topics. Cross-link between them.

## Integration Points with Existing Architecture

### 1. GitHub Actions Pipeline (Modified)

Current `pages.yml` deploys `site/` directly with no build step. Add Node.js build:

```yaml
jobs:
  deploy:
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0          # Need git history for lastmod dates

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Build site
        working-directory: site
        run: |
          npm ci
          node build.mjs

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: site

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

**Key changes:**
- `fetch-depth: 0` -- required to get git log dates for sitemap `<lastmod>`
- Node.js setup + `npm ci` + `node build.mjs` -- the actual build step

### 2. pages.yml Trigger Paths (Modified)

Current trigger: `paths: ['site/**']`. Must add `docs/**` since doc changes should trigger site rebuilds:

```yaml
on:
  push:
    branches: [main]
    paths: ['site/**', 'docs/**']
```

### 3. Generated Files Strategy

Generated HTML pages are built in CI only, not committed to the repo. Add to `.gitignore`:

```
site/node_modules/
site/docs/
site/blog/
```

This keeps the repo clean. The `site/index.html` (hand-crafted) and `docs/*.md` (source) are committed. Generated output exists only in the GitHub Pages artifact.

**Note:** `site/sitemap.xml`, `site/llms.txt`, and `site/llms-full.txt` are also generated by the build script, so they should also be gitignored. But this changes the current behavior where `sitemap.xml` and `llms.txt` are committed. The transition requires deleting the committed versions and adding them to `.gitignore`.

### 4. Existing llms.txt (Replaced by Generated)

Current `llms.txt` is hand-written (64 lines). The build script will auto-generate both:
- `llms.txt` -- summary with links to all pages
- `llms-full.txt` -- full content concatenated

The hand-written content serves as the template for the generated version.

### 5. Existing JSON-LD on index.html (Unchanged)

The landing page already has 3 JSON-LD blocks (SoftwareApplication, FAQPage, HowTo). These remain untouched. Content pages get their own JSON-LD injected by the template.

### 6. Navigation Links (One Change to index.html)

The landing page nav currently links to GitHub for docs:

```html
<a href="https://github.com/minhoyoo-iotrust/WAIaaS/blob/main/docs/deployment.md">Docs</a>
```

After build, this should link to the on-site docs:

```html
<a href="/docs/">Docs</a>
```

This is the **only change** to `index.html`: updating the Docs nav link. This also requires a docs index page (`site/docs/index.html`) with a table of contents listing all documentation.

### 7. robots.txt (Modified)

Add llms-full.txt reference:

```
User-agent: *
Allow: /

Sitemap: https://waiaas.ai/sitemap.xml
```

No changes needed to robots.txt itself -- the sitemap already points crawlers to all pages. But adding a direct reference to llms-full.txt in llms.txt is important for AI crawlers that look for it.

## Scalability Considerations

| Concern | At 15 pages (now) | At 50 pages | At 200+ pages |
|---------|-------------------|-------------|---------------|
| Build time | < 1s | < 2s | Consider caching, still < 5s |
| Build script | Single file ~300 LOC | Same file, still manageable | Consider splitting into modules |
| Template | Single `_template.html` | May need doc vs blog variants | Add layout selection in frontmatter |
| Navigation | Manual nav links | Auto-generated docs sidebar | Auto-generated from file tree |
| sitemap.xml | Single flat file | Single flat file | Consider sitemap index |
| llms-full.txt | Single file ~100KB | Single file ~250KB | Consider splitting by section |

At the current scale (15 pages), the minimal build script is the right choice. If the site grows beyond 50 pages, evaluate 11ty (which has the lightest footprint among established SSGs and can incrementally adopt).

## Build Order (Implementation Phases)

Based on dependency analysis, the recommended build order:

### Phase 1: Build Infrastructure (no content changes)
1. Create `site/package.json` with build dependencies (`marked`, `gray-matter`, `highlight.js`)
2. Create `site/_template.html` (content page shell, CRT theme matching index.html)
3. Create `site/build.mjs` (markdown-to-HTML core, sitemap generation, llms-full.txt generation)
4. Test locally: verify one doc renders correctly with `node build.mjs`

**Dependencies:** None. Can start immediately.

### Phase 2: Content Pages
5. Add frontmatter to `docs/*.md` files (title, description -- non-breaking addition)
6. Generate all doc pages (`site/docs/**`)
7. Generate blog pages from Why WAIaaS articles (`site/blog/**`)
8. Create docs index page (`site/docs/index.html`) with table of contents
9. Create blog index page (`site/blog/index.html`) with article list
10. Verify clean URLs work locally

**Dependencies:** Phase 1 complete.

### Phase 3: SEO/AEO Assets
11. Auto-generate `sitemap.xml` (all URLs + lastmod from git)
12. Auto-generate `llms-full.txt` (concatenated markdown)
13. Auto-generate `llms.txt` (summary with links)
14. Per-page JSON-LD (TechArticle/Article schemas)
15. BreadcrumbList JSON-LD for content pages

**Dependencies:** Phase 2 complete (needs page list for sitemap).

### Phase 4: CI Integration + Go-Live
16. Update `.github/workflows/pages.yml` (add build step, fetch-depth, trigger paths)
17. Update `index.html` nav Docs link to `/docs/`
18. Add `.gitignore` entries for generated files
19. Remove committed `sitemap.xml` and `llms.txt` (replaced by generated versions)
20. End-to-end test: push to branch, verify Pages deployment

**Dependencies:** Phases 1-3 complete.

### Phase ordering rationale:
- Phase 1 before Phase 2: template and build script must exist before content can be generated
- Phase 2 before Phase 3: SEO assets (sitemap, llms) need the full page list
- Phase 3 before Phase 4: all generated content must be verified before CI deployment
- Phase 4 last: the "go-live" phase that modifies production pipeline

## Sources

- [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) - HIGH confidence
- [GitHub Pages clean URLs (directory/index.html)](https://rsp.github.io/gh-pages-no-extension/) - HIGH confidence
- [llms.txt specification](https://llmstxt.org/) - HIGH confidence (official spec)
- [llms-full.txt guide](https://aioseo.com/what-is-llms-full-txt/) - MEDIUM confidence
- [AEO Complete Guide 2026](https://llmrefs.com/answer-engine-optimization) - MEDIUM confidence
- [marked.js documentation](https://marked.js.org/) - HIGH confidence
- [Schema.org TechArticle](https://schema.org/TechArticle) - HIGH confidence
- Existing codebase analysis: `site/index.html`, `site/llms.txt`, `site/sitemap.xml`, `.github/workflows/pages.yml` - HIGH confidence (direct inspection)
