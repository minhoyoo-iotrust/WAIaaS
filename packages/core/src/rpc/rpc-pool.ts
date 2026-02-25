/**
 * RpcPool: Priority-based RPC URL rotation with cooldown.
 *
 * Manages multiple RPC endpoint URLs per network. When the primary
 * endpoint fails, automatically falls back to the next available URL.
 * Failed endpoints enter exponential cooldown before recovery.
 *
 * @module @waiaas/core/rpc
 */

import { BUILT_IN_RPC_DEFAULTS } from './built-in-defaults.js';

// ─── Types ─────────────────────────────────────────────────────

/** Configuration options for RpcPool. */
export interface RpcPoolOptions {
  /** Base cooldown duration in ms after first failure. Default: 60_000 (60s). */
  baseCooldownMs?: number;
  /** Maximum cooldown duration in ms. Default: 300_000 (5 min). */
  maxCooldownMs?: number;
  /** Clock function for testability. Default: Date.now. */
  nowFn?: () => number;
}

/** Public status of a single RPC endpoint. */
export interface RpcEndpointStatus {
  url: string;
  status: 'available' | 'cooldown';
  failureCount: number;
  cooldownRemainingMs: number;
}

/** Entry for bulk registration. */
export interface RpcRegistryEntry {
  network: string;
  urls: string[];
}

// ─── Internal State ────────────────────────────────────────────

interface RpcEndpointState {
  url: string;
  failureCount: number;
  cooldownUntil: number; // epoch ms; 0 = no cooldown
}

// ─── Error ─────────────────────────────────────────────────────

/**
 * Thrown when all RPC endpoints for a network are in cooldown.
 * Extends Error (not ChainError) -- this is infrastructure-level.
 */
export class AllRpcFailedError extends Error {
  readonly network: string;
  readonly urls: string[];

  constructor(network: string, urls: string[]) {
    super(
      `All RPC endpoints failed for network '${network}': ${urls.join(', ')}`,
    );
    this.name = 'AllRpcFailedError';
    this.network = network;
    this.urls = urls;
  }
}

// ─── Pool ──────────────────────────────────────────────────────

export class RpcPool {
  private readonly baseCooldownMs: number;
  private readonly maxCooldownMs: number;
  private readonly nowFn: () => number;
  private readonly endpoints: Map<string, RpcEndpointState[]> = new Map();

  constructor(options?: RpcPoolOptions) {
    this.baseCooldownMs = options?.baseCooldownMs ?? 60_000;
    this.maxCooldownMs = options?.maxCooldownMs ?? 300_000;
    this.nowFn = options?.nowFn ?? Date.now;
  }

  // ─── Factory ────────────────────────────────────────────────

  /**
   * Create an RpcPool pre-loaded with built-in default RPC URLs
   * for all 13 supported networks (6 mainnet + 7 testnet).
   */
  static createWithDefaults(options?: RpcPoolOptions): RpcPool {
    const pool = new RpcPool(options);
    for (const [network, urls] of Object.entries(BUILT_IN_RPC_DEFAULTS)) {
      pool.register(network, [...urls]);
    }
    return pool;
  }

  // ─── Registration ──────────────────────────────────────────

  /**
   * Register ordered URL list for a network (index 0 = highest priority).
   * Duplicate URLs for the same network are silently ignored.
   */
  register(network: string, urls: string[]): void {
    const existing = this.endpoints.get(network);
    const existingUrls = new Set(existing?.map((e) => e.url));

    const deduped: RpcEndpointState[] = existing ? [...existing] : [];
    for (const url of urls) {
      if (!existingUrls.has(url)) {
        existingUrls.add(url);
        deduped.push({ url, failureCount: 0, cooldownUntil: 0 });
      }
    }

    this.endpoints.set(network, deduped);
  }

  /**
   * Bulk registration for multiple networks.
   */
  registerAll(entries: RpcRegistryEntry[]): void {
    for (const entry of entries) {
      this.register(entry.network, entry.urls);
    }
  }

  // ─── URL Resolution ────────────────────────────────────────

  /**
   * Returns highest-priority non-cooldown URL for the network.
   * @throws Error if network has no registered URLs.
   * @throws AllRpcFailedError if all URLs are in cooldown.
   */
  getUrl(network: string): string {
    const entries = this.endpoints.get(network);
    if (!entries) {
      throw new Error(`No RPC endpoints registered for network '${network}'`);
    }

    const now = this.nowFn();
    for (const entry of entries) {
      if (now >= entry.cooldownUntil) {
        return entry.url;
      }
    }

    throw new AllRpcFailedError(
      network,
      entries.map((e) => e.url),
    );
  }

  // ─── Failure Reporting ─────────────────────────────────────

  /**
   * Mark a URL as failed. Applies exponential cooldown:
   * cooldown = min(baseCooldownMs * 2^(failureCount-1), maxCooldownMs)
   */
  reportFailure(network: string, url: string): void {
    const entry = this.findEntry(network, url);
    if (!entry) return;

    entry.failureCount += 1;
    const cooldown = Math.min(
      this.baseCooldownMs * Math.pow(2, entry.failureCount - 1),
      this.maxCooldownMs,
    );
    entry.cooldownUntil = this.nowFn() + cooldown;
  }

  /**
   * Report successful use of a URL. Resets failure count to 0.
   */
  reportSuccess(network: string, url: string): void {
    const entry = this.findEntry(network, url);
    if (!entry) return;

    entry.failureCount = 0;
    entry.cooldownUntil = 0;
  }

  // ─── Reset ─────────────────────────────────────────────────

  /**
   * Atomically replace all endpoints for a network with a new URL list.
   * Unlike register() which appends, this removes existing URLs entirely.
   * New URLs are initialized with failureCount: 0, cooldownUntil: 0.
   * An empty array removes the network from the pool.
   */
  replaceNetwork(network: string, urls: string[]): void {
    if (urls.length === 0) {
      this.endpoints.delete(network);
      return;
    }

    const entries: RpcEndpointState[] = urls.map((url) => ({
      url,
      failureCount: 0,
      cooldownUntil: 0,
    }));
    this.endpoints.set(network, entries);
  }

  /** Clear all cooldown state for a network. */
  reset(network: string): void {
    const entries = this.endpoints.get(network);
    if (!entries) return;
    for (const entry of entries) {
      entry.failureCount = 0;
      entry.cooldownUntil = 0;
    }
  }

  /** Clear all state for all networks. */
  resetAll(): void {
    for (const network of this.endpoints.keys()) {
      this.reset(network);
    }
  }

  // ─── Inspection ────────────────────────────────────────────

  /**
   * Returns status for each URL in a network.
   */
  getStatus(network: string): RpcEndpointStatus[] {
    const entries = this.endpoints.get(network);
    if (!entries) return [];

    const now = this.nowFn();
    return entries.map((entry) => {
      const remaining = Math.max(0, entry.cooldownUntil - now);
      return {
        url: entry.url,
        status: (remaining > 0 ? 'cooldown' : 'available') as
          | 'available'
          | 'cooldown',
        failureCount: entry.failureCount,
        cooldownRemainingMs: remaining,
      };
    });
  }

  /** Returns list of registered network names. */
  getNetworks(): string[] {
    return [...this.endpoints.keys()];
  }

  /** Check if a network has registered endpoints. */
  hasNetwork(network: string): boolean {
    return this.endpoints.has(network);
  }

  // ─── Private ───────────────────────────────────────────────

  private findEntry(
    network: string,
    url: string,
  ): RpcEndpointState | undefined {
    const entries = this.endpoints.get(network);
    return entries?.find((e) => e.url === url);
  }
}
