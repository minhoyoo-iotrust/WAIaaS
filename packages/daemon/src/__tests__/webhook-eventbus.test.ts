/**
 * WebhookService EventBus integration tests.
 *
 * Tests that EventBus events are correctly mapped to webhook event types
 * and dispatched through WebhookService. Uses a real EventBus with mock
 * SQLite to verify event routing without actual HTTP delivery.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Mocks (must be before imports)
// ---------------------------------------------------------------------------

vi.mock('../infrastructure/settings/settings-crypto.js', () => ({
  decryptSettingValue: vi.fn().mockReturnValue('decrypted-secret-hex'),
}));

vi.mock('../infrastructure/database/id.js', () => ({
  generateId: vi.fn().mockReturnValue('mock-uuid-v7'),
}));

// Import after mocks
import { WebhookService } from '../services/webhook-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates mock SQLite that returns one wildcard webhook (events=[]) for any SELECT query. */
function createMockSqlite(enabled = true) {
  const runFn = vi.fn();
  const allFn = vi.fn().mockReturnValue(
    enabled
      ? [
          {
            id: 'wh-test',
            url: 'https://example.com/hook',
            secret_encrypted: 'encrypted-secret',
            events: '[]', // wildcard: match all events
          },
        ]
      : [],
  );

  return {
    prepare: vi.fn().mockReturnValue({
      run: runFn,
      all: allFn,
      get: vi.fn(),
    }),
    exec: vi.fn(),
    _run: runFn,
    _all: allFn,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebhookService EventBus integration', () => {
  let eventBus: EventBus;
  let sqlite: ReturnType<typeof createMockSqlite>;
  let service: WebhookService;
  let dispatchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    eventBus = new EventBus();
    sqlite = createMockSqlite();
    service = new WebhookService(
      sqlite as unknown as import('better-sqlite3').Database,
      eventBus,
      () => 'master-password',
    );
    // Spy on dispatch to verify event type and data mapping
    dispatchSpy = vi.spyOn(service, 'dispatch') as unknown as ReturnType<typeof vi.fn>;

    // Stub fetch to prevent actual HTTP calls
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('OK', { status: 200 })),
    );
  });

  afterEach(() => {
    service.destroy();
    eventBus.removeAllListeners();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // transaction:completed -> TX_CONFIRMED
  // -----------------------------------------------------------------------

  it('maps transaction:completed to TX_CONFIRMED with correct payload', () => {
    eventBus.emit('transaction:completed', {
      walletId: 'wallet-1',
      txId: 'tx-1',
      txHash: '0xabc',
      amount: '1000000',
      network: 'solana-mainnet',
      type: 'TRANSFER',
      timestamp: 1772525000,
    });

    expect(dispatchSpy).toHaveBeenCalledWith('TX_CONFIRMED', {
      txId: 'tx-1',
      txHash: '0xabc',
      walletId: 'wallet-1',
      network: 'solana-mainnet',
      type: 'TRANSFER',
      amount: '1000000',
    });
  });

  // -----------------------------------------------------------------------
  // transaction:failed -> TX_FAILED
  // -----------------------------------------------------------------------

  it('maps transaction:failed to TX_FAILED with correct payload', () => {
    eventBus.emit('transaction:failed', {
      walletId: 'wallet-1',
      txId: 'tx-2',
      error: 'insufficient balance',
      network: 'ethereum-mainnet',
      type: 'TOKEN_TRANSFER',
      timestamp: 1772525000,
    });

    expect(dispatchSpy).toHaveBeenCalledWith('TX_FAILED', {
      txId: 'tx-2',
      error: 'insufficient balance',
      walletId: 'wallet-1',
      network: 'ethereum-mainnet',
      type: 'TOKEN_TRANSFER',
    });
  });

  // -----------------------------------------------------------------------
  // wallet:activity -> TX_SUBMITTED
  // -----------------------------------------------------------------------

  it('maps wallet:activity TX_SUBMITTED to TX_SUBMITTED', () => {
    eventBus.emit('wallet:activity', {
      walletId: 'wallet-1',
      activity: 'TX_SUBMITTED',
      details: { txId: 'tx-3', txHash: '0xdef' },
      timestamp: 1772525000,
    });

    expect(dispatchSpy).toHaveBeenCalledWith('TX_SUBMITTED', {
      walletId: 'wallet-1',
      txId: 'tx-3',
      txHash: '0xdef',
    });
  });

  // -----------------------------------------------------------------------
  // wallet:activity -> SESSION_CREATED
  // -----------------------------------------------------------------------

  it('maps wallet:activity SESSION_CREATED to SESSION_CREATED', () => {
    eventBus.emit('wallet:activity', {
      walletId: 'wallet-1',
      activity: 'SESSION_CREATED',
      details: { sessionId: 'sess-1' },
      timestamp: 1772525000,
    });

    expect(dispatchSpy).toHaveBeenCalledWith('SESSION_CREATED', {
      walletId: 'wallet-1',
      sessionId: 'sess-1',
    });
  });

  // -----------------------------------------------------------------------
  // wallet:activity -> OWNER_REGISTERED
  // -----------------------------------------------------------------------

  it('maps wallet:activity OWNER_SET to OWNER_REGISTERED', () => {
    eventBus.emit('wallet:activity', {
      walletId: 'wallet-1',
      activity: 'OWNER_SET',
      details: { ownerAddress: '0x1234' },
      timestamp: 1772525000,
    });

    expect(dispatchSpy).toHaveBeenCalledWith('OWNER_REGISTERED', {
      walletId: 'wallet-1',
      ownerAddress: '0x1234',
    });
  });

  // -----------------------------------------------------------------------
  // wallet:activity with unknown activity -> no dispatch
  // -----------------------------------------------------------------------

  it('does not dispatch for unknown wallet:activity types (e.g., TX_REQUESTED)', () => {
    eventBus.emit('wallet:activity', {
      walletId: 'wallet-1',
      activity: 'TX_REQUESTED',
      timestamp: 1772525000,
    });

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // kill-switch:state-changed -> KILL_SWITCH_ACTIVATED
  // -----------------------------------------------------------------------

  it('maps kill-switch:state-changed SUSPENDED to KILL_SWITCH_ACTIVATED', () => {
    eventBus.emit('kill-switch:state-changed', {
      state: 'SUSPENDED',
      previousState: 'ACTIVE',
      activatedBy: 'admin',
      timestamp: 1772525000,
    });

    expect(dispatchSpy).toHaveBeenCalledWith('KILL_SWITCH_ACTIVATED', {
      activatedBy: 'admin',
      previousState: 'ACTIVE',
    });
  });

  // -----------------------------------------------------------------------
  // kill-switch:state-changed -> KILL_SWITCH_RECOVERED
  // -----------------------------------------------------------------------

  it('maps kill-switch:state-changed recovery (ACTIVE from SUSPENDED) to KILL_SWITCH_RECOVERED', () => {
    eventBus.emit('kill-switch:state-changed', {
      state: 'ACTIVE',
      previousState: 'SUSPENDED',
      activatedBy: 'admin',
      timestamp: 1772525000,
    });

    expect(dispatchSpy).toHaveBeenCalledWith('KILL_SWITCH_RECOVERED', {
      activatedBy: 'admin',
    });
  });

  it('does not dispatch KILL_SWITCH_RECOVERED when previousState is ACTIVE (no-op)', () => {
    eventBus.emit('kill-switch:state-changed', {
      state: 'ACTIVE',
      previousState: 'ACTIVE',
      activatedBy: 'system',
      timestamp: 1772525000,
    });

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // transaction:incoming -> TX_SUBMITTED
  // -----------------------------------------------------------------------

  it('maps transaction:incoming to TX_SUBMITTED with incoming payload', () => {
    eventBus.emit('transaction:incoming', {
      walletId: 'wallet-1',
      txHash: '0xfeed',
      fromAddress: '0xsender',
      amount: '5000000',
      tokenAddress: null,
      chain: 'evm',
      network: 'ethereum-mainnet',
      status: 'confirmed',
      timestamp: 1772525000,
    });

    expect(dispatchSpy).toHaveBeenCalledWith('TX_SUBMITTED', {
      txHash: '0xfeed',
      fromAddress: '0xsender',
      amount: '5000000',
      walletId: 'wallet-1',
      network: 'ethereum-mainnet',
      status: 'confirmed',
    });
  });

  // -----------------------------------------------------------------------
  // destroy() prevents further dispatching
  // -----------------------------------------------------------------------

  it('destroy() prevents further dispatching', () => {
    service.destroy();

    eventBus.emit('transaction:completed', {
      walletId: 'wallet-1',
      txId: 'tx-9',
      txHash: '0x999',
      type: 'TRANSFER',
      timestamp: 1772525000,
    });

    // dispatch is called by the listener, but exits immediately due to disposed flag
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    // Verify no webhook delivery was enqueued (no DB query)
    expect(sqlite._all).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Error isolation: dispatch error in one listener doesn't crash EventBus
  // -----------------------------------------------------------------------

  it('dispatch error does not crash EventBus (error isolation)', () => {
    // Make the first dispatch throw
    sqlite.prepare.mockImplementationOnce(() => {
      throw new Error('DB connection lost');
    });

    // This should not throw despite DB error
    expect(() => {
      eventBus.emit('transaction:completed', {
        walletId: 'wallet-1',
        txId: 'tx-err',
        txHash: '0xerr',
        type: 'TRANSFER',
        timestamp: 1772525000,
      });
    }).not.toThrow();

    // Subsequent events should still be dispatched
    sqlite.prepare.mockReturnValue({
      run: sqlite._run,
      all: sqlite._all,
      get: vi.fn(),
    });

    eventBus.emit('transaction:failed', {
      walletId: 'wallet-1',
      txId: 'tx-ok',
      error: 'some error',
      type: 'TRANSFER',
      timestamp: 1772525000,
    });

    expect(dispatchSpy).toHaveBeenCalledTimes(2);
  });
});
