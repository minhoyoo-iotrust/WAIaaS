/**
 * TDD tests for ReputationCacheService.
 *
 * Tests 3-tier cache (in-memory -> DB -> RPC) for ERC-8004 reputation scores.
 *
 * Uses in-memory SQLite + Drizzle (same pattern as database-policy-engine.test.ts).
 * Mocks viem createPublicClient for RPC scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { reputationCache } from '../infrastructure/database/schema.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import { ReputationCacheService, type ReputationScore } from '../services/erc8004/reputation-cache-service.js';

// ---------------------------------------------------------------------------
// Mock viem
// ---------------------------------------------------------------------------

const mockReadContract = vi.fn();

vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({
    readContract: mockReadContract,
  })),
  http: vi.fn(() => 'mock-transport'),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let settingsService: SettingsService;
let service: ReputationCacheService;

const DEFAULT_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';
const TEST_AGENT_ID = '12345';
const TEST_TAG1 = 'reliability';
const TEST_TAG2 = 'speed';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function seedDbCache(
  agentId: string,
  score: number,
  opts?: { tag1?: string; tag2?: string; cachedAt?: number; decimals?: number; count?: number },
): Promise<void> {
  const cachedAt = new Date((opts?.cachedAt ?? nowSeconds()) * 1000);
  await conn.db.insert(reputationCache).values({
    agentId,
    registryAddress: DEFAULT_REGISTRY,
    tag1: opts?.tag1 ?? '',
    tag2: opts?.tag2 ?? '',
    score,
    scoreDecimals: opts?.decimals ?? 0,
    feedbackCount: opts?.count ?? 5,
    cachedAt,
  });
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);

  const config = DaemonConfigSchema.parse({});
  settingsService = new SettingsService({ db: conn.db, config, masterPassword: 'test-master-password' });

  service = new ReputationCacheService(conn.db, settingsService);
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReputationCacheService', () => {
  describe('getReputation - 3-tier cache', () => {
    it('a. returns score from in-memory cache without DB or RPC call', async () => {
      // Prime the cache with an initial RPC call
      mockReadContract.mockResolvedValueOnce([5n, 85n, 0]);
      await service.getReputation(TEST_AGENT_ID);
      mockReadContract.mockClear();

      // Second call should come from memory
      const result = await service.getReputation(TEST_AGENT_ID);
      expect(result).not.toBeNull();
      expect(result!.score).toBe(85);
      expect(mockReadContract).not.toHaveBeenCalled();
    });

    it('b. falls back to DB when in-memory cache is stale (TTL expired)', async () => {
      // Seed DB with fresh data
      await seedDbCache(TEST_AGENT_ID, 72, { cachedAt: nowSeconds() });

      // Create a new service instance (empty in-memory cache)
      const freshService = new ReputationCacheService(conn.db, settingsService);
      const result = await freshService.getReputation(TEST_AGENT_ID);

      expect(result).not.toBeNull();
      expect(result!.score).toBe(72);
      expect(mockReadContract).not.toHaveBeenCalled();
    });

    it('c. DB cache hit promotes entry to in-memory Map', async () => {
      // Seed DB
      await seedDbCache(TEST_AGENT_ID, 60, { cachedAt: nowSeconds() });

      const freshService = new ReputationCacheService(conn.db, settingsService);

      // First call: DB hit
      await freshService.getReputation(TEST_AGENT_ID);
      expect(mockReadContract).not.toHaveBeenCalled();

      // Second call: should be in memory (no DB read needed)
      // We can't directly test Map access, but we verify no RPC is called
      const result = await freshService.getReputation(TEST_AGENT_ID);
      expect(result).not.toBeNull();
      expect(result!.score).toBe(60);
      expect(mockReadContract).not.toHaveBeenCalled();
    });

    it('d. DB cache miss triggers RPC call', async () => {
      // No DB seed, no memory -> should trigger RPC
      mockReadContract.mockResolvedValueOnce([10n, 90n, 0]);

      const result = await service.getReputation(TEST_AGENT_ID);
      expect(result).not.toBeNull();
      expect(result!.score).toBe(90);
      expect(result!.count).toBe(10);
      expect(mockReadContract).toHaveBeenCalledOnce();
    });

    it('e. RPC success stores in both Map and DB', async () => {
      mockReadContract.mockResolvedValueOnce([3n, 75n, 0]);

      const result = await service.getReputation(TEST_AGENT_ID);
      expect(result).not.toBeNull();
      expect(result!.score).toBe(75);

      // Verify DB persistence
      const dbRows = await conn.db.select().from(reputationCache).all();
      expect(dbRows).toHaveLength(1);
      expect(dbRows[0]!.score).toBe(75);
      expect(dbRows[0]!.agentId).toBe(TEST_AGENT_ID);
    });

    it('f. RPC timeout returns null (no crash)', async () => {
      mockReadContract.mockRejectedValueOnce(new Error('The request took too long'));

      const result = await service.getReputation(TEST_AGENT_ID);
      expect(result).toBeNull();
    });

    it('g. RPC network error returns null', async () => {
      mockReadContract.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await service.getReputation(TEST_AGENT_ID);
      expect(result).toBeNull();
    });
  });

  describe('invalidate', () => {
    it('h. invalidate(agentId) clears both Map and DB entries', async () => {
      // Populate via RPC
      mockReadContract.mockResolvedValueOnce([5n, 80n, 0]);
      await service.getReputation(TEST_AGENT_ID);

      // Verify in DB
      let dbRows = await conn.db.select().from(reputationCache).all();
      expect(dbRows).toHaveLength(1);

      // Invalidate
      service.invalidate(TEST_AGENT_ID);

      // DB should be clear
      dbRows = await conn.db.select().from(reputationCache).all();
      expect(dbRows).toHaveLength(0);

      // Next call should go to RPC (not memory or DB)
      mockReadContract.mockResolvedValueOnce([6n, 82n, 0]);
      const result = await service.getReputation(TEST_AGENT_ID);
      expect(result).not.toBeNull();
      expect(result!.score).toBe(82);
      expect(mockReadContract).toHaveBeenCalledTimes(2);
    });
  });

  describe('tag combinations', () => {
    it('i. different tag1/tag2 combinations produce separate cache entries', async () => {
      // First call with default tags
      mockReadContract.mockResolvedValueOnce([5n, 70n, 0]);
      const r1 = await service.getReputation(TEST_AGENT_ID, '', '');

      // Second call with specific tags
      mockReadContract.mockResolvedValueOnce([3n, 95n, 0]);
      const r2 = await service.getReputation(TEST_AGENT_ID, TEST_TAG1, TEST_TAG2);

      expect(r1!.score).toBe(70);
      expect(r2!.score).toBe(95);
      expect(mockReadContract).toHaveBeenCalledTimes(2);

      // Verify two separate DB entries
      const dbRows = await conn.db.select().from(reputationCache).all();
      expect(dbRows).toHaveLength(2);
    });
  });

  describe('normalizeScore', () => {
    it('j. correctly scales int128 with decimals', async () => {
      // Score 7500 with 2 decimals -> 75.00
      mockReadContract.mockResolvedValueOnce([10n, 7500n, 2]);

      const result = await service.getReputation(TEST_AGENT_ID);
      expect(result).not.toBeNull();
      expect(result!.score).toBe(75);
      expect(result!.rawScore).toBe('7500');
      expect(result!.decimals).toBe(2);
    });

    it('clamps negative scores to 0', async () => {
      // Negative score (int128 supports negative)
      mockReadContract.mockResolvedValueOnce([2n, -50n, 0]);

      const result = await service.getReputation(TEST_AGENT_ID);
      expect(result).not.toBeNull();
      expect(result!.score).toBe(0);
    });

    it('clamps scores above 100 to 100', async () => {
      mockReadContract.mockResolvedValueOnce([2n, 150n, 0]);

      const result = await service.getReputation(TEST_AGENT_ID);
      expect(result).not.toBeNull();
      expect(result!.score).toBe(100);
    });
  });

  describe('stale DB entry triggers RPC refresh', () => {
    it('returns fresh RPC data when DB entry TTL is expired', async () => {
      // Seed DB with stale data (TTL=300s, seeded 600s ago)
      await seedDbCache(TEST_AGENT_ID, 50, { cachedAt: nowSeconds() - 600 });

      const freshService = new ReputationCacheService(conn.db, settingsService);
      mockReadContract.mockResolvedValueOnce([8n, 88n, 0]);

      const result = await freshService.getReputation(TEST_AGENT_ID);
      expect(result).not.toBeNull();
      expect(result!.score).toBe(88);
      expect(mockReadContract).toHaveBeenCalledOnce();
    });
  });

  describe('invalidateAll', () => {
    it('clears in-memory cache but preserves DB', async () => {
      // Populate
      mockReadContract.mockResolvedValueOnce([5n, 80n, 0]);
      await service.getReputation(TEST_AGENT_ID);

      service.invalidateAll();

      // DB should still have data
      const dbRows = await conn.db.select().from(reputationCache).all();
      expect(dbRows).toHaveLength(1);

      // Next call should hit DB (not RPC) since DB is still fresh
      const result = await service.getReputation(TEST_AGENT_ID);
      expect(result).not.toBeNull();
      expect(result!.score).toBe(80);
      expect(mockReadContract).toHaveBeenCalledTimes(1); // Only the initial call
    });
  });
});
