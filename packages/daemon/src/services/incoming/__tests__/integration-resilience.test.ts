/**
 * Integration resilience tests for incoming TX pipeline.
 *
 * Tests three cross-component security and resilience properties:
 *
 * 1. Gap Recovery: SubscriptionMultiplexer reconnect -> onGapRecovery callback,
 *    createGapRecoveryHandler factory -> pollAll -> queue -> DB
 * 2. KillSwitch Notification Suppression (M-03): DB writes persist + EventBus
 *    events fire, but NotificationService is suppressed when SUSPENDED/LOCKED
 * 3. Notification Cooldown / Dust Flood (M-07): per-wallet per-event-type
 *    cooldown limits alert volume under dust attack
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IncomingTransaction } from '@waiaas/core';
import { IncomingTxMonitorService } from '../incoming-tx-monitor-service.js';
import type { IncomingTxMonitorConfig } from '../incoming-tx-monitor-service.js';
import { SubscriptionMultiplexer } from '../subscription-multiplexer.js';
import { IncomingTxQueue } from '../incoming-tx-queue.js';
import { createGapRecoveryHandler } from '../incoming-tx-workers.js';

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

function makeTx(overrides: Partial<IncomingTransaction> = {}): IncomingTransaction {
  return {
    id: '',
    txHash: `0x${Math.random().toString(16).slice(2, 10)}`,
    walletId: 'wallet-001',
    fromAddress: '0xsender',
    amount: '1000000000',
    tokenAddress: null,
    chain: 'solana',
    network: 'mainnet',
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

function createMockKillSwitch(state = 'ACTIVE') {
  return {
    getState: vi.fn().mockReturnValue({
      state,
      activatedAt: null,
      activatedBy: null,
    }),
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

/** Create a fresh IncomingTxMonitorService with isolated mocks. */
function createFreshService(opts: {
  killSwitchState?: string;
  cooldownMinutes?: number;
  configOverrides?: Partial<IncomingTxMonitorConfig>;
} = {}) {
  const sqlite = createMockSqlite();
  const eventBus = createMockEventBus();
  const workers = createMockWorkers();
  const killSwitch = createMockKillSwitch(opts.killSwitchState ?? 'ACTIVE');
  const notificationService = createMockNotificationService();
  const subscriberFactory = createMockSubscriberFactory();

  // Return empty wallets from DB query
  sqlite._allFn.mockReturnValue([]);

  const service = new IncomingTxMonitorService({
    sqlite: sqlite as any,
    db: {} as any,
    workers: workers as any,
    eventBus: eventBus as any,
    killSwitchService: killSwitch as any,
    notificationService: notificationService as any,
    subscriberFactory,
    config: makeConfig({
      cooldownMinutes: opts.cooldownMinutes ?? 5,
      ...opts.configOverrides,
    }),
  });

  return { service, sqlite, eventBus, workers, killSwitch, notificationService, subscriberFactory };
}

/**
 * Start a service and extract its flush handler from workers.register calls.
 */
