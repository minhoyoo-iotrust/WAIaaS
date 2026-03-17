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
 */
function applyTemplate(template, frontmatter, htmlContent, canonicalUrl) {
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
    .replaceAll('{{CONTENT}}', htmlContent);
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

  // Phase 2: Build all pages
  let blogCount = 0;
  let docsCount = 0;

  for (const filePath of eligibleFiles) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const { data, content } = matter(raw);

    // Convert markdown to HTML
    const htmlContent = await marked.parse(content);

    // Determine output path
    const outputPath = getOutputPath(data, filePath);
    const canonicalUrl = getCanonicalUrl(data, filePath);

    // Apply template
    const finalHtml = applyTemplate(template, data, htmlContent, canonicalUrl);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    // Write output
    fs.writeFileSync(outputPath, finalHtml, 'utf8');

    const section = data.section || 'docs';
    if (section === 'blog') {
      blogCount++;
    } else {
      docsCount++;
    }

    const relative = path.relative(SITE_DIR, outputPath);
    console.log(`  ${relative}`);
  }

  const total = blogCount + docsCount;
  console.log(`\nBuilt ${total} pages (${blogCount} blog, ${docsCount} docs)`);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
