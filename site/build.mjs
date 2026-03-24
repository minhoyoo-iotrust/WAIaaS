#!/usr/bin/env node

/**
 * WAIaaS Site Build Script
 *
 * Converts docs/*.md files (with front-matter) into HTML pages
 * using the CRT-themed template. Build-time syntax highlighting
 * via highlight.js — no client-side JavaScript needed.
 *
 * Usage: node site/build.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';
import matter from 'gray-matter';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SITE_DIR = path.resolve(__dirname);
const DOCS_DIR = path.resolve(ROOT, 'docs');
const BASE_URL = 'https://waiaas.ai';

// Directories to exclude from build
const EXCLUDE_DIRS = [];

// Required front-matter fields
const REQUIRED_FIELDS = ['title', 'description', 'date'];

// Configure marked with highlight.js (build-time highlighting)
const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
);

marked.setOptions({
  gfm: true,
  breaks: false,
});

/**
 * Read and return the HTML template
 */
function loadTemplate() {
  const templatePath = path.join(SITE_DIR, 'template.html');
  if (!fs.existsSync(templatePath)) {
    console.error(`ERROR: Template not found: ${templatePath}`);
    process.exit(1);
  }
  return fs.readFileSync(templatePath, 'utf8');
}

/**
 * Derive a slug from a filename.
 * Strips numeric prefixes like "001-" and removes .md extension.
 */
function deriveSlug(filename) {
  const base = path.basename(filename, '.md');
  // Remove leading numeric prefix (e.g., "001-", "01-", "1-")
  return base.replace(/^\d+-/, '');
}

/**
 * Determine the output path for a given doc file.
 * Uses clean URL pattern: section/slug/index.html
 */
function getOutputPath(frontmatter, filePath) {
  const section = frontmatter.section || 'docs';
  const slug = frontmatter.slug || deriveSlug(filePath);
  return path.join(SITE_DIR, section, slug, 'index.html');
}

/**
 * Get canonical URL for a page
 */
function getCanonicalUrl(frontmatter, filePath) {
  const section = frontmatter.section || 'docs';
  const slug = frontmatter.slug || deriveSlug(filePath);
  return `${BASE_URL}/${section}/${slug}/`;
}

/**
 * Validate that all required front-matter fields are present.
 * Returns array of missing field names.
 */
function validateFrontmatter(data, filePath) {
  const missing = [];
  for (const field of REQUIRED_FIELDS) {
    if (!data[field]) {
      missing.push(field);
    }
  }
  return missing;
}

/**
 * Generate JSON-LD structured data for an article page.
 * Blog pages get Article type, docs pages get TechArticle type.
 * All article pages also get a BreadcrumbList.
 * @returns {string} One or more <script type="application/ld+json"> blocks
 */
function generateJsonLd(frontmatter, canonicalUrl, section) {
  const dateStr = frontmatter.date instanceof Date
    ? frontmatter.date.toISOString().split('T')[0]
    : String(frontmatter.date);

  const articleType = section === 'blog' ? 'Article' : 'TechArticle';
  const sectionLabel = section === 'blog' ? 'Blog' : 'Docs';
  const sectionUrl = `${BASE_URL}/${section}/`;

  const article = {
    '@context': 'https://schema.org',
    '@type': articleType,
    headline: frontmatter.title,
    description: frontmatter.description,
    datePublished: dateStr,
    url: canonicalUrl,
    author: { '@type': 'Organization', name: 'WAIaaS' },
    publisher: { '@type': 'Organization', name: 'WAIaaS', url: BASE_URL },
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: sectionLabel, item: sectionUrl },
      { '@type': 'ListItem', position: 3, name: frontmatter.title, item: canonicalUrl },
    ],
  };

  return `<script type="application/ld+json">\n${JSON.stringify(article, null, 2)}\n</script>\n`
    + `<script type="application/ld+json">\n${JSON.stringify(breadcrumb, null, 2)}\n</script>`;
}

/**
 * Generate JSON-LD for listing pages (blog/index, docs/index).
 * Uses CollectionPage + BreadcrumbList.
 */
function generateListingJsonLd(section, canonicalUrl) {
  const sectionLabel = section === 'blog' ? 'Blog' : 'Documentation';

  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: sectionLabel,
    description: section === 'blog'
      ? 'Insights on AI agent wallet security, architecture, and integration guides.'
      : 'Technical references for WAIaaS architecture, API, security, and deployment.',
    url: canonicalUrl,
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: sectionLabel, item: canonicalUrl },
    ],
  };

  return `<script type="application/ld+json">\n${JSON.stringify(collection, null, 2)}\n</script>\n`
    + `<script type="application/ld+json">\n${JSON.stringify(breadcrumb, null, 2)}\n</script>`;
}

