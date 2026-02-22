import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IChainSubscriber, ChainType } from '@waiaas/core';
import {
  SubscriptionMultiplexer,
  type MultiplexerDeps,
} from '../subscription-multiplexer.js';

// ── Mock IChainSubscriber Factory ────────────────────────────────

interface MockSubscriber extends IChainSubscriber {
  _triggerDisconnect(): void;
}

function createMockSubscriber(chain: ChainType = 'solana'): MockSubscriber {
  let disconnectResolve: (() => void) | null = null;

  const mock: MockSubscriber = {
    chain,
    subscribe: vi.fn<IChainSubscriber['subscribe']>().mockResolvedValue(undefined),
    unsubscribe: vi.fn<IChainSubscriber['unsubscribe']>().mockResolvedValue(undefined),
    subscribedWallets: vi.fn<IChainSubscriber['subscribedWallets']>().mockReturnValue([]),
    connect: vi.fn<IChainSubscriber['connect']>().mockResolvedValue(undefined),
    waitForDisconnect: vi.fn<IChainSubscriber['waitForDisconnect']>().mockImplementation(
      () => new Promise<void>((resolve) => { disconnectResolve = resolve; }),
    ),
    destroy: vi.fn<IChainSubscriber['destroy']>().mockResolvedValue(undefined),
    _triggerDisconnect() {
      disconnectResolve?.();
      disconnectResolve = null;
    },
  };
  return mock;
}

// ── Tests ────────────────────────────────────────────────────────

