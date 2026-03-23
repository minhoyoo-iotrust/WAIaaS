/**
 * Integration wiring tests for incoming TX monitoring pipeline.
 *
 * Verifies the 3 bug fixes from Plan 01 (Phase 230) work correctly
 * when components are wired together:
 *
 *   BUG-1: BackgroundWorkers instance sharing -- monitor registers 6 workers to the provided instance
 *   BUG-2: Polling worker handlers -- invoke subscriber.pollAll() for solana and ethereum chains
 *   BUG-3: Gap recovery wiring -- onGapRecovery invokes createGapRecoveryHandler -> subscriber.pollAll()
 *
 * These tests use real IncomingTxMonitorService with mock boundaries (DB, IChainSubscriber)
 * to verify cross-component wiring at the integration level.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IncomingTransaction as _IncomingTransaction } from '@waiaas/core';
import { IncomingTxMonitorService } from '../incoming-tx-monitor-service.js';
import type { IncomingTxMonitorConfig } from '../incoming-tx-monitor-service.js';

// ---------------------------------------------------------------------------
// Mock generateId for queue flush
// ---------------------------------------------------------------------------

let idCounter = 0;
vi.mock('../../../infrastructure/database/id.js', () => ({
  generateId: () => `uuid-${++idCounter}`,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

  const txFn = vi.fn((fn: any) => fn);

  return {
    prepare: prepareFn,
    transaction: txFn,
    exec: vi.fn(),
    _runFn: runFn,
    _getFn: getFn,
    _allFn: allFn,
    _prepareFn: prepareFn,
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

function createMockSubscriberFactory() {
  return vi.fn().mockReturnValue({
    chain: 'solana',
    connect: vi.fn().mockResolvedValue(undefined),
    waitForDisconnect: vi.fn().mockReturnValue(new Promise(() => {})),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    subscribedWallets: vi.fn().mockReturnValue([]),
    pollAll: vi.fn().mockResolvedValue(undefined),
    checkFinalized: vi.fn().mockResolvedValue(true),
    destroy: vi.fn().mockResolvedValue(undefined),
  });
}

/** Create a fresh IncomingTxMonitorService with isolated mocks. */
function createFreshService(opts: {
  configOverrides?: Partial<IncomingTxMonitorConfig>;
} = {}) {
  const sqlite = createMockSqlite();
  const eventBus = createMockEventBus();
  const workers = createMockWorkers();
  const subscriberFactory = createMockSubscriberFactory();

  // Return empty wallets from DB query
  sqlite._allFn.mockReturnValue([]);

  const service = new IncomingTxMonitorService({
    sqlite: sqlite as any,
    db: {} as any,
    workers: workers as any,
    eventBus: eventBus as any,
    killSwitchService: null,
    notificationService: null,
    subscriberFactory,
    config: makeConfig(opts.configOverrides),
  });

  return { service, sqlite, eventBus, workers, subscriberFactory };
}

// ===========================================================================
// Section 1: BUG-1 -- BackgroundWorkers Instance Sharing
// ===========================================================================

describe('BUG-1: BackgroundWorkers Instance Sharing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
  });

  it('monitor service registers workers to the provided BackgroundWorkers instance', async () => {
    const { service, workers } = createFreshService();
    await service.start();

    // Assert workers.register was called exactly 6 times
    expect(workers.register).toHaveBeenCalledTimes(6);

    // Assert the exact 6 worker names
    const registeredNames = workers.register.mock.calls.map(
      (call: any[]) => call[0],
    );
    expect(registeredNames).toEqual(
      expect.arrayContaining([
        'incoming-tx-flush',
        'incoming-tx-retention',
        'incoming-tx-confirm-solana',
        'incoming-tx-confirm-evm',
        'incoming-tx-poll-solana',
        'incoming-tx-poll-evm',
      ]),
    );

    // Verify exactly these 6 (no more, no less)
    expect(registeredNames).toHaveLength(6);

    await service.stop();
  });

  it('all registered worker handlers are callable functions', async () => {
    const { service, workers } = createFreshService();
    await service.start();

    // Extract handler functions from workers.register.mock.calls
    for (const call of workers.register.mock.calls) {
      const config = call[1] as { handler: unknown; interval: number };

      // Each registered worker should have a handler that is a function
      expect(typeof config.handler).toBe('function');

      // Call each handler and assert it does not throw
      const handler = config.handler as () => Promise<void>;
      await expect(handler()).resolves.not.toThrow();
    }

    await service.stop();
  });
});