async function startAndGetFlushHandler(service: IncomingTxMonitorService, workers: ReturnType<typeof createMockWorkers>) {
  await service.start();
  const flushCall = workers.register.mock.calls.find(
    (call: any[]) => call[0] === 'incoming-tx-flush',
  );
  expect(flushCall).toBeDefined();
  return flushCall![1].handler as () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Section 1: Gap Recovery Integration
// ---------------------------------------------------------------------------

describe('Integration Resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
  });

  describe('Gap Recovery Integration', () => {
    it('SubscriptionMultiplexer reconnect triggers onGapRecovery callback', async () => {
      // Create a mock subscriber with a controllable disconnect trigger
      let resolveDisconnect!: () => void;
      const disconnectPromise = new Promise<void>((resolve) => {
        resolveDisconnect = resolve;
      });

      const mockSubscriber = {
        connect: vi.fn().mockResolvedValue(undefined),
        waitForDisconnect: vi.fn()
          .mockReturnValueOnce(disconnectPromise) // first call: controllable
          .mockReturnValue(new Promise(() => {})), // subsequent: never resolve
        subscribe: vi.fn().mockResolvedValue(undefined),
        unsubscribe: vi.fn().mockResolvedValue(undefined),
        pollAll: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
      };

      const onGapRecovery = vi.fn().mockResolvedValue(undefined);
      const onTransaction = vi.fn();

      const multiplexer = new SubscriptionMultiplexer({
        subscriberFactory: () => mockSubscriber as unknown as import('@waiaas/core').IChainSubscriber,
        onTransaction,
        onGapRecovery,
        reconnectConfig: {
          initialDelayMs: 10,
          maxDelayMs: 20,
          maxAttempts: 5,
          jitterFactor: 0,
          pollingFallbackThreshold: 3,
        },
      });

      // Add a wallet (triggers connect + starts reconnect monitoring)
      await multiplexer.addWallet('solana', 'mainnet', 'wallet-1', 'addr1');

      // Trigger disconnect
      resolveDisconnect();

      // Wait for reconnectLoop to reconnect and trigger gap recovery
      // reconnectLoop: detects disconnect -> RECONNECTING -> connect() -> WS_ACTIVE -> gap recovery
      await vi.waitFor(() => {
        expect(onGapRecovery).toHaveBeenCalled();
      }, { timeout: 2000 });

      expect(onGapRecovery).toHaveBeenCalledWith(
        'solana',
        'mainnet',
        expect.arrayContaining(['wallet-1']),
      );

      // Cleanup
      await multiplexer.stopAll();
    });

    it('createGapRecoveryHandler factory calls pollAll on correct subscriber', async () => {
      const mockPollAll = vi.fn().mockResolvedValue(undefined);
      const subscribers = new Map([
        ['solana:mainnet', { subscriber: { pollAll: mockPollAll } }],
        ['ethereum:sepolia', { subscriber: { pollAll: vi.fn() } }],
      ]);

      const handler = createGapRecoveryHandler({ subscribers });
      await handler('solana', 'mainnet', ['wallet-1', 'wallet-2']);

      expect(mockPollAll).toHaveBeenCalledTimes(1);
      // Verify ethereum:sepolia subscriber was NOT called
      const evmPollAll = subscribers.get('ethereum:sepolia')!.subscriber.pollAll as ReturnType<typeof vi.fn>;
      expect(evmPollAll).not.toHaveBeenCalled();
    });

    it('50-block gap simulation: handler factory -> queue -> flush -> DB', async () => {
      const queue = new IncomingTxQueue();
      const sqlite = createMockSqlite();

      // Create a subscriber whose pollAll pushes 50 transactions into the queue
      const mockPollAll = vi.fn().mockImplementation(async () => {
        for (let i = 0; i < 50; i++) {
          queue.push(makeTx({
            txHash: `0xgap-${i}`,
            walletId: 'wallet-gap',
            blockNumber: 1000 + i,
          }));
        }
      });

      const subscribers = new Map([
        ['solana:mainnet', { subscriber: { pollAll: mockPollAll } }],
      ]);

      const handler = createGapRecoveryHandler({ subscribers });
      await handler('solana', 'mainnet', ['wallet-gap']);

      // Verify queue has 50 items
      expect(queue.size).toBe(50);

      // Flush queue to mock DB
      const inserted = queue.flush(sqlite as any);

      // All 50 should be flushed (MAX_BATCH=100, so all fit in one cycle)
      expect(inserted).toHaveLength(50);

      // Verify 50 stmt.run calls (each INSERT)
      expect(sqlite._runFn).toHaveBeenCalledTimes(50);
    });
  });

  // ---------------------------------------------------------------------------
  // Section 2: KillSwitch Notification Suppression (M-03)
  // ---------------------------------------------------------------------------

  describe('KillSwitch Notification Suppression (M-03)', () => {
    it('M-03: KillSwitch ACTIVE sends events AND notifications', async () => {
      const { service, workers, eventBus, notificationService } = createFreshService({
        killSwitchState: 'ACTIVE',
      });

      const flushHandler = await startAndGetFlushHandler(service, workers);

      // Push 3 transactions
      const txs = [
        makeTx({ txHash: '0xact1' }),
        makeTx({ txHash: '0xact2' }),
        makeTx({ txHash: '0xact3' }),
      ];
      (service as any).queue.flush = vi.fn().mockReturnValue(txs);

      await flushHandler();

      // All 3 events should fire
      const incomingEmits = eventBus.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'transaction:incoming',
      );
      expect(incomingEmits).toHaveLength(3);

      // At least 1 notification (first TX triggers, others cooldown-suppressed for same wallet)
      expect(notificationService.notify).toHaveBeenCalledTimes(1);
    });

    it('M-03: KillSwitch SUSPENDED fires events but suppresses ALL notifications', async () => {
      const { service, workers, eventBus, notificationService } = createFreshService({
        killSwitchState: 'SUSPENDED',
      });

      const flushHandler = await startAndGetFlushHandler(service, workers);

      const txs = [
        makeTx({ txHash: '0xsus1' }),
        makeTx({ txHash: '0xsus2' }),
        makeTx({ txHash: '0xsus3' }),
      ];
      (service as any).queue.flush = vi.fn().mockReturnValue(txs);

      await flushHandler();

      // Events always fire
      const incomingEmits = eventBus.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'transaction:incoming',
      );
      expect(incomingEmits).toHaveLength(3);

      // NO notifications when SUSPENDED
      expect(notificationService.notify).not.toHaveBeenCalled();
    });

    it('M-03: KillSwitch LOCKED fires events but suppresses ALL notifications', async () => {
      const { service, workers, eventBus, notificationService } = createFreshService({
        killSwitchState: 'LOCKED',
      });

      const flushHandler = await startAndGetFlushHandler(service, workers);

      const txs = [
        makeTx({ txHash: '0xlck1' }),
        makeTx({ txHash: '0xlck2' }),
        makeTx({ txHash: '0xlck3' }),
      ];
      (service as any).queue.flush = vi.fn().mockReturnValue(txs);

      await flushHandler();

      // Events fire
      expect(eventBus.emit).toHaveBeenCalled();
      const incomingEmits = eventBus.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'transaction:incoming',
      );
      expect(incomingEmits).toHaveLength(3);

      // Notifications suppressed
      expect(notificationService.notify).not.toHaveBeenCalled();
    });

    it('M-03: KillSwitch SUSPENDED still writes suspicious flag to DB and fires suspicious event', async () => {
      const { service, workers, sqlite, eventBus, notificationService } = createFreshService({
        killSwitchState: 'SUSPENDED',
      });

      const flushHandler = await startAndGetFlushHandler(service, workers);

      // Create a suspicious transaction (unknown token, token_registry returns undefined)
      const tx = makeTx({ txHash: '0xsuspicious', tokenAddress: '0xunknown-token' });
      (service as any).queue.flush = vi.fn().mockReturnValue([tx]);
      sqlite._getFn.mockReturnValue(undefined); // token_registry lookup returns no result

      await flushHandler();

      // DB UPDATE is_suspicious=1 should be called
      expect(sqlite.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE incoming_transactions SET is_suspicious = 1'),
      );

      // suspicious event should fire
      const suspiciousEmits = eventBus.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'transaction:incoming:suspicious',
      );
      expect(suspiciousEmits).toHaveLength(1);

      // But notifications are NOT sent
      expect(notificationService.notify).not.toHaveBeenCalled();
    });

    it('M-03: KillSwitch transition ACTIVE->SUSPENDED suppresses notifications on second flush', async () => {
      const { service, workers, eventBus, killSwitch, notificationService } = createFreshService({
        killSwitchState: 'ACTIVE',
      });

      const flushHandler = await startAndGetFlushHandler(service, workers);

      // First flush with ACTIVE: notification sent
      const tx1 = makeTx({ txHash: '0xtrans1' });
      (service as any).queue.flush = vi.fn().mockReturnValue([tx1]);
      await flushHandler();
      expect(notificationService.notify).toHaveBeenCalledTimes(1);

      // Transition to SUSPENDED
      killSwitch.getState.mockReturnValue({
        state: 'SUSPENDED',
        activatedAt: null,
        activatedBy: null,
      });

      // Clear cooldown for clean test of KillSwitch behavior
      (service as any).notifyCooldown.clear();

      // Second flush with SUSPENDED: events fire, notification suppressed
      const tx2 = makeTx({ txHash: '0xtrans2' });
      (service as any).queue.flush = vi.fn().mockReturnValue([tx2]);
      await flushHandler();

      // Events still fire for second tx
      const allIncomingEmits = eventBus.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'transaction:incoming',
      );
      expect(allIncomingEmits).toHaveLength(2); // 1 from first flush + 1 from second

      // Still only 1 notification (second was suppressed by KillSwitch, not cooldown)
      expect(notificationService.notify).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Section 3: Notification Cooldown / Dust Flood (M-07)
  // ---------------------------------------------------------------------------

  describe('Notification Cooldown / Dust Flood (M-07)', () => {
    it('M-07: 50 dust TX flood produces exactly 1 notification', async () => {
      const { service, workers, eventBus, notificationService, sqlite } = createFreshService({
        killSwitchState: 'ACTIVE',
        cooldownMinutes: 5,
      });

      const flushHandler = await startAndGetFlushHandler(service, workers);

      // Create 50 unique transactions for the same wallet
      const txs: IncomingTransaction[] = [];
      for (let i = 0; i < 50; i++) {
        txs.push(makeTx({
          txHash: `0xdust-${i}`,
          walletId: 'wallet-dust',
        }));
      }

      (service as any).queue.flush = vi.fn().mockReturnValue(txs);
      await flushHandler();

      // Exactly 1 notification (first TX triggers, remaining 49 cooldown-suppressed)
      expect(notificationService.notify).toHaveBeenCalledTimes(1);

      // All 50 events still fire
      const incomingEmits = eventBus.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'transaction:incoming',
      );
      expect(incomingEmits).toHaveLength(50);

      // All 50 DB records inserted (via cursor updates -- one per tx)
      // Verify cursor update was called 50 times (incoming_tx_cursors INSERT OR REPLACE)
      const cursorCalls = sqlite.prepare.mock.calls.filter(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('incoming_tx_cursors'),
      );
      expect(cursorCalls.length).toBe(50);
    });

    it('M-07: cooldown per wallet isolation -- each wallet gets its own notification', async () => {
      const { service, workers, notificationService } = createFreshService({
        killSwitchState: 'ACTIVE',
        cooldownMinutes: 5,
      });

      const flushHandler = await startAndGetFlushHandler(service, workers);

      // Mix of wallet-A and wallet-B transactions
      const txs = [
        makeTx({ txHash: '0xwa1', walletId: 'wallet-A' }),
        makeTx({ txHash: '0xwa2', walletId: 'wallet-A' }),
        makeTx({ txHash: '0xwb1', walletId: 'wallet-B' }),
        makeTx({ txHash: '0xwb2', walletId: 'wallet-B' }),
      ];

      (service as any).queue.flush = vi.fn().mockReturnValue(txs);
      await flushHandler();

      // wallet-A gets 1 notification, wallet-B gets 1 notification = 2 total
      expect(notificationService.notify).toHaveBeenCalledTimes(2);

      // Verify correct wallet IDs
      const notifiedWallets = notificationService.notify.mock.calls.map(
        (call: any[]) => call[1], // second arg is walletId
      );
      expect(notifiedWallets).toContain('wallet-A');
      expect(notifiedWallets).toContain('wallet-B');
    });

    it('M-07: cooldown per event type -- normal and suspicious get separate cooldowns', async () => {
      const { service, workers, sqlite, notificationService } = createFreshService({
        killSwitchState: 'ACTIVE',
        cooldownMinutes: 5,
      });

      const flushHandler = await startAndGetFlushHandler(service, workers);

      // First: a normal transaction
      const normalTx = makeTx({ txHash: '0xnormal', walletId: 'wallet-mix' });
      (service as any).queue.flush = vi.fn().mockReturnValue([normalTx]);
      await flushHandler();

      // Then: a suspicious transaction (unknown token)
      const suspiciousTx = makeTx({
        txHash: '0xsuspicious',
        walletId: 'wallet-mix',
        tokenAddress: '0xbad-token',
      });
      sqlite._getFn.mockReturnValue(undefined); // token not registered
      (service as any).queue.flush = vi.fn().mockReturnValue([suspiciousTx]);
      await flushHandler();

      // 2 notifications: TX_INCOMING + TX_INCOMING_SUSPICIOUS (different event types)
      expect(notificationService.notify).toHaveBeenCalledTimes(2);

      const eventTypes = notificationService.notify.mock.calls.map(
        (call: any[]) => call[0], // first arg is eventType
      );
      expect(eventTypes).toContain('TX_INCOMING');
      expect(eventTypes).toContain('TX_INCOMING_SUSPICIOUS');
    });

    it('M-07: cooldown expiry allows notifications to resume', async () => {
      const { service, workers, notificationService } = createFreshService({
        killSwitchState: 'ACTIVE',
        cooldownMinutes: 5,
      });

      const flushHandler = await startAndGetFlushHandler(service, workers);

      // First flush: notification sent
      const tx1 = makeTx({ txHash: '0xexp1', walletId: 'wallet-exp' });
      (service as any).queue.flush = vi.fn().mockReturnValue([tx1]);
      await flushHandler();
      expect(notificationService.notify).toHaveBeenCalledTimes(1);

      // Manually set cooldown timestamp to 6 minutes ago (past 5-min cooldown)
      const cooldownMap = (service as any).notifyCooldown as Map<string, number>;
      cooldownMap.set(
        'wallet-exp:TX_INCOMING',
        Math.floor(Date.now() / 1000) - 360, // 6 minutes ago
      );

      // Second flush: cooldown expired, notification should be sent
      const tx2 = makeTx({ txHash: '0xexp2', walletId: 'wallet-exp' });
      (service as any).queue.flush = vi.fn().mockReturnValue([tx2]);
      await flushHandler();

      // Total: 2 notifications
      expect(notificationService.notify).toHaveBeenCalledTimes(2);
    });

    it('M-07: cooldown cleared on stop', async () => {
      const { service, workers, notificationService } = createFreshService({
        killSwitchState: 'ACTIVE',
        cooldownMinutes: 5,
      });

      const flushHandler = await startAndGetFlushHandler(service, workers);

      // Flush to populate cooldown
      const tx = makeTx({ txHash: '0xstop1', walletId: 'wallet-stop' });
      (service as any).queue.flush = vi.fn().mockReturnValue([tx]);
      await flushHandler();
      expect(notificationService.notify).toHaveBeenCalledTimes(1);

      // Verify cooldown is populated
      const cooldownMap = (service as any).notifyCooldown as Map<string, number>;
      expect(cooldownMap.size).toBeGreaterThan(0);

      // Stop the service
      await service.stop();

      // Cooldown should be cleared
      expect(cooldownMap.size).toBe(0);
    });

    it('M-07: multiple flush cycles within cooldown window -- no extra notifications', async () => {
      const { service, workers, eventBus, notificationService } = createFreshService({
        killSwitchState: 'ACTIVE',
        cooldownMinutes: 5,
      });

      const flushHandler = await startAndGetFlushHandler(service, workers);

      // First flush: 1 TX, 1 notification
      const tx1 = makeTx({ txHash: '0xmulti1', walletId: 'wallet-multi' });
      (service as any).queue.flush = vi.fn().mockReturnValue([tx1]);
      await flushHandler();
      expect(notificationService.notify).toHaveBeenCalledTimes(1);

      // Second flush cycle: 10 more TXs within cooldown window
      const txs2: IncomingTransaction[] = [];
      for (let i = 0; i < 10; i++) {
        txs2.push(makeTx({ txHash: `0xmulti-batch-${i}`, walletId: 'wallet-multi' }));
      }
      (service as any).queue.flush = vi.fn().mockReturnValue(txs2);
      await flushHandler();

      // Still only 1 notification total (all 10 suppressed by cooldown)
      expect(notificationService.notify).toHaveBeenCalledTimes(1);

      // But all 10 events fire from second flush
      const allIncomingEmits = eventBus.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'transaction:incoming',
      );
      expect(allIncomingEmits).toHaveLength(11); // 1 from first flush + 10 from second
    });
  });
});
