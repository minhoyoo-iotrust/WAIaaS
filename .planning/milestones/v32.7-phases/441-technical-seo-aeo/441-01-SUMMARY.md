---
phase: 441-technical-seo-aeo
plan: 01
subsystem: seo
tags: [sitemap, json-ld, structured-data, schema-org, breadcrumb]

requires:
  - phase: 440-content-publishing-navigation
    provides: "HTML pages with canonical URLs and build pipeline"
provides:
  - "Auto-generated sitemap.xml with 19 URLs"
  - "JSON-LD Article/TechArticle per page"
  - "BreadcrumbList JSON-LD per page"
  - "CollectionPage JSON-LD for listing pages"
affects: [441-02, 442-ci-integration]

tech-stack:
  added: []
  patterns: ["JSON-LD injection via template placeholder", "sitemap auto-generation from built pages"]

key-files:
  modified:
    - site/build.mjs
    - site/template.html

key-decisions:
  - "JSON-LD injected via {{JSON_LD}} template placeholder, not inline in template"
  - "Article type for blog, TechArticle type for docs section"
  - "Sitemap priority: homepage 1.0, listing 0.8, article 0.6"

patterns-established:
  - "generateJsonLd()/generateListingJsonLd() for structured data generation"
  - "builtPages array collected during build for sitemap generation"

requirements-completed: [TSEO-01, TSEO-02, TSEO-04]

duration: 5min
completed: 2026-03-17
---

# Phase 441 Plan 01: sitemap + JSON-LD Summary

**Auto-generated sitemap.xml (19 URLs) and page-specific JSON-LD structured data (Article/TechArticle/CollectionPage + BreadcrumbList)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-17T07:36:51Z
- **Completed:** 2026-03-17T07:42:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- sitemap.xml auto-generated with 19 URLs (homepage + 2 listing + 16 articles)
- Each blog article has Article + BreadcrumbList JSON-LD
- Each docs article has TechArticle + BreadcrumbList JSON-LD
- Listing pages have CollectionPage + BreadcrumbList JSON-LD
- Canonical URLs in sitemap match page canonical URLs

## Task Commits

1. **Task 1: sitemap.xml + JSON-LD structured data** - `40bacff2` (feat)

## Files Created/Modified
- `site/build.mjs` - Added generateJsonLd(), generateListingJsonLd(), generateSitemap(), builtPages tracking
- `site/template.html` - Added {{JSON_LD}} placeholder before </head>

## Decisions Made
- JSON-LD via template placeholder rather than post-processing for clean separation
- BreadcrumbList on every page (not just articles) for full navigation context
- Sitemap changefreq: homepage/listing weekly, articles monthly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- JSON-LD and sitemap infrastructure ready for Plan 441-02 (FAQ expansion, llms-full.txt)
- Build pipeline unchanged for CI integration (Phase 442)

---
*Phase: 441-technical-seo-aeo*
*Completed: 2026-03-17*