/**
 * Apply template placeholders with front-matter values and rendered content.
 * @param {string} activeSection - 'blog', 'docs', or '' for no active nav
 * @param {string} jsonLd - JSON-LD script blocks to inject
 */
function applyTemplate(template, frontmatter, htmlContent, canonicalUrl, activeSection = '', jsonLd = '') {
  const title = frontmatter.title;
  const description = frontmatter.description;
  const date = frontmatter.date instanceof Date
    ? frontmatter.date.toISOString().split('T')[0]
    : String(frontmatter.date);
  const ogTitle = frontmatter.og_title || title;
  const ogDescription = frontmatter.og_description || description;

  return template
    .replaceAll('{{TITLE}}', escapeHtml(title))
    .replaceAll('{{DESCRIPTION}}', escapeHtml(description))
    .replaceAll('{{CANONICAL_URL}}', canonicalUrl)
    .replaceAll('{{OG_TITLE}}', escapeHtml(ogTitle))
    .replaceAll('{{OG_DESCRIPTION}}', escapeHtml(ogDescription))
    .replaceAll('{{DATE}}', date)
    .replaceAll('{{CONTENT}}', htmlContent)
    .replaceAll('{{ACTIVE_BLOG}}', activeSection === 'blog' ? 'active' : '')
    .replaceAll('{{ACTIVE_DOCS}}', activeSection === 'docs' ? 'active' : '')
    .replaceAll('{{JSON_LD}}', jsonLd);
}

/**
 * Escape HTML entities for use in attribute values
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Inline CSS for listing pages (not in article.css since these are index pages, not articles)
 */
const LISTING_CSS = `
<style>
  .listing { list-style: none; padding: 0; }
  .listing li { border-bottom: 1px solid var(--border); padding: 16px 0; }
  .listing a { font-size: 1.1rem; color: var(--green); font-weight: 500; }
  .listing time { font-size: 0.8rem; color: var(--text-dim); margin-left: 12px; }
  .listing p { color: var(--text); margin-top: 4px; font-size: 0.85rem; }
  .listing-category { margin-top: 32px; }
  .listing-category h2 { font-size: 1rem; color: var(--cyan); margin-bottom: 8px; }
  .listing-category h2::before { content: "## "; color: var(--text-dim); }
</style>
`;

/**
 * Fetch published articles from Dev.to and generate blog pages.
 * @param {string} template - HTML template
 * @param {Array} blogPages - blog page list to append to
 * @param {Array} builtPages - sitemap page list to append to
 * @returns {Promise<number>} number of posts fetched
 */
async function fetchDevtoBlogPosts(template, blogPages, builtPages) {
  const DEVTO_USERNAME = 'walletguy';
  let articles;
  try {
    const headers = {};
    if (process.env.DEVTO_API_KEY) headers['api-key'] = process.env.DEVTO_API_KEY;
    const res = await fetch(`https://dev.to/api/articles?username=${DEVTO_USERNAME}&per_page=100&state=all`, { headers });
    if (!res.ok) {
      console.warn(`  Dev.to API error: ${res.status}`);
      return 0;
    }
    articles = await res.json();
  } catch (err) {
    console.warn(`  Dev.to fetch failed: ${err.message}`);
    return 0;
  }

  let count = 0;
  for (const article of articles) {
    // Fetch full article with body_markdown
    let full;
    try {
      const res = await fetch(`https://dev.to/api/articles/${article.id}`);
      if (!res.ok) continue;
      full = await res.json();
    } catch {
      continue;
    }

    const slug = article.slug.replace(/-[a-z0-9]{3,4}(-temp-slug-\d+)?$/, '');
    const dateStr = article.published_at
      ? article.published_at.split('T')[0]
      : new Date().toISOString().split('T')[0];
    const description = article.description || '';
    const bodyMarkdown = full.body_markdown || '';

    // Skip if no content
    if (!bodyMarkdown.trim()) continue;

    // Check if a local blog post with the same slug already exists (local takes priority)
    const localPath = path.join(SITE_DIR, 'blog', slug, 'index.html');
    if (fs.existsSync(localPath)) {
      console.log(`  Skipped (local exists): ${slug}`);
      continue;
    }

    // Convert markdown to HTML
    const htmlContent = await marked.parse(bodyMarkdown);

    const frontmatter = {
      title: article.title,
      description,
      date: dateStr,
      og_title: article.title,
      og_description: description,
    };

    const canonicalUrl = `${BASE_URL}/blog/${slug}/`;
    const jsonLd = generateJsonLd(frontmatter, canonicalUrl, 'blog');
    const finalHtml = applyTemplate(template, frontmatter, htmlContent, canonicalUrl, 'blog', jsonLd);

    const outputPath = path.join(SITE_DIR, 'blog', slug, 'index.html');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, finalHtml, 'utf8');

    blogPages.push({
      title: article.title,
      description,
      date: dateStr,
      slug,
      category: 'Dev.to',
    });

    builtPages.push({ url: canonicalUrl, lastmod: dateStr, section: 'blog' });

    console.log(`  blog/${slug}/index.html (dev.to)`);
    count++;
  }

  return count;
}

