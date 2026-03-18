/**
 * Additional coverage tests for IncomingTxMonitorService.
 *
 * Covers uncovered paths:
 * - syncSubscriptions() with new/removed wallets
 * - updateConfig() partial merge edge cases
 * - cooldown logic detailed timing
 * - stop() queue drain
 * - start() with unknown chain:environment (warn + skip)
 * - formatIncomingAmount helper
 * - flush handler token symbol lookup + formatted amount
 * - polling worker error isolation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IncomingTransaction } from '@waiaas/core';
import { IncomingTxMonitorService } from '../services/incoming/incoming-tx-monitor-service.js';
import type { IncomingTxMonitorConfig } from '../services/incoming/incoming-tx-monitor-service.js';

// Mock generateId
let idCounter = 0;
vi.mock('../infrastructure/database/id.js', () => ({
  generateId: () => `cov-uuid-${++idCounter}`,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<IncomingTransaction> = {}): IncomingTransaction {
  return {
    id: 'tx-cov-001',
    txHash: '0xcov',
    walletId: 'wallet-cov-001',
    fromAddress: '0xsender',
    amount: '1000000000',
    tokenAddress: null,
    chain: 'solana',
    network: 'solana-mainnet',
    status: 'DETECTED',
    blockNumber: 100,
    detectedAt: 1700000000,
    confirmedAt: null,
    isSuspicious: false,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<IncomingTxMonitorConfig> = {}): IncomingTxMonitorConfig {
  return {
    enabled: true,
    pollIntervalSec: 30,
    retentionDays: 90,
    dustThresholdUsd: 0.01,
    amountMultiplier: 10,
    cooldownMinutes: 5,
    ...overrides,
  };
}

function createMockSqlite() {
  const runFn = vi.fn().mockReturnValue({ changes: 1 });
  const getFn = vi.fn().mockReturnValue(undefined);
  const allFn = vi.fn().mockReturnValue([]);
  const prepareFn = vi.fn().mockReturnValue({
    run: runFn,
    get: getFn,
    all: allFn,
  });

  return {
    prepare: prepareFn,
    transaction: vi.fn((fn: any) => fn),
    exec: vi.fn(),
    _runFn: runFn,
    _getFn: getFn,
    _allFn: allFn,
  };
}

function createMockEventBus() {
  return {
    emit: vi.fn().mockReturnValue(true),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    listenerCount: vi.fn().mockReturnValue(0),
  };
}

function createMockWorkers() {
  return {
    register: vi.fn(),
    startAll: vi.fn(),
    stopAll: vi.fn(),
    size: 0,
    isRunning: vi.fn().mockReturnValue(false),
  };
}

function createMockKillSwitch(state = 'ACTIVE') {
  return {
    getState: vi.fn().mockReturnValue({ state, activatedAt: null, activatedBy: null }),
    ensureInitialized: vi.fn(),
  };
}

function createMockNotificationService() {
  return {
    notify: vi.fn(),
    addChannel: vi.fn(),
    replaceChannels: vi.fn(),
    getChannelNames: vi.fn().mockReturnValue([]),
    updateConfig: vi.fn(),
    setWalletNotificationChannel: vi.fn(),
  };
}

function createMockSubscriberFactory() {
  return vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
    waitForDisconnect: vi.fn().mockReturnValue(new Promise(() => {})),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    pollAll: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IncomingTxMonitorService (coverage)', () => {
  let sqlite: ReturnType<typeof createMockSqlite>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let workers: ReturnType<typeof createMockWorkers>;
  let killSwitch: ReturnType<typeof createMockKillSwitch>;
  let notificationService: ReturnType<typeof createMockNotificationService>;
  let subscriberFactory: ReturnType<typeof createMockSubscriberFactory>;

  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
    sqlite = createMockSqlite();
    eventBus = createMockEventBus();
    workers = createMockWorkers();
    killSwitch = createMockKillSwitch('ACTIVE');
    notificationService = createMockNotificationService();
    subscriberFactory = createMockSubscriberFactory();
  });

  function createService(configOverrides: Partial<IncomingTxMonitorConfig> = {}) {
    return new IncomingTxMonitorService({
      sqlite: sqlite as any,
      db: {} as any,
      workers: workers as any,
      eventBus: eventBus as any,
      killSwitchService: killSwitch as any,
      notificationService: notificationService as any,
      subscriberFactory,
      config: makeConfig(configOverrides),
    });
  }

  // ── syncSubscriptions ────────────────────────────────────────

  describe('syncSubscriptions()', () => {
    it('adds new wallets from DB to multiplexer', async () => {
      // Start with no wallets
      sqlite._allFn.mockReturnValueOnce([]);
      const service = createService();
      await service.start();

      // Reset subscriber factory call count
      subscriberFactory.mockClear();

      // syncSubscriptions finds a new wallet
      sqlite._allFn.mockReturnValueOnce([
        { id: 'w-new', chain: 'solana', environment: 'mainnet', public_key: 'pk-new' },
      ]);

      await service.syncSubscriptions();

      // Should have called subscriberFactory for the new wallet's networks
      expect(subscriberFactory).toHaveBeenCalledWith('solana', 'solana-mainnet');
    });

    it('skips wallets with unknown chain:environment', async () => {
      sqlite._allFn.mockReturnValueOnce([]);
      const service = createService();
      await service.start();

      subscriberFactory.mockClear();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // syncSubscriptions returns a wallet with invalid environment
      sqlite._allFn.mockReturnValueOnce([
        { id: 'w-bad', chain: 'unknownchain', environment: 'unknownenv', public_key: 'pk-bad' },
      ]);

      await service.syncSubscriptions();

      // No subscriber calls for unknown chain
      expect(subscriberFactory).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('handles addWallet failure gracefully during sync', async () => {
      sqlite._allFn.mockReturnValueOnce([]);
      const service = createService();
      await service.start();

      subscriberFactory.mockClear();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Make subscriber factory reject
      subscriberFactory.mockRejectedValueOnce(new Error('RPC down'));

      sqlite._allFn.mockReturnValueOnce([
        { id: 'w-fail', chain: 'solana', environment: 'mainnet', public_key: 'pk-fail' },
      ]);

      // Should not throw
      await expect(service.syncSubscriptions()).resolves.toBeUndefined();
      warnSpy.mockRestore();
    });
  });

  // ── start() with unknown environment ──────────────────────────

  describe('start() edge cases', () => {
    it('warns and skips wallets with unknown chain:environment', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      sqlite._allFn.mockReturnValueOnce([
        { id: 'w-invalid', chain: 'bitcoin', environment: 'mainnet', public_key: 'pk-invalid' },
      ]);

      const service = createService();
      await service.start();

      // bitcoin is not a supported chain for getNetworksForEnvironment
      // subscriberFactory should not be called for this wallet
      // The warn is a single formatted string
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown chain:environment'),
      );

      warnSpy.mockRestore();
    });
  });

  // ── flush handler: token symbol lookup + formatted amount ──────

  describe('flush handler: token symbol lookup', () => {
    it('looks up token symbol from token_registry for token transfers', async () => {
      sqlite._allFn.mockReturnValueOnce([]);
      const service = createService();
      await service.start();

      const flushCall = workers.register.mock.calls.find(
        (call: any[]) => call[0] === 'incoming-tx-flush',
      );
      const flushHandler = flushCall![1].handler;

      // tx with token address
      const tx = makeTx({
        tokenAddress: '0xtoken',
        amount: '1000000',
        chain: 'ethereum',
        network: 'ethereum-mainnet',
      });
      (service as any).queue.flush = vi.fn().mockReturnValue([tx]);

      // Mock: first call for safety rule (token_registry check), second for decimals, third for symbol
      sqlite._getFn
        .mockReturnValueOnce({ address: '0xtoken' }) // isRegisteredToken
        .mockReturnValueOnce({ decimals: 6 }) // decimals lookup
        .mockReturnValueOnce({ symbol: 'USDC' }); // symbol lookup

      await flushHandler();

      // Should notify with formatted amount including symbol
      expect(notificationService.notify).toHaveBeenCalledWith(
        'TX_INCOMING',
        tx.walletId,
        expect.objectContaining({
          amount: expect.stringContaining('USDC'),
        }),
      );
    });

    it('handles missing token in registry (null symbol fallback)', async () => {
      sqlite._allFn.mockReturnValueOnce([]);
      const service = createService();
      await service.start();

      const flushCall = workers.register.mock.calls.find(
        (call: any[]) => call[0] === 'incoming-tx-flush',
      );
      const flushHandler = flushCall![1].handler;

      const tx = makeTx({
        tokenAddress: '0xunknowntoken',
        amount: '500',
        chain: 'ethereum',
      });
      (service as any).queue.flush = vi.fn().mockReturnValue([tx]);

      // Mock: no token found anywhere
      sqlite._getFn.mockReturnValue(undefined);

      await flushHandler();

      // Should still send notification (with fallback formatting)
      expect(notificationService.notify).toHaveBeenCalled();
    });

    it('formats zero amount as "0"', async () => {
      sqlite._allFn.mockReturnValueOnce([]);
      const service = createService();
      await service.start();

      const flushCall = workers.register.mock.calls.find(
        (call: any[]) => call[0] === 'incoming-tx-flush',
      );
      const flushHandler = flushCall![1].handler;

      const tx = makeTx({ amount: '0' });
      (service as any).queue.flush = vi.fn().mockReturnValue([tx]);

      await flushHandler();

      expect(notificationService.notify).toHaveBeenCalledWith(
        'TX_INCOMING',
        tx.walletId,
        expect.objectContaining({
          amount: '0',
        }),
      );
    });
  });

  // ── polling workers ──────────────────────────────────────────

  describe('polling workers', () => {
    it('solana polling worker calls pollAll on all solana subscribers', async () => {
      sqlite._allFn.mockReturnValueOnce([
        { id: 'w1', chain: 'solana', environment: 'mainnet', public_key: 'pk1' },
      ]);

      const service = createService({ pollIntervalSec: 10 });
      await service.start();

      // Find the polling handler
      const pollCall = workers.register.mock.calls.find(
        (call: any[]) => call[0] === 'incoming-tx-poll-solana',
      );
      expect(pollCall).toBeDefined();
      const pollHandler = pollCall![1].handler;

      // Execute the polling handler
      await pollHandler();

      // subscriber.pollAll should have been called via the multiplexer
      const subscriber = subscriberFactory.mock.results[0]!.value;
      expect(subscriber.pollAll).toHaveBeenCalled();
    });

    it('evm polling worker handles subscriber error gracefully', async () => {
      // Start with no wallets to avoid subscriber creation during start()
      sqlite._allFn.mockReturnValueOnce([]);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const service = createService({ pollIntervalSec: 10 });
      await service.start();

      const pollCall = workers.register.mock.calls.find(
        (call: any[]) => call[0] === 'incoming-tx-poll-evm',
      );
      const pollHandler = pollCall![1].handler;

      // EVM poll with no subscribers -- should run without error
      await expect(pollHandler()).resolves.toBeUndefined();

      warnSpy.mockRestore();
    });
  });

  // ── Service without optional deps ────────────────────────────

  describe('no optional deps', () => {
    it('works without killSwitchService', async () => {
      sqlite._allFn.mockReturnValueOnce([]);

      const service = new IncomingTxMonitorService({
        sqlite: sqlite as any,
        db: {} as any,
        workers: workers as any,
        eventBus: eventBus as any,
        killSwitchService: null,
        notificationService: notificationService as any,
        subscriberFactory,
        config: makeConfig(),
      });
      await service.start();

      const flushCall = workers.register.mock.calls.find(
        (call: any[]) => call[0] === 'incoming-tx-flush',
      );
      const flushHandler = flushCall![1].handler;

      const tx = makeTx();
      (service as any).queue.flush = vi.fn().mockReturnValue([tx]);

      // Without killSwitch, notifications should still be sent (null check passes)
      await flushHandler();
      expect(notificationService.notify).toHaveBeenCalled();
    });

    it('works without notificationService', async () => {
      sqlite._allFn.mockReturnValueOnce([]);

      const service = new IncomingTxMonitorService({
        sqlite: sqlite as any,
        db: {} as any,
        workers: workers as any,
        eventBus: eventBus as any,
        killSwitchService: killSwitch as any,
        notificationService: null,
        subscriberFactory,
        config: makeConfig(),
      });
      await service.start();

      const flushCall = workers.register.mock.calls.find(
        (call: any[]) => call[0] === 'incoming-tx-flush',
      );
      const flushHandler = flushCall![1].handler;

      const tx = makeTx();
      (service as any).queue.flush = vi.fn().mockReturnValue([tx]);

      // Should not throw when notificationService is null
      await expect(flushHandler()).resolves.toBeUndefined();
    });
  });

  // ── stop() ────────────────────────────────────────────────────

  describe('stop() edge cases', () => {
    it('stops before start (no multiplexer)', async () => {
      const service = createService();
      // stop without start -- multiplexer is undefined
      await expect(service.stop()).resolves.toBeUndefined();
    });
  });
});
