/**
 * IncomingTxMonitor RpcPool integration tests.
 *
 * Tests cover:
 * 1. resolveRpcUrlFromPool: pool URL preferred over SettingsService
 * 2. resolveRpcUrlFromPool: fallback when pool has no network
 * 3. resolveRpcUrlFromPool: fallback when all pool URLs in cooldown
 * 4. resolveRpcUrlFromPool: fallback when rpcPool is null
 * 5. Solana subscriber created with pool URL
 * 6. EVM subscriber created with pool URL
 *
 * @see Phase 261-03
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RpcPool } from '@waiaas/core';
import { resolveRpcUrlFromPool } from '../infrastructure/adapter-pool.js';

// ---- Mock SolanaIncomingSubscriber ----
const mockSolanaSubscriber = { type: 'solana-incoming' };
vi.mock('@waiaas/adapter-solana', () => ({
  SolanaIncomingSubscriber: vi.fn().mockImplementation((opts: Record<string, unknown>) => ({
    ...mockSolanaSubscriber,
    opts,
  })),
}));

// ---- Mock EvmIncomingSubscriber ----
const mockEvmSubscriber = { type: 'evm-incoming' };
vi.mock('@waiaas/adapter-evm', () => ({
  EvmIncomingSubscriber: vi.fn().mockImplementation((opts: Record<string, unknown>) => ({
    ...mockEvmSubscriber,
    opts,
  })),
}));

// ── resolveRpcUrlFromPool unit tests ────────────────────────────

describe('resolveRpcUrlFromPool', () => {
  it('prefers RpcPool URL over SettingsService', () => {
    const pool = new RpcPool();
    pool.register('devnet', ['https://pool-devnet.com']);

    const settingsGet = vi.fn().mockReturnValue('https://settings-devnet.com');

    const url = resolveRpcUrlFromPool(pool, settingsGet, 'solana', 'devnet');

    expect(url).toBe('https://pool-devnet.com');
    expect(settingsGet).not.toHaveBeenCalled();
  });

  it('falls back to SettingsService when pool has no network', () => {
    const pool = new RpcPool();
    // No 'polygon-amoy' registered

    const settingsGet = vi.fn().mockReturnValue('https://settings-polygon.com');

    const url = resolveRpcUrlFromPool(pool, settingsGet, 'ethereum', 'polygon-amoy');

    expect(url).toBe('https://settings-polygon.com');
    expect(settingsGet).toHaveBeenCalledWith('rpc.evm_polygon_amoy');
  });

  it('falls back to SettingsService when all pool URLs in cooldown', () => {
    const nowFn = vi.fn().mockReturnValue(1000);
    const pool = new RpcPool({ baseCooldownMs: 60_000, nowFn });
    pool.register('devnet', ['https://pool-devnet.com']);

    // Put the URL in cooldown
    pool.reportFailure('devnet', 'https://pool-devnet.com');

    const settingsGet = vi.fn().mockReturnValue('https://settings-devnet.com');

    const url = resolveRpcUrlFromPool(pool, settingsGet, 'solana', 'devnet');

    expect(url).toBe('https://settings-devnet.com');
    expect(settingsGet).toHaveBeenCalledWith('rpc.solana_devnet');
  });

  it('falls back to SettingsService when rpcPool is null', () => {
    const settingsGet = vi.fn().mockReturnValue('https://settings-devnet.com');

    const url = resolveRpcUrlFromPool(null, settingsGet, 'solana', 'devnet');

    expect(url).toBe('https://settings-devnet.com');
    expect(settingsGet).toHaveBeenCalledWith('rpc.solana_devnet');
  });

  it('falls back to SettingsService when rpcPool is undefined', () => {
    const settingsGet = vi.fn().mockReturnValue('https://settings-url.com');

    const url = resolveRpcUrlFromPool(undefined, settingsGet, 'ethereum', 'ethereum-sepolia');

    expect(url).toBe('https://settings-url.com');
    expect(settingsGet).toHaveBeenCalledWith('rpc.evm_ethereum_sepolia');
  });

  it('uses correct config key for EVM network with hyphens', () => {
    const settingsGet = vi.fn().mockReturnValue('https://base-mainnet.com');

    resolveRpcUrlFromPool(null, settingsGet, 'ethereum', 'base-mainnet');

    expect(settingsGet).toHaveBeenCalledWith('rpc.evm_base_mainnet');
  });
});

// ── Subscriber creation with pool URL ──────────────────────────

describe('subscriberFactory with RpcPool (simulated)', () => {
  /**
   * Simulates the subscriberFactory closure from daemon.ts Step 4c-9.
   * Uses resolveRpcUrlFromPool just like the real implementation.
   */
  async function createSubscriber(
    rpcPool: RpcPool | null,
    settingsGet: (key: string) => string,
    chain: string,
    network: string,
  ) {
    const rpcUrl = resolveRpcUrlFromPool(rpcPool, settingsGet, chain, network);

    if (chain === 'solana') {
      const wssUrl = settingsGet('incoming.wss_url') || rpcUrl.replace(/^https:\/\//, 'wss://');
      const { SolanaIncomingSubscriber } = await import('@waiaas/adapter-solana');
      return new (SolanaIncomingSubscriber as any)({ rpcUrl, wsUrl: wssUrl });
    }

    // EVM chains
    const { EvmIncomingSubscriber } = await import('@waiaas/adapter-evm');
    return new (EvmIncomingSubscriber as any)({ rpcUrl });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Solana subscriber created with pool URL', async () => {
    const pool = new RpcPool();
    pool.register('devnet', ['https://pool-solana.com']);

    const settingsGet = vi.fn().mockImplementation((key: string) => {
      if (key === 'incoming.wss_url') return '';
      return 'https://settings-fallback.com';
    });

    const subscriber = await createSubscriber(pool, settingsGet, 'solana', 'devnet');

    expect(subscriber.opts.rpcUrl).toBe('https://pool-solana.com');
    expect(subscriber.opts.wsUrl).toBe('wss://pool-solana.com');
  });

  it('Solana subscriber falls back to settings when pool unavailable', async () => {
    const settingsGet = vi.fn().mockImplementation((key: string) => {
      if (key === 'incoming.wss_url') return '';
      if (key === 'rpc.solana_devnet') return 'https://settings-solana.com';
      return '';
    });

    const subscriber = await createSubscriber(null, settingsGet, 'solana', 'devnet');

    expect(subscriber.opts.rpcUrl).toBe('https://settings-solana.com');
    expect(subscriber.opts.wsUrl).toBe('wss://settings-solana.com');
  });

  it('EVM subscriber created with pool URL', async () => {
    const pool = new RpcPool();
    pool.register('ethereum-sepolia', ['https://pool-sepolia.com']);

    const settingsGet = vi.fn().mockReturnValue('https://settings-fallback.com');

    const subscriber = await createSubscriber(pool, settingsGet, 'ethereum', 'ethereum-sepolia');

    expect(subscriber.opts.rpcUrl).toBe('https://pool-sepolia.com');
  });

  it('EVM subscriber falls back to settings when pool unavailable', async () => {
    const settingsGet = vi.fn().mockImplementation((key: string) => {
      if (key === 'rpc.evm_ethereum_sepolia') return 'https://settings-sepolia.com';
      return '';
    });

    const subscriber = await createSubscriber(null, settingsGet, 'ethereum', 'ethereum-sepolia');

    expect(subscriber.opts.rpcUrl).toBe('https://settings-sepolia.com');
  });

  it('Solana subscriber uses custom WSS URL when configured', async () => {
    const pool = new RpcPool();
    pool.register('devnet', ['https://pool-solana.com']);

    const settingsGet = vi.fn().mockImplementation((key: string) => {
      if (key === 'incoming.wss_url') return 'wss://custom-ws.example.com';
      return 'https://settings-fallback.com';
    });

    const subscriber = await createSubscriber(pool, settingsGet, 'solana', 'devnet');

    expect(subscriber.opts.rpcUrl).toBe('https://pool-solana.com');
    expect(subscriber.opts.wsUrl).toBe('wss://custom-ws.example.com');
  });

  it('pool rotation works across subscriber recreations', async () => {
    const nowFn = vi.fn().mockReturnValue(1000);
    const pool = new RpcPool({ baseCooldownMs: 60_000, nowFn });
    pool.register('devnet', ['https://primary.com', 'https://backup.com']);

    const settingsGet = vi.fn().mockImplementation((key: string) => {
      if (key === 'incoming.wss_url') return '';
      return 'https://settings-fallback.com';
    });

    // First subscriber gets primary URL
    const sub1 = await createSubscriber(pool, settingsGet, 'solana', 'devnet');
    expect(sub1.opts.rpcUrl).toBe('https://primary.com');

    // Primary fails -> goes into cooldown
    pool.reportFailure('devnet', 'https://primary.com');

    // Second subscriber (recreated) gets backup URL
    const sub2 = await createSubscriber(pool, settingsGet, 'solana', 'devnet');
    expect(sub2.opts.rpcUrl).toBe('https://backup.com');
  });
});
