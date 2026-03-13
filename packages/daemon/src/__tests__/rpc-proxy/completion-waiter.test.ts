import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CompletionWaiter } from '../../rpc-proxy/completion-waiter.js';

// Minimal EventBus mock
function createMockEventBus() {
  const listeners = new Map<string, Set<(payload: any) => void>>();
  return {
    on(event: string, listener: (payload: any) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    off(event: string, listener: (payload: any) => void) {
      listeners.get(event)?.delete(listener);
    },
    emit(event: string, payload: any) {
      listeners.get(event)?.forEach((fn) => fn(payload));
    },
  };
}

describe('CompletionWaiter', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let waiter: CompletionWaiter;

  beforeEach(() => {
    eventBus = createMockEventBus();
    waiter = new CompletionWaiter(eventBus as any);
  });

  afterEach(() => {
    waiter.dispose();
  });

  it('resolves with txHash on transaction:completed event', async () => {
    const promise = waiter.waitForCompletion('tx-1', 5000);

    eventBus.emit('transaction:completed', {
      walletId: 'w1',
      txId: 'tx-1',
      txHash: '0xabc123',
      type: 'TRANSFER',
      timestamp: 1000,
    });

    const result = await promise;
    expect(result).toBe('0xabc123');
  });

  it('rejects with error on transaction:failed event', async () => {
    const promise = waiter.waitForCompletion('tx-2', 5000);

    eventBus.emit('transaction:failed', {
      walletId: 'w1',
      txId: 'tx-2',
      error: 'Insufficient funds',
      type: 'TRANSFER',
      timestamp: 1000,
    });

    await expect(promise).rejects.toThrow('Insufficient funds');
  });

  it('rejects with timeout error after specified ms', async () => {
    vi.useFakeTimers();

    const promise = waiter.waitForCompletion('tx-3', 100);

    vi.advanceTimersByTime(100);

    await expect(promise).rejects.toThrow(/timed out/i);

    vi.useRealTimers();
  });

  it('resolves multiple concurrent waits independently', async () => {
    const promise1 = waiter.waitForCompletion('tx-a', 5000);
    const promise2 = waiter.waitForCompletion('tx-b', 5000);

    eventBus.emit('transaction:completed', {
      walletId: 'w1',
      txId: 'tx-b',
      txHash: '0xbbb',
      type: 'TRANSFER',
      timestamp: 1000,
    });

    eventBus.emit('transaction:completed', {
      walletId: 'w1',
      txId: 'tx-a',
      txHash: '0xaaa',
      type: 'TRANSFER',
      timestamp: 1000,
    });

    expect(await promise1).toBe('0xaaa');
    expect(await promise2).toBe('0xbbb');
  });

  it('ignores events for unknown txIds', async () => {
    const promise = waiter.waitForCompletion('tx-known', 5000);

    // Emit event for unknown tx (should be silently ignored)
    eventBus.emit('transaction:completed', {
      walletId: 'w1',
      txId: 'tx-unknown',
      txHash: '0xfff',
      type: 'TRANSFER',
      timestamp: 1000,
    });

    // Now complete the known one
    eventBus.emit('transaction:completed', {
      walletId: 'w1',
      txId: 'tx-known',
      txHash: '0xok',
      type: 'TRANSFER',
      timestamp: 1000,
    });

    expect(await promise).toBe('0xok');
  });

  it('dispose() rejects all pending waits', async () => {
    const promise1 = waiter.waitForCompletion('tx-x', 5000);
    const promise2 = waiter.waitForCompletion('tx-y', 5000);

    waiter.dispose();

    await expect(promise1).rejects.toThrow(/disposed/i);
    await expect(promise2).rejects.toThrow(/disposed/i);
  });
});
