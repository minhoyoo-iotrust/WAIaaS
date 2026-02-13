/**
 * AdapterPool -- lazy-initialized, cached IChainAdapter instances keyed by chain:network.
 *
 * The daemon supports both Solana and EVM agents simultaneously. Instead of a single
 * hardcoded SolanaAdapter, AdapterPool resolves the correct adapter type based on
 * agent chain/network, reuses instances for the same network, and cleanly disconnects
 * all on shutdown.
 *
 * @see Phase 84-01
 */

import type { IChainAdapter, ChainType, NetworkType, EvmNetworkType } from '@waiaas/core';

/**
 * Resolve RPC URL from config rpc section for a given chain:network.
 * Maps:
 *   solana + 'devnet'          -> rpc.solana_devnet
 *   ethereum + 'ethereum-sepolia' -> rpc.evm_ethereum_sepolia
 */
export function resolveRpcUrl(
  rpcConfig: Record<string, string>,
  chain: string,
  network: string,
): string {
  if (chain === 'solana') {
    const key = `solana_${network}`;
    return rpcConfig[key] || '';
  } else if (chain === 'ethereum') {
    const key = `evm_${network.replace(/-/g, '_')}`;
    return rpcConfig[key] || '';
  }
  return '';
}

export class AdapterPool {
  private readonly _pool = new Map<string, IChainAdapter>();

  /**
   * Build cache key from chain:network.
   */
  private cacheKey(chain: ChainType, network: NetworkType): string {
    return `${chain}:${network}`;
  }

  /**
   * Resolve (lazy-create + cache) an adapter for the given chain:network.
   * - Solana: SolanaAdapter(network) -> connect(rpcUrl)
   * - Ethereum: EvmAdapter(network, viemChain, nativeSymbol, nativeName) -> connect(rpcUrl)
   * Same chain:network returns the cached instance.
   */
  async resolve(chain: ChainType, network: NetworkType, rpcUrl: string): Promise<IChainAdapter> {
    const key = this.cacheKey(chain, network);
    const existing = this._pool.get(key);
    if (existing) return existing;

    let adapter: IChainAdapter;

    if (chain === 'solana') {
      const { SolanaAdapter } = await import('@waiaas/adapter-solana');
      adapter = new SolanaAdapter(network);
    } else if (chain === 'ethereum') {
      const { EvmAdapter, EVM_CHAIN_MAP } = await import('@waiaas/adapter-evm');
      const entry = EVM_CHAIN_MAP[network as EvmNetworkType];
      if (!entry) {
        throw new Error(`No EVM chain config for network '${network}'`);
      }
      adapter = new EvmAdapter(network, entry.viemChain, entry.nativeSymbol, entry.nativeName);
    } else {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    await adapter.connect(rpcUrl);
    this._pool.set(key, adapter);
    return adapter;
  }

  /**
   * Disconnect all cached adapters and clear the pool.
   * Individual disconnect errors are caught and logged (fail-soft).
   */
  async disconnectAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const adapter of this._pool.values()) {
      promises.push(
        adapter.disconnect().catch((err) => {
          console.warn('AdapterPool disconnect warning:', err);
        }),
      );
    }
    await Promise.all(promises);
    this._pool.clear();
  }

  /**
   * Evict a cached adapter for a given chain:network.
   * Disconnects the existing adapter and removes it from pool.
   * Next resolve() call will create a fresh adapter with the new RPC URL.
   */
  async evict(chain: ChainType, network: NetworkType): Promise<void> {
    const key = this.cacheKey(chain, network);
    const existing = this._pool.get(key);
    if (existing) {
      try {
        await existing.disconnect();
      } catch (err) {
        console.warn(`AdapterPool evict disconnect warning (${key}):`, err);
      }
      this._pool.delete(key);
    }
  }

  /**
   * Evict all cached adapters. Used when multiple RPC URLs change at once.
   */
  async evictAll(): Promise<void> {
    await this.disconnectAll(); // Existing method already disconnects + clears
  }

  /** Number of cached adapters. */
  get size(): number {
    return this._pool.size;
  }
}