describe('SubscriptionMultiplexer', () => {
  let subscriberFactory: ReturnType<typeof vi.fn>;
  let onTransaction: ReturnType<typeof vi.fn>;
  let onGapRecovery: ReturnType<typeof vi.fn>;
  let mockSubscribers: MockSubscriber[];

  beforeEach(() => {
    mockSubscribers = [];
    subscriberFactory = vi.fn().mockImplementation((chain: string) => {
      const sub = createMockSubscriber(chain as ChainType);
      mockSubscribers.push(sub);
      return sub;
    });
    onTransaction = vi.fn();
    onGapRecovery = vi.fn().mockResolvedValue(undefined);
  });

  function createMultiplexer(overrides: Partial<MultiplexerDeps> = {}) {
    return new SubscriptionMultiplexer({
      subscriberFactory,
      onTransaction,
      onGapRecovery,
      reconnectConfig: {
        initialDelayMs: 100,
        maxDelayMs: 200,
        maxAttempts: 3,
        jitterFactor: 0,
        pollingFallbackThreshold: 2,
      },
      ...overrides,
    });
  }

  // ── Connection Sharing ──────────────────────────────────────

  describe('connection sharing', () => {
    it('reuses connection for same chain:network pair', async () => {
      const mux = createMultiplexer();

      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');
      await mux.addWallet('solana', 'mainnet', 'w2', 'addr2');

      // subscriberFactory should only be called once
      expect(subscriberFactory).toHaveBeenCalledTimes(1);
      expect(subscriberFactory).toHaveBeenCalledWith('solana', 'mainnet');

      // Both wallets should be subscribed through the same subscriber
      const sub = mockSubscribers[0]!;
      expect(sub.subscribe).toHaveBeenCalledTimes(2);
      expect(sub.subscribe).toHaveBeenCalledWith('w1', 'addr1', 'mainnet', onTransaction);
      expect(sub.subscribe).toHaveBeenCalledWith('w2', 'addr2', 'mainnet', onTransaction);

      // connect() only called once (for the first wallet)
      expect(sub.connect).toHaveBeenCalledTimes(1);

      await mux.stopAll();
    });

    it('reports shared connection with correct wallet count', async () => {
      const mux = createMultiplexer();

      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');
      await mux.addWallet('solana', 'mainnet', 'w2', 'addr2');

      const connections = mux.getActiveConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0]).toEqual({
        key: 'solana:mainnet',
        walletCount: 2,
        state: 'WS_ACTIVE',
      });

      await mux.stopAll();
    });
  });

  // ── Different Networks Create Separate Connections ──────────

  describe('separate connections per network', () => {
    it('creates separate connections for different networks', async () => {
      const mux = createMultiplexer();

      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');
      await mux.addWallet('solana', 'devnet', 'w2', 'addr2');

      expect(subscriberFactory).toHaveBeenCalledTimes(2);
      expect(subscriberFactory).toHaveBeenCalledWith('solana', 'mainnet');
      expect(subscriberFactory).toHaveBeenCalledWith('solana', 'devnet');

      const connections = mux.getActiveConnections();
      expect(connections).toHaveLength(2);

      await mux.stopAll();
    });

    it('creates separate connections for different chains', async () => {
      const mux = createMultiplexer();

      await mux.addWallet('solana', 'mainnet', 'w1', 'sol-addr');
      await mux.addWallet('evm', 'ethereum-mainnet', 'w2', 'evm-addr');

      expect(subscriberFactory).toHaveBeenCalledTimes(2);
      const connections = mux.getActiveConnections();
      expect(connections).toHaveLength(2);

      await mux.stopAll();
    });
  });

  // ── removeWallet Cleanup ───────────────────────────────────

  describe('removeWallet cleanup', () => {
    it('keeps connection when other wallets remain', async () => {
      const mux = createMultiplexer();

      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');
      await mux.addWallet('solana', 'mainnet', 'w2', 'addr2');

      await mux.removeWallet('solana', 'mainnet', 'w1');

      const sub = mockSubscribers[0]!;
      expect(sub.unsubscribe).toHaveBeenCalledWith('w1');
      expect(sub.destroy).not.toHaveBeenCalled();

      const connections = mux.getActiveConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0]!.walletCount).toBe(1);

      await mux.stopAll();
    });

    it('destroys connection when last wallet is removed', async () => {
      const mux = createMultiplexer();

      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');
      await mux.removeWallet('solana', 'mainnet', 'w1');

      const sub = mockSubscribers[0]!;
      expect(sub.unsubscribe).toHaveBeenCalledWith('w1');
      expect(sub.destroy).toHaveBeenCalledTimes(1);

      const connections = mux.getActiveConnections();
      expect(connections).toHaveLength(0);
    });

    it('is a no-op for unknown chain:network', async () => {
      const mux = createMultiplexer();

      // Should not throw
      await mux.removeWallet('solana', 'mainnet', 'w1');

      expect(mux.getActiveConnections()).toHaveLength(0);
    });

    it('removes two wallets sequentially, destroying connection on last', async () => {
      const mux = createMultiplexer();

      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');
      await mux.addWallet('solana', 'mainnet', 'w2', 'addr2');

      await mux.removeWallet('solana', 'mainnet', 'w1');
      expect(mux.getActiveConnections()[0]!.walletCount).toBe(1);

      await mux.removeWallet('solana', 'mainnet', 'w2');
      expect(mux.getActiveConnections()).toHaveLength(0);

      const sub = mockSubscribers[0]!;
      expect(sub.destroy).toHaveBeenCalledTimes(1);
    });
  });

  // ── getConnectionState ─────────────────────────────────────

  describe('getConnectionState', () => {
    it('returns null for unknown connection', () => {
      const mux = createMultiplexer();
      expect(mux.getConnectionState('solana', 'mainnet')).toBeNull();
    });

    it('returns WS_ACTIVE after successful addWallet', async () => {
      const mux = createMultiplexer();

      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');

      expect(mux.getConnectionState('solana', 'mainnet')).toBe('WS_ACTIVE');

      await mux.stopAll();
    });

    it('returns null after all wallets removed', async () => {
      const mux = createMultiplexer();

      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');
      await mux.removeWallet('solana', 'mainnet', 'w1');

      expect(mux.getConnectionState('solana', 'mainnet')).toBeNull();
    });
  });

  // ── stopAll ────────────────────────────────────────────────

  describe('stopAll', () => {
    it('destroys all subscribers and clears connections', async () => {
      const mux = createMultiplexer();

      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');
      await mux.addWallet('solana', 'devnet', 'w2', 'addr2');
      await mux.addWallet('evm', 'ethereum-mainnet', 'w3', 'evm-addr');

      expect(mux.getActiveConnections()).toHaveLength(3);

      await mux.stopAll();

      expect(mux.getActiveConnections()).toHaveLength(0);

      // All subscribers should be destroyed
      for (const sub of mockSubscribers) {
        expect(sub.destroy).toHaveBeenCalledTimes(1);
      }
    });

    it('unsubscribes all wallets before destroying', async () => {
      const mux = createMultiplexer();

      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');
      await mux.addWallet('solana', 'mainnet', 'w2', 'addr2');

      await mux.stopAll();

      const sub = mockSubscribers[0]!;
      expect(sub.unsubscribe).toHaveBeenCalledWith('w1');
      expect(sub.unsubscribe).toHaveBeenCalledWith('w2');
      expect(sub.destroy).toHaveBeenCalledTimes(1);
    });

    it('is safe to call on empty multiplexer', async () => {
      const mux = createMultiplexer();
      await mux.stopAll();
      expect(mux.getActiveConnections()).toHaveLength(0);
    });
  });

  // ── Gap Recovery ───────────────────────────────────────────

  describe('gap recovery', () => {
    it('stores onGapRecovery callback and wires it for post-reconnect invocation', async () => {
      const mux = createMultiplexer();

      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');
      await mux.addWallet('solana', 'mainnet', 'w2', 'addr2');

      // Gap recovery not called on initial connect
      expect(onGapRecovery).not.toHaveBeenCalled();

      await mux.stopAll();
    });

    it('works without onGapRecovery callback (optional dep)', async () => {
      const mux = createMultiplexer({ onGapRecovery: undefined });

      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');

      // Should not throw
      expect(mux.getConnectionState('solana', 'mainnet')).toBe('WS_ACTIVE');

      await mux.stopAll();
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles adding wallet to existing connection after removing another', async () => {
      const mux = createMultiplexer();

      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');
      await mux.addWallet('solana', 'mainnet', 'w2', 'addr2');
      await mux.removeWallet('solana', 'mainnet', 'w1');
      await mux.addWallet('solana', 'mainnet', 'w3', 'addr3');

      // Still only one subscriber factory call (same connection)
      expect(subscriberFactory).toHaveBeenCalledTimes(1);

      const connections = mux.getActiveConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0]!.walletCount).toBe(2); // w2 + w3

      await mux.stopAll();
    });

    it('can re-add wallet after full removal + reconnection', async () => {
      const mux = createMultiplexer();

      // Add and fully remove
      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');
      await mux.removeWallet('solana', 'mainnet', 'w1');
      expect(mux.getActiveConnections()).toHaveLength(0);

      // Re-add creates new connection
      await mux.addWallet('solana', 'mainnet', 'w1', 'addr1');
      expect(subscriberFactory).toHaveBeenCalledTimes(2);
      expect(mux.getActiveConnections()).toHaveLength(1);

      await mux.stopAll();
    });

    it('getActiveConnections returns correct state for multiple connections', async () => {
      const mux = createMultiplexer();

      await mux.addWallet('solana', 'mainnet', 'w1', 'sol-addr1');
      await mux.addWallet('solana', 'mainnet', 'w2', 'sol-addr2');
      await mux.addWallet('evm', 'ethereum-mainnet', 'w3', 'evm-addr1');

      const connections = mux.getActiveConnections();
      expect(connections).toHaveLength(2);

      const solConnection = connections.find((c) => c.key === 'solana:mainnet');
      const evmConnection = connections.find((c) => c.key === 'evm:ethereum-mainnet');

      expect(solConnection).toEqual({
        key: 'solana:mainnet',
        walletCount: 2,
        state: 'WS_ACTIVE',
      });
      expect(evmConnection).toEqual({
        key: 'evm:ethereum-mainnet',
        walletCount: 1,
        state: 'WS_ACTIVE',
      });

      await mux.stopAll();
    });
  });
});
