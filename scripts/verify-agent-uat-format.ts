#!/usr/bin/env tsx
/**
 * Agent UAT Scenario Format Verification
 *
 * Verifies that all scenario markdown files in agent-uat/ have:
 * - YAML frontmatter with required fields
 * - 4 mandatory sections (## Metadata, ## Prerequisites, ## Scenario Steps, ## Verification)
 * - At least one ### Step under ## Scenario Steps
 *
 * Usage: pnpm verify:agent-uat:format (or: tsx scripts/verify-agent-uat-format.ts)
 * Exit code 1 on any error. Warnings do not cause failure.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const UAT_DIR = path.join(ROOT, 'agent-uat');

const EXCLUDED_FILES = new Set(['_template.md', '_index.md', 'README.md']);
const REQUIRED_FRONTMATTER_FIELDS = ['id', 'title', 'category', 'network', 'requires_funds', 'estimated_cost_usd', 'risk_level'];
const REQUIRED_SECTIONS = ['## Metadata', '## Prerequisites', '## Scenario Steps', '## Verification'];
const RECOMMENDED_SECTIONS = ['## Estimated Cost', '## Troubleshooting'];

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

function parseFrontmatter(content: string): { fields: Record<string, unknown>; exists: boolean } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { fields: {}, exists: false };

  const fields: Record<string, unknown> = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      fields[key] = value;
    }
  }
  return { fields, exists: true };
}

// ── Main ───────────────────────────────────────────────────────────────

function main(): void {
  console.log('Scenario format verification...\n');

  const scenarioFiles = findScenarioFiles(UAT_DIR);
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const filePath of scenarioFiles) {
    const relPath = path.relative(ROOT, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check frontmatter
    const fm = parseFrontmatter(content);
    if (!fm.exists) {
      errors.push(`${relPath}: Missing YAML frontmatter (--- ... --- block)`);
    } else {
      for (const field of REQUIRED_FRONTMATTER_FIELDS) {
        if (!(field in fm.fields)) {
          errors.push(`${relPath}: Missing frontmatter field: ${field}`);
        }
      }
    }

    // Check required sections
    for (const section of REQUIRED_SECTIONS) {
      const regex = new RegExp(`^${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
      if (!regex.test(content)) {
        errors.push(`${relPath}: Missing required section: ${section}`);
      }
    }

    // Check recommended sections (warnings only)
    for (const section of RECOMMENDED_SECTIONS) {
      const regex = new RegExp(`^${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
      if (!regex.test(content)) {
        warnings.push(`${relPath}: Missing recommended section: ${section}`);
      }
    }

    // Check for at least one ### Step under ## Scenario Steps
    const stepsMatch = content.match(/## Scenario Steps[\s\S]*?(?=\n## |$)/);
    if (stepsMatch) {
      if (!/### Step/.test(stepsMatch[0])) {
        errors.push(`${relPath}: ## Scenario Steps has no ### Step subsections (empty scenario)`);
      }
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
    console.error('Ensure every scenario file has:');
    console.error('  1. YAML frontmatter with fields: ' + REQUIRED_FRONTMATTER_FIELDS.join(', '));
    console.error('  2. Required sections: ' + REQUIRED_SECTIONS.join(', '));
    console.error('  3. At least one ### Step under ## Scenario Steps');
    console.error('\nSee agent-uat/_template.md for the standard format.');

    process.exit(1);
  }

  console.log(
    `Scenario format: ALL PASSED (${scenarioFiles.length} files)`
  );
}

main();
