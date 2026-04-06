#!/usr/bin/env tsx
/**
 * CI check: ban SELECT * in migration files.
 *
 * SQLite's SELECT * maps columns by position. When a column was added via
 * ALTER TABLE ADD (always appended to the end), the source table's column
 * order may differ from the new table's definition, causing silent data
 * corruption or NOT NULL constraint failures.
 *
 * Usage: pnpm verify:migrations (or: tsx scripts/verify-migration-no-select-star.ts)
 * Exit code 1 on any violation.
 *
 * @see internal/objectives/issues/480-v62-migration-select-star-column-order.md
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');

// Already-applied migrations where SELECT * was safe at the time.
// New migrations MUST use explicit column lists.
const LEGACY_ALLOWLIST = new Set([
  'v2-v10.ts',
  'v11-v20.ts',
  'v21-v30.ts',
  'v31-v40.ts',
  'v41-v50.ts',
  'v51-v61.ts',
]);

const migrationsDir = `${root}/packages/daemon/src/infrastructure/database/migrations`;
const files = execSync(`find ${migrationsDir} -name '*.ts' -not -name '*.test.ts'`, { encoding: 'utf-8' })
  .trim()
  .split('\n')
  .filter(Boolean);

let violations = 0;

for (const file of files) {
  const basename = file.split('/').pop()!;
  if (LEGACY_ALLOWLIST.has(basename)) continue;

  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/SELECT\s+\*\s+FROM/i.test(line)) {
      const relPath = file.replace(root + '/', '');
      console.error(`  FAIL  ${relPath}:${i + 1} — SELECT * in migration (use explicit column list)`);
      console.error(`        ${line.trim()}`);
      violations++;
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} violation(s) found. Use explicit column lists in INSERT INTO ... SELECT.`);
  process.exit(1);
} else {
  console.log('  PASS  No SELECT * found in migration files');
}