// ===========================================================================
// Section 2: BUG-2 -- Polling Worker Handlers
// ===========================================================================

describe('BUG-2: Polling Worker Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
  });

  it('Solana polling worker calls pollAll() on solana subscribers', async () => {
    const sqlite = createMockSqlite();
    const eventBus = createMockEventBus();
    const workers = createMockWorkers();

    const mockPollAll = vi.fn().mockResolvedValue(undefined);
    const subscriberFactory = vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      waitForDisconnect: vi.fn().mockReturnValue(new Promise(() => {})),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      pollAll: mockPollAll,
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    // Return one solana wallet from DB
    sqlite._allFn.mockReturnValueOnce([
      { id: 'w1', chain: 'solana', environment: 'mainnet', public_key: 'pk1' },
    ]);

    const service = new IncomingTxMonitorService({
      sqlite: sqlite as any,
      db: {} as any,
      workers: workers as any,
      eventBus: eventBus as any,
      killSwitchService: null,
      notificationService: null,
      subscriberFactory,
      config: makeConfig(),
    });

    await service.start();

    // Extract 'incoming-tx-poll-solana' handler
    const pollSolanaCall = workers.register.mock.calls.find(
      (call: any[]) => call[0] === 'incoming-tx-poll-solana',
    );
    expect(pollSolanaCall).toBeDefined();

    const handler = pollSolanaCall![1].handler as () => Promise<void>;
    await handler();

    // Assert subscriber.pollAll() was called
    expect(mockPollAll).toHaveBeenCalledTimes(1);

    await service.stop();
  });

  it('EVM polling worker calls pollAll() on ethereum subscribers', async () => {
    const sqlite = createMockSqlite();
    const eventBus = createMockEventBus();
    const workers = createMockWorkers();

    const mockPollAll = vi.fn().mockResolvedValue(undefined);
    const subscriberFactory = vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      waitForDisconnect: vi.fn().mockReturnValue(new Promise(() => {})),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      pollAll: mockPollAll,
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    // Return one ethereum wallet from DB
    sqlite._allFn.mockReturnValueOnce([
      { id: 'w2', chain: 'ethereum', environment: 'mainnet', public_key: 'pk2' },
    ]);

    const service = new IncomingTxMonitorService({
      sqlite: sqlite as any,
      db: {} as any,
      workers: workers as any,
      eventBus: eventBus as any,
      killSwitchService: null,
      notificationService: null,
      subscriberFactory,
      config: makeConfig(),
    });

    await service.start();

    // Extract 'incoming-tx-poll-evm' handler
    const pollEvmCall = workers.register.mock.calls.find(
      (call: any[]) => call[0] === 'incoming-tx-poll-evm',
    );
    expect(pollEvmCall).toBeDefined();

    const handler = pollEvmCall![1].handler as () => Promise<void>;

    // Use fake timers to skip stagger delays between subscribers
    vi.useFakeTimers();
    const handlerPromise = handler();
    await vi.advanceTimersByTimeAsync(20_000);
    await handlerPromise;
    vi.useRealTimers();

    // Assert subscriber.pollAll() was called for each ethereum network
    // ethereum:mainnet expands to 6 networks (incl. hyperevm-mainnet), all sharing the same mock subscriber
    expect(mockPollAll).toHaveBeenCalledTimes(6);

    await service.stop();
  });

  it('polling worker handles subscriber.pollAll() errors gracefully', async () => {
    const sqlite = createMockSqlite();
    const eventBus = createMockEventBus();
    const workers = createMockWorkers();

    const mockPollAll = vi.fn().mockRejectedValue(new Error('RPC timeout'));
    const subscriberFactory = vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      waitForDisconnect: vi.fn().mockReturnValue(new Promise(() => {})),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      pollAll: mockPollAll,
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    // Return one solana wallet from DB
    sqlite._allFn.mockReturnValueOnce([
      { id: 'w1', chain: 'solana', environment: 'mainnet', public_key: 'pk1' },
    ]);

    const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const service = new IncomingTxMonitorService({
      sqlite: sqlite as any,
      db: {} as any,
      workers: workers as any,
      eventBus: eventBus as any,
      killSwitchService: null,
      notificationService: null,
      subscriberFactory,
      config: makeConfig(),
      logger: mockLogger,
    });

    await service.start();

    // Extract 'incoming-tx-poll-solana' handler
    const pollSolanaCall = workers.register.mock.calls.find(
      (call: any[]) => call[0] === 'incoming-tx-poll-solana',
    );
    const handler = pollSolanaCall![1].handler as () => Promise<void>;

    // Should NOT throw -- error is caught and logged
    await expect(handler()).resolves.not.toThrow();

    // Verify warning was logged via ILogger
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Solana polling worker error'),
    );

    await service.stop();
  });
});