/**
 * Generate a listing page (blog index or docs index)
 * @param {'blog'|'docs'} section
 * @param {Array} pages - front-matter objects with title, description, date, slug, category
 * @param {string} template - HTML template
 */
function generateListingPage(section, pages, template) {
  let listHtml = LISTING_CSS;

  if (section === 'blog') {
    // Blog: sorted by date descending
    const sorted = [...pages].sort((a, b) => {
      const da = new Date(a.date);
      const db = new Date(b.date);
      return db - da;
    });
    listHtml += '<ul class="listing">\n';
    for (const p of sorted) {
      const dateStr = p.date instanceof Date ? p.date.toISOString().split('T')[0] : String(p.date);
      listHtml += `  <li>\n`;
      listHtml += `    <a href="/blog/${p.slug}/">${escapeHtml(p.title)}</a>\n`;
      listHtml += `    <time>${dateStr}</time>\n`;
      listHtml += `    <p>${escapeHtml(p.description)}</p>\n`;
      listHtml += `  </li>\n`;
    }
    listHtml += '</ul>\n';

    const frontmatter = {
      title: 'Blog',
      description: 'Insights on AI agent wallet security, architecture, and integration guides.',
      date: '',
    };
    const canonicalUrl = `${BASE_URL}/blog/`;
    const listingJsonLd = generateListingJsonLd('blog', canonicalUrl);
    const html = applyTemplate(template, frontmatter, listHtml, canonicalUrl, 'blog', listingJsonLd);
    // Remove the date line for listing pages
    const finalHtml = html.replace(/<div class="article-meta"><\/div>\n?/, '');

    const outputPath = path.join(SITE_DIR, 'blog', 'index.html');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, finalHtml, 'utf8');
    console.log('  blog/index.html (listing)');
  } else {
    // Docs: grouped by category
    const byCategory = {};
    for (const p of pages) {
      const cat = p.category || 'General';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(p);
    }
    // Sort each category's pages by title
    for (const cat of Object.keys(byCategory)) {
      byCategory[cat].sort((a, b) => a.title.localeCompare(b.title));
    }

    for (const [cat, items] of Object.entries(byCategory)) {
      listHtml += `<div class="listing-category">\n`;
      listHtml += `  <h2>${escapeHtml(cat)}</h2>\n`;
      listHtml += '  <ul class="listing">\n';
      for (const p of items) {
        listHtml += `    <li>\n`;
        listHtml += `      <a href="/docs/${p.slug}/">${escapeHtml(p.title)}</a>\n`;
        listHtml += `      <p>${escapeHtml(p.description)}</p>\n`;
        listHtml += `    </li>\n`;
      }
      listHtml += '  </ul>\n';
      listHtml += '</div>\n';
    }

    const frontmatter = {
      title: 'Documentation',
      description: 'Technical references for WAIaaS architecture, API, security, and deployment.',
      date: '',
    };
    const canonicalUrl = `${BASE_URL}/docs/`;
    const listingJsonLd = generateListingJsonLd('docs', canonicalUrl);
    const html = applyTemplate(template, frontmatter, listHtml, canonicalUrl, 'docs', listingJsonLd);
    const finalHtml = html.replace(/<div class="article-meta"><\/div>\n?/, '');

    const outputPath = path.join(SITE_DIR, 'docs', 'index.html');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, finalHtml, 'utf8');
    console.log('  docs/index.html (listing)');
  }
}

/**
 * Check if a file is in an excluded directory
 */
function isExcluded(filePath) {
  const relative = path.relative(DOCS_DIR, filePath);
  const parts = relative.split(path.sep);
  return parts.some((part) => EXCLUDE_DIRS.includes(part));
}

/**
 * Main build function
 */
