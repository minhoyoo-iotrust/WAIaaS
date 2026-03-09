#!/usr/bin/env tsx
/**
 * E2E Coverage Verification Script
 *
 * Verifies that all Action Providers and REST API routes have
 * corresponding E2E scenario mappings, and that scenario files
 * contain at least one registry.register() call.
 *
 * Usage: pnpm verify:e2e-coverage (or: tsx scripts/verify-e2e-coverage.ts)
 * Exit code 1 on any failure. CI should run this in PR checks.
 *
 * Steps:
 *   1. Provider coverage: every provider dir has an e2e-coverage-map entry
 *   2. Route coverage: every route file has an e2e-coverage-map entry
 *   3. Empty scenario files: every scenario file has registry.register() calls
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Import coverage map ────────────────────────────────────────────────

const ROOT = path.resolve(import.meta.dirname, '..');

// Dynamic require to avoid ESM resolution issues with tsx
const coverageMapPath = path.join(ROOT, 'packages/e2e-tests/src/e2e-coverage-map.ts');

// Use dynamic import for .ts files via tsx
const coverageMap = await import(coverageMapPath);
const {
  providerCoverage,
  routeCoverage,
  ROUTE_EXCLUDES,
  SCENARIO_MIN_REGISTRATIONS,
} = coverageMap;

// ── Helpers ────────────────────────────────────────────────────────────

const errors: string[] = [];
const fixHintMode = process.argv.includes('--fix-hint');

function fail(step: string, msg: string): void {
  errors.push(`[${step}] ${msg}`);
}

// ── Step 1: Provider Coverage ──────────────────────────────────────────

function step1ProviderCoverage(): { scanned: number; missing: string[] } {
  const providersDir = path.join(ROOT, 'packages/actions/src/providers');
  const entries = fs.readdirSync(providersDir, { withFileTypes: true });
  const providerDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const missing: string[] = [];
  for (const dir of providerDirs) {
    if (!(dir in providerCoverage)) {
      fail('Providers', `Missing E2E mapping for provider: ${dir}`);
      missing.push(dir);
    }
  }

  return { scanned: providerDirs.length, missing };
}

// ── Step 2: Route Coverage ─────────────────────────────────────────────

function step2RouteCoverage(): { scanned: number; missing: string[] } {
  const routesDir = path.join(ROOT, 'packages/daemon/src/api/routes');
  const entries = fs.readdirSync(routesDir, { withFileTypes: true });
  const routeFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => e.name.replace('.ts', ''))
    .filter((name) => !ROUTE_EXCLUDES.includes(name));

  const missing: string[] = [];
  for (const file of routeFiles) {
    if (!(file in routeCoverage)) {
      fail('Routes', `Missing E2E mapping for route: ${file}`);
      missing.push(file);
    }
  }

  return { scanned: routeFiles.length, missing };
}

// ── Step 3: Empty Scenario Files ───────────────────────────────────────

function step3EmptyScenarios(): { scanned: number; empty: string[] } {
  const scenariosDir = path.join(ROOT, 'packages/e2e-tests/src/scenarios');
  const entries = fs.readdirSync(scenariosDir, { withFileTypes: true });
  const scenarioFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => e.name);

  const empty: string[] = [];
  for (const file of scenarioFiles) {
    const content = fs.readFileSync(path.join(scenariosDir, file), 'utf-8');
    const registerCount = (content.match(/registry\.register\(/g) || []).length;
    if (registerCount < SCENARIO_MIN_REGISTRATIONS) {
      fail('Scenarios', `Empty scenario file (0 registry.register calls): ${file}`);
      empty.push(file);
    }
  }

  return { scanned: scenarioFiles.length, empty };
}

// ── Main ───────────────────────────────────────────────────────────────

function main(): void {
  console.log('E2E coverage verification: checking providers, routes, and scenarios...\n');

  console.log('  Step 1: Provider coverage...');
  const providers = step1ProviderCoverage();

  console.log('  Step 2: Route coverage...');
  const routes = step2RouteCoverage();

  console.log('  Step 3: Empty scenario files...');
  const scenarios = step3EmptyScenarios();

  if (errors.length > 0) {
    console.error(`\nFAILED: ${errors.length} error(s) found:\n`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }

    if (fixHintMode || true) {
      console.error('\n--- Fix Hints ---');
      if (providers.missing.length > 0) {
        console.error('\nMissing provider mappings. Add to packages/e2e-tests/src/e2e-coverage-map.ts providerCoverage:');
        for (const p of providers.missing) {
          console.error(`  '${p}': ['<scenario-file>.ts'],`);
        }
      }
      if (routes.missing.length > 0) {
        console.error('\nMissing route mappings. Add to packages/e2e-tests/src/e2e-coverage-map.ts routeCoverage:');
        for (const r of routes.missing) {
          console.error(`  '${r}': ['<scenario-file>.ts'],`);
        }
      }
      if (scenarios.empty.length > 0) {
        console.error('\nEmpty scenario files (need at least 1 registry.register() call):');
        for (const s of scenarios.empty) {
          console.error(`  packages/e2e-tests/src/scenarios/${s}`);
        }
      }
    }

    process.exit(1);
  }

  console.log(
    `\nE2E coverage: ALL PASSED (${providers.scanned} providers, ${routes.scanned} routes, ${scenarios.scanned} scenarios)`
  );
}

main();
