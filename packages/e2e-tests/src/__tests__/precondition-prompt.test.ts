/**
 * Precondition prompt and CLI filter tests.
 *
 * Tests parseCliFilters for --network/--only flag parsing and
 * promptPreconditionAction for CI/interactive behavior.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseCliFilters,
  promptPreconditionAction,
  type PreconditionAction,
} from '../helpers/precondition-prompt.js';
import type { PreconditionReport } from '../helpers/precondition-checker.js';

describe('parseCliFilters', () => {
  it('parses --network flag with comma-separated values', () => {
    const filter = parseCliFilters(['--network', 'sepolia,devnet']);
    expect(filter.networks).toEqual(['sepolia', 'devnet']);
  });

  it('parses --only flag with comma-separated values', () => {
    const filter = parseCliFilters(['--only', 'swap,staking']);
    expect(filter.protocols).toEqual(['swap', 'staking']);
  });

  it('parses both --network and --only together', () => {
    const filter = parseCliFilters(['--network', 'sepolia', '--only', 'swap']);
    expect(filter.networks).toEqual(['sepolia']);
    expect(filter.protocols).toEqual(['swap']);
  });

  it('returns empty filter for no args', () => {
    const filter = parseCliFilters([]);
    expect(filter.networks).toBeUndefined();
    expect(filter.protocols).toBeUndefined();
  });

  it('ignores unknown flags', () => {
    const filter = parseCliFilters(['--verbose', '--network', 'holesky', '--debug']);
    expect(filter.networks).toEqual(['holesky']);
    expect(filter.protocols).toBeUndefined();
  });
});

describe('promptPreconditionAction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns run-available immediately when allPassed is true', async () => {
    const report: PreconditionReport = {
      allPassed: true,
      checks: [
        { name: 'daemon-health', passed: true, required: 'running', actual: 'running', message: 'OK' },
      ],
      summary: '1/1 checks passed',
    };
    const action = await promptPreconditionAction(report);
    expect(action).toBe('run-available');
  });

  it('returns run-available in CI mode even when checks fail', async () => {
    const report: PreconditionReport = {
      allPassed: false,
      checks: [
        { name: 'daemon-health', passed: true, required: 'running', actual: 'running', message: 'OK' },
        { name: 'balance-sepolia', passed: false, required: '0.01 ETH', actual: '0', message: 'Low' },
      ],
      summary: '1/2 checks passed',
    };
    const action = await promptPreconditionAction(report, { ci: true });
    expect(action).toBe('run-available');
  });

  it('returns run-available when CI env var is set', async () => {
    const origCI = process.env.CI;
    process.env.CI = 'true';
    try {
      const report: PreconditionReport = {
        allPassed: false,
        checks: [
          { name: 'balance-sepolia', passed: false, required: '0.01', actual: '0', message: 'Low' },
        ],
        summary: '0/1 checks passed',
      };
      const action = await promptPreconditionAction(report);
      expect(action).toBe('run-available');
    } finally {
      if (origCI === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = origCI;
      }
    }
  });
});