async function build() {
  console.log('Building WAIaaS site...\n');

  const template = loadTemplate();

  // Glob all markdown files under docs/
  const files = [];
  for await (const entry of glob(path.join(DOCS_DIR, '**/*.md'))) {
    files.push(entry);
  }

  if (files.length === 0) {
    console.log('No markdown files found in docs/');
    return;
  }

  // Filter excluded directories
  const eligibleFiles = files.filter((f) => !isExcluded(f));

  // Phase 1: Validate all files first (fail fast)
  const errors = [];
  for (const filePath of eligibleFiles) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const { data } = matter(raw);
    const missing = validateFrontmatter(data, filePath);
    if (missing.length > 0) {
      const relative = path.relative(ROOT, filePath);
      errors.push(`  ${relative}: missing [${missing.join(', ')}]`);
    }
  }

  if (errors.length > 0) {
    console.error('ERROR: Front-matter validation failed:\n');
    for (const err of errors) {
      console.error(err);
    }
    console.error(`\nRequired fields: ${REQUIRED_FIELDS.join(', ')}`);
    process.exit(1);
  }

  // Phase 2: Build all pages and collect front-matter for listing pages
  let blogCount = 0;
  let docsCount = 0;
  const blogPages = [];
  const docsPages = [];
  const builtPages = []; // For sitemap generation

  for (const filePath of eligibleFiles) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const { data, content } = matter(raw);

    // Strip leading H1 from markdown (template already renders the title)
    const strippedContent = content.replace(/^\s*#\s+.+\n*/, '');

    // Convert markdown to HTML
    const htmlContent = await marked.parse(strippedContent);

    // Determine output path
    const outputPath = getOutputPath(data, filePath);
    const canonicalUrl = getCanonicalUrl(data, filePath);

    const section = data.section || 'docs';
    const slug = data.slug || deriveSlug(filePath);

    // Collect page data for listing pages
    const pageInfo = {
      title: data.title,
      description: data.description,
      date: data.date,
      slug,
      category: data.category || 'General',
    };

    // Generate JSON-LD for this article page
    const jsonLd = generateJsonLd(data, canonicalUrl, section);

    // Apply template with active section and JSON-LD
    const finalHtml = applyTemplate(template, data, htmlContent, canonicalUrl, section, jsonLd);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    // Write output
    fs.writeFileSync(outputPath, finalHtml, 'utf8');

    // Track for sitemap
    const dateStr = data.date instanceof Date
      ? data.date.toISOString().split('T')[0]
      : String(data.date);
    builtPages.push({ url: canonicalUrl, lastmod: dateStr, section });

    if (section === 'blog') {
      blogCount++;
      blogPages.push(pageInfo);
    } else {
      docsCount++;
      docsPages.push(pageInfo);
    }

    const relative = path.relative(SITE_DIR, outputPath);
    console.log(`  ${relative}`);
  }

  const total = blogCount + docsCount;
  console.log(`\nBuilt ${total} pages (${blogCount} blog, ${docsCount} docs)`);

  // Phase 2a: Fetch Dev.to blog posts
  console.log('\nFetching Dev.to blog posts...');
  const devtoPosts = await fetchDevtoBlogPosts(template, blogPages, builtPages);
  blogCount += devtoPosts;
  console.log(`  Fetched ${devtoPosts} posts from Dev.to`);

  // Phase 2b: Generate listing pages
  console.log('\nGenerating listing pages...');
  if (blogPages.length > 0) {
    generateListingPage('blog', blogPages, template);
  }
  if (docsPages.length > 0) {
    generateListingPage('docs', docsPages, template);
  }

  // Count blog categories
  const whyCount = blogPages.filter(p => p.category === 'Why WAIaaS').length;
  const guidesCount = blogPages.filter(p => p.category === 'Guides').length;
  console.log(`\nContent stats:`);
  console.log(`  Blog: ${blogCount} articles (Why WAIaaS: ${whyCount}, Guides: ${guidesCount})`);
  console.log(`  Docs: ${docsCount} articles`);
  console.log(`  Listing pages: 2 (blog, docs)`);

  // Phase 2c: Generate llms-full.txt and sitemap.xml
  console.log('\nGenerating llms-full.txt...');
  generateLlmsFullTxt(eligibleFiles);
  generateSitemap(builtPages);

  // Phase 3: Link Validation
  console.log('\nValidating internal links...');
  const brokenLinks = validateInternalLinks();
  console.log(`  Internal links: ${brokenLinks.total} checked, ${brokenLinks.broken} broken`);

  if (brokenLinks.broken > 0) {
    console.error('\nERROR: Broken internal links found:');
    for (const item of brokenLinks.details) {
      console.error(`  ${item.source} -> ${item.href}`);
    }
    process.exit(1);
  }
}

/**
 * Generate llms-full.txt containing all article content for LLM consumption.
 * Blog articles first (date descending), then docs articles (title alphabetical).
 * @param {Array<string>} eligibleFiles - All markdown file paths
 */
