/**
 * PreconditionChecker unit tests.
 *
 * Tests daemon connectivity, wallet detection, balance checking,
 * network/protocol filtering, and report generation.
 *
 * Uses a real daemon instance (DaemonManager) for integration-style tests.
 * Note: Balance checks may return HTTP errors in test environment (no real RPC)
 * so we test the logic paths rather than actual balances.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DaemonManager } from '../helpers/daemon-lifecycle.js';
import {
  PreconditionChecker,
  type PreconditionReport,
  type CheckResult,
} from '../helpers/precondition-checker.js';

const CLI_BIN = resolve(
  new URL('.', import.meta.url).pathname,
  '..', '..', '..', 'cli', 'bin', 'waiaas',
);
const skipReason = !existsSync(CLI_BIN)
  ? 'CLI not built (run pnpm turbo run build --filter=@waiaas/cli first)'
  : undefined;

describe.skipIf(!!skipReason)('PreconditionChecker', { timeout: 60_000 }, () => {
  let manager: DaemonManager;
  let baseUrl: string;
  let evmWalletId: string;
  const masterPassword = 'e2e-test-password-12345';

  beforeAll(async () => {
    manager = new DaemonManager();
    const instance = await manager.start({ masterPassword });
    baseUrl = instance.baseUrl;

    // Create an EVM wallet for tests
    const res = await fetch(`${baseUrl}/v1/wallets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Password': masterPassword,
      },
      body: JSON.stringify({
        name: 'evm-precondition-test',
        chain: 'ethereum',
        environment: 'testnet',
      }),
    });
    const body = (await res.json()) as { id: string };
    evmWalletId = body.id;
  });

  afterAll(async () => {
    await manager.stop().catch(() => {});
  });

  it('checkDaemon returns passed when daemon is running', async () => {
    const checker = new PreconditionChecker(baseUrl, masterPassword);
    const result = await checker.checkDaemon();
    expect(result.passed).toBe(true);
    expect(result.name).toContain('daemon');
  });

  it('checkDaemon returns failed when daemon is not reachable', async () => {
    const checker = new PreconditionChecker('http://127.0.0.1:1', masterPassword);
    const result = await checker.checkDaemon();
    expect(result.passed).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('checkWallets detects existing wallets by chain', async () => {
    const checker = new PreconditionChecker(baseUrl, masterPassword);
    const results = await checker.checkWallets(['ethereum']);
    expect(results.length).toBeGreaterThan(0);
    const ethCheck = results.find((r) => r.name.includes('ethereum'));
    expect(ethCheck?.passed).toBe(true);
  });

  it('checkWallets reports missing chain wallets', async () => {
    const checker = new PreconditionChecker(baseUrl, masterPassword);
    const results = await checker.checkWallets(['solana']);
    const solCheck = results.find((r) => r.name.includes('solana'));
    expect(solCheck?.passed).toBe(false);
    expect(solCheck?.message).toContain('solana');
  });

  it('checkBalance creates session and returns result', async () => {
    const checker = new PreconditionChecker(baseUrl, masterPassword);
    // In test environment without RPC, balance check returns a structured result
    // (either passed or failed with message — both are valid structured responses)
    const result = await checker.checkBalance(evmWalletId, '0', 'sepolia');
    expect(result.name).toBe('balance-sepolia');
    expect(typeof result.passed).toBe('boolean');
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('checkBalance returns failed for non-existent wallet', async () => {
    const checker = new PreconditionChecker(baseUrl, masterPassword);
    const result = await checker.checkBalance('non-existent-id', '0', 'sepolia');
    expect(result.passed).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('runAll returns complete report with all checks', async () => {
    const checker = new PreconditionChecker(baseUrl, masterPassword);
    const report = await checker.runAll();
    expect(report.checks.length).toBeGreaterThan(0);
    expect(typeof report.allPassed).toBe('boolean');
    expect(typeof report.summary).toBe('string');
    // Daemon check should pass
    const daemonCheck = report.checks.find((c) => c.name === 'daemon-health');
    expect(daemonCheck?.passed).toBe(true);
  });

  it('runAll with network filter checks only specified networks', async () => {
    const checker = new PreconditionChecker(baseUrl, masterPassword);
    const report = await checker.runAll({ networks: ['sepolia'] });
    // Only sepolia-related balance checks should exist
    const balanceChecks = report.checks.filter((c) => c.name.includes('balance'));
    for (const check of balanceChecks) {
      expect(check.name).toContain('sepolia');
    }
    // Should NOT have holesky or devnet balance checks
    const holeskyChecks = report.checks.filter((c) => c.name.includes('holesky'));
    expect(holeskyChecks.length).toBe(0);
  });

  it('runAll with protocol filter checks only protocol-related networks', async () => {
    const checker = new PreconditionChecker(baseUrl, masterPassword);
    const report = await checker.runAll({ protocols: ['staking'] });
    // Staking maps to holesky only — should not have devnet
    const walletChecks = report.checks.filter((c) => c.name.includes('wallet'));
    const balanceChecks = report.checks.filter((c) => c.name.includes('balance'));
    // Staking only needs ethereum chain
    const evmWallet = walletChecks.find((c) => c.name.includes('ethereum'));
    expect(evmWallet).toBeDefined();
    const solWallet = walletChecks.find((c) => c.name.includes('solana'));
    expect(solWallet).toBeUndefined();
  });

  it('runAll skips wallet/balance checks when daemon is unreachable', async () => {
    const checker = new PreconditionChecker('http://127.0.0.1:1', masterPassword);
    const report = await checker.runAll();
    expect(report.allPassed).toBe(false);
    const daemonCheck = report.checks.find((c) => c.name.includes('daemon'));
    expect(daemonCheck?.passed).toBe(false);
    const walletChecks = report.checks.filter((c) => c.name.includes('wallet'));
    expect(walletChecks.length).toBe(0);
  });

  it('generateReport produces formatted text with PASS/FAIL markers', async () => {
    const checker = new PreconditionChecker(baseUrl, masterPassword);
    const report = await checker.runAll();
    const text = checker.generateReport(report);
    // Daemon passes, so [PASS] should be present
    expect(text).toContain('[PASS]');
    expect(text).toContain('Precondition Report');
    expect(text.length).toBeGreaterThan(0);
  });

  it('generateReport shows FAIL markers for failed checks', () => {
    const checker = new PreconditionChecker(baseUrl, masterPassword);
    const report: PreconditionReport = {
      allPassed: false,
      checks: [
        { name: 'daemon-health', passed: true, required: 'running', actual: 'running', message: 'Daemon is running' },
        { name: 'balance-sepolia', passed: false, required: '0.01 ETH', actual: '0 ETH', message: 'Insufficient balance' },
      ],
      summary: '1/2 checks passed',
    };
    const text = checker.generateReport(report);
    expect(text).toContain('[PASS]');
    expect(text).toContain('[FAIL]');
    expect(text).toContain('Insufficient balance');
  });

  it('generateReport shows advice when not all passed', () => {
    const checker = new PreconditionChecker(baseUrl, masterPassword);
    const report: PreconditionReport = {
      allPassed: false,
      checks: [
        { name: 'wallet-solana', passed: false, required: 'solana wallet', actual: 'not found', message: 'No solana wallet found' },
      ],
      summary: '0/1 checks passed',
    };
    const text = checker.generateReport(report);
    expect(text).toContain('preconditions are not met');
  });
});
