/**
 * ReputationCacheService - 3-tier reputation score cache for ERC-8004.
 *
 * Cache hierarchy:
 *   1. In-memory Map (fastest, lost on restart)
 *   2. DB reputation_cache table (persistent, Drizzle ORM)
 *   3. RPC on-chain read (slowest, source of truth)
 *
 * TTL-based invalidation: entries older than `actions.erc8004_reputation_cache_ttl_sec`
 * (default 300s) are considered stale and trigger a refresh from the next tier.
 *
 * RPC timeout: configurable via `actions.erc8004_reputation_rpc_timeout_ms` (default 3000ms).
 * On timeout or network error, returns null (caller should apply unrated treatment).
 *
 * @see Phase 320-01
 */

import { eq, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { createPublicClient, http } from 'viem';
import { REPUTATION_REGISTRY_ABI } from '@waiaas/actions';
import { reputationCache } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReputationScore {
  /** Normalized score 0-100 (summaryValue scaled by decimals, clamped). */
  score: number;
  /** Original int128 summaryValue as string (lossless). */
  rawScore: string;
  /** summaryValueDecimals from the contract. */
  decimals: number;
  /** Number of feedback entries. */
  count: number;
  /** Unix timestamp (seconds) when this entry was cached. */
  cachedAt: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_TTL_SEC = 300;
const DEFAULT_RPC_TIMEOUT_MS = 3000;
const DEFAULT_REGISTRY_ADDRESS = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';
const DEFAULT_RPC_URL = 'https://eth.llamarpc.com';

// ---------------------------------------------------------------------------
// ReputationCacheService
// ---------------------------------------------------------------------------

export class ReputationCacheService {
  private readonly cache = new Map<string, ReputationScore>();
  private readonly settingsService: SettingsService | null;

  constructor(
    private readonly db: BetterSQLite3Database<typeof schema>,
    settingsService?: SettingsService,
  ) {
    this.settingsService = settingsService ?? null;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Get reputation score for an agent, checking 3 tiers in order:
   * in-memory -> DB -> RPC.
   *
   * @returns ReputationScore or null if unavailable (RPC failure, timeout, etc.)
   */
  async getReputation(agentId: string, tag1 = '', tag2 = ''): Promise<ReputationScore | null> {
    const registryAddress = this.getRegistryAddress();
    const key = this.cacheKey(agentId, registryAddress, tag1, tag2);

    // Tier 1: In-memory Map
    const memEntry = this.cache.get(key);
    if (memEntry && this.isFresh(memEntry)) {
      return memEntry;
    }

    // Tier 2: DB reputation_cache
    const dbEntry = await this.readFromDb(agentId, registryAddress, tag1, tag2);
    if (dbEntry && this.isFresh(dbEntry)) {
      // Promote to in-memory
      this.cache.set(key, dbEntry);
      return dbEntry;
    }

    // Tier 3: RPC on-chain read
    try {
      const rpcResult = await this.readFromRpc(agentId, registryAddress, tag1, tag2);
      if (rpcResult) {
        // Store in both tiers
        this.cache.set(key, rpcResult);
        await this.writeToDb(agentId, registryAddress, tag1, tag2, rpcResult);
        return rpcResult;
      }
      return null;
    } catch {
      // RPC failure (timeout, network error) -> return null
      return null;
    }
  }

  /**
   * Invalidate all cache entries for a specific agent.
   * Removes from both in-memory Map and DB.
   */
  invalidate(agentId: string): void {
    // Remove from in-memory Map (all keys starting with agentId:)
    const prefix = `${agentId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }

    // Remove from DB
    this.db
      .delete(reputationCache)
      .where(eq(reputationCache.agentId, agentId))
      .run();
  }

  /**
   * Clear entire in-memory cache.
   * DB is preserved as persistent fallback.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private cacheKey(agentId: string, registryAddress: string, tag1: string, tag2: string): string {
    return `${agentId}:${registryAddress}:${tag1}:${tag2}`;
  }

  private isFresh(entry: ReputationScore): boolean {
    const ttl = this.getTtl();
    const now = Math.floor(Date.now() / 1000);
    return entry.cachedAt + ttl > now;
  }

  private getTtl(): number {
    const val = this.settingsService?.get('actions.erc8004_reputation_cache_ttl_sec');
    return val ? parseInt(val, 10) || DEFAULT_TTL_SEC : DEFAULT_TTL_SEC;
  }

  private getRpcTimeout(): number {
    const val = this.settingsService?.get('actions.erc8004_reputation_rpc_timeout_ms');
    return val ? parseInt(val, 10) || DEFAULT_RPC_TIMEOUT_MS : DEFAULT_RPC_TIMEOUT_MS;
  }

  private getRegistryAddress(): string {
    return (
      this.settingsService?.get('actions.erc8004_reputation_registry_address') ||
      DEFAULT_REGISTRY_ADDRESS
    );
  }

  private getRpcUrl(): string {
    return (
      this.settingsService?.get('rpc.evm_ethereum_mainnet') || DEFAULT_RPC_URL
    );
  }

  /**
   * Normalize int128 score to 0-100 range.
   * - If decimals=0: clamp raw value to [0,100]
   * - If decimals>0: divide by 10^decimals, then clamp to [0,100]
   */
  private normalizeScore(rawScore: bigint, decimals: number): number {
    let value: number;
    if (decimals > 0) {
      const divisor = 10 ** decimals;
      value = Number(rawScore) / divisor;
    } else {
      value = Number(rawScore);
    }
    return Math.max(0, Math.min(100, value));
  }

  // -------------------------------------------------------------------------
  // DB operations
  // -------------------------------------------------------------------------

  private async readFromDb(
    agentId: string,
    registryAddress: string,
    tag1: string,
    tag2: string,
  ): Promise<ReputationScore | null> {
    const row = await this.db
      .select()
      .from(reputationCache)
      .where(
        and(
          eq(reputationCache.agentId, agentId),
          eq(reputationCache.registryAddress, registryAddress),
          eq(reputationCache.tag1, tag1),
          eq(reputationCache.tag2, tag2),
        ),
      )
      .get();

    if (!row) return null;

    const cachedAtSeconds =
      row.cachedAt instanceof Date
        ? Math.floor(row.cachedAt.getTime() / 1000)
        : (row.cachedAt as number);

    return {
      score: row.score,
      rawScore: String(row.score),
      decimals: row.scoreDecimals,
      count: row.feedbackCount,
      cachedAt: cachedAtSeconds,
    };
  }

  private async writeToDb(
    agentId: string,
    registryAddress: string,
    tag1: string,
    tag2: string,
    entry: ReputationScore,
  ): Promise<void> {
    const cachedAt = new Date(entry.cachedAt * 1000);

    // UPSERT: INSERT OR REPLACE with composite PK
    await this.db
      .insert(reputationCache)
      .values({
        agentId,
        registryAddress,
        tag1,
        tag2,
        score: entry.score,
        scoreDecimals: entry.decimals,
        feedbackCount: entry.count,
        cachedAt,
      })
      .onConflictDoUpdate({
        target: [reputationCache.agentId, reputationCache.registryAddress, reputationCache.tag1, reputationCache.tag2],
        set: {
          score: entry.score,
          scoreDecimals: entry.decimals,
          feedbackCount: entry.count,
          cachedAt,
        },
      })
      .run();
  }

  // -------------------------------------------------------------------------
  // RPC operations
  // -------------------------------------------------------------------------

  private async readFromRpc(
    agentId: string,
    registryAddress: string,
    tag1: string,
    tag2: string,
  ): Promise<ReputationScore | null> {
    const rpcUrl = this.getRpcUrl();
    const rpcTimeout = this.getRpcTimeout();

    const client = createPublicClient({
      transport: http(rpcUrl, { timeout: rpcTimeout }),
    });

    const result = await client.readContract({
      address: registryAddress as `0x${string}`,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getSummary',
      args: [BigInt(agentId), [], tag1, tag2],
    });

    const [count, summaryValue, summaryValueDecimals] = result as [bigint, bigint, number];

    const score = this.normalizeScore(summaryValue, summaryValueDecimals);
    const now = Math.floor(Date.now() / 1000);

    return {
      score,
      rawScore: String(summaryValue),
      decimals: summaryValueDecimals,
      count: Number(count),
      cachedAt: now,
    };
  }
}