// ===========================================================================
// Section 3: BUG-3 -- Gap Recovery Wiring
// ===========================================================================

describe('BUG-3: Gap Recovery Wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
  });

  it('onGapRecovery invokes createGapRecoveryHandler which calls subscriber.pollAll()', async () => {
    const sqlite = createMockSqlite();
    const eventBus = createMockEventBus();
    const workers = createMockWorkers();

    const mockPollAll = vi.fn().mockResolvedValue(undefined);
    const subscriberFactory = vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      waitForDisconnect: vi.fn().mockReturnValue(new Promise(() => {})),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      pollAll: mockPollAll,
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    // Return one solana wallet from DB
    sqlite._allFn.mockReturnValueOnce([
      { id: 'w1', chain: 'solana', environment: 'mainnet', public_key: 'pk1' },
    ]);

    const service = new IncomingTxMonitorService({
      sqlite: sqlite as any,
      db: {} as any,
      workers: workers as any,
      eventBus: eventBus as any,
      killSwitchService: null,
      notificationService: null,
      subscriberFactory,
      config: makeConfig(),
    });

    await service.start();

    // Access the multiplexer's onGapRecovery callback via internal deps
    const multiplexer = (service as any).multiplexer;
    const onGapRecovery = (multiplexer as any).deps.onGapRecovery;
    expect(onGapRecovery).toBeDefined();
    expect(typeof onGapRecovery).toBe('function');

    // Call onGapRecovery for solana:solana-mainnet
    await onGapRecovery('solana', 'solana-mainnet', ['w1']);

    // Assert subscriber.pollAll() was called (via createGapRecoveryHandler -> entry.subscriber.pollAll())
    expect(mockPollAll).toHaveBeenCalledTimes(1);

    await service.stop();
  });

  it('onGapRecovery handles missing chain:network gracefully', async () => {
    const sqlite = createMockSqlite();
    const eventBus = createMockEventBus();
    const workers = createMockWorkers();

    const mockPollAll = vi.fn().mockResolvedValue(undefined);
    const subscriberFactory = vi.fn().mockReturnValue({
      chain: 'solana',
      connect: vi.fn().mockResolvedValue(undefined),
      waitForDisconnect: vi.fn().mockReturnValue(new Promise(() => {})),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      subscribedWallets: vi.fn().mockReturnValue([]),
      pollAll: mockPollAll,
      checkFinalized: vi.fn().mockResolvedValue(true),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    // Only return a solana wallet (no ethereum)
    sqlite._allFn.mockReturnValueOnce([
      { id: 'w1', chain: 'solana', environment: 'mainnet', public_key: 'pk1' },
    ]);

    const service = new IncomingTxMonitorService({
      sqlite: sqlite as any,
      db: {} as any,
      workers: workers as any,
      eventBus: eventBus as any,
      killSwitchService: null,
      notificationService: null,
      subscriberFactory,
      config: makeConfig(),
    });

    await service.start();

    // Access onGapRecovery
    const multiplexer = (service as any).multiplexer;
    const onGapRecovery = (multiplexer as any).deps.onGapRecovery;

    // Call onGapRecovery for 'ethereum:ethereum-mainnet' which has no subscriber
    // Should NOT throw -- createGapRecoveryHandler gracefully skips missing entries
    await expect(
      onGapRecovery('ethereum', 'ethereum-mainnet', ['w1']),
    ).resolves.not.toThrow();

    // solana pollAll should NOT have been called (we requested ethereum)
    expect(mockPollAll).not.toHaveBeenCalled();

    await service.stop();
  });
});

