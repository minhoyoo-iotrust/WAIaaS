#!/usr/bin/env tsx
/**
 * Agent UAT Index Registration Verification
 *
 * Verifies bidirectional consistency between scenario files and _index.md:
 * - Every scenario file's ID must appear in _index.md (no orphans)
 * - Every ID in _index.md must have a corresponding file (no phantoms)
 *
 * Usage: pnpm verify:agent-uat:index (or: tsx scripts/verify-agent-uat-index.ts)
 * Exit code 1 on any failure.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const UAT_DIR = path.join(ROOT, 'agent-uat');
const INDEX_PATH = path.join(UAT_DIR, '_index.md');

const EXCLUDED_FILES = new Set(['_template.md', '_index.md', 'README.md']);

// ── Helpers ────────────────────────────────────────────────────────────

function findScenarioFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findScenarioFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md') && !EXCLUDED_FILES.has(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractIdFromFrontmatter(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const idMatch = match[1].match(/^id:\s*"?([^"\n]+)"?\s*$/m);
  return idMatch ? idMatch[1].trim() : null;
}

function extractIdsFromIndex(content: string): Set<string> {
  const ids = new Set<string>();
  const regex = /^\|\s*(testnet-\d+|mainnet-\d+|defi-\d+|admin-ops-\d+|admin-\d+|advanced-\d+)\s*\|/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

// ── Main ───────────────────────────────────────────────────────────────

function main(): void {
  console.log('Index registration verification...\n');

  const indexContent = fs.readFileSync(INDEX_PATH, 'utf-8');
  const indexIds = extractIdsFromIndex(indexContent);

  const scenarioFiles = findScenarioFiles(UAT_DIR);
  const fileIds = new Map<string, string>(); // id -> relative path

  for (const filePath of scenarioFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const id = extractIdFromFrontmatter(content);
    const relPath = path.relative(ROOT, filePath);
    if (id) {
      fileIds.set(id, relPath);
    } else {
      // Files without ID are caught by format checker, skip here
    }
  }

  const errors: string[] = [];

  // Orphan check: file has ID but not in _index.md
  const orphans: string[] = [];
  for (const [id, relPath] of fileIds) {
    if (!indexIds.has(id)) {
      errors.push(`Orphan scenario: ${id} (${relPath}) not registered in _index.md`);
      orphans.push(id);
    }
  }

  // Phantom check: _index.md has ID but no file
  const phantoms: string[] = [];
  for (const id of indexIds) {
    if (!fileIds.has(id)) {
      errors.push(`Phantom entry: ${id} listed in _index.md but no matching scenario file found`);
      phantoms.push(id);
    }
  }

  if (errors.length > 0) {
    console.error(`FAILED: ${errors.length} error(s) found:\n`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }

    console.error('\n--- Fix Hints ---');
    if (orphans.length > 0) {
      console.error('\nOrphan scenarios need to be added to agent-uat/_index.md:');
      for (const id of orphans) {
        console.error(`  Add row for "${id}" in the appropriate category table`);
      }
    }
    if (phantoms.length > 0) {
      console.error('\nPhantom entries need to be removed from agent-uat/_index.md (or create the file):');
      for (const id of phantoms) {
        console.error(`  Remove or create scenario file for "${id}"`);
      }
    }

    process.exit(1);
  }

  console.log(
    `Index registration: ALL PASSED (${fileIds.size} scenarios)`
  );
}

main();
