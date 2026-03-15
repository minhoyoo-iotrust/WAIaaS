#!/usr/bin/env tsx
/**
 * API Types Freshness Check
 *
 * Compares the committed types.generated.ts with a freshly generated version.
 * If they differ, the committed file is stale and needs regeneration.
 *
 * Usage: pnpm run check:api-types-freshness
 * Exit code 1 if stale (CI gate).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname ?? '.', '..');
const TYPES_FILE = resolve(ROOT, 'packages', 'admin', 'src', 'api', 'types.generated.ts');

function main(): void {
  console.log('Checking API types freshness...\n');

  // Read current committed content
  let currentContent: string;
  try {
    currentContent = readFileSync(TYPES_FILE, 'utf-8');
  } catch {
    console.error('ERROR: types.generated.ts not found. Run "pnpm run generate:api-types" first.');
    process.exit(1);
  }

  // Regenerate
  console.log('Regenerating types...');
  execSync('pnpm run generate:api-types', {
    cwd: ROOT,
    stdio: 'pipe',
  });

  // Read freshly generated content
  const freshContent = readFileSync(TYPES_FILE, 'utf-8');

  // Compare
  if (currentContent === freshContent) {
    console.log('\ntypes.generated.ts is fresh. No drift detected.');
    process.exit(0);
  }

  // Find first difference line for debugging
  const currentLines = currentContent.split('\n');
  const freshLines = freshContent.split('\n');
  let firstDiffLine = -1;
  const maxLines = Math.max(currentLines.length, freshLines.length);
  for (let i = 0; i < maxLines; i++) {
    if (currentLines[i] !== freshLines[i]) {
      firstDiffLine = i + 1;
      break;
    }
  }

  console.error('\nERROR: types.generated.ts is STALE.');
  console.error(`  Current lines: ${currentLines.length}`);
  console.error(`  Fresh lines: ${freshLines.length}`);
  if (firstDiffLine > 0) {
    console.error(`  First difference at line: ${firstDiffLine}`);
    console.error(`    Current: ${currentLines[firstDiffLine - 1]?.slice(0, 100)}`);
    console.error(`    Fresh:   ${freshLines[firstDiffLine - 1]?.slice(0, 100)}`);
  }
  console.error('\nRun "pnpm run generate:api-types" and commit the result.');
  process.exit(1);
}

main();
