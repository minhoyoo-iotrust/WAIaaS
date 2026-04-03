/**
 * AdapterPool -- lazy-initialized, cached IChainAdapter instances keyed by chain:network.
 *
 * The daemon supports both Solana and EVM agents simultaneously. Instead of a single
 * hardcoded SolanaAdapter, AdapterPool resolves the correct adapter type based on
 * agent chain/network, reuses instances for the same network, and cleanly disconnects
 * all on shutdown.
 *
 * RpcPool integration (Phase 261): When an RpcPool is provided, AdapterPool uses it
 * to resolve RPC URLs via priority-based fallback. Config.toml single-URL settings
 * are seeded into RpcPool as highest-priority entries at daemon startup.
 *
 * @see Phase 84-01
 * @see Phase 261-01
 */

import type { IChainAdapter, ChainType, NetworkType, EvmNetworkType } from '@waiaas/core';
import type { RpcPool } from '@waiaas/core';
import type { RpcConfig } from './config/loader.js';

/**
 * Build the RPC config key for a given chain:network pair.
 * Maps:
 *   solana + 'solana-mainnet'     -> solana_mainnet
 *   solana + 'solana-devnet'      -> solana_devnet
 *   ethereum + 'ethereum-sepolia' -> evm_ethereum_sepolia
 *
 * Used by both resolveRpcUrl (config object lookup) and subscriberFactory
 * (SettingsService lookup with `rpc.` prefix) to ensure a single source of
 * truth for key construction.
 */
export function rpcConfigKey(chain: string, network: string): string {
  if (chain === 'solana') {
    // solana-mainnet -> solana_mainnet, solana-devnet -> solana_devnet
    // Strip 'solana-' prefix to get config.toml key (e.g., solana_mainnet)
    const suffix = network.startsWith('solana-') ? network.slice('solana-'.length) : network;
    return `solana_${suffix}`;
  }
  if (chain === 'ripple') {
    // xrpl-mainnet -> xrpl_mainnet, xrpl-testnet -> xrpl_testnet
    return network.replace(/-/g, '_');
  }
  return `evm_${network.replace(/-/g, '_')}`;
}

/**
 * Resolve RPC URL from config rpc section for a given chain:network.
 * Maps:
 *   solana + 'solana-devnet'      -> rpc.solana_devnet
 *   ethereum + 'ethereum-sepolia' -> rpc.evm_ethereum_sepolia
 */
export function resolveRpcUrl(
  rpcConfig: Record<string, string> | RpcConfig,
  chain: string,
  network: string,
): string {
  const key = rpcConfigKey(chain, network);
  return (rpcConfig as Record<string, string>)[key] || '';
}

/**
 * Reverse mapping: config.toml rpc section key -> BUILT_IN_RPC_DEFAULTS network name.
 *
 * Examples:
 *   solana_mainnet       -> solana-mainnet
 *   solana_devnet        -> solana-devnet
 *   evm_ethereum_sepolia -> ethereum-sepolia
 *   evm_base_mainnet     -> base-mainnet
 *   solana_ws_devnet     -> null (skip, WebSocket keys are not network endpoints)
 */
export function configKeyToNetwork(configKey: string): string | null {
  // Skip WebSocket keys (solana_ws_*)
  if (configKey.startsWith('solana_ws_')) return null;

  // Solana: solana_mainnet -> solana-mainnet, solana_devnet -> solana-devnet
  if (configKey.startsWith('solana_')) {
    return `solana-${configKey.slice('solana_'.length)}`;
  }

  // XRPL: xrpl_mainnet -> xrpl-mainnet, xrpl_testnet -> xrpl-testnet
  if (configKey.startsWith('xrpl_')) {
    return configKey.replace(/_/g, '-');
  }

  // EVM: evm_ethereum_sepolia -> ethereum-sepolia (strip evm_, replace _ with -)
  if (configKey.startsWith('evm_')) {
    return configKey.slice('evm_'.length).replace(/_/g, '-');
  }

  return null;
}

/**
 * Resolve RPC URL preferring RpcPool, with fallback to SettingsService-style getter.
 *
 * Used by IncomingTxMonitor's subscriberFactory to resolve RPC URLs from the shared
 * RpcPool (multi-endpoint rotation + cooldown) while preserving backward-compatible
 * fallback to SettingsService single-URL settings.
 *
 * @param rpcPool - RpcPool instance (may be null/undefined when pool is not configured)
 * @param settingsGet - SettingsService.get bound function for fallback (e.g. `sSvc.get.bind(sSvc)`)
 * @param chain - Chain type ('solana' | 'ethereum')
 * @param network - Network identifier (e.g. 'devnet', 'ethereum-sepolia')
 * @returns Resolved RPC URL
 *
 * @see Phase 261-03
 */
export function resolveRpcUrlFromPool(
  rpcPool: RpcPool | null | undefined,
  settingsGet: (key: string) => string,
  chain: string,
  network: string,
): string {
  if (rpcPool) {
    try {
      return rpcPool.getUrl(network);
    } catch {
      // Pool has no entry or all in cooldown -- fall back to settings
    }
  }
  return settingsGet(`rpc.${rpcConfigKey(chain, network)}`);
}

export class AdapterPool {
  private readonly _pool = new Map<string, IChainAdapter>();
  private readonly rpcPool?: RpcPool;

  constructor(rpcPool?: RpcPool) {
    this.rpcPool = rpcPool;
  }

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
   *
   * URL resolution priority:
   * 1. If RpcPool is available, use rpcPool.getUrl(network) (priority-based fallback)
   * 2. If RpcPool throws (no endpoints), fall back to provided rpcUrl
   * 3. If no RpcPool (legacy path), use provided rpcUrl directly
   */
  async resolve(chain: ChainType, network: NetworkType, rpcUrl?: string): Promise<IChainAdapter> {
    const key = this.cacheKey(chain, network);
    const existing = this._pool.get(key);
    if (existing) return existing;

    // Derive actual RPC URL from pool or fallback
    let actualRpcUrl = rpcUrl ?? '';
    if (this.rpcPool) {
      try {
        actualRpcUrl = this.rpcPool.getUrl(network as string);
      } catch {
        // Pool has no endpoints for this network -- fall back to provided rpcUrl
        actualRpcUrl = rpcUrl ?? '';
      }
    }

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
    } else if (chain === 'ripple') {
      // Phase 471: @waiaas/adapter-ripple package will provide RippleAdapter
      throw new Error(`Ripple adapter not yet implemented. Coming in Phase 471.`);
    } else {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    await adapter.connect(actualRpcUrl);
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

  /**
   * Report an RPC URL failure to the pool for cooldown tracking.
   * No-op if no RpcPool is configured.
   */
  reportRpcFailure(network: string, url: string): void {
    this.rpcPool?.reportFailure(network, url);
  }

  /**
   * Report an RPC URL success to the pool (resets failure count).
   * No-op if no RpcPool is configured.
   */
  reportRpcSuccess(network: string, url: string): void {
    this.rpcPool?.reportSuccess(network, url);
  }

  /** The underlying RpcPool instance, if configured. */
  get pool(): RpcPool | undefined {
    return this.rpcPool;
  }
}
