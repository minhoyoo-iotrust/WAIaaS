#!/usr/bin/env tsx
/**
 * Admin UI Route Consistency Verification
 *
 * Verifies consistency between NAV_ITEMS, PAGE_TITLES, and PageRouter
 * in packages/admin/src/components/layout.tsx.
 *
 * Usage: pnpm verify:admin-routes (or: tsx scripts/verify-admin-route-consistency.ts)
 * Exit code 1 on any error.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LAYOUT_PATH = path.join(ROOT, 'packages/admin/src/components/layout.tsx');

// Legacy redirect routes — these exist in PageRouter but redirect elsewhere
// They are intentionally NOT in NAV_ITEMS or PAGE_TITLES
const LEGACY_REDIRECTS = new Set([
  '/incoming',
  '/actions',
  '/telegram-users',
  '/settings',
  '/walletconnect',
  '/erc8004',
]);

// ── Extractors ─────────────────────────────────────────────────────────

function extractNavPaths(content: string): string[] {
  const paths: string[] = [];
  const regex = /path:\s*'([^']+)'/g;
  // Only match within NAV_ITEMS array
  const navBlock = content.match(/const NAV_ITEMS\s*=\s*\[([\s\S]*?)\];/);
  if (!navBlock) return paths;

  let match;
  while ((match = regex.exec(navBlock[1])) !== null) {
    paths.push(match[1]);
  }
  return paths;
}

function extractPageTitleKeys(content: string): string[] {
  const keys: string[] = [];
  const titleBlock = content.match(/const PAGE_TITLES[\s\S]*?=\s*\{([\s\S]*?)\};/);
  if (!titleBlock) return keys;

  const regex = /'([^']+)':\s*'/g;
  let match;
  while ((match = regex.exec(titleBlock[1])) !== null) {
    keys.push(match[1]);
  }
  return keys;
}

function extractRouterPaths(content: string): string[] {
  const paths: string[] = [];
  const routerBlock = content.match(/function PageRouter\(\)[\s\S]*?^}/m);
  if (!routerBlock) return paths;

  // Match exact equality checks: path === '/foo'
  const exactRegex = /path\s*===\s*'([^']+)'/g;
  let match;
  while ((match = exactRegex.exec(routerBlock[0])) !== null) {
    paths.push(match[1]);
  }

  // Match startsWith checks: path.startsWith('/foo')
  const startsRegex = /path\.startsWith\('([^']+)'/g;
  while ((match = startsRegex.exec(routerBlock[0])) !== null) {
    paths.push(match[1]);
  }

  return paths;
}

// ── Main ───────────────────────────────────────────────────────────────

function main(): void {
  console.log('Admin route consistency verification...\n');

  const content = fs.readFileSync(LAYOUT_PATH, 'utf-8');

  const navPaths = extractNavPaths(content);
  const titleKeys = extractPageTitleKeys(content);
  const routerPaths = extractRouterPaths(content);

  // Filter out legacy redirects from router paths for comparison
  const routerPathsFiltered = routerPaths.filter((p) => !LEGACY_REDIRECTS.has(p));

  const navSet = new Set(navPaths);
  const titleSet = new Set(titleKeys);
  const routerSet = new Set(routerPathsFiltered);

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check: NAV_ITEMS path must be handled in PageRouter
  for (const navPath of navPaths) {
    // /wallets is handled via startsWith, /dashboard is default fallback
    if (navPath === '/dashboard') continue; // default return in PageRouter

    if (!routerSet.has(navPath) && !routerPathsFiltered.some((rp) => navPath.startsWith(rp))) {
      errors.push(`NAV_ITEMS has '${navPath}' but PageRouter has no matching route handler`);
    }
  }

  // Check: NAV_ITEMS path must have PAGE_TITLES entry
  for (const navPath of navPaths) {
    if (!titleSet.has(navPath)) {
      errors.push(`NAV_ITEMS has '${navPath}' but PAGE_TITLES has no title for it`);
    }
  }

  // Check: PAGE_TITLES keys not in NAV_ITEMS (warning — may be hidden/detail pages)
  for (const titleKey of titleKeys) {
    if (!navSet.has(titleKey)) {
      warnings.push(`PAGE_TITLES has '${titleKey}' but it's not in NAV_ITEMS (hidden page?)`);
    }
  }

  // Print warnings
  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    for (const w of warnings) {
      console.log(`  [WARN] ${w}`);
    }
    console.log('');
  }

  if (errors.length > 0) {
    console.error(`FAILED: ${errors.length} error(s) found:\n`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }

    console.error('\n--- Fix Hints ---');
    console.error('Ensure consistency in packages/admin/src/components/layout.tsx:');
    console.error('  - Every NAV_ITEMS path must have a PAGE_TITLES entry');
    console.error('  - Every NAV_ITEMS path must be handled in PageRouter');
    console.error('  - Legacy redirects should be in LEGACY_REDIRECTS in this script');

    process.exit(1);
  }

  console.log(
    `Admin route consistency: ALL PASSED (${navPaths.length} routes)`
  );
}

main();
