/**
 * EventBus unit tests.
 *
 * Tests:
 * - EventBus creation
 * - transaction:completed emit/on
 * - transaction:failed emit/on
 * - wallet:activity emit/on
 * - Listener error isolation (throwing listener doesn't block others)
 * - removeAllListeners cleanup
 * - listenerCount
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EventBus,
  type TransactionCompletedEvent,
  type TransactionFailedEvent,
  type WalletActivityEvent,
} from '@waiaas/core';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  // -----------------------------------------------------------------------
  // Creation
  // -----------------------------------------------------------------------

  it('should create EventBus instance', () => {
    expect(bus).toBeInstanceOf(EventBus);
  });

  // -----------------------------------------------------------------------
  // transaction:completed
  // -----------------------------------------------------------------------

  describe('transaction:completed', () => {
    it('should emit and receive typed event', () => {
      const received: TransactionCompletedEvent[] = [];

      bus.on('transaction:completed', (data) => {
        received.push(data);
      });

      const event: TransactionCompletedEvent = {
        walletId: 'wallet-1',
        txId: 'tx-1',
        txHash: '0xabc123',
        amount: '1000000',
        network: 'mainnet-beta',
        type: 'TRANSFER',
        timestamp: 1700000000,
      };

      const result = bus.emit('transaction:completed', event);

      expect(result).toBe(true);
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(event);
    });

    it('should return false when no listeners', () => {
      const event: TransactionCompletedEvent = {
        walletId: 'wallet-1',
        txId: 'tx-1',
        txHash: '0xabc123',
        type: 'TRANSFER',
        timestamp: 1700000000,
      };

      const result = bus.emit('transaction:completed', event);
      expect(result).toBe(false);
    });

    it('should support multiple listeners', () => {
      const results1: TransactionCompletedEvent[] = [];
      const results2: TransactionCompletedEvent[] = [];

      bus.on('transaction:completed', (data) => results1.push(data));
      bus.on('transaction:completed', (data) => results2.push(data));

      const event: TransactionCompletedEvent = {
        walletId: 'wallet-1',
        txId: 'tx-1',
        txHash: '0xdef456',
        type: 'TOKEN_TRANSFER',
        timestamp: 1700000000,
      };

      bus.emit('transaction:completed', event);

      expect(results1).toHaveLength(1);
      expect(results2).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // transaction:failed
  // -----------------------------------------------------------------------

  describe('transaction:failed', () => {
    it('should emit and receive typed event', () => {
      const received: TransactionFailedEvent[] = [];

      bus.on('transaction:failed', (data) => {
        received.push(data);
      });

      const event: TransactionFailedEvent = {
        walletId: 'wallet-2',
        txId: 'tx-2',
        error: 'Insufficient balance',
        network: 'devnet',
        type: 'TRANSFER',
        timestamp: 1700000001,
      };

      const result = bus.emit('transaction:failed', event);

      expect(result).toBe(true);
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(event);
    });
  });

  // -----------------------------------------------------------------------
  // wallet:activity
  // -----------------------------------------------------------------------

  describe('wallet:activity', () => {
    it('should emit TX_REQUESTED activity', () => {
      const received: WalletActivityEvent[] = [];

      bus.on('wallet:activity', (data) => {
        received.push(data);
      });

      const event: WalletActivityEvent = {
        walletId: 'wallet-3',
        activity: 'TX_REQUESTED',
        details: { txId: 'tx-3' },
        timestamp: 1700000002,
      };

      bus.emit('wallet:activity', event);

      expect(received).toHaveLength(1);
      expect(received[0]!.activity).toBe('TX_REQUESTED');
      expect(received[0]!.details).toEqual({ txId: 'tx-3' });
    });

    it('should emit SESSION_CREATED activity', () => {
      const received: WalletActivityEvent[] = [];

      bus.on('wallet:activity', (data) => {
        received.push(data);
      });

      bus.emit('wallet:activity', {
        walletId: 'wallet-4',
        activity: 'SESSION_CREATED',
        details: { sessionId: 'sess-1' },
        timestamp: 1700000003,
      });

      expect(received).toHaveLength(1);
      expect(received[0]!.activity).toBe('SESSION_CREATED');
    });

    it('should emit OWNER_SET activity', () => {
      const received: WalletActivityEvent[] = [];

      bus.on('wallet:activity', (data) => {
        received.push(data);
      });

      bus.emit('wallet:activity', {
        walletId: 'wallet-5',
        activity: 'OWNER_SET',
        details: { ownerAddress: '0xOwner' },
        timestamp: 1700000004,
      });

      expect(received).toHaveLength(1);
      expect(received[0]!.activity).toBe('OWNER_SET');
    });

    it('should emit TX_SUBMITTED activity', () => {
      const received: WalletActivityEvent[] = [];

      bus.on('wallet:activity', (data) => {
        received.push(data);
      });

      bus.emit('wallet:activity', {
        walletId: 'wallet-6',
        activity: 'TX_SUBMITTED',
        details: { txId: 'tx-6', txHash: '0xHash' },
        timestamp: 1700000005,
      });

      expect(received).toHaveLength(1);
      expect(received[0]!.activity).toBe('TX_SUBMITTED');
    });
  });

  // -----------------------------------------------------------------------
  // Listener error isolation
  // -----------------------------------------------------------------------

  describe('listener error isolation', () => {
    it('should call all listeners even if one throws', () => {
      const results: string[] = [];

      // Listener 1: will succeed
      bus.on('transaction:completed', () => {
        results.push('listener-1');
      });

      // Listener 2: will throw
      bus.on('transaction:completed', () => {
        results.push('listener-2-before-throw');
        throw new Error('Listener 2 exploded');
      });

      // Listener 3: should still be called
      bus.on('transaction:completed', () => {
        results.push('listener-3');
      });

      // Suppress console.error during test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const event: TransactionCompletedEvent = {
        walletId: 'w1',
        txId: 'tx-err',
        txHash: '0xerr',
        type: 'TRANSFER',
        timestamp: 1700000010,
      };

      // Should not throw
      expect(() => bus.emit('transaction:completed', event)).not.toThrow();

      // All listeners should have been called
      expect(results).toEqual(['listener-1', 'listener-2-before-throw', 'listener-3']);

      // Error should have been logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EventBus] listener error'),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should not affect pipeline flow when listener throws', () => {
      bus.on('transaction:failed', () => {
        throw new Error('Boom');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const event: TransactionFailedEvent = {
        walletId: 'w1',
        txId: 'tx-fail',
        error: 'test error',
        type: 'TRANSFER',
        timestamp: 1700000011,
      };

      // emit should NOT throw even with a throwing listener
      expect(() => bus.emit('transaction:failed', event)).not.toThrow();

      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // removeAllListeners
  // -----------------------------------------------------------------------

  describe('removeAllListeners', () => {
    it('should remove all listeners for all events', () => {
      bus.on('transaction:completed', () => {});
      bus.on('transaction:failed', () => {});
      bus.on('wallet:activity', () => {});

      expect(bus.listenerCount('transaction:completed')).toBe(1);
      expect(bus.listenerCount('transaction:failed')).toBe(1);
      expect(bus.listenerCount('wallet:activity')).toBe(1);

      bus.removeAllListeners();

      expect(bus.listenerCount('transaction:completed')).toBe(0);
      expect(bus.listenerCount('transaction:failed')).toBe(0);
      expect(bus.listenerCount('wallet:activity')).toBe(0);
    });

    it('should remove listeners for a specific event only', () => {
      bus.on('transaction:completed', () => {});
      bus.on('transaction:failed', () => {});

      bus.removeAllListeners('transaction:completed');

      expect(bus.listenerCount('transaction:completed')).toBe(0);
      expect(bus.listenerCount('transaction:failed')).toBe(1);
    });

    it('should return this for chaining', () => {
      const result = bus.removeAllListeners();
      expect(result).toBe(bus);
    });
  });

  // -----------------------------------------------------------------------
  // listenerCount
  // -----------------------------------------------------------------------

  describe('listenerCount', () => {
    it('should return 0 when no listeners', () => {
      expect(bus.listenerCount('transaction:completed')).toBe(0);
    });

    it('should return correct count after adding listeners', () => {
      bus.on('transaction:completed', () => {});
      bus.on('transaction:completed', () => {});

      expect(bus.listenerCount('transaction:completed')).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Event isolation (different event types)
  // -----------------------------------------------------------------------

  describe('event isolation', () => {
    it('should not cross-fire between different event types', () => {
      const completedReceived: boolean[] = [];
      const failedReceived: boolean[] = [];

      bus.on('transaction:completed', () => completedReceived.push(true));
      bus.on('transaction:failed', () => failedReceived.push(true));

      bus.emit('transaction:completed', {
        walletId: 'w1',
        txId: 'tx1',
        txHash: '0x1',
        type: 'TRANSFER',
        timestamp: 1700000020,
      });

      expect(completedReceived).toHaveLength(1);
      expect(failedReceived).toHaveLength(0);
    });
  });
});