// ===========================================================================
// Section 4: IChainSubscriber Interface Contract Tests
// ===========================================================================

describe('IChainSubscriber interface contract', () => {
  it('interface includes optional polling/confirmation methods', () => {
    // Verify that a mock subscriber satisfying IChainSubscriber
    // can have pollAll, checkFinalized, and getBlockNumber as optional methods
    const subscriber = createMockSubscriberFactory()();

    // Base methods (required)
    expect(typeof subscriber.subscribe).toBe('function');
    expect(typeof subscriber.unsubscribe).toBe('function');
    expect(typeof subscriber.subscribedWallets).toBe('function');
    expect(typeof subscriber.connect).toBe('function');
    expect(typeof subscriber.waitForDisconnect).toBe('function');
    expect(typeof subscriber.destroy).toBe('function');

    // Optional polling/confirmation methods
    expect(typeof subscriber.pollAll).toBe('function');
    expect(typeof subscriber.checkFinalized).toBe('function');
  });

  it('pollAll is callable via optional chaining on IChainSubscriber', async () => {
    const subscriber = createMockSubscriberFactory()();
    // This mirrors how incoming-tx-monitor-service.ts calls pollAll
    await subscriber.pollAll?.();
    expect(subscriber.pollAll).toHaveBeenCalledTimes(1);
  });

  it('checkFinalized is callable via optional chaining on IChainSubscriber', async () => {
    const subscriber = createMockSubscriberFactory()();
    const result = await subscriber.checkFinalized?.('tx-hash-123');
    expect(result).toBe(true);
    expect(subscriber.checkFinalized).toHaveBeenCalledWith('tx-hash-123');
  });

  it('subscriber without optional methods works with optional chaining', async () => {
    // A minimal subscriber without optional methods (e.g., a future chain adapter)
    const minimalSubscriber: {
      chain: 'solana';
      subscribe: ReturnType<typeof vi.fn>;
      unsubscribe: ReturnType<typeof vi.fn>;
      subscribedWallets: ReturnType<typeof vi.fn>;
      connect: ReturnType<typeof vi.fn>;
      waitForDisconnect: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      pollAll?: () => Promise<void>;
      checkFinalized?: (txHash: string) => Promise<boolean>;
      getBlockNumber?: () => Promise<bigint>;
    } = {
      chain: 'solana' as const,
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      subscribedWallets: vi.fn().mockReturnValue([]),
      connect: vi.fn().mockResolvedValue(undefined),
      waitForDisconnect: vi.fn().mockReturnValue(new Promise(() => {})),
      destroy: vi.fn().mockResolvedValue(undefined),
      // No pollAll, checkFinalized, or getBlockNumber -- tests verify optional chaining
    };

    // Optional chaining should return undefined without throwing
    const pollResult = await minimalSubscriber.pollAll?.();
    expect(pollResult).toBeUndefined();

    const finalizedResult = await minimalSubscriber.checkFinalized?.('tx-hash');
    expect(finalizedResult).toBeUndefined();

    const blockResult = await minimalSubscriber.getBlockNumber?.();
    expect(blockResult).toBeUndefined();
  });
});
