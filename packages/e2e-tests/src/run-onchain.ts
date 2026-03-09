/**
 * Onchain E2E Runner Entry Point
 *
 * Runs precondition checks, prompts for action, then executes
 * onchain E2E tests via vitest.
 *
 * Usage:
 *   tsx src/run-onchain.ts [--network ethereum-sepolia,solana-devnet] [--only swap,staking]
 *
 * Environment:
 *   WAIAAS_E2E_DAEMON_URL   - Daemon base URL (default: http://127.0.0.1:3100)
 *   WAIAAS_E2E_MASTER_PASSWORD - Master password (default: e2e-test-password-12345)
 */

import { execSync } from 'node:child_process';
import { PreconditionChecker } from './helpers/precondition-checker.js';
import { parseCliFilters, promptPreconditionAction } from './helpers/precondition-prompt.js';

const DEFAULT_DAEMON_URL = 'http://127.0.0.1:3100';
const DEFAULT_MASTER_PASSWORD = 'e2e-test-password-12345';

async function main(): Promise<void> {
  const daemonUrl = process.env.WAIAAS_E2E_DAEMON_URL ?? DEFAULT_DAEMON_URL;
  const masterPassword = process.env.WAIAAS_E2E_MASTER_PASSWORD ?? DEFAULT_MASTER_PASSWORD;

  // Parse CLI filters
  const filter = parseCliFilters(process.argv.slice(2));

  console.log('=== WAIaaS Onchain E2E Runner ===');
  console.log(`Daemon: ${daemonUrl}`);
  if (filter.networks) console.log(`Networks: ${filter.networks.join(', ')}`);
  if (filter.protocols) console.log(`Protocols: ${filter.protocols.join(', ')}`);
  console.log('');

  // Run precondition checks
  const checker = new PreconditionChecker(daemonUrl, masterPassword);
  const report = await checker.runAll(filter);

  // Display report
  console.log(checker.generateReport(report));

  // Prompt for action
  const action = await promptPreconditionAction(report);

  if (action === 'abort') {
    console.log('');
    console.log('Aborted. Please prepare the missing prerequisites and try again.');
    process.exit(0);
  }

  // Set environment variable with failed networks for test-level skip logic
  const failedNetworks = report.checks
    .filter((c) => !c.passed && c.name.startsWith('balance-'))
    .map((c) => c.name.replace('balance-', ''));

  if (failedNetworks.length > 0) {
    process.env.ONCHAIN_SKIP_NETWORKS = failedNetworks.join(',');
    console.log(`\nSkipping networks with insufficient balance: ${failedNetworks.join(', ')}`);
  }

  // Run onchain tests
  console.log('\nRunning onchain E2E tests...\n');
  try {
    execSync('npx vitest run --project onchain', {
      stdio: 'inherit',
      cwd: new URL('..', import.meta.url).pathname,
      env: {
        ...process.env,
        ONCHAIN_SKIP_NETWORKS: failedNetworks.join(','),
      },
    });
  } catch {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
