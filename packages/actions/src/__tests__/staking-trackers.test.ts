/**
 * LidoWithdrawalTracker & JitoEpochTracker unit tests.
 *
 * Tests cover IAsyncStatusTracker interface compliance, checkStatus behavior
 * for PENDING/COMPLETED states, metadata-based status detection, and
 * notification event details.
 *
 * @see packages/actions/src/providers/lido-staking/withdrawal-tracker.ts
 * @see packages/actions/src/providers/jito-staking/epoch-tracker.ts
 */
import { describe, it, expect } from 'vitest';
import { LidoWithdrawalTracker } from '../providers/lido-staking/withdrawal-tracker.js';
import { JitoEpochTracker } from '../providers/jito-staking/epoch-tracker.js';

// ---------------------------------------------------------------------------
// LidoWithdrawalTracker tests
// ---------------------------------------------------------------------------

describe('LidoWithdrawalTracker', () => {
  it('should have correct name', () => {
    const tracker = new LidoWithdrawalTracker();
    expect(tracker.name).toBe('lido-withdrawal');
  });

  it('should have correct maxAttempts (480)', () => {
    const tracker = new LidoWithdrawalTracker();
    expect(tracker.maxAttempts).toBe(480);
  });

  it('should have correct pollIntervalMs (30s)', () => {
    const tracker = new LidoWithdrawalTracker();
    expect(tracker.pollIntervalMs).toBe(30_000);
  });

  it('should have timeoutTransition TIMEOUT', () => {
    const tracker = new LidoWithdrawalTracker();
    expect(tracker.timeoutTransition).toBe('TIMEOUT');
  });

  it('should return PENDING with default metadata', async () => {
    const tracker = new LidoWithdrawalTracker();
    const result = await tracker.checkStatus('tx-1', {});
    expect(result.state).toBe('PENDING');
    expect(result.details?.protocol).toBe('lido');
    expect(result.details?.estimatedDaysRemaining).toBe(5);
  });

  it('should return COMPLETED when metadata.status is claimable', async () => {
    const tracker = new LidoWithdrawalTracker();
    const result = await tracker.checkStatus('tx-2', { status: 'claimable' });
    expect(result.state).toBe('COMPLETED');
    expect(result.details?.completedAt).toBeGreaterThan(0);
  });

  it('should include protocol lido in details', async () => {
    const tracker = new LidoWithdrawalTracker();

    // PENDING case
    const pendingResult = await tracker.checkStatus('tx-3', {});
    expect(pendingResult.details?.protocol).toBe('lido');

    // COMPLETED case
    const completedResult = await tracker.checkStatus('tx-4', { status: 'claimable' });
    expect(completedResult.details?.protocol).toBe('lido');
  });

  it('should include notificationEvent STAKING_UNSTAKE_COMPLETED on COMPLETED', async () => {
    const tracker = new LidoWithdrawalTracker();
    const result = await tracker.checkStatus('tx-5', { status: 'claimable' });
    expect(result.state).toBe('COMPLETED');
    expect(result.details?.notificationEvent).toBe('STAKING_UNSTAKE_COMPLETED');
  });

  it('should calculate estimatedDaysRemaining from withdrawalRequestedAt', async () => {
    const tracker = new LidoWithdrawalTracker();
    // Request 2 days ago
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const result = await tracker.checkStatus('tx-6', {
      withdrawalRequestedAt: twoDaysAgo,
    });
    expect(result.state).toBe('PENDING');
    // Should be approximately 3 days remaining (5 - 2)
    expect(result.details?.estimatedDaysRemaining).toBeGreaterThan(2.5);
    expect(result.details?.estimatedDaysRemaining).toBeLessThan(3.5);
  });

  it('should clamp estimatedDaysRemaining to 0 when past expected time', async () => {
    const tracker = new LidoWithdrawalTracker();
    // Request 10 days ago (past 5-day expected)
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const result = await tracker.checkStatus('tx-7', {
      withdrawalRequestedAt: tenDaysAgo,
    });
    expect(result.state).toBe('PENDING');
    expect(result.details?.estimatedDaysRemaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// JitoEpochTracker tests
// ---------------------------------------------------------------------------

describe('JitoEpochTracker', () => {
  it('should have correct name', () => {
    const tracker = new JitoEpochTracker();
    expect(tracker.name).toBe('jito-epoch');
  });

  it('should have correct maxAttempts (240)', () => {
    const tracker = new JitoEpochTracker();
    expect(tracker.maxAttempts).toBe(240);
  });

  it('should have correct pollIntervalMs (30s)', () => {
    const tracker = new JitoEpochTracker();
    expect(tracker.pollIntervalMs).toBe(30_000);
  });

  it('should have timeoutTransition TIMEOUT', () => {
    const tracker = new JitoEpochTracker();
    expect(tracker.timeoutTransition).toBe('TIMEOUT');
  });

  it('should return PENDING with default metadata', async () => {
    const tracker = new JitoEpochTracker();
    const result = await tracker.checkStatus('tx-1', {});
    expect(result.state).toBe('PENDING');
    expect(result.details?.protocol).toBe('jito');
    expect(result.details?.estimatedDaysRemaining).toBe(3);
  });

  it('should return COMPLETED when metadata.status is deactivated', async () => {
    const tracker = new JitoEpochTracker();
    const result = await tracker.checkStatus('tx-2', { status: 'deactivated' });
    expect(result.state).toBe('COMPLETED');
    expect(result.details?.completedAt).toBeGreaterThan(0);
  });

  it('should include protocol jito in details', async () => {
    const tracker = new JitoEpochTracker();

    // PENDING case
    const pendingResult = await tracker.checkStatus('tx-3', {});
    expect(pendingResult.details?.protocol).toBe('jito');

    // COMPLETED case
    const completedResult = await tracker.checkStatus('tx-4', { status: 'deactivated' });
    expect(completedResult.details?.protocol).toBe('jito');
  });

  it('should include notificationEvent STAKING_UNSTAKE_COMPLETED on COMPLETED', async () => {
    const tracker = new JitoEpochTracker();
    const result = await tracker.checkStatus('tx-5', { status: 'deactivated' });
    expect(result.state).toBe('COMPLETED');
    expect(result.details?.notificationEvent).toBe('STAKING_UNSTAKE_COMPLETED');
  });

  it('should include targetEpoch from metadata when PENDING', async () => {
    const tracker = new JitoEpochTracker();
    const result = await tracker.checkStatus('tx-6', { targetEpoch: 500 });
    expect(result.state).toBe('PENDING');
    expect(result.details?.targetEpoch).toBe(500);
  });

  it('should calculate estimatedDaysRemaining from unstakeRequestedAt', async () => {
    const tracker = new JitoEpochTracker();
    // Request 1 day ago
    const oneDayAgo = Date.now() - 1 * 24 * 60 * 60 * 1000;
    const result = await tracker.checkStatus('tx-7', {
      unstakeRequestedAt: oneDayAgo,
    });
    expect(result.state).toBe('PENDING');
    // Should be approximately 2 days remaining (3 - 1)
    expect(result.details?.estimatedDaysRemaining).toBeGreaterThan(1.5);
    expect(result.details?.estimatedDaysRemaining).toBeLessThan(2.5);
  });
});
