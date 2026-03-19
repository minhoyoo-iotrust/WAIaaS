#!/usr/bin/env tsx
/**
 * Agent UAT Provider-Scenario Mapping Verification
 *
 * Verifies that every Action Provider directory has a corresponding
 * Agent UAT scenario markdown file.
 *
 * Usage: pnpm verify:agent-uat:providers (or: tsx scripts/verify-agent-uat-provider-map.ts)
 * Exit code 1 on any failure. CI should run this in PR checks.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// ── Provider -> Agent UAT scenario mapping ─────────────────────────────

const PROVIDER_SCENARIO_MAP: Record<string, string> = {
  'aave-v3': 'defi/aave-lending.md',
  'across': 'defi/across-bridge.md',
  'dcent-swap': 'defi/dcent-swap-evm.md',
  'drift': 'defi/drift-perp.md',
  'erc8004': 'advanced/smart-account.md',
  'hyperliquid': 'defi/hyperliquid-mainnet.md',
  'jito-staking': 'defi/jito-staking.md',
  'jupiter-swap': 'defi/jupiter-swap.md',
  'kamino': 'defi/kamino-lending.md',
  'lido-staking': 'defi/lido-staking.md',
  'lifi': 'defi/lifi-bridge.md',
  'pendle': 'defi/pendle-yield.md',
  'polymarket': 'defi/polymarket-prediction.md',
  'zerox-swap': 'defi/0x-swap.md',
};

// ── Main ───────────────────────────────────────────────────────────────

function main(): void {
  console.log('Provider-Scenario mapping verification...\n');

  const providersDir = path.join(ROOT, 'packages/actions/src/providers');
  const entries = fs.readdirSync(providersDir, { withFileTypes: true });
  const providerDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const errors: string[] = [];

  // Check for unmapped providers (new provider added without scenario)
  const unmapped: string[] = [];
  for (const dir of providerDirs) {
    if (!(dir in PROVIDER_SCENARIO_MAP)) {
      errors.push(`Unmapped provider: ${dir} (no entry in PROVIDER_SCENARIO_MAP)`);
      unmapped.push(dir);
    }
  }

  // Check that mapped scenario files actually exist
  const missingFiles: string[] = [];
  for (const dir of providerDirs) {
    const scenarioRelPath = PROVIDER_SCENARIO_MAP[dir];
    if (!scenarioRelPath) continue;

    const scenarioPath = path.join(ROOT, 'agent-uat', scenarioRelPath);
    if (!fs.existsSync(scenarioPath)) {
      errors.push(`Missing scenario file: agent-uat/${scenarioRelPath} (for provider: ${dir})`);
      missingFiles.push(scenarioRelPath);
    }
  }

  if (errors.length > 0) {
    console.error(`FAILED: ${errors.length} error(s) found:\n`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }

    console.error('\n--- Fix Hints ---');
    if (unmapped.length > 0) {
      console.error('\nAdd mapping entries to scripts/verify-agent-uat-provider-map.ts PROVIDER_SCENARIO_MAP:');
      for (const p of unmapped) {
        console.error(`  '${p}': 'defi/<scenario-name>.md',`);
      }
      console.error('\nThen create the corresponding scenario file in agent-uat/defi/ (or agent-uat/advanced/).');
    }
    if (missingFiles.length > 0) {
      console.error('\nCreate the missing scenario files:');
      for (const f of missingFiles) {
        console.error(`  agent-uat/${f}`);
      }
    }

    process.exit(1);
  }

  console.log(
    `Provider-Scenario mapping: ALL PASSED (${providerDirs.length} providers)`
  );
}

main();
