import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RpcPool, AllRpcFailedError } from '../rpc/rpc-pool.js';
import type { RpcEndpointStatus, RpcPoolEvent } from '../rpc/rpc-pool.js';

describe('RpcPool', () => {
  let pool: RpcPool;
  let now: number;
  const nowFn = () => now;

  beforeEach(() => {
    now = 1_000_000;
    pool = new RpcPool({ nowFn });
  });

  // ─── Registration ────────────────────────────────────────────

  describe('register', () => {
    it('should register URLs for a network', () => {
      pool.register('mainnet', ['https://a.com', 'https://b.com']);
      expect(pool.hasNetwork('mainnet')).toBe(true);
      expect(pool.getNetworks()).toContain('mainnet');
    });

    it('should deduplicate URLs for the same network', () => {
      pool.register('mainnet', [
        'https://a.com',
        'https://a.com',
        'https://b.com',
      ]);
      const status = pool.getStatus('mainnet');
      expect(status).toHaveLength(2);
      expect(status.map((s) => s.url)).toEqual([
        'https://a.com',
        'https://b.com',
      ]);
    });

    it('should preserve priority order (index 0 = highest)', () => {
      pool.register('mainnet', [
        'https://primary.com',
        'https://secondary.com',
        'https://tertiary.com',
      ]);
      const status = pool.getStatus('mainnet');
      expect(status[0]!.url).toBe('https://primary.com');
      expect(status[1]!.url).toBe('https://secondary.com');
      expect(status[2]!.url).toBe('https://tertiary.com');
    });
  });

  describe('registerAll', () => {
    it('should bulk register multiple networks', () => {
      pool.registerAll([
        { network: 'mainnet', urls: ['https://sol-a.com'] },
        { network: 'ethereum-mainnet', urls: ['https://eth-a.com'] },
      ]);
      expect(pool.hasNetwork('mainnet')).toBe(true);
      expect(pool.hasNetwork('ethereum-mainnet')).toBe(true);
    });
  });

  // ─── URL Resolution ──────────────────────────────────────────

  describe('getUrl', () => {
    it('should return highest-priority URL', () => {
      pool.register('mainnet', ['https://a.com', 'https://b.com', 'https://c.com']);
      expect(pool.getUrl('mainnet')).toBe('https://a.com');
    });

    it('should return next URL when primary is in cooldown', () => {
      pool.register('mainnet', ['https://a.com', 'https://b.com', 'https://c.com']);
      pool.reportFailure('mainnet', 'https://a.com');
      expect(pool.getUrl('mainnet')).toBe('https://b.com');
    });

    it('should throw AllRpcFailedError when all URLs are in cooldown', () => {
      pool.register('mainnet', ['https://a.com', 'https://b.com', 'https://c.com']);
      pool.reportFailure('mainnet', 'https://a.com');
      pool.reportFailure('mainnet', 'https://b.com');
      pool.reportFailure('mainnet', 'https://c.com');

      expect(() => pool.getUrl('mainnet')).toThrow(AllRpcFailedError);
    });

    it('should include network and urls in AllRpcFailedError', () => {
      pool.register('mainnet', ['https://a.com', 'https://b.com']);
      pool.reportFailure('mainnet', 'https://a.com');
      pool.reportFailure('mainnet', 'https://b.com');

      try {
        pool.getUrl('mainnet');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AllRpcFailedError);
        const e = err as AllRpcFailedError;
        expect(e.network).toBe('mainnet');
        expect(e.urls).toEqual(['https://a.com', 'https://b.com']);
        expect(e.name).toBe('AllRpcFailedError');
      }
    });

    it('should throw Error for unregistered network', () => {
      expect(() => pool.getUrl('unknown-network')).toThrow(Error);
      expect(() => pool.getUrl('unknown-network')).not.toThrow(
        AllRpcFailedError,
      );
    });
  });

  // ─── Cooldown ────────────────────────────────────────────────

  describe('cooldown mechanism', () => {
    it('should apply 60s base cooldown on first failure', () => {
      pool.register('mainnet', ['https://a.com', 'https://b.com']);
      pool.reportFailure('mainnet', 'https://a.com');

      // Still in cooldown at now + 59s
      now += 59_000;
      expect(pool.getUrl('mainnet')).toBe('https://b.com');

      // Recovered at now + 60s
      now += 1_000; // total: 60s from failure
      expect(pool.getUrl('mainnet')).toBe('https://a.com');
    });

    it('should apply exponential backoff on consecutive failures', () => {
      pool.register('mainnet', ['https://a.com', 'https://b.com']);

      // 1st failure: 60s cooldown
      pool.reportFailure('mainnet', 'https://a.com');
      now += 60_000;
      expect(pool.getUrl('mainnet')).toBe('https://a.com'); // recovered

      // 2nd failure: 120s cooldown
      pool.reportFailure('mainnet', 'https://a.com');
      now += 119_000;
      expect(pool.getUrl('mainnet')).toBe('https://b.com'); // still in cooldown
      now += 1_000;
      expect(pool.getUrl('mainnet')).toBe('https://a.com'); // recovered at 120s

      // 3rd failure: 240s cooldown
      pool.reportFailure('mainnet', 'https://a.com');
      now += 239_000;
      expect(pool.getUrl('mainnet')).toBe('https://b.com');
      now += 1_000;
      expect(pool.getUrl('mainnet')).toBe('https://a.com'); // recovered at 240s
    });

    it('should cap cooldown at maxCooldownMs (300s default)', () => {
      pool.register('mainnet', ['https://a.com', 'https://b.com']);

      // Drive up consecutive failures: 60 -> 120 -> 240 -> 300 (capped)
      pool.reportFailure('mainnet', 'https://a.com');
      now += 60_000;
      pool.reportFailure('mainnet', 'https://a.com');
      now += 120_000;
      pool.reportFailure('mainnet', 'https://a.com');
      now += 240_000;

      // 4th failure should be 480 but capped at 300
      pool.reportFailure('mainnet', 'https://a.com');
      now += 299_000;
      expect(pool.getUrl('mainnet')).toBe('https://b.com'); // still in cooldown
      now += 1_000;
      expect(pool.getUrl('mainnet')).toBe('https://a.com'); // recovered at exactly 300s
    });

    it('should auto-recover URL after cooldown expires', () => {
      pool.register('mainnet', ['https://a.com', 'https://b.com']);
      pool.reportFailure('mainnet', 'https://a.com');

      // Before cooldown expires
      expect(pool.getUrl('mainnet')).toBe('https://b.com');

      // After cooldown expires (60s)
      now += 60_000;
      expect(pool.getUrl('mainnet')).toBe('https://a.com');
    });

    it('should use custom baseCooldownMs and maxCooldownMs', () => {
      const customPool = new RpcPool({
        baseCooldownMs: 10_000,
        maxCooldownMs: 30_000,
        nowFn,
      });
      customPool.register('mainnet', ['https://a.com', 'https://b.com']);

      // 1st failure: 10s cooldown
      customPool.reportFailure('mainnet', 'https://a.com');
      now += 9_999;
      expect(customPool.getUrl('mainnet')).toBe('https://b.com');
      now += 1;
      expect(customPool.getUrl('mainnet')).toBe('https://a.com');

      // Build up failures: 10 -> 20 -> 30 (capped)
      customPool.reportFailure('mainnet', 'https://a.com');
      now += 20_000;
      customPool.reportFailure('mainnet', 'https://a.com');
      now += 29_999;
      expect(customPool.getUrl('mainnet')).toBe('https://b.com'); // still capped at 30s
      now += 1;
      expect(customPool.getUrl('mainnet')).toBe('https://a.com');
    });
  });

  // ─── Success Reporting ───────────────────────────────────────

  describe('reportSuccess', () => {
    it('should reset consecutive failure count to 0', () => {
      pool.register('mainnet', ['https://a.com', 'https://b.com']);

      // Build up failures: 60s -> 120s
      pool.reportFailure('mainnet', 'https://a.com');
      now += 60_000;
      pool.reportFailure('mainnet', 'https://a.com');
      now += 120_000;

      // Success resets failure count
      pool.reportSuccess('mainnet', 'https://a.com');

      // Next failure should use base cooldown (60s) not 240s
      pool.reportFailure('mainnet', 'https://a.com');
      now += 59_999;
      expect(pool.getUrl('mainnet')).toBe('https://b.com');
      now += 1;
      expect(pool.getUrl('mainnet')).toBe('https://a.com');
    });
  });

  // ─── Reset ───────────────────────────────────────────────────

  describe('reset', () => {
    it('should clear all cooldown state for a network', () => {
      pool.register('mainnet', ['https://a.com', 'https://b.com']);
      pool.reportFailure('mainnet', 'https://a.com');
      pool.reportFailure('mainnet', 'https://b.com');

      pool.reset('mainnet');
      expect(pool.getUrl('mainnet')).toBe('https://a.com');
    });
  });

  describe('resetAll', () => {
    it('should clear all state for all networks', () => {
      pool.register('mainnet', ['https://a.com']);
      pool.register('devnet', ['https://d.com']);
      pool.reportFailure('mainnet', 'https://a.com');
      pool.reportFailure('devnet', 'https://d.com');

      pool.resetAll();
      expect(pool.getUrl('mainnet')).toBe('https://a.com');
      expect(pool.getUrl('devnet')).toBe('https://d.com');
    });
  });

  // ─── Inspection ──────────────────────────────────────────────

  describe('getStatus', () => {
    it('should return status for each URL', () => {
      pool.register('mainnet', ['https://a.com', 'https://b.com']);
      pool.reportFailure('mainnet', 'https://a.com');

      const statuses = pool.getStatus('mainnet');
      expect(statuses).toHaveLength(2);

      const aStatus = statuses.find(
        (s) => s.url === 'https://a.com',
      ) as RpcEndpointStatus;
      expect(aStatus.status).toBe('cooldown');
      expect(aStatus.failureCount).toBe(1);
      expect(aStatus.cooldownRemainingMs).toBeGreaterThan(0);

      const bStatus = statuses.find(
        (s) => s.url === 'https://b.com',
      ) as RpcEndpointStatus;
      expect(bStatus.status).toBe('available');
      expect(bStatus.failureCount).toBe(0);
      expect(bStatus.cooldownRemainingMs).toBe(0);
    });
  });

  describe('getNetworks', () => {
    it('should return list of registered networks', () => {
      pool.register('mainnet', ['https://a.com']);
      pool.register('devnet', ['https://d.com']);
      const networks = pool.getNetworks();
      expect(networks).toContain('mainnet');
      expect(networks).toContain('devnet');
      expect(networks).toHaveLength(2);
    });
  });

  describe('hasNetwork', () => {
    it('should return false for unregistered networks', () => {
      expect(pool.hasNetwork('mainnet')).toBe(false);
    });

    it('should return true for registered networks', () => {
      pool.register('mainnet', ['https://a.com']);
      expect(pool.hasNetwork('mainnet')).toBe(true);
    });
  });

  // ─── AllRpcFailedError ───────────────────────────────────────

  describe('AllRpcFailedError', () => {
    it('should extend Error, not ChainError', () => {
      const err = new AllRpcFailedError('mainnet', ['https://a.com']);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('AllRpcFailedError');
      expect(err.network).toBe('mainnet');
      expect(err.urls).toEqual(['https://a.com']);
      expect(err.message).toContain('mainnet');
    });
  });

  // ─── onEvent Callback ────────────────────────────────────────

  describe('onEvent callback', () => {
    it('emits RPC_HEALTH_DEGRADED when endpoint enters cooldown', () => {
      const onEvent = vi.fn();
      const eventPool = new RpcPool({ nowFn, onEvent });
      eventPool.register('mainnet', ['https://a.com', 'https://b.com']);

      eventPool.reportFailure('mainnet', 'https://a.com');

      expect(onEvent).toHaveBeenCalledWith({
        type: 'RPC_HEALTH_DEGRADED',
        network: 'mainnet',
        url: 'https://a.com',
        failureCount: 1,
        totalEndpoints: 2,
      });
    });

    it('emits RPC_ALL_FAILED when all endpoints are in cooldown', () => {
      const onEvent = vi.fn();
      const eventPool = new RpcPool({ nowFn, onEvent });
      eventPool.register('mainnet', ['https://a.com', 'https://b.com']);

      eventPool.reportFailure('mainnet', 'https://a.com');
      eventPool.reportFailure('mainnet', 'https://b.com');

      // Should have: DEGRADED(a), DEGRADED(b), ALL_FAILED(b)
      const calls = onEvent.mock.calls.map((c: unknown[]) => (c[0] as RpcPoolEvent).type);
      expect(calls).toEqual(['RPC_HEALTH_DEGRADED', 'RPC_HEALTH_DEGRADED', 'RPC_ALL_FAILED']);

      const allFailedCall = onEvent.mock.calls[2]![0] as RpcPoolEvent;
      expect(allFailedCall.network).toBe('mainnet');
      expect(allFailedCall.totalEndpoints).toBe(2);
    });

    it('emits RPC_RECOVERED when cooldown endpoint recovers via reportSuccess', () => {
      const onEvent = vi.fn();
      const eventPool = new RpcPool({ nowFn, onEvent });
      eventPool.register('mainnet', ['https://a.com', 'https://b.com']);

      eventPool.reportFailure('mainnet', 'https://a.com');
      onEvent.mockClear();

      eventPool.reportSuccess('mainnet', 'https://a.com');

      expect(onEvent).toHaveBeenCalledWith({
        type: 'RPC_RECOVERED',
        network: 'mainnet',
        url: 'https://a.com',
        failureCount: 0,
        totalEndpoints: 2,
      });
    });

    it('does not emit RPC_RECOVERED if endpoint was not in cooldown', () => {
      const onEvent = vi.fn();
      const eventPool = new RpcPool({ nowFn, onEvent });
      eventPool.register('mainnet', ['https://a.com', 'https://b.com']);

      eventPool.reportSuccess('mainnet', 'https://a.com');

      const recoveredCalls = onEvent.mock.calls.filter(
        (c: unknown[]) => (c[0] as RpcPoolEvent).type === 'RPC_RECOVERED',
      );
      expect(recoveredCalls).toHaveLength(0);
    });

    it('does not emit events when onEvent not provided', () => {
      const noEventPool = new RpcPool({ nowFn });
      noEventPool.register('mainnet', ['https://a.com', 'https://b.com']);

      // Should not throw
      expect(() => {
        noEventPool.reportFailure('mainnet', 'https://a.com');
        noEventPool.reportSuccess('mainnet', 'https://a.com');
      }).not.toThrow();
    });
  });

  // ─── Constructor Defaults ────────────────────────────────────

  describe('constructor defaults', () => {
    it('should use 60s base cooldown by default', () => {
      const defaultPool = new RpcPool({ nowFn });
      defaultPool.register('mainnet', ['https://a.com', 'https://b.com']);
      defaultPool.reportFailure('mainnet', 'https://a.com');

      // Should be in cooldown
      now += 59_999;
      expect(defaultPool.getUrl('mainnet')).toBe('https://b.com');
      now += 1;
      expect(defaultPool.getUrl('mainnet')).toBe('https://a.com');
    });

    it('should accept no options (all defaults)', () => {
      const noOptsPool = new RpcPool();
      noOptsPool.register('mainnet', ['https://a.com']);
      expect(noOptsPool.getUrl('mainnet')).toBe('https://a.com');
    });
  });
});