function generateLlmsFullTxt(eligibleFiles) {
  const blogEntries = [];
  const docsEntries = [];

  for (const filePath of eligibleFiles) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const { data, content } = matter(raw);
    const canonicalUrl = getCanonicalUrl(data, filePath);
    const section = data.section || 'docs';
    const dateStr = data.date instanceof Date
      ? data.date.toISOString().split('T')[0]
      : String(data.date);

    const entry = { title: data.title, url: canonicalUrl, content: content.trim(), date: dateStr };

    if (section === 'blog') {
      blogEntries.push(entry);
    } else {
      docsEntries.push(entry);
    }
  }

  // Sort: blog by date descending, docs by title alphabetical
  blogEntries.sort((a, b) => b.date.localeCompare(a.date));
  docsEntries.sort((a, b) => a.title.localeCompare(b.title));

  let output = '# WAIaaS — Wallet-as-a-Service for AI Agents\n';
  output += '> Full content for LLM consumption. See also: llms.txt (summary version)\n';
  output += `> Source: ${BASE_URL}\n\n`;

  const allEntries = [...blogEntries, ...docsEntries];
  for (const entry of allEntries) {
    output += '---\n';
    output += `# ${entry.title}\n`;
    output += `URL: ${entry.url}\n\n`;
    output += `${entry.content}\n\n`;
  }

  const outputPath = path.join(SITE_DIR, 'llms-full.txt');
  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(`Generated llms-full.txt (${allEntries.length} articles, ${Math.round(output.length / 1024)}KB)`);
}

/**
 * Generate sitemap.xml from built pages.
 * @param {Array<{url: string, lastmod: string, section: string}>} pages
 */
function generateSitemap(pages) {
  const today = new Date().toISOString().split('T')[0];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // Homepage
  xml += '  <url>\n';
  xml += `    <loc>${BASE_URL}/</loc>\n`;
  xml += `    <lastmod>${today}</lastmod>\n`;
  xml += '    <changefreq>weekly</changefreq>\n';
  xml += '    <priority>1.0</priority>\n';
  xml += '  </url>\n';

  // Listing pages
  for (const section of ['blog', 'docs']) {
    xml += '  <url>\n';
    xml += `    <loc>${BASE_URL}/${section}/</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += '    <changefreq>weekly</changefreq>\n';
    xml += '    <priority>0.8</priority>\n';
    xml += '  </url>\n';
  }

  // Article pages
  for (const page of pages) {
    xml += '  <url>\n';
    xml += `    <loc>${page.url}</loc>\n`;
    xml += `    <lastmod>${page.lastmod || today}</lastmod>\n`;
    xml += '    <changefreq>monthly</changefreq>\n';
    xml += '    <priority>0.6</priority>\n';
    xml += '  </url>\n';
  }

  xml += '</urlset>\n';

  const outputPath = path.join(SITE_DIR, 'sitemap.xml');
  fs.writeFileSync(outputPath, xml, 'utf8');
  console.log(`\nGenerated sitemap.xml (${pages.length + 3} URLs)`);
}

/**
 * Validate all internal links in generated HTML files.
 * Checks that href="/..." paths resolve to actual files under site/.
 */
function validateInternalLinks() {
  const htmlFiles = [];
  collectHtmlFiles(SITE_DIR, htmlFiles);

  const hrefRegex = /href="(\/[^"#]*)"/g;
  let total = 0;
  let broken = 0;
  const details = [];

  for (const htmlPath of htmlFiles) {
    const content = fs.readFileSync(htmlPath, 'utf8');
    const relative = path.relative(SITE_DIR, htmlPath);
    let match;
    while ((match = hrefRegex.exec(content)) !== null) {
      const href = match[1];

      // Skip external protocol links that happen to start with /
      if (href.startsWith('//')) continue;

      total++;

      // Determine expected file path
      let expectedPath;
      if (href.endsWith('/')) {
        // Directory URL -> check for index.html
        expectedPath = path.join(SITE_DIR, href, 'index.html');
      } else {
        // Static file (e.g., /article.css, /favicon.svg)
        expectedPath = path.join(SITE_DIR, href);
      }

      if (!fs.existsSync(expectedPath)) {
        broken++;
        details.push({ source: relative, href });
      }
    }
  }

  return { total, broken, details };
}

/**
 * Recursively collect all index.html files under a directory
 */
function collectHtmlFiles(dir, result) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectHtmlFiles(full, result);
    } else if (entry.name === 'index.html') {
      result.push(full);
    }
  }
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
