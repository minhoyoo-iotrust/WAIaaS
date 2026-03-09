/**
 * Smoke tests for E2E infrastructure: ScenarioRegistry and E2EReporter.
 */

import { describe, it, expect } from 'vitest';
import { ScenarioRegistry, type E2EScenario } from '../types.js';
import { E2EReporter } from '../reporter.js';

describe('ScenarioRegistry', () => {
  it('registers and retrieves scenarios by track', () => {
    const reg = new ScenarioRegistry();

    const offchain1: E2EScenario = {
      id: 'auth-session-crud',
      name: 'Auth Session CRUD',
      track: 'offchain',
      category: 'core',
      description: 'Master password + session create/renew/delete',
    };
    const offchain2: E2EScenario = {
      id: 'wallet-crud',
      name: 'Wallet CRUD',
      track: 'offchain',
      category: 'core',
      description: 'EVM/Solana wallet create/list/delete',
    };
    const onchain1: E2EScenario = {
      id: 'eth-transfer',
      name: 'ETH Transfer',
      track: 'onchain',
      category: 'transfer',
      description: 'Sepolia ETH native transfer',
      networks: ['evm-sepolia'],
    };

    reg.register(offchain1);
    reg.register(offchain2);
    reg.register(onchain1);

    const offchainScenarios = reg.getByTrack('offchain');
    expect(offchainScenarios).toHaveLength(2);
    expect(offchainScenarios.map((s) => s.id)).toEqual(['auth-session-crud', 'wallet-crud']);

    const onchainScenarios = reg.getByTrack('onchain');
    expect(onchainScenarios).toHaveLength(1);
    expect(onchainScenarios[0]!.id).toBe('eth-transfer');

    expect(reg.all()).toHaveLength(3);
    expect(reg.get('wallet-crud')).toBe(offchain2);
    expect(reg.get('nonexistent')).toBeUndefined();
  });
});

describe('E2EReporter', () => {
  it('reporter summarizes results correctly', () => {
    const reporter = new E2EReporter();

    reporter.record({
      scenario: {
        id: 'auth-session',
        name: 'Auth Session',
        track: 'offchain',
        category: 'core',
        description: 'Test auth',
      },
      status: 'passed',
      durationMs: 1200,
    });

    reporter.record({
      scenario: {
        id: 'wallet-create',
        name: 'Wallet Create',
        track: 'offchain',
        category: 'core',
        description: 'Test wallet',
      },
      status: 'failed',
      durationMs: 800,
      error: 'Connection refused',
    });

    reporter.record({
      scenario: {
        id: 'onchain-transfer',
        name: 'Onchain Transfer',
        track: 'onchain',
        category: 'transfer',
        description: 'Test transfer',
      },
      status: 'skipped',
      durationMs: 0,
      skipReason: 'insufficient balance',
    });

    expect(reporter.passed).toBe(1);
    expect(reporter.failed).toBe(1);
    expect(reporter.skipped).toBe(1);
    expect(reporter.total).toBe(3);

    const summary = reporter.summary();
    expect(summary).toContain('[PASS]');
    expect(summary).toContain('[FAIL]');
    expect(summary).toContain('[SKIP]');
    expect(summary).toContain('auth-session');
    expect(summary).toContain('Connection refused');
    expect(summary).toContain('insufficient balance');
    expect(summary).toContain('Total: 3 | Passed: 1 | Failed: 1 | Skipped: 1');
  });

  it('reporter generates markdown summary', () => {
    const reporter = new E2EReporter();

    reporter.record({
      scenario: {
        id: 'test-scenario',
        name: 'Test',
        track: 'offchain',
        category: 'core',
        description: 'Test',
      },
      status: 'passed',
      durationMs: 500,
    });

    const md = reporter.markdownSummary();
    expect(md).toContain('| Status |');
    expect(md).toContain('| PASSED |');
    expect(md).toContain('test-scenario');
    expect(md).toContain('0.5s');
  });
});
