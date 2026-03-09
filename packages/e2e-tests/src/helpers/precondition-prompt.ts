/**
 * Precondition Prompt — Interactive CLI prompt for onchain E2E tests.
 *
 * After PreconditionChecker produces a report, this module presents
 * options to the user: run available scenarios or abort.
 * In CI environments, automatically runs available scenarios.
 */

import { createInterface } from 'node:readline';
import type { PreconditionReport, NetworkFilter } from './precondition-checker.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** User action after seeing precondition report. */
export type PreconditionAction = 'run-available' | 'abort';

/* ------------------------------------------------------------------ */
/*  CLI Filter Parsing                                                 */
/* ------------------------------------------------------------------ */

/**
 * Parse CLI argv for --network and --only flags.
 *
 * @example
 * parseCliFilters(['--network', 'sepolia,devnet']) // { networks: ['sepolia', 'devnet'] }
 * parseCliFilters(['--only', 'swap,staking'])      // { protocols: ['swap', 'staking'] }
 */
export function parseCliFilters(argv: string[]): NetworkFilter {
  const filter: NetworkFilter = {};

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--network' && i + 1 < argv.length) {
      filter.networks = argv[i + 1]!.split(',').map((s) => s.trim());
      i++;
    } else if (argv[i] === '--only' && i + 1 < argv.length) {
      filter.protocols = argv[i + 1]!.split(',').map((s) => s.trim());
      i++;
    }
  }

  return filter;
}

/* ------------------------------------------------------------------ */
/*  Interactive Prompt                                                  */
/* ------------------------------------------------------------------ */

/**
 * Prompt user for action based on precondition report.
 *
 * - allPassed=true -> immediate 'run-available'
 * - CI environment  -> automatic 'run-available'
 * - Interactive     -> readline prompt for user choice
 */
export async function promptPreconditionAction(
  report: PreconditionReport,
  opts?: { ci?: boolean },
): Promise<PreconditionAction> {
  // All checks passed — no need to prompt
  if (report.allPassed) {
    return 'run-available';
  }

  // CI mode — auto-run available (failed scenarios will be skipped in tests)
  const isCI = opts?.ci ?? !!process.env.CI;
  if (isCI) {
    return 'run-available';
  }

  // Interactive prompt
  return new Promise<PreconditionAction>((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (): void => {
      console.log('');
      console.log('Options:');
      console.log('  1) Run available scenarios (skip failed preconditions)');
      console.log('  2) Abort and prepare missing prerequisites');
      console.log('');
      rl.question('Select [1/2]: ', (answer) => {
        const trimmed = answer.trim();
        if (trimmed === '1') {
          rl.close();
          resolve('run-available');
        } else if (trimmed === '2') {
          rl.close();
          resolve('abort');
        } else {
          console.log('Invalid selection. Please enter 1 or 2.');
          ask();
        }
      });
    };

    ask();
  });
}
