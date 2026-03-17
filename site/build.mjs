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
const EXCLUDE_DIRS = ['admin-manual'];

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
 * Apply template placeholders with front-matter values and rendered content.
 * @param {string} activeSection - 'blog', 'docs', or '' for no active nav
 */
function applyTemplate(template, frontmatter, htmlContent, canonicalUrl, activeSection = '') {
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
    .replaceAll('{{ACTIVE_DOCS}}', activeSection === 'docs' ? 'active' : '');
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
    const html = applyTemplate(template, frontmatter, listHtml, canonicalUrl, 'blog');
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
    const html = applyTemplate(template, frontmatter, listHtml, canonicalUrl, 'docs');
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

  for (const filePath of eligibleFiles) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const { data, content } = matter(raw);

    // Convert markdown to HTML
    const htmlContent = await marked.parse(content);

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

    // Apply template with active section
    const finalHtml = applyTemplate(template, data, htmlContent, canonicalUrl, section);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    // Write output
    fs.writeFileSync(outputPath, finalHtml, 'utf8');

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
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
